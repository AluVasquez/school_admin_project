from fastapi import (
    APIRouter, Depends, HTTPException, status, 
    Query, Path, File, UploadFile, Body
)
from sqlalchemy.orm import Session
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
    limit: int = Query(10, ge=1, le=200),
    search: Optional[str] = Query(None),
    position_id: Optional[int] = Query(None, alias="position_id"), # Mantenemos alias si es necesario
    department_id: Optional[int] = Query(None, alias="department_id"),
    is_active: Optional[bool] = Query(True),
    balance_filter: Optional[str] = Query(None, enum=["positive", "zero", "negative"], description="Filtrar por estado de saldo del empleado"), # NUEVO Query Parameter
    db: Session = Depends(get_db)
):
    return crud.get_employees(
        db, skip, limit, search,
        position_id=position_id, # Asegúrate que los nombres coincidan con los del CRUD
        department_id=department_id,
        is_active=is_active,
        balance_filter=balance_filter # Pasar el nuevo filtro al CRUD
    )

@router.get("/employees/{employee_id}", response_model=schemas.EmployeeResponse)
async def read_single_employee(employee_id: int = Path(..., ge=1), db: Session = Depends(get_db)):
    emp = crud.get_employee(db, employee_id)
    if not emp: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado")
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