import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool # Necesario para SQLite en memoria con múltiples "hilos" de TestClient

# Importa tu Base de modelos y la función get_db original
from ..database import Base # Asumiendo que Base está en database.py
from ..main import app # Tu aplicación FastAPI
from ..routers.auth import get_db # La dependencia original que vamos a sobrescribir

def test_create_representative_success(client): # PyTest inyectará la fixture 'client' aquí
    """
    Prueba la creación exitosa de un representante.
    """
    representative_data = {
        "first_name": "Pepe",
        "last_name": "Pruebas",
        "cedula_type": "V",
        "cedula_number": "12345678",
        "phone_main": "0412-1234567",
        "email": "pepe.pruebas@example.com",
        # Puedes añadir más campos opcionales si quieres
    }
    response = client.post("/representatives/", json=representative_data) # Usamos el nuevo prefijo de ruta
    
    assert response.status_code == 201 # HTTP 201 Created
    
    data = response.json()
    assert data["email"] == representative_data["email"]
    assert data["first_name"] == representative_data["first_name"]
    assert data["last_name"] == representative_data["last_name"]
    assert "id" in data # Un representante creado debe tener un ID
    assert data["cedula"] == f"{representative_data['cedula_type']}{representative_data['cedula_number']}"

def test_create_representative_duplicate_email(client):
    """
    Prueba que no se pueda crear un representante con un email duplicado.
    """
    # Primero, creamos un representante
    representative_data1 = {
        "first_name": "Ana",
        "last_name": "Test",
        "cedula_type": "V",
        "cedula_number": "87654321",
        "phone_main": "0416-7654321",
        "email": "ana.test@example.com",
    }
    response1 = client.post("/representatives/", json=representative_data1)
    assert response1.status_code == 201

    # Luego, intentamos crear otro con el mismo email
    representative_data2 = {
        "first_name": "Beto", # Diferente nombre
        "last_name": "User",
        "cedula_type": "E", # Diferente cédula
        "cedula_number": "11223344",
        "phone_main": "0424-1122334",
        "email": "ana.test@example.com", # Mismo email
    }
    response2 = client.post("/representatives/", json=representative_data2)
    
    assert response2.status_code == 400 # HTTP 400 Bad Request (o el código que tu API devuelve para duplicados)
    data = response2.json()
    assert "email" in data["detail"].lower() # Verificar que el mensaje de error mencione el email