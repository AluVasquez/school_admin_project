from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from datetime import date
from typing import List
import calendar
from ..crud import get_expense_trend

from .. import crud, schemas, models 
from .auth import get_db, get_current_active_user

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
    dependencies=[Depends(get_current_active_user)]
)

@router.get("/summary", response_model=schemas.DashboardSummaryResponse) 
async def get_dashboard_summary_endpoint(db: Session = Depends(get_db)):
    """
    Obtiene un resumen rápido para el dashboard del administrador:
    - Total de representantes.
    - Total de estudiantes activos.
    - Total recaudado en el mes actual (VES).
    - Total de deuda pendiente general (VES).
    """
    summary_data = crud.get_enriched_dashboard_summary(db) 

    if not summary_data:
        # Esto podría pasar si la función CRUD devuelve None en caso de un error crítico
        # (ej. no poder obtener una tasa de cambio fundamental).
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="No se pudo generar el resumen del dashboard."
        )
    
    return summary_data

@router.get("/expense-trend", response_model=List[schemas.MonthlyExpenseSummary])
async def get_expense_trend_endpoint(
    granularity: str = Query("month", enum=["day", "month"], description="Granularidad: 'day' o 'month'."),
    count: int = Query(12, ge=1, le=365, description="Número de períodos hacia atrás (máx ~1 año para días, 3 años para meses)."), # Ajustado le para ser más flexible
    db: Session = Depends(get_db)
    # current_user: models.User = Depends(get_current_active_user) # No es estrictamente necesario aquí si crud.get_expense_trend no lo usa
):
    """
    Obtiene los gastos totales (VES y USD equivalente) por período (día o mes) 
    para los últimos 'count' períodos.
    La conversión a USD se hace con la tasa USD actual general del sistema obtenida aquí.
    """
    # 1. Obtener la tasa USD actual para pasarla a la función CRUD.
    # Esto asegura que todos los cálculos de equivalencia USD para la tendencia se hagan con la misma tasa de referencia.
    usd_rate_model = None
    current_usd_rate = None
    try:
        usd_rate_model = crud.get_latest_exchange_rate(db, from_currency=models.Currency.USD, on_date=date.today())
        if usd_rate_model and usd_rate_model.rate:
            current_usd_rate = usd_rate_model.rate
    except Exception as e_rate:

        # El CRUD get_expense_trend manejará current_usd_rate como None.
        print(f"Advertencia: No se pudo obtener la tasa USD para la tendencia de gastos. Error: {str(e_rate)}")


    # 2. Llamar a la función CRUD que hace el trabajo pesado
    try:
        # Se pasó la tasa actual (o None) a la función CRUD
        expense_data = crud.get_expense_trend(
            db=db, 
            granularity=granularity, 
            count=count, 
            current_usd_rate=current_usd_rate
        )
        return expense_data
    except ValueError as ve: # Capturar error de granularidad no soportada desde el CRUD
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        print(f"Error inesperado en get_expense_trend_endpoint: {str(e)}") 
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al procesar la tendencia de gastos."
        )

    

@router.get("/revenue-trend", response_model=List[schemas.MonthlyRevenueSummary]) 
async def get_revenue_trend_endpoint( 
    granularity: str = Query("month", enum=["day", "month"], description="Granularidad de los datos: 'day' o 'month'."),
    count: int = Query(12, ge=1, le=400, description="Número de períodos (días o meses) hacia atrás a incluir."), 
    db: Session = Depends(get_db)
):
    """
    Obtiene los ingresos totales (VES) por período (día o mes especificado) 
    para los últimos 'count' períodos.
    """
    if granularity == "day" and count > 90: # Limitar el número de días para no sobrecargar
        count = 90 # Ejemplo: máximo 3 meses de datos diarios
    elif granularity == "month" and count > 24: # Ejemplo: máximo 2 años de datos mensuales
        count = 24

    try:
        revenue_data = crud.get_revenue_trend(db, granularity=granularity, count=count)
        return revenue_data
    except ValueError as ve: # Capturar error de granularidad no soportada
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        # Manejo de otros errores inesperados
        print(f"Error inesperado en get_revenue_trend_endpoint: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno al procesar la tendencia de ingresos.")


@router.get("/billing-payment-trend", response_model=List[schemas.MonthlyBillingPaymentSummary])
async def get_billing_payment_trend_endpoint(
    months: int = Query(12, ge=1, le=36, description="Número de meses hacia atrás para la comparación."),
    db: Session = Depends(get_db)
):
    """
    Obtiene una comparación mensual del total de cargos emitidos (VES de emisión) 
    vs. el total de pagos recibidos (VES) para los últimos N meses.
    """
    trend_data = crud.get_monthly_billing_payment_summary(db, months_count=months)
    return trend_data


@router.get("/alerts/exchange-rate-status", response_model=schemas.ExchangeRateAlertResponse)
async def get_exchange_rate_alert_status(
    db: Session = Depends(get_db),
    # current_user: models.User = Depends(get_current_active_user) # Ya está en las dependencias del router
):
    """
    Verifica el estado de la tasa de cambio USD-VES para el día actual (Venezuela)
    y devuelve si necesita actualización junto con un mensaje.
    """
    alert_data = crud.check_daily_exchange_rate_status(db)
    return alert_data


@router.get("/", response_model=schemas.DashboardData)
async def get_dashboard_metrics(
    db: Session = Depends(get_db)
):
    """
    Obtiene todas las métricas y datos necesarios para el dashboard financiero principal.
    """
    return crud.get_dashboard_data(db=db)