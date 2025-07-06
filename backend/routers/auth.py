from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import Optional, List

from .. import crud, models, schemas
from ..database import SessionLocal
from ..security import create_access_token, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES, decode_access_token
from ..app_config import settings

router = APIRouter(
    prefix="/auth",
    tags=["Authentication & Users"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

async def get_current_active_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    email = decode_access_token(token)
    if email is None:
        raise credentials_exception
    
    user = crud.get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuario inactivo")
    return user



@router.get("/users/me/", response_model=schemas.User)
async def read_users_me(
    current_user: models.User = Depends(get_current_active_user)
):
    return current_user

@router.get("/users/", response_model=schemas.PaginatedResponse[schemas.User]) # Verifica el response_model
async def read_all_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_active_user)
):
    # Solo los superusuarios pueden ver la lista de todos los usuarios
    if not current_admin.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos para ver la lista de usuarios."
        )
    
    users_list = crud.get_users(db=db, skip=skip, limit=limit)
    total_users = crud.get_users_count(db=db) # Necesitas esta función en crud.py

    return {
        "items": users_list,
        "total": total_users,
        "page": (skip // limit) + 1 if limit > 0 else 1,
        "limit": limit,
        "pages": (total_users + limit - 1) // limit if limit > 0 else (1 if total_users > 0 else 0)
    }

        
@router.post("/token", response_model=schemas.Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = crud.get_user_by_email(db, email=form_data.username)
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario inactivo",
        )
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/users/", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
async def create_new_admin_user(
    user_to_create: schemas.UserCreate, # Schema para los datos del nuevo usuario
    # Podríamos añadir un query param opcional ?as_superuser=true si un superadmin puede crear otro superadmin
    # set_as_superuser_param: bool = Query(False, description="Establecer el nuevo usuario como superusuario (solo para superadmins)"),
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_active_user) # El usuario que realiza la acción
):
    # 1. Verificar que el usuario actual sea superusuario
    if not current_admin.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos para crear nuevos usuarios."
        )

    # 2. Verificar si el email ya existe
    db_user_by_email = crud.get_user_by_email(db, email=user_to_create.email)
    if db_user_by_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, # Conflicto en lugar de Bad Request
            detail=f"El email '{user_to_create.email}' ya está registrado."
        )
        
    # 3. Determinar si el nuevo usuario será superusuario
    # Por defecto, un superadmin crea otros admins que NO son superadmins.
    # Si quieres permitir que un superadmin cree a otro, necesitarías un campo en UserCreate
    # o un parámetro query adicional y validarlo.
    # Ejemplo sencillo: Los nuevos usuarios creados así no son superadmins.
    new_user_is_superuser_flag = False
    # if set_as_superuser_param and current_admin.is_superuser: # Lógica si se permite crear superusuarios
    #     new_user_is_superuser_flag = True
        
    created_user = crud.create_user(db=db, user=user_to_create, is_superuser_flag=new_user_is_superuser_flag)
    return created_user

@router.put("/users/{user_id_to_update}", response_model=schemas.User)
async def update_user_by_admin(
    user_in: schemas.UserUpdate, # Los datos a actualizar
    user_id_to_update: int = Path(..., ge=1, description="ID del usuario a actualizar"),
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_active_user) # El admin que realiza la acción
):
    # 1. Solo los superusuarios pueden actualizar a otros usuarios
    if not current_admin.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos para actualizar usuarios."
        )

    # 2. Obtener el usuario a actualizar
    db_user_to_update = crud.get_user(db, user_id=user_id_to_update) # get_user debe existir en crud.py
    if not db_user_to_update:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario a actualizar no encontrado.")

    # 3. (Opcional) Impedir que un superadmin se quite a sí mismo el flag de superadmin si es el FIRST_SUPERUSER_EMAIL
    #    o si es el único superadmin que queda. Esta lógica está mejor en el CRUD (update_user_details).
    #    La función CRUD `update_user_details` ya contiene esta lógica de protección.

    updated_user = crud.update_user_details(
        db=db, 
        user_to_update_id=user_id_to_update, 
        user_in=user_in, 
        current_performing_user=current_admin
    )
    if updated_user is None: # Podría ser redundante si get_user ya lanzó 404
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario a actualizar no encontrado o fallo en la actualización.")
    
    return updated_user