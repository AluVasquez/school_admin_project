from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import crud, models, schemas
from .auth import get_db, get_current_active_user

router = APIRouter(
    prefix="/credit-notes",
    tags=["Credit Notes"],
    dependencies=[Depends(get_current_active_user)]
)

@router.post("/", response_model=schemas.CreditNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_new_credit_note(
    credit_note_in: schemas.CreditNoteCreate,
    db: Session = Depends(get_db)
):
    """
    Crea una nueva Nota de Crédito.
    Esta operación anula la factura original asociada y genera un saldo a favor
    para el representante.
    """
    try:
        db_credit_note = crud.create_credit_note(db=db, credit_note_in=credit_note_in)
        db.commit()
        db.refresh(db_credit_note)
        # Es necesario recargar también la factura para obtener su estado actualizado
        db.refresh(db_credit_note.original_invoice) 
        return db_credit_note
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocurrió un error interno al crear la nota de crédito: {str(e)}"
        )

@router.get("/", response_model=schemas.PaginatedResponse[schemas.CreditNoteResponse])
async def read_credit_notes(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    representative_id: Optional[int] = Query(None, description="Filtrar por ID de representante")
):
    """
    Obtiene una lista paginada de las notas de crédito.
    """
    credit_notes_data = crud.get_credit_notes(db, skip=skip, limit=limit, representative_id=representative_id)
    return credit_notes_data

@router.get("/{credit_note_id}", response_model=schemas.CreditNoteResponse)
async def read_single_credit_note(
    credit_note_id: int,
    db: Session = Depends(get_db)
):
    """
    Obtiene los detalles de una nota de crédito específica.
    """
    db_credit_note = crud.get_credit_note(db, credit_note_id=credit_note_id)
    if db_credit_note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de Crédito no encontrada")
    return db_credit_note