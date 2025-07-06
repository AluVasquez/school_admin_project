from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .database import engine, SessionLocal
from . import models 
from .app_config import settings
from . import crud

# Importación de todos tus routers
from .routers import (
    auth,
    representatives,
    students,
    config,
    grade_levels,
    charge_concept,
    applied_charges,
    exchange_rates,
    billing_processes,
    payments,
    invoices,
    credit_notes,
    dashboard,
    expense_categories, 
    suppliers,          
    expenses,
    personnel,
    payslips       
)
# Importaciones CRUD y Schemas para la creación del superusuario
from .crud import get_user_by_email, create_user, get_expense_category_by_name, create_expense_category
from .schemas import UserCreate, ExpenseCategoryCreate

# Crea las tablas de la base de datos (incluyendo las nuevas si los modelos están correctamente definidos e importados)
models.Base.metadata.create_all(bind=engine)


def create_first_superuser_if_not_exists():
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=settings.FIRST_SUPERUSER_EMAIL)
        if not user:
            print(f"INFO:     Superusuario '{settings.FIRST_SUPERUSER_EMAIL}' no encontrado. Creándolo...")
            superuser_in = UserCreate(
                email=settings.FIRST_SUPERUSER_EMAIL,
                password=settings.FIRST_SUPERUSER_PASSWORD, 
                full_name=settings.FIRST_SUPERUSER_FULL_NAME
            )
            # Llamar a crud.create_user pasando el flag is_superuser_flag=True
            # Esto asume que se ha modificado crud.create_user 
            # def create_user(db: Session, user: schemas.UserCreate, is_superuser_flag: bool = False) -> models.User:
            crud.create_user(db=db, user=superuser_in, is_superuser_flag=True)
            print(f"INFO:     Superusuario '{settings.FIRST_SUPERUSER_EMAIL}' creado exitosamente con privilegios de superusuario.")
        else:
            # Opcional: Verificar si el superusuario existente tiene is_superuser=True y actualizarlo si no.
            # Esto es por si la base de datos ya existía antes de añadir el campo is_superuser.
            if not user.is_superuser:
                print(f"INFO:     Superusuario '{settings.FIRST_SUPERUSER_EMAIL}' existe pero no tiene flag de superusuario. Actualizando...")
                user.is_superuser = True
                db.add(user)
                db.commit()
                db.refresh(user)
                print(f"INFO:     Superusuario '{settings.FIRST_SUPERUSER_EMAIL}' actualizado con privilegios de superusuario.")
            else:
                print(f"INFO:     Superusuario '{settings.FIRST_SUPERUSER_EMAIL}' ya existe con privilegios de superusuario. No se tomaron acciones.")
    finally:
        db.close()
        
        
def create_default_data():
    db = SessionLocal()
    try:
        # 1. Crear categoría de gasto para "Sueldos y Salarios" si no existe
        salary_category_name = "Sueldos y Salarios del Personal"
        salary_category = get_expense_category_by_name(db, name=salary_category_name)
        if not salary_category:
            print(f"INFO:     Categoría de gasto '{salary_category_name}' no encontrada. Creándola...")
            category_in = ExpenseCategoryCreate(
                name=salary_category_name,
                description="Gastos relacionados con la nómina y pagos al personal."
            )
            create_expense_category(db, category_in=category_in)
            print(f"INFO:     Categoría '{salary_category_name}' creada exitosamente.")
        else:
            print(f"INFO:     Categoría de gasto '{salary_category_name}' ya existe. No se tomaron acciones.")
            
    finally:
        db.close()
            

# Ejecutar la creación/verificación del superusuario al iniciar la aplicación
create_first_superuser_if_not_exists() 
        
app = FastAPI(
    title="Sistema de Administración Escolar",
    description="Proyecto para la gestión de una escuela privada.",
    version="0.4.0" # Podrías incrementar la versión al añadir el módulo de gastos
)

if not os.path.exists("static"):
    os.makedirs("static")
    
app.mount("/static", StaticFiles(directory="static"), name="static") # La guarandinga de las imágenes subidas directamente.

# --- CONFIGURACIÓN DE CORS ---
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",

]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --- FIN DE CONFIGURACIÓN DE CORS ---

# --- Inclusión de todos los routers ---
app.include_router(auth.router)
app.include_router(representatives.router)
app.include_router(students.router)
app.include_router(config.router) # Para /config/school/ y potencialmente /config/exchange-rates/ si lo mueves aquí
app.include_router(grade_levels.router)
app.include_router(charge_concept.router)
app.include_router(applied_charges.router)
app.include_router(exchange_rates.router) # Router dedicado para tasas de cambio
app.include_router(billing_processes.router)
app.include_router(payments.router)
app.include_router(invoices.router)
app.include_router(credit_notes.router)
app.include_router(dashboard.router)
app.include_router(payslips.router)

# --- NUEVA INCLUSIÓN DE ROUTERS PARA EL MÓDULO DE GASTOS ---
app.include_router(expense_categories.router)
app.include_router(suppliers.router)
app.include_router(expenses.router)

# --- ACÁ MÓDULO PARA EL PERSONAL ---

app.include_router(personnel.router)


@app.get("/")
async def root():
    return { "message": "Bienvenido al Proyecto de Administración Escolar" }
