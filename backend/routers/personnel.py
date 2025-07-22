# backend/routers/personnel.py

from fastapi import (
    APIRouter, Depends, HTTPException, status, 
    Query, Path, File, UploadFile, Body
)
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from typing import List, Optional, Dict, Any
from datetime import date
import shutil
import os
import uuid # Para nombres de archivo únicos
from pydantic import Field

# Importaciones del proyecto
from .. import crud, models, schemas # 'models' y 'schemas' con nombres en inglés
from ..database import SessionLocal # O tu forma de obtener SessionLocal
from .auth import get_db, get_current_active_user # Para dependencia de BD y usuario
from ..crud import BusinessLogicError # Excepción personalizada del CRUD

router = APIRouter(
    prefix="/personnel",
    tags=["Personnel Management - Administración de Personal"],
    dependencies=[Depends(get_current_active_user)]
)

# Directorio para guardar las fotos de los empleados
EMPLOYEE_PHOTOS_DIR = "./static/employee_photos" 
if not os.path.exists(EMPLOYEE_PHOTOS_DIR):
    os.makedirs(EMPLOYEE_PHOTOS_DIR)

# --- Schemas Auxiliares para Payloads Específicos ---
# (Idealmente, estos estarían en schemas.py, pero los defino aquí por simplicidad para este paso)
class EmployeeHoursInputItem(schemas.BaseModel):
    employee_id: int
    hours: float = Field(..., gt=0, description="Horas trabajadas por el empleado en el período de la nómina.")

class PayrollRunConfirmPayload(schemas.BaseModel):
    employee_hours_input: Optional[List[EmployeeHoursInputItem]] = Field(
        None, 
        description="Opcional: Lista de horas trabajadas para empleados con frecuencia 'por hora' incluidos en esta corrida."
    )
    # Puedes añadir más campos aquí si la confirmación necesita otros datos.

class PayrollRunStatusUpdatePayload(schemas.BaseModel):
    status: models.PayrollRunStatus = Field(..., description="Nuevo estado para la corrida de nómina.")
    notes: Optional[str] = Field(None, description="Notas adicionales para el cambio de estado.")


# --- Endpoints for Department ---
@router.post("/departments/", response_model=schemas.DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_new_department(
    department_in: schemas.DepartmentCreate,
    db: Session = Depends(get_db)
):
    try:
        return crud.create_department(db=db, department=department_in)
    except HTTPException as e_http:
        raise e_http
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al crear departamento: {str(e)}")

@router.get("/departments/", response_model=schemas.PaginatedResponse[schemas.DepartmentResponse])
async def read_all_departments(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    search: Optional[str] = Query(None, description="Buscar por nombre de departamento"),
    db: Session = Depends(get_db)
):
    return crud.get_departments(db=db, skip=skip, limit=limit, search=search)

@router.get("/departments/{department_id}", response_model=schemas.DepartmentResponse)
async def read_single_department(
    department_id: int = Path(..., ge=1, description="ID del departamento a obtener"),
    db: Session = Depends(get_db)
):
    db_department = crud.get_department(db, department_id=department_id)
    if db_department is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Departamento no encontrado")
    return db_department

@router.put("/departments/{department_id}", response_model=schemas.DepartmentResponse)
async def update_existing_department(
    department_in: schemas.DepartmentUpdate,
    department_id: int = Path(..., ge=1, description="ID del departamento a actualizar"),
    db: Session = Depends(get_db)
):
    try:
        updated_department = crud.update_department(db=db, department_id=department_id, department_in=department_in)
        if updated_department is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Departamento no encontrado para actualizar")
        return updated_department
    except HTTPException as e_http:
        raise e_http
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al actualizar departamento: {str(e)}")

@router.delete("/departments/{department_id}", response_model=schemas.DepartmentResponse)
async def delete_existing_department(
    department_id: int = Path(..., ge=1, description="ID del departamento a eliminar"),
    db: Session = Depends(get_db)
):
    try:
        deleted_department = crud.delete_department(db=db, department_id=department_id)
        if deleted_department is None: 
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Departamento no encontrado para eliminar")
        return deleted_department # El CRUD devuelve el objeto, que FastAPI serializa
    except BusinessLogicError as e_ble: 
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e_ble.detail)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al eliminar departamento: {str(e)}")

# --- Endpoints for Position ---
@router.post("/positions/", response_model=schemas.PositionResponse, status_code=status.HTTP_201_CREATED)
async def create_new_position(position_in: schemas.PositionCreate, db: Session = Depends(get_db)):
    try: return crud.create_position(db=db, position=position_in)
    except HTTPException as e: raise e
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al crear cargo: {str(e)}")

@router.get("/positions/", response_model=schemas.PaginatedResponse[schemas.PositionResponse])
async def read_all_positions(
    skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200),
    department_id: Optional[int] = Query(None, description="Filtrar por ID de departamento"),
    search: Optional[str] = Query(None, description="Buscar por nombre de cargo"),
    db: Session = Depends(get_db)
):
    return crud.get_positions(db, skip=skip, limit=limit, department_id=department_id, search=search)

@router.get("/positions/{position_id}", response_model=schemas.PositionResponse)
async def read_single_position(position_id: int = Path(..., ge=1), db: Session = Depends(get_db)):
    db_pos = crud.get_position(db, position_id=position_id)
    if not db_pos: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cargo no encontrado")
    return db_pos

@router.put("/positions/{position_id}", response_model=schemas.PositionResponse)
async def update_existing_position(
    position_in: schemas.PositionUpdate, position_id: int = Path(..., ge=1), db: Session = Depends(get_db)
):
    try:
        updated = crud.update_position(db, position_id, position_in)
        if not updated: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cargo no encontrado para actualizar")
        return updated
    except HTTPException as e: raise e
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al actualizar cargo: {str(e)}")

@router.delete("/positions/{position_id}", response_model=schemas.PositionResponse)
async def delete_existing_position(position_id: int = Path(..., ge=1), db: Session = Depends(get_db)):
    try:
        deleted = crud.delete_position(db, position_id)
        if not deleted: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cargo no encontrado para eliminar")
        return deleted
    except BusinessLogicError as e: raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.detail)
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al eliminar cargo: {str(e)}")

# --- Endpoints for Employee ---
# (Los endpoints de Employee que ya tenías se mantienen, solo asegúrate que usen los CRUDs y Schemas en inglés)
@router.post("/employees/", response_model=schemas.EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_new_employee(employee_in: schemas.EmployeeCreate, db: Session = Depends(get_db)):
    try: return crud.create_employee(db=db, employee_in=employee_in)
    except HTTPException as e: raise e
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al crear empleado: {str(e)}")

@router.get("/employees/", response_model=schemas.PaginatedResponse[schemas.EmployeeResponse])
async def read_all_employees(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=500),
    search: Optional[str] = Query(None),
    position_id: Optional[int] = Query(None),
    department_id: Optional[int] = Query(None),
    is_active: Optional[bool] = Query(True),
    balance_filter: Optional[str] = Query(None, enum=["positive", "zero", "negative"]),
    pay_frequency: Optional[models.EmployeePayFrequency] = Query(None), 
    db: Session = Depends(get_db)
):

    paginated_result = crud.get_employees(
        db, skip=skip, limit=limit, search=search,
        position_id=position_id, department_id=department_id,
        is_active=is_active, balance_filter=None
    )
    
    final_items = []
    for emp in paginated_result["items"]:
        emp.current_balance_ves = crud.get_employee_pending_balance_ves(db, employee_id=emp.id)
        
        if balance_filter:
            if balance_filter == "positive" and emp.current_balance_ves <= 0:
                continue
            if balance_filter == "zero" and emp.current_balance_ves != 0:
                continue
            if balance_filter == "negative" and emp.current_balance_ves >= 0:
                continue
        final_items.append(emp)

    paginated_result["items"] = final_items
    return paginated_result 
    
@router.get("/employees/{employee_id}", response_model=schemas.EmployeeResponse)
async def read_single_employee(employee_id: int = Path(..., ge=1), db: Session = Depends(get_db)):
    emp = crud.get_employee(db, employee_id)
    if not emp: 
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado")

    emp.current_balance_ves = crud.get_employee_pending_balance_ves(db, employee_id=emp.id)
    
    return emp

@router.put("/employees/{employee_id}", response_model=schemas.EmployeeResponse)
async def update_existing_employee(
    employee_in: schemas.EmployeeUpdate, employee_id: int = Path(..., ge=1), db: Session = Depends(get_db)
):
    try:
        updated = crud.update_employee(db, employee_id, employee_in)
        if not updated: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado para actualizar")
        return updated
    except HTTPException as e: raise e
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al actualizar empleado: {str(e)}")

@router.patch("/employees/{employee_id}/deactivate", response_model=schemas.EmployeeResponse)
async def deactivate_single_employee(employee_id: int = Path(..., ge=1), db: Session = Depends(get_db)):
    try:
        emp = crud.deactivate_employee(db, employee_id)
        if not emp: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado")
        return emp
    except BusinessLogicError as e: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.detail)
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.patch("/employees/{employee_id}/activate", response_model=schemas.EmployeeResponse)
async def activate_single_employee(employee_id: int = Path(..., ge=1), db: Session = Depends(get_db)):
    try:
        emp = crud.activate_employee(db, employee_id)
        if not emp: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado")
        return emp
    except BusinessLogicError as e: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.detail)
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/employees/{employee_id}/upload-photo", response_model=schemas.EmployeeResponse)
async def upload_employee_photo_endpoint(
    employee_id: int = Path(..., ge=1, description="ID del empleado para asociar la foto"),
    photo_file: UploadFile = File(..., description="Archivo de imagen para la foto de perfil"),
    db: Session = Depends(get_db)
):
    db_employee = crud.get_employee(db, employee_id=employee_id)
    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado")

    allowed_content_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if photo_file.content_type not in allowed_content_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Tipo de archivo no permitido: {photo_file.content_type}. Permitidos: {', '.join(allowed_content_types)}")

    file_extension = os.path.splitext(photo_file.filename)[1] if os.path.splitext(photo_file.filename)[1] else ".jpg"
    unique_filename = f"employee_{employee_id}_{uuid.uuid4().hex[:10]}{file_extension}"
    file_location = os.path.join(EMPLOYEE_PHOTOS_DIR, unique_filename)
    
    try:
        with open(file_location, "wb+") as file_object_wb:
            shutil.copyfileobj(photo_file.file, file_object_wb)
    except Exception as e_save:
        print(f"Error guardando archivo de foto: {e_save}") 
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="No se pudo guardar la foto del empleado.")
    finally:
        photo_file.file.close()

    photo_url_for_db = f"/static/employee_photos/{unique_filename}"
    
    db_employee.photo_url = photo_url_for_db
    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)
    return crud.get_employee(db, employee_id=employee_id)

# --- Endpoints for SalaryComponentDefinition ---
@router.post("/salary-component-definitions/", response_model=schemas.SalaryComponentDefinitionResponse, status_code=status.HTTP_201_CREATED)
async def create_new_salary_component_definition(
    component_def_in: schemas.SalaryComponentDefinitionCreate, db: Session = Depends(get_db)
):
    try: return crud.create_salary_component_definition(db, component_def_in)
    except HTTPException as e: raise e
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno creando definición de componente: {str(e)}")

@router.get("/salary-component-definitions/", response_model=schemas.PaginatedResponse[schemas.SalaryComponentDefinitionResponse])
async def read_all_salary_component_definitions(
    skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200),
    is_active: Optional[bool] = Query(None), component_type: Optional[models.SalaryComponentType] = Query(None),
    search: Optional[str] = Query(None), db: Session = Depends(get_db)
):
    return crud.get_salary_component_definitions(db, skip, limit, is_active, component_type, search)

@router.get("/salary-component-definitions/{component_def_id}", response_model=schemas.SalaryComponentDefinitionResponse)
async def read_single_salary_component_definition(component_def_id: int = Path(..., ge=1), db: Session = Depends(get_db)):
    comp_def = crud.get_salary_component_definition(db, component_def_id)
    if not comp_def: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Definición de componente salarial no encontrada.")
    return comp_def

@router.put("/salary-component-definitions/{component_def_id}", response_model=schemas.SalaryComponentDefinitionResponse)
async def update_existing_salary_component_definition(
    component_def_in: schemas.SalaryComponentDefinitionUpdate, component_def_id: int = Path(..., ge=1), db: Session = Depends(get_db)
):
    try:
        updated = crud.update_salary_component_definition(db, component_def_id, component_def_in)
        if not updated: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Definición no encontrada para actualizar.")
        return updated
    except HTTPException as e: raise e
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al actualizar definición: {str(e)}")
    

@router.delete("/salary-component-definitions/{component_def_id}", response_model=schemas.SalaryComponentDefinitionResponse)
async def delete_existing_salary_component_definition(component_def_id: int = Path(..., ge=1), db: Session = Depends(get_db)):
    try:
        deleted = crud.delete_salary_component_definition(db, component_def_id)
        if not deleted: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Definición no encontrada para eliminar.")
        return deleted
    except BusinessLogicError as e: raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.detail)
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al eliminar: {str(e)}")

# --- Endpoints for EmployeeSalaryComponent (Assignments) ---
@router.post("/employee-salary-components/", response_model=schemas.EmployeeSalaryComponentResponse, status_code=status.HTTP_201_CREATED)
async def assign_component_to_employee_endpoint(assignment_in: schemas.EmployeeSalaryComponentCreate, db: Session = Depends(get_db)):
    try: return crud.assign_salary_component_to_employee(db, assignment_in)
    except HTTPException as e: raise e
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error asignando componente: {str(e)}")
    

@router.get("/employees/{employee_id}/salary-components/", response_model=List[schemas.EmployeeSalaryComponentResponse])
async def get_employee_components_endpoint(
    employee_id: int = Path(..., ge=1), 
    is_active: Optional[bool] = Query(None, description="Filtrar por estado de la asignación (activa/inactiva)"), 
    db: Session = Depends(get_db)
):
    employee = crud.get_employee(db, employee_id)
    if not employee: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado.")
    return crud.get_salary_components_for_employee(db, employee_id, is_active=is_active)

@router.get(
    "/employees/{employee_id}/payable-items",
    response_model=List[schemas.EmployeePayableItemResponse], 
    summary="Obtener Items por Pagar a un Empleado",
    tags=["Personnel - Payroll"] 
)
async def get_employee_payable_items_endpoint(
    employee_id: int = Path(..., ge=1, description="ID del empleado"),
    db: Session = Depends(get_db)
):
    """
    Devuelve una lista de todos los conceptos pendientes de pago (nóminas, bonos, etc.)
    para un empleado específico. Usado por el modal de registro de pagos.
    """
    # Verificamos que el empleado exista primero
    employee = crud.get_employee(db, employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado.")
    
    payable_items = crud.get_employee_payable_items(db, employee_id=employee_id)
    return payable_items


@router.put("/employee-salary-components/{assignment_id}", response_model=schemas.EmployeeSalaryComponentResponse)
async def update_employee_component_assignment_endpoint(
    assignment_in: schemas.EmployeeSalaryComponentUpdate, assignment_id: int = Path(..., ge=1), db: Session = Depends(get_db)
):
    try:
        updated = crud.update_employee_salary_component_assignment(db, assignment_id, assignment_in)
        if not updated: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asignación de componente no encontrada.")
        return updated
    except HTTPException as e: raise e
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error actualizando asignación: {str(e)}")
    

@router.delete("/employee-salary-components/{assignment_id}", response_model=schemas.EmployeeSalaryComponentResponse)
async def delete_employee_component_assignment_endpoint(assignment_id: int = Path(..., ge=1), db: Session = Depends(get_db)):
    deleted = crud.delete_employee_salary_component_assignment(db, assignment_id)
    if not deleted: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asignación de componente no encontrada para eliminar.")
    return deleted


# --- Endpoints for PayrollRun ---
@router.post("/payroll-runs/draft", response_model=schemas.PayrollRunResponse, status_code=status.HTTP_201_CREATED)
async def create_payroll_run_draft_endpoint(
    payroll_run_in: schemas.PayrollRunCreate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try: return crud.create_payroll_run_draft(db, payroll_run_in, current_user.id)
    except HTTPException as e: raise e
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error creando borrador de nómina: {str(e)}")
    

@router.get("/payroll-runs/", response_model=schemas.PaginatedResponse[schemas.PayrollRunResponse])
async def read_all_payroll_runs(
    skip: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
    status: Optional[models.PayrollRunStatus] = Query(None),
    pay_frequency: Optional[models.EmployeePayFrequency] = Query(None),
    start_date_filter: Optional[date] = Query(None), end_date_filter: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    return crud.get_payroll_runs(db, skip, limit, status, pay_frequency, start_date_filter, end_date_filter)

@router.get("/payroll-runs/{payroll_run_id}", response_model=schemas.PayrollRunResponse)
async def read_single_payroll_run(payroll_run_id: int = Path(...,ge=1), db: Session = Depends(get_db)):
    run = crud.get_payroll_run(db, payroll_run_id)
    if not run: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corrida de nómina no encontrada.")
    return run

@router.post("/payroll-runs/{payroll_run_id}/confirm", response_model=schemas.PayrollRunResponse)
async def confirm_payroll_run_endpoint(
    payroll_run_id: int = Path(..., ge=1),
    payload: PayrollRunConfirmPayload = Body(...), # Recibe el payload con horas opcionales
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    employee_hours_map_dict: Optional[Dict[int, float]] = None
    if payload.employee_hours_input:
        employee_hours_map_dict = {item.employee_id: item.hours for item in payload.employee_hours_input}
        
    try:
        return crud.process_and_confirm_payroll_run(db, payroll_run_id, current_user.id, employee_hours_map_dict)
    except BusinessLogicError as e: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.detail)
    except HTTPException as e_http: raise e_http
    except Exception as e: 
        print(f"Error al confirmar nómina {payroll_run_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al confirmar nómina: {str(e)}")
    

@router.patch("/payroll-runs/{payroll_run_id}/status", response_model=schemas.PayrollRunResponse)
async def update_payroll_run_status_endpoint(
    payload: PayrollRunStatusUpdatePayload, # Usar el schema específico para el body
    payroll_run_id: int = Path(..., ge=1),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        updated_run = crud.update_payroll_run_status(db, payroll_run_id, payload.status, current_user.id, payload.notes)
        if not updated_run: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corrida de nómina no encontrada o transición de estado no permitida.")
        return updated_run
    except BusinessLogicError as e: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.detail)
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error actualizando estado de nómina: {str(e)}")
    

@router.delete("/payroll-runs/{payroll_run_id}/draft", response_model=schemas.PayrollRunResponse)
async def delete_payroll_run_draft_endpoint(payroll_run_id: int = Path(..., ge=1), db: Session = Depends(get_db)):
    try:
        deleted_run = crud.delete_payroll_run_draft(db, payroll_run_id)
        if not deleted_run: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corrida de nómina no encontrada.")
        return deleted_run
    except BusinessLogicError as e: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.detail)
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error eliminando borrador de nómina: {str(e)}")


# --- Endpoints for EmployeeBalanceAdjustment ---
@router.post("/employee-balance-adjustments/", response_model=schemas.EmployeeBalanceAdjustmentResponse, status_code=status.HTTP_201_CREATED)
async def create_employee_balance_adjustment_endpoint(
    adjustment_in: schemas.EmployeeBalanceAdjustmentCreate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try: return crud.create_employee_balance_adjustment(db, adjustment_in, current_user.id)
    except HTTPException as e: raise e
    except Exception as e: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error creando ajuste de saldo: {str(e)}")
    

@router.get("/employees/{employee_id}/balance-adjustments/", response_model=schemas.PaginatedResponse[schemas.EmployeeBalanceAdjustmentResponse])
async def get_employee_balance_adjustments_list_endpoint(
    employee_id: int = Path(..., ge=1),
    skip: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    emp = crud.get_employee(db, employee_id)
    if not emp: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado.")
    return crud.get_balance_adjustments_for_employee(db, employee_id, skip, limit)


# --- Endpoints for EmployeePayment ---
@router.post("/employee-payments/", response_model=schemas.EmployeePaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_employee_payment_made_by_school_endpoint( # Nombre más descriptivo
    payment_in: schemas.EmployeePaymentCreate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try: return crud.create_employee_payment(db, payment_in, current_user.id)
    except HTTPException as e: raise e
    except Exception as e:
        print(f"Error creando pago a empleado: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno creando pago a empleado: {str(e)}")
    

@router.get("/employees/{employee_id}/payments-made/", response_model=schemas.PaginatedResponse[schemas.EmployeePaymentResponse])
async def get_employee_payments_made_list_endpoint( # Nombre más descriptivo
    employee_id: int = Path(..., ge=1),
    skip: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    emp = crud.get_employee(db, employee_id)
    if not emp: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado.")
    return crud.get_payments_for_employee(db, employee_id, skip, limit)


@router.post("/employees/{employee_id}/loans", response_model=schemas.EmployeeLoanResponse, status_code=status.HTTP_201_CREATED, summary="Registrar Préstamo o Adelanto")
async def register_employee_loan(
    employee_id: int,
    loan_in: schemas.EmployeeLoanCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Registra un nuevo préstamo o adelanto para un empleado.
    Esto crea el registro del préstamo para seguimiento y un item de saldo negativo
    que será deducido en futuras nóminas.
    """
    if loan_in.employee_id != employee_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El ID del empleado en la URL y en el cuerpo no coinciden.")
    try:
        new_loan = crud.create_employee_loan(db, loan_in, current_user.id)
        
        db.commit()
        db.refresh(new_loan)

        return new_loan
    except BusinessLogicError as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.detail)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al crear el préstamo: {str(e)}")


@router.get("/employees/{employee_id}/loans", response_model=List[schemas.EmployeeLoanResponse], summary="Obtener Historial de Préstamos")
async def get_employee_loans_history(
    employee_id: int,
    db: Session = Depends(get_db)
):
    """Obtiene el historial completo de préstamos y adelantos para un empleado específico."""
    return crud.get_loans_for_employee(db, employee_id=employee_id)


@router.post("/social-benefits/update-all", summary="Actualizar Prestaciones de Todos los Empleados")
async def run_social_benefits_update(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Ejecuta el proceso que calcula y actualiza los abonos trimestrales y anuales
    de las prestaciones sociales para todos los empleados activos.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acción restringida a superusuarios.")
    
    result = crud.run_update_social_benefits_process(db)
    return result


@router.get("/employees/{employee_id}/severance", summary="Generar Reporte de Liquidación")
async def get_employee_severance_report(
    employee_id: int,
    db: Session = Depends(get_db)
):
    """
    Calcula y devuelve un reporte detallado de la liquidación de prestaciones sociales
    para un empleado específico, comparando ambos métodos y seleccionando el más favorable.
    """
    try:
        report = crud.generate_severance_calculation(db, employee_id)
        return report
    except HTTPException as e:
        raise e
    
    
@router.get("/employees/{employee_id}/salary-history", response_model=List[schemas.SalaryHistoryResponse], summary="Obtener Historial de Salarios")
async def get_employee_salary_history(
    employee_id: int,
    db: Session = Depends(get_db)
):
    """Obtiene el historial de cambios salariales para un empleado específico."""
    history = crud.get_salary_history_for_employee(db, employee_id=employee_id)
    if not history:
        # Devuelve una lista vacía si no hay historial, no un error 404.
        return []
    return history


@router.post("/attendance-records/", response_model=schemas.AttendanceRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_new_attendance_record(
    record_in: schemas.AttendanceRecordCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Registra una nueva entrada de horas trabajadas para un empleado."""
    # Aquí podrías añadir validaciones (ej. no registrar horas en el futuro)
    return crud.create_attendance_record(db, record_in=record_in, user_id=current_user.id)


@router.get("/employees/{employee_id}/attendance-records/", response_model=List[schemas.AttendanceRecordResponse])
async def get_employee_attendance_records(
    employee_id: int,
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db)
):
    """Obtiene los registros de asistencia de un empleado en un rango de fechas."""
    # Esta función CRUD necesitaría ser creada en crud.py
    return db.query(models.AttendanceRecord)\
        .filter(models.AttendanceRecord.employee_id == employee_id, models.AttendanceRecord.work_date.between(start_date, end_date))\
        .order_by(models.AttendanceRecord.work_date.desc()).all()
        
        
@router.post("/leave-types/", response_model=schemas.LeaveTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_new_leave_type(leave_type_in: schemas.LeaveTypeCreate, db: Session = Depends(get_db)):
    return crud.create_leave_type(db, leave_type_in)

@router.get("/leave-types/", response_model=List[schemas.LeaveTypeResponse])
async def get_all_leave_types(db: Session = Depends(get_db)):
    return crud.get_leave_types(db)

@router.put("/leave-types/{leave_type_id}", response_model=schemas.LeaveTypeResponse)
async def update_existing_leave_type(leave_type_id: int, leave_type_in: schemas.LeaveTypeUpdate, db: Session = Depends(get_db)):
    updated = crud.update_leave_type(db, leave_type_id, leave_type_in)
    if not updated: raise HTTPException(status_code=404, detail="Tipo de ausencia no encontrado.")
    return updated

@router.delete("/leave-types/{leave_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_existing_leave_type(leave_type_id: int, db: Session = Depends(get_db)):
    try:
        deleted = crud.delete_leave_type(db, leave_type_id)
        if not deleted: raise HTTPException(status_code=404, detail="Tipo de ausencia no encontrado.")
    except BusinessLogicError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.detail)
    
    
@router.post("/leave-requests/", response_model=schemas.LeaveRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_new_leave_request(
    request_in: schemas.LeaveRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Crea una nueva solicitud de ausencia para un empleado.
    Un administrador puede crearla en nombre de un empleado.
    """
    try:
        # Aquí pasamos el ID del usuario que está haciendo la solicitud
        new_request = crud.create_leave_request(db, request_in, requested_by_user_id=current_user.id)
        return new_request
    except BusinessLogicError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno creando la solicitud: {str(e)}")


@router.get("/leave-requests/", response_model=List[schemas.LeaveRequestResponse])
async def get_all_leave_requests(
    status: Optional[models.LeaveRequestStatus] = Query(None, description="Filtrar por estado de la solicitud"),
    employee_id: Optional[int] = Query(None, description="Filtrar por un empleado específico"),
    start_date: Optional[date] = Query(None, description="Fecha de inicio para filtrar el rango"),
    end_date: Optional[date] = Query(None, description="Fecha de fin para filtrar el rango"),
    db: Session = Depends(get_db)
):
    """
    Obtiene una lista de solicitudes de ausencia, con filtros opcionales.
    """
    # Nota: Necesitarías crear la función crud.get_leave_requests que aplique estos filtros.
    # Por ahora, implementaremos el filtro de estado que es el que necesita la página.
    query = db.query(models.LeaveRequest).options(
        joinedload(models.LeaveRequest.employee),
        joinedload(models.LeaveRequest.leave_type)
    ).order_by(desc(models.LeaveRequest.created_at))

    if status:
        query = query.filter(models.LeaveRequest.status == status)
    
    # Aquí se podrían añadir los otros filtros (employee_id, fechas)...

    return query.all()


@router.put("/leave-requests/{request_id}", response_model=schemas.LeaveRequestResponse)
async def update_existing_leave_request(
    request_id: int,
    request_in: schemas.LeaveRequestUpdate, # Necesitarás crear este schema
    db: Session = Depends(get_db)
):
    """
    Actualiza los detalles de una solicitud de ausencia (ej: fechas, motivo).
    """
    try:
        updated = crud.update_leave_request(db, request_id, request_in)
        if not updated:
            raise HTTPException(status_code=404, detail="Solicitud de ausencia no encontrada.")
        return updated
    except BusinessLogicError as e:
        raise HTTPException(status_code=409, detail=e.detail)


@router.patch("/leave-requests/{request_id}/status", response_model=schemas.LeaveRequestResponse)
async def update_leave_request_status_endpoint(
    request_id: int,
    payload: schemas.LeaveRequestStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Actualiza el estado de una solicitud de ausencia (Ej: aprobar, rechazar).
    """
    try:
        updated_request = crud.update_leave_request_status(
            db=db,
            request_id=request_id,
            new_status=payload.status,
            processed_by_user_id=current_user.id
        )
        if not updated_request:
            raise HTTPException(status_code=404, detail="Solicitud de ausencia no encontrada.")
        return updated_request
    except BusinessLogicError as e:
        raise HTTPException(status_code=400, detail=e.detail)
    
    
@router.get(
    "/payroll-runs/{payroll_run_id}/cost-report",
    response_model=schemas.PayrollCostReportResponse,
    summary="Obtener Reporte de Costo de Nómina",
    tags=["Payroll Reports"] # Permite crear un nuevo tag para reportes
)
async def get_payroll_cost_report_endpoint(
    payroll_run_id: int = Path(..., ge=1, description="ID de la corrida de nómina"),
    db: Session = Depends(get_db)
):
    """
    Genera y devuelve un reporte de costos resumido para una corrida de nómina específica
    que ya ha sido confirmada. Totaliza salarios, asignaciones, deducciones y neto.
    """
    try:
        report_data = crud.get_payroll_cost_report_for_run(db, payroll_run_id=payroll_run_id)
        if not report_data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corrida de nómina no encontrada.")
        return report_data
    except BusinessLogicError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.detail)
    except Exception as e:
        # Log del error 'e'
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al generar el reporte: {str(e)}")
    
    
@router.get(
    "/employees/{employee_id}/positive-payable-items", 
    response_model=List[schemas.EmployeePayableItemResponse],
    summary="Obtener Items con Saldo Positivo para un Empleado",
    tags=["Personnel - Payroll"]
)
async def get_employee_positive_payable_items_endpoint(
    employee_id: int = Path(..., ge=1, description="ID del empleado"),
    db: Session = Depends(get_db)
):
    """
    Devuelve una lista de todos los conceptos pendientes de pago con saldo positivo
    para un empleado. Se usa en el modal de deducciones para seleccionar a qué
    concepto se le aplicará la deducción.
    """
    employee = crud.get_employee(db, employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado.")
    
    # Llamada a la nueva función del CRUD
    positive_items = crud.get_positive_payable_items_for_employee(db, employee_id=employee_id)
    return positive_items