
import os 
from pathlib import Path 
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent # Esto obtiene el directorio de 'backend'
ENV_FILE_PATH = BASE_DIR / ".env"

class Settings(BaseSettings):

    model_config = SettingsConfigDict(env_file=str(ENV_FILE_PATH), env_file_encoding='utf-8', extra='ignore')

    # Base de datos
    DATABASE_URL: str = "postgresql+psycopg2://school_admin:69_Schooladmindb_69@school-admin-db-instance.cbcoea8ege89.us-east-1.rds.amazonaws.com:5432/postgres"


    # Seguridad y JWT
    SECRET_KEY: str = "TRESTRISTESTIGRESCOMENTRIGOENUNTRIGAL" # Cambia esto en tu .env
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440 # 1 día por defecto

    FIRST_SUPERUSER_EMAIL: str = "admin@escuela.com"
    FIRST_SUPERUSER_PASSWORD: str = "admin123" # Definitivamente cambia esto en .env
    FIRST_SUPERUSER_FULL_NAME: str = "Administrador Principal del Sistema"

settings = Settings()

