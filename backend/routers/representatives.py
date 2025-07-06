# backend/routers/representatives.py

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from ..import crud, models, schemas
from ..database import SessionLocal
from .auth import get_current_active_user, get_db
from ..schemas import PaginatedResponse

router = APIRouter(
    prefix="/representatives",
    tags=["Representatives"],
    dependencies=[Depends(get_current_active_user)]
)

@router.post("/", response_model=schemas.RepresentativeResponse, status_code=status.HTTP_201_CREATED)
async def create_new_representative(
    representative_in: schemas.RepresentativeCreate,
    db: Session = Depends(get_db),
):
    identificador_completo_a_verificar = f"{representative_in.identification_type.upper()}{representative_in.identification_number}"
    db_representative_by_id = crud.get_representative_by_cedula(db, cedula=identificador_completo_a_verificar)
    if db_representative_by_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, 
            detail=f"Un representante con el número de cédula {identificador_completo_a_verificar} ya existe en el sistema."
        )

    db_representative_by_email = crud.get_representative_by_email(db, email=representative_in.email)
    if db_representative_by_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, 
            detail=f"Un representante con el email {representative_in.email} ya existe."
        )

    return crud.create_representative(db=db, representative_in=representative_in)


@router.get("/", response_model=PaginatedResponse[schemas.RepresentativeResponse])
async def read_representatives_list(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0), 
    limit: int = Query(10, ge=1, le=1000), 
    search: Optional[str] = Query(None, min_length=1, max_length=100, description="Texto a buscar en nombres, apellidos, cédula o email"),
    sort_by: Optional[str] = Query(None, description="Campo para ordenar: id, first_name, last_name, email, cedula, created_at"),
    sort_order: Optional[str] = Query("desc", enum=["asc", "desc"], description="Orden: asc o desc"),
    # --- CORRECCIÓN AQUÍ: Añadir el parámetro de filtro ---
    financial_status_filter: Optional[str] = Query(None, alias="financialStatus", description="Filtrar por estado financiero: 'has_debt', 'solvent', 'has_credit'")
):

    allowed_sort_fields = ["id", "first_name", "last_name", "email", "cedula", "created_at", "updated_at"]
    if sort_by and sort_by not in allowed_sort_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Campo de ordenamiento no válido: {sort_by}. Campos permitidos: {', '.join(allowed_sort_fields)}"
        )

    representatives = crud.get_representatives(
        db, 
        skip=skip, 
        limit=limit, 
        search=search, 
        sort_by=sort_by, 
        sort_order=sort_order,
        # --- CORRECCIÓN AQUÍ: Pasar el filtro a la función CRUD ---
        financial_status_filter=financial_status_filter
    )
    return representatives


@router.get("/{representative_id}", response_model=schemas.RepresentativeResponse)
async def read_single_representative(
    representative_id: int,
    db: Session = Depends(get_db)
):
    db_representative = crud.get_representative(db, representative_id=representative_id)
    if db_representative is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Representante no encontrado")
    return db_representative


@router.put("/{representative_id}", response_model=schemas.RepresentativeResponse)
async def update_existing_representative(
    representative_id: int,
    representative_in: schemas.RepresentativeUpdate,
    db: Session = Depends(get_db),
):
    new_identificador = None
    if representative_in.identification_type is not None and representative_in.identification_number is not None:
        new_identificador = f"{representative_in.identification_type.upper()}{representative_in.identification_number}"
    
    if new_identificador:
        existing_rep_id = crud.get_representative_by_cedula(db, cedula=new_identificador)
        if existing_rep_id and existing_rep_id.id != representative_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"El identificador {new_identificador} ya pertenece a otro representante.")

    if representative_in.email:
        existing_rep_email = crud.get_representative_by_email(db, email=representative_in.email)
        if existing_rep_email and existing_rep_email.id != representative_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"El email {representative_in.email} ya pertenece a otro representante.")

    updated_representative = crud.update_representative(db=db, representative_id=representative_id, representative_in=representative_in)
    if updated_representative is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Representante no encontrado.")
    return updated_representative

    
@router.delete("/{representative_id}", response_model=schemas.RepresentativeResponse)
async def delete_existing_representative(
    representative_id: int,
    db: Session = Depends(get_db),
):
    deleted_representative = crud.delete_representative(db=db, representative_id=representative_id)
    if deleted_representative is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Representante no encontrado para eliminar")
    return deleted_representative


@router.get("/{representative_id}/statement", response_model=schemas.RepresentativeAccountStatementResponse)
async def get_representative_statement_api(
    representative_id: int,
    db: Session = Depends(get_db)
):
    statement = crud.get_representative_account_statement(db, representative_id=representative_id)
    if not statement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No se pudo generar el estado de cuenta: Representante con ID {representative_id} no encontrado."
        )
    return statement


@router.post("/{representative_id}/apply-credit", response_model=schemas.RepresentativeResponse)
async def apply_credit_for_representative(
    representative_id: int,
    db: Session = Depends(get_db)
):
    """
    Aplica el saldo a favor de un representante a sus deudas pendientes.
    """
    try:
        updated_representative = crud.apply_available_credit(db=db, representative_id=representative_id)
        db.commit()
        db.refresh(updated_representative)
        return updated_representative
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocurrió un error interno al aplicar el saldo a favor: {str(e)}"
        )