from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from sqlalchemy.orm import Session
from typing import Dict, Optional, List
from datetime import date
from pydantic import Field, BaseModel

from .. import crud, schemas
from .auth import get_db, get_current_active_user
from ..schemas import GenerateChargesRequest

router = APIRouter(
    prefix="/billing-processes",
    tags=["Billing Processes"],
    dependencies=[Depends(get_current_active_user)]
)

    
    
@router.post("/generate-recurring-charges", response_model=schemas.GenerateChargesSummaryResponse) # <--- CAMBIO AQUÍ
async def generate_recurring_charges_endpoint(
    params: GenerateChargesRequest,
    db: Session = Depends(get_db)
):
    try:
        summary_dict = crud.run_generate_recurring_charges_process(
            db=db,
            target_year=params.target_year,
            target_month=params.target_month,
            issue_date_override=params.issue_date_override,
            due_date_override=params.due_date_override,
            specific_charge_concept_ids=params.charge_concept_ids
        )
        

        return summary_dict # FastAPI convertirá este dict al schema si los campos coinciden

    except HTTPException:
        raise
    except ValueError as ve:
        # Log ve
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        # Log e
        print(f"Error en generate_recurring_charges_endpoint: {e}") 
        # import traceback; traceback.print_exc(); # Para depuración más detallada
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocurrió un error inesperado durante la generación de cargos: {str(e)}"
        )
        
        
@router.post("/representative/{representative_id}/apply-credit", response_model=schemas.ApplyCreditProcessResponse)
async def apply_representative_available_credit(
    representative_id: int = Path(..., title="ID del Representante", ge=1),
    db: Session = Depends(get_db)
    # current_user: models.User = Depends(get_current_active_user) # Ya está en las dependencias del router
):
    """
    Intenta aplicar cualquier saldo a favor (crédito disponible) de un representante
    a sus cargos pendientes o parcialmente pagados.
    """
    # 1. Verificar que el representante exista
    db_representative = crud.get_representative(db, representative_id=representative_id)
    if not db_representative:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Representante con ID {representative_id} no encontrado."
        )

    try:
        # 2. Llamar a la función CRUD que hace el trabajo pesado
        credit_application_result_dict = crud.apply_representative_credit_to_pending_charges(
            db=db,
            representative_id=representative_id
        )
        # La función CRUD devuelve un diccionario. Pydantic lo convertirá
        # al response_model schemas.ApplyCreditProcessResponse si los campos coinciden.
        return credit_application_result_dict
    except HTTPException:
        # Si la función CRUD lanza una HTTPException (ej. 500 por fallo en commit), relanzarla.
        raise
    except Exception as e:
        # Capturar cualquier otro error inesperado no manejado por el CRUD
        # Podrías loggear 'e' aquí
        print(f"Error inesperado al aplicar crédito para representante ID {representative_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocurrió un error interno inesperado al aplicar el crédito: {str(e)}"
        )
        
        
@router.post("/apply-global-charge", response_model=schemas.GlobalChargeSummaryResponse)
async def apply_global_charge_endpoint(
    charge_details: schemas.GlobalChargeCreate, # Recibe los detalles del cargo global
    db: Session = Depends(get_db)
    # current_user: models.User = Depends(get_current_active_user) # Ya está en las dependencias del router
):
    """
    Aplica un concepto de cargo específico a un grupo de estudiantes (todos los activos o todos).
    Toma en cuenta las becas individuales de los estudiantes.
    """
    try:
        summary = crud.run_apply_global_charge_process(db=db, charge_details=charge_details)
        return summary
    except HTTPException:
        # Relanzar HTTPExceptions que puedan venir del CRUD (ej. Concepto no encontrado, tasa no encontrada)
        raise
    except ValueError as ve: # Capturar ValueErrors de validaciones Pydantic o del CRUD
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        # Capturar cualquier otro error inesperado
        print(f"Error inesperado en apply_global_charge_endpoint: {str(e)}") # Loguear el error
        # import traceback; traceback.print_exc(); # Para depuración más detallada
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocurrió un error interno inesperado al aplicar el cargo global: {str(e)}"
        )