# backend/routers/payslips.py

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date
import json

from .. import crud, schemas
from .auth import get_db, get_current_active_user

router = APIRouter(
    prefix="/payslips",
    tags=["Personnel - Payslips"],
    dependencies=[Depends(get_current_active_user)]
)

@router.get("/", response_model=schemas.PaginatedPayslipResponse)
async def read_all_payslips(
    skip: int = Query(0, ge=0),
    limit: int = Query(15, ge=1, le=200),
    search: Optional[str] = Query(None, description="Buscar por nombre o CI del empleado"),
    start_date: Optional[date] = Query(None, description="Fecha de inicio para el filtro de pagos"),
    end_date: Optional[date] = Query(None, description="Fecha de fin para el filtro de pagos"),
    position_id: Optional[int] = Query(None, description="Filtrar por ID de Cargo (Position)"),
    db: Session = Depends(get_db),
):
    """
    Obtiene una lista paginada de todos los recibos de pago.
    Permite filtrar por empleado y rango de fechas.
    """
    # 1. Obtener los datos paginados del CRUD
    payslips_data = crud.get_payslips(
        db,
        skip=skip,
        limit=limit,
        search=search,
        start_date=start_date,
        end_date=end_date,
        position_id=position_id,
    )
    for payslip in payslips_data["items"]:
        if payslip.payment_breakdown_json and isinstance(payslip.payment_breakdown_json, str):
            try:
                payslip.payment_breakdown_json = json.loads(payslip.payment_breakdown_json)
            except json.JSONDecodeError:
                # Si el JSON está malformado, que devuelva una lista vacía o un error xD
                payslip.payment_breakdown_json = [] 

    return payslips_data

@router.get("/{payslip_id}", response_model=schemas.PayslipResponse)
async def read_single_payslip(
    payslip_id: int,
    db: Session = Depends(get_db)
):
    """
    Obtiene los detalles de un único recibo de pago por su ID.
    """
    db_payslip = crud.get_payslip(db, payslip_id=payslip_id)
    if not db_payslip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recibo de pago no encontrado.")
    
    # Parsear el JSON para la respuesta
    if db_payslip.payment_breakdown_json:
        try:
            db_payslip.payment_breakdown_json = json.loads(db_payslip.payment_breakdown_json)
        except json.JSONDecodeError:
            db_payslip.payment_breakdown_json = [{"name": "Error al leer desglose", "type": "deduction", "amount_ves": 0}]

    return db_payslip