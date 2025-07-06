from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from sqlalchemy.orm import Session
from typing import List, Optional, Dict

from .. import crud, models, schemas
from .auth import get_db, get_current_active_user # Asumiendo que get_db y get_current_active_user están en .auth

router = APIRouter(
    prefix="/expense-categories",
    tags=["Expense Categories"],
    dependencies=[Depends(get_current_active_user)]
)

@router.post("/", response_model=schemas.ExpenseCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_new_expense_category(
    category_in: schemas.ExpenseCategoryCreate,
    db: Session = Depends(get_db)
    # current_user: models.User = Depends(get_current_active_user) # Ya en dependencias del router
):
    # La validación de nombre único ya está en el CRUD
    try:
        return crud.create_expense_category(db=db, category_in=category_in)
    except HTTPException as e_http: # Si el CRUD lanza una HTTPException (ej. por conflicto)
        raise e_http
    except Exception as e:
        # Log genérico del error si es necesario
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al crear categoría: {str(e)}")

@router.get("/", response_model=schemas.PaginatedResponse[schemas.ExpenseCategoryResponse]) # Usando el schema genérico
async def read_all_expense_categories(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    search: Optional[str] = Query(None, description="Buscar por nombre o descripción"),
    is_active: Optional[bool] = Query(None, description="Filtrar por estado activo"),
    db: Session = Depends(get_db)
):
    categories_data = crud.get_expense_categories(
        db, skip=skip, limit=limit, search=search, is_active=is_active
    )
    # El CRUD ya devuelve el formato {items, total, page, pages, limit}
    return categories_data

@router.get("/{category_id}", response_model=schemas.ExpenseCategoryResponse)
async def read_single_expense_category(
    category_id: int = Path(..., ge=1),
    db: Session = Depends(get_db)
):
    db_category = crud.get_expense_category(db, category_id=category_id)
    if db_category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoría de gasto no encontrada")
    return db_category

@router.put("/{category_id}", response_model=schemas.ExpenseCategoryResponse)
async def update_existing_expense_category(
    category_in: schemas.ExpenseCategoryUpdate,
    category_id: int = Path(..., ge=1),
    db: Session = Depends(get_db)
):
    try:
        updated_category = crud.update_expense_category(db=db, category_id=category_id, category_in=category_in)
        if updated_category is None: # Si el CRUD devuelve None es porque no la encontró
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoría de gasto no encontrada para actualizar")
        return updated_category
    except HTTPException as e_http:
        raise e_http
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al actualizar categoría: {str(e)}")

@router.patch("/{category_id}/toggle-active", response_model=schemas.ExpenseCategoryResponse)
async def toggle_category_active_status_endpoint(
    category_id: int = Path(..., ge=1),
    db: Session = Depends(get_db)
):
    # El CRUD get_expense_category dentro de toggle_expense_category_active_status ya maneja 404
    # y otras HTTPExceptions si la lógica de negocio lo requiere (ej. no desactivar si está en uso)
    try:
        toggled_category = crud.toggle_expense_category_active_status(db=db, category_id=category_id)
        return toggled_category
    except HTTPException as e_http: # Capturar las excepciones del CRUD
        raise e_http
    except Exception as e:
        # Log genérico
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al cambiar estado de categoría: {str(e)}")