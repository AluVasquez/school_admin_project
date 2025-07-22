# backend/models.py

from sqlalchemy import (
    Boolean, Column, ForeignKey, Integer, String, Date, Float,
    DateTime, Text, UniqueConstraint, Enum as SQLAlchemyEnum
)
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
import enum

from backend.database import Base


class ChargeFrequency(str, enum.Enum): 
    MENSUAL = "mensual"
    QUINCENAL = "quincenal"
    ANUAL = "anual"
    UNICO = "unico" 
    OTRO = "otro"

class ChargeCategory(str, enum.Enum):
    MENSUALIDAD = "mensualidad"
    INSCRIPCION = "inscripcion"
    SERVICIO_RECURRENTE = "servicio_recurrente" 
    CARGO_UNICO = "cargo_unico"
    PRODUCTO = "producto"
    OTRO = "otro"

class Currency(str, enum.Enum):
    VES = "VES"
    USD = "USD"
    EUR = "EUR"

class AppliedChargeStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"

# --- NUEVOS ENUMS PARA FACTURACIÓN ---
class InvoiceStatus(str, enum.Enum): 
    PENDING_EMISSION = "pending_emission" # Estado inicial antes de la emisión fiscal
    EMITTED = "emitted"                   # Emitida y fiscalizada correctamente
    ANNULLED = "annulled"                 # Anulada
    ERROR = "error"                       # Error durante la emisión

class EmissionType(str, enum.Enum):
    FISCAL_PRINTER = "FISCAL_PRINTER"
    DIGITAL = "DIGITAL"
    FORMA_LIBRE = "FORMA_LIBRE"

class FiscalPrinterBrand(str, enum.Enum):
    EPSON = "EPSON"
    BIXOLON = "BIXOLON"
    OTHER = "OTHER"
    
# --- NUEVOS ENUMS PARA PRÉSTAMOS ---

class LoanStatus(str, enum.Enum):
    PENDING = "pending"   # Para adelantos que aún no se han deducido
    ACTIVE = "active"     # Para préstamos que se están pagando
    PAID = "paid"         # Completamente pagado
    CANCELLED = "cancelled" # Anulado por un administrador

class LoanType(str, enum.Enum):
    LOAN = "loan"         # Préstamo en cuotas
    ADVANCE = "advance"   # Adelanto de salario (una sola cuota)
    
    
class LeaveRequestStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    CANCELLED = "cancelled"
    
# --- ENUMS PARA AJUSTES EN LAS CONVERSIONES DE MONEDA DE LOS PAGOS A EMPLEADOS AND STUFF ---

class PayableItemStatus(str, enum.Enum):
    PENDING = "pending"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"

class PayableItemSourceType(str, enum.Enum):
    PAYROLL_RUN = "payroll_run"
    ADJUSTMENT = "adjustment"
    OTHER = "other"
    

# --- MODELOS EXISTENTES (CON MODIFICACIONES) ---

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False, nullable=False)


class Representative(Base):
    __tablename__= "representatives"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, index=True, nullable=False)
    last_name = Column(String, index=True, nullable=False)
    cedula = Column(String, unique=True, index=True, nullable=False)
    
    rif = Column(String(20), unique=True, index=True, nullable=True, comment="RIF del representante para facturación")
    available_credit_ves = Column(Float, nullable=False, default=0.0, comment="Saldo a favor explícito del representante en VES")
    
    phone_main = Column(String, nullable=False)
    phone_secondary = Column(String, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    address = Column(String, nullable=True)
    sex = Column(String, nullable=True)
    profession = Column(String, nullable=True)
    workplace = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    students = relationship("Student", back_populates="representative")
    invoices = relationship("Invoice", back_populates="representative") # Relación inversa a Invoice


class GradeLevel(Base):
    __tablename__ = "grade_levels"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True, comment="Ej: Maternal, 1er Grado")
    description = Column(Text, nullable=True)
    order_index = Column(Integer, nullable=True, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    charge_concepts = relationship("ChargeConcept", back_populates="grade_level")
    students = relationship("Student", back_populates="grade_level_assigned")


class Student(Base):
    __tablename__= "students"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, index=True, nullable=False)
    last_name = Column(String, index=True, nullable=False)
    cedula = Column(String, unique=True, index=True, nullable=True)
    birth_date = Column(Date, nullable=True)
    sex = Column(String, nullable=True)
    grade_level_id = Column(Integer, ForeignKey("grade_levels.id"), nullable=False)
    grade_level_assigned = relationship("GradeLevel", back_populates="students")
    blood_type = Column(String, nullable=True)
    allergies = Column(String, nullable=True)
    emergency_contact_name = Column(String, nullable=True)
    emergency_contact_phone = Column(String, nullable=True)
    is_special_case = Column(Boolean, default=False)
    special_case_description = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    representative_id = Column(Integer, ForeignKey("representatives.id"), nullable=False)
    representative = relationship("Representative", back_populates="students")
    has_scholarship = Column(Boolean, default=False)
    scholarship_percentage = Column(Float, nullable=True)
    scholarship_fixed_amount = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True)
    applied_charges = relationship("AppliedCharge", back_populates="student", cascade="all, delete-orphan")


class SchoolConfiguration(Base):
    __tablename__ = "school_configurations"
    id = Column(Integer, primary_key=True, default=1)
    school_name = Column(String(255), nullable=False)
    
    # --- CAMPO RIF MOVIDO Y OTROS NUEVOS ---
    school_rif = Column(String(20), nullable=False, unique=True)
    school_address = Column(Text, nullable=True)
    school_phone = Column(String(50), nullable=True)
    billing_email = Column(String(255), nullable=True)

    current_period_name = Column(String(100), nullable=True, comment="Ej: Año Escolar 2024-2025")
    current_period_start_date = Column(Date, nullable=True)
    current_period_end_date = Column(Date, nullable=True)
    payment_due_day = Column(Integer, nullable=True, comment="Día del mes para vencimiento (1-28)")

    # --- CAMPOS DE FACTURACIÓN ACTUALIZADOS/AÑADIDOS ---
    internal_invoice_reference_prefix = Column(String(20), nullable=True, comment="Prefijo para el número de factura (ej: 'FAC-', '00-')")
    next_internal_invoice_reference = Column(Integer, nullable=False, default=1, comment="Siguiente número de factura a utilizar")
    default_iva_percentage = Column(Float, nullable=True, default=0.16, comment="Porcentaje de IVA por defecto (ej: 0.16 para 16%)")
    document_logo_url = Column(String(500), nullable=True, comment="URL del logo para usar en documentos generados")
    invoice_terms_and_conditions = Column(Text, nullable=True, comment="Términos y condiciones para facturas y otros documentos")
    credit_note_reference_prefix = Column(String(20), nullable=True, comment="Prefijo para Notas de Crédito (ej: 'NC-')")
    next_credit_note_reference = Column(Integer, nullable=False, default=1, comment="Siguiente número de Nota de Crédito a utilizar")
    
    # --- NUEVOS CAMPOS FISCALES ---
    imprenta_digital_api_key = Column(String(255), nullable=True)
    imprenta_digital_api_token = Column(String(255), nullable=True)
    imprenta_digital_api_url = Column(String(500), nullable=True)
    fiscal_printer_port = Column(String(100), nullable=True, comment="Ej: COM1, /dev/ttyS0")
    fiscal_printer_brand = Column(SQLAlchemyEnum(FiscalPrinterBrand), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())


class ChargeConcept(Base):
    __tablename__ = "charge_concepts"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    default_amount = Column(Float, nullable=False, default=0.0)
    default_amount_currency = Column(SQLAlchemyEnum(Currency), nullable=False, default=Currency.USD)
    is_amount_fixed = Column(Boolean, default=True)
    default_frequency = Column(SQLAlchemyEnum(ChargeFrequency), nullable=False, default=ChargeFrequency.UNICO)
    category = Column(SQLAlchemyEnum(ChargeCategory), nullable = False, default=ChargeCategory.OTRO)
    iva_percentage = Column(Float, nullable=False, default=0.0, comment="Porcentaje de IVA (ej: 0.16)")
    applicable_grade_level_id = Column(Integer, ForeignKey("grade_levels.id"), nullable=True)
    grade_level = relationship("GradeLevel", back_populates="charge_concepts")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    applied_charges = relationship("AppliedCharge", back_populates="charge_concept")


class AppliedCharge(Base):
    __tablename__ = "applied_charges"
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    charge_concept_id = Column(Integer, ForeignKey("charge_concepts.id"), nullable=False, index=True)
    description = Column(String(500), nullable=True)
    original_concept_amount = Column(Float, nullable=False)
    original_concept_currency = Column(SQLAlchemyEnum(Currency), nullable=False)
    amount_due_original_currency = Column(Float, nullable=False)
    amount_paid_original_currency_equivalent = Column(Float, nullable=False, default=0.0)
    is_indexed = Column(Boolean, default=False, nullable=False)
    amount_due_ves_at_emission = Column(Float, nullable=False)
    amount_paid_ves = Column(Float, nullable=False, default=0.0)
    exchange_rate_applied_at_emission = Column(Float, nullable=True)
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    status = Column(SQLAlchemyEnum(AppliedChargeStatus), nullable=False, default=AppliedChargeStatus.PENDING, index=True)
    
    # --- NUEVO CAMPO INVOICE_ID ---
    invoice_id = Column(Integer, ForeignKey('invoices.id', ondelete='SET NULL'), nullable=True, index=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    student = relationship("Student", back_populates="applied_charges")
    charge_concept = relationship("ChargeConcept", back_populates="applied_charges")
    invoice = relationship("Invoice", back_populates="applied_charges_ref") # Relación inversa a Invoice


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    __table_args__ = (UniqueConstraint('from_currency', 'to_currency', 'rate_date', name='uq_exchange_rate_per_day'),)
    id = Column(Integer, primary_key=True, index=True)
    from_currency = Column(SQLAlchemyEnum(Currency), nullable=False)
    to_currency = Column(SQLAlchemyEnum(Currency), nullable=False, default=Currency.VES)
    rate = Column(Float, nullable=False, comment="Tasa de cambio (ej. Cuántos VES son 1 USD/EUR)")
    rate_date = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True, index=True)
    representative_id = Column(Integer, ForeignKey("representatives.id"), nullable=False, index=True)
    payment_date = Column(Date, nullable=False, index=True)
    amount_paid = Column(Float, nullable=False)
    currency_paid = Column(SQLAlchemyEnum(Currency), nullable=False)
    exchange_rate_applied = Column(Float, nullable=True)
    amount_paid_ves_equivalent = Column(Float, nullable=False)
    payment_method = Column(String(100), nullable=True)
    reference_number = Column(String(255), nullable=True)
    receipt_image_url = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    representative = relationship("Representative")
    allocations = relationship("PaymentAllocation", back_populates="payment", cascade="all, delete-orphan")


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"
    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=False)
    applied_charge_id = Column(Integer, ForeignKey("applied_charges.id"), nullable=False)
    amount_allocated_ves = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    payment = relationship("Payment", back_populates="allocations")
    applied_charge = relationship("AppliedCharge")

# --- NUEVOS MODELOS PARA FACTURACIÓN ---

class Invoice(Base):
    __tablename__ = "invoices"
    id = Column(Integer, primary_key=True, index=True)
    
    # --- Identificadores de la Factura ---
    invoice_number = Column(String(50), unique=True, index=True, nullable=False, comment="Correlativo interno del sistema (ej. FACT-0001)")
    status = Column(SQLAlchemyEnum(InvoiceStatus), nullable=False, default=InvoiceStatus.PENDING_EMISSION)
    issue_date = Column(Date, nullable=False, index=True)
    
    # --- Relaciones ---
    representative_id = Column(Integer, ForeignKey("representatives.id"), nullable=False, index=True)
    representative = relationship("Representative", back_populates="invoices")
    
    # --- Totales de la Factura ---
    subtotal_ves = Column(Float, nullable=False, default=0.0)
    total_iva_ves = Column(Float, nullable=False, default=0.0)
    total_amount_ves = Column(Float, nullable=False, default=0.0)
    
    # --- Snapshot de Datos del Emisor (Escuela) ---
    school_name_snapshot = Column(String(255), nullable=False)
    school_rif_snapshot = Column(String(20), nullable=False)
    school_address_snapshot = Column(Text, nullable=True)
    school_phone_snapshot = Column(String(50), nullable=True)

    # --- Snapshot de Datos del Receptor (Representante) ---
    representative_name_snapshot = Column(String(200), nullable=False)
    representative_rif_or_cedula_snapshot = Column(String(20), nullable=False)
    representative_address_snapshot = Column(Text, nullable=True)

    # --- Campos de Fiscalización ---
    emission_type = Column(SQLAlchemyEnum(EmissionType), nullable=True)
    fiscal_machine_serial = Column(String(100), nullable=True)
    fiscal_invoice_number = Column(String(50), unique=True, index=True, nullable=True)
    fiscal_control_number = Column(String(50), unique=True, index=True, nullable=True)
    digital_invoice_url = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)

    # --- Timestamps ---
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    # --- Relaciones Inversas ---
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    applied_charges_ref = relationship("AppliedCharge", back_populates="invoice")
    
    credit_note = relationship("CreditNote", back_populates="original_invoice", uselist=False)

class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    applied_charge_id = Column(Integer, ForeignKey("applied_charges.id"), nullable=True, comment="Vínculo al cargo original")
    
    # --- Snapshot de los datos del ítem ---
    description = Column(String(500), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    unit_price_ves = Column(Float, nullable=False)
    iva_percentage = Column(Float, nullable=False, default=0.0)
    item_subtotal_ves = Column(Float, nullable=False)
    item_iva_ves = Column(Float, nullable=False)
    item_total_ves = Column(Float, nullable=False)

    # --- Relaciones Inversas ---
    invoice = relationship("Invoice", back_populates="items")
    applied_charge = relationship("AppliedCharge") # Relación simple, no inversa
    
    
class CreditNote(Base):
    __tablename__ = "credit_notes"
    id = Column(Integer, primary_key=True, index=True)
    
    credit_note_number = Column(String(50), unique=True, index=True, nullable=False, comment="Correlativo interno de la Nota de Crédito")
    issue_date = Column(Date, nullable=False, index=True)
    reason = Column(Text, nullable=False, comment="Motivo de la emisión de la nota de crédito")
    
    # --- Relaciones ---
    representative_id = Column(Integer, ForeignKey("representatives.id"), nullable=False, index=True)
    original_invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False, unique=True)
    
    # --- Totales de la Nota de Crédito (Snapshot del total de la factura original) ---
    total_credited_ves = Column(Float, nullable=False)
    
    # --- Snapshot de Datos (para consistencia, igual que en la factura) ---
    school_rif_snapshot = Column(String(20), nullable=False)
    representative_rif_or_cedula_snapshot = Column(String(20), nullable=False)
    original_invoice_number_snapshot = Column(String(50), nullable=False)
    original_invoice_control_number_snapshot = Column(String(50), nullable=True)

    # --- Timestamps ---
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # --- Relaciones Inversas ---
    representative = relationship("Representative")
    original_invoice = relationship("Invoice", back_populates="credit_note")
    items = relationship("CreditNoteItem", back_populates="credit_note", cascade="all, delete-orphan")

class CreditNoteItem(Base):
    __tablename__ = "credit_note_items"
    id = Column(Integer, primary_key=True, index=True)
    credit_note_id = Column(Integer, ForeignKey("credit_notes.id", ondelete="CASCADE"), nullable=False)
    
    # --- Snapshot de los datos del ítem original de la factura ---
    description = Column(String(500), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price_ves = Column(Float, nullable=False)
    item_subtotal_ves = Column(Float, nullable=False)
    item_iva_ves = Column(Float, nullable=False)
    item_total_ves = Column(Float, nullable=False)

    credit_note = relationship("CreditNote", back_populates="items")


# --- MODELOS DE GASTOS Y PERSONAL (SIN CAMBIOS) ---
class ExpensePaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"
    CANCELLED = "cancelled"

class ExpenseCategory(Base):
    __tablename__ = "expense_categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    expenses = relationship("Expense", back_populates="category")

class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True, index=True)
    rif_ci = Column(String(20), nullable=True, unique=True, index=True)
    contact_person = Column(String(150), nullable=True)
    category_id = Column(Integer, ForeignKey("expense_categories.id"), nullable=False, index=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True, unique=True, index=True)
    address = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    category = relationship("ExpenseCategory")
    expenses = relationship("Expense", back_populates="supplier")

class Expense(Base):
    __tablename__ = "expenses"
    id = Column(Integer, primary_key=True, index=True)
    expense_date = Column(Date, nullable=False, index=True)
    description = Column(String(500), nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True, index=True)
    category_id = Column(Integer, ForeignKey("expense_categories.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(SQLAlchemyEnum(Currency), nullable=False)
    amount_ves_equivalent_at_creation = Column(Float, nullable=True)
    exchange_rate_at_creation = Column(Float, nullable=True)
    payment_status = Column(SQLAlchemyEnum(ExpensePaymentStatus), nullable=False, default=ExpensePaymentStatus.PENDING, index=True)
    total_amount_paid_ves = Column(Float, nullable=False, default=0.0)
    notes = Column(Text, nullable=True)
    invoice_document_url = Column(String(500), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    supplier = relationship("Supplier", back_populates="expenses")
    category = relationship("ExpenseCategory", back_populates="expenses")
    user = relationship("User")
    payments_made = relationship("ExpensePayment", back_populates="expense", cascade="all, delete-orphan")

class ExpensePayment(Base):
    __tablename__ = "expense_payments"
    id = Column(Integer, primary_key=True, index=True)
    expense_id = Column(Integer, ForeignKey("expenses.id"), nullable=False, index=True)
    payment_date = Column(Date, nullable=False, index=True)
    amount_paid = Column(Float, nullable=False)
    currency_paid = Column(SQLAlchemyEnum(Currency), nullable=False)
    amount_paid_ves_equivalent = Column(Float, nullable=False)
    exchange_rate_applied_at_payment = Column(Float, nullable=True)
    payment_method_used = Column(String(150), nullable=False)
    reference_number = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expense = relationship("Expense", back_populates="payments_made")
    user = relationship("User")

# --- Modelos de Personal ---

class EmployeeContractType(str, enum.Enum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    HOURLY = "hourly"
    INTERNSHIP = "internship"
    TEMPORARY = "temporary"
    INDEFINITE = "indefinite"
    OTHER = "other"

class Department(Base):
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    positions = relationship("Position", back_populates="department")

class Position(Base):
    __tablename__ = "positions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    department = relationship("Department", back_populates="positions")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    employees = relationship("Employee", back_populates="position")

class SalaryComponentType(str, enum.Enum):
    EARNING = "earning"
    DEDUCTION = "deduction"

class SalaryComponentCalculationType(str, enum.Enum):
    FIXED_AMOUNT = "fixed_amount"
    PERCENTAGE_OF_BASE_SALARY = "percentage_of_base_salary"

class EmployeePayFrequency(str, enum.Enum):
    MONTHLY = "monthly"
    FORTNIGHTLY = "fortnightly"
    HOURLY = "hourly"

class PayrollRunStatus(str, enum.Enum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    PAID_OUT = "paid_out"
    CANCELLED = "cancelled"

class EmployeeBalanceAdjustmentType(str, enum.Enum):
    EARNING = "earning"
    DEDUCTION = "deduction"

class SalaryComponentDefinition(Base):
    __tablename__ = "salary_component_definitions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    component_type = Column(SQLAlchemyEnum(SalaryComponentType), nullable=False)
    calculation_type = Column(SQLAlchemyEnum(SalaryComponentCalculationType), nullable=False)
    default_value = Column(Float, nullable=True)
    default_currency = Column(SQLAlchemyEnum(Currency), nullable=True)
    is_taxable = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    employee_assignments = relationship("EmployeeSalaryComponent", back_populates="component_definition")

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(150), nullable=False, index=True)
    last_name = Column(String(150), nullable=False, index=True)
    identity_document = Column(String(50), unique=True, index=True, nullable=False)
    birth_date = Column(Date, nullable=True)
    gender = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)
    primary_phone = Column(String(30), nullable=False)
    secondary_phone = Column(String(30), nullable=True)
    personal_email = Column(String(255), unique=True, index=True, nullable=True)
    emergency_contact_name = Column(String(150), nullable=True)
    emergency_contact_phone = Column(String(30), nullable=True)
    emergency_contact_relationship = Column(String(50), nullable=True)
    employee_code = Column(String(50), unique=True, index=True, nullable=True)
    position_id = Column(Integer, ForeignKey("positions.id"), nullable=False)
    position = relationship("Position", back_populates="employees")
    hire_date = Column(Date, nullable=False)
    termination_date = Column(Date, nullable=True)
    contract_type = Column(SQLAlchemyEnum(EmployeeContractType), nullable=True, default=EmployeeContractType.INDEFINITE)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, unique=True)
    system_user = relationship("User", backref=backref("employee_profile", uselist=False))
    photo_url = Column(String(500), nullable=True)
    additional_notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    base_salary_amount = Column(Float, nullable=True)
    base_salary_currency = Column(SQLAlchemyEnum(Currency), nullable=True)
    pay_frequency = Column(SQLAlchemyEnum(EmployeePayFrequency), nullable=True)
    hourly_rate = Column(Float, nullable=True)
    accumulated_hours = Column(Float, default=0.0, nullable=True)
    # current_balance_ves = Column(Float, default=0.0, nullable=False)  -- Me dio mucho conflicto con el modelo de EmployeeBalanceAdjustment
    salary_components = relationship("EmployeeSalaryComponent", back_populates="employee", cascade="all, delete-orphan")
    salary_history = relationship("SalaryHistory", back_populates="employee", cascade="all, delete-orphan", order_by="SalaryHistory.effective_date.desc()")
    payable_items = relationship("EmployeePayableItem", back_populates="employee", cascade="all, delete-orphan")
    payroll_run_details = relationship("PayrollRunEmployeeDetail", back_populates="employee")
    balance_adjustments = relationship("EmployeeBalanceAdjustment", back_populates="employee", cascade="all, delete-orphan")
    payments_made_to_employee = relationship("EmployeePayment", back_populates="employee", cascade="all, delete-orphan")
    loans = relationship("EmployeeLoan", back_populates="employee", cascade="all, delete-orphan")
    guaranteed_benefits_ves = Column(Float, nullable=False, default=0.0, comment="Total acumulado por garantía de prestaciones (abonos trimestrales + días adicionales). Art. 142.a y 142.b")
    attendance_records = relationship("AttendanceRecord", back_populates="employee", cascade="all, delete-orphan")
    leave_requests = relationship("LeaveRequest", back_populates="employee", cascade="all, delete-orphan")
    last_benefit_calculation_date = Column(Date, nullable=True, comment="Última fecha en que se corrió el cálculo trimestral de prestaciones para este empleado.")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

class EmployeeSalaryComponent(Base):
    __tablename__ = "employee_salary_components"
    __table_args__ = (UniqueConstraint('employee_id', 'component_definition_id', name='uq_employee_component'),)
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    component_definition_id = Column(Integer, ForeignKey("salary_component_definitions.id"), nullable=False)
    override_value = Column(Float, nullable=True)
    override_currency = Column(SQLAlchemyEnum(Currency), nullable=True)
    is_active = Column(Boolean, default=True)
    employee = relationship("Employee", back_populates="salary_components")
    component_definition = relationship("SalaryComponentDefinition", back_populates="employee_assignments")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    
    
class SalaryHistory(Base):
    __tablename__ = "salary_history"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    
    effective_date = Column(Date, nullable=False, comment="Fecha a partir de la cual este salario es efectivo.")
    
    base_salary_amount = Column(Float, nullable=True)
    base_salary_currency = Column(SQLAlchemyEnum(Currency), nullable=True)
    pay_frequency = Column(SQLAlchemyEnum(EmployeePayFrequency), nullable=True)
    hourly_rate = Column(Float, nullable=True)
    
    change_reason = Column(String(255), nullable=True, comment="Motivo del cambio (Ej: Aumento anual, Promoción).")
    
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", back_populates="salary_history")
    created_by_user = relationship("User")



class PayrollRun(Base):
    __tablename__ = "payroll_runs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    period_start_date = Column(Date, nullable=False)
    period_end_date = Column(Date, nullable=False)
    pay_frequency_covered = Column(SQLAlchemyEnum(EmployeePayFrequency), nullable=False)
    exchange_rate_usd_ves = Column(Float, nullable=True)
    status = Column(SQLAlchemyEnum(PayrollRunStatus), nullable=False, default=PayrollRunStatus.DRAFT)
    processing_notes = Column(Text, nullable=True)
    processed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    employee_details = relationship("PayrollRunEmployeeDetail", back_populates="payroll_run", cascade="all, delete-orphan")
    processed_by_user = relationship("User")
    processed_attendance_records = relationship("AttendanceRecord", back_populates="payroll_run")
        

class PayrollRunEmployeeDetail(Base):
    __tablename__ = "payroll_run_employee_details"
    __table_args__ = (UniqueConstraint('payroll_run_id', 'employee_id', name='uq_payroll_run_employee'),)
    id = Column(Integer, primary_key=True, index=True)
    payroll_run_id = Column(Integer, ForeignKey("payroll_runs.id"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    base_salary_amount_period_ves = Column(Float, nullable=False)
    total_earnings_ves = Column(Float, nullable=False)
    total_deductions_ves = Column(Float, nullable=False)
    net_amount_to_pay_ves = Column(Float, nullable=False)
    applied_components_details_json = Column(Text, nullable=True)
    accumulated_hours_processed = Column(Float, nullable=True)
    payroll_run = relationship("PayrollRun", back_populates="employee_details")
    employee = relationship("Employee", back_populates="payroll_run_details")

class EmployeeBalanceAdjustment(Base):
    __tablename__ = "employee_balance_adjustments"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    adjustment_date = Column(Date, nullable=False)
    description = Column(String(500), nullable=False)
    adjustment_type = Column(SQLAlchemyEnum(EmployeeBalanceAdjustmentType), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(SQLAlchemyEnum(Currency), nullable=False)
    exchange_rate_usd_ves = Column(Float, nullable=True)
    amount_ves = Column(Float, nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    target_payable_item_id = Column(Integer, ForeignKey("employee_payable_items.id"), nullable=True, index=True)
    employee = relationship("Employee", back_populates="balance_adjustments")
    created_by_user = relationship("User")

class EmployeePayment(Base):
    __tablename__ = "employee_payments"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    payment_date = Column(Date, nullable=False)
    
    amount_paid_original = Column(Float, nullable=False)
    currency_paid_original = Column(SQLAlchemyEnum(Currency), nullable=False)
    exchange_rate_applied = Column(Float, nullable=True)
    amount_paid_ves_equivalent = Column(Float, nullable=False)

    payment_method = Column(String(100), nullable=True)
    reference_number = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    employee = relationship("Employee", back_populates="payments_made_to_employee")
    created_by_user = relationship("User")
    payslip = relationship("Payslip", back_populates="employee_payment", uselist=False, cascade="all, delete-orphan")
    allocations = relationship("EmployeePaymentAllocation", back_populates="payment", cascade="all, delete-orphan")

class EmployeeLoan(Base):
    __tablename__ = "employee_loans"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    loan_type = Column(SQLAlchemyEnum(LoanType), nullable=False, default=LoanType.LOAN)
    
    request_date = Column(Date, nullable=False)
    description = Column(String(500), nullable=False)
    
    total_amount_ves = Column(Float, nullable=False, comment="Monto total del préstamo/adelanto en VES.")
    amount_paid_ves = Column(Float, nullable=False, default=0.0, comment="Monto total pagado hasta la fecha.")
    
    number_of_installments = Column(Integer, nullable=False, default=1, comment="Número de cuotas para pagar.")
    installment_amount_ves = Column(Float, nullable=False, comment="Monto de cada cuota a deducir en la nómina.")
    
    status = Column(SQLAlchemyEnum(LoanStatus), nullable=False, default=LoanStatus.ACTIVE, index=True)
    
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    employee = relationship("Employee", back_populates="loans")
    created_by_user = relationship("User")
    
    
class EmployeePayableItem(Base):
    """
    Representa un ítem individual que la escuela debe pagar a un empleado.
    Es el equivalente de 'AppliedCharge' para los empleados.
    """
    __tablename__ = "employee_payable_items"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    
    source_type = Column(SQLAlchemyEnum(PayableItemSourceType), nullable=False, index=True)
    source_id = Column(Integer, nullable=False, comment="ID del PayrollRun, Ajuste, etc., que originó este pago.")
    
    description = Column(String(255), nullable=False)
    issue_date = Column(Date, nullable=False, index=True)
    due_date = Column(Date, nullable=False, index=True)

    amount_original = Column(Float, nullable=False)
    currency_original = Column(SQLAlchemyEnum(Currency), nullable=False)
    amount_ves_at_creation = Column(Float, nullable=False)
    amount_paid_ves = Column(Float, nullable=False, default=0.0)
    
    status = Column(SQLAlchemyEnum(PayableItemStatus), nullable=False, default=PayableItemStatus.PENDING, index=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    employee = relationship("Employee", back_populates="payable_items")
    allocations = relationship("EmployeePaymentAllocation", back_populates="payable_item", cascade="all, delete-orphan")


class EmployeePaymentAllocation(Base):
    """
    Tabla de enlace que registra qué porción de un EmployeePayment
    se asignó a un EmployeePayableItem específico.
    """
    __tablename__ = "employee_payment_allocations"
    id = Column(Integer, primary_key=True, index=True)
    employee_payment_id = Column(Integer, ForeignKey("employee_payments.id", ondelete="CASCADE"), nullable=False)
    employee_payable_item_id = Column(Integer, ForeignKey("employee_payable_items.id", ondelete="CASCADE"), nullable=False)
    
    amount_allocated_ves = Column(Float, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    payment = relationship("EmployeePayment", back_populates="allocations")
    payable_item = relationship("EmployeePayableItem", back_populates="allocations")
    
    
# --- Recibos de pago a empleados ---


class Payslip(Base):
    __tablename__ = "payslips"
    id = Column(Integer, primary_key=True, index=True)
    
    # --- Vinculación con el Pago ---
    employee_payment_id = Column(Integer, ForeignKey("employee_payments.id"), nullable=False, unique=True)
    employee_payment = relationship("EmployeePayment", back_populates="payslip")

    # --- Datos del Empleado (Snapshot) ---
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    employee_full_name_snapshot = Column(String, nullable=False)
    employee_identity_document_snapshot = Column(String, nullable=False)
    employee_position_snapshot = Column(String, nullable=True) # Cargo
    employee_department_snapshot = Column(String, nullable=True) # Departamento

    # --- Datos de la Escuela (Snapshot) ---
    school_name_snapshot = Column(String, nullable=False)
    school_rif_snapshot = Column(String, nullable=False)

    # --- Detalles del Pago (Snapshot) ---
    payment_date_snapshot = Column(Date, nullable=False)
    period_start_date = Column(Date, nullable=True) # Para qué período es el pago
    period_end_date = Column(Date, nullable=True)
    total_earnings_ves = Column(Float, nullable=False) # Total Asignaciones
    total_deductions_ves = Column(Float, nullable=False) # Total Deducciones
    net_pay_ves = Column(Float, nullable=False) # Monto Neto Pagado
    
    payment_breakdown_json = Column(Text, nullable=True)

    # --- Metadatos ---
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    

# --- MODELO PARA REGISTRO DE ASISTENCIA Y HORAS ---

    
class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    work_date = Column(Date, nullable=False, index=True)
    hours_worked = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)
    
    # Este campo es clave: vincula el registro a una corrida de nómina una vez procesado
    payroll_run_id = Column(Integer, ForeignKey("payroll_runs.id"), nullable=True, index=True)
    
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    employee = relationship("Employee", back_populates="attendance_records")
    payroll_run = relationship("PayrollRun", back_populates="processed_attendance_records")
    created_by_user = relationship("User")
    
    
    # --- AUSENCIAS Y VACACIONES ---
    
class LeaveType(Base):
    __tablename__ = "leave_types"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    is_paid = Column(Boolean, nullable=False, default=True, comment="Indica si la ausencia es remunerada.")
    
    leave_requests = relationship("LeaveRequest", back_populates="leave_type")

class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type_id = Column(Integer, ForeignKey("leave_types.id"), nullable=False, index=True)
    
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=True)
    
    status = Column(SQLAlchemyEnum(LeaveRequestStatus), nullable=False, default=LeaveRequestStatus.PENDING)
    
    # Para auditoría
    requested_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    processed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # Quien aprueba/rechaza
    
    # Para integración con nómina
    payroll_run_id = Column(Integer, ForeignKey("payroll_runs.id"), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    employee = relationship("Employee", back_populates="leave_requests")
    leave_type = relationship("LeaveType", back_populates="leave_requests")
    payroll_run = relationship("PayrollRun") # Relación simple
    requested_by_user = relationship("User", foreign_keys=[requested_by_user_id])
    processed_by_user = relationship("User", foreign_keys=[processed_by_user_id])
