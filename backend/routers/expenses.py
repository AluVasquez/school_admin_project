from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from sqlalchemy.orm import Session
from typing import List, Optional, Dict # Asegurar Dict
from datetime import date # Asegurar date

from .. import crud, models, schemas
from .auth import get_db, get_current_active_user

router = APIRouter(
    prefix="/expenses",
    tags=["Expenses & Expense Payments"],
    dependencies=[Depends(get_current_active_user)]
)

# --- Endpoints para Expenses ---

@router.post("/", response_model=schemas.ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_new_expense(
    expense_in: schemas.ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    try:
        return crud.create_expense(db=db, expense_in=expense_in, user_id=current_user.id)
    except HTTPException as e_http:
        raise e_http
    except Exception as e:
        # Log e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al crear gasto: {str(e)}")

@router.get("/", response_model=schemas.PaginatedResponse[schemas.ExpenseResponse])
async def read_all_expenses(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    expense_date_start: Optional[date] = Query(None, description="Fecha de inicio del gasto"),
    expense_date_end: Optional[date] = Query(None, description="Fecha de fin del gasto"),
    category_id: Optional[int] = Query(None, description="Filtrar por ID de categoría"),
    supplier_id: Optional[int] = Query(None, description="Filtrar por ID de proveedor"),
    payment_status: Optional[models.ExpensePaymentStatus] = Query(None, description="Filtrar por estado de pago del gasto"),
    # user_id: Optional[int] = Query(None, description="Filtrar por ID de usuario que registró"), # Opcional
    search_description: Optional[str] = Query(None, description="Buscar en la descripción del gasto"),
    sort_by: str = Query("expense_date", description="Campo de ordenamiento para gastos"),
    sort_order: str = Query("desc", enum=["asc", "desc"]),
    db: Session = Depends(get_db)
):
    # Aquí podrías añadir una validación para sort_by si es necesario
    expenses_data = crud.get_expenses(
        db, skip=skip, limit=limit, expense_date_start=expense_date_start, expense_date_end=expense_date_end,
        category_id=category_id, supplier_id=supplier_id, payment_status=payment_status,
        search_description=search_description, sort_by=sort_by, sort_order=sort_order
    )
    return expenses_data

@router.get("/{expense_id}", response_model=schemas.ExpenseResponse)
async def read_single_expense(
    expense_id: int = Path(..., ge=1),
    db: Session = Depends(get_db)
):
    db_expense = crud.get_expense(db, expense_id=expense_id)
    if db_expense is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado")
    return db_expense

@router.put("/{expense_id}", response_model=schemas.ExpenseResponse)
async def update_existing_expense(
    expense_in: schemas.ExpenseUpdate,
    expense_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user) # Para registrar quién actualiza
):
    try:
        updated_expense = crud.update_expense(db=db, expense_id=expense_id, expense_in=expense_in, user_id=current_user.id)
        if updated_expense is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado para actualizar")
        return updated_expense
    except HTTPException as e_http:
        raise e_http
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al actualizar gasto: {str(e)}")

@router.patch("/{expense_id}/cancel", response_model=schemas.ExpenseResponse)
async def cancel_single_expense_endpoint(
    expense_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    try:
        cancelled_expense = crud.cancel_expense(db=db, expense_id=expense_id, user_id=current_user.id)
        if cancelled_expense is None: # Aunque el CRUD lanza 404, doble chequeo no está de más.
             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado para cancelar")
        return cancelled_expense
    except HTTPException as e_http:
        raise e_http
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al cancelar gasto: {str(e)}")

# --- Endpoints para Expense Payments (anidados bajo un gasto) ---

@router.post("/{expense_id}/payments/", response_model=schemas.ExpensePaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_new_expense_payment(
    payment_in: schemas.ExpensePaymentCreate,
    expense_id: int = Path(..., ge=1, description="ID del gasto al que se asociará este pago"),    
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    if payment_in.expense_id != expense_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El ID del gasto en el path y en el cuerpo del pago no coinciden."
        )
    try:
        # Pass payment_in directly to the CRUD function as it matches the schema
        return crud.create_expense_payment(db=db, payment_in=payment_in, user_id=current_user.id)
    except HTTPException as e_http:
        raise e_http
    except Exception as e:
        # Consider logging the full error e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al registrar pago del gasto: {str(e)}")

@router.get("/{expense_id}/payments/", response_model=List[schemas.ExpensePaymentResponse])
async def read_payments_for_expense(
    expense_id: int = Path(..., ge=1),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db)
):
    # Verificar que el gasto exista primero podría ser una buena práctica
    db_expense = crud.get_expense(db, expense_id=expense_id)
    if not db_expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado para listar sus pagos.")
    
    payments = crud.get_payments_for_expense(db, expense_id=expense_id, skip=skip, limit=limit)
    return payments

# Si necesitas un endpoint para obtener un ExpensePayment específico por su ID:
@router.get("/payments/{payment_id}", response_model=schemas.ExpensePaymentResponse, tags=["Expense Payments (Individual)"]) # Tag separado opcional
async def read_single_expense_payment(
    payment_id: int = Path(..., ge=1),
    db: Session = Depends(get_db)
):
    db_payment = crud.get_expense_payment(db, payment_id=payment_id)
    if db_payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pago de gasto no encontrado")
    return db_payment


@router.get("/reports/by-category", response_model=List[schemas.ExpenseSummaryByCategory], tags=["Expense Reports"])
async def get_expenses_report_by_category(
    start_date: date = Query(...),
    end_date: date = Query(...),
    personnel_expenses_filter: Optional[str] = Query(None, enum=["show_only_personnel", "exclude_personnel"], description="Filtro para gastos de personal: 'show_only_personnel' o 'exclude_personnel'"),
    db: Session = Depends(get_db)
):
    current_usd_rate = None
    usd_rate_model = crud.get_latest_exchange_rate(db, from_currency=models.Currency.USD, on_date=date.today())
    if usd_rate_model and usd_rate_model.rate:
        current_usd_rate = usd_rate_model.rate
        
    include_category_id_to_pass: Optional[int] = None
    exclude_category_id_to_pass: Optional[int] = None
    
    PERSONNEL_SALARY_CATEGORY_NAME = "Sueldos y Salarios del Personal" # Definir como constante

    if personnel_expenses_filter:
        personnel_salary_category = crud.get_expense_category_by_name(db, name=PERSONNEL_SALARY_CATEGORY_NAME)
        if personnel_salary_category:
            if personnel_expenses_filter == "show_only_personnel":
                include_category_id_to_pass = personnel_salary_category.id
            elif personnel_expenses_filter == "exclude_personnel":
                exclude_category_id_to_pass = personnel_salary_category.id
        else:
            print(f"ADVERTENCIA: Categoría '{PERSONNEL_SALARY_CATEGORY_NAME}' no encontrada para el filtro de personal.")
            
    try:
        summary = crud.get_expenses_summary_by_category(
            db=db, 
            start_date=start_date, 
            end_date=end_date, 
            current_usd_rate=current_usd_rate,
            include_only_category_id=include_category_id_to_pass, # Nuevo
            exclude_category_id=exclude_category_id_to_pass 
        )
        return summary
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        # Log e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al generar reporte por categoría: {str(e)}")

@router.get("/reports/by-supplier", response_model=List[schemas.ExpenseSummaryBySupplier], tags=["Expense Reports"])
async def get_expenses_report_by_supplier(
    start_date: date = Query(...),
    end_date: date = Query(...),
    personnel_expenses_filter: Optional[str] = Query(None, enum=["show_only_personnel", "exclude_personnel"], description="Filtro para gastos de personal: 'show_only_personnel' o 'exclude_personnel'"),
    db: Session = Depends(get_db)
):
    current_usd_rate = None
    usd_rate_model = crud.get_latest_exchange_rate(db, from_currency=models.Currency.USD, on_date=date.today())
    if usd_rate_model and usd_rate_model.rate:
        current_usd_rate = usd_rate_model.rate
    
    include_category_id_to_pass: Optional[int] = None
    exclude_category_id_to_pass: Optional[int] = None
    
    PERSONNEL_SALARY_CATEGORY_NAME = "Sueldos y Salarios del Personal"

    if personnel_expenses_filter:
        personnel_salary_category = crud.get_expense_category_by_name(db, name=PERSONNEL_SALARY_CATEGORY_NAME)
        if personnel_salary_category:
            if personnel_expenses_filter == "show_only_personnel":
                include_category_id_to_pass = personnel_salary_category.id
            elif personnel_expenses_filter == "exclude_personnel":
                exclude_category_id_to_pass = personnel_salary_category.id
        else:
            print(f"ADVERTENCIA: Categoría '{PERSONNEL_SALARY_CATEGORY_NAME}' no encontrada para el filtro de personal.")
            
    try:
        summary = crud.get_expenses_summary_by_supplier( 
            db=db, 
            start_date=start_date, 
            end_date=end_date, 
            current_usd_rate=current_usd_rate,
            include_only_category_id=include_category_id_to_pass,
            exclude_category_id=exclude_category_id_to_pass 
        )
        return summary
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        # Log e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al generar reporte por proveedor: {str(e)}")

@router.get("/reports/trend", response_model=List[schemas.MonthlyExpenseSummary], tags=["Expense Reports"]) # Reutilizamos MonthlyExpenseSummary
async def get_expenses_trend_report_endpoint(
    start_date: date = Query(..., description="Fecha de inicio para la tendencia (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Fecha de fin para la tendencia (YYYY-MM-DD)"),
    granularity: str = Query("month", enum=["day", "month", "year"], description="Granularidad: 'day', 'month' o 'year'."),
    personnel_expenses_filter: Optional[str] = Query(None, enum=["show_only_personnel", "exclude_personnel"], description="Filtro para gastos de personal: 'show_only_personnel' o 'exclude_personnel'"),
    db: Session = Depends(get_db)
):
    """
    Obtiene la tendencia de gastos totales (VES y USD equivalente) por período
    dentro de un rango de fechas y con una granularidad específica.
    La conversión a USD utiliza la tasa más reciente del sistema.
    """
    current_usd_rate = None
    try:
        # Obtener la tasa USD actual para los cálculos de equivalencia
        usd_rate_model = crud.get_latest_exchange_rate(db, from_currency=models.Currency.USD, on_date=date.today())
        if usd_rate_model and usd_rate_model.rate:
            current_usd_rate = usd_rate_model.rate
    except Exception as e_rate:
        print(f"Advertencia: No se pudo obtener la tasa USD para el reporte de tendencia de gastos. Error: {str(e_rate)}")
        # Continuar sin la tasa, el CRUD manejará current_usd_rate como None.
        
    include_category_id_to_pass: Optional[int] = None
    exclude_category_id_to_pass: Optional[int] = None
    
    PERSONNEL_SALARY_CATEGORY_NAME = "Sueldos y Salarios del Personal" # Definir como constante

    if personnel_expenses_filter:
        personnel_salary_category = crud.get_expense_category_by_name(db, name=PERSONNEL_SALARY_CATEGORY_NAME)
        if personnel_salary_category:
            if personnel_expenses_filter == "show_only_personnel":
                include_category_id_to_pass = personnel_salary_category.id
            elif personnel_expenses_filter == "exclude_personnel":
                exclude_category_id_to_pass = personnel_salary_category.id
        else:
            print(f"ADVERTENCIA: Categoría '{PERSONNEL_SALARY_CATEGORY_NAME}' no encontrada para el filtro de personal.")

    try:
        summary = crud.get_expense_trend_report( # 
            db=db, 
            start_date=start_date, 
            end_date=end_date, 
            granularity=granularity, # Pasar la granularidad
            current_usd_rate=current_usd_rate,
            include_only_category_id=include_category_id_to_pass,
            exclude_category_id=exclude_category_id_to_pass
        )
        return summary
    
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        # Log e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al generar reporte de tendencia de gastos: {str(e)}")
    
    
@router.get(
    "/reports/detailed-transactions",
    response_model=List[schemas.DetailedExpenseTransaction],
    tags=["Expense Reports"]
)
async def get_detailed_expense_transactions_report_endpoint( # Nombre de función consistente con tus otros reportes
    start_date: date = Query(..., description="Fecha de inicio para el reporte (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Fecha de fin para el reporte (YYYY-MM-DD)"),
    personnel_expenses_filter: Optional[str] = Query(None, enum=["show_only_personnel", "exclude_personnel"], description="Filtro para gastos de personal: 'show_only_personnel' o 'exclude_personnel'"),
    db: Session = Depends(get_db)
    # current_user: models.User = Depends(get_current_active_user) # Ya está en las dependencias del router
):
    current_usd_rate = None
    try:
        usd_rate_model = crud.get_latest_exchange_rate(db, from_currency=models.Currency.USD, on_date=date.today())
        if usd_rate_model and usd_rate_model.rate:
            current_usd_rate = usd_rate_model.rate
    except Exception as e_rate:
        print(f"Advertencia: No se pudo obtener la tasa USD para el reporte detallado de gastos. Error: {str(e_rate)}")

    include_category_id_to_pass: Optional[int] = None
    exclude_category_id_to_pass: Optional[int] = None
    
    PERSONNEL_SALARY_CATEGORY_NAME = "Sueldos y Salarios del Personal" # Definir como constante

    if personnel_expenses_filter:
        personnel_salary_category = crud.get_expense_category_by_name(db, name=PERSONNEL_SALARY_CATEGORY_NAME)
        if personnel_salary_category:
            if personnel_expenses_filter == "show_only_personnel":
                include_category_id_to_pass = personnel_salary_category.id
            elif personnel_expenses_filter == "exclude_personnel":
                exclude_category_id_to_pass = personnel_salary_category.id
        else:
            print(f"ADVERTENCIA: Categoría '{PERSONNEL_SALARY_CATEGORY_NAME}' no encontrada para el filtro de personal.")

    try:
        transactions = crud.get_detailed_expense_transactions(
            db=db,
            start_date=start_date,
            end_date=end_date,
            current_usd_rate=current_usd_rate,
            include_only_category_id=include_category_id_to_pass, # Nuevo
            exclude_category_id=exclude_category_id_to_pass      # Modificado
        )
        return transactions
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        # Log e
        print(f"Error interno al generar reporte detallado de gastos: {e}") # Log para el backend
        raise HTTPException(status_code=500, detail=f"Error interno al generar reporte detallado de gastos: {str(e)}")