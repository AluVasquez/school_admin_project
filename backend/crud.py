from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, UniqueConstraint, func as sql_func, extract
from sqlalchemy.exc import IntegrityError
from typing import Optional, List, Dict, Any, Literal, Tuple
from datetime import date, timedelta, datetime
from dateutil.relativedelta import relativedelta
import pytz
import json
import calendar
from .app_config import settings

from . import models, schemas
from .models import Currency, Invoice, InvoiceItem, InvoiceStatus, CreditNote, CreditNoteItem, AppliedChargeStatus, EmployeePayment, Payslip
from .security import get_password_hash



class BusinessLogicError(Exception):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)
        
class GradeLevelInUseError(BusinessLogicError):
    pass

class ChargeConceptAlreadyInactiveError(BusinessLogicError):
    pass

class ChargeConceptInUseError(BusinessLogicError):
    pass

class AppliedChargeUpdateNotAllowedError(BusinessLogicError):
    pass



def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email).first()

def get_user(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_users(db: Session, skip: int = 0, limit: int = 100) -> List[models.User]:
    return db.query(models.User).order_by(models.User.id).offset(skip).limit(limit).all()

def get_users_count(db: Session) -> int: # Para la paginación en el router
    return db.query(models.User).count()



def create_user(db: Session, user: schemas.UserCreate, is_superuser_flag: bool = False) -> models.User:
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        full_name=user.full_name,
        hashed_password=hashed_password,
        is_superuser=is_superuser_flag 
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user_details(
    db: Session, 
    user_to_update_id: int, 
    user_in: schemas.UserUpdate, 
    current_performing_user: models.User # El admin que realiza la acción
) -> Optional[models.User]:
    db_user_to_update = get_user(db, user_id=user_to_update_id) # get_user ya existe
    if not db_user_to_update:
        return None

    update_data = user_in.model_dump(exclude_unset=True)

    # Lógica de negocio crítica:
    # 1. Un usuario no puede desactivarse a sí mismo.
    if 'is_active' in update_data and not update_data['is_active'] and db_user_to_update.id == current_performing_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puede desactivar su propia cuenta."
        )

    # 2. Un superusuario no puede quitarse a sí mismo el rol de superusuario si es el único que queda.
    if 'is_superuser' in update_data and not update_data['is_superuser'] and db_user_to_update.is_superuser:
        if db_user_to_update.id == current_performing_user.id: # Intentando degradarse a sí mismo
            # Contar cuántos otros superusuarios hay
            other_superusers_count = db.query(models.User)\
                .filter(models.User.is_superuser == True, models.User.id != db_user_to_update.id)\
                .count()
            if other_superusers_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No puede remover el rol de superusuario al último superusuario activo del sistema."
                )

    # 3. (Opcional) Impedir que el superusuario original (definido en settings) sea degradado o desactivado por otro.
    # if db_user_to_update.email == settings.FIRST_SUPERUSER_EMAIL and db_user_to_update.id != current_performing_user.id:
    #     if ('is_active' in update_data and not update_data['is_active']) or \
    #        ('is_superuser' in update_data and not update_data['is_superuser']):
    #         raise HTTPException(
    #             status_code=status.HTTP_403_FORBIDDEN,
    #             detail="El superusuario principal definido en la configuración no puede ser modificado de esta manera por otros."
    #         )

    for key, value in update_data.items():
        setattr(db_user_to_update, key, value)

    db.add(db_user_to_update)
    db.commit()
    db.refresh(db_user_to_update)
    return db_user_to_update

def get_representative(db: Session, representative_id: int) -> Optional[models.Representative]:
    return db.query(models.Representative).filter(models.Representative.id == representative_id).first()

def get_representative_by_cedula(db: Session, cedula: str) -> Optional[models.Representative]:
    return db.query(models.Representative).filter(models.Representative.cedula == cedula).first()

def get_representative_by_email(db: Session, email: str) -> Optional[models.Representative]:
    return db.query(models.Representative).filter(models.Representative.email == email).first()

def get_current_venezuelan_date_for_crud() -> date:
    """Obtiene la fecha actual en la zona horaria de Venezuela (VET, UTC-4)."""
    vet_tz = pytz.timezone('America/Caracas')
    return datetime.now(vet_tz).date()

def _calculate_representative_simple_balance(
    db: Session,
    representative_id: int,
    current_usd_to_ves_rate: Optional[float]
) -> Tuple[float, float]:
    """
    Calcula un balance de deuda simplificado para un representante.
    Devuelve (deuda_total_ves_hoy, deuda_total_original_usd).
    Un valor positivo significa que el representante debe a la escuela.
    """
    representative_applied_charges = (
        db.query(models.AppliedCharge)
        .join(models.Student, models.AppliedCharge.student_id == models.Student.id)
        .filter(models.Student.representative_id == representative_id)
        .filter(models.AppliedCharge.status.in_([
            models.AppliedChargeStatus.PENDING,
            models.AppliedChargeStatus.PARTIALLY_PAID,
            models.AppliedChargeStatus.OVERDUE
        ]))
        .all()
    )

    total_pending_debt_ves_today = 0.0
    total_pending_debt_original_usd = 0.0

    if not representative_applied_charges:
        return 0.0, 0.0

    for charge in representative_applied_charges:
        pending_debt_original_curr = round(charge.amount_due_original_currency - charge.amount_paid_original_currency_equivalent, 2)

        if pending_debt_original_curr <= 0:
            continue

        if charge.is_indexed and charge.original_concept_currency == models.Currency.USD:
            total_pending_debt_original_usd += pending_debt_original_curr
            if current_usd_to_ves_rate and current_usd_to_ves_rate > 0:
                total_pending_debt_ves_today += pending_debt_original_curr * current_usd_to_ves_rate
            # Nota: Si no hay tasa USD, la deuda en USD no se suma al total VES de hoy.
            # Esto significa que el total_pending_debt_ves_today podría subestimar la deuda real si la tasa falta.
            
        elif not charge.is_indexed and charge.original_concept_currency == models.Currency.VES:
            total_pending_debt_ves_today += pending_debt_original_curr
        
        # Considerar otras monedas indexadas si es necesario (ej. EUR)

    return round(total_pending_debt_ves_today, 2), round(total_pending_debt_original_usd, 2)


def get_representatives(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
    financial_status_filter: Optional[str] = None # NUEVO PARÁMETRO (ej: "has_debt", "solvent", "has_credit")
) -> Dict[str, any]:
    """
    Obtiene una lista de representantes, permitiendo filtrar por estado financiero,
    e incluye su saldo de deuda actual.
    """
    query = db.query(models.Representative)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                models.Representative.first_name.ilike(search_term),
                models.Representative.last_name.ilike(search_term),
                models.Representative.cedula.ilike(search_term),
                models.Representative.email.ilike(search_term)
            )
        )
    
    # Aplicar ordenamiento ANTES de calcular saldos para toda la lista filtrada por búsqueda
    if sort_by:
        column_to_sort = getattr(models.Representative, sort_by, None)
        if column_to_sort:
            if sort_order.lower() == "desc":
                query = query.order_by(column_to_sort.desc())
            else:
                query = query.order_by(column_to_sort.asc())
    else:
        query = query.order_by(models.Representative.created_at.desc())

    # Obtener TODOS los representantes que coinciden con la búsqueda (sin paginación de BD aún)
    all_matching_representative_models = query.all()

    # Obtener la tasa de cambio USD actual una sola vez
    today_in_venezuela = get_current_venezuelan_date_for_crud()
    latest_usd_rate_model = get_latest_exchange_rate(db, from_currency=models.Currency.USD, on_date=today_in_venezuela)
    current_usd_to_ves_rate = latest_usd_rate_model.rate if latest_usd_rate_model and latest_usd_rate_model.rate else None

    if current_usd_to_ves_rate is None:
        print(f"ADVERTENCIA (crud.get_representatives): No se encontró tasa USD->VES para la fecha {today_in_venezuela}.")

    # Procesar representantes: calcular saldos y convertir a schemas
    representatives_with_balances: List[schemas.RepresentativeResponse] = []
    for rep_model in all_matching_representative_models:
        balance_ves, balance_usd_orig = _calculate_representative_simple_balance(
            db, rep_model.id, current_usd_to_ves_rate
        )
        
        # Crear instancia del schema Pydantic con los datos y saldos
        # (Asegúrate que schemas.RepresentativeResponse tenga los campos de balance)
        try:
            rep_schema_instance = schemas.RepresentativeResponse(
                id=rep_model.id,
                first_name=rep_model.first_name,
                last_name=rep_model.last_name,
                cedula=rep_model.cedula,
                phone_main=rep_model.phone_main,
                phone_secondary=rep_model.phone_secondary,
                email=rep_model.email,
                address=rep_model.address,
                sex=rep_model.sex,
                profession=rep_model.profession,
                workplace=rep_model.workplace,
                photo_url=rep_model.photo_url,
                created_at=rep_model.created_at,
                updated_at=rep_model.updated_at,
                # rif=rep_model.rif, # Si existe
                current_balance_due_ves_today=balance_ves,
                current_balance_due_usd=balance_usd_orig # Deuda que originalmente era en USD
            )
            representatives_with_balances.append(rep_schema_instance)
        except Exception as e_schema_conv:
            print(f"Error al convertir Representative model a schema para ID {rep_model.id}: {e_schema_conv}")


    # --- Aplicar filtro de estado financiero (en Python, sobre la lista ya procesada) ---
    final_filtered_items: List[schemas.RepresentativeResponse] = []
    if financial_status_filter:
        for rep_item in representatives_with_balances:
            balance = rep_item.current_balance_due_ves_today if rep_item.current_balance_due_ves_today is not None else 0.0
            if financial_status_filter == "has_debt" and balance > 0.001:
                final_filtered_items.append(rep_item)
            elif financial_status_filter == "solvent" and (balance <= 0.001 and balance >= -0.001): # Cerca de cero
                final_filtered_items.append(rep_item)
            elif financial_status_filter == "has_credit" and balance < -0.001:
                final_filtered_items.append(rep_item)
    else:
        final_filtered_items = representatives_with_balances
    # --- FIN Filtro financiero ---

    total = len(final_filtered_items) # El total ahora es sobre la lista completamente filtrada

    # Aplicar paginación manualmente a la lista filtrada en Python
    paginated_items = final_filtered_items[skip : skip + limit]

    if limit > 0:
        pages = (total + limit - 1) // limit
    else:
        pages = 1 if total > 0 else 0
        
    current_page = (skip // limit) + 1 if limit > 0 else 1

    return {
        "total": total,
        "page": current_page,
        "limit": limit,
        "pages": pages,
        "items": paginated_items
    }

def create_representative(db: Session, representative_in: schemas.RepresentativeCreate) -> models.Representative:
    identificador_completo = f"{representative_in.identification_type.upper()}{representative_in.identification_number}" 

    representative_data = representative_in.model_dump(exclude={"identification_type", "identification_number"})
    representative_data["cedula"] = identificador_completo # Se guarda en el campo 'cedula' del modelo

    db_representative = models.Representative(**representative_data)
    db.add(db_representative)
    try:
        db.commit()
        db.refresh(db_representative)
    except IntegrityError as e:
        db.rollback()
        print(f"IntegrityError al crear representante: {e}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El identificador '{identificador_completo}' ya existe."
        )
    return db_representative


def update_representative(
    db: Session, representative_id: int, representative_in: schemas.RepresentativeUpdate
) -> Optional[models.Representative]:
    db_representative = db.query(models.Representative).filter(models.Representative.id == representative_id).first() # Reemplaza get_representative si es necesario
    if not db_representative:
        return None

    update_data = representative_in.model_dump(exclude_unset=True)

    if "identification_type" in update_data or "identification_number" in update_data:
        # Obtener tipo y número actuales del modelo
        # (Suponiendo que db_representative.cedula siempre tiene al menos un carácter para el tipo)
        current_id_type = db_representative.cedula[0] if db_representative.cedula else ""
        current_id_number = db_representative.cedula[1:] if len(db_representative.cedula) > 1 else ""

        new_id_type = update_data.pop("identification_type", current_id_type).upper() # Normalizar a mayúscula
        new_id_number = update_data.pop("identification_number", current_id_number)

        if new_id_type and new_id_number: # Asegurarse que ambos existen
            update_data["cedula"] = f"{new_id_type}{new_id_number}"
        elif new_id_type and not new_id_number: # Si solo viene tipo, usar número actual
             update_data["cedula"] = f"{new_id_type}{current_id_number}"
        elif not new_id_type and new_id_number: # Si solo viene número, usar tipo actual
             update_data["cedula"] = f"{current_id_type}{new_id_number}"


    for key, value in update_data.items():
        setattr(db_representative, key, value)

    try:
        db.add(db_representative)
        db.commit()
        db.refresh(db_representative)
    except IntegrityError as e:
        db.rollback()
        print(f"IntegrityError al actualizar representante: {e}")
        identificador_actualizado = update_data.get("cedula", db_representative.cedula)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El identificador '{identificador_actualizado}' ya pertenece a otro representante o hay un conflicto."
        )
    return db_representative
    

def delete_representative(db: Session, representative_id: int) -> Optional[models.Representative]:
    db_representative = get_representative(db, representative_id=representative_id)
    if not db_representative:
        return None
    
    db.delete(db_representative)
    db.commit()
    return db_representative


def get_student(db: Session, student_id: int) -> Optional[models.Student]:
    return db.query(models.Student).options(joinedload(models.Student.representative),
                                            joinedload(models.Student.grade_level_assigned)).filter(models.Student.id == student_id).first()

def get_student_by_cedula(db: Session, cedula: str) -> Optional[models.Student]:
    return db.query(models.Student).options(joinedload(models.Student.representative),
                                            joinedload(models.Student.grade_level_assigned)).filter(models.Student.cedula == cedula).first()
    

def get_students(
    db: Session,
    skip: int = 0,
    limit: int = 10,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
    representative_id: Optional[int] = None,
    grade_level_id: Optional[int] = None,  
    grade_level_name: Optional[str] = None,
    is_active: Optional[bool] = True
) -> Dict[str, any]:
    
    query = db.query(models.Student).options(
        joinedload(models.Student.representative),
        joinedload(models.Student.grade_level_assigned) 
    )
    
    if representative_id is not None:
        query = query.filter(models.Student.representative_id == representative_id)
        
    # Filtro por ID del nivel de grado
    if grade_level_id is not None:
        query = query.filter(models.Student.grade_level_id == grade_level_id)
    
    if grade_level_name:
        search_grade_name = f"%{grade_level_name}%"
        query = query.join(models.GradeLevel).filter(models.GradeLevel.name.ilike(search_grade_name)) # Aseguramos el join para el filtro
        
    if is_active is not None:
        query = query.filter(models.Student.is_active == is_active)
        
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                models.Student.first_name.ilike(search_term),
                models.Student.last_name.ilike(search_term),
                models.Student.cedula.ilike(search_term),
                # Porsia se requiere buscar también en el nombre del representante o grado si es necesario
                # models.Representative.first_name.ilike(search_term), 
                # models.GradeLevel.name.ilike(search_term) 
            )
        )
    total = query.count()
        
    if sort_by:
        if sort_by == "grade_level":
            # Asegurarse de que el join con GradeLevel se haya hecho si no se filtró por grade_level_name
            # Esta es una simplificación, el join podría necesitar ser outerjoin si algunos estudiantes no tienen grado
            # o si quieres ordenar por nombre de grado incluso para los que no se filtraron por nombre de grado.
            # Tu lógica original ya hacía un join si se ordenaba por grade_level y no se había filtrado por nombre de grado.
            if not grade_level_name and not grade_level_id: # Si no se ha hecho join aún
                query = query.join(models.GradeLevel, isouter=True)
            sort_column = models.GradeLevel.name
        else:
            sort_column = getattr(models.Student, sort_by, None)

        if sort_column is not None:
            if sort_order.lower() == "desc":
                query = query.order_by(sort_column.desc())
            else:
                query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(models.Student.created_at.desc())
        
    items = query.offset(skip).limit(limit).all()
    
    if limit > 0:
        pages = (total + limit - 1) // limit
    else:
        pages = 1 if total > 0 else 0
        
    current_page = (skip // limit) + 1 if limit > 0 else 1

    return {
        "total": total,
        "page": current_page,
        "limit": limit,
        "pages": pages,
        "items": items
    }
    

def create_student(db: Session, student_in: schemas.StudentCreate) -> models.Student:
    db_representative = get_representative(db, representative_id=student_in.representative_id)
    if not db_representative:
        raise ValueError("Representante no encontrado")
    
    if student_in.cedula:
        db_student_by_cedula = get_student_by_cedula(db, cedula=student_in.cedula)
        if db_student_by_cedula:
            pass
    student_data = student_in.model_dump()
    db_student = models.Student(**student_data)
    
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    
    return get_student(db, student_id=db_student.id)

def update_student(
    db: Session, student_id: int, student_in: schemas.StudentUpdate
) -> Optional[models.Student]:
    db_student = get_student(db, student_id=student_id) # get_student ya carga el representante
    if not db_student:
        return None

    update_data = student_in.model_dump(exclude_unset=True)

    if "cedula" in update_data and update_data["cedula"]:
        db_student_by_cedula = get_student_by_cedula(db, cedula=update_data["cedula"])
        if db_student_by_cedula and db_student_by_cedula.id != student_id:
            pass
    if "representative_id" in update_data:
        db_representative = get_representative(db, representative_id=update_data["representative_id"])
        if not db_representative:
            pass
    for key, value in update_data.items():
        setattr(db_student, key, value)
    
    db.add(db_student)
    db.commit()
    db.refresh(db_student)

    return get_student(db, student_id=db_student.id) 

def deactivate_student(db: Session, student_id: int) -> Optional[models.Student]:

    db_student = get_student(db, student_id=student_id)
    if not db_student:
        return None
    
    db_student.is_active = False
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    return get_student(db, student_id=db_student.id) 

def activate_student(db: Session, student_id: int) -> Optional[models.Student]:

    db_student = get_student(db, student_id=student_id)
    if not db_student:
        return None
    
    db_student.is_active = True
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    return get_student(db, student_id=db_student.id)


# --- Funciones CRUD para Configuración de la Escuela ---

SCHOOL_CONFIG_ID = 1

def get_school_configuration(db: Session) -> Optional[models.SchoolConfiguration]:
    return db.query(models.SchoolConfiguration).filter(models.SchoolConfiguration.id == SCHOOL_CONFIG_ID).first()

def create_or_update_school_configuration(
    db: Session,
    config_in: schemas.SchoolConfigurationCreate 
) -> models.SchoolConfiguration:
    db_config = get_school_configuration(db) 

    if db_config:
        update_data = config_in.model_dump(exclude_unset=False) # False para actualizar todos los campos
        for key, value in update_data.items():
            setattr(db_config, key, value)
    else:
        config_data = config_in.model_dump()
        db_config = models.SchoolConfiguration(**config_data, id=SCHOOL_CONFIG_ID)
        db.add(db_config)
    
    db.commit()
    db.refresh(db_config)
    return db_config

# --- Funciones CRUD para GradeLevel ---


def create_grade_level(db: Session, grade_level: schemas.GradeLevelCreate) -> models.GradeLevel:
    db_grade_level = models.GradeLevel(**grade_level.model_dump())
    db.add(db_grade_level)
    db.commit()
    db.refresh(db_grade_level)
    return db_grade_level

def get_grade_level(db: Session, grade_level_id: int) -> Optional[models.GradeLevel]:
    return db.query(models.GradeLevel).filter(models.GradeLevel.id == grade_level_id).first()

def get_grade_level_by_name(db: Session, name: str) -> Optional[models.GradeLevel]:
    return db.query(models.GradeLevel).filter(models.GradeLevel.name == name).first()

def get_grade_levels(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    is_active: Optional[bool] = True,
    search: Optional[str] = None,
    sort_by: Optional[str] = "order_index", 
    sort_order: Optional[str] = "asc"
) -> List[models.GradeLevel]:
    """
    Obtiene una lista de niveles de grado con paginación, filtro por activo,
    búsqueda por nombre o descripción, y ordenamiento.
    """
    query = db.query(models.GradeLevel)

    if is_active is not None:
        query = query.filter(models.GradeLevel.is_active == is_active)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                models.GradeLevel.name.ilike(search_term),
                models.GradeLevel.description.ilike(search_term)
            )
        )

    if sort_by:
        column_to_sort = getattr(models.GradeLevel, sort_by, None)
        if column_to_sort:
            if sort_order.lower() == "desc":
                query = query.order_by(column_to_sort.desc())
            else:
                query = query.order_by(column_to_sort.asc())
    else:
        query = query.order_by(models.GradeLevel.order_index.asc())


    return query.offset(skip).limit(limit).all()

def update_grade_level(
    db: Session, grade_level_id: int, grade_level_in: schemas.GradeLevelUpdate
) -> Optional[models.GradeLevel]:
    db_grade_level = get_grade_level(db, grade_level_id=grade_level_id)
    if not db_grade_level:
        return None # El router manejará el 404

    update_data = grade_level_in.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(db_grade_level, key, value)

    db.add(db_grade_level)
    db.commit()
    db.refresh(db_grade_level)
    return db_grade_level

def deactivate_grade_level(db: Session, grade_level_id: int) -> models.GradeLevel:
    db_grade_level = get_grade_level(db, grade_level_id=grade_level_id)
    if not db_grade_level:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nivel de grado no encontrado.")
    
    if not db_grade_level.is_active:
        raise BusinessLogicError(detail="El nivel de grado ya está inactivo.")
    
    activate_student_in_grade = db.query(models.Student)\
                                .filter(models.Student.grade_level_id == grade_level_id)\
                                .filter(models.Student.is_active == True)\
                                .first()
    if activate_student_in_grade:
        raise GradeLevelInUseError(
            detail=f"El nivel de grado '{db_grade_level.name}' no puede ser desactivado porque tiene estudiantes activos asignados."
        )
    
    db_grade_level.is_active = False
    db.add(db_grade_level)
    db.commit()
    db.refresh(db_grade_level)
    return db_grade_level
        
        
# --- Funciones CRUD para Conceptos de Cargo (ChargeConcept) ---


def create_charge_concept(db: Session, charge_concept_in: schemas.ChargeConceptCreate) -> models.ChargeConcept:
    if charge_concept_in.applicable_grade_level_id:
        grade_level = get_grade_level(db, grade_level_id=charge_concept_in.applicable_grade_level_id)
        if not grade_level:
            pass
        
    db_charge_concept = models.ChargeConcept(**charge_concept_in.model_dump())
    db.add(db_charge_concept)
    db.commit()
    db.refresh(db_charge_concept)
    return db_charge_concept

def get_charge_concept(db: Session, charge_concept_id: int) -> Optional[models.ChargeConcept]:
    return (
        db.query(models.ChargeConcept)
        .options(joinedload(models.ChargeConcept.grade_level))
        .filter(models.ChargeConcept.id == charge_concept_id)
        .first()
    )
    
def get_charge_concept_by_name(db: Session, name: str) -> Optional[models.ChargeConcept]:
    return db.query(models.ChargeConcept).filter(models.ChargeConcept.name == name).first()

def get_charge_concepts(
    db: Session,
    skip: int = 0,
    limit: int = 100, # Puedes cambiar el default a 10
    is_active: Optional[bool] = None,
    applicable_grade_level_id: Optional[int] = None,
    category: Optional[schemas.ChargeCategory] = None, # Viene de models o schemas
    frequency: Optional[schemas.ChargeFrequency] = None, # Viene de models o schemas
    search: Optional[str] = None,
    sort_by: Optional[str] = "name", 
    sort_order: Optional[str] = "asc"
) -> Dict[str, any]: 
    query = db.query(models.ChargeConcept).options(joinedload(models.ChargeConcept.grade_level))

    if is_active is not None:
        query = query.filter(models.ChargeConcept.is_active == is_active)

    if applicable_grade_level_id is not None:
        if applicable_grade_level_id == 0: # '0' para general
            query = query.filter(models.ChargeConcept.applicable_grade_level_id.is_(None))
        else:
            query = query.filter(models.ChargeConcept.applicable_grade_level_id == applicable_grade_level_id)
    
    if category:
        query = query.filter(models.ChargeConcept.category == category)

    if frequency:
        query = query.filter(models.ChargeConcept.default_frequency == frequency)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                models.ChargeConcept.name.ilike(search_term),
                models.ChargeConcept.description.ilike(search_term)
            )
        )
    
    # Calcular total
    total = query.count()

    # Ordenamiento (tu lógica original)
    if sort_by:
        column_to_sort = None
        if hasattr(models.ChargeConcept, sort_by):
            column_to_sort = getattr(models.ChargeConcept, sort_by)
        elif sort_by == "grade_level_name": 
            query = query.outerjoin(models.GradeLevel) 
            column_to_sort = models.GradeLevel.name
        
        if column_to_sort is not None:
            if sort_order.lower() == "desc":
                query = query.order_by(column_to_sort.desc())
            else:
                query = query.order_by(column_to_sort.asc())
    else:
        query = query.order_by(models.ChargeConcept.name.asc())

    items = query.offset(skip).limit(limit).all()

    current_page = (skip // limit) + 1 if limit > 0 else 1
    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)

    return {
        "items": items,
        "total": total,
        "page": current_page,
        "pages": pages,
        "limit": limit
    }

        
def update_charge_concept(db: Session, charge_concept_id: int, charge_concept_in: schemas.ChargeConceptUpdate) -> Optional[models.ChargeConcept]:
    db_charge_concept = get_charge_concept(db, charge_concept_id=charge_concept_id)
    if not db_charge_concept:
        return None
    update_data = charge_concept_in.model_dump(exclude_unset=True)
    
    if "applicable_grade_level_id" in update_data and update_data["applicable_grade_level_id"] is not None:
        if update_data["applicable_grade_level_id"] != 0:
            grade_level = get_grade_level(db, grade_level_id=update_data["applicable_grade_level_id"])
            if not grade_level:
                return None
    
    for key, value in update_data.items():
        setattr(db_charge_concept, key, value)
        
    db.add(db_charge_concept)
    db.commit()
    db.refresh(db_charge_concept)
    return get_charge_concept(db, charge_concept_id=db_charge_concept.id)


def deactivate_charge_concept(db: Session, charge_concept_id: int) -> models.ChargeConcept: # Devuelve ChargeConcept o lanza excepción
    db_charge_concept = get_charge_concept(db, charge_concept_id=charge_concept_id)
    if not db_charge_concept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Concepto de cargo no encontrado.")

    if not db_charge_concept.is_active:
        raise ChargeConceptAlreadyInactiveError(detail=f"El concepto de cargo '{db_charge_concept.name}' ya está inactivo.")
    
    active_dependencies = db.query(models.AppliedCharge).filter(
        models.AppliedCharge.charge_concept_id == charge_concept_id,
        models.AppliedCharge.status.in_([
            models.AppliedChargeStatus.PENDING,
            models.AppliedChargeStatus.PARTIALLY_PAID,
            models.AppliedChargeStatus.OVERDUE 
        ])
    ).first()
    
    if active_dependencies:
        raise ChargeConceptInUseError(
            detail=f"El concepto de cargo '{db_charge_concept.name}' no puede ser desactivado porque tiene cargos aplicados pendientes o parcialmente pagados (ej. ID de cargo aplicado: {active_dependencies.id})."
        )
    
    db_charge_concept.is_active = False
    db.add(db_charge_concept)
    db.commit()
    db.refresh(db_charge_concept)
    return get_charge_concept(db, charge_concept_id=db_charge_concept.id) 


def activate_charge_concept(db: Session, charge_concept_id: int) -> Optional[models.ChargeConcept]:
    db_charge_concept = get_charge_concept(db, charge_concept_id=charge_concept_id)
    if not db_charge_concept:
        return None
    
    if db_charge_concept.is_active:
        return db_charge_concept
    
    db_charge_concept.is_active = True
    db.add(db_charge_concept)
    db.commit()
    db.refresh(db_charge_concept)
    return get_charge_concept(db, charge_concept_id=db_charge_concept.id)
    
    
# --- Funciones CRUD para Cargos Aplicados (AppliedCharge) ---


def create_applied_charge(
    db: Session,
    applied_charge_in: schemas.AppliedChargeClientCreate,
    student_model: Optional[models.Student] = None,
    charge_concept_model: Optional[models.ChargeConcept] = None
) -> models.AppliedCharge:

    if not student_model:
        student_model = get_student(db, student_id=applied_charge_in.student_id)
    if not student_model or not student_model.is_active: # Validar existencia y actividad
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Estudiante con ID {applied_charge_in.student_id} no válido o inactivo.")

    if not charge_concept_model:
        charge_concept_model = get_charge_concept(db, charge_concept_id=applied_charge_in.charge_concept_id)
    if not charge_concept_model or not charge_concept_model.is_active: # Validar existencia y actividad
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Concepto de cargo con ID {applied_charge_in.charge_concept_id} no válido o inactivo.")

    # Validar fechas (due_date >= issue_date)
    if applied_charge_in.due_date < applied_charge_in.issue_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La fecha de vencimiento no puede ser anterior a la fecha de emisión."
        )
    
    # 1. Obtener valores originales del concepto de cargo
    original_concept_amount_val = charge_concept_model.default_amount #
    original_concept_currency_val = charge_concept_model.default_amount_currency #

    # 2. Determinar si el cargo es indexado
    is_indexed_val = (original_concept_currency_val != models.Currency.VES) #

    # 3. Calcular el monto en VES antes de aplicar becas basadas en VES y obtener la tasa de emisión
    #    _calculate_converted_amount_ves devuelve (monto_en_ves, tasa_aplicada)
    #    Esta tasa será exchange_rate_applied_at_emission
    try:
        amount_ves_equivalent_pre_scholarship, exchange_rate_applied_at_emission_val = _calculate_converted_amount_ves(
            db=db,
            original_amount=original_concept_amount_val,
            original_currency=original_concept_currency_val,
            rate_date=applied_charge_in.issue_date # Tasa del día de emisión del cargo
        ) #

        # 4. Aplicar becas al monto ya convertido a VES (según la lógica actual de _apply_scholarship)
        #    Este resultado será amount_due_ves_at_emission
        amount_due_ves_at_emission_val = _apply_scholarship(
            student=student_model,
            amount_to_apply_scholarship_on=amount_ves_equivalent_pre_scholarship
        ) #

    except HTTPException as e_calc_http: # Si _calculate_converted_amount_ves lanza error (ej. sin tasa)
        raise e_calc_http
    except Exception as e_calc_generic:
        # Considera loggear e_calc_generic para un mejor diagnóstico
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error calculando monto del cargo: {str(e_calc_generic)}")

    # 5. Calcular amount_due_original_currency (monto neto adeudado en la moneda original, post-beca)
    #    Dado que _apply_scholarship opera sobre el monto en VES,
    #    convertimos el amount_due_ves_at_emission_val de vuelta a la moneda original si es indexado.
    #    Esto refleja el valor de la deuda en la moneda original después de todas las becas.
    amount_due_original_currency_val: float
    if is_indexed_val:
        if exchange_rate_applied_at_emission_val and exchange_rate_applied_at_emission_val > 0:
            amount_due_original_currency_val = round(amount_due_ves_at_emission_val / exchange_rate_applied_at_emission_val, 2)
        else:
            # Este caso es problemático si es indexado y no hay tasa válida.
            # _calculate_converted_amount_ves debería haber lanzado una excepción HTTP si la tasa para USD/EUR no se encontró.
            # Si llegamos aquí para una moneda indexada sin tasa válida, hay una inconsistencia.
            # Por seguridad, se podría lanzar un error o usar un fallback (aunque menos preciso).
            # Asumiendo que para monedas indexadas (USD/EUR), la tasa es válida si no hubo excepción previa.
            # Si la moneda original no es USD/EUR y no tiene tasa, la conversión inicial fallaría o daría tasa None.
            # Este es un punto a revisar con cuidado si se usan otras monedas indexadas sin manejo de tasa obligatoria.
            # Por ahora, se asume que si es indexado y _calculate_converted_amount_ves no lanzó error, la tasa es válida.
             raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"No se pudo determinar la tasa para calcular el monto original para moneda indexada {original_concept_currency_val}."
            )

    else: # La moneda original es VES
        amount_due_original_currency_val = amount_due_ves_at_emission_val

    # Crear la instancia del modelo con todos los datos
    db_applied_charge = models.AppliedCharge(
        student_id=applied_charge_in.student_id, #
        charge_concept_id=applied_charge_in.charge_concept_id, #
        description=applied_charge_in.description, #
        issue_date=applied_charge_in.issue_date, #
        due_date=applied_charge_in.due_date, #
        status=applied_charge_in.status if applied_charge_in.status else models.AppliedChargeStatus.PENDING, #
        
        original_concept_amount=original_concept_amount_val, #
        original_concept_currency=original_concept_currency_val, #
        
        amount_due_original_currency=amount_due_original_currency_val, # Campo requerido
        is_indexed=is_indexed_val, # Campo requerido

        amount_due_ves_at_emission=amount_due_ves_at_emission_val, # Nombre corregido
        exchange_rate_applied_at_emission=exchange_rate_applied_at_emission_val, # Nombre corregido
        
        amount_paid_ves=0.0, # Valor inicial
        amount_paid_original_currency_equivalent=0.0 # Valor inicial
    )
    
    db.add(db_applied_charge)
    db.commit()
    db.refresh(db_applied_charge)
    
    # Recargar el objeto con las relaciones para la respuesta
    return get_applied_charge(db, applied_charge_id=db_applied_charge.id) #
    

def get_applied_charge(db: Session, applied_charge_id: int) -> Optional[models.AppliedCharge]:
    return (
        db.query(models.AppliedCharge)
        .options(
            joinedload(models.AppliedCharge.student),
            joinedload(models.AppliedCharge.charge_concept).joinedload(models.ChargeConcept.grade_level)
        )
        .filter(models.AppliedCharge.id == applied_charge_id).first()
    )
    
    
def get_applied_charges_for_student(
    db: Session,
    student_id: int,
    skip: int = 0,
    limit: int = 100,
    status: Optional[schemas.AppliedChargeStatus] = None,
    start_issue_date: Optional[date] = None,
    end_issue_date: Optional[date] = None,
    sort_by: str = "issue_date",
    sort_order: str = "desc"
) -> List[models.AppliedCharge]:
    query = (
        db.query(models.AppliedCharge)
        .options(
            joinedload(models.AppliedCharge.student),
            joinedload(models.AppliedCharge.charge_concept).joinedload(models.ChargeConcept.grade_level)
        )
        .filter(models.AppliedCharge.student_id == student_id)
    )
    if status:
        query = query.filter(models.AppliedCharge.status == status)
    if start_issue_date:
        query = query.filter(models.AppliedCharge.issue_date >= start_issue_date)
    if end_issue_date:
        query = query.filter(models.AppliedCharge.issue_date <= end_issue_date)
        
    if sort_by == "amount_due": 
        sort_by_column_name = "amount_due_ves"
    else:
        sort_by_column_name = sort_by

    column_to_sort = getattr(models.AppliedCharge, sort_by_column_name, models.AppliedCharge.issue_date)
    if sort_order.lower() == "desc":
        query = query.order_by(column_to_sort.desc())
    else:
        query = query.order_by(column_to_sort.asc())
    return query.offset(skip).limit(limit).all()


def get_all_applied_charges(
    db: Session,
    skip: int = 0,
    limit: int = 10, # Cambiado el default a 10 para facilitar pruebas de paginación, haberlo dejado en 200 fue una tremenda cagada xD
    student_id: Optional[int] = None,
    charge_concept_id: Optional[int] = None,
    status: Optional[List[schemas.AppliedChargeStatus]] = None, # Usar el enum de schemas
    representative_id: Optional[int] = None,
    start_issue_date: Optional[date] = None,
    end_issue_date: Optional[date] = None,
    start_due_date: Optional[date] = None,
    end_due_date: Optional[date] = None,
    sort_by: str = "issue_date",
    sort_order: str = "desc"
) -> Dict[str, any]: 
    """
    Obtiene una lista general de cargos aplicados con múltiples filtros y paginación,
    incluyendo el conteo total para la paginación.
    """
    query = db.query(models.AppliedCharge).options(
        joinedload(models.AppliedCharge.student).joinedload(models.Student.representative),
        joinedload(models.AppliedCharge.charge_concept).joinedload(models.ChargeConcept.grade_level)
    )

    # Aplicar filtros
    if student_id is not None:
        query = query.filter(models.AppliedCharge.student_id == student_id)
    
    if charge_concept_id is not None:
        query = query.filter(models.AppliedCharge.charge_concept_id == charge_concept_id)

    if status: # Si 'status' es una lista y no está vacía
        query = query.filter(models.AppliedCharge.status.in_(status)) # Usar .in_() para filtrar por una lista de valores

    if representative_id is not None:
        # Asegúrate de que el join con Student se haga solo una vez si ya existe por otra razón
        # o que SQLAlchemy lo maneje bien. join() por defecto es INNER JOIN.
        # Si un AppliedCharge pudiera existir sin un student (no debería), necesitarías isouter=True
        query = query.join(models.Student, models.AppliedCharge.student_id == models.Student.id)\
                     .filter(models.Student.representative_id == representative_id)
        
    if start_issue_date:
        query = query.filter(models.AppliedCharge.issue_date >= start_issue_date)
    if end_issue_date:
        query = query.filter(models.AppliedCharge.issue_date <= end_issue_date)
    if start_due_date:
        query = query.filter(models.AppliedCharge.due_date >= start_due_date)
    if end_due_date:
        query = query.filter(models.AppliedCharge.due_date <= end_due_date)

    # --- NUEVO: Calcular el total ANTES de aplicar ordenamiento y paginación a la query principal ---
    # Esto es importante para obtener el conteo correcto basado en los filtros.
    total = query.count()

    # Aplicar ordenamiento
    # (Tu lógica de ordenamiento original estaba bien, la he mantenido y reestructurado ligeramente para claridad)
    if sort_by:
        sort_column_name = "amount_due_ves" if sort_by == "amount_due" else sort_by
        
        if sort_column_name == "student_name":
            # El join con Student ya se hizo si se filtró por representative_id.
            # Si no, y se quiere ordenar por nombre de estudiante, necesitamos el join.
            # Para evitar múltiples joins del mismo tipo o asegurar que se use el correcto:
            # Esta es una forma de verificar si el join ya está presente.
            # Sin embargo, SQLAlchemy suele ser inteligente con joins repetidos en la misma tabla.
            # Si representative_id no se usó, el join no se habrá hecho aún.
            # La lógica original tenía un if not representative_id, lo cual es bueno.
            # Si queremos ordenar por student_name y no se filtró por representative, necesitamos unir Student.
            # Para simplificar y asegurar, podemos hacer un outerjoin si no estamos seguros.
            query = query.outerjoin(models.Student, models.AppliedCharge.student_id == models.Student.id)
            order_expressions = [models.Student.last_name, models.Student.first_name]
            if sort_order.lower() == "desc":
                query = query.order_by(*(col.desc() for col in order_expressions))
            else:
                query = query.order_by(*(col.asc() for col in order_expressions))
        elif sort_column_name == "charge_concept_name":
            query = query.outerjoin(models.ChargeConcept, models.AppliedCharge.charge_concept_id == models.ChargeConcept.id)
            order_expression = models.ChargeConcept.name
            if sort_order.lower() == "desc":
                query = query.order_by(order_expression.desc())
            else:
                query = query.order_by(order_expression.asc())
        else:
            column_to_sort = getattr(models.AppliedCharge, sort_column_name, None)
            if column_to_sort: # Solo ordenar si la columna existe en AppliedCharge
                if sort_order.lower() == "desc":
                    query = query.order_by(column_to_sort.desc())
                else:
                    query = query.order_by(column_to_sort.asc())
            else: # Fallback si el sort_by no es válido para AppliedCharge directamente
                query = query.order_by(models.AppliedCharge.issue_date.desc()) # Default sort
    else: # Default si no se proporciona sort_by
        query = query.order_by(models.AppliedCharge.issue_date.desc())
            
    # Aplicar paginación
    items = query.offset(skip).limit(limit).all()
    
    # --- NUEVO: Calcular información de paginación ---
    current_page = (skip // limit) + 1 if limit > 0 else 1
    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)

    # --- NUEVO: Devolver el diccionario con la estructura esperada ---
    return {
        "items": items,
        "total": total,
        "page": current_page,
        "pages": pages,
        "limit": limit
    }

    
def update_applied_charge(
    db: Session,
    applied_charge_id: int,
    applied_charge_in: schemas.AppliedChargeUpdate 
) -> models.AppliedCharge: 
    db_applied_charge = get_applied_charge(db, applied_charge_id=applied_charge_id)
    if not db_applied_charge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cargo aplicado no encontrado.")

    update_data = applied_charge_in.model_dump(exclude_unset=True)

    if db_applied_charge.status in [models.AppliedChargeStatus.PAID, models.AppliedChargeStatus.CANCELLED]:
        allowed_to_update = True
        for field in update_data:
            if field not in ["description", "status"]:  
                allowed_to_update = False
                break
            if field == "status":
                if db_applied_charge.status == models.AppliedChargeStatus.PAID and \
                   update_data["status"] != models.AppliedChargeStatus.CANCELLED:
                    allowed_to_update = False
                    break
                if db_applied_charge.status == models.AppliedChargeStatus.CANCELLED and \
                   update_data["status"] != models.AppliedChargeStatus.CANCELLED: 
                    allowed_to_update = False
                    break
        
        if not allowed_to_update:
            raise AppliedChargeUpdateNotAllowedError(
                detail=f"La actualización no está permitida para el cargo aplicado ID {applied_charge_id} " \
                       f"debido a su estado actual ({db_applied_charge.status.value}) y los campos que se intentan modificar."
            )

    for key, value in update_data.items():
        setattr(db_applied_charge, key, value)

    db.add(db_applied_charge)
    db.commit()
    db.refresh(db_applied_charge)
    return get_applied_charge(db, applied_charge_id=db_applied_charge.id)


def run_apply_global_charge_process(db: Session, charge_details: schemas.GlobalChargeCreate) -> schemas.GlobalChargeSummaryResponse:
    charge_concept = get_charge_concept(db, charge_concept_id=charge_details.charge_concept_id)
    if not charge_concept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Concepto de Cargo con ID {charge_details.charge_concept_id} no encontrado.")
    if not charge_concept.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"El Concepto de Cargo '{charge_concept.name}' está inactivo.")

    effective_amount = charge_details.override_amount if charge_details.override_amount is not None else charge_concept.default_amount
    effective_currency = charge_details.override_currency if charge_details.override_currency is not None else charge_concept.default_amount_currency
    is_indexed_val = (effective_currency != models.Currency.VES)
    
    description_for_charge = charge_details.description if charge_details.description else charge_concept.name

    # Obtener estudiantes
    students_query = db.query(models.Student).options(
        joinedload(models.Student.representative) # Opcional, pero bueno tenerlo
    )
    if charge_details.target_students == "all_active":
        students_query = students_query.filter(models.Student.is_active == True)
    
    target_students_list = students_query.all()

    students_evaluated_count = 0
    charges_created_count = 0
    errors_list_response: List[schemas.GlobalChargeSummaryItemError] = []
    new_applied_charges_to_add: List[models.AppliedCharge] = []
    total_sum_original_currency_val = 0.0

    # Obtener tasa de cambio para la fecha de emisión si es necesario
    exchange_rate_for_emission_val = None
    if is_indexed_val:
        # Asumimos que _calculate_converted_amount_ves internamente buscará la tasa más apropiada
        # para effective_currency a VES en charge_details.issue_date.
        # Si esa función falla por no encontrar tasa para USD/EUR, lanzará HTTPException.
        # Para otras monedas indexadas, el manejo de tasa no encontrada debe ser robusto.
        # Aquí, verificaremos si se puede obtener una tasa para el cálculo de amount_due_ves_at_emission.
        # Esta llamada es solo para asegurar que la tasa exista para la lógica que sigue.
        try:
            _, exchange_rate_for_emission_val = _calculate_converted_amount_ves(
                db, 
                original_amount=1.0, # Monto de prueba
                original_currency=effective_currency, 
                rate_date=charge_details.issue_date
            )
            if is_indexed_val and exchange_rate_for_emission_val is None: # Doble chequeo, _calc debería lanzar error para USD/EUR
                 raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"No se encontró tasa de cambio para {effective_currency.value} a VES en la fecha de emisión {charge_details.issue_date}.")
        except HTTPException as e:
             # Si no se puede obtener la tasa y es necesaria, no podemos continuar
            errors_list_response.append(schemas.GlobalChargeSummaryItemError(
                student_id=0, student_name="Sistema", 
                reason=f"Error crítico obteniendo tasa de cambio para {effective_currency.value} en fecha {charge_details.issue_date}: {e.detail}. No se crearon cargos."
            ))
            return schemas.GlobalChargeSummaryResponse(
                charge_concept_name=charge_concept.name,
                target_group=charge_details.target_students,
                students_evaluated=len(target_students_list),
                charges_successfully_created=0,
                total_value_of_charges_created_original_currency=0.0,
                currency_of_sum=effective_currency.value,
                errors_list=errors_list_response,
                message="Proceso fallido: Tasa de cambio requerida no encontrada."
            )


    for student in target_students_list:
        students_evaluated_count += 1
        student_full_name = f"{student.first_name} {student.last_name}"

        # Opcional: Verificar si ya existe un cargo similar para este estudiante/concepto/mes
        # Esto depende de tu lógica de negocio para evitar duplicados (ej. mensualidades)
        # Por ahora, lo omitimos para simplificar, pero es importante en producción.

        # 1. Aplicar beca porcentual al monto en moneda original
        net_due_original_currency_after_percentage = effective_amount
        if student.has_scholarship and student.scholarship_percentage is not None and student.scholarship_percentage > 0:
            discount = effective_amount * (student.scholarship_percentage / 100)
            net_due_original_currency_after_percentage -= discount
        
        net_due_original_currency_after_percentage = round(max(0, net_due_original_currency_after_percentage), 2)
        
        # Este valor se guardará como `amount_due_original_currency`
        amount_due_original_currency_for_db = net_due_original_currency_after_percentage

        # 2. Convertir a VES (si es necesario) y obtener la tasa que se usó
        #    Este es el monto en VES *antes* de aplicar becas de monto fijo en VES.
        try:
            amount_ves_before_fixed_scholarship, actual_rate_applied = _calculate_converted_amount_ves(
                db=db,
                original_amount=amount_due_original_currency_for_db, # Usamos el monto ya con beca porcentual
                original_currency=effective_currency,
                rate_date=charge_details.issue_date
            )
        except HTTPException as e_conv:
            errors_list_response.append(schemas.GlobalChargeSummaryItemError(student_id=student.id, student_name=student_full_name, reason=f"Error de conversión de moneda: {e_conv.detail}"))
            continue # Saltar a la siguiente iteración

        # 3. Aplicar beca de monto fijo en VES
        final_due_ves_at_emission = amount_ves_before_fixed_scholarship
        if student.has_scholarship and student.scholarship_fixed_amount is not None and student.scholarship_fixed_amount > 0:
            final_due_ves_at_emission -= student.scholarship_fixed_amount
        
        final_due_ves_at_emission = round(max(0, final_due_ves_at_emission), 2)

        # Si el monto final es cero o negativo después de becas, podríamos optar por no crear el cargo
        if final_due_ves_at_emission <= 0 and amount_due_original_currency_for_db <=0:
             errors_list_response.append(schemas.GlobalChargeSummaryItemError(student_id=student.id, student_name=student_full_name, reason=f"Monto final cero o negativo después de becas. No se creó el cargo."))
             continue


        applied_charge = models.AppliedCharge(
            student_id=student.id,
            charge_concept_id=charge_concept.id,
            description=description_for_charge,
            original_concept_amount=effective_amount, # Monto base del concepto o override
            original_concept_currency=effective_currency,
            amount_due_original_currency=amount_due_original_currency_for_db, # Neto en moneda original post-beca porcentual
            is_indexed=is_indexed_val,
            amount_due_ves_at_emission=final_due_ves_at_emission, # Neto en VES post-beca porcentual y fija VES
            exchange_rate_applied_at_emission=actual_rate_applied if is_indexed_val else None,
            issue_date=charge_details.issue_date,
            due_date=charge_details.due_date,
            status=models.AppliedChargeStatus.PENDING,
            amount_paid_ves=0.0,
            amount_paid_original_currency_equivalent=0.0
        )
        new_applied_charges_to_add.append(applied_charge)
        charges_created_count += 1
        total_sum_original_currency_val += amount_due_original_currency_for_db

    if new_applied_charges_to_add:
        try:
            db.add_all(new_applied_charges_to_add)
            db.commit()
        except Exception as e_commit:
            db.rollback()
            # Si falla el commit masivo, es un error general del proceso
            # Podrías añadir un error general a errors_list_response o lanzar una excepción
            # Por ahora, asumimos que los errores se manejan por estudiante.
            # Pero un fallo aquí es más grave.
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al guardar los cargos generados: {str(e_commit)}")

    return schemas.GlobalChargeSummaryResponse(
        charge_concept_name=charge_concept.name,
        target_group=charge_details.target_students,
        students_evaluated=students_evaluated_count,
        charges_successfully_created=charges_created_count,
        total_value_of_charges_created_original_currency=round(total_sum_original_currency_val, 2),
        currency_of_sum=effective_currency.value,
        errors_list=errors_list_response
    )
    
#--- Funciones para las tasas de cambio ---


def get_current_venezuelan_date(): # Función auxiliar para obtener la fecha actual en VET
    vet_tz = pytz.timezone('America/Caracas')
    return datetime.now(vet_tz).date()

def check_daily_exchange_rate_status(db: Session) -> schemas.ExchangeRateAlertResponse:
    """
    Verifica si la tasa de cambio USD a VES está actualizada para el día actual (VET).
    """
    today_vet = get_current_venezuelan_date() # Usa la fecha actual de Venezuela

    # Busca la tasa más reciente para USD->VES en o antes de "hoy en Venezuela"
    latest_usd_to_ves_rate = get_latest_exchange_rate(
        db,
        from_currency=models.Currency.USD,
        to_currency=models.Currency.VES,
        on_date=today_vet # Compara contra el "hoy" venezolano
    )

    if latest_usd_to_ves_rate:
        if latest_usd_to_ves_rate.rate_date == today_vet:
            return schemas.ExchangeRateAlertResponse(
                needs_update=False,
                message=f"La tasa de cambio USD-VES está actualizada para hoy ({today_vet.strftime('%d/%m/%Y')}).",
                latest_rate_date=latest_usd_to_ves_rate.rate_date,
                current_date_on_server=today_vet
            )
        else:
            # Hay una tasa, pero no es de hoy (VET)
            return schemas.ExchangeRateAlertResponse(
                needs_update=True,
                message=f"ADVERTENCIA: La tasa USD-VES más reciente es del {latest_usd_to_ves_rate.rate_date.strftime('%d/%m/%Y')}. Por favor, actualícela para hoy ({today_vet.strftime('%d/%m/%Y')}).",
                latest_rate_date=latest_usd_to_ves_rate.rate_date,
                current_date_on_server=today_vet
            )
    else:
        # No se encontró ninguna tasa USD-VES
        return schemas.ExchangeRateAlertResponse(
            needs_update=True,
            message=f"ADVERTENCIA: No hay tasa de cambio USD-VES registrada. Por favor, registre la tasa para hoy ({today_vet.strftime('%d/%m/%Y')}).",
            latest_rate_date=None,
            current_date_on_server=today_vet
        )


def create_exchange_rate(db: Session, exchange_rate_in: schemas.ExchangeRateCreate) -> models.ExchangeRate:
    db_exchange_rate = models.ExchangeRate(**exchange_rate_in.model_dump())
    db.add(db_exchange_rate)
    try:
        db.commit()
        db.refresh(db_exchange_rate)
        return db_exchange_rate
    except IntegrityError:
        db.rollback()
        raise 
    
def get_exchange_rate_by_id(db: Session, exchange_rate_id: int) -> Optional[models.ExchangeRate]:
    return db.query(models.ExchangeRate).filter(models.ExchangeRate.id == exchange_rate_id).first()


def get_latest_exchange_rate(
    db: Session,
    from_currency: models.Currency,
    to_currency: models.Currency = models.Currency.VES, # Por defecto, buscar tasa a VES
    on_date: Optional[date] = None
) -> Optional[models.ExchangeRate]:
    query = db.query(models.ExchangeRate).filter(
        models.ExchangeRate.from_currency == from_currency,
        models.ExchangeRate.to_currency == to_currency
    )
    if on_date:
        query = query.filter(models.ExchangeRate.rate_date <= on_date)
    
    return query.order_by(models.ExchangeRate.rate_date.desc(), models.ExchangeRate.created_at.desc()).first()


def get_exchange_rates(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    from_currency: Optional[models.Currency] = None,
    to_currency: Optional[models.Currency] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> List[models.ExchangeRate]:
    query = db.query(models.ExchangeRate)
    if from_currency:
        query = query.filter(models.ExchangeRate.from_currency == from_currency)
    if to_currency:
        query = query.filter(models.ExchangeRate.to_currency == to_currency)
    if start_date:
        query = query.filter(models.ExchangeRate.rate_date >= start_date)
    if end_date:
        query = query.filter(models.ExchangeRate.rate_date <= end_date)
    
    return query.order_by(models.ExchangeRate.rate_date.desc(), models.ExchangeRate.created_at.desc()).offset(skip).limit(limit).all()


def update_exchange_rate(
    db: Session,
    exchange_rate_id: int,
    exchange_rate_in: schemas.ExchangeRateUpdate # Asumiendo que defines un ExchangeRateUpdate schema
) -> Optional[models.ExchangeRate]:
    db_exchange_rate = get_exchange_rate_by_id(db, exchange_rate_id)
    if not db_exchange_rate:
        return None

    update_data = exchange_rate_in.model_dump(exclude_unset=True)
    
    # Opcional: Validar que no se cree un conflicto con otra tasa si se cambia la fecha/monedas
    if any(k in update_data for k in ["from_currency", "to_currency", "rate_date"]):
        check_from = update_data.get("from_currency", db_exchange_rate.from_currency)
        check_to = update_data.get("to_currency", db_exchange_rate.to_currency)
        check_date = update_data.get("rate_date", db_exchange_rate.rate_date)
        
        existing_conflict = db.query(models.ExchangeRate).filter(
            models.ExchangeRate.id != exchange_rate_id, # Excluir el registro actual
            models.ExchangeRate.from_currency == check_from,
            models.ExchangeRate.to_currency == check_to,
            models.ExchangeRate.rate_date == check_date
        ).first()
        if existing_conflict:
            raise HTTPException( 
                status_code=400,
                detail="La actualización crearía un conflicto con una tasa existente para la misma fecha y par de monedas."
            )

    for key, value in update_data.items():
        setattr(db_exchange_rate, key, value)
    
    db.add(db_exchange_rate)
    db.commit()
    db.refresh(db_exchange_rate)
    return db_exchange_rate


def delete_exchange_rate(db: Session, exchange_rate_id: int) -> Optional[models.ExchangeRate]:
    db_exchange_rate = get_exchange_rate_by_id(db, exchange_rate_id)
    if not db_exchange_rate:
        return None
    
    db.delete(db_exchange_rate)
    db.commit()
    return db_exchange_rate


def _calculate_converted_amount_ves(
    db: Session,
    original_amount: float,
    original_currency: models.Currency,
    rate_date: date # Fecha para la cual buscar la tasa
) -> tuple[float, Optional[float]]: # Retorna (monto_en_ves, tasa_aplicada)
    """
    Calcula el monto en VES a partir de un monto original y su moneda.
    Busca la tasa de cambio más reciente en o antes de rate_date.
    Retorna una tupla con el monto calculado en VES y la tasa de cambio aplicada (o None si no hubo conversión).
    Lanza HTTPException si la moneda no es soportada o no se encuentra tasa.
    """
    if original_currency == models.Currency.VES:
        return original_amount, None # No se aplica tasa si ya está en VES

    elif original_currency in [models.Currency.USD, models.Currency.EUR]:
        exchange_rate_model = get_latest_exchange_rate( # Usamos la función que ya existe en crud.py
            db,
            from_currency=original_currency,
            to_currency=models.Currency.VES,
            on_date=rate_date
        )
        if not exchange_rate_model:
            # En lugar de imprimir warnings aquí o retornar None y manejarlo afuera,
            # es más directo levantar una excepción que el llamador (sea el proceso masivo o el endpoint)
            # pueda manejar o dejar que se propague.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, # O 500 si se considera un error interno de configuración
                detail=(
                    f"OMITIDO: No hay tasa de cambio para {original_currency.value}->VES "
                    f"en o antes de {rate_date}. Por favor, registre una tasa."
                )
            )
        rate_applied_value = exchange_rate_model.rate
        calculated_amount_ves = round(original_amount * rate_applied_value, 2)
        return calculated_amount_ves, rate_applied_value
    else:
        # Moneda no soportada
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, # 501 Not Implemented o 400 Bad Request
            detail=f"OMITIDO: Moneda '{original_currency.value}' no soportada para conversión en el concepto de cargo."
        )

def _apply_scholarship(
    student: models.Student,
    amount_to_apply_scholarship_on: float
) -> float:
    """
    Aplica la beca de un estudiante a un monto dado.
    Retorna el monto final después de aplicar la beca.
    """
    final_amount_due_ves = amount_to_apply_scholarship_on
    if student.has_scholarship:
        if student.scholarship_percentage is not None and student.scholarship_percentage > 0:
            discount = round(final_amount_due_ves * (student.scholarship_percentage / 100), 2)
            final_amount_due_ves -= discount
        elif student.scholarship_fixed_amount is not None and student.scholarship_fixed_amount > 0:
            # Asumimos que scholarship_fixed_amount es en VES o aplicable directo
            final_amount_due_ves -= student.scholarship_fixed_amount
        final_amount_due_ves = round(max(0, final_amount_due_ves), 2)
    return final_amount_due_ves


def run_generate_recurring_charges_process(
    db: Session,
    target_year: int,
    target_month: int,
    issue_date_override: Optional[date] = None,
    due_date_override: Optional[date] = None,
    specific_charge_concept_ids: Optional[List[int]] = None
) -> Dict[str, any]:

    warnings_list = []
    errors_list = [] 
    charges_created_count = 0
    students_processed_count = 0
    # NUEVO: Para llevar un registro de los resultados de la aplicación de crédito
    credit_applications_summary_list = [] 
    
    # 1. Determinar Fechas Clave (sin cambios)
    # ...
    try:
        charge_issue_date = issue_date_override if issue_date_override else date(target_year, target_month, 1)
        # ... (resto de la lógica de fechas) ...
        if due_date_override: # Esta parte de la lógica de fechas estaba incompleta en mi copia, la completo
            charge_due_date = due_date_override
        else:
            school_config = get_school_configuration(db)
            payment_day = school_config.payment_due_day if school_config and school_config.payment_due_day else 5
            _, last_day_of_month = calendar.monthrange(target_year, target_month)
            actual_due_day = min(payment_day, last_day_of_month)
            charge_due_date = date(target_year, target_month, actual_due_day)
    except ValueError as e:
        # ... (manejo de error de fecha) ...
        return {
            "message": "Proceso de generación de cargos falló debido a fechas inválidas.",
            "target_period": f"{target_month:02d}-{target_year}",
            "students_processed": 0,
            "charges_created": 0,
            "warnings_and_omissions": [],
            "errors": [f"Error al determinar fechas para {target_month}-{target_year}: {e}"],
            "credit_applications_summary": [] # Incluir el nuevo campo
        }


    # 2. Obtener Conceptos de Cargo a Procesar (sin cambios)
    # ...
    query_charge_concepts = db.query(models.ChargeConcept).filter(
        models.ChargeConcept.is_active == True,
        models.ChargeConcept.default_frequency == models.ChargeFrequency.MENSUAL
    )
    if specific_charge_concept_ids:
        query_charge_concepts = query_charge_concepts.filter(models.ChargeConcept.id.in_(specific_charge_concept_ids))
    applicable_charge_concepts = query_charge_concepts.all()

    if not applicable_charge_concepts:
        warnings_list.append(f"No se encontraron conceptos de cargo mensuales activos para procesar (o los IDs especificados no son válidos/activos/mensuales).")


    # 3. Obtener Estudiantes Activos (sin cambios)
    # ...
    active_students = db.query(models.Student).options(joinedload(models.Student.representative)).filter(models.Student.is_active == True).all() # Añadido joinedload para representative
    if not active_students:
        return {
            "message": "Proceso de generación de cargos completado. No se encontraron estudiantes activos.",
            "target_period": f"{target_month:02d}-{target_year}",
            "students_processed": 0,
            "charges_created": 0,
            "warnings_and_omissions": ["No se encontraron estudiantes activos para procesar."],
            "errors": None,
            "credit_applications_summary": [] # Incluir el nuevo campo
        }

    # 4. Iterar y Crear Cargos Aplicados
    processed_representatives_for_credit_application = set() # Para no procesar el crédito del mismo representante múltiples veces si tiene varios estudiantes

    for student in active_students:
        students_processed_count += 1
        student_charges_created_this_run = 0 # Contador de cargos creados para este estudiante en esta corrida

        for charge_concept in applicable_charge_concepts:
            # ... (lógica existente para verificar aplicabilidad, duplicados, conversión de moneda, becas)
            # ... (y creación de applied_charge_schema_in) ...
            # Simulo la parte interna del bucle que ya tienes:
            if charge_concept.applicable_grade_level_id is not None and \
               charge_concept.applicable_grade_level_id != student.grade_level_id:
                continue 
            
            start_of_month = date(target_year, target_month, 1)
            # ... (lógica de end_of_month)
            if target_month == 12:
                end_of_month = date(target_year + 1, 1, 1) - timedelta(days=1)
            else:
                end_of_month = date(target_year, target_month + 1, 1) - timedelta(days=1)


            existing_applied_charge = db.query(models.AppliedCharge).filter(
                models.AppliedCharge.student_id == student.id,
                models.AppliedCharge.charge_concept_id == charge_concept.id,
                models.AppliedCharge.issue_date >= start_of_month,
                models.AppliedCharge.issue_date <= end_of_month,
                models.AppliedCharge.status != models.AppliedChargeStatus.CANCELLED
            ).first()

            if existing_applied_charge:
                warnings_list.append(
                    f"Cargo duplicado omitido para Estudiante ID {student.id}, Concepto ID {charge_concept.id} para {target_month}-{target_year}."
                )
                continue

            try:
                amount_after_conversion_ves, rate_applied_value = _calculate_converted_amount_ves(
                    db=db,
                    original_amount=charge_concept.default_amount,
                    original_currency=charge_concept.default_amount_currency,
                    rate_date=charge_issue_date
                )
                final_amount_due_ves = _apply_scholarship(
                    student=student,
                    amount_to_apply_scholarship_on=amount_after_conversion_ves
                )
            except HTTPException as e:
                error_detail = f"Error al pre-calcular cargo para Estudiante ID {student.id}, Concepto '{charge_concept.name}': {e.detail}"
                errors_list.append(error_detail)
                warnings_list.append(error_detail)
                continue

            applied_charge_schema_in = schemas.AppliedChargeCreate(
                student_id=student.id,
                charge_concept_id=charge_concept.id,
                description=f"{charge_concept.name} - {calendar.month_name[target_month]} {target_year}",
                issue_date=charge_issue_date,
                due_date=charge_due_date,
                status=models.AppliedChargeStatus.PENDING,
                amount_due_ves=final_amount_due_ves,
                original_concept_amount=charge_concept.default_amount,
                original_concept_currency=charge_concept.default_amount_currency,
                exchange_rate_applied=rate_applied_value
            )
            
            try:
                # create_applied_charge hace commit internamente. Esto está bien.
                new_charge = create_applied_charge(db=db, applied_charge_in=applied_charge_schema_in)
                if new_charge:
                    charges_created_count += 1
                    student_charges_created_this_run +=1
            except Exception as e_create:
                errors_list.append(
                    f"Error al crear cargo para Estudiante ID {student.id}, Concepto '{charge_concept.name}': {str(e_create)}"
                )
        # FIN DEL BUCLE DE CHARGE_CONCEPTS PARA UN ESTUDIANTE

        # --- NUEVA SECCIÓN: Aplicar Crédito Disponible del Representante ---
        # Se ejecuta después de que todos los cargos del mes para ESE estudiante se hayan intentado crear (y commiteado individualmente).
        # Solo procesamos el crédito para un representante una vez por corrida del proceso masivo.
        if student.representative_id and student.representative_id not in processed_representatives_for_credit_application:
            # Verificamos si se crearon cargos para este estudiante en esta corrida o si ya tenía cargos pendientes
            # Esto es para optimizar y no llamar a apply_representative_credit si no hay nada nuevo o pendiente relevante.
            # Sin embargo, la función apply_representative_credit_to_pending_charges ya verifica si hay cargos pendientes.
            # Así que podemos llamarla directamente.

            warnings_list.append(f"INFO: Intentando aplicar saldo a favor para representante ID {student.representative_id} (asociado al estudiante ID {student.id}).")
            try:
                # Llamamos a la función que implementamos en el paso anterior
                credit_application_result = apply_representative_credit_to_pending_charges(
                    db=db,
                    representative_id=student.representative_id
                )
                # Guardamos el resumen de esta aplicación de crédito
                summary_entry = {
                    "representative_id": student.representative_id,
                    "message": credit_application_result.get("message"),
                    "allocations_count": len(credit_application_result.get("allocations_made", [])),
                    "remaining_credit": credit_application_result.get("remaining_credit_after_process")
                }
                credit_applications_summary_list.append(summary_entry)

                if credit_application_result.get("allocations_made"):
                     warnings_list.append(
                        f"INFO: Saldo a favor aplicado para representante ID {student.representative_id}. "
                        f"Asignaciones realizadas: {len(credit_application_result['allocations_made'])}. "
                        f"Nuevo saldo a favor: {credit_application_result.get('remaining_credit_after_process', 'N/A')}"
                    )

            except HTTPException as e_http_credit: # Captura errores HTTP (ej. 500) de la función de crédito
                errors_list.append(
                    f"Error (HTTP {e_http_credit.status_code}) al aplicar saldo a favor para representante ID {student.representative_id}: {e_http_credit.detail}"
                )
            except Exception as e_credit: # Captura cualquier otro error inesperado
                 errors_list.append(
                    f"Error inesperado al aplicar saldo a favor para representante ID {student.representative_id}: {str(e_credit)}"
                )
            finally:
                processed_representatives_for_credit_application.add(student.representative_id)
    
    # FIN DEL BUCLE DE ESTUDIANTES

    final_summary = {
        "message": "Proceso de generación de cargos y aplicación de saldos a favor completado.",
        "target_period": f"{target_month:02d}-{target_year}",
        "students_processed": students_processed_count,
        "charges_created": charges_created_count,
        "warnings_and_omissions": warnings_list,
        "errors": errors_list if errors_list else None,
        "credit_applications_summary": credit_applications_summary_list # Añadimos el resumen de la aplicación de créditos
    }

    return final_summary


def create_payment(db: Session, payment_in: schemas.PaymentCreate) -> models.Payment:
    db_representative = get_representative(db, representative_id=payment_in.representative_id) #
    if not db_representative:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Representante con ID {payment_in.representative_id} no encontrado."
        )

    amount_paid_original_currency = payment_in.amount_paid
    currency_paid = payment_in.currency_paid
    payment_date = payment_in.payment_date # Usaremos esta consistentemente
    
    exchange_rate_value: Optional[float] = None # Tasa de (moneda del pago -> VES) el día del pago
    amount_paid_ves_equivalent: float

    if currency_paid == models.Currency.VES:
        amount_paid_ves_equivalent = amount_paid_original_currency
    elif currency_paid in [models.Currency.USD, models.Currency.EUR]:
        rate_model = get_latest_exchange_rate( #
            db,
            from_currency=currency_paid,
            to_currency=models.Currency.VES,
            on_date=payment_date # Tasa del día del pago
        )
        if not rate_model:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No se encontró tasa de cambio para {currency_paid.value} a VES en o antes de {payment_date}. Por favor, registre una tasa."
            )
        exchange_rate_value = rate_model.rate
        amount_paid_ves_equivalent = round(amount_paid_original_currency * exchange_rate_value, 2)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Moneda de pago '{currency_paid.value}' no soportada para conversión."
        )

    total_ves_actually_allocated_by_user = 0.0
    allocations_to_process: List[Dict] = [] 

    if payment_in.allocations_details:
        for alloc_detail_in in payment_in.allocations_details:
            db_applied_charge = get_applied_charge(db, applied_charge_id=alloc_detail_in.applied_charge_id) #
            if not db_applied_charge:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Cargo aplicado con ID {alloc_detail_in.applied_charge_id} no encontrado."
                )
            if db_applied_charge.student.representative_id != payment_in.representative_id: #
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"El cargo aplicado ID {alloc_detail_in.applied_charge_id} no pertenece a un estudiante del representante ID {payment_in.representative_id}."
                )
            if db_applied_charge.status == models.AppliedChargeStatus.PAID: #
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"El cargo aplicado ID {alloc_detail_in.applied_charge_id} ya está completamente pagado."
                )
            if db_applied_charge.status == models.AppliedChargeStatus.CANCELLED: #
                 raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"El cargo aplicado ID {alloc_detail_in.applied_charge_id} está cancelado y no puede recibir pagos."
                )

            amount_to_allocate_in_payment_currency = alloc_detail_in.amount_to_allocate
            amount_to_allocate_in_ves: float

            if currency_paid == models.Currency.VES:
                amount_to_allocate_in_ves = amount_to_allocate_in_payment_currency
            else:
                if not exchange_rate_value: 
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Tasa de cambio (del pago) no disponible para procesar asignaciones.")
                amount_to_allocate_in_ves = round(amount_to_allocate_in_payment_currency * exchange_rate_value, 2)
            
            # --- MODIFICACIÓN CLAVE AQUÍ ---
            balance_due_ves_for_charge: float
            if db_applied_charge.is_indexed:
                pending_debt_original_curr = db_applied_charge.amount_due_original_currency - db_applied_charge.amount_paid_original_currency_equivalent
                
                # Necesitamos la tasa de la moneda original del CARGO a VES, en la FECHA DEL PAGO
                rate_model_charge_currency_to_ves = get_latest_exchange_rate(
                    db,
                    from_currency=db_applied_charge.original_concept_currency,
                    to_currency=models.Currency.VES,
                    on_date=payment_date # Fecha del pago actual
                )
                if not rate_model_charge_currency_to_ves:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"No se encontró tasa de cambio para la moneda del cargo ({db_applied_charge.original_concept_currency.value}) a VES en la fecha del pago ({payment_date}) para validar asignación al cargo ID {db_applied_charge.id}."
                    )
                current_rate_for_charge_debt = rate_model_charge_currency_to_ves.rate
                balance_due_ves_for_charge = round(pending_debt_original_curr * current_rate_for_charge_debt, 2)
            else: # Cargo originalmente en VES
                balance_due_ves_for_charge = round(db_applied_charge.amount_due_ves_at_emission - db_applied_charge.amount_paid_ves, 2)
            # --- FIN DE MODIFICACIÓN CLAVE ---

            if amount_to_allocate_in_ves > balance_due_ves_for_charge + 0.001: #
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"El monto a asignar ({formatCurrency(amount_to_allocate_in_ves, 'VES')}) para el cargo ID {db_applied_charge.id} " \
                           f"excede su saldo pendiente ({formatCurrency(balance_due_ves_for_charge, 'VES')}). " \
                           f"Monto original de asignación fue {formatCurrency(amount_to_allocate_in_payment_currency, currency_paid.value)}."
                )
            
            total_ves_actually_allocated_by_user += amount_to_allocate_in_ves
            allocations_to_process.append({
                "applied_charge_to_update": db_applied_charge,
                "amount_allocated_ves": amount_to_allocate_in_ves,
                # Guardamos el monto en la moneda original de la asignación para usarlo después
                "amount_to_allocate_original_currency": amount_to_allocate_in_payment_currency 
            })

    total_ves_actually_allocated_by_user = round(total_ves_actually_allocated_by_user, 2)

    if total_ves_actually_allocated_by_user > amount_paid_ves_equivalent + 0.001: #
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El total especificado para asignar a cargos ({formatCurrency(total_ves_actually_allocated_by_user, 'VES')}) " \
                   f"excede el monto total del pago ({formatCurrency(amount_paid_ves_equivalent, 'VES')})."
        )
    
    db_payment = models.Payment(
        representative_id=payment_in.representative_id,
        payment_date=payment_date,
        amount_paid=amount_paid_original_currency,
        currency_paid=currency_paid,
        exchange_rate_applied=exchange_rate_value,
        amount_paid_ves_equivalent=amount_paid_ves_equivalent,
        payment_method=payment_in.payment_method,
        reference_number=payment_in.reference_number,
        receipt_image_url=payment_in.receipt_image_url,
        notes=payment_in.notes
    )
    db.add(db_payment)
    db.flush() 

    for alloc_processed in allocations_to_process:
        db_applied_charge_to_update: models.AppliedCharge = alloc_processed["applied_charge_to_update"]
        amount_allocated_ves_for_this_charge: float = alloc_processed["amount_allocated_ves"]
        # Recuperamos el monto en la moneda original de la asignación
        amount_allocated_in_payment_currency_for_this_charge = alloc_processed["amount_to_allocate_original_currency"]


        db_payment_allocation = models.PaymentAllocation(
            payment_id=db_payment.id,
            applied_charge_id=db_applied_charge_to_update.id,
            amount_allocated_ves=amount_allocated_ves_for_this_charge
        )
        db.add(db_payment_allocation)

        db_applied_charge_to_update.amount_paid_ves = round(
            db_applied_charge_to_update.amount_paid_ves + amount_allocated_ves_for_this_charge, 2
        )

        # Actualizar amount_paid_original_currency_equivalent en AppliedCharge
        if db_applied_charge_to_update.is_indexed:
            # Si la moneda del pago ES LA MISMA que la moneda original del cargo indexado
            if payment_in.currency_paid == db_applied_charge_to_update.original_concept_currency:
                db_applied_charge_to_update.amount_paid_original_currency_equivalent = round(
                    db_applied_charge_to_update.amount_paid_original_currency_equivalent + amount_allocated_in_payment_currency_for_this_charge, 2
                )
            else:
                # La moneda del pago es DIFERENTE a la moneda original del cargo indexado.
                # Necesitamos convertir amount_allocated_ves_for_this_charge a la moneda original del cargo.
                # Para esto, usamos la tasa (moneda_original_del_cargo -> VES) del DÍA DEL PAGO.
                rate_model_charge_orig_to_ves_at_payment_date = get_latest_exchange_rate(
                    db,
                    from_currency=db_applied_charge_to_update.original_concept_currency,
                    to_currency=models.Currency.VES,
                    on_date=payment_date
                )
                if not rate_model_charge_orig_to_ves_at_payment_date or not rate_model_charge_orig_to_ves_at_payment_date.rate > 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"No hay tasa de {db_applied_charge_to_update.original_concept_currency.value}->VES para fecha {payment_date} para calcular equivalencia de pago para el cargo ID {db_applied_charge_to_update.id}."
                    )
                tasa_cargo_orig_a_ves_dia_pago = rate_model_charge_orig_to_ves_at_payment_date.rate
                
                amount_equivalent_in_original_charge_currency = round(amount_allocated_ves_for_this_charge / tasa_cargo_orig_a_ves_dia_pago, 2)
                db_applied_charge_to_update.amount_paid_original_currency_equivalent = round(
                    db_applied_charge_to_update.amount_paid_original_currency_equivalent + amount_equivalent_in_original_charge_currency, 2
                )
        else: # Cargo originalmente en VES
            db_applied_charge_to_update.amount_paid_original_currency_equivalent = db_applied_charge_to_update.amount_paid_ves


        # Actualizar estado del cargo (PAID, PARTIALLY_PAID)
        # La comparación para PAID debe ser precisa.
        if db_applied_charge_to_update.is_indexed:
            # Comparamos en la moneda original del cargo
            if db_applied_charge_to_update.amount_paid_original_currency_equivalent >= (db_applied_charge_to_update.amount_due_original_currency - 0.001): # Margen para flotantes
                db_applied_charge_to_update.status = models.AppliedChargeStatus.PAID
            elif db_applied_charge_to_update.amount_paid_original_currency_equivalent > 0.001: # Si se ha pagado algo
                db_applied_charge_to_update.status = models.AppliedChargeStatus.PARTIALLY_PAID
        else: # Cargo en VES
            # Comparamos en VES
            if db_applied_charge_to_update.amount_paid_ves >= (db_applied_charge_to_update.amount_due_ves_at_emission - 0.001): # Margen para flotantes
                db_applied_charge_to_update.status = models.AppliedChargeStatus.PAID
            elif db_applied_charge_to_update.amount_paid_ves > 0.001: # Si se ha pagado algo
                db_applied_charge_to_update.status = models.AppliedChargeStatus.PARTIALLY_PAID
        
        db.add(db_applied_charge_to_update)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        # Log e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al guardar el pago y sus asignaciones: {str(e)}")

    db.refresh(db_payment)
    # Es importante que get_payment cargue las relaciones (allocations, etc.) para la respuesta.
    return get_payment(db, payment_id=db_payment.id) 

# Helper para formatear moneda en mensajes de error del backend
def formatCurrency(amount, currency_code):
    # Esta es una simplificación. En un entorno real, podrías usar una librería
    # o una lógica más robusta si necesitas formatos específicos.
    return f"{amount:,.2f} {currency_code}"


def get_payment(db: Session, payment_id: int) -> Optional[models.Payment]:
    return db.query(models.Payment).options(
        joinedload(models.Payment.representative), # Carga el representante asociado al pago
        joinedload(models.Payment.allocations).options( # Carga la lista de asignaciones del pago
            joinedload(models.PaymentAllocation.applied_charge).options( # Para cada asignación, carga el AppliedCharge
                joinedload(models.AppliedCharge.student).options( # Y dentro de ese AppliedCharge, carga su Student
                    joinedload(models.Student.representative) # Opcional: cargar el representante del estudiante si lo necesitas aquí
                ),
                joinedload(models.AppliedCharge.charge_concept).options( # Y también carga su ChargeConcept
                    joinedload(models.ChargeConcept.grade_level) # Opcional: cargar el nivel del concepto si lo necesitas aquí
                )
            )
        )
    ).filter(models.Payment.id == payment_id).first()
    
    
def get_payments_for_representative(
    db: Session, 
    representative_id: int, 
    skip: int = 0, 
    limit: int = 100,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> List[models.Payment]:
    query = db.query(models.Payment).filter(models.Payment.representative_id == representative_id)
    if start_date:
        query = query.filter(models.Payment.payment_date >= start_date)
    if end_date:
        query = query.filter(models.Payment.payment_date <= end_date)
    
    return query.order_by(models.Payment.payment_date.desc(), models.Payment.created_at.desc())\
        .offset(skip).limit(limit).all()
        

def get_payments(
    db: Session,
    skip: int = 0,
    limit: int = 10,
    representative_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    payment_method: Optional[str] = None,
    currency_paid: Optional[models.Currency] = None
) -> Dict[str, any]:

    query = db.query(models.Payment).options(
        joinedload(models.Payment.representative) 
    )

    # Aplicar filtros
    if representative_id is not None:
        query = query.filter(models.Payment.representative_id == representative_id)
    if start_date:
        query = query.filter(models.Payment.payment_date >= start_date)
    if end_date:
        query = query.filter(models.Payment.payment_date <= end_date)
    if payment_method:
        query = query.filter(models.Payment.payment_method.ilike(f"%{payment_method}%"))
    if currency_paid:
        query = query.filter(models.Payment.currency_paid == currency_paid)

    # Calcular el total ANTES de aplicar ordenamiento y paginación
    total = query.count() # ESTO ES CLAVE

    # Aplicar ordenamiento
    query = query.order_by(models.Payment.payment_date.desc(), models.Payment.created_at.desc())

    # Aplicar paginación
    items = query.offset(skip).limit(limit).all()

    # Calcular información de paginación
    current_page = (skip // limit) + 1 if limit > 0 else 1
    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)

    # ASEGÚRATE DE QUE SIEMPRE SE DEVUELVA ESTE DICCIONARIO
    return {
        "items": items, # items será una lista vacía si no hay resultados, lo cual es correcto
        "total": total, # total será 0 si no hay resultados, lo cual es correcto
        "page": current_page,
        "pages": pages,
        "limit": limit
    }


def get_unallocated_amount_for_payment(db: Session, payment_id: int) -> float:
    """
    Calcula el monto no asignado (en VES) para un pago específico.
    """
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        return 0.0  # O podrías lanzar un error si el pago no se encuentra

    total_allocated_query = db.query(sql_func.sum(models.PaymentAllocation.amount_allocated_ves))\
        .filter(models.PaymentAllocation.payment_id == payment_id)
    
    total_allocated = total_allocated_query.scalar() or 0.0
        
    return round(payment.amount_paid_ves_equivalent - total_allocated, 2)


def get_representative_total_available_credit_ves(db: Session, representative_id: int) -> float:
    """
    Calcula el crédito total disponible (saldo a favor en VES) para un representante.
    Suma los montos no asignados de todos los pagos del representante.
    """
    representative_payments = db.query(models.Payment).filter(models.Payment.representative_id == representative_id).all()
    
    total_available_credit = 0.0
    for payment in representative_payments:
        unallocated_for_this_payment = get_unallocated_amount_for_payment(db, payment.id)
        if unallocated_for_this_payment > 0:
            total_available_credit += unallocated_for_this_payment
            
    return round(total_available_credit, 2)
    
    
def apply_representative_credit_to_pending_charges(db: Session, representative_id: int) -> Dict[str, any]:
    """
    Aplica el saldo a favor de un representante a sus cargos pendientes (o parcialmente pagados),
    creando los registros PaymentAllocation necesarios.
    """
    # 1. Obtener el crédito total disponible del representante
    available_credit_total_representative = get_representative_total_available_credit_ves(db, representative_id)

    if available_credit_total_representative <= 0.001: # Usar un pequeño epsilon para comparación de flotantes
        return {"message": "El representante no tiene saldo a favor disponible para aplicar.", "allocations_made": [], "remaining_credit": 0.0}

    # 2. Obtener los cargos pendientes o parcialmente pagados del representante
    #    (para todos sus estudiantes), ordenados por fecha de vencimiento (más antiguos primero).
    pending_applied_charges = db.query(models.AppliedCharge)\
        .join(models.Student, models.AppliedCharge.student_id == models.Student.id)\
        .filter(models.Student.representative_id == representative_id)\
        .filter(models.AppliedCharge.status.in_([
            models.AppliedChargeStatus.PENDING,
            models.AppliedChargeStatus.PARTIALLY_PAID,
            models.AppliedChargeStatus.OVERDUE
        ]))\
        .order_by(models.AppliedCharge.due_date.asc(), models.AppliedCharge.issue_date.asc())\
        .all()

    if not pending_applied_charges:
        return {"message": "El representante no tiene cargos pendientes para aplicar saldo a favor.", "allocations_made": [], "remaining_credit": available_credit_total_representative}

    # 3. Obtener los pagos del representante que tienen fondos sin asignar, ordenados por fecha (más antiguos primero)
    #    Estos son los pagos que "financiarán" la aplicación del crédito.
    
    # Primero obtenemos todos los pagos del representante
    representative_payments_all = db.query(models.Payment)\
        .filter(models.Payment.representative_id == representative_id)\
        .order_by(models.Payment.payment_date.asc(), models.Payment.created_at.asc())\
        .all()

    # Luego filtramos en Python aquellos que realmente tienen fondos no asignados
    payments_with_available_funds = []
    for p in representative_payments_all:
        unallocated_on_this_payment = get_unallocated_amount_for_payment(db, p.id)
        if unallocated_on_this_payment > 0.001:
            payments_with_available_funds.append({
                "payment_obj": p,
                "unallocated_amount_ves": unallocated_on_this_payment
            })
            
    if not payments_with_available_funds:
        # Esto sería extraño si available_credit_total_representative > 0, pero es una salvaguarda.
        return {"message": "No se encontraron pagos específicos con fondos no asignados, aunque se calculó crédito.", 
                "allocations_made": [], "remaining_credit": available_credit_total_representative}

    # 4. Iterar y aplicar
    allocations_made_summary = []
    current_credit_being_applied = available_credit_total_representative # Copia para irla reduciendo
    payment_source_idx = 0 # Para iterar sobre payments_with_available_funds

    for charge_to_pay in pending_applied_charges:
        if current_credit_being_applied <= 0.001: # No más crédito total
            break
        if payment_source_idx >= len(payments_with_available_funds): # No más fuentes de pago
            break

        charge_balance_due = round(charge_to_pay.amount_due_ves_at_emission - charge_to_pay.amount_paid_ves, 2)
        if charge_balance_due <= 0.001: # El cargo ya está pagado (o casi)
            continue

        # Aplicar a este charge_to_pay usando los payments_with_available_funds
        while charge_balance_due > 0.001 and current_credit_being_applied > 0.001 and payment_source_idx < len(payments_with_available_funds):
            current_payment_source = payments_with_available_funds[payment_source_idx]
            
            amount_from_this_payment_source = current_payment_source["unallocated_amount_ves"]

            amount_to_allocate_now = min(charge_balance_due, amount_from_this_payment_source, current_credit_being_applied)
            amount_to_allocate_now = round(amount_to_allocate_now, 2)

            if amount_to_allocate_now <= 0.001: # Nada que asignar desde esta fuente o para este cargo
                # Esto puede pasar si el remanente de un pago es muy pequeño
                # o si el crédito total se agotó con un cargo anterior.
                # Si amount_from_this_payment_source se agotó, pasamos al siguiente pago.
                if amount_from_this_payment_source <= 0.001:
                    payment_source_idx += 1
                break # Salir del while para este charge_to_pay si no hay más que asignar ahora

            # Crear el PaymentAllocation
            db_payment_allocation = models.PaymentAllocation(
                payment_id=current_payment_source["payment_obj"].id,
                applied_charge_id=charge_to_pay.id,
                amount_allocated_ves=amount_to_allocate_now
            )
            db.add(db_payment_allocation)

            # Actualizar el AppliedCharge
            charge_to_pay.amount_paid_ves = round(charge_to_pay.amount_paid_ves + amount_to_allocate_now, 2)
            if charge_to_pay.amount_paid_ves >= (charge_to_pay.amount_due_ves_at_emission - 0.001):
                charge_to_pay.status = models.AppliedChargeStatus.PAID
            else: # Sigue siendo > 0 porque amount_to_allocate_now > 0
                charge_to_pay.status = models.AppliedChargeStatus.PARTIALLY_PAID
            db.add(charge_to_pay)

            allocations_made_summary.append({
                "payment_id_source": current_payment_source["payment_obj"].id,
                "applied_charge_id_target": charge_to_pay.id,
                "amount_allocated": amount_to_allocate_now,
                "charge_new_status": charge_to_pay.status.value,
                "charge_new_amount_paid": charge_to_pay.amount_paid_ves
            })

            # Actualizar los saldos
            current_credit_being_applied = round(current_credit_being_applied - amount_to_allocate_now, 2)
            charge_balance_due = round(charge_balance_due - amount_to_allocate_now, 2)
            current_payment_source["unallocated_amount_ves"] = round(amount_from_this_payment_source - amount_to_allocate_now, 2)

            if current_payment_source["unallocated_amount_ves"] <= 0.001:
                payment_source_idx += 1 # Moverse al siguiente pago fuente si este se agotó

    # 5. Commit de la transacción
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        # Considera loggear el error 'e' para un diagnóstico más detallado
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocurrió un error durante la aplicación automática de crédito: {str(e)}"
        )
    
    final_remaining_credit = get_representative_total_available_credit_ves(db, representative_id) # Recalcular para ser precisos

    return {
        "message": "Proceso de aplicación automática de saldo a favor completado.",
        "allocations_made": allocations_made_summary,
        "remaining_credit_after_process": final_remaining_credit
    }    


def get_representative_account_statement(db: Session, representative_id: int) -> Optional[schemas.RepresentativeAccountStatementResponse]:
    # 1. Obtener información del representante
    db_representative = get_representative(db, representative_id=representative_id) #
    if not db_representative:
        return None

    today = date.today() #

    # 1.1 Obtener la tasa de cambio USD -> VES más reciente para cálculos "a hoy"
    usd_rate_model = get_latest_exchange_rate(db, from_currency=models.Currency.USD, on_date=today) #
    current_usd_to_ves_rate = usd_rate_model.rate if usd_rate_model and usd_rate_model.rate else None
    
    if current_usd_to_ves_rate is None:
        # Considera cómo manejar esto: ¿lanzar error o permitir N/A en campos calculados?
        # Por ahora, permitiremos N/A si la tasa no está, y el frontend mostrará advertencia.
        print(f"ADVERTENCIA: No se encontró tasa USD->VES actual para el estado de cuenta del representante ID {representative_id}. Los cálculos indexados pueden no estar disponibles.")

    # 2. Obtener todos los cargos aplicados para los estudiantes de este representante
    #    Cargamos relaciones necesarias para los detalles.
    representative_applied_charges = ( 
        db.query(models.AppliedCharge)
        .join(models.Student, models.AppliedCharge.student_id == models.Student.id)
        .filter(models.Student.representative_id == representative_id)
        .options(
            joinedload(models.AppliedCharge.student), # Para student_name
            joinedload(models.AppliedCharge.charge_concept) # Para charge_concept_name y moneda original
        )
        .order_by(models.AppliedCharge.issue_date.asc(), models.AppliedCharge.created_at.asc())
        .all()
    )
        
    # 3. Obtener todos los pagos realizados por este representante
    #    Cargamos las asignaciones (allocations) para cada pago.
    representative_payments = (
        db.query(models.Payment)
        .filter(models.Payment.representative_id == representative_id)
        .options(joinedload(models.Payment.allocations)) # Cargar las asignaciones de cada pago
        .order_by(models.Payment.payment_date.asc(), models.Payment.created_at.asc())
        .all()
    )

    # 4. Calcular los totales para el resumen financiero (RepresentativeAccountSummarySchema)
    total_charges_ves_emission_val = sum(charge.amount_due_ves_at_emission for charge in representative_applied_charges) #
    total_payments_received_ves_val = sum(payment.amount_paid_ves_equivalent for payment in representative_payments) #
    
    # Saldos a favor explícito (ya lo tenías)
    explicit_available_credit_ves_val = get_representative_total_available_credit_ves(db, representative_id) #

    # --- Nuevos cálculos para el resumen en USD y balance indexado ---
    total_due_original_currency_usd_sum = 0.0
    total_paid_original_currency_equivalent_usd_sum = 0.0

    for charge in representative_applied_charges:
        if charge.original_concept_currency == models.Currency.USD:
            total_due_original_currency_usd_sum += charge.amount_due_original_currency
            total_paid_original_currency_equivalent_usd_sum += charge.amount_paid_original_currency_equivalent
        elif charge.is_indexed and charge.exchange_rate_applied_at_emission and charge.exchange_rate_applied_at_emission > 0:
            # Si hay otros cargos indexados (ej. EUR) y queremos un total USD generalizado,
            # necesitaríamos convertir su valor original a USD o su valor VES_emisión a USD_emisión.
            # Por simplicidad, la hoja de ruta se centró en "original_currency_usd", así que solo sumamos USD directos.
            # Si un cargo VES se considera parte del "total original USD", habría que convertirlo.
            # Vamos a asumir que "total_due_original_currency_usd" es la suma de la deuda que *era* originalmente USD.
            pass 

    current_balance_due_usd_val = round(total_due_original_currency_usd_sum - total_paid_original_currency_equivalent_usd_sum, 2)
    
    current_balance_due_ves_today_val = 0.0
    # Este es el balance total que se le cobraría hoy en VES.
    # Suma la deuda pendiente de cargos VES + deuda pendiente de cargos USD convertida a VES con tasa de hoy.
    for charge in representative_applied_charges:
        pending_debt_original_curr = charge.amount_due_original_currency - charge.amount_paid_original_currency_equivalent
        if charge.is_indexed and charge.original_concept_currency == models.Currency.USD:
            if current_usd_to_ves_rate:
                current_balance_due_ves_today_val += pending_debt_original_curr * current_usd_to_ves_rate
            else: # Si no hay tasa, no podemos sumar esta parte de la deuda indexada
                pass 
        elif not charge.is_indexed and charge.original_concept_currency == models.Currency.VES:
            # Para cargos VES, la deuda es directa (amount_due_ves_at_emission - amount_paid_ves)
            # o también (amount_due_original_currency - amount_paid_original_currency_equivalent) ya que son lo mismo
            current_balance_due_ves_today_val += pending_debt_original_curr 
            
    current_balance_due_ves_today_val = round(current_balance_due_ves_today_val, 2)


    explicit_available_credit_usd_equivalent_val = None
    if current_usd_to_ves_rate and current_usd_to_ves_rate > 0 and explicit_available_credit_ves_val is not None:
        explicit_available_credit_usd_equivalent_val = round(explicit_available_credit_ves_val / current_usd_to_ves_rate, 2)

    account_summary_data = schemas.RepresentativeAccountSummarySchema(
        total_charges_ves_emission=round(total_charges_ves_emission_val, 2),
        total_payments_received_ves=round(total_payments_received_ves_val, 2),
        explicit_available_credit_ves=round(explicit_available_credit_ves_val, 2),
        
        total_due_original_currency_usd=round(total_due_original_currency_usd_sum, 2) if total_due_original_currency_usd_sum is not None else None,
        total_paid_original_currency_equivalent_usd=round(total_paid_original_currency_equivalent_usd_sum, 2) if total_paid_original_currency_equivalent_usd_sum is not None else None,
        current_balance_due_usd=round(current_balance_due_usd_val, 2) if current_balance_due_usd_val is not None else None,
        current_balance_due_ves_today=current_balance_due_ves_today_val, # Ya redondeado
        explicit_available_credit_usd_equivalent=explicit_available_credit_usd_equivalent_val # Ya redondeado o None
    )

    # 5. Construir la lista de cargos detallados (DetailedChargeSchema)
    detailed_charges_list: List[schemas.DetailedChargeSchema] = []
    for charge in representative_applied_charges:
        student_name_val = f"{charge.student.first_name} {charge.student.last_name}" if charge.student else "N/A"
        charge_concept_name_val = charge.charge_concept.name if charge.charge_concept else "N/A"
        
        pending_debt_original_currency_val = round(charge.amount_due_original_currency - charge.amount_paid_original_currency_equivalent, 2)
        
        current_debt_ves_today_per_charge_val = 0.0
        if charge.is_indexed and charge.original_concept_currency == models.Currency.USD:
            if current_usd_to_ves_rate:
                current_debt_ves_today_per_charge_val = round(pending_debt_original_currency_val * current_usd_to_ves_rate, 2)
            else: # No hay tasa, la deuda en VES hoy para este cargo no se puede calcular con precisión
                current_debt_ves_today_per_charge_val = None # O algún valor indicativo
        elif not charge.is_indexed and charge.original_concept_currency == models.Currency.VES:
            # Para cargos originalmente en VES, la deuda es directa.
            # (amount_due_ves_at_emission - amount_paid_ves)
            # o equivalentemente (amount_due_original_currency - amount_paid_original_currency_equivalent)
            current_debt_ves_today_per_charge_val = pending_debt_original_currency_val
        
        detailed_charges_list.append(schemas.DetailedChargeSchema(
            id=charge.id,
            student_name=student_name_val,
            charge_concept_name=charge_concept_name_val,
            issue_date=charge.issue_date,
            due_date=charge.due_date,
            original_concept_amount=charge.original_concept_amount,
            original_concept_currency=charge.original_concept_currency,
            amount_due_original_currency=charge.amount_due_original_currency,
            amount_paid_original_currency_equivalent=charge.amount_paid_original_currency_equivalent,
            pending_debt_original_currency=pending_debt_original_currency_val,
            is_indexed=charge.is_indexed,
            status=charge.status,
            amount_due_ves_at_emission=charge.amount_due_ves_at_emission,
            amount_paid_ves=charge.amount_paid_ves,
            current_debt_ves_today_per_charge=current_debt_ves_today_per_charge_val if current_debt_ves_today_per_charge_val is not None else 0.0 # Default a 0 si no se pudo calcular
        ))

    # 6. Construir la lista de pagos detallados (DetailedPaymentSchema)
    detailed_payments_list: List[schemas.DetailedPaymentSchema] = []
    for payment in representative_payments:
        total_allocated_for_this_payment = sum(alloc.amount_allocated_ves for alloc in payment.allocations) if payment.allocations else 0.0
        unallocated_for_this_payment = payment.amount_paid_ves_equivalent - total_allocated_for_this_payment
        
        detailed_payments_list.append(schemas.DetailedPaymentSchema(
            id=payment.id,
            payment_date=payment.payment_date,
            amount_paid_original=payment.amount_paid,
            currency_paid_original=payment.currency_paid,
            amount_paid_ves_equivalent=payment.amount_paid_ves_equivalent,
            payment_method=payment.payment_method,
            reference_number=payment.reference_number,
            total_amount_allocated_ves=round(total_allocated_for_this_payment, 2),
            unallocated_remainder_ves=round(unallocated_for_this_payment, 2)
        ))

    # (Opcional: Si decides mantener la `transaction_history` original, la lógica iría aquí)
    # transaction_history_val = build_transaction_history(representative_applied_charges, representative_payments)

    # 7. Ensamblar la respuesta del estado de cuenta
    representative_info_schema = schemas.RepresentativeInfo.model_validate(db_representative) #

    statement = schemas.RepresentativeAccountStatementResponse(
        representative_info=representative_info_schema,
        statement_generation_date=today, #
        account_summary=account_summary_data,
        detailed_charges=detailed_charges_list,
        detailed_payments=detailed_payments_list
        # transaction_history=transaction_history_val # Si la mantienes
    )

    return statement
    

def create_invoice(db: Session, invoice_in: schemas.InvoiceCreate) -> models.Invoice:
    """
    Valida y crea un objeto Invoice en memoria a partir de los datos de entrada, pero NO hace commit.
    El commit es responsabilidad del servicio que orquesta la emisión.
    """
    # 1. Validar que el representante exista
    db_representative = get_representative(db, representative_id=invoice_in.representative_id)
    if not db_representative:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Representante con ID {invoice_in.representative_id} no encontrado.")

    # 2. Obtener la configuración de la escuela para el correlativo y datos snapshot
    school_config = get_school_configuration(db)
    if not school_config or not school_config.next_internal_invoice_reference or not school_config.school_rif:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="La configuración de la escuela (RIF, correlativo) no está establecida.")
    
    # 3. Generar el número de factura interno
    current_invoice_ref = school_config.next_internal_invoice_reference
    invoice_number = str(current_invoice_ref)
    if school_config.internal_invoice_reference_prefix:
        invoice_number = f"{school_config.internal_invoice_reference_prefix}{invoice_number}"

    # 4. Verificar si este número de factura ya existe (salvaguarda)
    if db.query(models.Invoice).filter(models.Invoice.invoice_number == invoice_number).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"El número de factura {invoice_number} ya existe. Verifique el correlativo en configuración.")

    # 5. Procesar los AppliedCharge y crear InvoiceItems
    invoice_items_to_create: List[models.InvoiceItem] = []
    total_subtotal_ves = 0.0
    total_iva_ves = 0.0
    processed_applied_charge_ids = set()

    if not invoice_in.applied_charge_ids:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Se debe proporcionar al menos un cargo aplicado para facturar.")

    for charge_id in invoice_in.applied_charge_ids:
        if charge_id in processed_applied_charge_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"El ID del cargo aplicado {charge_id} está duplicado en la solicitud.")
        
        applied_charge = get_applied_charge(db, applied_charge_id=charge_id)
        
        # Validaciones por cada cargo
        if not applied_charge:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Cargo Aplicado ID {charge_id} no encontrado.")
        if applied_charge.student.representative_id != invoice_in.representative_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cargo Aplicado ID {charge_id} no pertenece al representante especificado.")
        if applied_charge.invoice_id is not None:
            inv_num_temp = db.query(models.Invoice.invoice_number).filter(models.Invoice.id == applied_charge.invoice_id).scalar()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cargo Aplicado ID {charge_id} ya ha sido incluido en la factura {inv_num_temp or 'desconocida'}.")
        if applied_charge.status == models.AppliedChargeStatus.CANCELLED:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cargo Aplicado ID {charge_id} está cancelado y no puede ser facturado.")

        if not applied_charge.charge_concept:
             raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"El Cargo Aplicado ID {charge_id} no tiene un concepto de carga asociado, no se puede determinar el IVA.")

        # Snapshot de los datos del ítem
        iva_percentage_item = applied_charge.charge_concept.iva_percentage
        item_unit_price = applied_charge.amount_due_ves_at_emission
        item_quantity = 1 # Asumimos cantidad 1 para cada cargo aplicado
        item_subtotal = round(item_unit_price * item_quantity, 2)
        item_iva = round(item_subtotal * iva_percentage_item, 2)
        
        invoice_item = models.InvoiceItem(
            applied_charge_id=charge_id,
            description=f"{applied_charge.charge_concept.name} - {applied_charge.description or 'Detalle del cargo'}",
            quantity=item_quantity,
            unit_price_ves=item_unit_price,
            iva_percentage=iva_percentage_item,
            item_subtotal_ves=item_subtotal,
            item_iva_ves=item_iva,
            item_total_ves=round(item_subtotal + item_iva, 2)
        )
        invoice_items_to_create.append(invoice_item)
        
        total_subtotal_ves += item_subtotal
        total_iva_ves += item_iva
        processed_applied_charge_ids.add(charge_id)

    total_amount_invoice_ves = round(total_subtotal_ves + total_iva_ves, 2)

    # 6. Determinar datos del receptor (con override opcional para factura libre)
    final_bill_to_name = invoice_in.bill_to_name or f"{db_representative.first_name} {db_representative.last_name}"
    final_bill_to_rif_or_cedula = invoice_in.bill_to_rif_or_cedula or (db_representative.rif or db_representative.cedula)
    final_bill_to_address = invoice_in.bill_to_address or db_representative.address

    if not final_bill_to_address: # La dirección fiscal es obligatoria por ley
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La dirección fiscal del receptor de la factura es obligatoria y no se ha proporcionado.")

    # 7. Crear la instancia de la Factura (Invoice) en memoria
    db_invoice = models.Invoice(
        invoice_number=invoice_number,
        issue_date=invoice_in.issue_date,
        representative_id=invoice_in.representative_id,
        status=models.InvoiceStatus.PENDING_EMISSION, # Estado inicial
        emission_type=invoice_in.emission_type,
        
        # Datos Snapshot de la Escuela
        school_name_snapshot=school_config.school_name,
        school_rif_snapshot=school_config.school_rif,
        school_address_snapshot=school_config.school_address,
        school_phone_snapshot=school_config.school_phone,
        
        # Datos Snapshot del Receptor
        representative_name_snapshot=final_bill_to_name,
        representative_rif_or_cedula_snapshot=final_bill_to_rif_or_cedula,
        representative_address_snapshot=final_bill_to_address,
        
        # Totales calculados
        subtotal_ves=total_subtotal_ves,
        total_iva_ves=total_iva_ves,
        total_amount_ves=total_amount_invoice_ves,

        items=invoice_items_to_create # SQLAlchemy asociará los ítems
    )

    return db_invoice


def get_invoice(db: Session, invoice_id: int) -> Optional[models.Invoice]:
    return db.query(models.Invoice).options(
        joinedload(models.Invoice.representative),
        joinedload(models.Invoice.items).joinedload(models.InvoiceItem.applied_charge).joinedload(models.AppliedCharge.charge_concept)
    ).filter(models.Invoice.id == invoice_id).first()


def get_invoices(
    db: Session, 
    skip: int = 0, 
    limit: int = 100,
    representative_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    status: Optional[InvoiceStatus] = None,
    invoice_number: Optional[str] = None
) -> Dict[str, Any]:
    query = db.query(models.Invoice).options(joinedload(models.Invoice.representative))
    
    if representative_id is not None:
        query = query.filter(models.Invoice.representative_id == representative_id)
    if start_date:
        query = query.filter(models.Invoice.issue_date >= start_date)
    if end_date:
        query = query.filter(models.Invoice.issue_date <= end_date)
    if status:
        query = query.filter(models.Invoice.status == status)
    if invoice_number:
        query = query.filter(models.Invoice.invoice_number.ilike(f"%{invoice_number}%"))

    total = query.count()
    items = query.order_by(models.Invoice.issue_date.desc(), models.Invoice.id.desc()).offset(skip).limit(limit).all()
    
    return {
        "items": items,
        "total": total,
        "page": (skip // limit) + 1 if limit > 0 else 1,
        "pages": (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0),
        "limit": limit
    }

def annul_invoice(db: Session, invoice_id: int, reason: Optional[str]) -> models.Invoice:
    db_invoice = get_invoice(db, invoice_id=invoice_id) 
    if not db_invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada.")

    if db_invoice.status == models.InvoiceStatus.ANNULLED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La factura ya ha sido anulada previamente.")
    
    # Liberar los cargos aplicados asociados
    for item in db_invoice.items:
        if item.applied_charge:
            item.applied_charge.invoice_id = None
            db.add(item.applied_charge)

    db_invoice.status = models.InvoiceStatus.ANNULLED
    
    reason_prefix = f"ANULACIÓN ({date.today().strftime('%d/%m/%Y')}): "
    final_reason = reason or "Anulada por el usuario."
    
    if db_invoice.notes:
        db_invoice.notes = f"{db_invoice.notes}\n{reason_prefix}{final_reason}"
    else:
        db_invoice.notes = f"{reason_prefix}{final_reason}"
            
    db.add(db_invoice)
    # El commit se hará en el router después de llamar esta función
    return db_invoice

def update_invoice_fiscal_details(
    db: Session, 
    invoice_id: int, 
    fiscal_details_in: schemas.InvoiceFiscalDetailsUpdate
) -> models.Invoice:
    db_invoice = get_invoice(db, invoice_id=invoice_id)
    if not db_invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada.")

    if db_invoice.status == models.InvoiceStatus.ANNULLED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se pueden agregar detalles fiscales a una factura anulada.")

    # Verificar unicidad de los nuevos números fiscales
    if fiscal_details_in.fiscal_invoice_number:
        existing_fm_inv_num = db.query(models.Invoice).filter(
            models.Invoice.fiscal_invoice_number == fiscal_details_in.fiscal_machine_invoice_number,
            models.Invoice.id != invoice_id
        ).first()
        if existing_fm_inv_num:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"El número de factura fiscal '{fiscal_details_in.fiscal_machine_invoice_number}' ya está en uso.")

    if fiscal_details_in.fiscal_machine_control_number:
        existing_fm_ctrl_num = db.query(models.Invoice).filter(
            models.Invoice.fiscal_control_number == fiscal_details_in.fiscal_machine_control_number,
            models.Invoice.id != invoice_id
        ).first()
        if existing_fm_ctrl_num:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"El número de control fiscal '{fiscal_details_in.fiscal_machine_control_number}' ya está en uso.")

    db_invoice.fiscal_invoice_number = fiscal_details_in.fiscal_invoice_number
    db_invoice.fiscal_control_number = fiscal_details_in.fiscal_machine_control_number
    
    # Si la factura estaba pendiente, ahora se considera emitida.
    if db_invoice.status == models.InvoiceStatus.PENDING_EMISSION:
        db_invoice.status = models.InvoiceStatus.EMITTED
    
    db.add(db_invoice)
    # El commit se hará en el router.
    return db_invoice


def get_invoices_for_representative(
    db: Session, 
    representative_id: int, 
    skip: int = 0, 
    limit: int = 100,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> List[models.Invoice]:
    query = db.query(models.Invoice).filter(models.Invoice.representative_id == representative_id)
    if start_date:
        query = query.filter(models.Invoice.issue_date >= start_date)
    if end_date:
        query = query.filter(models.Invoice.issue_date <= end_date)
    
    return query.order_by(models.Invoice.issue_date.desc(), models.Invoice.invoice_number.desc())\
        .offset(skip).limit(limit).all()       
        
def create_credit_note(db: Session, credit_note_in: schemas.CreditNoteCreate) -> models.CreditNote:
    """
    Crea una Nota de Crédito para una factura existente.
    Esta operación anula la factura original y genera un saldo a favor para el representante.
    """
    # 1. Validar la factura original
    db_invoice = get_invoice(db, invoice_id=credit_note_in.original_invoice_id)
    if not db_invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Factura original con ID {credit_note_in.original_invoice_id} no encontrada.")
    if db_invoice.status == models.InvoiceStatus.ANNULLED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La factura ya ha sido anulada previamente y no puede tener una nota de crédito.")
    if db_invoice.credit_note_id is not None:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esta factura ya tiene una nota de crédito asociada.")

    # 2. Obtener configuración y generar número de Nota de Crédito
    school_config = get_school_configuration(db)
    if not school_config or not school_config.next_credit_note_reference:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="La configuración para el correlativo de Notas de Crédito no está establecida.")

    current_cn_ref = school_config.next_credit_note_reference
    credit_note_number = str(current_cn_ref)
    if school_config.credit_note_reference_prefix:
        credit_note_number = f"{school_config.credit_note_reference_prefix}{credit_note_number}"
    
    # 3. Crear los ítems de la nota de crédito (snapshot de los ítems de la factura)
    credit_note_items = [
        models.CreditNoteItem(
            description=item.description,
            quantity=item.quantity,
            unit_price_ves=item.unit_price_ves,
            item_subtotal_ves=item.item_subtotal_ves,
            item_iva_ves=item.item_iva_ves,
            item_total_ves=item.item_total_ves,
        ) for item in db_invoice.items
    ]

    # 4. Crear la Nota de Crédito
    db_credit_note = models.CreditNote(
        credit_note_number=credit_note_number,
        issue_date=credit_note_in.issue_date,
        reason=credit_note_in.reason,
        representative_id=db_invoice.representative_id,
        original_invoice_id=db_invoice.id,
        total_credited_ves=db_invoice.total_amount_ves,
        # Snapshots
        school_rif_snapshot=db_invoice.school_rif_snapshot,
        representative_rif_or_cedula_snapshot=db_invoice.representative_rif_or_cedula_snapshot,
        original_invoice_number_snapshot=db_invoice.invoice_number,
        original_invoice_control_number_snapshot=db_invoice.fiscal_control_number,
        items=credit_note_items
    )
    
    # 5. Anular la factura original
    db_invoice.status = models.InvoiceStatus.ANNULLED
    db_invoice.notes = (db_invoice.notes or "") + f"\nAnulada mediante Nota de Crédito {credit_note_number} el {credit_note_in.issue_date}."
    
    # 6. Vincular la nota de crédito a la factura
    db_invoice.credit_note = db_credit_note

    # 7. Incrementar el saldo a favor del representante
    db_representative = db_invoice.representative
    db_representative.available_credit_ves = round(db_representative.available_credit_ves + db_invoice.total_amount_ves, 2)

    # 8. Actualizar el correlativo
    school_config.next_credit_note_reference += 1

    db.add(db_credit_note)
    db.add(db_invoice)
    db.add(db_representative)
    db.add(school_config)
    
    # El commit se hará en el router
    return db_credit_note


def get_credit_note(db: Session, credit_note_id: int) -> Optional[models.CreditNote]:
    return db.query(models.CreditNote).options(
        joinedload(models.CreditNote.items),
        joinedload(models.CreditNote.representative)
    ).filter(models.CreditNote.id == credit_note_id).first()


def get_credit_notes(
    db: Session, 
    skip: int = 0, 
    limit: int = 100,
    representative_id: Optional[int] = None
) -> Dict[str, Any]:
    query = db.query(models.CreditNote).options(joinedload(models.CreditNote.representative))
    
    if representative_id is not None:
        query = query.filter(models.CreditNote.representative_id == representative_id)

    total = query.count()
    items = query.order_by(models.CreditNote.issue_date.desc(), models.CreditNote.id.desc()).offset(skip).limit(limit).all()
    
    return {
        "items": items,
        "total": total,
        "page": (skip // limit) + 1 if limit > 0 else 1,
        "pages": (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0),
        "limit": limit
    } 



def get_total_representatives_count(db: Session) -> int:
    """Cuenta el número total de representantes."""
    # Si en el futuro añades un campo is_active a Representative, lo filtrarías aquí.
    return db.query(models.Representative).count()

def get_total_active_students_count(db: Session) -> int:
    """Cuenta el número total de estudiantes activos."""
    return db.query(models.Student).filter(models.Student.is_active == True).count()

def get_revenue_for_period_ves(db: Session, start_date: date, end_date: date) -> float:
    """Calcula el total recaudado (en VES) en un período de fechas específico."""
    total_revenue = db.query(sql_func.sum(models.Payment.amount_paid_ves_equivalent))\
        .filter(models.Payment.payment_date >= start_date)\
        .filter(models.Payment.payment_date <= end_date)\
        .scalar()
    return round(total_revenue or 0.0, 2) # Devuelve 0.0 si no hay pagos

def get_total_outstanding_debt_ves(db: Session) -> float:
    """
    Calcula la deuda pendiente total en VES, indexando los cargos en USD a la tasa actual.
    """
    # Obtener la tasa de cambio USD -> VES más reciente
    # Asumimos que "USD" es la principal moneda extranjera a indexar
    latest_usd_rate_model = get_latest_exchange_rate(db, from_currency=Currency.USD, on_date=date.today()) #
    current_usd_to_ves_rate = latest_usd_rate_model.rate if latest_usd_rate_model and latest_usd_rate_model.rate else None

    if current_usd_to_ves_rate is None:
        # ¿Qué hacer si no hay tasa USD hoy? Podríamos usar la última conocida o dar un error/advertencia.
        # Por ahora, si no hay tasa, los cargos USD no se podrán sumar a la deuda total en VES.
        # O podríamos lanzar una excepción o devolver un indicador de que el cálculo es parcial.
        # Para simplificar, si no hay tasa, solo sumaremos los cargos en VES.
        # Esto debería ser manejado con más robustez en un sistema real (ej. forzar registro de tasa).
        print("ADVERTENCIA: No se encontró tasa USD->VES actual para calcular la deuda total pendiente. El resultado podría ser incompleto.")
        # Alternativamente, podrías buscar la última tasa disponible sin importar la fecha, pero esto
        # no sería "la tasa actual del día".
        # O usar una tasa de fallback si la lógica de negocio lo permite.

    outstanding_charges = db.query(
        models.AppliedCharge.amount_due_original_currency,
        models.AppliedCharge.amount_paid_original_currency_equivalent,
        models.AppliedCharge.is_indexed,
        models.AppliedCharge.original_concept_currency, # Para otras monedas indexadas si las hubiera
        # Si is_indexed es falso, amount_due_original_currency es en VES y amount_paid_original_currency_equivalent también representa el pago en VES
        # así que podríamos simplificar y usar amount_paid_ves para cargos no indexados.
        models.AppliedCharge.amount_paid_ves # Necesitamos este para cargos originalmente en VES
    ).filter(
        models.AppliedCharge.status.in_([
            models.AppliedChargeStatus.PENDING,
            models.AppliedChargeStatus.PARTIALLY_PAID,
            models.AppliedChargeStatus.OVERDUE
        ])
    ).all()

    total_debt_ves = 0.0
    for charge in outstanding_charges:
        pending_debt_for_this_charge_ves = 0.0
        if charge.is_indexed and charge.original_concept_currency == Currency.USD:
            if current_usd_to_ves_rate:
                pending_debt_original_currency = charge.amount_due_original_currency - charge.amount_paid_original_currency_equivalent
                pending_debt_for_this_charge_ves = pending_debt_original_currency * current_usd_to_ves_rate
            else:
                # No hay tasa USD, no podemos calcular la deuda de este cargo en VES hoy. Omitir o manejar error.
                pass 
        elif not charge.is_indexed and charge.original_concept_currency == Currency.VES:
            # El cargo es originalmente en VES.
            # amount_due_original_currency es en VES.
            # amount_paid_ves es el total pagado en VES para este cargo.
            pending_debt_for_this_charge_ves = charge.amount_due_original_currency - charge.amount_paid_ves
        # Podrías añadir lógica para EUR si también lo quieres indexar y tienes su tasa

        total_debt_ves += pending_debt_for_this_charge_ves

    return round(total_debt_ves, 2)


def get_revenue_trend(
    db: Session,
    granularity: str = "month", # "month" o "day"
    count: int = 12 # número de períodos hacia atrás
) -> List[schemas.MonthlyRevenueSummary]:
    """
    Calcula los ingresos totales (VES) por período (mes o día) para los últimos 'count' períodos.
    """
    results_map = {}
    today = date.today()
    
    # Definir el formato de fecha para PostgreSQL
    date_format_postgresql = ""
    
    if granularity == "month":
        date_format_postgresql = 'YYYY-MM'
        # Lógica para pre-llenar el mapa de resultados con todos los meses del rango
        for i in range(count):
            current_month_val = today.month - i
            current_year_val = today.year
            while current_month_val <= 0:
                current_month_val += 12
                current_year_val -= 1
            period_str = f"{current_year_val:04d}-{current_month_val:02d}"
            results_map[period_str] = schemas.MonthlyRevenueSummary(
                period=period_str,
                revenue_ves=0.0
            )
        # Determinar la fecha de inicio para la consulta
        start_month_calc = today.month - (count - 1)
        start_year_calc = today.year
        while start_month_calc <= 0:
            start_month_calc += 12
            start_year_calc -= 1
        oldest_period_start_date = date(start_year_calc, start_month_calc, 1)

    elif granularity == "day":
        date_format_postgresql = 'YYYY-MM-DD'
        # Lógica para pre-llenar el mapa de resultados con todos los días del rango
        for i in range(count):
            current_date = today - timedelta(days=i)
            period_str = current_date.strftime('%Y-%m-%d')
            results_map[period_str] = schemas.MonthlyRevenueSummary(
                period=period_str,
                revenue_ves=0.0
            )
        # Determinar la fecha de inicio para la consulta
        oldest_period_start_date = today - timedelta(days=count - 1)
    else:
        raise ValueError("Granularidad no soportada. Usar 'month' o 'day'.")

    # Obtener el total de pagos recibidos por período usando to_char
    payments_by_period = db.query(
            sql_func.to_char(models.Payment.payment_date, date_format_postgresql).label('period'),
            sql_func.sum(models.Payment.amount_paid_ves_equivalent).label('total_revenue_ves')
        )\
        .filter(models.Payment.payment_date >= oldest_period_start_date)\
        .filter(models.Payment.payment_date <= today)\
        .group_by(sql_func.to_char(models.Payment.payment_date, date_format_postgresql))\
        .all()

    for row in payments_by_period:
        if row.period in results_map:
            results_map[row.period].revenue_ves = round(float(row.total_revenue_ves or 0.0), 2)
            
    # Convertir el mapa a una lista y ordenarla
    sorted_results = sorted(results_map.values(), key=lambda x: x.period)
    
    return sorted_results

def get_enriched_dashboard_summary(db: Session) -> schemas.DashboardSummaryResponse: # Asegúrate que el tipo de retorno sea el schema actualizado
    today = date.today()
    usd_rate_model = get_latest_exchange_rate(db, from_currency=models.Currency.USD, on_date=today)
    current_rate = usd_rate_model.rate if usd_rate_model and usd_rate_model.rate else None

    total_reps = get_total_representatives_count(db)
    total_active_students = get_total_active_students_count(db)

    first_day_current_month = today.replace(day=1)
    revenue_ves = get_revenue_for_period_ves(db, start_date=first_day_current_month, end_date=today)
    outstanding_debt_ves = get_total_outstanding_debt_ves(db) # Ya debería estar indexado

    # --- NUEVO: Calcular Total de Gastos del Mes Actual ---
    query_expenses_month = db.query(sql_func.sum(
        sql_func.coalesce(models.Expense.amount_ves_equivalent_at_creation, models.Expense.amount)
    )).filter(
        models.Expense.expense_date >= first_day_current_month,
        models.Expense.expense_date <= today,
        models.Expense.payment_status != models.ExpensePaymentStatus.CANCELLED # Excluir gastos cancelados
    )
    # Si amount_ves_equivalent_at_creation es None (porque el gasto fue en VES), usa 'amount'
    # Esto asume que 'amount' para gastos VES ya está en VES.
    # O, si siempre calculas amount_ves_equivalent_at_creation incluso para VES (siendo igual a amount):
    # query_expenses_month = db.query(sql_func.sum(models.Expense.amount_ves_equivalent_at_creation)) \
    #     .filter(
    #         models.Expense.expense_date >= first_day_current_month,
    #         models.Expense.expense_date <= today,
    #         models.Expense.payment_status != models.ExpensePaymentStatus.CANCELLED
    #     )
    
    total_expenses_current_month_ves = query_expenses_month.scalar() or 0.0
    total_expenses_current_month_ves = round(total_expenses_current_month_ves, 2)
    # --- FIN NUEVO ---

    revenue_usd_eq = None
    outstanding_debt_usd_eq = None
    total_expenses_usd_eq = None 

    if current_rate and current_rate > 0:
        if revenue_ves is not None:
            revenue_usd_eq = round(revenue_ves / current_rate, 2)
        if outstanding_debt_ves is not None:
            outstanding_debt_usd_eq = round(outstanding_debt_ves / current_rate, 2)
        if total_expenses_current_month_ves is not None: 
            total_expenses_usd_eq = round(total_expenses_current_month_ves / current_rate, 2)


    return schemas.DashboardSummaryResponse(
        total_representatives=total_reps,
        total_active_students=total_active_students,
        revenue_current_month_ves=revenue_ves,
        total_outstanding_debt_ves=outstanding_debt_ves,
        total_expenses_current_month_ves=total_expenses_current_month_ves, 
        current_usd_to_ves_rate_used=current_rate,
        revenue_current_month_usd_equivalent=revenue_usd_eq,
        total_outstanding_debt_usd_equivalent=outstanding_debt_usd_eq,
        total_expenses_current_month_usd_equivalent=total_expenses_usd_eq 
    )
    
def get_expense_trend(
    db: Session,
    granularity: str = "month",
    count: int = 12,
    current_usd_rate: Optional[float] = None
) -> List[schemas.MonthlyExpenseSummary]: # Tipo de retorno corregido
    """
    Calcula los GASTOS totales (VES) por período (mes o día) para los últimos 'count' períodos.
    """
    results_map = {}
    today = date.today()
    
    date_format_postgresql = ""
    
    if granularity == "month":
        date_format_postgresql = 'YYYY-MM'
        for i in range(count):
            current_month_val = today.month - i
            current_year_val = today.year
            while current_month_val <= 0:
                current_month_val += 12
                current_year_val -= 1
            period_str = f"{current_year_val:04d}-{current_month_val:02d}"
            results_map[period_str] = schemas.MonthlyExpenseSummary(
                period=period_str, expenses_ves=0.0, expenses_usd_equivalent=0.0
            )
        start_month_calc = today.month - (count - 1)
        start_year_calc = today.year
        while start_month_calc <= 0:
            start_month_calc += 12
            start_year_calc -= 1
        oldest_period_start_date = date(start_year_calc, start_month_calc, 1)

    elif granularity == "day":
        date_format_postgresql = 'YYYY-MM-DD'
        for i in range(count):
            current_date = today - timedelta(days=i)
            period_str = current_date.strftime('%Y-%m-%d')
            results_map[period_str] = schemas.MonthlyExpenseSummary(
                period=period_str, expenses_ves=0.0, expenses_usd_equivalent=0.0
            )
        oldest_period_start_date = today - timedelta(days=count - 1)
    else:
        raise ValueError("Granularidad no soportada para tendencia de gastos. Usar 'month' o 'day'.")

    # CORRECCIÓN: La consulta ahora apunta a models.Expense y usa to_char
    expenses_by_period_query = db.query(
            sql_func.to_char(models.Expense.expense_date, date_format_postgresql).label('period'),
            sql_func.sum(
                sql_func.coalesce(models.Expense.amount_ves_equivalent_at_creation, models.Expense.amount)
            ).label('total_expenses_ves')
        )\
        .filter(models.Expense.expense_date >= oldest_period_start_date)\
        .filter(models.Expense.expense_date <= today)\
        .filter(models.Expense.payment_status != models.ExpensePaymentStatus.CANCELLED)\
        .group_by(sql_func.to_char(models.Expense.expense_date, date_format_postgresql))\
        .all()

    for row in expenses_by_period_query:
        if row.period in results_map:
            ves_amount = round(float(row.total_expenses_ves or 0.0), 2)
            results_map[row.period].expenses_ves = ves_amount
            if current_usd_rate and current_usd_rate > 0:
                results_map[row.period].expenses_usd_equivalent = round(ves_amount / current_usd_rate, 2)
            else:
                results_map[row.period].expenses_usd_equivalent = None
            
    sorted_results = sorted(results_map.values(), key=lambda x: x.period)
    return sorted_results

    
def get_monthly_billing_payment_summary(db: Session, months_count: int = 12) -> List[schemas.MonthlyBillingPaymentSummary]:
    """
    Calcula el total de cargos emitidos (VES de emisión) y el total de pagos recibidos (VES)
    para cada uno de los últimos N meses.
    """
    results_map = {} # Usaremos un diccionario para ensamblar los datos por período
    today = date.today()

    # 1. Generar la lista de períodos (YYYY-MM) para los últimos N meses
    for i in range(months_count):
        # Calcular el mes y año para el i-ésimo mes hacia atrás
        current_month_val = today.month - i
        current_year_val = today.year
        while current_month_val <= 0:
            current_month_val += 12
            current_year_val -= 1
        
        period_str = f"{current_year_val:04d}-{current_month_val:02d}"
        results_map[period_str] = schemas.MonthlyBillingPaymentSummary(
            period=period_str,
            total_charged_ves_emission=0.0,
            total_paid_in_period_ves=0.0
        )

    # Determinar la fecha de inicio para las consultas (primer día del mes más antiguo en nuestro rango)
    # Esto es months_count - 1 porque el rango de 0 a months_count-1 cubre N meses.
    start_month_calc = today.month - (months_count - 1) 
    start_year_calc = today.year
    while start_month_calc <= 0:
        start_month_calc += 12
        start_year_calc -= 1
    
    oldest_period_start_date = date(start_year_calc, start_month_calc, 1)

    # 2. Obtener el total de cargos emitidos por mes (amount_due_ves_at_emission)
    #    La issue_date del AppliedCharge determina a qué período pertenece el cargo.
    charges_by_month = db.query(
            extract('year', models.AppliedCharge.issue_date).label('year'),
            extract('month', models.AppliedCharge.issue_date).label('month'),
            sql_func.sum(models.AppliedCharge.amount_due_ves_at_emission).label('total_charged')
        )\
        .filter(models.AppliedCharge.issue_date >= oldest_period_start_date)\
        .filter(models.AppliedCharge.issue_date <= today)\
        .filter(models.AppliedCharge.status != models.AppliedChargeStatus.CANCELLED)\
        .group_by(extract('year', models.AppliedCharge.issue_date), extract('month', models.AppliedCharge.issue_date))\
        .all()

    for row in charges_by_month:
        period_str = f"{row.year:04d}-{row.month:02d}"
        if period_str in results_map:
            results_map[period_str].total_charged_ves_emission = round(float(row.total_charged or 0.0), 2)

    # 3. Obtener el total de pagos recibidos por mes usando extract
    payments_by_month = db.query(
            extract('year', models.Payment.payment_date).label('year'),
            extract('month', models.Payment.payment_date).label('month'),
            sql_func.sum(models.Payment.amount_paid_ves_equivalent).label('total_paid')
        )\
        .filter(models.Payment.payment_date >= oldest_period_start_date)\
        .filter(models.Payment.payment_date <= today)\
        .group_by(extract('year', models.Payment.payment_date), extract('month', models.Payment.payment_date))\
        .all()

    for row in payments_by_month:
        period_str = f"{row.year:04d}-{row.month:02d}"
        if period_str in results_map:
            results_map[period_str].total_paid_in_period_ves = round(float(row.total_paid or 0.0), 2)
            
    # Convertir el mapa a una lista y ordenarla por período (más reciente primero o más antiguo primero)
    # El frontend puede preferir más antiguo primero para gráficas de tendencia.
    sorted_results = sorted(results_map.values(), key=lambda x: x.period)
    
    return sorted_results


# --- CRUD para ExpenseCategory ---

def create_expense_category(db: Session, category_in: schemas.ExpenseCategoryCreate) -> models.ExpenseCategory:
    existing_category = db.query(models.ExpenseCategory).filter(models.ExpenseCategory.name == category_in.name).first()
    if existing_category:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Una categoría de gasto con el nombre '{category_in.name}' ya existe."
        )
    db_category = models.ExpenseCategory(**category_in.model_dump())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

def get_expense_category(db: Session, category_id: int) -> Optional[models.ExpenseCategory]:
    return db.query(models.ExpenseCategory).filter(models.ExpenseCategory.id == category_id).first()

def get_expense_category_by_name(db: Session, name: str) -> Optional[models.ExpenseCategory]: # Útil para validaciones
    return db.query(models.ExpenseCategory).filter(models.ExpenseCategory.name == name).first()

def get_expense_categories(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    is_active: Optional[bool] = None
) -> Dict[str, any]: # Devolvemos un dict para paginación, similar a tus otros get_X_list
    query = db.query(models.ExpenseCategory)
    if is_active is not None:
        query = query.filter(models.ExpenseCategory.is_active == is_active)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                models.ExpenseCategory.name.ilike(search_term),
                models.ExpenseCategory.description.ilike(search_term)
            )
        )
    
    total = query.count()
    items = query.order_by(models.ExpenseCategory.name.asc()).offset(skip).limit(limit).all()
    
    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)
    current_page = (skip // limit) + 1 if limit > 0 else 1

    return {"items": items, "total": total, "page": current_page, "pages": pages, "limit": limit}

def update_expense_category(
    db: Session, category_id: int, category_in: schemas.ExpenseCategoryUpdate
) -> Optional[models.ExpenseCategory]:
    db_category = get_expense_category(db, category_id)
    if not db_category:
        return None
    
    if category_in.name and category_in.name != db_category.name:
        existing_category = get_expense_category_by_name(db, category_in.name)
        if existing_category and existing_category.id != category_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Otra categoría de gasto con el nombre '{category_in.name}' ya existe."
            )

    update_data = category_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_category, key, value)
    
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

def toggle_expense_category_active_status(db: Session, category_id: int) -> Optional[models.ExpenseCategory]:
    db_category = get_expense_category(db, category_id)
    if not db_category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoría de gasto no encontrada.")
    
    # No permitir desactivar si tiene gastos asociados (o manejarlo según reglas de negocio)
    # Ejemplo básico:
    # active_expenses_count = db.query(models.Expense).filter(models.Expense.category_id == category_id).count()
    # if db_category.is_active and active_expenses_count > 0:
    #     raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede desactivar la categoría porque tiene gastos asociados.")
        
    db_category.is_active = not db_category.is_active
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

# --- CRUD para Supplier ---

def create_supplier(db: Session, supplier_in: schemas.SupplierCreate) -> models.Supplier:
    if db.query(models.Supplier).filter(models.Supplier.name == supplier_in.name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Un proveedor con el nombre '{supplier_in.name}' ya existe.")
    if supplier_in.rif_ci and db.query(models.Supplier).filter(models.Supplier.rif_ci == supplier_in.rif_ci).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Un proveedor con el RIF/CI '{supplier_in.rif_ci}' ya existe.")
    if supplier_in.email and db.query(models.Supplier).filter(models.Supplier.email == supplier_in.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Un proveedor con el email '{supplier_in.email}' ya existe.")

    db_supplier = models.Supplier(**supplier_in.model_dump())
    db.add(db_supplier)
    db.commit()
    db.refresh(db_supplier)
    return db_supplier

def get_supplier(db: Session, supplier_id: int) -> Optional[models.Supplier]:
    return db.query(models.Supplier).options(joinedload(models.Supplier.category)).filter(models.Supplier.id == supplier_id).first()

def get_supplier_by_name(db: Session, name: str) -> Optional[models.Supplier]: # Útil para validaciones
    return db.query(models.Supplier).filter(models.Supplier.name == name).first()

def get_suppliers(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    is_active: Optional[bool] = None
) -> Dict[str, any]:
    query = db.query(models.Supplier).options(joinedload(models.Supplier.category))
    if is_active is not None:
        query = query.filter(models.Supplier.is_active == is_active)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                models.Supplier.name.ilike(search_term),
                models.Supplier.rif_ci.ilike(search_term),
                models.Supplier.email.ilike(search_term),
                models.Supplier.contact_person.ilike(search_term)
            )
        )
    total = query.count()
    items = query.order_by(models.Supplier.name.asc()).offset(skip).limit(limit).all()

    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)
    current_page = (skip // limit) + 1 if limit > 0 else 1
    
    return {"items": items, "total": total, "page": current_page, "pages": pages, "limit": limit}

def update_supplier(db: Session, supplier_id: int, supplier_in: schemas.SupplierUpdate) -> Optional[models.Supplier]:
    db_supplier = get_supplier(db, supplier_id)
    if not db_supplier:
        return None

    update_data = supplier_in.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] != db_supplier.name:
        if db.query(models.Supplier).filter(models.Supplier.name == update_data["name"], models.Supplier.id != supplier_id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Otro proveedor con el nombre '{update_data['name']}' ya existe.")
    if "rif_ci" in update_data and update_data["rif_ci"] and update_data["rif_ci"] != db_supplier.rif_ci:
        if db.query(models.Supplier).filter(models.Supplier.rif_ci == update_data["rif_ci"], models.Supplier.id != supplier_id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Otro proveedor con el RIF/CI '{update_data['rif_ci']}' ya existe.")
    if "email" in update_data and update_data["email"] and update_data["email"] != db_supplier.email:
        if db.query(models.Supplier).filter(models.Supplier.email == update_data["email"], models.Supplier.id != supplier_id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Otro proveedor con el email '{update_data['email']}' ya existe.")

    for key, value in update_data.items():
        setattr(db_supplier, key, value)
    
    db.add(db_supplier)
    db.commit()
    db.refresh(db_supplier)
    return db_supplier

def toggle_supplier_active_status(db: Session, supplier_id: int) -> Optional[models.Supplier]:
    db_supplier = get_supplier(db, supplier_id)
    if not db_supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado.")
    # active_expenses_count = db.query(models.Expense).filter(models.Expense.supplier_id == supplier_id).count()
    # if db_supplier.is_active and active_expenses_count > 0:
    #     raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede desactivar el proveedor porque tiene gastos asociados.")
    db_supplier.is_active = not db_supplier.is_active
    db.add(db_supplier)
    db.commit()
    db.refresh(db_supplier)
    return db_supplier

# --- CRUD para Expense ---

def create_expense(db: Session, expense_in: schemas.ExpenseCreate, user_id: int) -> models.Expense:
    # 1. Validar el proveedor y derivar la categoría
    supplier = get_supplier(db, expense_in.supplier_id)
    if not supplier or not supplier.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Proveedor ID {expense_in.supplier_id} no válido o inactivo."
        )
    
    if not supplier.category_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El proveedor '{supplier.name}' no tiene una categoría de gasto asignada. Por favor, edite el proveedor."
        )
    
    category_id_to_use = supplier.category_id

    # 2. Validar que la categoría derivada exista y esté activa
    category = get_expense_category(db, category_id_to_use)
    if not category or not category.is_active:
         raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La categoría de gasto ID {category_id_to_use} (derivada del proveedor) no es válida o está inactiva."
        )

    # 3. Lógica de conversión de moneda (se mantiene igual)
    amount_ves_equiv = None
    rate_at_creation = None
    if expense_in.currency != models.Currency.VES:
        rate_model = get_latest_exchange_rate(db, from_currency=expense_in.currency, to_currency=models.Currency.VES, on_date=expense_in.expense_date)
        if not rate_model:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"No se encontró tasa de cambio para {expense_in.currency.value} a VES en la fecha {expense_in.expense_date}.")
        rate_at_creation = rate_model.rate
        amount_ves_equiv = round(expense_in.amount * rate_at_creation, 2)
    else:
        amount_ves_equiv = expense_in.amount

    # 4. Crear el objeto de gasto para la base de datos
    expense_data = expense_in.model_dump()
    
    db_expense = models.Expense(
        **expense_data,
        category_id=category_id_to_use, # Usar la categoría derivada
        user_id=user_id,
        amount_ves_equivalent_at_creation=amount_ves_equiv,
        exchange_rate_at_creation=rate_at_creation,
        payment_status=models.ExpensePaymentStatus.PENDING # Siempre se crea como pendiente
    )
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return get_expense(db, db_expense.id)

def get_expense(db: Session, expense_id: int) -> Optional[models.Expense]:
    return db.query(models.Expense).options(
        joinedload(models.Expense.category),
        joinedload(models.Expense.supplier),
        joinedload(models.Expense.user),
        joinedload(models.Expense.payments_made).joinedload(models.ExpensePayment.user) # Cargar usuario de cada pago
    ).filter(models.Expense.id == expense_id).first()

def get_expenses(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    expense_date_start: Optional[date] = None,
    expense_date_end: Optional[date] = None,
    category_id: Optional[int] = None,
    supplier_id: Optional[int] = None,
    payment_status: Optional[models.ExpensePaymentStatus] = None,
    user_id: Optional[int] = None, # Quién registró el gasto
    search_description: Optional[str] = None,
    sort_by: Optional[str] = "expense_date",
    sort_order: Optional[str] = "desc"
) -> Dict[str, any]:
    query = db.query(models.Expense).options(
        joinedload(models.Expense.category),
        joinedload(models.Expense.supplier),
        joinedload(models.Expense.user)
    )

    if expense_date_start:
        query = query.filter(models.Expense.expense_date >= expense_date_start)
    if expense_date_end:
        query = query.filter(models.Expense.expense_date <= expense_date_end)
    if category_id is not None:
        query = query.filter(models.Expense.category_id == category_id)
    if supplier_id is not None:
        query = query.filter(models.Expense.supplier_id == supplier_id)
    if payment_status:
        query = query.filter(models.Expense.payment_status == payment_status)
    if user_id is not None:
        query = query.filter(models.Expense.user_id == user_id)
    if search_description:
        query = query.filter(models.Expense.description.ilike(f"%{search_description}%"))

    total = query.count()

    # Ordenamiento
    sort_column = getattr(models.Expense, sort_by, models.Expense.expense_date)
    if sort_order.lower() == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())
    
    items = query.offset(skip).limit(limit).all()

    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)
    current_page = (skip // limit) + 1 if limit > 0 else 1
    
    return {"items": items, "total": total, "page": current_page, "pages": pages, "limit": limit}

def update_expense(db: Session, expense_id: int, expense_in: schemas.ExpenseUpdate, user_id: int) -> Optional[models.Expense]:
    db_expense = get_expense(db, expense_id)
    if not db_expense:
        return None
    
    # Restricciones: No se puede editar un gasto cancelado. Si está pagado, edición limitada.
    if db_expense.payment_status == models.ExpensePaymentStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede modificar un gasto cancelado.")
    
    # Si el gasto ya está pagado o parcialmente pagado, no se deberían cambiar montos o moneda.
    # La lógica de cambiar montos/moneda en un gasto existente es compleja y usualmente se evita.
    # Se asume que `ExpenseUpdate` no incluye `amount` ni `currency`.

    update_data = expense_in.model_dump(exclude_unset=True)
    
    # Si se cambia category_id o supplier_id, validar que existan y estén activos
    if "category_id" in update_data and update_data["category_id"] is not None:
        category = get_expense_category(db, update_data["category_id"])
        if not category or not category.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Nueva categoría de gasto ID {update_data['category_id']} no válida o inactiva.")
    if "supplier_id" in update_data and update_data["supplier_id"] is not None:
        supplier = get_supplier(db, update_data["supplier_id"])
        if not supplier or not supplier.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Nuevo proveedor ID {update_data['supplier_id']} no válido o inactivo.")
    
    for key, value in update_data.items():
        setattr(db_expense, key, value)
    
    # db_expense.user_id = user_id # Opcional: registrar quién hizo la última modificación. Para eso, un campo `updated_by_user_id` sería mejor.
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return get_expense(db, db_expense.id) # Para devolver con relaciones

def cancel_expense(db: Session, expense_id: int, user_id: int) -> Optional[models.Expense]:
    db_expense = get_expense(db, expense_id)
    if not db_expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado.")

    if db_expense.payment_status == models.ExpensePaymentStatus.PAID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede cancelar un gasto que ya está completamente pagado. Considere anular los pagos primero.")
    if db_expense.payment_status == models.ExpensePaymentStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El gasto ya está cancelado.")

    # Lógica adicional: si hay pagos parciales, ¿qué hacer con ellos? ¿Se anulan automáticamente?
    # Por ahora, solo cambiamos el estado del gasto.
    # Si se anulan los pagos, total_amount_paid_ves debería recalcularse.

    db_expense.payment_status = models.ExpensePaymentStatus.CANCELLED
    # db_expense.notes = (db_expense.notes or "") + f"\nCancelado por usuario ID {user_id} el {date.today()}."
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return get_expense(db, db_expense.id)

# --- CRUD para ExpensePayment ---

def create_expense_payment(db: Session, payment_in: schemas.ExpensePaymentCreate, user_id: int) -> models.ExpensePayment:
    db_expense = get_expense(db, payment_in.expense_id)
    if not db_expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Gasto con ID {payment_in.expense_id} no encontrado.")
    if db_expense.payment_status == models.ExpensePaymentStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se pueden registrar pagos a un gasto cancelado.")
    if db_expense.payment_status == models.ExpensePaymentStatus.PAID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El gasto ya está marcado como completamente pagado.")

    amount_paid_ves_equiv = None
    rate_at_payment = None

    if payment_in.currency_paid != models.Currency.VES:
        rate_model = get_latest_exchange_rate(db, from_currency=payment_in.currency_paid, to_currency=models.Currency.VES, on_date=payment_in.payment_date)
        if not rate_model:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"No se encontró tasa de cambio para {payment_in.currency_paid.value} a VES en la fecha {payment_in.payment_date}.")
        rate_at_payment = rate_model.rate
        amount_paid_ves_equiv = round(payment_in.amount_paid * rate_at_payment, 2)
    else:
        amount_paid_ves_equiv = payment_in.amount_paid
    
    # Validar que el pago no exceda significativamente la deuda pendiente del gasto (en VES)
    # Deuda pendiente del gasto en VES: (amount_ves_equivalent_at_creation o amount si fue VES) - total_amount_paid_ves
    expense_amount_ves = db_expense.amount_ves_equivalent_at_creation if db_expense.currency != models.Currency.VES else db_expense.amount
    pending_debt_ves = round((expense_amount_ves or 0) - db_expense.total_amount_paid_ves, 2)

    if amount_paid_ves_equiv > pending_debt_ves + 0.01: # Un pequeño margen para errores de redondeo
        # ¿Permitir sobrepago o registrar saldo a favor para el proveedor? Por ahora, un error.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El monto del pago ({formatCurrency(amount_paid_ves_equiv, 'VES')}) excede la deuda pendiente del gasto ({formatCurrency(pending_debt_ves, 'VES')})."
        )

    payment_data = payment_in.model_dump()
    db_payment = models.ExpensePayment(
        **payment_data,
        user_id=user_id,
        amount_paid_ves_equivalent=amount_paid_ves_equiv,
        exchange_rate_applied_at_payment=rate_at_payment
    )
    db.add(db_payment)
    
    # Actualizar el gasto
    db_expense.total_amount_paid_ves = round(db_expense.total_amount_paid_ves + amount_paid_ves_equiv, 2)
    
    if db_expense.total_amount_paid_ves >= (expense_amount_ves or 0) - 0.01: # Margen de redondeo
        db_expense.payment_status = models.ExpensePaymentStatus.PAID
    else:
        db_expense.payment_status = models.ExpensePaymentStatus.PARTIALLY_PAID
        
    db.add(db_expense)
    
    try:
        db.commit()
        db.refresh(db_payment)
        db.refresh(db_expense) # Asegurar que el gasto también se refresque
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al guardar el pago del gasto: {str(e)}")
        
    return db_payment

def get_expense_payment(db: Session, payment_id: int) -> Optional[models.ExpensePayment]:
    return db.query(models.ExpensePayment).options(
        joinedload(models.ExpensePayment.user),
        joinedload(models.ExpensePayment.expense) # Opcional, si se necesita info del gasto al ver el pago
    ).filter(models.ExpensePayment.id == payment_id).first()

def get_payments_for_expense(db: Session, expense_id: int, skip: int = 0, limit: int = 100) -> List[models.ExpensePayment]:
    return db.query(models.ExpensePayment).options(joinedload(models.ExpensePayment.user))\
        .filter(models.ExpensePayment.expense_id == expense_id)\
        .order_by(models.ExpensePayment.payment_date.desc())\
        .offset(skip).limit(limit).all()
        
        
def get_expenses_summary_by_category(
    db: Session,
    start_date: date,
    end_date: date,
    current_usd_rate: Optional[float] = None,
    include_only_category_id: Optional[int] = None,
    exclude_category_id: Optional[int] = None
) -> List[schemas.ExpenseSummaryByCategory]:
    """
    Obtiene un resumen de gastos totales y conteo de gastos, agrupados por categoría,
    dentro de un rango de fechas especificado.
    Excluye gastos cancelados.
    Permite excluir una categoría específica.
    """
    if start_date > end_date:
        raise ValueError("La fecha de inicio no puede ser posterior a la fecha de fin.")

    query = db.query(
            models.Expense.category_id,
            models.ExpenseCategory.name.label("category_name"),
            sql_func.sum(
                sql_func.coalesce(models.Expense.amount_ves_equivalent_at_creation, models.Expense.amount)
            ).label("total_expenses_ves"),
            sql_func.count(models.Expense.id).label("expense_count")
        )\
        .join(models.ExpenseCategory, models.Expense.category_id == models.ExpenseCategory.id)\
        .filter(models.Expense.expense_date >= start_date)\
        .filter(models.Expense.expense_date <= end_date)\
        .filter(models.Expense.payment_status != models.ExpensePaymentStatus.CANCELLED)

    if include_only_category_id is not None:
        query = query.filter(models.Expense.category_id == include_only_category_id)
    elif exclude_category_id is not None: # Usar elif para que sean mutuamente excluyentes si se envían ambos por error
        query = query.filter(models.Expense.category_id != exclude_category_id)

    query_results = query.group_by(models.Expense.category_id, models.ExpenseCategory.name)\
        .order_by(sql_func.sum(
                sql_func.coalesce(models.Expense.amount_ves_equivalent_at_creation, models.Expense.amount)
            ).desc() # Ordenar por el total gastado, de mayor a menor
        )\
        .all()

    summary_list = []
    for row in query_results:
        ves_amount = round(float(row.total_expenses_ves or 0.0), 2)
        usd_eq = None
        if current_usd_rate and current_usd_rate > 0 and ves_amount is not None:
            usd_eq = round(ves_amount / current_usd_rate, 2)

        summary_list.append(
            schemas.ExpenseSummaryByCategory(
                category_id=row.category_id,
                category_name=row.category_name,
                total_expenses_ves=ves_amount,
                total_expenses_usd_equivalent=usd_eq,
                expense_count=int(row.expense_count or 0)
            )
        )
    return summary_list


def get_expenses_summary_by_supplier(
    db: Session,
    start_date: date,
    end_date: date,
    current_usd_rate: Optional[float] = None,
    include_only_category_id: Optional[int] = None,
    exclude_category_id: Optional[int] = None
) -> List[schemas.ExpenseSummaryBySupplier]:
    """
    Obtiene un resumen de gastos totales y conteo de gastos, agrupados por proveedor,
    dentro de un rango de fechas especificado.
    Incluye una categoría para 'Sin Proveedor'. Excluye gastos cancelados.
    Permite excluir una categoría específica.
    """
    if start_date > end_date:
        raise ValueError("La fecha de inicio no puede ser posterior a la fecha de fin.")

    query = db.query(
            models.Expense.supplier_id,
            models.Supplier.name.label("supplier_name"), # Nombre del proveedor
            sql_func.sum(
                sql_func.coalesce(models.Expense.amount_ves_equivalent_at_creation, models.Expense.amount)
            ).label("total_expenses_ves"),
            sql_func.count(models.Expense.id).label("expense_count")
        )\
        .join(models.Supplier, models.Expense.supplier_id == models.Supplier.id)\
        .filter(models.Expense.expense_date >= start_date)\
        .filter(models.Expense.expense_date <= end_date)\
        .filter(models.Expense.payment_status != models.ExpensePaymentStatus.CANCELLED)

    if include_only_category_id is not None:
        query = query.filter(models.Expense.category_id == include_only_category_id)
    elif exclude_category_id is not None: # Usar elif para que sean mutuamente excluyentes si se envían ambos por error
        query = query.filter(models.Expense.category_id != exclude_category_id)

    query_results = query.group_by(models.Expense.supplier_id, models.Supplier.name)\
        .order_by(sql_func.sum(
                sql_func.coalesce(models.Expense.amount_ves_equivalent_at_creation, models.Expense.amount)
            ).desc() # Ordenar por el total gastado
        )\
        .all()

    summary_list = []
    for row in query_results:
        ves_amount = round(float(row.total_expenses_ves or 0.0), 2)
        usd_eq = None
        if current_usd_rate and current_usd_rate > 0 and ves_amount is not None:
            usd_eq = round(ves_amount / current_usd_rate, 2)

        summary_list.append(
            schemas.ExpenseSummaryBySupplier(
                supplier_id=row.supplier_id,
                supplier_name=row.supplier_name if row.supplier_id else "Sin Proveedor Asignado",
                total_expenses_ves=ves_amount,
                total_expenses_usd_equivalent=usd_eq,
                expense_count=int(row.expense_count or 0)
            )
        )
    return summary_list


def get_expense_trend_report(
    db: Session,
    start_date: date,
    end_date: date,
    granularity: str = "month",
    current_usd_rate: Optional[float] = None,
    include_only_category_id: Optional[int] = None,
    exclude_category_id: Optional[int] = None
) -> List[schemas.MonthlyExpenseSummary]:
    """
    Obtiene la tendencia de gastos totales (VES y USD equivalente si se provee tasa)
    por período (día, mes, o año) dentro de un rango de fechas.
    Excluye gastos cancelados. Rellena los períodos sin gastos con 0.
    Permite incluir o excluir una categoría específica.
    """
    if start_date > end_date:
        raise ValueError("La fecha de inicio no puede ser posterior a la fecha de fin.")

    results_map = {}
    
    # CAMBIO: Definir el formato de fecha para PostgreSQL
    date_format_postgresql = ""

    # Determinar formato de fecha y generar todos los períodos en el rango para el mapa
    if granularity == "month":
        date_format_postgresql = 'YYYY-MM'
        current_period_date = start_date
        while current_period_date <= end_date:
            period_str = current_period_date.strftime('%Y-%m')
            results_map[period_str] = schemas.MonthlyExpenseSummary(
                period=period_str, expenses_ves=0.0, expenses_usd_equivalent=0.0
            )
            # Avanzar al siguiente mes
            if current_period_date.month == 12:
                current_period_date = current_period_date.replace(year=current_period_date.year + 1, month=1)
            else:
                current_period_date = current_period_date.replace(month=current_period_date.month + 1)
    
    elif granularity == "day":
        date_format_postgresql = 'YYYY-MM-DD'
        current_period_date = start_date
        while current_period_date <= end_date:
            period_str = current_period_date.strftime('%Y-%m-%d')
            results_map[period_str] = schemas.MonthlyExpenseSummary(
                period=period_str, expenses_ves=0.0, expenses_usd_equivalent=0.0
            )
            current_period_date += timedelta(days=1)

    elif granularity == "year":
        date_format_postgresql = 'YYYY'
        start_year = start_date.year
        end_year = end_date.year
        for year_val in range(start_year, end_year + 1):
            period_str = str(year_val)
            results_map[period_str] = schemas.MonthlyExpenseSummary(
                period=period_str, expenses_ves=0.0, expenses_usd_equivalent=0.0
            )
    else:
        raise ValueError("Granularidad no soportada. Usar 'month', 'day' o 'year'.")

    # CAMBIO: Consultar los gastos usando to_char en lugar de strftime
    query = db.query(
            sql_func.to_char(models.Expense.expense_date, date_format_postgresql).label('period'),
            sql_func.sum(
                sql_func.coalesce(models.Expense.amount_ves_equivalent_at_creation, models.Expense.amount)
            ).label('total_expenses_ves')
        )\
        .filter(models.Expense.expense_date >= start_date)\
        .filter(models.Expense.expense_date <= end_date)\
        .filter(models.Expense.payment_status != models.ExpensePaymentStatus.CANCELLED)

    if include_only_category_id is not None:
        query = query.filter(models.Expense.category_id == include_only_category_id)
    elif exclude_category_id is not None:
        query = query.filter(models.Expense.category_id != exclude_category_id)

    expenses_by_period_query = query.group_by(sql_func.to_char(models.Expense.expense_date, date_format_postgresql)).all()

    # Actualizar el mapa con los resultados de la consulta
    for row in expenses_by_period_query:
        if row.period in results_map:
            ves_amount = round(float(row.total_expenses_ves or 0.0), 2)
            results_map[row.period].expenses_ves = ves_amount
            if current_usd_rate and current_usd_rate > 0:
                results_map[row.period].expenses_usd_equivalent = round(ves_amount / current_usd_rate, 2)
            else:
                results_map[row.period].expenses_usd_equivalent = None

    sorted_results = sorted(results_map.values(), key=lambda x: x.period)
    return sorted_results


# --- CRUD para manejar la lógica y poblar esquemas de la matriz de pagos estudiantiles ---


def _get_month_details_for_year(school_year_start_month: int, school_year_start_year: int) -> List[Dict[str, Any]]:
    """
    Genera una lista de diccionarios para los 12 meses del año escolar,
    conteniendo el año, mes (número), nombre del mes, y las fechas de inicio y fin del mes.
    Ejemplo de año escolar: Agosto YYYY a Julio YYYY+1.
    """
    months_details = []
    month_names_es = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
                      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"] # Nombres en español

    current_month = school_year_start_month
    current_year = school_year_start_year

    for _ in range(12): # 12 meses en un año escolar
        month_str = f"{current_year:04d}-{current_month:02d}"
        month_name = month_names_es[current_month]
        
        _, num_days_in_month = calendar.monthrange(current_year, current_month)
        start_of_month = date(current_year, current_month, 1)
        end_of_month = date(current_year, current_month, num_days_in_month)
        
        months_details.append({
            "year": current_year,
            "month": current_month,
            "month_year_str": month_str,
            "month_name": f"{month_name} {current_year}",
            "start_date": start_of_month,
            "end_date": end_of_month,
        })
        
        current_month += 1
        if current_month > 12:
            current_month = 1
            current_year += 1
            
    return months_details


def _calculate_delinquency_status(
    db: Session, 
    student_id: int, 
    current_processing_date: date
) -> Literal["green", "orange", "red", "none"]:
    """
    Calcula el estado de morosidad de un estudiante basado en sus cargos aplicados pendientes.
    - green: Al día (sin cargos vencidos pendientes).
    - orange: Cargos vencidos del mes anterior inmediato no pagados.
    - red: Cargos vencidos de dos o más meses anteriores no pagados.
    - none: Sin cargos pendientes o sin cargos para evaluar.
    """
    # Cargos pendientes o parcialmente pagados y vencidos
    overdue_charges = db.query(models.AppliedCharge)\
        .filter(models.AppliedCharge.student_id == student_id)\
        .filter(models.AppliedCharge.due_date < current_processing_date)\
        .filter(models.AppliedCharge.status.in_([
            models.AppliedChargeStatus.PENDING, 
            models.AppliedChargeStatus.PARTIALLY_PAID,
            models.AppliedChargeStatus.OVERDUE # Si tienes un estado específico para vencido
        ]))\
        .order_by(models.AppliedCharge.due_date.asc())\
        .all()

    if not overdue_charges:
        return "green" # O "none" si no tiene ningún cargo en absoluto para mayor claridad

    oldest_due_date = overdue_charges[0].due_date

    # Calcular diferencia en meses (aproximada)
    # Esta lógica de meses puede ser compleja por días variables en meses. Una forma simple:
    months_late = (current_processing_date.year - oldest_due_date.year) * 12 + (current_processing_date.month - oldest_due_date.month)
    
    # Ajuste si el día actual es menor que el día de vencimiento más antiguo en el mismo mes de diferencia
    # Ejemplo: hoy es 5 de Marzo, venció el 15 de Febrero -> months_late = 1.
    # Ejemplo: hoy es 5 de Marzo, venció el 25 de Febrero -> months_late = 1.
    # Ejemplo: hoy es 5 de Marzo, venció el 2 de Marzo -> months_late = 0 (pero está vencido si due_date < current_date)
    
    if oldest_due_date.day > current_processing_date.day and months_late > 0 : # Si el cargo venció más tarde en el mes que el día actual del mes de procesamiento
        months_late -=1 # Y estamos en un mes posterior, reducimos un mes "completo" de retraso.

    if months_late <= 0: # Vencido dentro del mes actual o no ha pasado un mes completo
         # Podríamos diferenciar entre vencido en el mes actual (orange) y al día (green)
         # Si oldest_due_date < current_processing_date, está vencido.
         # Para la lógica "un mes de retraso", necesitamos que haya pasado al menos al mes anterior.
         # Si la deuda más antigua es del mes actual o no ha completado un mes de retraso,
         # ¿consideramos "orange" o "green" si hay vencidos? La definición dice "un mes de retraso".
         # Si hay algo vencido, y no tiene ni un mes, podría ser "orange" suave o seguir siendo "green" si no se considera "retraso de mes".
         # Vamos a seguir estrictamente: "un mes de retraso" = vencido del mes pasado.
         # "dos meses o más" = vencido de dos meses o más atrás.
         # Cualquier otra cosa vencida pero no llegando a un mes de retraso, podría ser "green" con advertencia, o "orange"
         # Para simplificar, si hay algo vencido, no es "green".
         
         # Lógica revisada para "months_late" basado en el mes de vencimiento:
        first_day_current_month = current_processing_date.replace(day=1)
        first_day_prev_month = (first_day_current_month - timedelta(days=1)).replace(day=1)
        first_day_two_months_ago = (first_day_prev_month - timedelta(days=1)).replace(day=1)

        if oldest_due_date < first_day_two_months_ago: # Vencido hace dos meses o más
            return "red"
        elif oldest_due_date < first_day_prev_month: # Vencido el mes pasado
            return "orange"
        else: # Vencido este mes, o no se considera "retraso de mes" aún
            return "orange" # Consideremos "orange" si hay algo vencido que no sea "red"
                           # ya que "green" implica "al día".
                           # Si no hay overdue_charges, ya retornamos "green".
    
    if months_late >= 2:
        return "red"
    elif months_late == 1:
        return "orange"
    else: # months_late es 0 pero hay overdue_charges (vencido este mes)
        return "orange" # Siguiendo la idea de que si algo está vencido, no es green.
                        # Se podría ajustar esto a 'green' si solo te importa retraso de MES COMPLETO.

def get_student_annual_financial_summary(
    db: Session, 
    school_year_start_month: int, 
    school_year_start_year: int, 
    current_processing_date: date, # Fecha para calcular morosidad
    student_search_term: Optional[str] = None,
    delinquency_filter: Optional[Literal["green", "orange", "red", "none"]] = None, 
    current_usd_rate: Optional[float] = None,
    skip: int = 0, 
    limit: int = 100
) -> Dict[str, Any]:
    """
    Genera un resumen financiero anual para estudiantes, incluyendo deuda mensual,
    deuda total pendiente y estado de morosidad.
    """
    
    # 1. Obtener estudiantes filtrados y paginados
    student_query_base = db.query(models.Student).filter(models.Student.is_active == True)
    if student_search_term:
        search = f"%{student_search_term}%"
        student_query_base = student_query_base.filter(
            or_(
                (models.Student.first_name + " " + models.Student.last_name).ilike(search),
                models.Student.first_name.ilike(search),
                models.Student.last_name.ilike(search),
                models.Student.cedula.ilike(search)
            )
        )
    
    all_matching_students = student_query_base.order_by(models.Student.last_name, models.Student.first_name).all()

    # 2. Generar la estructura de los 12 meses del año escolar
    school_year_months = _get_month_details_for_year(school_year_start_month, school_year_start_year)

    processed_summaries: List[schemas.StudentAnnualFinancialSummary] = []
    for student in all_matching_students:
        monthly_debt_details_list: List[schemas.MonthlyDebtDetail] = []
        
        # 3a. Calcular deuda generada mensualmente para el año escolar
        for month_info in school_year_months:
            monthly_charges_sum_ves = db.query(sql_func.sum(
                models.AppliedCharge.amount_due_ves_at_emission
            ))\
            .filter(models.AppliedCharge.student_id == student.id)\
            .filter(models.AppliedCharge.issue_date >= month_info["start_date"])\
            .filter(models.AppliedCharge.issue_date <= month_info["end_date"])\
            .filter(models.AppliedCharge.status != models.AppliedChargeStatus.CANCELLED)\
            .scalar() or 0.0
            
            monthly_charges_sum_ves = round(float(monthly_charges_sum_ves), 2)
            usd_eq_monthly = None
            if current_usd_rate and current_usd_rate > 0 and monthly_charges_sum_ves is not None:
                usd_eq_monthly = round(monthly_charges_sum_ves / current_usd_rate, 2)

            monthly_debt_details_list.append(schemas.MonthlyDebtDetail(
                month_year=month_info["month_year_str"],
                month_name=month_info["month_name"], # Ej: "Agosto 2024"
                debt_generated_ves=monthly_charges_sum_ves,
                debt_generated_usd_equivalent=usd_eq_monthly
            ))

        # 3b. Calcular Deuda Total Pendiente (de todos los tiempos, no solo del año escolar)
        #     (amount_due_original_currency - amount_paid_original_currency_equivalent)
        #     Esta lógica es más compleja si tenemos monedas mixtas. Simplificaremos a VES por ahora.
        #     Si los cargos están en USD y se pagan en VES, necesitamos la tasa de cada pago.
        #     Por ahora, nos basaremos en los saldos VES de los AppliedCharge.
        
        total_outstanding_ves = db.query(sql_func.sum(
            models.AppliedCharge.amount_due_ves_at_emission - models.AppliedCharge.amount_paid_ves
        ))\
        .filter(models.AppliedCharge.student_id == student.id)\
        .filter(models.AppliedCharge.status.in_([
            models.AppliedChargeStatus.PENDING, 
            models.AppliedChargeStatus.PARTIALLY_PAID,
            models.AppliedChargeStatus.OVERDUE
        ]))\
        .scalar() or 0.0
        total_outstanding_ves = round(float(total_outstanding_ves), 2)

        usd_eq_total_outstanding = None
        if current_usd_rate and current_usd_rate > 0 and total_outstanding_ves is not None:
            usd_eq_total_outstanding = round(total_outstanding_ves / current_usd_rate, 2)

        # 3c. Determinar Estado de Morosidad
        delinquency = _calculate_delinquency_status(db, student.id, current_processing_date)
        
        if delinquency_filter and delinquency != delinquency_filter:
            continue # Saltar este estudiante si no coincide con el filtro de morosidad

        # (Obtener total_outstanding_ves y usd_eq_total_outstanding como antes)
        total_outstanding_ves = db.query(sql_func.sum( models.AppliedCharge.amount_due_ves_at_emission - models.AppliedCharge.amount_paid_ves ))\
            .filter(models.AppliedCharge.student_id == student.id)\
            .filter(models.AppliedCharge.status.in_([models.AppliedChargeStatus.PENDING, models.AppliedChargeStatus.PARTIALLY_PAID, models.AppliedChargeStatus.OVERDUE ]))\
            .scalar() or 0.0
        total_outstanding_ves = round(float(total_outstanding_ves), 2)
        usd_eq_total_outstanding = None
        if current_usd_rate and current_usd_rate > 0:
            usd_eq_total_outstanding = round(total_outstanding_ves / current_usd_rate, 2)


        processed_summaries.append(schemas.StudentAnnualFinancialSummary(
            student_id=student.id,
            student_full_name=f"{student.first_name} {student.last_name}",
            student_cedula=student.cedula,
            monthly_debt_details=monthly_debt_details_list, # Esta ya se calculó antes
            total_outstanding_debt_ves=total_outstanding_ves,
            total_outstanding_debt_usd_equivalent=usd_eq_total_outstanding,
            delinquency_status=delinquency
        ))

    # Ahora aplicar paginación a la lista ya filtrada (incluyendo por morosidad)
    total_filtered_items = len(processed_summaries)
    paginated_items = processed_summaries[skip : skip + limit]

    return {
        "items": paginated_items,
        "total": total_filtered_items, # Total de items DESPUÉS de todos los filtros
        "page": (skip // limit) + 1 if limit > 0 else 1,
        "limit": limit,
        "pages": (total_filtered_items + limit - 1) // limit if limit > 0 else (1 if total_filtered_items > 0 else 0)
    }


def get_detailed_expense_transactions(
    db: Session,
    start_date: date,
    end_date: date,
    current_usd_rate: Optional[float] = None,
    include_only_category_id: Optional[int] = None,
    exclude_category_id: Optional[int] = None 
) -> List[schemas.DetailedExpenseTransaction]:
    """
    Obtiene un listado detallado de todas las transacciones de gastos
    dentro de un rango de fechas especificado.
    Excluye gastos cancelados.
    Permite excluir una categoría específica.
    """
    if start_date > end_date:
        raise ValueError("La fecha de inicio no puede ser posterior a la fecha de fin.")

    query = db.query(models.Expense)\
        .options(
            joinedload(models.Expense.supplier),
            joinedload(models.Expense.category)
        )\
        .filter(models.Expense.expense_date >= start_date)\
        .filter(models.Expense.expense_date <= end_date)\
        .filter(models.Expense.payment_status != models.ExpensePaymentStatus.CANCELLED)

    if include_only_category_id is not None:
        query = query.filter(models.Expense.category_id == include_only_category_id)
    elif exclude_category_id is not None: # Usar elif para que sean mutuamente excluyentes si se envían ambos por error
        query = query.filter(models.Expense.category_id != exclude_category_id)

    expenses_query = query.order_by(models.Expense.expense_date.asc(), models.Expense.id.asc()).all()

    detailed_transactions = []
    for expense in expenses_query:
        usd_equivalent = None
        ves_value_at_creation = expense.amount_ves_equivalent_at_creation if expense.amount_ves_equivalent_at_creation is not None else (expense.amount if expense.currency == models.Currency.VES else 0.0)

        if current_usd_rate and current_usd_rate > 0 and ves_value_at_creation is not None:
            usd_equivalent = round(ves_value_at_creation / current_usd_rate, 2)
        elif expense.currency == models.Currency.USD:
            usd_equivalent = expense.amount

        detailed_transactions.append(schemas.DetailedExpenseTransaction(
            expense_date=expense.expense_date,
            description=expense.description,
            category_name=expense.category.name if expense.category else None,
            supplier_name=expense.supplier.name if expense.supplier else "N/A",
            payment_status=expense.payment_status,
            original_amount=expense.amount,
            original_currency=expense.currency,
            amount_ves_at_creation=ves_value_at_creation,
            amount_usd_equivalent=usd_equivalent
        ))

    return detailed_transactions



# --- CRUD para Departamento ---

def create_department(db: Session, department: schemas.DepartmentCreate) -> models.Department:
    existing_department = db.query(models.Department).filter(models.Department.name == department.name).first()
    if existing_department:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A department with the name '{department.name}' already exists."
        )
    db_department = models.Department(**department.model_dump())
    db.add(db_department)
    db.commit()
    db.refresh(db_department)
    return db_department

def get_department(db: Session, department_id: int) -> Optional[models.Department]:
    return db.query(models.Department).filter(models.Department.id == department_id).first()

def get_department_by_name(db: Session, name: str) -> Optional[models.Department]: # Cambiado de get_departamento_by_nombre
    return db.query(models.Department).filter(models.Department.name == name).first()

def get_departments( # Cambiado de get_departamentos
    db: Session, 
    skip: int = 0, 
    limit: int = 100,
    search: Optional[str] = None
) -> Dict[str, Any]:
    query = db.query(models.Department)
    if search:
        search_term = f"%{search}%"
        query = query.filter(models.Department.name.ilike(search_term)) # Usar models.Department.name
    
    total = query.count()
    items = query.order_by(models.Department.name).offset(skip).limit(limit).all()
    
    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)
    current_page = (skip // limit) + 1 if limit > 0 else 1
    
    return {"items": items, "total": total, "page": current_page, "pages": pages, "limit": limit}

def update_department( # Cambiado de update_departamento
    db: Session, department_id: int, department_in: schemas.DepartmentUpdate
) -> Optional[models.Department]:
    db_department = get_department(db, department_id)
    if not db_department:
        return None

    update_data = department_in.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] != db_department.name:
        existing_department_by_name = get_department_by_name(db, name=update_data["name"]) # Cambiado
        if existing_department_by_name and existing_department_by_name.id != department_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Another department with the name '{update_data['name']}' already exists."
            )
    
    for key, value in update_data.items():
        setattr(db_department, key, value)
    
    db.add(db_department)
    db.commit()
    db.refresh(db_department)
    return db_department

def delete_department(db: Session, department_id: int) -> Optional[models.Department]: # Cambiado de delete_departamento
    db_department = get_department(db, department_id)
    if not db_department:
        return None
    
    associated_positions_count = db.query(models.Position).filter(models.Position.department_id == department_id).count() # Usar models.Position
    if associated_positions_count > 0:
        raise BusinessLogicError(
            detail=f"The department '{db_department.name}' cannot be deleted because it has {associated_positions_count} position(s) associated with it."
        )

    db.delete(db_department)
    db.commit()
    return db_department

# --- CRUD for Position ---

def create_position(db: Session, position: schemas.PositionCreate) -> models.Position: # Cambiado de create_cargo
    existing_position = db.query(models.Position).filter(models.Position.name == position.name).first() # Usar models.Position
    if existing_position:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A position with the name '{position.name}' already exists."
        )
    
    db_department = get_department(db, position.department_id) # Usar position.department_id
    if not db_department:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The department with ID {position.department_id} does not exist."
        )
        
    db_position = models.Position(**position.model_dump()) # Usar models.Position
    db.add(db_position)
    db.commit()
    db.refresh(db_position)
    return db.query(models.Position).options(joinedload(models.Position.department)).filter(models.Position.id == db_position.id).first()


def get_position(db: Session, position_id: int) -> Optional[models.Position]: # Cambiado de get_cargo
    return db.query(models.Position).options(joinedload(models.Position.department)).filter(models.Position.id == position_id).first()

def get_position_by_name(db: Session, name: str) -> Optional[models.Position]: # Cambiado
    return db.query(models.Position).options(joinedload(models.Position.department)).filter(models.Position.name == name).first()

def get_positions( # Cambiado de get_cargos
    db: Session, 
    skip: int = 0, 
    limit: int = 100, 
    department_id: Optional[int] = None,
    search: Optional[str] = None
) -> Dict[str, Any]:
    query = db.query(models.Position).options(joinedload(models.Position.department)) # Usar models.Position
    
    if department_id is not None:
        query = query.filter(models.Position.department_id == department_id)
    if search:
        search_term = f"%{search}%"
        query = query.filter(models.Position.name.ilike(search_term))
        
    total = query.count()
    items = query.order_by(models.Position.name).offset(skip).limit(limit).all()
    
    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)
    current_page = (skip // limit) + 1 if limit > 0 else 1
    
    return {"items": items, "total": total, "page": current_page, "pages": pages, "limit": limit}


def update_position(db: Session, position_id: int, position_in: schemas.PositionUpdate) -> Optional[models.Position]: # Cambiado de update_cargo
    db_position = get_position(db, position_id) 
    if not db_position:
        return None

    update_data = position_in.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] != db_position.name:
        existing_position_by_name = get_position_by_name(db, name=update_data["name"])
        if existing_position_by_name and existing_position_by_name.id != position_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Another position with the name '{update_data['name']}' already exists."
            )
            
    if "department_id" in update_data and update_data["department_id"] != db_position.department_id:
        db_department = get_department(db, update_data["department_id"])
        if not db_department:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The new department with ID {update_data['department_id']} does not exist."
            )

    for key, value in update_data.items():
        setattr(db_position, key, value)
    
    db.add(db_position)
    db.commit()
    db.refresh(db_position)
    return get_position(db, position_id)


def delete_position(db: Session, position_id: int) -> Optional[models.Position]: # Cambiado de delete_cargo
    db_position = get_position(db, position_id)
    if not db_position:
        return None
        
    associated_employees_count = db.query(models.Employee).filter(models.Employee.position_id == position_id).count() # Usar models.Employee y position_id
    if associated_employees_count > 0:
        raise BusinessLogicError(
            detail=f"The position '{db_position.name}' cannot be deleted because it has {associated_employees_count} employee(s) assigned to it."
        )

    db.delete(db_position)
    db.commit()
    return db_position


# --- CRUD for Employee ---

def create_employee(db: Session, employee_in: schemas.EmployeeCreate) -> models.Employee:
    # Validación de unicidad para identity_document
    if db.query(models.Employee).filter(models.Employee.identity_document == employee_in.identity_document).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Un empleado con el documento de identidad '{employee_in.identity_document}' ya existe.")
    
    # Validación de unicidad para personal_email si se proporciona
    if employee_in.personal_email and db.query(models.Employee).filter(models.Employee.personal_email == employee_in.personal_email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Un empleado con el email personal '{employee_in.personal_email}' ya existe.")
        
    # Validación de unicidad para employee_code si se proporciona
    if employee_in.employee_code and db.query(models.Employee).filter(models.Employee.employee_code == employee_in.employee_code).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Un empleado con el código de empleado '{employee_in.employee_code}' ya existe.")

    # Validar que position_id (cargo) exista
    db_position = get_position(db, employee_in.position_id)
    if not db_position:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"El cargo (posición) con ID {employee_in.position_id} no existe.")

    # Validar que user_id (usuario del sistema) exista si se proporciona y no esté vinculado
    if employee_in.user_id is not None:
        db_user = get_user(db, employee_in.user_id)
        if not db_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"El usuario del sistema con ID {employee_in.user_id} no existe.")
        if db.query(models.Employee).filter(models.Employee.user_id == employee_in.user_id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"El usuario del sistema con ID {employee_in.user_id} ya está asignado a otro empleado.")

    # Validaciones para campos salariales
    if employee_in.pay_frequency == models.EmployeePayFrequency.HOURLY:
        if employee_in.hourly_rate is None or employee_in.hourly_rate <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La tarifa por hora ('hourly_rate') es obligatoria y debe ser positiva si la frecuencia de pago es por hora.")
        if employee_in.base_salary_currency is None : # Moneda base debe estar definida para la tarifa horaria
             raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La moneda del salario base ('base_salary_currency') es obligatoria para la tarifa por hora.")
        # Para empleados por hora, base_salary_amount podría ser 0 o no aplicar, pero hourly_rate es clave.
    elif employee_in.pay_frequency in [models.EmployeePayFrequency.MONTHLY, models.EmployeePayFrequency.FORTNIGHTLY]:
        if employee_in.base_salary_amount is None or employee_in.base_salary_amount <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El monto del salario base ('base_salary_amount') es obligatorio y debe ser positivo para frecuencia mensual o quincenal.")
        if employee_in.base_salary_currency is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La moneda del salario base ('base_salary_currency') es obligatoria para el salario base.")
    
    # Si se proporciona un monto de salario base o tarifa por hora, la moneda base es obligatoria
    if (employee_in.base_salary_amount is not None and employee_in.base_salary_amount > 0) or \
       (employee_in.hourly_rate is not None and employee_in.hourly_rate > 0):
        if employee_in.base_salary_currency is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Se debe especificar la moneda del salario ('base_salary_currency') si se define un monto de salario base o tarifa por hora.")


    # Crear el diccionario de datos del modelo
    # Usamos model_dump() y el schema EmployeeCreate ya tiene los campos opcionales con default=None
    employee_data = employee_in.model_dump()
    
    # Los campos como accumulated_hours y current_balance_ves tienen defaults en el modelo SQLAlchemy
    # y no se establecen directamente aquí.

    db_employee = models.Employee(**employee_data)
    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)
    
    # Devolver el empleado con sus relaciones cargadas
    return get_employee(db, db_employee.id)

def get_employee(db: Session, employee_id: int) -> Optional[models.Employee]: # Cambiado
    return db.query(models.Employee).options(
        joinedload(models.Employee.position).joinedload(models.Position.department), # position, Position.department
        joinedload(models.Employee.system_user) # system_user
    ).filter(models.Employee.id == employee_id).first()

def get_employee_by_identity_document(db: Session, document: str) -> Optional[models.Employee]: # Cambiado
    return db.query(models.Employee).options(
        joinedload(models.Employee.position).joinedload(models.Position.department),
        joinedload(models.Employee.system_user)
    ).filter(models.Employee.identity_document == document).first() # identity_document

def get_employee_by_personal_email(db: Session, email: str) -> Optional[models.Employee]: # Cambiado
    return db.query(models.Employee).options(
        joinedload(models.Employee.position).joinedload(models.Position.department),
        joinedload(models.Employee.system_user)
    ).filter(models.Employee.personal_email == email).first() # personal_email
    
def get_employees(
    db: Session,
    skip: int = 0,
    limit: int = 10,
    search: Optional[str] = None,
    position_id: Optional[int] = None,
    department_id: Optional[int] = None,
    is_active: Optional[bool] = True,
    balance_filter: Optional[str] = None # NUEVO PARÁMETRO (ej: "positive", "zero", "negative")
) -> Dict[str, Any]:
    query = db.query(models.Employee).options(
        joinedload(models.Employee.position).joinedload(models.Position.department),
        joinedload(models.Employee.system_user)
    )

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                (models.Employee.first_name + " " + models.Employee.last_name).ilike(search_term),
                models.Employee.first_name.ilike(search_term),
                models.Employee.last_name.ilike(search_term),
                models.Employee.identity_document.ilike(search_term),
                models.Employee.personal_email.ilike(search_term) # Aunque se quite de la vista, el filtro puede seguir aquí
            )
        )

    if position_id is not None:
        query = query.filter(models.Employee.position_id == position_id)

    if department_id is not None:
        query = query.join(models.Position, models.Employee.position_id == models.Position.id)\
                     .filter(models.Position.department_id == department_id)

    if is_active is not None:
        query = query.filter(models.Employee.is_active == is_active)

    # --- NUEVA LÓGICA PARA FILTRAR POR SALDO ---
    if balance_filter == "positive":
        query = query.filter(models.Employee.current_balance_ves > 0)
    elif balance_filter == "zero":
        # Para saldo cero, es mejor considerar un pequeño rango por problemas de precisión con flotantes si fuera necesario,
        # pero como current_balance_ves se actualiza con sumas y restas de montos de 2 decimales,
        # la comparación directa con 0 podría ser suficiente.
        # Si se quiere más robustez para "casi cero":
        # query = query.filter(models.Employee.current_balance_ves > -0.001, models.Employee.current_balance_ves < 0.001)
        query = query.filter(models.Employee.current_balance_ves == 0)
    elif balance_filter == "negative":
        query = query.filter(models.Employee.current_balance_ves < 0)
    # Si balance_filter es None o un valor no reconocido, no se aplica filtro de saldo.
    # --- FIN DE LA NUEVA LÓGICA ---

    total = query.count()
    items = query.order_by(models.Employee.last_name, models.Employee.first_name).offset(skip).limit(limit).all()

    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)
    current_page = (skip // limit) + 1 if limit > 0 else 1

    return {"items": items, "total": total, "page": current_page, "pages": pages, "limit": limit}

def update_employee(db: Session, employee_id: int, employee_in: schemas.EmployeeUpdate) -> Optional[models.Employee]: # Cambiado
    db_employee = get_employee(db, employee_id)
    if not db_employee:
        return None

    update_data = employee_in.model_dump(exclude_unset=True)

    if "identity_document" in update_data and update_data["identity_document"] != db_employee.identity_document:
        if db.query(models.Employee).filter(models.Employee.identity_document == update_data["identity_document"], models.Employee.id != employee_id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Another employee with identity document '{update_data['identity_document']}' already exists.")
    
    if "personal_email" in update_data and update_data["personal_email"] and update_data["personal_email"] != db_employee.personal_email:
        if db.query(models.Employee).filter(models.Employee.personal_email == update_data["personal_email"], models.Employee.id != employee_id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Another employee with personal email '{update_data['personal_email']}' already exists.")

    if "employee_code" in update_data and update_data["employee_code"] and update_data["employee_code"] != db_employee.employee_code:
        if db.query(models.Employee).filter(models.Employee.employee_code == update_data["employee_code"], models.Employee.id != employee_id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Another employee with code '{update_data['employee_code']}' already exists.")

    if "position_id" in update_data and update_data["position_id"] != db_employee.position_id: # position_id
        db_position = get_position(db, update_data["position_id"]) # get_position
        if not db_position:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"The new position with ID {update_data['position_id']} does not exist.")

    if "user_id" in update_data:
        if update_data["user_id"] is not None:
            if update_data["user_id"] != db_employee.user_id:
                db_user = get_user(db, update_data["user_id"])
                if not db_user:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"System user with ID {update_data['user_id']} does not exist.")
                existing_link = db.query(models.Employee).filter(models.Employee.user_id == update_data["user_id"], models.Employee.id != employee_id).first()
                if existing_link:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"System user with ID {update_data['user_id']} is already linked to another employee.")
    
    for key, value in update_data.items():
        setattr(db_employee, key, value)
    
    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)
    return get_employee(db, employee_id)


def deactivate_employee(db: Session, employee_id: int) -> Optional[models.Employee]: # Cambiado
    db_employee = get_employee(db, employee_id)
    if not db_employee:
        return None
    if not db_employee.is_active:
        raise BusinessLogicError("The employee is already inactive.")
    
    db_employee.is_active = False
    # Considerar actualizar termination_date
    # if db_employee.termination_date is None:
    #     from datetime import date
    #     db_employee.termination_date = date.today()
        
    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)
    return get_employee(db, employee_id)


def activate_employee(db: Session, employee_id: int) -> Optional[models.Employee]: # Cambiado
    db_employee = get_employee(db, employee_id)
    if not db_employee:
        return None
    if db_employee.is_active:
        raise BusinessLogicError("The employee is already active.")
        
    db_employee.is_active = True
    # Considerar poner termination_date a None
    # db_employee.termination_date = None 

    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)
    return get_employee(db, employee_id)


# --- CRUD for SalaryComponentDefinition ---

def create_salary_component_definition(db: Session, component_def: schemas.SalaryComponentDefinitionCreate) -> models.SalaryComponentDefinition:
    existing_def = db.query(models.SalaryComponentDefinition).filter(models.SalaryComponentDefinition.name == component_def.name).first()
    if existing_def:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Un componente salarial con el nombre '{component_def.name}' ya existe.")
    
    if component_def.calculation_type == models.SalaryComponentCalculationType.FIXED_AMOUNT and component_def.default_currency is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La moneda por defecto ('default_currency') es obligatoria si el tipo de cálculo es 'Monto Fijo'.")
    if component_def.calculation_type == models.SalaryComponentCalculationType.PERCENTAGE_OF_BASE_SALARY and \
       (component_def.default_value is None or not (0 <= component_def.default_value <= 1)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El valor por defecto para porcentaje debe estar entre 0.0 y 1.0 (ej. 0.1 para 10%).")

    db_component_def = models.SalaryComponentDefinition(**component_def.model_dump())
    db.add(db_component_def)
    db.commit()
    db.refresh(db_component_def)
    return db_component_def

def get_salary_component_definition(db: Session, component_def_id: int) -> Optional[models.SalaryComponentDefinition]:
    return db.query(models.SalaryComponentDefinition).filter(models.SalaryComponentDefinition.id == component_def_id).first()

def get_salary_component_definitions(
    db: Session, skip: int = 0, limit: int = 100, 
    is_active: Optional[bool] = None, 
    component_type: Optional[models.SalaryComponentType] = None,
    search: Optional[str] = None
) -> Dict[str, Any]:
    query = db.query(models.SalaryComponentDefinition)
    if is_active is not None:
        query = query.filter(models.SalaryComponentDefinition.is_active == is_active)
    if component_type:
        query = query.filter(models.SalaryComponentDefinition.component_type == component_type)
    if search:
        search_term = f"%{search}%"
        query = query.filter(models.SalaryComponentDefinition.name.ilike(search_term))

    total = query.count()
    items = query.order_by(models.SalaryComponentDefinition.name).offset(skip).limit(limit).all()
    
    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)
    current_page = (skip // limit) + 1 if limit > 0 else 1
    return {"items": items, "total": total, "page": current_page, "pages": pages, "limit": limit}


def update_salary_component_definition(
    db: Session, component_def_id: int, component_def_in: schemas.SalaryComponentDefinitionUpdate
) -> Optional[models.SalaryComponentDefinition]:
    db_component_def = get_salary_component_definition(db, component_def_id)
    if not db_component_def:
        return None

    update_data = component_def_in.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] != db_component_def.name:
        if db.query(models.SalaryComponentDefinition).filter(models.SalaryComponentDefinition.name == update_data["name"], models.SalaryComponentDefinition.id != component_def_id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Otro componente salarial con el nombre '{update_data['name']}' ya existe.")

    # Validaciones si se cambian calculation_type, default_currency o default_value
    # (similar a las de creación)

    for key, value in update_data.items():
        setattr(db_component_def, key, value)
    
    db.add(db_component_def)
    db.commit()
    db.refresh(db_component_def)
    return db_component_def

def delete_salary_component_definition(db: Session, component_def_id: int) -> Optional[models.SalaryComponentDefinition]:
    db_component_def = get_salary_component_definition(db, component_def_id)
    if not db_component_def:
        return None
    
    # Verificar si está en uso en EmployeeSalaryComponent
    assignments_count = db.query(models.EmployeeSalaryComponent).filter(models.EmployeeSalaryComponent.component_definition_id == component_def_id).count()
    if assignments_count > 0:
        raise BusinessLogicError(detail=f"La definición del componente '{db_component_def.name}' no se puede eliminar porque está asignada a {assignments_count} empleado(s). Considere desactivarla.")

    db.delete(db_component_def)
    db.commit()
    return db_component_def

# --- CRUD for EmployeeSalaryComponent ---

def assign_salary_component_to_employee(db: Session, assignment: schemas.EmployeeSalaryComponentCreate) -> models.EmployeeSalaryComponent:
    # Verificar que empleado y definición existan
    db_employee = get_employee(db, assignment.employee_id)
    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Empleado con ID {assignment.employee_id} no encontrado.")
    db_component_def = get_salary_component_definition(db, assignment.component_definition_id)
    if not db_component_def:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Definición de componente salarial con ID {assignment.component_definition_id} no encontrada.")

    # Verificar si ya existe esta asignación
    existing_assignment = db.query(models.EmployeeSalaryComponent).filter(
        models.EmployeeSalaryComponent.employee_id == assignment.employee_id,
        models.EmployeeSalaryComponent.component_definition_id == assignment.component_definition_id
    ).first()
    if existing_assignment:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"El componente '{db_component_def.name}' ya está asignado al empleado '{db_employee.full_name}'. Puede actualizar la asignación existente.")

    db_assignment = models.EmployeeSalaryComponent(**assignment.model_dump())
    db.add(db_assignment)
    db.commit()
    db.refresh(db_assignment)
    # Recargar con relaciones para la respuesta
    return db.query(models.EmployeeSalaryComponent).options(
        joinedload(models.EmployeeSalaryComponent.component_definition)
    ).filter(models.EmployeeSalaryComponent.id == db_assignment.id).first()


def get_employee_salary_component(db: Session, assignment_id: int) -> Optional[models.EmployeeSalaryComponent]:
    return db.query(models.EmployeeSalaryComponent).options(
        joinedload(models.EmployeeSalaryComponent.component_definition),
        joinedload(models.EmployeeSalaryComponent.employee) # Para ver a quién pertenece
    ).filter(models.EmployeeSalaryComponent.id == assignment_id).first()

def get_salary_components_for_employee(db: Session, employee_id: int, is_active: Optional[bool] = True) -> List[models.EmployeeSalaryComponent]:
    query = db.query(models.EmployeeSalaryComponent).options(
        joinedload(models.EmployeeSalaryComponent.component_definition)
    ).filter(models.EmployeeSalaryComponent.employee_id == employee_id)
    if is_active is not None:
        query = query.filter(models.EmployeeSalaryComponent.is_active == is_active)
    return query.order_by(models.EmployeeSalaryComponent.component_definition_id).all() # O por nombre del componente

def update_employee_salary_component_assignment(
    db: Session, assignment_id: int, assignment_in: schemas.EmployeeSalaryComponentUpdate
) -> Optional[models.EmployeeSalaryComponent]:
    db_assignment = get_employee_salary_component(db, assignment_id)
    if not db_assignment:
        return None
    
    update_data = assignment_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_assignment, key, value)
        
    db.add(db_assignment)
    db.commit()
    db.refresh(db_assignment)
    return get_employee_salary_component(db, assignment_id) # Para devolver con relaciones

def delete_employee_salary_component_assignment(db: Session, assignment_id: int) -> Optional[models.EmployeeSalaryComponent]:
    db_assignment = get_employee_salary_component(db, assignment_id)
    if not db_assignment:
        return None
    # Aquí podrías verificar si este componente se usó en alguna nómina histórica antes de permitir el borrado.
    # Por ahora, es un borrado directo de la asignación.
    db.delete(db_assignment)
    db.commit()
    return db_assignment


# --- Helper para Cálculo de Nómina por Empleado ---
def _calculate_employee_payroll_details_for_run(
    db: Session,
    employee: models.Employee,
    payroll_run: models.PayrollRun, # Contiene period_start, period_end, pay_frequency_covered, exchange_rate_usd_ves
    accumulated_hours_input: Optional[float] = None
) -> Tuple[float, float, float, float, str, Optional[float]]:
    """
    Calcula los detalles de la nómina para un empleado en una corrida específica.
    Devuelve: (base_salary_period_ves, total_earnings_ves, total_deductions_ves, net_to_pay_ves, applied_components_json_str, hours_processed)
    """
    if not payroll_run.exchange_rate_usd_ves and employee.base_salary_currency == models.Currency.USD:
        active_usd_components = db.query(models.EmployeeSalaryComponent).join(models.SalaryComponentDefinition)\
            .filter(models.EmployeeSalaryComponent.employee_id == employee.id,
                    models.EmployeeSalaryComponent.is_active == True,
                    models.SalaryComponentDefinition.calculation_type == models.SalaryComponentCalculationType.FIXED_AMOUNT,
                    ( (models.EmployeeSalaryComponent.override_currency == models.Currency.USD) | \
                      ((models.EmployeeSalaryComponent.override_currency == None) & (models.SalaryComponentDefinition.default_currency == models.Currency.USD)) )
            ).count() > 0
        if active_usd_components:
             raise BusinessLogicError(f"Se requiere tasa de cambio USD-VES en la corrida de nómina para procesar al empleado {employee.full_name} debido a componentes en USD.")

    base_salary_for_period_ves = 0.0
    hours_processed_for_run = None

    if employee.pay_frequency == models.EmployeePayFrequency.HOURLY and payroll_run.pay_frequency_covered == models.EmployeePayFrequency.HOURLY:
        if accumulated_hours_input is None or accumulated_hours_input < 0:
            raise BusinessLogicError(f"Se requieren horas acumuladas válidas para el empleado por hora: {employee.full_name}")
        rate_for_hourly = employee.hourly_rate or 0
        base_salary_for_period_original_currency = rate_for_hourly * accumulated_hours_input
        if employee.base_salary_currency == models.Currency.USD:
            if not payroll_run.exchange_rate_usd_ves: raise BusinessLogicError("Tasa USD no definida en PayrollRun para empleado por hora con tarifa en USD.")
            base_salary_for_period_ves = round(base_salary_for_period_original_currency * payroll_run.exchange_rate_usd_ves, 2)
        else: # VES
            base_salary_for_period_ves = round(base_salary_for_period_original_currency, 2)
        hours_processed_for_run = accumulated_hours_input
    
    elif employee.pay_frequency == payroll_run.pay_frequency_covered and employee.pay_frequency in [models.EmployeePayFrequency.MONTHLY, models.EmployeePayFrequency.FORTNIGHTLY]:
        base_salary_original_currency = employee.base_salary_amount or 0
        if employee.pay_frequency == models.EmployeePayFrequency.MONTHLY and payroll_run.pay_frequency_covered == models.EmployeePayFrequency.FORTNIGHTLY:
            base_salary_original_currency /= 2 
        
        if employee.base_salary_currency == models.Currency.USD:
            if not payroll_run.exchange_rate_usd_ves: raise BusinessLogicError("Tasa USD no definida en PayrollRun para empleado con salario en USD.")
            base_salary_for_period_ves = round(base_salary_original_currency * payroll_run.exchange_rate_usd_ves, 2)
        else: # VES
            base_salary_for_period_ves = round(base_salary_original_currency, 2)

    total_earnings_ves = base_salary_for_period_ves
    total_deductions_ves = 0.0
    
    # LA CORRECCIÓN ESTÁ AQUÍ: "earning" en minúscula
    applied_components_list = [{"name": "Salario Base del Período", "type": "earning", "amount_ves": base_salary_for_period_ves}]

    assigned_components = db.query(models.EmployeeSalaryComponent)\
        .join(models.SalaryComponentDefinition)\
        .filter(models.EmployeeSalaryComponent.employee_id == employee.id,
                models.EmployeeSalaryComponent.is_active == True,
                models.SalaryComponentDefinition.is_active == True)\
        .all()

    for assignment in assigned_components:
        comp_def = assignment.component_definition
        component_value_ves = 0.0
        value_to_use = assignment.override_value if assignment.override_value is not None else comp_def.default_value
        currency_of_value = assignment.override_currency if assignment.override_value is not None and assignment.override_currency else comp_def.default_currency

        if value_to_use is None: continue

        if comp_def.calculation_type == models.SalaryComponentCalculationType.FIXED_AMOUNT:
            if currency_of_value == models.Currency.USD:
                if not payroll_run.exchange_rate_usd_ves: continue
                component_value_ves = round(value_to_use * payroll_run.exchange_rate_usd_ves, 2)
            else: # VES
                component_value_ves = round(value_to_use, 2)
        elif comp_def.calculation_type == models.SalaryComponentCalculationType.PERCENTAGE_OF_BASE_SALARY:
            component_value_ves = round(base_salary_for_period_ves * value_to_use, 2)
        
        if comp_def.component_type == models.SalaryComponentType.EARNING:
            total_earnings_ves += component_value_ves
        elif comp_def.component_type == models.SalaryComponentType.DEDUCTION:
            total_deductions_ves += component_value_ves
        
        applied_components_list.append({
            "name": comp_def.name,
            "type": comp_def.component_type.value,
            "amount_ves": component_value_ves
        })

    net_to_pay_ves = round(total_earnings_ves - total_deductions_ves, 2)
    applied_components_json_str = json.dumps(applied_components_list)

    return base_salary_for_period_ves, total_earnings_ves, total_deductions_ves, net_to_pay_ves, applied_components_json_str, hours_processed_for_run


def create_payroll_run_draft(db: Session, payroll_run_in: schemas.PayrollRunCreate, processed_by_user_id: int) -> models.PayrollRun:
    if payroll_run_in.period_start_date >= payroll_run_in.period_end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La fecha de inicio del período debe ser anterior a la fecha de fin.")

    # Validar si se necesita tasa de cambio y si se proporcionó
    # (Esto es una validación preliminar; la validación más robusta se hará empleado por empleado al confirmar)
    # if payroll_run_in.exchange_rate_usd_ves is None:
    # Lógica para verificar si hay empleados/componentes en USD que necesitarían esta tasa podría ir aquí.
    # O, si no se provee, intentar obtener la más reciente para period_end_date:
    #     latest_rate_model = get_latest_exchange_rate(db, from_currency=models.Currency.USD, to_currency=models.Currency.VES, on_date=payroll_run_in.period_end_date)
    #     if latest_rate_model:
    #         payroll_run_in.exchange_rate_usd_ves = latest_rate_model.rate
    #     # else: Si sigue siendo None y es necesaria, el proceso de confirmación fallará para esos empleados.

    db_payroll_run = models.PayrollRun(
        name=payroll_run_in.name,
        period_start_date=payroll_run_in.period_start_date,
        period_end_date=payroll_run_in.period_end_date,
        pay_frequency_covered=payroll_run_in.pay_frequency_covered,
        exchange_rate_usd_ves=payroll_run_in.exchange_rate_usd_ves, # Puede ser None
        status=models.PayrollRunStatus.DRAFT, # Siempre se crea como borrador
        processed_by_user_id=processed_by_user_id # Quién inició el borrador
    )
    db.add(db_payroll_run)
    db.commit()
    db.refresh(db_payroll_run)
    return db_payroll_run

def get_payroll_run(db: Session, payroll_run_id: int) -> Optional[models.PayrollRun]:
    return db.query(models.PayrollRun).options(
        joinedload(models.PayrollRun.processed_by_user),
        joinedload(models.PayrollRun.employee_details).joinedload(models.PayrollRunEmployeeDetail.employee) # Cargar empleados básicos
    ).filter(models.PayrollRun.id == payroll_run_id).first()

def get_payroll_runs(
    db: Session, skip: int = 0, limit: int = 100,
    status: Optional[models.PayrollRunStatus] = None,
    pay_frequency: Optional[models.EmployeePayFrequency] = None,
    start_date_filter: Optional[date] = None, # Filtra por period_start_date >=
    end_date_filter: Optional[date] = None    # Filtra por period_end_date <=
) -> Dict[str, Any]:
    query = db.query(models.PayrollRun).options(joinedload(models.PayrollRun.processed_by_user))
    if status:
        query = query.filter(models.PayrollRun.status == status)
    if pay_frequency:
        query = query.filter(models.PayrollRun.pay_frequency_covered == pay_frequency)
    if start_date_filter:
        query = query.filter(models.PayrollRun.period_start_date >= start_date_filter)
    if end_date_filter:
        query = query.filter(models.PayrollRun.period_end_date <= end_date_filter)
    
    total = query.count()
    items = query.order_by(models.PayrollRun.period_start_date.desc(), models.PayrollRun.created_at.desc()).offset(skip).limit(limit).all()
    
    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)
    current_page = (skip // limit) + 1 if limit > 0 else 1
    return {"items": items, "total": total, "page": current_page, "pages": pages, "limit": limit}

def process_and_confirm_payroll_run(
    db: Session, payroll_run_id: int, confirming_user_id: int,
    employee_hours_map: Optional[Dict[int, float]] = None # {employee_id: hours} para los por hora
) -> models.PayrollRun:
    db_payroll_run = get_payroll_run(db, payroll_run_id)
    if not db_payroll_run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corrida de nómina no encontrada.")
    if db_payroll_run.status != models.PayrollRunStatus.DRAFT:
        raise BusinessLogicError(f"La corrida de nómina ya está en estado '{db_payroll_run.status.value}' y no puede ser reprocesada como borrador.")

    # Si la tasa no se fijó al crear el DRAFT y es necesaria, intentar obtenerla ahora.
    # Esto es crucial si hay componentes USD o salarios base en USD.
    if db_payroll_run.exchange_rate_usd_ves is None:
        # Verificar si es necesaria (ej. algún empleado elegible tiene salario/componente en USD)
        # Aquí, por simplicidad, si no está, la intentamos obtener para el día final del período.
        # Una lógica más robusta chequearía si realmente se necesita antes de fallar si no se encuentra.
        rate_model = get_latest_exchange_rate(db, from_currency=models.Currency.USD, to_currency=models.Currency.VES, on_date=db_payroll_run.period_end_date)
        if rate_model and rate_model.rate:
            db_payroll_run.exchange_rate_usd_ves = rate_model.rate
        else:
            # Antes de fallar, verificar si realmente se necesita la tasa
            # (ej. si todos los empleados y sus componentes son VES)
            # Por ahora, si no se pudo obtener y es potencialmente necesaria, se podría advertir o fallar más adelante empleado por empleado.
            pass # _calculate_employee_payroll_details_for_run lanzará error si la necesita y no está

    # Obtener empleados elegibles
    eligible_employees_query = db.query(models.Employee).filter(
        models.Employee.is_active == True,
        models.Employee.pay_frequency == db_payroll_run.pay_frequency_covered
        # Podrías añadir filtro por fecha de ingreso/egreso vs período de nómina
    )
    # Si db_payroll_run.target_employee_ids (si implementas ese campo para corridas específicas)
    # eligible_employees_query = eligible_employees_query.filter(models.Employee.id.in_(db_payroll_run.target_employee_ids))
    
    eligible_employees = eligible_employees_query.all()

    if not eligible_employees:
        db_payroll_run.processing_notes = "No se encontraron empleados elegibles para esta frecuencia de pago en el período."
        db_payroll_run.status = models.PayrollRunStatus.CONFIRMED # Confirmado, pero vacío
        db_payroll_run.processed_by_user_id = confirming_user_id
        db_payroll_run.processed_at = datetime.utcnow()
        db.add(db_payroll_run)
        db.commit()
        db.refresh(db_payroll_run)
        return db_payroll_run
        
    # Eliminar detalles previos si se está reprocesando un DRAFT
    db.query(models.PayrollRunEmployeeDetail).filter(models.PayrollRunEmployeeDetail.payroll_run_id == payroll_run_id).delete()
    db.flush() # Aplicar delete antes de añadir nuevos

    for emp in eligible_employees:
        accumulated_hours = None
        if emp.pay_frequency == models.EmployeePayFrequency.HOURLY:
            if employee_hours_map and emp.id in employee_hours_map:
                accumulated_hours = employee_hours_map[emp.id]
            elif emp.accumulated_hours is not None: # Usar las acumuladas en el empleado si no se provee mapa
                accumulated_hours = emp.accumulated_hours
            else:
                # Omitir empleado por hora si no hay horas que procesar, o error si se espera
                db_payroll_run.processing_notes = (db_payroll_run.processing_notes or "") + f"\nEmpleado por hora {emp.full_name} omitido: sin horas especificadas."
                continue
        
        try:
            base_salary_ves, earnings_ves, deductions_ves, net_ves, components_json, hours_processed = \
                _calculate_employee_payroll_details_for_run(db, emp, db_payroll_run, accumulated_hours)

            detail = models.PayrollRunEmployeeDetail(
                payroll_run_id=payroll_run_id,
                employee_id=emp.id,
                base_salary_amount_period_ves=base_salary_ves,
                total_earnings_ves=earnings_ves,
                total_deductions_ves=deductions_ves,
                net_amount_to_pay_ves=net_ves,
                applied_components_details_json=components_json,
                accumulated_hours_processed=hours_processed
            )
            db.add(detail)
            
            # Actualizar saldo del empleado
            emp.current_balance_ves = (emp.current_balance_ves or 0.0) + net_ves
            if emp.pay_frequency == models.EmployeePayFrequency.HOURLY and hours_processed is not None:
                emp.accumulated_hours = (emp.accumulated_hours or 0.0) - hours_processed # O resetear a 0
                if emp.accumulated_hours < 0: emp.accumulated_hours = 0.0
            db.add(emp)

        except BusinessLogicError as e_ble_calc:
            # Si el cálculo falla para un empleado (ej. falta tasa y es necesaria), se registra en notas y se continúa
            db_payroll_run.processing_notes = (db_payroll_run.processing_notes or "") + f"\nError procesando empleado {emp.full_name} (ID: {emp.id}): {e_ble_calc.detail}"
            continue # Saltar al siguiente empleado


    db_payroll_run.status = models.PayrollRunStatus.CONFIRMED
    db_payroll_run.processed_by_user_id = confirming_user_id
    db_payroll_run.processed_at = datetime.utcnow() # Usar UTC para fechas de servidor
    db.add(db_payroll_run)
    
    try:
        db.commit()
    except Exception as e_commit:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al confirmar la nómina: {str(e_commit)}")
        
    db.refresh(db_payroll_run)
    # Recargar con todos los detalles para la respuesta
    return get_payroll_run(db, payroll_run_id)


def update_payroll_run_status(
    db: Session, payroll_run_id: int, new_status: models.PayrollRunStatus, 
    updated_by_user_id: int, notes: Optional[str] = None
) -> Optional[models.PayrollRun]:
    db_payroll_run = get_payroll_run(db, payroll_run_id)
    if not db_payroll_run:
        return None

    # Lógica de transición de estados (ejemplo básico)
    if db_payroll_run.status == models.PayrollRunStatus.CANCELLED:
        raise BusinessLogicError("No se puede cambiar el estado de una corrida de nómina cancelada.")
    if db_payroll_run.status == models.PayrollRunStatus.PAID_OUT and new_status != models.PayrollRunStatus.CANCELLED: # Podrías permitir cancelar una pagada con lógica de reversión
        raise BusinessLogicError("Una corrida de nómina pagada solo puede ser cancelada (con implicaciones).")
    if db_payroll_run.status == models.PayrollRunStatus.CONFIRMED and new_status == models.PayrollRunStatus.DRAFT:
        raise BusinessLogicError("No se puede revertir una nómina confirmada a borrador directamente. Considere cancelarla y crear una nueva.")

    db_payroll_run.status = new_status
    db_payroll_run.processed_by_user_id = updated_by_user_id # Quién hizo el último cambio de estado relevante
    db_payroll_run.processed_at = datetime.utcnow() # Momento del cambio de estado
    if notes:
        db_payroll_run.processing_notes = (db_payroll_run.processing_notes or "") + f"\nActualización: {notes}"
    
    db.add(db_payroll_run)
    db.commit()
    db.refresh(db_payroll_run)
    return db_payroll_run

def delete_payroll_run_draft(db: Session, payroll_run_id: int) -> Optional[models.PayrollRun]:
    db_payroll_run = get_payroll_run(db, payroll_run_id) # get_payroll_run carga los employee_details
    if not db_payroll_run:
        return None
    if db_payroll_run.status != models.PayrollRunStatus.DRAFT:
        raise BusinessLogicError("Solo se pueden eliminar corridas de nómina en estado 'Borrador'.")
    
    # Los employee_details se eliminan en cascada debido a cascade="all, delete-orphan" en la relación
    db.delete(db_payroll_run)
    db.commit()
    return db_payroll_run # El objeto estará marcado como eliminado en la sesión


# --- CRUD for EmployeeBalanceAdjustment ---

def create_employee_balance_adjustment(db: Session, adjustment_in: schemas.EmployeeBalanceAdjustmentCreate, created_by_user_id: int) -> models.EmployeeBalanceAdjustment:
    db_employee = get_employee(db, adjustment_in.employee_id)
    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Empleado con ID {adjustment_in.employee_id} no encontrado.")

    amount_ves_calculated = 0.0
    rate_applied = None

    if adjustment_in.currency == models.Currency.VES:
        amount_ves_calculated = adjustment_in.amount
    elif adjustment_in.currency == models.Currency.USD:
        # Usar _calculate_converted_amount_ves que ya maneja la búsqueda de tasa y error
        try:
            amount_ves_calculated, rate_applied = _calculate_converted_amount_ves(
                db, 
                original_amount=adjustment_in.amount, 
                original_currency=models.Currency.USD, 
                rate_date=adjustment_in.adjustment_date
            )
        except HTTPException as e_rate: # Si _calculate_converted_amount_ves lanza error (ej. sin tasa)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Error al convertir monto del ajuste: {e_rate.detail}")
    else: # Otras monedas no soportadas para ajuste directo por ahora
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Moneda '{adjustment_in.currency.value}' no soportada para ajustes directos de saldo.")

    db_adjustment = models.EmployeeBalanceAdjustment(
        employee_id=adjustment_in.employee_id,
        adjustment_date=adjustment_in.adjustment_date,
        description=adjustment_in.description,
        adjustment_type=adjustment_in.adjustment_type,
        amount=adjustment_in.amount,
        currency=adjustment_in.currency,
        exchange_rate_usd_ves=rate_applied,
        amount_ves=amount_ves_calculated,
        created_by_user_id=created_by_user_id
    )
    db.add(db_adjustment)

    # Actualizar saldo del empleado
    if adjustment_in.adjustment_type == models.EmployeeBalanceAdjustmentType.EARNING:
        db_employee.current_balance_ves = (db_employee.current_balance_ves or 0.0) + amount_ves_calculated
    elif adjustment_in.adjustment_type == models.EmployeeBalanceAdjustmentType.DEDUCTION:
        db_employee.current_balance_ves = (db_employee.current_balance_ves or 0.0) - amount_ves_calculated
    db.add(db_employee)
    
    db.commit()
    db.refresh(db_adjustment)
    db.refresh(db_employee) # Asegurar que el empleado también está refrescado
    return db_adjustment


def get_employee_balance_adjustment(db: Session, adjustment_id: int) -> Optional[models.EmployeeBalanceAdjustment]:
    return db.query(models.EmployeeBalanceAdjustment).options(
        joinedload(models.EmployeeBalanceAdjustment.employee),
        joinedload(models.EmployeeBalanceAdjustment.created_by_user)
    ).filter(models.EmployeeBalanceAdjustment.id == adjustment_id).first()

def get_balance_adjustments_for_employee(
    db: Session, employee_id: int, skip: int = 0, limit: int = 100
) -> Dict[str, Any]:
    query = db.query(models.EmployeeBalanceAdjustment).options(
        joinedload(models.EmployeeBalanceAdjustment.created_by_user) # Empleado ya se conoce por el filtro
    ).filter(models.EmployeeBalanceAdjustment.employee_id == employee_id)
    
    total = query.count()
    items = query.order_by(models.EmployeeBalanceAdjustment.adjustment_date.desc()).offset(skip).limit(limit).all()

    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)
    current_page = (skip // limit) + 1 if limit > 0 else 1
    return {"items": items, "total": total, "page": current_page, "pages": pages, "limit": limit}


# --- CRUD for EmployeePayment ---

def create_employee_payment(
    db: Session,
    payment_in: schemas.EmployeePaymentCreate,
    created_by_user_id: int,
    default_expense_category_name: str = "Sueldos y Salarios del Personal"
) -> models.EmployeePayment:
    db_employee = get_employee(db, payment_in.employee_id)
    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Empleado con ID {payment_in.employee_id} no encontrado.")

    db_employee_payment = models.EmployeePayment(
        employee_id=payment_in.employee_id,
        payment_date=payment_in.payment_date,
        amount_paid_ves=payment_in.amount_paid_ves,
        payment_method=payment_in.payment_method,
        reference_number=payment_in.reference_number,
        notes=payment_in.notes,
        created_by_user_id=created_by_user_id
    )
    db.add(db_employee_payment)

    db_employee.current_balance_ves = (db_employee.current_balance_ves or 0.0) - payment_in.amount_paid_ves
    db.add(db_employee)

    school_config = get_school_configuration(db)
    if not school_config:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="La configuración de la escuela no está establecida, no se puede generar el recibo de pago."
        )
    
    db.flush()
    create_payslip(db, employee_payment=db_employee_payment, school_config=school_config)

    expense_category = get_expense_category_by_name(db, name=default_expense_category_name)
    if not expense_category:
        category_to_create = schemas.ExpenseCategoryCreate(name=default_expense_category_name, description="Gastos relacionados con la nómina y pagos al personal.")
        expense_category = create_expense_category(db, category_in=category_to_create)

    expense_description = f"Pago de nómina/salario a {db_employee.full_name} ({db_employee.identity_document or 'ID N/A'}). Fecha Pago: {payment_in.payment_date.strftime('%d/%m/%Y')}."
    if payment_in.reference_number:
        expense_description += f" Ref: {payment_in.reference_number}."

    expense_data_in = schemas.ExpenseCreate(
        expense_date=payment_in.payment_date,
        description=expense_description,
        category_id=expense_category.id,
        supplier_id=None,
        amount=payment_in.amount_paid_ves,
        currency=models.Currency.VES,
        notes=f"Pago automático generado desde módulo de personal."
    )

    # Llama a la función `create_expense` que ahora sí recibirá un objeto válido
    new_expense_record = create_expense(db=db, expense_in=expense_data_in, user_id=created_by_user_id)
    
    # --- El resto de la lógica para vincular el gasto y el pago ---
    if new_expense_record and new_expense_record.id:
        db.flush()
        if db_employee_payment.id:
             new_expense_record.notes = f"Pago automático generado desde módulo de personal. ID de Pago a Empleado: {db_employee_payment.id}"
             db.add(new_expense_record)
        
        expense_payment_for_expense_record = schemas.ExpensePaymentCreate(
            expense_id=new_expense_record.id,
            payment_date=payment_in.payment_date,
            amount_paid=new_expense_record.amount,
            currency_paid=models.Currency.VES,
            payment_method_used=payment_in.payment_method if payment_in.payment_method else "Pago de Nómina",
            reference_number=payment_in.reference_number,
            notes=f"Registro automático de pago para gasto de nómina del empleado {db_employee.full_name}."
        )
        try:
            create_expense_payment(db=db, payment_in=expense_payment_for_expense_record, user_id=created_by_user_id)
        except HTTPException as e_exp_pay_create:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al registrar el pago interno para el gasto de nómina: {e_exp_pay_create.detail}")
    else:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="No se pudo crear el registro de gasto base para el pago del empleado.")

    try:
        db.commit()
    except Exception as e_commit_final:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error final al guardar pago y gasto asociado: {str(e_commit_final)}")

    db.refresh(db_employee_payment)
    db.refresh(db_employee)

    if new_expense_record and new_expense_record.id:
        db.refresh(new_expense_record)

    return db_employee_payment


def get_employee_payment(db: Session, payment_id: int) -> Optional[models.EmployeePayment]:
    return db.query(models.EmployeePayment).options(
        joinedload(models.EmployeePayment.employee),
        joinedload(models.EmployeePayment.created_by_user)
    ).filter(models.EmployeePayment.id == payment_id).first()

def get_payments_for_employee(
    db: Session, employee_id: int, skip: int = 0, limit: int = 100
) -> Dict[str, Any]:
    query = db.query(models.EmployeePayment).options(
        joinedload(models.EmployeePayment.created_by_user)
    ).filter(models.EmployeePayment.employee_id == employee_id)
    
    total = query.count()
    items = query.order_by(models.EmployeePayment.payment_date.desc()).offset(skip).limit(limit).all()

    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)
    current_page = (skip // limit) + 1 if limit > 0 else 1
    return {"items": items, "total": total, "page": current_page, "pages": pages, "limit": limit}


# Lógica para recibos de pago a empleados


def create_payslip(
    db: Session, 
    employee_payment: models.EmployeePayment, 
    school_config: models.SchoolConfiguration
) -> models.Payslip:
    """
    Crea un recibo de pago (Payslip) buscando el desglose en la corrida de nómina más reciente.
    """
    employee = employee_payment.employee
    
    # --- Lógica Clave: Buscar el desglose en la última corrida de nómina confirmada ---
    latest_payroll_detail = db.query(models.PayrollRunEmployeeDetail)\
        .filter(models.PayrollRunEmployeeDetail.employee_id == employee.id)\
        .order_by(models.PayrollRunEmployeeDetail.payroll_run_id.desc())\
        .first()

    total_earnings = employee_payment.amount_paid_ves
    total_deductions = 0.0
    payment_breakdown_str = json.dumps([{
        "name": "Pago de Saldo/Adelanto",
        "type": "earning",
        "amount_ves": employee_payment.amount_paid_ves
    }])
    period_start = None
    period_end = None

    if latest_payroll_detail:
        # Si encontramos un detalle de nómina, usamos su desglose
        total_earnings = latest_payroll_detail.total_earnings_ves
        total_deductions = latest_payroll_detail.total_deductions_ves
        payment_breakdown_str = latest_payroll_detail.applied_components_details_json
        period_start = latest_payroll_detail.payroll_run.period_start_date
        period_end = latest_payroll_detail.payroll_run.period_end_date

    db_payslip = models.Payslip(
        employee_payment_id=employee_payment.id,
        employee_id=employee.id,
        employee_full_name_snapshot=f"{employee.first_name} {employee.last_name}",
        employee_identity_document_snapshot=employee.identity_document,
        employee_position_snapshot=employee.position.name if employee.position else "N/A",
        employee_department_snapshot=employee.position.department.name if employee.position and employee.position.department else "N/A",
        school_name_snapshot=school_config.school_name,
        school_rif_snapshot=school_config.school_rif,
        payment_date_snapshot=employee_payment.payment_date,
        period_start_date=period_start,
        period_end_date=period_end,
        total_earnings_ves=total_earnings,
        total_deductions_ves=total_deductions,
        net_pay_ves=employee_payment.amount_paid_ves, # El neto pagado es el del pago actual
        payment_breakdown_json=payment_breakdown_str
    )
    
    db.add(db_payslip)
    return db_payslip


def get_payslip(db: Session, payslip_id: int) -> Optional[models.Payslip]:
    """Obtiene un único recibo de pago por su ID."""
    return db.query(models.Payslip).options(
        joinedload(models.Payslip.employee_payment).joinedload(models.EmployeePayment.employee)
    ).filter(models.Payslip.id == payslip_id).first()


def get_payslips(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    position_id: Optional[int] = None, # <--- NUEVO PARÁMETRO
) -> Dict[str, Any]:
    """Obtiene una lista paginada de recibos de pago con filtros."""
    
    query = db.query(models.Payslip)

    if position_id is not None:
        # Hacemos un JOIN con la tabla Employee para poder filtrar por position_id
        query = query.join(models.Employee, models.Payslip.employee_id == models.Employee.id)\
                     .filter(models.Employee.position_id == position_id)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                models.Payslip.employee_full_name_snapshot.ilike(search_term),
                models.Payslip.employee_identity_document_snapshot.ilike(search_term)
            )
        )
    
    if start_date:
        query = query.filter(models.Payslip.payment_date_snapshot >= start_date)
    if end_date:
        query = query.filter(models.Payslip.payment_date_snapshot <= end_date)

    total = query.count()
    
    items = query.order_by(models.Payslip.payment_date_snapshot.desc(), models.Payslip.id.desc()).offset(skip).limit(limit).all()
    
    pages = (total + limit - 1) // limit if limit > 0 else (1 if total > 0 else 0)
    current_page = (skip // limit) + 1 if limit > 0 else 1

    return {
        "items": items,
        "total": total,
        "page": current_page,
        "pages": pages,
        "limit": limit,
    }


def apply_available_credit(db: Session, representative_id: int) -> models.Representative:
    """
    Aplica el saldo a favor disponible de un representante a sus deudas pendientes,
    priorizando las más antiguas.
    """
    # 1. Obtener el representante y verificar que tiene saldo a favor
    db_representative = get_representative(db, representative_id=representative_id)
    if not db_representative:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Representante no encontrado.")
    
    available_credit = db_representative.available_credit_ves
    if available_credit <= 0.01: # Un pequeño margen para errores de flotantes
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El representante no tiene saldo a favor para aplicar.")

    # 2. Obtener todas las deudas pendientes (cargos) del representante, ordenadas por fecha de vencimiento
    pending_charges = db.query(models.AppliedCharge).filter(
        and_(
            models.AppliedCharge.student.has(models.Student.representative_id == representative_id),
            models.AppliedCharge.status.in_([AppliedChargeStatus.PENDING, AppliedChargeStatus.PARTIALLY_PAID, AppliedChargeStatus.OVERDUE])
        )
    ).order_by(models.AppliedCharge.due_date.asc()).all()

    if not pending_charges:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El representante no tiene deudas pendientes a las cuales aplicar el saldo.")

    credit_left_to_apply = available_credit
    
    # 3. Iterar sobre las deudas y aplicar el crédito
    for charge in pending_charges:
        if credit_left_to_apply <= 0:
            break

        debt_on_charge = round(charge.amount_due_ves_at_emission - charge.amount_paid_ves, 2)
        
        if debt_on_charge <= 0:
            continue

        amount_to_apply_on_this_charge = min(credit_left_to_apply, debt_on_charge)
        
        # Actualizar el cargo
        charge.amount_paid_ves = round(charge.amount_paid_ves + amount_to_apply_on_this_charge, 2)
        
        # Actualizar el estado del cargo
        if charge.amount_paid_ves >= (charge.amount_due_ves_at_emission - 0.01):
            charge.status = AppliedChargeStatus.PAID
        else:
            charge.status = AppliedChargeStatus.PARTIALLY_PAID
        
        db.add(charge)
        
        # Reducir el crédito disponible
        credit_left_to_apply -= amount_to_apply_on_this_charge

    # 4. Actualizar el saldo a favor del representante
    final_credit_applied = round(available_credit - credit_left_to_apply, 2)
    db_representative.available_credit_ves = round(db_representative.available_credit_ves - final_credit_applied, 2)
    
    db.add(db_representative)
    
    # El commit se hará en el router para asegurar la transacción
    return db_representative


def get_dashboard_data(db: Session, end_date: date = None) -> schemas.DashboardData:
    """
    Recopila y calcula todas las métricas necesarias para el dashboard financiero.
    """
    if end_date is None:
        end_date = date.today()
    
    start_date_current_month = end_date.replace(day=1)
    
    # --- 1. Cálculos para las Tarjetas ---

    # Ingresos del mes actual
    total_income_current_month = db.query(sql_func.sum(models.Payment.amount_paid_ves_equivalent)).filter(
        models.Payment.payment_date >= start_date_current_month,
        models.Payment.payment_date <= end_date
    ).scalar() or 0.0

    # Gastos del mes actual
    total_expenses_current_month = db.query(sql_func.sum(models.Expense.amount_ves_equivalent_at_creation)).filter(
        models.Expense.expense_date >= start_date_current_month,
        models.Expense.expense_date <= end_date
    ).scalar() or 0.0

    # Flujo Neto
    net_flow = total_income_current_month - total_expenses_current_month

    # Cuentas por Cobrar (Total)
    total_receivable_query = db.query(
        sql_func.sum(models.AppliedCharge.amount_due_ves_at_emission - models.AppliedCharge.amount_paid_ves)
    ).filter(
        models.AppliedCharge.status.in_(['pending', 'partially_paid', 'overdue'])
    )
    total_receivable = total_receivable_query.scalar() or 0.0

    # Crear las tarjetas
    cards = [
        schemas.DashboardCard(title="Ingresos (Mes Actual)", value=total_income_current_month),
        schemas.DashboardCard(title="Gastos (Mes Actual)", value=total_expenses_current_month),
        schemas.DashboardCard(title="Flujo Neto (Mes Actual)", value=net_flow),
        schemas.DashboardCard(title="Cuentas por Cobrar (Total)", value=total_receivable),
    ]

    # --- 2. Datos para el Gráfico (Últimos 6 meses) ---
    chart_data = []
    month_names_es = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    
    for i in range(6):
        # Retroceder i meses desde la fecha de fin
        target_month_date = end_date - relativedelta(months=i)
        month = target_month_date.month
        year = target_month_date.year
        
        # Obtener el nombre corto del mes
        month_name = f"{month_names_es[month]} {str(year)[-2:]}"

        # Ingresos para ese mes
        income_this_month = db.query(sql_func.sum(models.Payment.amount_paid_ves_equivalent)).filter(
            extract('year', models.Payment.payment_date) == year,
            extract('month', models.Payment.payment_date) == month
        ).scalar() or 0.0

        # Gastos para ese mes
        expenses_this_month = db.query(sql_func.sum(models.Expense.amount_ves_equivalent_at_creation)).filter(
            extract('year', models.Expense.expense_date) == year,
            extract('month', models.Expense.expense_date) == month
        ).scalar() or 0.0

        chart_data.append(schemas.ChartDataItem(
            name=month_name,
            Ingresos=round(income_this_month, 2),
            Gastos=round(expenses_this_month, 2)
        ))
    
    chart_data.reverse() # Para mostrar en orden cronológico

    # --- 3. Actividad Reciente ---
    
    recent_payments = db.query(models.Payment).order_by(models.Payment.payment_date.desc(), models.Payment.id.desc()).limit(5).all()
    recent_invoices = db.query(models.Invoice).order_by(models.Invoice.issue_date.desc(), models.Invoice.id.desc()).limit(5).all()

    return schemas.DashboardData(
        cards=cards,
        chart_data=chart_data,
        recent_payments=[schemas.PaymentResponse.from_orm(p) for p in recent_payments],
        recent_invoices=[schemas.InvoiceResponse.from_orm(i) for i in recent_invoices]
    )