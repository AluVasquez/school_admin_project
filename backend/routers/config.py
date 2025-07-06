from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from .. import crud, models, schemas
from .auth import get_current_active_user, get_db

router = APIRouter(
    prefix="/config",
    tags=["System Configuration"],
    dependencies=[Depends(get_current_active_user)]
)


@router.get("/school/", response_model=schemas.SchoolConfigurationResponse)
async def read_school_configuration(
    db: Session = Depends(get_db)
):
    db_config = crud.get_school_configuration(db)
    if db_config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La configuración de la escuela aún no ha sido establecida"
        )
    return db_config

@router.put("/school/", response_model=schemas.SchoolConfigurationResponse)
async def set_or_update_school_configurations(
    config_in: schemas.SchoolConfigurationCreate,
    db: Session = Depends(get_db)
):
    updated_config = crud.create_or_update_school_configuration(db=db, config_in=config_in)
    return updated_config