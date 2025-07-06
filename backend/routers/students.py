from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Literal
from datetime import date

from .. import crud, models, schemas
from ..database import SessionLocal
from .auth import get_current_active_user, get_db

router = APIRouter(
    prefix="/students",
    tags=["Students"],
    dependencies=[Depends(get_current_active_user)]
)


@router.post("/", response_model=schemas.StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_new_student(
    student_in: schemas.StudentCreate,
    db: Session = Depends(get_db)
):
    db_representative = crud.get_representative(db, representative_id=student_in.representative_id)
    if not db_representative:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Representante con ID { student_in.representative_id } no encontrado." 
        )
    if student_in.cedula:
        db_student_by_cedula = crud.get_student_by_cedula(db, cedula=student_in.cedula)
        if db_student_by_cedula:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Un estudiante con la cédula { student_in.cedula } ya existe."
            )
    created_student = crud.create_student(db=db, student_in=student_in)
    return created_student


@router.get("/", response_model=schemas.PaginatedResponse[schemas.StudentResponse]) 
async def read_students_list(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=200), # Default a 10 para probar
    search: Optional[str] = Query(None, min_length=1, max_length=100, description="Buscar por nombre, apellido o cédula del estudiante"),
    sort_by: Optional[str] = Query(None, description="Campo para ordenar: id, first_name, last_name, cedula, grade_level, created_at"),
    sort_order: Optional[str] = Query("desc", enum=["asc", "desc"]),
    representative_id: Optional[int] = Query(None, description="Filtrar por ID del representante"),
    grade_level_id: Optional[int] = Query(None, description="Filtrar por ID del grado/nivel"),
    grade_level_name: Optional[str] = Query(None, description="Filtrar por nombre del grado/nivel (búsqueda parcial)"), 
    is_active: Optional[bool] = Query(True, description="Filtrar por estado activo (True/False) o todos (None)") 
):
    # ... (validación de allowed_sort_fields sin cambios) ...
    allowed_sort_fields = ["id", "first_name", "last_name", "cedula", "grade_level", "created_at", "updated_at", "is_active"] 
    if sort_by and sort_by not in allowed_sort_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Campo de ordenamiento no válido para estudiantes: { sort_by }. Permitidos: { ', '.join(allowed_sort_fields) }"
        )

    students_data = crud.get_students( # Esto ahora devuelve el dict
        db,
        skip=skip,
        limit=limit,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        representative_id=representative_id,
        grade_level_id=grade_level_id,       
        grade_level_name=grade_level_name, 
        is_active=is_active                
    )
    return students_data


@router.get("/{student_id}", response_model=schemas.StudentResponse)
async def read_single_student(
    student_id: int,
    db: Session = Depends(get_db)
):
    db_student = crud.get_student(db, student_id=student_id)
    if db_student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")
    return db_student


@router.put("/{student_id}", response_model=schemas.StudentResponse)
async def update_existing_student(
    student_id: int,
    student_in: schemas.StudentUpdate,
    db: Session = Depends(get_db)
):
    db_student_to_update = crud.get_student(db, student_id=student_id)
    if not db_student_to_update:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado para actualizar")
    if student_in.cedula and student_in.cedula != db_student_to_update.cedula:
        existing_student_cedula = crud.get_student_by_cedula(db, cedula=student_in.cedula)
        if existing_student_cedula and existing_student_cedula.id != student_id:
            raise HTTPException(status_code=400, detail=f"La cédula { student_in.cedula } ya pertenece a otro estudiante.")
        
        if student_in.representative_id and student_in.representative_id != db_student_to_update.representative_id:
            db_representative = crud.get_representative(db, representative_id=student_in.representative_id)
            if not db_representative:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Nuevo representante con ID { student_in.representative_id } no encontrado"
                )
    updated_student = crud.update_student(db=db, student_id=student_id, student_in=student_in)
    if updated_student is None: 
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al actualizar el estudiante")
    return updated_student


@router.patch("/{student_id}/deactivate", response_model=schemas.StudentResponse)
async def deactivate_single_student(
    student_id: int,
    db: Session = Depends(get_db)
):
    db_student = crud.get_student(db, student_id=student_id)
    if db_student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")
    
    if not db_student.is_active: 
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El estudiante ya está inactivo.")

    deactivated_student = crud.deactivate_student(db, student_id=student_id)
    return deactivated_student


@router.patch("/{student_id}/activate", response_model=schemas.StudentResponse)
async def activate_single_student(
    student_id: int,
    db: Session = Depends(get_db)
):
    db_student = crud.get_student(db, student_id=student_id)
    if db_student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")

    if db_student.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El estudiante ya está activo.")

    activated_student = crud.activate_student(db, student_id=student_id)
    return activated_student
    

# --- NUEVO ENDPOINT PARA LA MATRIZ FINANCIERA ANUAL DE ESTUDIANTES ---

@router.get(
    "/annual-financial-summary/", 
    response_model=schemas.PaginatedResponse[schemas.StudentAnnualFinancialSummary],
    tags=["Students", "Financial Reports"] # Puedes añadir un tag adicional para reportes
)
async def get_student_annual_financial_summary_endpoint(
    school_year_start_year: int = Query(..., description="Año de inicio del período escolar."),
    school_year_start_month: int = Query(8, ge=1, le=12, description="Mes de inicio del período escolar."),
    student_search_term: Optional[str] = Query(None, description="Término de búsqueda para estudiantes."),
    delinquency_filter: Optional[Literal["green", "orange", "red", "none"]] = Query(None, description="Filtrar por estado de morosidad."), # <--- NUEVO
    current_processing_date_override: Optional[date] = Query(None, description="Fecha para calcular morosidad (YYYY-MM-DD). Por defecto, hoy."),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
    # current_user: models.User = Depends(get_current_active_user) # Ya en dependencias del router
):
    """
    Obtiene un resumen financiero anual para una lista de estudiantes,
    detallando la deuda generada mensualmente, la deuda total pendiente
    y el estado de morosidad.
    El año escolar se define por el año y mes de inicio (ej. Agosto 2024 a Julio 2025).
    """
    
    processing_date = current_processing_date_override if current_processing_date_override else date.today()
    current_usd_rate = None
    
    try:
        usd_rate_model = crud.get_latest_exchange_rate(db, from_currency=models.Currency.USD, on_date=processing_date)
        if usd_rate_model and usd_rate_model.rate:
            current_usd_rate = usd_rate_model.rate
    except Exception as e_rate:
        # No es crítico si no se encuentra la tasa, el CRUD lo manejará
        print(f"Advertencia: No se pudo obtener la tasa USD para el resumen financiero. Error: {str(e_rate)}")

    try:
        summary_data = crud.get_student_annual_financial_summary(
            db=db,
            school_year_start_month=school_year_start_month,
            school_year_start_year=school_year_start_year,
            current_processing_date=processing_date,
            student_search_term=student_search_term,
            delinquency_filter=delinquency_filter, 
            current_usd_rate=current_usd_rate,
            skip=skip,
            limit=limit
        )
        # La función CRUD ya devuelve el diccionario con formato PaginatedResponse
        return summary_data
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        # Log e
        print(f"Error inesperado en get_student_annual_financial_summary_endpoint: {str(e)}") # Para depuración
        # import traceback # Para depuración más detallada
        # traceback.print_exc() # Para depuración más detallada
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al generar el resumen financiero de estudiantes."
        )
