# backend/schemas.py

from pydantic import BaseModel, EmailStr, Field, computed_field, model_validator
from typing import Optional, List, Literal, Generic, TypeVar, Any
from datetime import date, datetime
from . import models
from .models import ChargeFrequency, ChargeCategory, ChargeConcept, GradeLevel, SchoolConfiguration, AppliedChargeStatus, Currency, InvoiceStatus
from .models import ExpensePaymentStatus, ExpenseCategory, Supplier, Expense, ExpensePayment, EmissionType


T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    total: int
    page: int
    limit: int
    pages: int
    items: List[T]


class Token(BaseModel):
    access_token: str
    token_type: str
    
class TokenData(BaseModel):
    email: Optional[EmailStr] = None
    
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    
class UserCreate(UserBase):
    password: str
    
class User(UserBase):
    id: int
    is_active: bool
    is_superuser: bool
    
    class Config:
        from_attributes = True
        
class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_superuser: Optional[bool] = None

    
# --- (Representantes de los estudiantes) ---
        
class RepresentativeBase(BaseModel):    
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    
    
    identification_type: Literal["V", "E", "P", "J", "G"] = Field(..., description="Tipo de Identificación (V, E, P, J, G)")
    identification_number: str = Field(..., min_length=1, max_length=40, description="Número de Identificación (puede incluir letras/guiones para Pasaporte/RIF)")
    
    phone_main: str = Field(..., min_length=7, max_length=20)
    phone_secondary: Optional[str] = Field(None, max_length=20)
    email: EmailStr 
    address: Optional[str] = Field(None, max_length=255)
    sex: Optional[str] = Field(None, max_length=10) 
    profession: Optional[str] = Field(None, max_length=100)
    workplace: Optional[str] = Field(None, max_length=100)
    photo_url: Optional[str] = Field(None, max_length=255)
    
    class Config:
        from_attributes = True
        
class RepresentativeCreate(RepresentativeBase): 
    pass
        

class RepresentativeUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    
    cedula_type: Optional[Literal["V", "E"]] = Field(None, description="Tipo de Cédula (V o E)")
    identification_type: Optional[Literal["V", "E", "P", "J", "G"]] = Field(None)
    
    identification_number: Optional[str] = Field(None, min_length=1, max_length=40)
    phone_secondary: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    address: Optional[str] = Field(None, max_length=255)
    sex: Optional[str] = Field(None, max_length=10)
    profession: Optional[str] = Field(None, max_length=100)
    workplace: Optional[str] = Field(None, max_length=100)
    photo_url: Optional[str] = Field(None, max_length=255)
    
    class Config:
        from_attributes = True
    
class Representative(RepresentativeBase): # Esquema para devolver datos de un representante
    id: int
    cedula: str

    
class RepresentativeResponse(BaseModel): 
    id: int
    first_name: str
    last_name: str
    cedula: str 
    phone_main: str
    phone_secondary: Optional[str] = None
    email: EmailStr
    address: Optional[str] = None
    sex: Optional[str] = None
    profession: Optional[str] = None
    workplace: Optional[str] = None
    rif: Optional[str] = None
    photo_url: Optional[str] = None
    current_balance_due_ves_today: Optional[float] = None
    available_credit_ves: float = 0.0
    current_balance_due_usd: Optional[float] = None    
    created_at: datetime 
    updated_at: Optional[datetime] = None
    
    
    
    class Config:
        from_attributes = True
        
        
class StudentBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    cedula: Optional[str] = Field(None, min_length=5, max_length=20, unique=True, index=True)
    birth_date: Optional[date] = None 
    sex: Optional[str] = Field(None, max_length=10) 
    
    
    # Campos adicionales
    blood_type: Optional[str] = Field(None, max_length=5)
    allergies: Optional[str] = Field(None, max_length=255)
    emergency_contact_name: Optional[str] = Field(None, max_length=100)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)
    is_special_case: bool = False
    special_case_description: Optional[str] = Field(None, max_length=500)
    photo_url: Optional[str] = Field(None, max_length=255)
    
    # Becas
    has_scholarship: bool = False
    scholarship_percentage: Optional[float] = Field(None, ge=0, le=100) # Porcentaje entre 0 y 100
    scholarship_fixed_amount: Optional[float] = Field(None, ge=0) # Monto fijo no negativo
    
    class Config:
        from_attributes = True

class StudentCreate(StudentBase):
    representative_id: int 
    grade_level_id: int

class StudentUpdate(BaseModel): # No hereda de StudentBase para hacer todos los campos opcionales
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    cedula: Optional[str] = Field(None, min_length=5, max_length=20)
    birth_date: Optional[date] = None
    sex: Optional[str] = Field(None, max_length=10)
    grade_level: Optional[str] = Field(None, max_length=50)
    
    blood_type: Optional[str] = Field(None, max_length=5)
    allergies: Optional[str] = Field(None, max_length=255)
    emergency_contact_name: Optional[str] = Field(None, max_length=100)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)
    is_special_case: Optional[bool] = None
    special_case_description: Optional[str] = Field(None, max_length=500)
    photo_url: Optional[str] = Field(None, max_length=255)
    
    has_scholarship: Optional[bool] = None
    scholarship_percentage: Optional[float] = Field(None, ge=0, le=100)
    scholarship_fixed_amount: Optional[float] = Field(None, ge=0)
    
    representative_id: Optional[int] = None # Permitir cambiar de representante
    is_active: Optional[bool] = None # Para activar/desactivar (retirar)

        
        
# --- Esquemas para Configuración de la Escuela ---

class SchoolConfigurationBase(BaseModel):
    school_name: str = Field(..., max_length=255, description="Nombre de la institución educativa")
    school_rif: str = Field(..., max_length=20, description="Registro Único de Información Fiscal (RIF) de la escuela")
    school_address: Optional[str] = Field(None, description="Dirección física de la escuela")
    school_phone: Optional[str] = Field(None, max_length=50, description="Número de teléfono principal de la escuela")
    billing_email: Optional[EmailStr] = Field(None, description="Correo electrónico para asuntos de facturación")

    current_period_name: Optional[str] = Field(None, max_length=100, description="Nombre del período escolar actual (ej: Año Escolar 2024-2025)")
    current_period_start_date: Optional[date] = Field(None, description="Fecha de inicio del período escolar actual")
    current_period_end_date: Optional[date] = Field(None, description="Fecha de fin del período escolar actual")
    
    payment_due_day: Optional[int] = Field(None, ge=1, le=28, description="Día del mes para el vencimiento de pagos regulares (1-28 para ser seguro con febrero)")
    
    internal_invoice_reference_prefix: Optional[str] = Field(None, max_length=20, description="Prefijo para el número de factura (ej: 'FAC-', '00-')")
    next_internal_invoice_reference: int = Field(default=1, ge=1, description="Siguiente número de factura a utilizar")
    # control_number_prefix: Optional[str] = Field(None, max_length=20, description="Prefijo para el número de control interno") # Esto por si acaso creamos correlativo interno de facturas
    # next_control_number: int = Field(default=1, ge=1, description="Siguiente número de control interno a utilizar") # Esto por si creamos correlativo interno de facturas
    
    default_iva_percentage: Optional[float] = Field(None, ge=0, le=1, description="IVA por defecto (0.0 a 1.0)")
    document_logo_url: Optional[str] = Field(None, max_length=500, description="URL del logo para documentos")
    invoice_terms_and_conditions: Optional[str] = Field(None, description="Términos y condiciones para facturas")
    
    credit_note_reference_prefix: Optional[str] = Field(None, max_length=20)
    next_credit_note_reference: int = Field(default=1, ge=1)
    
    
class SchoolConfigurationCreate(SchoolConfigurationBase):
    pass # Hereda todos los campos, incluyendo los nuevos


class SchoolConfigurationResponse(SchoolConfigurationBase): # También hereda los nuevos campos
    id: int # siempre 1
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
    
class SchoolConfigurationUpdate(SchoolConfigurationBase):
    # Todos los campos de SchoolConfigurationBase son opcionales aquí por defecto
    # si se usa model_dump(exclude_unset=True) en el CRUD.
    # O puedes definirlos explícitamente como Optional si quieres ser más verboso.
    school_name: Optional[str] = Field(None, max_length=255)
    school_rif: Optional[str] = Field(None, max_length=20)
    # ...y así para todos los demás campos, incluyendo los nuevos
    default_iva_percentage: Optional[float] = Field(None, ge=0, le=1)
    document_logo_url: Optional[str] = Field(None, max_length=500)
    invoice_terms_and_conditions: Optional[str] = None

        
# --- Esquemas para Grados/Niveles Escolares (GradeLevel) ---

class GradeLevelBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Nombre del grado/nivel, ej: 1er Grado")
    description: Optional[str] = Field(None, max_length=500, description="Descripción adicional del grado/nivel")
    order_index: Optional[int] = Field(0, description="Índice para ordenamiento personalizado")
    is_active: bool = True
    
    class Config:
        from_attributes = True
    

class GradeLevelCreate(GradeLevelBase):
    pass


class GradeLevelUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    order_index: Optional[int] = None
    is_active: Optional[bool] = None
    
    class Config:
        from_attributes = True
    

class GradeLevelResponse(GradeLevelBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Esquema para la información básica del representante a anidar en StudentResponse

class RepresentativeInfo(BaseModel): 
    id: int
    first_name: str
    last_name: str
    cedula: str 
    email: EmailStr
    phone_main: Optional[str] = None
    address: Optional[str] = None
    
    class Config: 
        from_attributes = True
        

    
    
class StudentResponse(StudentBase): 
    id: int
    is_active: bool
    created_at: datetime 
    updated_at: Optional[datetime] = None 

    representative: Optional[RepresentativeInfo] = None 
    grade_level_assigned: Optional[GradeLevelResponse] = None 

    @computed_field
    @property
    def age(self) -> Optional[int]:
        if self.birth_date:
            today = date.today()
            age = today.year - self.birth_date.year - \
                ((today.month, today.day) < (self.birth_date.month, self.birth_date.day))
            return age
        return None
    
    
# --- Esquemas para Conceptos de Cargo (ChargeConcept) ---


class ChargeConceptBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Nombre descriptivo del concepto de cargo")
    description: Optional[str] = Field(None, max_length=1000, description="Descripción detallada opcional")
    default_amount: float = Field(..., ge=0, description="Monto por defecto. Debe ser >= 0.")
    default_amount_currency: Currency = Field(Currency.USD, description="Moneda del default_amount (ej. USD)")
    is_amount_fixed: bool = Field(True, description="True si default_amount es fijo, False si el admin puede ingresar otro monto al aplicar")
    default_frequency: ChargeFrequency = Field(ChargeFrequency.UNICO, description="Frecuencia por defecto del cargo")
    category: ChargeCategory = Field(ChargeCategory.OTRO, description="Categoría del cargo")
    
    iva_percentage: float = Field(default=0.0, ge=0, le=1, description="Porcentaje de IVA (ej: 0.16 para 16%, 0.0 para exento). Máximo 1 (100%).")    
    
    applicable_grade_level_id: Optional[int] = Field(None, description="ID del Nivel de Grado al que aplica. Nulo si es general.")
    is_active: bool = Field(True, description="Indica si el concepto de cargo está activo")

    class Config:
        from_attributes = True
        use_enum_values = True
        
        
class ChargeConceptCreate(ChargeConceptBase):
    pass


class ChargeConceptUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length = 1000)
    default_amount: Optional[float] = Field(None, ge=0)
    is_amount_fixed: Optional[bool] = None
    default_frequency: Optional[ChargeFrequency] = None # Acá se permite cambiar la currency también.
    category: Optional[ChargeCategory] = None
    
    iva_percentage: Optional[float] = Field(None, ge=0, le=1)
    
    applicable_grade_level_id: Optional[int] = None
    is_active: Optional[bool] = None
    
    class Config:
        from_attributes = True
        use_enum_values = True
        
        
class ChargeConceptResponse(ChargeConceptBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    grade_level: Optional[GradeLevelResponse] = None
    
    class Config:
        from_attributes = True
        use_enum_values = True
        
        
#  --- Para las notificaciones push para recordar el ajust de la tasa de cambio ---

class ExchangeRateAlertResponse(BaseModel):
    needs_update: bool = Field(..., description="Indica si la tasa de cambio necesita ser actualizada para hoy.")
    message: str = Field(..., description="Mensaje descriptivo sobre el estado de la tasa.")
    latest_rate_date: Optional[date] = Field(None, description="Fecha de la tasa de cambio más reciente encontrada.")
    current_date_on_server: date = Field(..., description="Fecha actual considerada por el servidor.")

    class Config:
        from_attributes = True        
        
# --- Esquemas para Cargos Aplicados (AppliedCharge) ---


class AppliedChargeClientCreate(BaseModel):
    student_id: int = Field(..., description="ID del estudiante al que se aplica el cargo")
    charge_concept_id: int = Field(..., description="ID del concepto de cargo que se está aplicando")
    description: Optional[str] = Field(None, max_length=500, description="Descripción específica para esta instancia del cargo")
    issue_date: date = Field(..., description="Fecha en que el cargo fue emitido/generado para el estudiante")
    due_date: date = Field(..., description="Fecha de vencimiento para el pago de este cargo")
    status: AppliedChargeStatus = Field(AppliedChargeStatus.PENDING, description="Estado actual del cargo aplicado")

    class Config:
        # Para Pydantic v2, usa model_config:
        # model_config = {"from_attributes": True, "use_enum_values": True}
        from_attributes = True
        use_enum_values = True
        


class AppliedChargeUpdate(BaseModel):
    description: Optional[str] = Field(None, max_length=500)
    amount_due_ves: Optional[float] = Field(None, ge=0)
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    status: Optional[AppliedChargeStatus] = None
    
    class Config:
        from_attributes = True
        use_enum_values = True
        

class AppliedChargeBaseAttributes(BaseModel): # Base para la respuesta
    id: int
    student_id: int
    charge_concept_id: int
    description: Optional[str] = None
    
    original_concept_amount: float # Bruto del concepto
    original_concept_currency: Currency
    
    amount_due_original_currency: float # Neto a pagar en moneda original (post-beca en origen)
    amount_paid_original_currency_equivalent: float # Pagado en equivalente de moneda original
    is_indexed: bool # Nuevo flag

    amount_due_ves_at_emission: float # VES al emitir
    amount_paid_ves: float # Total VES pagados
    
    exchange_rate_applied_at_emission: Optional[float] = None # Tasa usada al emitir
    invoice_id: Optional[int] = None
    
    issue_date: date
    due_date: date
    status: AppliedChargeStatus
    
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        use_enum_values = True

class AppliedChargeResponse(AppliedChargeBaseAttributes):
    student: Optional[StudentResponse] = None
    charge_concept: Optional[ChargeConceptResponse] = None
    
    # El balance_due ahora debería calcularse idealmente en la moneda original
    # y luego convertirlo a VES con la tasa actual para mostrarlo.
    # O el frontend puede hacer este cálculo.
    # Por ahora, lo comentamos aquí para que no cause conflicto si el frontend lo calcula.
    # @computed_field
    # @property
    # def balance_due_original_currency(self) -> float:
    #     return round((self.amount_due_original_currency or 0) - (self.amount_paid_original_currency_equivalent or 0), 2)

    # La Config se hereda
    
    
class GlobalChargeCreate(BaseModel):
    charge_concept_id: int = Field(..., description="ID del Concepto de Cargo a aplicar.")
    description: Optional[str] = Field(None, max_length=255, description="Descripción personalizada para este lote de cargos. Si es None, se podría usar la del concepto.")
    issue_date: date = Field(..., description="Fecha de emisión para todos los cargos generados.")
    due_date: date = Field(..., description="Fecha de vencimiento para todos los cargos generados.")
    target_students: Literal["all_active", "all"] = Field("all_active", description="Grupo de estudiantes al que se aplicará el cargo ('all_active' o 'all').")
    
    override_amount: Optional[float] = Field(None, gt=0, description="Opcional: Monto para sobrescribir el default_amount del concepto.")
    override_currency: Optional[Currency] = Field(None, description="Opcional: Moneda para sobrescribir la default_amount_currency del concepto.")

    @model_validator(mode='after')
    def check_dates_v2(self):
        if self.issue_date and self.due_date and self.due_date < self.issue_date:
            raise ValueError("La fecha de vencimiento (due_date) no puede ser anterior a la fecha de emisión (issue_date).")
        return self    

class GlobalChargeSummaryItemError(BaseModel):
    student_id: int
    student_name: str
    reason: str

class GlobalChargeSummaryResponse(BaseModel):
    message: str = "Proceso de aplicación de cargo global completado."
    charge_concept_name: str
    target_group: str
    students_evaluated: int # Cuántos estudiantes entraron en el criterio de target_students
    charges_successfully_created: int
    total_value_of_charges_created_original_currency: Optional[float] = Field(None, description="Suma de amount_due_original_currency de los cargos creados.")
    currency_of_sum: Optional[str] = Field(None, description="Moneda de la suma total de cargos creados.")
    errors_list: List[GlobalChargeSummaryItemError] = Field(default_factory=list, description="Lista de estudiantes a los que no se pudo aplicar el cargo y la razón.")

    class Config:
        from_attributes = True    
    
# --- Esquemas para Tasas de Cambio (ExchangeRate) 

class ExchangeRateBase(BaseModel):
    from_currency: Currency
    to_currency: Currency = Currency.VES # Por defecto, la conversión es a VES
    rate: float = Field(..., gt=0, description="Tasa de cambio (ej. cuántos VES son 1 USD/EUR, debe ser > 0)")
    rate_date: date = Field(..., description="Fecha para la cual esta tasa es válida")

    class Config:
        from_attributes = True
        use_enum_values = True
        
        
class ExchangeRateCreate(ExchangeRateBase):
    pass


class ExchangeRateUpdate(BaseModel):
    from_currency: Optional[Currency] = None
    to_currency: Optional[Currency] = None
    rate: Optional[float] = Field(None, gt=0)
    rate_date: Optional[date] = None

    class Config:
        from_attributes = True
        use_enum_values = True


class ExchangeRateResponse(ExchangeRateBase):
    id: int
    created_at: datetime
    
    
# --- Esquemas para la Respuesta del Proceso de Generación de Cargos    
 

class CreditApplicationAttemptSummary(BaseModel):
    representative_id: int
    message: Optional[str] = None
    allocations_count: int
    remaining_credit: Optional[float] = None

    class Config:
        from_attributes = True # Para consistencia, aunque se llene desde un dict


class GenerateChargesSummaryResponse(BaseModel):
    message: str
    target_period: str
    students_processed: int
    charges_created: int
    warnings_and_omissions: List[str] = Field(default_factory=list) # Usar default_factory para listas mutables
    errors: Optional[List[str]] = Field(None, description="Lista de errores si el proceso falló parcialmente.")
    
    credit_applications_summary: List[CreditApplicationAttemptSummary] = Field(default_factory=list, description="Resumen de los intentos de aplicación de saldo a favor por representante.")

    class Config:
        from_attributes = True

        
#--- Esquemas para Asignación de Pagos (PaymentAllocation) ---

        
class PaymentAllocationResponse(BaseModel):
    id: int
    payment_id: int
    applied_charge_id: int
    amount_allocated_ves: float
    applied_charge: Optional[AppliedChargeResponse] = None

    class Config:
        from_attributes = True
    
    
# --- Esquemas para Pagos (Payment) ---

class PaymentBase(BaseModel):
    representative_id: int = Field(..., description="ID del representante/representante que realiza el pago")
    payment_date: date = Field(..., description="Fecha en que se realizó/registró el pago")
    amount_paid: float = Field(..., gt=0, description="Monto pagado en la moneda especificada en currency_paid")
    currency_paid: Currency = Field(..., description="Moneda en la que se recibió el pago (VES, USD, EUR)")
    payment_method: Optional[str] = Field(None, max_length=100, description="Método de pago (ej: Transferencia, Efectivo, Zelle, PagoMovil)")
    reference_number: Optional[str] = Field(None, max_length=255, description="Número de referencia del pago (ej: confirmación de transferencia)")
    receipt_image_url: Optional[str] = Field(None, max_length=500, description="URL de la imagen del comprobante de pago")
    notes: Optional[str] = Field(None, description="Notas adicionales sobre el pago")

    class Config:
        from_attributes = True
        use_enum_values = True # Para que los enums se manejen como sus valores


class PaymentAllocationDetailForCreate(BaseModel): 
    applied_charge_id: int = Field(..., description="ID del cargo aplicado que se desea pagar con una porción de este pago.")
    amount_to_allocate: float = Field(..., gt=0, description="Monto en VES que se desea asignar de este pago a este cargo aplicado específico.")


class PaymentCreate(PaymentBase): 
    allocations_details: List[PaymentAllocationDetailForCreate] = Field(
        default_factory=list, # Permitir lista vacía si no se asigna nada explícitamente
        description="Lista de detalles de asignación, especificando qué cargos se pagan y con qué monto (en la moneda del pago)."
    )



class PaymentUpdate(BaseModel): # Qué campos de un pago se pueden actualizar
    payment_date: Optional[date] = None
    payment_method: Optional[str] = Field(None, max_length=100)
    reference_number: Optional[str] = Field(None, max_length=255)
    receipt_image_url: Optional[str] = Field(None, max_length=500) # Permitir actualizar la URL del recibo
    notes: Optional[str] = None


    class Config:
        from_attributes = True


class PaymentResponse(PaymentBase):
    id: int
    exchange_rate_applied: Optional[float] = Field(None, description="Tasa de cambio aplicada si el pago fue en moneda extranjera")
    amount_paid_ves_equivalent: float = Field(..., description="Monto del pago expresado en VES")
    
    representative: Optional[RepresentativeInfo] = None # Se usa el schema de la info del representante
    allocations: List[PaymentAllocationResponse] = [] # Lista de cómo se asignó este pago

    created_at: datetime
    updated_at: Optional[datetime] = None
    
    
class CreditApplicationAllocationMadeDetail(BaseModel): # Detalle de una asignación específica realizada
    payment_id_source: int = Field(..., description="ID del pago original que proveyó los fondos para esta asignación.")
    applied_charge_id_target: int = Field(..., description="ID del cargo aplicado que recibió fondos.")
    amount_allocated: float = Field(..., description="Monto en VES que fue asignado.")
    charge_new_status: str = Field(..., description="Nuevo estado del cargo aplicado después de la asignación.") # Podría ser models.AppliedChargeStatus si quieres usar el enum aquí también
    charge_new_amount_paid: float = Field(..., description="Nuevo monto total pagado del cargo aplicado.")

    class Config:
        from_attributes = True


class ApplyCreditProcessResponse(BaseModel):
    message: str
    allocations_made: List[CreditApplicationAllocationMadeDetail] = Field(default_factory=list)
    remaining_credit_after_process: float = Field(..., description="Saldo a favor restante del representante (en VES) después de este proceso.")

    class Config:
        from_attributes = True
        
        
class GenerateChargesRequest(BaseModel): # Usar BaseModel de Pydantic
    target_year: int = Field(..., gt=2020, lt=2100, description="Año para el cual generar los cargos recurrentes.")
    target_month: int = Field(..., ge=1, le=12, description="Mes para el cual generar los cargos recurrentes (1-12).")
    issue_date_override: Optional[date] = Field(None, description="Opcional: Fecha de emisión específica para los cargos generados (YYYY-MM-DD).")
    due_date_override: Optional[date] = Field(None, description="Opcional: Fecha de vencimiento específica para los cargos generados (YYYY-MM-DD).")
    charge_concept_ids: Optional[List[int]] = Field(None, description="Opcional: Lista de IDs de ChargeConcept a procesar. Si es None/vacío, procesa todos los recurrentes aplicables.")
    
    
class TransactionDetailSchema(BaseModel):
    transaction_id: int = Field(..., description="ID del cargo aplicado o del pago")
    transaction_type: str = Field(..., description="Tipo de transacción (ej: 'CARGO', 'PAGO')")
    transaction_date: date = Field(..., description="Fecha de la transacción (issue_date para cargos, payment_date para pagos)")
    description: str = Field(..., description="Descripción de la transacción")
    debit_ves: Optional[float] = Field(None, description="Monto de débito en VES (para cargos)")
    credit_ves: Optional[float] = Field(None, description="Monto de crédito en VES (para pagos)")
    # Opcional: Podríamos añadir el saldo después de esta transacción si lo calculamos secuencialmente
    # balance_after_transaction_ves: Optional[float] = None 

    class Config:
        from_attributes = True

### Tuve que ponerlos en esta posición por cuadre de jerarquías
### Esto es para el resumen detallado en el perfil del representante

class RepresentativeAccountSummarySchema(BaseModel):
    # VES calculados por el backend, algunos basados en emisión, otros indexados
    total_charges_ves_emission: float = Field(..., description="Suma de montos VES de cargos al momento de su emisión.")
    total_payments_received_ves: float = Field(..., description="Suma total de todos los pagos recibidos (equivalente en VES).")
    # current_balance_ves_emission: float = Field(..., description="Balance basado en VES de emisión (total_charges_ves_emission - total_payments_received_ves).") # Podrías mantenerlo si es útil
    explicit_available_credit_ves: float = Field(..., description="Saldo a favor explícito no asignado (en VES).")
    
    # --- Campos USD y Balance Indexado VES (NUEVOS/ACTUALIZADOS) ---
    total_due_original_currency_usd: Optional[float] = Field(None, description="Suma total adeudada en USD (de cargos originalmente en USD).")
    total_paid_original_currency_equivalent_usd: Optional[float] = Field(None, description="Suma total pagada equivalente en USD (aplicada a deudas USD).")
    current_balance_due_usd: Optional[float] = Field(None, description="Deuda pendiente neta en USD.")
    current_balance_due_ves_today: float = Field(..., description="Deuda pendiente total convertida a VES usando la tasa de cambio actual.") # Este es el balance indexado principal
    explicit_available_credit_usd_equivalent: Optional[float] = Field(None, description="Saldo a favor explícito no asignado (equivalente en USD usando tasa actual).")
    
    class Config:
        from_attributes = True
        
        
class DetailedChargeSchema(BaseModel):
    id: int
    student_name: Optional[str] = None # Nombre del estudiante al que pertenece el cargo
    charge_concept_name: str
    issue_date: date
    due_date: date
    
    original_concept_amount: float
    original_concept_currency: Currency # USD, VES, EUR
    
    # Montos netos en la moneda original del cargo (post-beca en origen si así se calcula)
    amount_due_original_currency: float 
    amount_paid_original_currency_equivalent: float
    
    # Deuda pendiente en la moneda original del cargo
    pending_debt_original_currency: float # Calculado: amount_due_original_currency - amount_paid_original_currency_equivalent

    is_indexed: bool
    status: AppliedChargeStatus # Usar el enum del modelo
    
    # Montos en VES
    amount_due_ves_at_emission: float # VES al momento de la emisión
    amount_paid_ves: float # Total VES pagado a este cargo
    
    # Deuda pendiente de ESTE CARGO en VES, calculada con la tasa actual por el backend
    current_debt_ves_today_per_charge: float 

    class Config:
        from_attributes = True
        use_enum_values = True
        
        
class DetailedPaymentSchema(BaseModel):
    id: int
    payment_date: date
    amount_paid_original: float # Monto en la moneda original del pago
    currency_paid_original: Currency # Moneda original del pago
    amount_paid_ves_equivalent: float # Equivalente en VES el día del pago
    payment_method: Optional[str] = None
    reference_number: Optional[str] = None
    
    total_amount_allocated_ves: float # Suma de PaymentAllocation.amount_allocated_ves para este pago
    unallocated_remainder_ves: float # amount_paid_ves_equivalent - total_amount_allocated_ves

    class Config:
        from_attributes = True
        use_enum_values = True


class RepresentativeAccountStatementResponse(BaseModel):
    representative_info: RepresentativeInfo
    statement_generation_date: date
    account_summary: RepresentativeAccountSummarySchema
    
    # Nuevas listas detalladas
    detailed_charges: List[DetailedChargeSchema] = Field(default_factory=list)
    detailed_payments: List[DetailedPaymentSchema] = Field(default_factory=list)
    
    # Podrías mantener transaction_history si aún lo ves útil para una vista cronológica simple,
    # o eliminarlo si las listas detalladas lo reemplazan completamente.
    # transaction_history: List[TransactionDetailSchema] = Field(default_factory=list)

    class Config:
        from_attributes = True
        
        
class TransactionDetailSchema(BaseModel): # Ya la tienes, revisa si necesita ajustes o se reemplaza
    transaction_id: int
    transaction_type: str # "CARGO" o "PAGO"
    transaction_date: date
    description: str
    debit_ves: Optional[float] = None # Para cargos, sería amount_due_ves_at_emission
    credit_ves: Optional[float] = None # Para pagos, sería amount_paid_ves_equivalent
    # Si quieres que esta lista sea más rica, podrías añadir más campos aquí también.

    class Config:
        from_attributes = True
        

 # --- Notas de crédito --- #
        
class CreditNoteItemResponse(BaseModel):
    id: int
    description: str
    quantity: int
    unit_price_ves: float
    item_subtotal_ves: float
    item_iva_ves: float
    item_total_ves: float

    class Config:
        from_attributes = True

class CreditNoteCreate(BaseModel):
    original_invoice_id: int = Field(..., description="ID de la factura original que se anulará con esta nota de crédito.")
    reason: str = Field(..., min_length=10, description="Motivo detallado para la emisión de la nota de crédito.")
    issue_date: date = Field(default_factory=date.today, description="Fecha de emisión de la nota de crédito.")
        
        
# --- Esquemas para Items de Factura (InvoiceItem) ---


class InvoiceItemBase(BaseModel):
    description: str = Field(..., max_length=500, description="Descripción del servicio o producto facturado")
    quantity: int = Field(default=1, gt=0, description="Cantidad del ítem")
    unit_price_ves: float = Field(..., ge=0, description="Precio unitario del ítem en VES (sin IVA)")
    iva_percentage: float = Field(default=0.0, ge=0, le=1, description="Porcentaje de IVA (ej: 0.16 para 16%, 0.0 para exento)")
    applied_charge_id: Optional[int] = Field(None, description="ID del AppliedCharge original si este ítem proviene de uno")

class InvoiceItemCreate(InvoiceItemBase):
    pass

class InvoiceItemResponse(InvoiceItemBase):
    id: int
    item_subtotal_ves: float = Field(..., description="Subtotal del ítem (quantity * unit_price_ves)")
    item_iva_ves: float = Field(..., description="Monto de IVA para este ítem")
    item_total_ves: float = Field(..., description="Total para este ítem (subtotal + IVA)")

    class Config:
        from_attributes = True
        
        
class InvoiceBase(BaseModel):
    representative_id: int
    issue_date: date = Field(default_factory=date.today)
    status: InvoiceStatus = InvoiceStatus.PENDING_EMISSION
    notes: Optional[str] = None

class InvoiceCreate(BaseModel):
    representative_id: int = Field(..., description="ID del Representante (cliente) al que se emite la factura")
    issue_date: Optional[date] = Field(default_factory=date.today, description="Fecha de emisión de la factura. Por defecto, hoy.")
    applied_charge_ids: List[int] = Field(..., min_length=1, description="Lista de IDs de Cargos Aplicados a incluir en esta factura.")
    emission_type: EmissionType = Field(..., description="Método de emisión de la factura.")
    
    # Campos opcionales para "factura libre" y contingencia
    bill_to_name: Optional[str] = Field(None, max_length=200, description="Nombre o Razón Social a quien se factura (si es diferente del representante)")
    bill_to_rif_or_cedula: Optional[str] = Field(None, max_length=20, description="RIF o Cédula a quien se factura (si es diferente del representante)")
    bill_to_address: Optional[str] = Field(None, description="Dirección Fiscal a quien se factura (si es diferente del representante)")
    
    # Campo para el número de control de forma libre
    manual_control_number: Optional[str] = Field(None, description="Número de control de la forma libre preimpresa (solo para modo FORMA_LIBRE)")

class InvoiceUpdate(BaseModel):
    status: Optional[InvoiceStatus] = None
    notes: Optional[str] = None
    
class InvoiceFiscalDetailsUpdate(BaseModel):
    fiscal_machine_invoice_number: str = Field(..., description="Número de factura asignado por la máquina fiscal.")
    fiscal_machine_control_number: str = Field(..., description="Número de control asignado por la máquina fiscal.")

class AnnulInvoiceRequest(BaseModel):
    reason: Optional[str] = Field(None, description="Razón opcional para la anulación.")


class InvoiceResponse(BaseModel):
    id: int
    invoice_number: str
    status: InvoiceStatus
    issue_date: date
    representative_id: int
    representative: Optional[RepresentativeInfo] = None
    credit_note_id: Optional[int] = None
    
    subtotal_ves: float
    total_iva_ves: float
    total_amount_ves: float
    
    school_name_snapshot: str
    school_rif_snapshot: str
    school_address_snapshot: Optional[str] = None
    school_phone_snapshot: Optional[str] = None
    
    representative_name_snapshot: str
    representative_rif_or_cedula_snapshot: str
    representative_address_snapshot: Optional[str] = None
    
    emission_type: Optional[EmissionType] = None
    fiscal_machine_serial: Optional[str] = None
    fiscal_invoice_number: Optional[str] = None
    fiscal_control_number: Optional[str] = None
    digital_invoice_url: Optional[str] = None
    notes: Optional[str] = None    
    
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    items: List[InvoiceItemResponse] = []

    class Config:
        from_attributes = True
        use_enum_values = True
        
        
class CreditNoteResponse(BaseModel):
    id: int
    credit_note_number: str
    issue_date: date
    reason: str
    representative_id: int
    original_invoice_id: int
    total_credited_ves: float
    
    school_rif_snapshot: str
    representative_rif_or_cedula_snapshot: str
    original_invoice_number_snapshot: str
    original_invoice_control_number_snapshot: Optional[str] = None
    
    created_at: datetime
    items: List[CreditNoteItemResponse] = []

    class Config:
        from_attributes = True
        

# Esquema para los Dashboards
    
    
class DashboardSummaryResponse(BaseModel):
    total_representatives: int
    total_active_students: int
    revenue_current_month_ves: float
    total_outstanding_debt_ves: float # Este ya es el valor indexado en VES
    
    total_expenses_current_month_ves: float = 0.0 # Default a 0.0

    # --- CAMPOS OPCIONALES PARA USD ---
    current_usd_to_ves_rate_used: Optional[float] = None # Para informar al frontend qué tasa se usó
    revenue_current_month_usd_equivalent: Optional[float] = None
    total_outstanding_debt_usd_equivalent: Optional[float] = None # Deuda original en USD si la fuente es USD
    
    total_expenses_current_month_usd_equivalent: Optional[float] = None

    class Config:
        from_attributes = True
        
        
class MonthlyExpenseSummary(BaseModel): # Schema para la tendencia de gastos
    period: str = Field(..., description="Período (ej: 'YYYY-MM' o 'YYYY-MM-DD')")
    expenses_ves: float = Field(..., description="Gastos totales en VES para ese período")
    expenses_usd_equivalent: Optional[float] = Field(None, description="Gastos totales equivalentes en USD para ese período (usando tasa de referencia)")

    class Config:
        from_attributes = True
        
        
class MonthlyRevenueSummary(BaseModel):
    period: str = Field(..., description="Período en formato 'YYYY-MM' (ej: '2025-05')")
    revenue_ves: float = Field(..., description="Ingresos totales en VES para ese período")
    revenue_usd: Optional[float] = Field(None, description="Ingresos totales en USD para ese período")

    class Config:
        from_attributes = True
        
        
class MonthlyBillingPaymentSummary(BaseModel):
    period: str = Field(..., description="Período en formato 'YYYY-MM', ej: '2025-05'")
    total_charged_ves_emission: float = Field(default=0.0, description="Suma total de cargos (amount_due_ves_at_emission) emitidos en este período.")
    total_paid_in_period_ves: float = Field(default=0.0, description="Suma total de pagos (amount_paid_ves_equivalent) recibidos en este período.")

    class Config:
        from_attributes = True






# --- Schemas para Supplier ---

class UserSimpleResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None

    # Para Pydantic v2, la configuración es así:
    # model_config = ConfigDict(from_attributes=True)
    class Config:
        from_attributes = True

# --- Schemas para ExpenseCategory ---

class ExpenseCategoryBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150, description="Nombre de la categoría del gasto")
    description: Optional[str] = Field(None, max_length=500, description="Descripción detallada de la categoría")
    is_active: bool = True

class ExpenseCategoryCreate(ExpenseCategoryBase):
    pass

class ExpenseCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None

class ExpenseCategoryResponse(ExpenseCategoryBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- Schemas para Supplier ---

class SupplierBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255, description="Nombre comercial o razón social del proveedor")
    category_id: int = Field(..., description="ID de la categoría de gasto a la que pertenece el proveedor")
    rif_ci: Optional[str] = Field(None, max_length=20, pattern=r"^[VEJPGGvejpgg]?\d+$", description="RIF o Cédula del proveedor (Ej: V12345678, J123456789)") # Ejemplo de pattern
    contact_person: Optional[str] = Field(None, max_length=150, description="Persona de contacto")
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = Field(None)
    address: Optional[str] = Field(None, max_length=1000, description="Dirección del proveedor")
    is_active: bool = True

class SupplierCreate(SupplierBase):
    pass

class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    category_id: Optional[int] = Field(None, description="ID de la nueva categoría de gasto")
    rif_ci: Optional[str] = Field(None, max_length=20, pattern=r"^[VEJPGGvejpgg]?\d+$")
    contact_person: Optional[str] = Field(None, max_length=150)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None
    address: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None

class SupplierResponse(SupplierBase):
    id: int
    category: ExpenseCategoryResponse
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- Schemas para Expense ---

class ExpenseBase(BaseModel):
    expense_date: date = Field(..., description="Fecha en que se incurrió o registró el gasto")
    description: str = Field(..., min_length=3, max_length=500, description="Descripción detallada del gasto")
    amount: float = Field(..., gt=0, description="Monto del gasto en su moneda original")
    currency: models.Currency # Usando el Enum directamente desde models
    notes: Optional[str] = Field(None, max_length=1000, description="Notas adicionales sobre el gasto")
    invoice_document_url: Optional[str] = Field(None, max_length=500, description="URL al documento de la factura del proveedor")

class ExpenseCreate(ExpenseBase):
    #category_id: int = Field(..., description="ID de la categoría a la que pertenece el gasto (obligatorio)")
    supplier_id: int = Field(None, description="ID del proveedor (opcional)")

class ExpenseUpdate(BaseModel): # Campos que se permitiría editar para un gasto existente
    expense_date: Optional[date] = None
    description: Optional[str] = Field(None, min_length=3, max_length=500)
    category_id: Optional[int] = None
    supplier_id: Optional[int] = None
    # No se suele permitir cambiar monto/moneda de un gasto ya registrado; se anula y crea nuevo.
    # amount: Optional[float] = Field(None, gt=0)
    # currency: Optional[models.Currency] = None
    notes: Optional[str] = Field(None, max_length=1000)
    invoice_document_url: Optional[str] = Field(None, max_length=500)
    # payment_status se actualiza vía pagos o acción específica.

class ExpensePaymentResponse(BaseModel): # Definición base para ForwardRef si es necesario o si se define después
    id: int
    payment_date: date
    amount_paid: float
    currency_paid: models.Currency
    amount_paid_ves_equivalent: float
    exchange_rate_applied_at_payment: Optional[float] = None
    payment_method_used: str
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    user: UserSimpleResponse
    created_at: datetime

    class Config:
        from_attributes = True
        use_enum_values = True


class ExpenseResponse(ExpenseBase):
    id: int
    category: ExpenseCategoryResponse
    supplier: Optional[SupplierResponse] = None
    user: UserSimpleResponse # Usuario que registró el gasto
    
    amount_ves_equivalent_at_creation: Optional[float] = None
    exchange_rate_at_creation: Optional[float] = None
    payment_status: models.ExpensePaymentStatus # Usando el Enum directamente desde models
    total_amount_paid_ves: float = 0.0

    payments_made: List[ExpensePaymentResponse] = Field(default_factory=list, description="Pagos realizados para este gasto")

    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        use_enum_values = True # Importante para que los Enums se serialicen a sus valores string

# --- Schemas para ExpensePayment ---
# (ExpensePaymentResponse ya está definido arriba para poder ser usado en ExpenseResponse)

class ExpensePaymentBase(BaseModel):
    payment_date: date = Field(..., description="Fecha en que se realizó el pago del gasto")
    amount_paid: float = Field(..., gt=0, description="Monto pagado en la moneda especificada")
    currency_paid: models.Currency # Usando el Enum directamente desde models
    payment_method_used: str = Field(..., min_length=2, max_length=150, description="Método usado para pagar")
    reference_number: Optional[str] = Field(None, max_length=255, description="Número de referencia de la transacción de pago")
    notes: Optional[str] = Field(None, max_length=1000, description="Notas adicionales sobre este pago específico")

class ExpensePaymentCreate(ExpensePaymentBase):
    expense_id: int = Field(..., description="ID del gasto al que se aplica este pago")
    # user_id se tomará del usuario autenticado.
    # amount_paid_ves_equivalent y exchange_rate_applied_at_payment se calculan en backend.

class ExpensePaymentUpdate(BaseModel): # Usualmente los pagos no se editan mucho, más bien se anulan.
    payment_date: Optional[date] = None
    payment_method_used: Optional[str] = Field(None, min_length=2, max_length=150)
    reference_number: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=1000)

# ExpensePaymentResponse ya está definido más arriba para que ExpenseResponse pueda usarlo.

# Nota: Si tienes problemas con referencias circulares o `ForwardRef` con la lista `payments_made`
# en `ExpenseResponse`, y `ExpensePaymentResponse` se define después de `ExpenseResponse`,
# Pydantic v2 es mejor en resolver esto automáticamente. Si no, podrías usar una string literal:
# payments_made: List['ExpensePaymentResponse'] = Field(default_factory=list)
# Y luego, si usas Pydantic v1 o por alguna razón necesitas actualizar referencias:
# ExpenseResponse.update_forward_refs() # Al final del archivo
# Pero con Pydantic v2, definir ExpensePaymentResponse antes, como hice en esta propuesta, es más limpio.


class ExpenseSummaryByCategory(BaseModel):
    category_id: int
    category_name: str
    total_expenses_ves: float = Field(default=0.0)
    total_expenses_usd_equivalent: Optional[float] = Field(None) # <--- AÑADIR/VERIFICAR
    expense_count: int = Field(default=0)
    class Config: from_attributes = True


class ExpenseSummaryBySupplier(BaseModel):
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    total_expenses_ves: float = Field(default=0.0)
    total_expenses_usd_equivalent: Optional[float] = Field(None) # <--- AÑADIR/VERIFICAR
    expense_count: int = Field(default=0)
    class Config: from_attributes = True
    
    
# --- Matriz financiera de los estudiantes (la guarandinga de los meses) ---


class MonthlyDebtDetail(BaseModel):
    """Detalle de la deuda generada para un estudiante en un mes específico."""
    month_year: str = Field(..., description="Mes y año en formato YYYY-MM, ej. '2024-08'")
    month_name: str = Field(..., description="Nombre del mes, ej. 'Agosto'")
    debt_generated_ves: float = Field(default=0.0, description="Total de deuda generada en VES para el estudiante en este mes (basado en amount_due_ves_at_emission de los cargos).")
    debt_generated_usd_equivalent: Optional[float] = Field(None, description="Equivalente en USD de la deuda generada en este mes, si aplica y se calcula.")
    
    # Para Pydantic v2, usa model_config
    # model_config = ConfigDict(from_attributes=True) # No necesario si no mapeas directamente desde un ORM con este nombre exacto
    class Config:
        from_attributes = True # Útil si construyes estos objetos desde resultados de ORM que tengan atributos con estos nombres


class StudentAnnualFinancialSummary(BaseModel):
    """Resumen financiero anual para un estudiante, detallado por mes."""
    student_id: int
    student_full_name: str
    student_cedula: Optional[str] = None
    
    monthly_debt_details: List[MonthlyDebtDetail] = Field(description="Lista de detalles de deuda para los 12 meses del año escolar consultado.")
    
    total_outstanding_debt_ves: float = Field(default=0.0, description="Deuda total pendiente acumulada del estudiante en VES (considerando todos sus cargos pendientes o parcialmente pagados).")
    total_outstanding_debt_usd_equivalent: Optional[float] = Field(None, description="Equivalente en USD de la deuda total pendiente, si aplica.")
    
    delinquency_status: Literal["green", "orange", "red", "none"] = Field(
        default="none", 
        description="Estado de morosidad: 'green' (al día), 'orange' (1 mes de retraso), 'red' (2+ meses de retraso), 'none' (sin deuda/cargos evaluables)."
    )

    class Config:
        from_attributes = True


class DetailedExpenseTransaction(BaseModel):
    expense_date: date
    description: str # Nombre del artículo/gasto
    category_name: Optional[str] = None
    supplier_name: Optional[str] = None
    payment_status: ExpensePaymentStatus # Usar el Enum para consistencia

    original_amount: float # Monto en la moneda original del gasto
    original_currency: Currency # Moneda original del gasto

    amount_ves_at_creation: float # Equivalente en VES al momento de la creación/emisión del gasto
    amount_usd_equivalent: Optional[float] = None # Equivalente en USD si se calcula

    class Config:
        from_attributes = True
        use_enum_values = True # Para que los enums se muestren como string
        
        
# Esquemas para administración del personal del plantel



class DepartmentBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200, description="Nombre del departamento")
    description: Optional[str] = Field(None, max_length=1000, description="Descripción opcional del departamento")

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)

class DepartmentResponse(DepartmentBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    # positions: List['PositionBasicResponse'] = [] # Si necesitaras la lista de cargos aquí

    class Config:
        from_attributes = True

# --- Schemas for Position ---

class PositionBase(BaseModel): # Cambiado de CargoBase
    name: str = Field(..., min_length=2, max_length=200, description="Nombre del cargo o posición")
    description: Optional[str] = Field(None, max_length=1000, description="Descripción opcional del cargo")
    department_id: int

class PositionCreate(PositionBase): # Cambiado de CargoCreate
    pass

class PositionUpdate(BaseModel): # Cambiado de CargoUpdate
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    department_id: Optional[int] = None

class PositionResponse(PositionBase): # Cambiado de CargoResponse
    id: int
    department: Optional[DepartmentResponse] = None # Anidar el departamento completo
    created_at: datetime
    updated_at: Optional[datetime] = None
    # employees: List['EmployeeBasicResponse'] = [] # Si necesitaras la lista de empleados aquí

    class Config:
        from_attributes = True

# Schemas básicos para evitar referencias circulares si se necesitaran listas bidireccionales
class DepartmentBasicResponse(BaseModel):
    id: int
    name: str
    class Config: 
        from_attributes = True

class PositionBasicResponse(BaseModel):
    id: int
    name: str
    department: Optional[DepartmentBasicResponse] = None
    class Config: 
        from_attributes = True

# --- Schemas for Employee ---

class EmployeeBase(BaseModel): # Actualiza tu EmployeeBase existente
    first_name: str = Field(..., min_length=1, max_length=150, comment="Nombres del empleado")
    last_name: str = Field(..., min_length=1, max_length=150, comment="Apellidos del empleado")
    identity_document: str = Field(..., min_length=5, max_length=50, description="Cédula, Pasaporte u otro ID")
    birth_date: Optional[date] = None
    gender: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=1000, comment="Dirección de habitación")
    primary_phone: str = Field(..., min_length=7, max_length=30)
    secondary_phone: Optional[str] = Field(None, max_length=30)
    personal_email: Optional[EmailStr] = None

    emergency_contact_name: Optional[str] = Field(None, max_length=150)
    emergency_contact_phone: Optional[str] = Field(None, max_length=30)
    emergency_contact_relationship: Optional[str] = Field(None, max_length=50, comment="Parentesco del contacto de emergencia")

    employee_code: Optional[str] = Field(None, max_length=50, comment="Código interno del empleado")
    position_id: int
    hire_date: date
    termination_date: Optional[date] = None
    contract_type: Optional[models.EmployeeContractType] = models.EmployeeContractType.INDEFINITE
    
    photo_url: Optional[str] = Field(None, max_length=500)
    additional_notes: Optional[str] = None
    is_active: bool = True

    # Nuevos campos relacionados con salario/nómina
    base_salary_amount: Optional[float] = Field(None, ge=0, description="Monto del salario base")
    base_salary_currency: Optional[models.Currency] = Field(None, description="Moneda del salario base (VES o USD)")
    pay_frequency: Optional[models.EmployeePayFrequency] = Field(None, description="Frecuencia de pago")
    hourly_rate: Optional[float] = Field(None, ge=0, description="Tarifa por hora (si aplica, en base_salary_currency)")
    # accumulated_hours y current_balance_ves no se suelen incluir en Base/Create, se manejan por lógica de negocio



class EmployeeCreate(EmployeeBase): # Cambiado de EmpleadoCreate
    user_id: Optional[int] = Field(None, description="ID del usuario del sistema a vincular (opcional)")

class EmployeeUpdate(BaseModel): # Cambiado de EmpleadoUpdate
    first_name: Optional[str] = Field(None, min_length=1, max_length=150)
    last_name: Optional[str] = Field(None, min_length=1, max_length=150)
    identity_document: Optional[str] = Field(None, min_length=5, max_length=50)
    birth_date: Optional[date] = None
    gender: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=1000)
    primary_phone: Optional[str] = Field(None, min_length=7, max_length=30)
    secondary_phone: Optional[str] = Field(None, max_length=30)
    personal_email: Optional[EmailStr] = None

    emergency_contact_name: Optional[str] = Field(None, max_length=150)
    emergency_contact_phone: Optional[str] = Field(None, max_length=30)
    emergency_contact_relationship: Optional[str] = Field(None, max_length=50)

    employee_code: Optional[str] = Field(None, max_length=50)
    position_id: Optional[int] = None # Cambiado de cargo_id
    hire_date: Optional[date] = None
    termination_date: Optional[date] = None
    contract_type: Optional[models.EmployeeContractType] = None # Usa el enum en inglés
    
    photo_url: Optional[str] = Field(None, max_length=500)
    additional_notes: Optional[str] = None
    is_active: Optional[bool] = None
    user_id: Optional[int] = Field(None, description="ID del usuario del sistema a vincular (usar con precaución en updates)")


class EmployeeResponse(EmployeeBase): # Cambiado de EmpleadoResponse
    id: int
    
    @computed_field 
    @property
    def full_name(self) -> str: # Cambiado de nombre_completo
        return f"{self.first_name} {self.last_name}"

    position: Optional[PositionResponse] = None # Cambiado de cargo, usa PositionResponse
    system_user: Optional[UserSimpleResponse] = None # Cambiado de usuario_sistema (UserSimpleResponse ya está en inglés)

    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        use_enum_values = True # Para que EmployeeContractType se muestre como string


class EmployeeCreate(EmployeeBase): # Actualiza tu EmployeeCreate existente
    user_id: Optional[int] = Field(None, description="ID del usuario del sistema a vincular (opcional)")
    # Los campos de nómina de EmployeeBase son opcionales aquí, se pueden establecer al crear o después

class EmployeeUpdate(BaseModel): # Actualiza tu EmployeeUpdate existente
    first_name: Optional[str] = Field(None, min_length=1, max_length=150)
    last_name: Optional[str] = Field(None, min_length=1, max_length=150)
    identity_document: Optional[str] = Field(None, min_length=5, max_length=50)
    birth_date: Optional[date] = None
    gender: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=1000)
    primary_phone: Optional[str] = Field(None, min_length=7, max_length=30)
    secondary_phone: Optional[str] = Field(None, max_length=30)
    personal_email: Optional[EmailStr] = None
    emergency_contact_name: Optional[str] = Field(None, max_length=150)
    emergency_contact_phone: Optional[str] = Field(None, max_length=30)
    emergency_contact_relationship: Optional[str] = Field(None, max_length=50)
    employee_code: Optional[str] = Field(None, max_length=50)
    position_id: Optional[int] = None
    hire_date: Optional[date] = None
    termination_date: Optional[date] = None
    contract_type: Optional[models.EmployeeContractType] = None
    photo_url: Optional[str] = Field(None, max_length=500)
    additional_notes: Optional[str] = None
    is_active: Optional[bool] = None
    user_id: Optional[int] = Field(None, description="ID del usuario del sistema a vincular (usar con precaución)")

    # Nuevos campos de nómina (opcionales para actualizar)
    base_salary_amount: Optional[float] = Field(None, ge=0)
    base_salary_currency: Optional[models.Currency] = None
    pay_frequency: Optional[models.EmployeePayFrequency] = None
    hourly_rate: Optional[float] = Field(None, ge=0)
    # accumulated_hours y current_balance_ves no se actualizan directamente aquí

# Schema básico para Empleado, útil para anidaciones ligeras
class EmployeeBasicResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    identity_document: Optional[str] = None
    
    @computed_field 
    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    class Config:
        from_attributes = True


class EmployeeResponse(EmployeeBase): # Actualiza tu EmployeeResponse existente
    id: int
    
    @computed_field 
    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    position: Optional[PositionResponse] = None 
    system_user: Optional[UserSimpleResponse] = None 

    # Nuevos campos de nómina para mostrar
    accumulated_hours: Optional[float] = Field(default=0.0)
    current_balance_ves: float = Field(default=0.0)

    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        use_enum_values = True


# --- Schemas for SalaryComponentDefinition (Definición de Conceptos de Nómina/Componentes Salariales) ---

class SalaryComponentDefinitionBase(BaseModel):
    name: str = Field(..., max_length=200, description="Nombre del componente salarial (Ej: Bono de Alimentación)")
    description: Optional[str] = Field(None, max_length=1000)
    component_type: models.SalaryComponentType = Field(..., description="Tipo: Asignación (earning) o Deducción (deduction)")
    calculation_type: models.SalaryComponentCalculationType = Field(..., description="Forma de cálculo: Monto Fijo o Porcentaje")
    default_value: Optional[float] = Field(None, description="Valor por defecto (monto o porcentaje 0.0-1.0)")
    default_currency: Optional[models.Currency] = Field(None, description="Moneda del valor por defecto si es monto fijo")
    is_taxable: bool = False
    is_active: bool = True

class SalaryComponentDefinitionCreate(SalaryComponentDefinitionBase):
    pass

class SalaryComponentDefinitionUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    component_type: Optional[models.SalaryComponentType] = None
    calculation_type: Optional[models.SalaryComponentCalculationType] = None
    default_value: Optional[float] = None
    default_currency: Optional[models.Currency] = None
    is_taxable: Optional[bool] = None
    is_active: Optional[bool] = None

class SalaryComponentDefinitionResponse(SalaryComponentDefinitionBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        use_enum_values = True


# --- Schemas for EmployeeSalaryComponent (Asignación de Componentes a Empleados) ---

class EmployeeSalaryComponentBase(BaseModel):
    employee_id: int
    component_definition_id: int
    override_value: Optional[float] = Field(None, description="Valor específico para este empleado (monto o %)")
    override_currency: Optional[models.Currency] = Field(None, description="Moneda del override_value si es monto y diferente al default")
    is_active: bool = True

class EmployeeSalaryComponentCreate(EmployeeSalaryComponentBase):
    pass

class EmployeeSalaryComponentUpdate(BaseModel):
    override_value: Optional[float] = None
    override_currency: Optional[models.Currency] = None
    is_active: Optional[bool] = None

class EmployeeSalaryComponentResponse(EmployeeSalaryComponentBase):
    id: int
    component_definition: SalaryComponentDefinitionResponse # Anidar la definición del componente
    # employee: EmployeeBasicResponse # Evitar anidar empleado aquí para prevenir posible info excesiva o circularidad

    class Config:
        from_attributes = True
        use_enum_values = True
        
        
class SalaryHistoryBase(BaseModel):
    effective_date: date
    base_salary_amount: Optional[float] = None
    base_salary_currency: Optional[models.Currency] = None
    pay_frequency: Optional[models.EmployeePayFrequency] = None
    hourly_rate: Optional[float] = None
    change_reason: Optional[str] = None

class SalaryHistoryResponse(SalaryHistoryBase):
    id: int
    employee_id: int
    created_by_user: UserSimpleResponse
    created_at: datetime

    class Config:
        from_attributes = True
        use_enum_values = True
        

# --- Schemas for PayrollRun (Proceso/Corrida de Nómina) --- 

class PayrollRunBase(BaseModel):
    name: str = Field(..., max_length=255, description="Nombre descriptivo de la corrida (Ej: 1ra Quincena Junio 2025)")
    period_start_date: date
    period_end_date: date
    pay_frequency_covered: models.EmployeePayFrequency
    exchange_rate_usd_ves: Optional[float] = Field(None, gt=0, description="Tasa USD-VES usada para esta corrida")
    status: models.PayrollRunStatus = models.PayrollRunStatus.DRAFT
    processing_notes: Optional[str] = None
    

class PayrollRunCreate(BaseModel): # Campos mínimos para iniciar una corrida
    name: str = Field(..., max_length=255)
    period_start_date: date
    period_end_date: date
    pay_frequency_covered: models.EmployeePayFrequency
    exchange_rate_usd_ves: Optional[float] = Field(None, gt=0, description="Tasa de cambio para esta corrida (si hay componentes USD)")
    # target_employee_ids: Optional[List[int]] = None # Para aplicar a empleados específicos

class PayrollRunUpdate(BaseModel): # Para confirmar, pagar o cancelar
    status: Optional[models.PayrollRunStatus] = None
    processing_notes: Optional[str] = None
    # Podría incluir la lista de horas para empleados por hora si se confirman en un paso separado
    # employee_hours_input: Optional[List[Dict[str, Any]]] = None # ej: [{"employee_id": 1, "hours": 80}]

class PayrollRunEmployeeDetailResponse(BaseModel): # Movido aquí para que PayrollRunResponse lo use
    id: int
    # payroll_run_id: int # Se infiere del contexto
    employee: EmployeeBasicResponse # Usar el schema básico del empleado
    base_salary_amount_period_ves: float
    total_earnings_ves: float
    total_deductions_ves: float
    net_amount_to_pay_ves: float
    applied_components_details_json: Optional[str] = None # Frontend parseará este JSON
    accumulated_hours_processed: Optional[float] = None

    class Config:
        from_attributes = True

class PayrollRunResponse(PayrollRunBase):
    id: int
    processed_by_user: Optional[UserSimpleResponse] = None
    processed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    employee_details: List[PayrollRunEmployeeDetailResponse] = [] # Lista de detalles por empleado

    class Config:
        from_attributes = True
        use_enum_values = True


# --- Schemas for EmployeeBalanceAdjustment (Ajustes Manuales al Saldo) ---

class EmployeeBalanceAdjustmentBase(BaseModel):
    employee_id: int
    adjustment_date: date
    description: str = Field(..., max_length=500)
    adjustment_type: models.EmployeeBalanceAdjustmentType
    amount: float = Field(..., gt=0, description="Monto del ajuste en su moneda original")
    currency: models.Currency

class EmployeeBalanceAdjustmentCreate(EmployeeBalanceAdjustmentBase):
    target_payable_item_id: Optional[int] = Field(None, description="ID del 'EmployeePayableItem' al que se aplicará la deducción. Requerido si adjustment_type es 'deduction'.")

    @model_validator(mode='after')
    def check_deduction_requires_target(self):
        if self.adjustment_type == models.EmployeeBalanceAdjustmentType.DEDUCTION and self.target_payable_item_id is None:
            raise ValueError("Para una deducción, se debe proporcionar el 'target_payable_item_id' del concepto a afectar.")
        return self

class EmployeeBalanceAdjustmentUpdate(BaseModel): # Pocos campos actualizables
    adjustment_date: Optional[date] = None
    description: Optional[str] = Field(None, max_length=500)
    # No se debería permitir cambiar monto/tipo/moneda de un ajuste ya hecho, sino anular y crear nuevo

class EmployeeBalanceAdjustmentResponse(EmployeeBalanceAdjustmentBase):
    id: int
    exchange_rate_usd_ves: Optional[float] = None
    amount_ves: float # Monto del ajuste en VES (el que afectó el saldo)
    created_by_user: UserSimpleResponse
    created_at: datetime

    class Config:
        from_attributes = True
        use_enum_values = True

# --- Schemas for EmployeePayment (Pagos Realizados al Empleado por la Escuela) ---

class EmployeePaymentBase(BaseModel):
    employee_id: int
    payment_date: date
    amount_paid: float = Field(..., gt=0, description="Monto pagado en su moneda original")
    currency_paid: models.Currency
    payment_method: Optional[str] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    
class EmployeePaymentAllocationDetailCreate(BaseModel):
    payable_item_id: int
    amount_to_allocate_ves: float = Field(..., gt=0)


class EmployeePaymentCreate(EmployeePaymentBase):
        allocations_details: List[EmployeePaymentAllocationDetailCreate] = Field(
        default_factory=list,
        description="Lista detallada de cómo se asigna este pago a los ítems pendientes."
    )

class EmployeePaymentUpdate(BaseModel): # Similar a ajustes, pocos campos actualizables
    payment_date: Optional[date] = None
    payment_method: Optional[str] = Field(None, max_length=100)
    reference_number: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = None


class EmployeePaymentAllocationResponse(BaseModel):
    id: int
    employee_payable_item_id: int
    amount_allocated_ves: float
    
    class Config:
        from_attributes = True


class EmployeePaymentResponse(BaseModel):
    id: int
    employee_id: int
    payment_date: date
    
    amount_paid_original: float
    currency_paid_original: models.Currency
    amount_paid_ves_equivalent: float
    exchange_rate_applied: Optional[float] = None
    
    payment_method: Optional[str] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None

    created_by_user: UserSimpleResponse
    created_at: datetime
    allocations: List['EmployeePaymentAllocationResponse'] = []

    class Config:
        from_attributes = True
        use_enum_values = True

# --- NUEVOS SCHEMAS PARA PRÉSTAMOS Y ADELANTOS DE EMPLEADOS ---

class EmployeeLoanBase(BaseModel):
    loan_type: models.LoanType = Field(..., description="Tipo: Préstamo (loan) o Adelanto (advance)")
    request_date: date = Field(..., description="Fecha de solicitud/otorgamiento del préstamo/adelanto")
    description: str = Field(..., max_length=500, description="Motivo o descripción del préstamo/adelanto")
    total_amount_ves: float = Field(..., gt=0, description="Monto total en VES")
    number_of_installments: Optional[int] = Field(1, gt=0, description="Número de cuotas para pagar. Para adelantos, es siempre 1.")

class EmployeeLoanCreate(EmployeeLoanBase):
    employee_id: int

class EmployeeLoanUpdate(BaseModel):
    description: Optional[str] = Field(None, max_length=500)
    status: Optional[models.LoanStatus] = Field(None, description="Solo para cambios manuales como 'cancelled'")

class EmployeeLoanResponse(EmployeeLoanBase):
    id: int
    employee_id: int
    amount_paid_ves: float
    installment_amount_ves: float
    status: models.LoanStatus
    created_by_user: UserSimpleResponse # Asumiendo que UserSimpleResponse ya existe
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        use_enum_values = True
        
        
class EmployeePayableItemResponse(BaseModel):
    id: int
    source_type: models.PayableItemSourceType
    source_id: int
    description: str
    issue_date: date
    due_date: date
    amount_original: float
    currency_original: models.Currency
    amount_ves_at_creation: float
    amount_paid_ves: float
    status: models.PayableItemStatus

    class Config:
        from_attributes = True
        use_enum_values = True


class PayslipDetailItem(BaseModel):
    name: str
    type: Literal["earning", "deduction"]
    amount_ves: float

class PayslipResponse(BaseModel):
    id: int
    employee_payment_id: int
    employee_full_name_snapshot: str
    employee_identity_document_snapshot: str
    employee_position_snapshot: Optional[str]
    employee_department_snapshot: Optional[str]
    school_name_snapshot: str
    school_rif_snapshot: str
    payment_date_snapshot: date
    period_start_date: Optional[date]
    period_end_date: Optional[date]
    total_earnings_ves: float
    total_deductions_ves: float
    net_pay_ves: float
    payment_breakdown_json: Optional[List[PayslipDetailItem]]
    created_at: datetime

    class Config:
        from_attributes = True

class PaginatedPayslipResponse(PaginatedResponse[PayslipResponse]):
    pass
        
        
class DashboardCard(BaseModel):
    title: str
    value: float
    change_percentage: Optional[float] = None
    change_description: Optional[str] = None

class ChartDataItem(BaseModel):
    name: str  # Ej: "Ene", "Feb", "Mar"
    Ingresos: float
    Gastos: float

class DashboardData(BaseModel):
    cards: List[DashboardCard]
    chart_data: List[ChartDataItem]
    recent_payments: List[Any] # Usamos Any para flexibilidad, se poblará con PaymentResponse
    recent_invoices: List[Any] # Se poblará con InvoiceResponse
    
    
# --- SCHEMAS PARA REGISTRO DE ASISTENCIA ---


class AttendanceRecordBase(BaseModel):
    work_date: date
    hours_worked: float = Field(..., gt=0, description="Las horas trabajadas deben ser un número positivo.")
    notes: Optional[str] = None

class AttendanceRecordCreate(AttendanceRecordBase):
    employee_id: int

class AttendanceRecordUpdate(AttendanceRecordBase):
    pass

class AttendanceRecordResponse(AttendanceRecordBase):
    id: int
    employee: EmployeeBasicResponse
    created_by_user: UserSimpleResponse
    created_at: datetime
    payroll_run_id: Optional[int] = None # Para saber si ya fue procesado

    class Config:
        from_attributes = True
        
        
# --- AUSENCIAS Y VACACIONES ---


class LeaveTypeBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    is_paid: bool = True

class LeaveTypeCreate(LeaveTypeBase):
    pass

class LeaveTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    is_paid: Optional[bool] = None

class LeaveTypeResponse(LeaveTypeBase):
    id: int
    class Config: from_attributes = True

class LeaveRequestBase(BaseModel):
    start_date: date
    end_date: date
    reason: Optional[str] = None

class LeaveRequestCreate(LeaveRequestBase):
    employee_id: int
    leave_type_id: int
    
class LeaveRequestUpdate(BaseModel):
    leave_type_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    reason: Optional[str] = None

class LeaveRequestStatusUpdate(BaseModel):
    status: models.LeaveRequestStatus
    
class LeaveRequestResponse(LeaveRequestBase):
    id: int
    employee: EmployeeBasicResponse
    leave_type: LeaveTypeResponse
    status: models.LeaveRequestStatus
    created_at: datetime
    class Config: from_attributes = True
    
    
# --- SCHEMAS PARA REPORTES DE COSTO DE NÓMINAS ---


class PayrollCostReportDetailSchema(BaseModel):
    """Representa el desglose de costos para un solo empleado en el reporte."""
    employee_id: int
    employee_full_name: str
    base_salary_ves: float
    total_earnings_ves: float # Asignaciones
    total_deductions_ves: float
    net_pay_ves: float

    class Config:
        from_attributes = True

class PayrollCostReportResponse(BaseModel):
    """Define la estructura completa de la respuesta para el reporte de costo de nómina."""
    payroll_run_id: int
    payroll_run_name: str
    period_start_date: date
    period_end_date: date
    
    # Totales generales para la contabilidad
    total_base_salary_ves: float
    total_earnings_ves: float
    total_deductions_ves: float
    total_net_pay_ves: float
    
    employee_count: int
    
    # Detalle por empleado
    details: List[PayrollCostReportDetailSchema]

    class Config:
        from_attributes = True