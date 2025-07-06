from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from sqlalchemy.orm import Session
from typing import List, Optional, Dict

from .. import crud, models, schemas
from .auth import get_db, get_current_active_user

router = APIRouter(
    prefix="/suppliers",
    tags=["Suppliers"],
    dependencies=[Depends(get_current_active_user)]
)

@router.post("/", response_model=schemas.SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_new_supplier(
    supplier_in: schemas.SupplierCreate,
    db: Session = Depends(get_db)
):
    try:
        return crud.create_supplier(db=db, supplier_in=supplier_in)
    except HTTPException as e_http:
        raise e_http
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al crear proveedor: {str(e)}")

@router.get("/", response_model=schemas.PaginatedResponse[schemas.SupplierResponse])
async def read_all_suppliers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    search: Optional[str] = Query(None, description="Buscar por nombre, RIF/CI, email o contacto"),
    is_active: Optional[bool] = Query(None, description="Filtrar por estado activo"),
    db: Session = Depends(get_db)
):
    suppliers_data = crud.get_suppliers(db, skip=skip, limit=limit, search=search, is_active=is_active)
    return suppliers_data

@router.get("/{supplier_id}", response_model=schemas.SupplierResponse)
async def read_single_supplier(
    supplier_id: int = Path(..., ge=1),
    db: Session = Depends(get_db)
):
    db_supplier = crud.get_supplier(db, supplier_id=supplier_id)
    if db_supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    return db_supplier

@router.put("/{supplier_id}", response_model=schemas.SupplierResponse)
async def update_existing_supplier(
    supplier_in: schemas.SupplierUpdate,
    supplier_id: int = Path(..., ge=1),
    db: Session = Depends(get_db)
):
    try:
        updated_supplier = crud.update_supplier(db=db, supplier_id=supplier_id, supplier_in=supplier_in)
        if updated_supplier is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado para actualizar")
        return updated_supplier
    except HTTPException as e_http:
        raise e_http
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al actualizar proveedor: {str(e)}")

@router.patch("/{supplier_id}/toggle-active", response_model=schemas.SupplierResponse)
async def toggle_supplier_active_status_endpoint(
    supplier_id: int = Path(..., ge=1),
    db: Session = Depends(get_db)
):
    try:
        toggled_supplier = crud.toggle_supplier_active_status(db=db, supplier_id=supplier_id)
        return toggled_supplier
    except HTTPException as e_http:
        raise e_http
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al cambiar estado de proveedor: {str(e)}")