# backend/routers/invoices.py

from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from .. import crud, models, schemas
from .auth import get_db, get_current_active_user

router = APIRouter(
    prefix="/invoices",
    tags=["Invoices & Billing"],
    dependencies=[Depends(get_current_active_user)]
)

@router.post("/", response_model=schemas.InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_new_invoice(
    invoice_in: schemas.InvoiceCreate,
    db: Session = Depends(get_db)
):
    """
    Crea y emite una nueva factura. Este es un endpoint de alto nivel que
    orquesta la creación y la emisión fiscal.
    """
    try:
        # 1. Crear el objeto de factura en memoria con sus validaciones y snapshots.
        db_invoice = crud.create_invoice(db=db, invoice_in=invoice_in)

        # 2. Lógica de Emisión basada en el tipo (AHORA CON VALIDACIÓN)
        db_invoice.status = models.InvoiceStatus.EMITTED

        if invoice_in.emission_type == models.EmissionType.FORMA_LIBRE:
            if not invoice_in.manual_control_number:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Para emisión en Forma Libre, el número de control del formato preimpreso es obligatorio."
                )
            # Verificar si el número de control manual ya existe
            existing_control_num = db.query(models.Invoice).filter(models.Invoice.fiscal_control_number == invoice_in.manual_control_number).first()
            if existing_control_num:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"El número de control '{invoice_in.manual_control_number}' ya ha sido utilizado en otra factura."
                )
            db_invoice.fiscal_control_number = invoice_in.manual_control_number
            db_invoice.fiscal_invoice_number = db_invoice.invoice_number # Usar el interno como referencia
        
        elif invoice_in.emission_type == models.EmissionType.DIGITAL:
            # Lógica futura para llamar al servicio de Imprenta Digital
            # Por ahora, simulamos
            db_invoice.fiscal_control_number = f"CTRL-DIGITAL-{db_invoice.invoice_number}"
            db_invoice.fiscal_invoice_number = f"FISC-DIGITAL-{db_invoice.invoice_number}"
            db_invoice.digital_invoice_url = f"https://example.com/invoices/{db_invoice.id}.pdf"

        elif invoice_in.emission_type == models.EmissionType.FISCAL_PRINTER:
            # Lógica futura para llamar al servicio de Impresora Fiscal
            # Por ahora, simulamos
            db_invoice.fiscal_control_number = f"CTRL-PRINTER-{db_invoice.invoice_number}"
            db_invoice.fiscal_invoice_number = f"FISC-PRINTER-{db_invoice.invoice_number}"
        
        # 3. Actualizar el correlativo de la escuela
        school_config = crud.get_school_configuration(db)
        school_config.next_internal_invoice_reference += 1
        db.add(school_config)

        # 4. Actualizar los AppliedCharges para vincularlos a la nueva factura
        # Es necesario añadir la factura a la sesión para que obtenga un ID temporal
        db.add(db_invoice)
        db.flush()

        for item in db_invoice.items:
            if item.applied_charge:
                 item.applied_charge.invoice_id = db_invoice.id
                 db.add(item.applied_charge)

        # 5. Hacer commit de toda la transacción
        db.commit()
        db.refresh(db_invoice) # Refrescar para obtener el ID final y otros datos
        
        return db_invoice

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        print(f"Error inesperado al crear factura: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocurrió un error interno inesperado: {str(e)}"
        )


@router.get("/", response_model=schemas.PaginatedResponse[schemas.InvoiceResponse])
async def read_all_invoices(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    representative_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    status: Optional[models.InvoiceStatus] = Query(None),
    invoice_number: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Lista facturas con filtros y paginación.
    """
    invoices_data = crud.get_invoices(
        db, skip=skip, limit=limit, representative_id=representative_id,
        start_date=start_date, end_date=end_date, status=status,
        invoice_number=invoice_number
    )
    return invoices_data

@router.get("/{invoice_id}", response_model=schemas.InvoiceResponse)
async def read_invoice(
    invoice_id: int,
    db: Session = Depends(get_db)
):
    """
    Obtiene los detalles de una factura específica.
    """
    db_invoice = crud.get_invoice(db, invoice_id=invoice_id)
    if db_invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    return db_invoice

@router.post("/{invoice_id}/annul", response_model=schemas.InvoiceResponse)
async def annul_existing_invoice(
    invoice_id: int,
    annul_request: schemas.AnnulInvoiceRequest,
    db: Session = Depends(get_db)
):
    """
    Anula una factura existente.
    """
    try:
        annulled_invoice = crud.annul_invoice(db, invoice_id=invoice_id, reason=annul_request.reason)
        db.commit()
        db.refresh(annulled_invoice)
        return annulled_invoice
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al anular factura: {str(e)}")

@router.post("/{invoice_id}/fiscalize", response_model=schemas.InvoiceResponse)
async def fiscalize_invoice(
    invoice_id: int,
    fiscal_details_in: schemas.InvoiceFiscalDetailsUpdate,
    db: Session = Depends(get_db)
):
    """
    Endpoint de contingencia para actualizar una factura con datos fiscales externos
    después de haber sido creada.
    """
    try:
        updated_invoice = crud.update_invoice_fiscal_details(db, invoice_id, fiscal_details_in)
        db.commit()
        db.refresh(updated_invoice)
        return updated_invoice
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al fiscalizar factura: {str(e)}")