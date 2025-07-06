from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from .. import crud, models, schemas
from .auth import get_db, get_current_active_user
from ..crud import AppliedChargeUpdateNotAllowedError


router = APIRouter(
    prefix="/applied-charges",
    tags=["Applied Charges"],
    dependencies=[Depends(get_current_active_user)]
)

@router.post("/", response_model=schemas.AppliedChargeResponse, status_code=status.HTTP_201_CREATED)
async def create_new_applied_charge(
    applied_charge_input: schemas.AppliedChargeClientCreate,
    db: Session = Depends(get_db)
):
    student = crud.get_student(db, student_id=applied_charge_input.student_id)
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Estudiante con ID {applied_charge_input.student_id} no encontrado.")
    if not student.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Estudiante con ID {applied_charge_input.student_id} está inactivo.")

    charge_concept = crud.get_charge_concept(db, charge_concept_id=applied_charge_input.charge_concept_id)
    if not charge_concept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Concepto de Cargo con ID {applied_charge_input.charge_concept_id} no encontrado.")
    if not charge_concept.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Concepto de Cargo con ID {applied_charge_input.charge_concept_id} está inactivo.")

    # --- Validar fechas ---
    if applied_charge_input.due_date < applied_charge_input.issue_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La fecha de vencimiento (due_date) no puede ser anterior a la fecha de emisión (issue_date)."
        )

    try:
        # --- Lógica de Conversión de Moneda usando la función auxiliar del CRUD ---
        amount_after_conversion_ves, rate_applied_value = crud._calculate_converted_amount_ves(
            db=db,
            original_amount=charge_concept.default_amount, # Usar el monto del concepto
            original_currency=charge_concept.default_amount_currency, # y su moneda
            rate_date=applied_charge_input.issue_date # Fecha de emisión para la tasa
        )

        # --- Aplicar Lógica de Becas del Estudiante usando la función auxiliar del CRUD ---
        final_amount_due_ves = crud._apply_scholarship(
            student=student,
            amount_to_apply_scholarship_on=amount_after_conversion_ves
        )
    except HTTPException as e:
        # Si _calculate_converted_amount_ves lanza una excepción (ej. sin tasa),
        # la recapturamos y la relanzamos, ya que es un error para esta solicitud.
        raise e # Esto ya será una HTTPException con el status y detail adecuados.

    # --- Construir el objeto para el CRUD ---
    # El schema AppliedChargeCreate es lo que el representative envía, pero también
    # lo que la función crud.create_applied_charge espera.
    # Aquí, estamos re-creando el objeto pero poblando los campos calculados.
    applied_charge_to_create_data = schemas.AppliedChargeClientCreate(
        student_id=applied_charge_input.student_id,
        charge_concept_id=applied_charge_input.charge_concept_id,
        description=applied_charge_input.description,
        issue_date=applied_charge_input.issue_date,
        due_date=applied_charge_input.due_date,
        status=applied_charge_input.status if applied_charge_input.status else models.AppliedChargeStatus.PENDING,
        
        # Campos calculados y de trazabilidad
        amount_due_ves=final_amount_due_ves, # Este es el calculado
        original_concept_amount=charge_concept.default_amount, # Guardamos el original del concepto
        original_concept_currency=charge_concept.default_amount_currency, # y su moneda
        exchange_rate_applied=rate_applied_value # El que retornó la función de cálculo
    )

    new_applied_charge = crud.create_applied_charge(db=db, applied_charge_in=applied_charge_input, student_model=student, charge_concept_model=charge_concept)
    return new_applied_charge


@router.get("/{applied_charge_id}", response_model=schemas.AppliedChargeResponse)
async def read_single_applied_charge(
    applied_charge_id: int,
    db: Session = Depends(get_db)
):
    db_applied_charge = crud.get_applied_charge(db, applied_charge_id=applied_charge_id)
    if db_applied_charge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cargo aplicado no encontrado.")
    return db_applied_charge


@router.get("/student/{student_id}", response_model=List[schemas.AppliedChargeResponse])
async def read_charges_for_student(
    student_id: int,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    status: Optional[schemas.AppliedChargeStatus] = Query(None, description="Filtrar por estado del cargo"),
    start_issue_date: Optional[date] = Query(None, description="Fecha de inicio para el filtro de emisión (YYYY-MM-DD)"),
    end_issue_date: Optional[date] = Query(None, description="Fecha de fin para el filtro de emisión (YYYY-MM-DD)"),
    sort_by: str = Query("issue_date", description="Campo para ordenar: issue_date, due_date, amount_due, status"),
    sort_order: str = Query("desc", enum=["asc", "desc"], description="Orden de clasificación")
):
    student = crud.get_student(db, student_id=student_id)
    if not student:
        raise HTTPException(
            status_code=404, detail=f"Estudiante con ID {student_id} no encontrado."
        )
    
    allowed_sort_fields = ["issue_date", "due_date", "amount_due", "status", "created_at"]
    if sort_by not in allowed_sort_fields:
        raise HTTPException(status_code=400, detail=f"Campo de ordenamiento no válido: {sort_by}")

    applied_charges = crud.get_applied_charges_for_student(
        db,
        student_id=student_id,
        skip=skip,
        limit=limit,
        status=status,
        start_issue_date=start_issue_date,
        end_issue_date=end_issue_date,
        sort_by=sort_by,
        sort_order=sort_order
    )
    return applied_charges


@router.get("/", response_model=schemas.PaginatedResponse[schemas.AppliedChargeResponse])
async def read_all_applied_charges_list(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    student_id: Optional[int] = Query(None, description="Filtrar por ID de estudiante"),
    charge_concept_id: Optional[int] = Query(None, description="Filtrar por ID de concepto de cargo"),
    representative_id: Optional[int] = Query(None, description="Filtrar por ID del representante/representative"),
    status:Optional[List[schemas.AppliedChargeStatus]] = Query(None, description="Filtrar por estado del cargo"),
    start_issue_date: Optional[date] = Query(None, description="Fecha de inicio para el filtro de emisión (YYYY-MM-DD)"),
    end_issue_date: Optional[date] = Query(None, description="Fecha de fin para el filtro de emisión (YYYY-MM-DD)"),
    start_due_date: Optional[date] = Query(None, description="Fecha de inicio para el filtro de vencimiento (YYYY-MM-DD)"),
    end_due_date: Optional[date] = Query(None, description="Fecha de fin para el filtro de vencimiento (YYYY-MM-DD)"),
    sort_by: str = Query("issue_date", description="Campo para ordenar (ej: issue_date, student_name, charge_concept_name)"),
    sort_order: str = Query("desc", enum=["asc", "desc"])
):

    allowed_sort_fields = [
        "issue_date", "due_date", "amount_due", "status", "created_at",
        "student_name", "charge_concept_name" # Estos requieren joins manejados en el CRUD
    ]
    if sort_by not in allowed_sort_fields:
        raise HTTPException(status_code=400, detail=f"Campo de ordenamiento no válido: {sort_by}")

    applied_charges = crud.get_all_applied_charges(
        db,
        skip=skip,
        limit=limit,
        student_id=student_id,
        charge_concept_id=charge_concept_id,
        representative_id=representative_id,
        status=status,
        start_issue_date=start_issue_date,
        end_issue_date=end_issue_date,
        start_due_date=start_due_date,
        end_due_date=end_due_date,
        sort_by=sort_by,
        sort_order=sort_order
    )
    return applied_charges


@router.put("/{applied_charge_id}", response_model=schemas.AppliedChargeResponse)
async def update_existing_applied_charge(
    applied_charge_id: int,
    applied_charge_in: schemas.AppliedChargeUpdate,
    db: Session = Depends(get_db)
):
    db_applied_charge_for_dates = crud.get_applied_charge(db, applied_charge_id=applied_charge_id)
    if not db_applied_charge_for_dates:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cargo aplicado no encontrado.")

    current_issue_date = applied_charge_in.issue_date if applied_charge_in.issue_date is not None else db_applied_charge_for_dates.issue_date
    current_due_date = applied_charge_in.due_date if applied_charge_in.due_date is not None else db_applied_charge_for_dates.due_date
    
    if current_due_date < current_issue_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La fecha de vencimiento (due_date) no puede ser anterior a la fecha de emisión (issue_date)."
        )

    try:
        updated_charge = crud.update_applied_charge(
            db=db, applied_charge_id=applied_charge_id, applied_charge_in=applied_charge_in
        )
        return updated_charge
    except AppliedChargeUpdateNotAllowedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=e.detail
        )