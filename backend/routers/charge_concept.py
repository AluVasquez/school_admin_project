from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from ..import crud, models, schemas
from .auth import get_db, get_current_active_user
from ..crud import ChargeConceptAlreadyInactiveError, ChargeConceptInUseError


router = APIRouter(
    prefix="/charge-concepts",
    tags=["Charge Concepts"],
    dependencies=[Depends(get_current_active_user)]
)


@router.post("/", response_model=schemas.ChargeConceptResponse, status_code=status.HTTP_201_CREATED)
async def create_new_charge_concept(
    charge_concept_in: schemas.ChargeConceptCreate,
    db: Session = Depends(get_db)
):
    db_concept_by_name = crud.get_charge_concept_by_name(db, name=charge_concept_in.name)
    if db_concept_by_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Un concepto de cargo con el nombre '{charge_concept_in.name}' ya existe."
        )

    if charge_concept_in.applicable_grade_level_id is not None:
        grade_level = crud.get_grade_level(db, grade_level_id=charge_concept_in.applicable_grade_level_id)
        if not grade_level:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"El Nivel de Grado con ID {charge_concept_in.applicable_grade_level_id} no fue encontrado."
            )
        # Esto es por si es necesario validar si el grade_level está activo
        # if not grade_level.is_active:
        #     raise HTTPException(
        #         status_code=status.HTTP_400_BAD_REQUEST,
        #         detail=f"El Nivel de Grado con ID {charge_concept_in.applicable_grade_level_id} está inactivo."
        #     )
            
    new_charge_concept = crud.create_charge_concept(db=db, charge_concept_in=charge_concept_in)
    return new_charge_concept


@router.get("/", response_model=schemas.PaginatedResponse[schemas.ChargeConceptResponse])
async def read_all_charge_concepts(
    db: Session = Depends(get_db), # Asumiendo que get_db está definido en auth.py
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=200),
    # ASEGÚRATE QUE TODOS LOS ARGUMENTOS DESPUÉS DEL DEFAULT SEAN KEYWORD ARGUMENTS
    is_active: Optional[bool] = Query(None, description="Filtrar por estado activo (True/False) o todos (None)"),
    applicable_grade_level_id: Optional[int] = Query(None, description="Filtrar por ID de Nivel de Grado aplicable. Usar 0 para conceptos generales (sin grado asignado)."),
    category: Optional[schemas.ChargeCategory] = Query(None, description="Filtrar por categoría del cargo"),
    frequency: Optional[schemas.ChargeFrequency] = Query(None, description="Filtrar por frecuencia del cargo"),
    search: Optional[str] = Query(None, min_length=1, max_length=100, description="Buscar por nombre o descripción del concepto de cargo"),
    sort_by: Optional[str] = Query("name", description="Campo para ordenar: id, name, default_amount, category, frequency, grade_level_name, created_at"),
    sort_order: Optional[str] = Query("asc", enum=["asc", "desc"], description="Orden de clasificación: asc o desc")
):

    allowed_sort_fields = ["id", "name", "default_amount", "category", "default_frequency", "grade_level_name", "created_at", "updated_at", "is_active"]
    if sort_by and sort_by not in allowed_sort_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Campo de ordenamiento no válido: {sort_by}. Permitidos: {', '.join(allowed_sort_fields)}"
        )

    charge_concepts_data = crud.get_charge_concepts( 
        db,
        skip=skip,
        limit=limit,
        is_active=is_active,
        applicable_grade_level_id=applicable_grade_level_id,
        category=category,
        frequency=frequency,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order
    )
    return charge_concepts_data


@router.get("/{charge_concept_id}", response_model=schemas.ChargeConceptResponse)
async def read_single_charge_concept(
    charge_concept_id: int,
    db: Session = Depends(get_db)
):
    db_charge_concept = crud.get_charge_concept(db, charge_concept_id=charge_concept_id)
    if db_charge_concept is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Concepto de cargo no encontrado")
    return db_charge_concept


@router.put("/{charge_concept_id}", response_model=schemas.ChargeConceptResponse)
async def update_existing_charge_concept(
    charge_concept_id: int,
    charge_concept_in: schemas.ChargeConceptUpdate,
    db: Session = Depends(get_db)
):
    db_charge_concept_to_update = crud.get_charge_concept(db, charge_concept_id=charge_concept_id)
    if not db_charge_concept_to_update:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Concepto de cargo no encontrado para actualizar")

    if charge_concept_in.name and charge_concept_in.name != db_charge_concept_to_update.name:
        existing_concept_with_name = crud.get_charge_concept_by_name(db, name=charge_concept_in.name)
        if existing_concept_with_name and existing_concept_with_name.id != charge_concept_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Un concepto de cargo con el nombre '{charge_concept_in.name}' ya existe."
            )

    # Validar que applicable_grade_level_id exista si se proporciona y no es None
    if charge_concept_in.applicable_grade_level_id is not None:
        grade_level = crud.get_grade_level(db, grade_level_id=charge_concept_in.applicable_grade_level_id)
        if not grade_level: 
            if charge_concept_in.applicable_grade_level_id != 0: # Suponiendo que 0 no es un ID válido de GradeLevel y se usa para genera
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"El Nivel de Grado con ID {charge_concept_in.applicable_grade_level_id} no fue encontrado."
                )

    updated_charge_concept = crud.update_charge_concept(
        db=db, charge_concept_id=charge_concept_id, charge_concept_in=charge_concept_in
    )
    
    if updated_charge_concept is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Error al actualizar el concepto de cargo. Verifique los datos proporcionados (ej. ID de nivel de grado)."
        )
    return updated_charge_concept


@router.delete("/{charge_concept_id}", response_model=schemas.ChargeConceptResponse)
async def deactivate_existing_charge_concept(
    charge_concept_id: int,
    db: Session = Depends(get_db)
):
    try:
        deactivated_charge_concept = crud.deactivate_charge_concept(db=db, charge_concept_id=charge_concept_id)
        return deactivated_charge_concept
    except ChargeConceptAlreadyInactiveError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except ChargeConceptInUseError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, #No estoy seguro si dejar el 400 o 409 (conflict)
            detail=e.detail
        )


@router.patch("/{charge_concept_id}/activate", response_model=schemas.ChargeConceptResponse)
async def activate_existing_charge_concept(
    charge_concept_id: int,
    db: Session = Depends(get_db)
):
    db_charge_concept = crud.get_charge_concept(db, charge_concept_id=charge_concept_id)
    if db_charge_concept is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Concepto de cargo no encontrado.")
    
    if db_charge_concept.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El concepto de cargo ya está activo.")

    activated_concept = crud.activate_charge_concept(db, charge_concept_id=charge_concept_id)
    if activated_concept is None: 
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al activar el concepto de cargo.")
    return activated_concept