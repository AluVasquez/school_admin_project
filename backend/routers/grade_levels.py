from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional, List

from ..import crud, models, schemas
from ..database import SessionLocal
from .auth import get_db, get_current_active_user
from ..crud import GradeLevelInUseError, BusinessLogicError


router = APIRouter(
    prefix="/grade-levels",
    tags=["Grade Levels"],
    dependencies=[Depends(get_current_active_user)]
)


@router.post("/", response_model=schemas.GradeLevelResponse, status_code=status.HTTP_201_CREATED)
async def create_new_grade_level(
    grade_level_in: schemas.GradeLevelCreate,
    db: Session = Depends(get_db)
):
    
    db_grade_level_by_name = crud.get_grade_level_by_name(db, grade_level_in.name)
    if db_grade_level_by_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Un nivel de grado con el nombre '{grade_level_in.name}' ya existe."
        )
        
    new_grade_level = crud.create_grade_level(db=db, grade_level=grade_level_in)
    return new_grade_level


@router.get("/{grade_level_id}", response_model=schemas.GradeLevelResponse)
async def read_single_grade_level(
    grade_level_id: int,
    db: Session = Depends(get_db)
):
    db_grade_level = crud.get_grade_level(db, grade_level_id=grade_level_id)
    if db_grade_level is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nivel de grado no encontrado")
    return db_grade_level


@router.get("/", response_model=List[schemas.GradeLevelResponse])
async def read_all_grade_levels(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    is_active: Optional[bool] = Query(True, description="Filtrar por estado activo (True/False) o todos (None)"),
    search: Optional[str] = Query(None, min_length=1, max_length=100, description="Buscar por nombre o descripción"),
    sort_by: Optional[str] = Query("order_index", description="Campo para ordenar: id, name, order_index, created_at"),
    sort_order: Optional[str] = Query("asc", enum=["asc", "desc"])
):
    """
    Obtiene una lista de todos los niveles de grado.
    Permite paginación, filtro por activo y búsqueda por nombre/descripción.
    """
    allowed_sort_fields = ["id", "name", "order_index", "created_at", "updated_at", "is_active"]
    if sort_by and sort_by not in allowed_sort_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Campo de ordenamiento no válido: {sort_by}. Permitidos: {', '.join(allowed_sort_fields)}"
        )
        
    grade_levels = crud.get_grade_levels(
        db, skip=skip, limit=limit, is_active=is_active, search=search, sort_by=sort_by, sort_order=sort_order
    )
    return grade_levels

    
@router.put("/{grade_level_id}", response_model=schemas.GradeLevelResponse)
async def update_existing_grade_level(
    grade_level_id: int,
    grade_level_in: schemas.GradeLevelUpdate,
    db: Session = Depends(get_db)
):
    db_grade_level_to_update = crud.get_grade_level(db, grade_level_id=grade_level_id)
    if not db_grade_level_to_update:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nivel de grado no encontrado para actualizar")

    if grade_level_in.name and grade_level_in.name != db_grade_level_to_update.name:
        existing_grade_level_name = crud.get_grade_level_by_name(db, name=grade_level_in.name)
        if existing_grade_level_name and existing_grade_level_name.id != grade_level_id: 
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Un nivel de grado con el nombre '{grade_level_in.name}' ya existe."
            )
            
    updated_grade_level = crud.update_grade_level(db=db, grade_level_id=grade_level_id, grade_level_in=grade_level_in)
    if updated_grade_level is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Error al actualizar el nivel de grado.")
    return updated_grade_level


@router.delete("/{grade_level_id}", response_model=schemas.GradeLevelResponse)
async def deactivate_existing_grade_level( 
    grade_level_id: int,
    db: Session = Depends(get_db)
):
    try:
        deactivated_grade_level = crud.deactivate_grade_level(db=db, grade_level_id=grade_level_id)
        return deactivated_grade_level
    except GradeLevelInUseError as e: 
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=e.detail)

    except BusinessLogicError as e: 
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=e.detail)
                    


@router.patch("/{grade_level_id}/activate", response_model=schemas.GradeLevelResponse)
async def activate_existing_grade_level(
    grade_level_id: int,
    db: Session = Depends(get_db)
):
    """
    Reactiva un nivel de grado que estaba inactivo.
    """
    db_grade_level = crud.get_grade_level(db, grade_level_id=grade_level_id)
    if db_grade_level is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nivel de grado no encontrado.")
    
    if db_grade_level.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nivel de grado ya está activo.")
    
    db_grade_level.is_active = True
    db.add(db_grade_level)
    db.commit()
    db.refresh(db_grade_level)
    return db_grade_level

