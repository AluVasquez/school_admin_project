from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from .. import crud, models, schemas
# Asumo que get_db está en auth.py o en un archivo similar accesible
# Si get_db está en routers.auth, la importación sería:
from .auth import get_db, get_current_active_user
# Si moviste get_db a database.py, sería: from ..database import get_db

router = APIRouter(
    prefix="/payments",
    tags=["Payments"],
    dependencies=[Depends(get_current_active_user)] # Proteger todos los endpoints de pagos
)

@router.post("/", response_model=schemas.PaymentResponse, status_code=status.HTTP_201_CREATED)
async def register_new_payment(
    payment_in: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    # current_user: models.User = Depends(get_current_active_user) # current_user ya está en dependencies a nivel de router
):
    """
    Registra un nuevo pago y lo asigna a los cargos aplicados especificados.

    - **representative_id**: ID del representante que realiza el pago.
    - **payment_date**: Fecha del pago.
    - **amount_paid**: Monto pagado en la moneda especificada.
    - **currency_paid**: Moneda del pago (VES, USD, EUR).
    - **payment_method**: Método de pago (ej. "Transferencia", "Efectivo", "PagoMovil").
    - **reference_number**: Número de referencia opcional.
    - **receipt_image_url**: URL de la imagen del recibo opcional.
    - **notes**: Notas opcionales.
    - **allocations_details**: Lista de cargos a los que se aplica este pago:
        - **applied_charge_id**: ID del cargo aplicado.
        - **amount_to_allocate_ves**: Monto en VES a asignar a este cargo desde este pago.
    """
    try:
        # La función crud.create_payment ya maneja la mayoría de las validaciones
        # y lanza HTTPException en caso de errores (ej. representante no encontrado,
        # tasa de cambio no encontrada, problemas de asignación, etc.)
        db_payment = crud.create_payment(db=db, payment_in=payment_in)
        return db_payment
    except HTTPException:
        # Si crud.create_payment lanza una HTTPException, la relanzamos
        # para que FastAPI la maneje correctamente.
        raise
    except Exception as e:
        # Captura cualquier otro error inesperado durante el proceso
        # Podrías loggear el error 'e' aquí para un mejor diagnóstico
        print(f"Error inesperado al registrar pago: {e}") # Imprimir en consola para depuración
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocurrió un error interno inesperado al procesar el pago: {str(e)}"
        )

# --- Endpoints Adicionales para Pagos (GET) ---

@router.get("/{payment_id}", response_model=schemas.PaymentResponse)
async def read_payment_details(
    payment_id: int,
    db: Session = Depends(get_db)
):
    """
    Obtiene los detalles de un pago específico, incluyendo sus asignaciones.
    """
    db_payment = crud.get_payment(db, payment_id=payment_id)
    if db_payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pago no encontrado")
    return db_payment

@router.get("/", response_model=schemas.PaginatedResponse[schemas.PaymentResponse]) 
async def read_payments_list(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=200), # Default a 10 para probar
    representative_id: Optional[int] = Query(None, description="Filtrar por ID de representante"),
    start_date: Optional[date] = Query(None, description="Fecha de inicio del pago"),
    end_date: Optional[date] = Query(None, description="Fecha de fin del pago"),
    payment_method: Optional[str] = Query(None, description="Filtrar por método de pago"),
    currency_paid: Optional[models.Currency] = Query(None, description="Filtrar por moneda pagada"), # Usa el enum del modelo
    db: Session = Depends(get_db)

):
    payments_data = crud.get_payments( 
        db=db, 
        skip=skip, 
        limit=limit, 
        representative_id=representative_id,
        start_date=start_date,
        end_date=end_date,
        payment_method=payment_method,
        currency_paid=currency_paid
    )
    return payments_data

@router.get("/representative/{representative_id}", response_model=List[schemas.PaymentResponse])
async def read_payments_for_representative_api( # Renombrado para evitar conflicto con el parámetro representative_id de read_payments_list
    representative_id: int,
    skip: int = 0,
    limit: int = 100,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """
    Obtiene una lista de pagos para un representante específico.
    """
    # Validar que el representante exista podría ser una buena adición aquí
    db_representative = crud.get_representative(db, representative_id=representative_id)
    if not db_representative:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Representante con ID {representative_id} no encontrado."
        )
        
    payments = crud.get_payments_for_representative(
        db=db, 
        representative_id=representative_id, 
        skip=skip, 
        limit=limit,
        start_date=start_date,
        end_date=end_date
    )
    return payments