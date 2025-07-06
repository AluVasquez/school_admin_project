from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date

from .. import crud, models, schemas
from .auth import get_db, get_current_active_user


router = APIRouter(
    prefix="/exchange-rates",
    tags=["Exchange Rates"],
    dependencies=[Depends(get_current_active_user)]
)


@router.post("/", response_model=schemas.ExchangeRateResponse, status_code=status.HTTP_201_CREATED)
async def create_new_exchange_rate(
    exchange_rate_in: schemas.ExchangeRateCreate,
    db: Session = Depends(get_db)
):

    try:
        if exchange_rate_in.from_currency not in [models.Currency.USD, models.Currency.EUR] or \
            exchange_rate_in.to_currency != models.Currency.VES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Actualmente solo se soportan tasas de USD o EUR a VES."
            )

        existing_rate = db.query(models.ExchangeRate).filter( 
            models.ExchangeRate.from_currency == exchange_rate_in.from_currency,
            models.ExchangeRate.to_currency == exchange_rate_in.to_currency,
            models.ExchangeRate.rate_date == exchange_rate_in.rate_date
        ).first()

        if existing_rate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, #Creo que conflict va mejor acá.
                detail=(
                    f"Ya existe una tasa para {exchange_rate_in.from_currency} a {exchange_rate_in.to_currency} "
                    f"en la fecha {exchange_rate_in.rate_date}. Considere actualizarla si es necesario."
                )
            )
            
        return crud.create_exchange_rate(db=db, exchange_rate_in=exchange_rate_in)
    except HTTPException as e: 
        raise e
    except Exception as e: 
        # Log e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    
    
@router.get("/latest/", response_model=schemas.ExchangeRateResponse)
async def get_latest_rate_for_currency(
    from_currency: models.Currency = Query(..., description="Moneda de origen (ej. USD o EUR)"),
    on_date: Optional[date] = Query(None, description="Obtener la tasa válida en esta fecha (YYYY-MM-DD). Si no se provee, obtiene la más reciente."),
    db: Session = Depends(get_db)
):
    if from_currency == models.Currency.VES: 
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se requiere tasa de cambio para VES a VES.")

    latest_rate = crud.get_latest_exchange_rate(db, from_currency=from_currency, to_currency=models.Currency.VES, on_date=on_date)
    if not latest_rate:
        date_str = f" en o antes de {on_date}" if on_date else ""
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No se encontró tasa de cambio para {from_currency} a VES{date_str}."
        )
    return latest_rate


@router.get("/", response_model=List[schemas.ExchangeRateResponse])
async def read_exchange_rates_list(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    from_currency: Optional[models.Currency] = Query(None),
    to_currency: Optional[models.Currency] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None)
):
    rates = crud.get_exchange_rates(
        db, skip=skip, limit=limit, from_currency=from_currency,
        to_currency=to_currency, start_date=start_date, end_date=end_date
    )
    return rates


@router.get("/{exchange_rate_id}", response_model=schemas.ExchangeRateResponse)
async def read_single_exchange_rate(exchange_rate_id: int, db: Session = Depends(get_db)):
    db_rate = crud.get_exchange_rate_by_id(db, exchange_rate_id)
    if not db_rate:
        raise HTTPException(status_code=404, detail="Tasa de cambio no encontrada.")
    return db_rate


@router.put("/{exchange_rate_id}", response_model=schemas.ExchangeRateResponse)
async def update_an_exchange_rate(
    exchange_rate_id: int,
    exchange_rate_in: schemas.ExchangeRateUpdate,
    db: Session = Depends(get_db)
):
    try:
        updated_rate = crud.update_exchange_rate(db, exchange_rate_id, exchange_rate_in)
        if not updated_rate:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tasa de cambio no encontrada o la actualización crea un conflicto.")
        return updated_rate
    except HTTPException as e: 
        raise e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    
    
@router.delete("/{exchange_rate_id}", response_model=schemas.ExchangeRateResponse) # 
async def delete_an_exchange_rate(exchange_rate_id: int, db: Session = Depends(get_db)):
    deleted_rate = crud.delete_exchange_rate(db, exchange_rate_id)
    if not deleted_rate:
        raise HTTPException(status_code=404, detail="Tasa de cambio no encontrada para eliminar.")
    return deleted_rate