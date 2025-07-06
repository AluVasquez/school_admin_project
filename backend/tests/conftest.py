import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool # Necesario para SQLite en memoria con múltiples "hilos" de TestClient
from ..models import User # Necesitarás el modelo User
from ..routers.auth import get_current_active_user # La dependencia original de autenticación

# Importa tu Base de modelos y la función get_db original
from ..database import Base # Asumiendo que Base está en database.py
from ..main import app # Tu aplicación FastAPI
from ..routers.auth import get_db # La dependencia original que vamos a sobrescribir

# --- Configuración de la Base de Datos de Prueba ---
# Usaremos una base de datos SQLite en memoria para las pruebas
# Es rápida y se crea/destruye con cada sesión de prueba (o como la configuremos)
SQLALCHEMY_DATABASE_URL_TEST = "sqlite:///:memory:" # SQLite en memoria

# Para SQLite en memoria, necesitamos StaticPool para TestClient
# y asegurar que se use la misma conexión para cada "hilo" de prueba.
engine_test = create_engine(
    SQLALCHEMY_DATABASE_URL_TEST,
    connect_args={"check_same_thread": False}, # Necesario para SQLite
    poolclass=StaticPool, # Importante para SQLite en memoria con TestClient
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)

# --- Creación y Destrucción de Tablas para las Pruebas ---
# Esta fixture se ejecutará una vez por sesión de prueba
@pytest.fixture(scope="session", autouse=True)
def create_test_tables():
    # Antes de que comiencen las pruebas, crea todas las tablas en la BD de prueba
    Base.metadata.create_all(bind=engine_test)
    yield # Las pruebas se ejecutan aquí
    # Después de que todas las pruebas terminen (opcionalmente podrías hacer drop_all)
    # Base.metadata.drop_all(bind=engine_test) # Comentado por si prefieres que la BD en memoria simplemente desaparezca


# --- Sobrescribir la Dependencia get_db ---
# Esta función se usará en lugar de la get_db original durante las pruebas
def override_get_db_test():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

# Aplicamos la sobrescritura de la dependencia en nuestra app
# Esto asegura que todos los endpoints usen la BD de prueba
app.dependency_overrides[get_db] = override_get_db_test


def override_get_current_active_user():
    # Puedes devolver un objeto User simulado con los datos que necesites
    # para que tus endpoints funcionen (si dependen de algún campo del usuario).
    # Para muchos endpoints CRUD, solo necesitan saber QUE hay un usuario.
    return User(id=1, email="testuser@example.com", full_name="Test User", is_active=True, hashed_password="fakehashedpassword")

# Aplicamos la sobrescritura de la dependencia de autenticación en nuestra app
# Esto asegura que los endpoints protegidos no fallen por falta de autenticación EN LAS PRUEBAS
app.dependency_overrides[get_current_active_user] = override_get_current_active_user





# --- Fixture para el TestClient ---
# Esta fixture proporciona una instancia del TestClient a nuestras funciones de prueba
@pytest.fixture(scope="module") # Podría ser "function" si quieres un cliente totalmente nuevo por test
def client():
    with TestClient(app) as c: # Usamos un context manager para asegurar limpieza
        yield c