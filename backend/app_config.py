from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Para cargar desde un archivo .env en desarrollo
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding='utf-8', extra='ignore')

    # Base de datos
    DATABASE_URL: str = "sqlite:///./school.db" # Valor por defecto si no se encuentra en .env

    # Seguridad y JWT
    SECRET_KEY: str = "TRESTRISTESTIGRESCOMENTRIGOENUNTRIGAL" # Cambia esto en tu .env
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440 # 1 día por defecto

    # Credenciales del superusuario inicial (opcional, pero recomendado para la contraseña)
    FIRST_SUPERUSER_EMAIL: str = "admin@escuela.com"
    FIRST_SUPERUSER_PASSWORD: str = "admin123" # Definitivamente cambia esto en .env
    FIRST_SUPERUSER_FULL_NAME: str = "Administrador Principal del Sistema"
    
    
settings = Settings()