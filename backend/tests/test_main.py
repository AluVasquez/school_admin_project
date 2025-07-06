from fastapi.testclient import TestClient
from ..main import app

client = TestClient(app)


def test_read_root():
    """
    Prueba el endpoint raíz ("/") para asegurar que devuelve el mensaje esperado o si todo se va a la shiat.
    """
    response = client.get("/") # Hacemos una solicitud GET a "/"
    assert response.status_code == 200 # Verificamos que el código de estado sea 200 OK
    assert response.json() == {"message": "Bienvenido al API de Administración Escolar"}