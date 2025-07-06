import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getExpenseById, updateExpense, createExpensePayment, cancelExpense } from '../services/apiExpenses';
import { getExpenseCategories } from '../services/apiExpenseCategories';
import { getSuppliers } from '../services/apiSuppliers';
import { toast } from 'react-toastify';

// --- Headless UI y Heroicons ---
import { Dialog, Listbox, Transition } from '@headlessui/react';
import { 
    ArrowLeftIcon, BanknotesIcon, CalendarDaysIcon, CheckIcon, ChevronUpDownIcon, ClockIcon, 
    DocumentTextIcon, ExclamationTriangleIcon, LockClosedIcon, NoSymbolIcon, PencilSquareIcon, 
    PlusIcon, TagIcon, UserCircleIcon, XMarkIcon 
} from '@heroicons/react/24/solid';

// --- Constantes y Helpers (Reutilizados y Mejorados) ---
const CURRENCIES = [{ value: "USD", label: "USD ($)" }, { value: "VES", label: "VES (Bs.)" }, { value: "EUR", label: "EUR (€)" }];
const PAYMENT_METHODS = ["Transferencia", "Pago Móvil", "Efectivo", "Zelle", "Binance", "Otro"];

const formatCurrency = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// --- Componentes de UI Personalizados ---
const FormInput = ({ label, id, locked, lockedTitle, ...props }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium leading-6 text-slate-700 flex items-center">
            {label}
            {locked && <LockClosedIcon className="w-3 h-3 ml-1.5 text-slate-400" title={lockedTitle} />}
        </label>
        <div className="mt-1">
            <input id={id} {...props} disabled={locked} title={locked ? lockedTitle : props.title} className="block w-full rounded-md border-0 px-3 py-2 bg-white text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6 disabled:bg-slate-50 disabled:cursor-not-allowed" />
        </div>
    </div>
);
const CustomListbox = ({ options, value, onChange, placeholder, disabled, name, locked, lockedTitle }) => (
    <Listbox value={value} onChange={(val) => onChange({ target: { name, value: val } })} disabled={disabled || locked} name={name}>
        {({ open }) => (
        <div>
            <Listbox.Label className="block text-sm font-medium leading-6 text-slate-700 flex items-center">
                {placeholder}
                {locked && <LockClosedIcon className="w-3 h-3 ml-1.5 text-slate-400" title={lockedTitle} />}
            </Listbox.Label>
            <div className="relative mt-1">
                <Listbox.Button className="relative w-full cursor-default rounded-md bg-white py-2 pl-3 pr-10 text-left shadow-sm ring-1 ring-inset ring-slate-300 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm disabled:bg-slate-50 disabled:cursor-not-allowed">
                    <span className="block truncate">{options.find(opt => opt.value === value)?.label || <span className="text-slate-400">{placeholder}</span>}</span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2"><ChevronUpDownIcon className="h-5 w-5 text-slate-400" aria-hidden="true" /></span>
                </Listbox.Button>
                <Transition show={open} as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm">
                        {options.map((opt) => (
                            <Listbox.Option key={opt.value} className={({ active }) => `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-indigo-100' : ''}`} value={opt.value}>
                                {({ selected }) => (<> <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>{opt.label}</span> {selected && <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-600"><CheckIcon className="h-5 w-5" aria-hidden="true" /></span>} </>)}
                            </Listbox.Option>
                        ))}
                    </Listbox.Options>
                </Transition>
            </div>
        </div>
        )}
    </Listbox>
);
const StatusBadge = ({ status }) => {
    const statusMap = {
        paid: { label: 'Pagado', classes: 'bg-green-100 text-green-800 ring-green-600/20' },
        pending: { label: 'Pendiente', classes: 'bg-yellow-100 text-yellow-800 ring-yellow-600/20' },
        partially_paid: { label: 'Parcialmente Pagado', classes: 'bg-blue-100 text-blue-800 ring-blue-600/20' },
        cancelled: { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700 ring-slate-600/20' },
    };
    const currentStatus = statusMap[status] || { label: status, classes: 'bg-slate-100 text-slate-800 ring-slate-600/20' };
    return <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${currentStatus.classes}`}>{currentStatus.label}</span>;
};
const InfoItem = ({ icon, label, children }) => (
    <div className="flex items-start justify-between py-2">
        <div className="flex items-center text-sm text-slate-500">
            {React.cloneElement(icon, { className: "w-4 h-4 mr-2 text-slate-400" })}
            <span>{label}</span>
        </div>
        <div className="text-sm font-medium text-slate-800 text-right">{children}</div>
    </div>
);
const LoadingSkeleton = () => (
    <div className="p-4 md:p-8 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/3 mb-8"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-slate-200 rounded-xl h-96"></div>
            <div className="space-y-8">
                <div className="bg-slate-200 rounded-xl h-48"></div>
                <div className="bg-slate-200 rounded-xl h-48"></div>
            </div>
        </div>
        <div className="mt-8 bg-slate-200 rounded-xl h-64"></div>
    </div>
);


function EditExpensePage() {
    const { expenseId } = useParams();
    const { token } = useAuth();
    const navigate = useNavigate();

    // --- Estados (sin cambios en su mayoría) ---
    const [expenseDetails, setExpenseDetails] = useState(null);
    const [formData, setFormData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
    const [error, setError] = useState(null);

    const [expenseCategoriesList, setExpenseCategoriesList] = useState([]);
    const [suppliersList, setSuppliersList] = useState([]);
    const [isLoadingDropdowns, setIsLoadingDropdowns] = useState(true);
    
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentFormData, setPaymentFormData] = useState({});
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
    const [formPaymentError, setFormPaymentError] = useState(null);

    // --- Carga de Datos ---
    const loadExpenseData = useCallback(async () => {
        if (!token || !expenseId) return;
        try {
            const data = await getExpenseById(token, expenseId);
            setExpenseDetails(data);
            setFormData({
                expense_date: data.expense_date ? data.expense_date.split('T')[0] : '',
                description: data.description || '',
                category_id: data.category?.id || '',
                supplier_id: data.supplier?.id || '',
                amount: data.amount?.toString() || '',
                currency: data.currency || 'USD',
                notes: data.notes || '',
            });
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar el gasto: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, expenseId]);

    const loadDropdownData = useCallback(async () => {
        if (!token) { setIsLoadingDropdowns(false); return; }
        try {
            const [categoriesData, suppliersData] = await Promise.all([
                getExpenseCategories(token, { limit: 200, isActive: true }),
                getSuppliers(token, { limit: 200, isActive: true })
            ]);
            setExpenseCategoriesList(categoriesData.items.map(c => ({ value: c.id, label: c.name })) || []);
            setSuppliersList(suppliersData.items.map(s => ({ value: s.id, label: s.name })) || []);
        } catch (err) {
            toast.error("Error cargando categorías/proveedores.");
        } finally {
            setIsLoadingDropdowns(false);
        }
    }, [token]);

    useEffect(() => {
        setIsLoading(true);
        setIsLoadingDropdowns(true);
        loadExpenseData();
        loadDropdownData();
    }, [loadExpenseData, loadDropdownData]);
    
    // --- Manejadores de Eventos ---
    const handleFormChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handlePaymentFormChange = (e) => setPaymentFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleUpdateExpenseSubmit = async (e) => {
        e.preventDefault();
        // ... Lógica de submit sin cambios, pero con mejor feedback
        setIsSubmittingExpense(true);
        // ... (código de validación y submit)
        try {
            const dataToUpdate = { /* ... */ };
            await updateExpense(token, expenseId, dataToUpdate);
            toast.success("Gasto actualizado!");
            loadExpenseData();
        } catch (err) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setIsSubmittingExpense(false);
        }
    };
    
    const handleCancelExpenseButton = async () => {
        if (!window.confirm(`¿Seguro que desea cancelar el gasto: "${expenseDetails.description}"?`)) return;
        try {
            await cancelExpense(token, expenseId);
            toast.success("Gasto cancelado.");
            loadExpenseData();
        } catch (err) { toast.error(`Error al cancelar: ${err.message}`); }
    };

    const openPaymentModal = () => {
        setPaymentFormData({
            payment_date: new Date().toISOString().split('T')[0],
            amount_paid: '',
            currency_paid: expenseDetails?.currency === 'VES' ? 'VES' : 'USD',
            payment_method_used: 'Transferencia',
            reference_number: '',
            notes: '',
        });
        setFormPaymentError(null);
        setIsPaymentModalOpen(true);
    };

    const handleSubmitNewPayment = async (e) => {
        e.preventDefault();
        setIsSubmittingPayment(true);
        setFormPaymentError(null);
        try {
            const payload = { ...paymentFormData, amount_paid: parseFloat(paymentFormData.amount_paid) };
            await createExpensePayment(token, expenseId, payload);
            toast.success("¡Pago registrado exitosamente!");
            setIsPaymentModalOpen(false);
            loadExpenseData();
        } catch (err) {
            setFormPaymentError(err.message);
            toast.error(`Error: ${err.message}`);
        } finally {
            setIsSubmittingPayment(false);
        }
    };


    // --- Renderizado Condicional ---
    if (isLoading || isLoadingDropdowns || !formData) return <LoadingSkeleton />;
    
    if (error) return (
        <div className="p-8 text-center">
            <ExclamationTriangleIcon className="w-12 h-12 mx-auto text-red-400"/>
            <h3 className="mt-2 text-lg font-medium text-red-800">Error al Cargar</h3>
            <p className="mt-1 text-sm text-slate-600">{error}</p>
            <Link to="/expenses" className="mt-6 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
                <ArrowLeftIcon className="w-5 h-5"/> Volver a Gastos
            </Link>
        </div>
    );
    
    const canEditAmount = !(expenseDetails.payments_made?.length > 0) && expenseDetails.payment_status !== 'cancelled';
    const canPerformActions = expenseDetails.payment_status !== 'paid' && expenseDetails.payment_status !== 'cancelled';

    return (
        <div className="bg-slate-100 min-h-full p-4 md:p-8">
            {/* --- Encabezado --- */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">Detalle del Gasto</h1>
                    <p className="text-sm text-slate-500">Editando Gasto ID: {expenseId}</p>
                </div>
                <Link to="/expenses" className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                    <ArrowLeftIcon className="w-4 h-4" /> Volver
                </Link>
            </div>

            {/* --- Layout Principal --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Columna Izquierda: Formulario de Edición */}
                <form onSubmit={handleUpdateExpenseSubmit} className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg space-y-6">
                    <h2 className="text-lg font-semibold text-slate-900 border-b border-slate-200 pb-4 flex items-center gap-3">
                        <PencilSquareIcon className="w-6 h-6 text-sky-600"/> Editar Información
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormInput label="Fecha del Gasto" id="expense_date" type="date" name="expense_date" value={formData.expense_date} onChange={handleFormChange} required />
                        <FormInput label="Descripción" id="description" type="text" name="description" value={formData.description} onChange={handleFormChange} required />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <CustomListbox placeholder="Categoría" name="category_id" value={formData.category_id} onChange={handleFormChange} options={expenseCategoriesList} />
                        <CustomListbox placeholder="Proveedor (Opcional)" name="supplier_id" value={formData.supplier_id} onChange={handleFormChange} options={[{value: '', label: 'Ninguno'}, ...suppliersList]} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormInput label="Monto Original" id="amount" type="number" name="amount" value={formData.amount} onChange={handleFormChange} required min="0.01" step="0.01" locked={!canEditAmount} lockedTitle="No se puede cambiar con pagos registrados o si está cancelado."/>
                        <CustomListbox placeholder="Moneda Original" name="currency" value={formData.currency} onChange={handleFormChange} options={CURRENCIES} locked={!canEditAmount} lockedTitle="No se puede cambiar con pagos registrados o si está cancelado."/>
                    </div>
                    <div>
                        <label htmlFor="notes" className="block text-sm font-medium text-slate-700">Notas</label>
                        <textarea name="notes" id="notes" value={formData.notes} onChange={handleFormChange} rows="3" className="mt-1 block w-full rounded-md border-0 px-3 py-2 bg-white text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500"></textarea>
                    </div>
                </form>

                {/* Columna Derecha: Resumen y Acciones */}
                <div className="lg:col-span-1 space-y-8">
                    {/* Tarjeta de Resumen */}
                    <div className="bg-white p-6 rounded-xl shadow-lg">
                        <h3 className="font-semibold text-slate-900 border-b border-slate-200 pb-4 flex items-center gap-3">
                           <DocumentTextIcon className="w-6 h-6 text-sky-600"/> Resumen Financiero
                        </h3>
                        <div className="mt-4 divide-y divide-slate-100">
                           <InfoItem icon={<BanknotesIcon />} label="Monto Total">{formatCurrency(expenseDetails.amount, expenseDetails.currency)}</InfoItem>
                           <InfoItem icon={<TagIcon />} label="Estado"><StatusBadge status={expenseDetails.payment_status} /></InfoItem>
                           <InfoItem icon={<BanknotesIcon />} label="Total Pagado">{formatCurrency(expenseDetails.total_amount_paid_ves, 'VES')}</InfoItem>
                           <InfoItem icon={<BanknotesIcon />} label="Saldo Pendiente">{formatCurrency(expenseDetails.amount - (expenseDetails.total_amount_paid_ves / expenseDetails.exchange_rate_at_creation), expenseDetails.currency)}</InfoItem>
                           <InfoItem icon={<UserCircleIcon />} label="Registrado por">{expenseDetails.user?.full_name || 'N/A'}</InfoItem>
                           <InfoItem icon={<ClockIcon />} label="Fecha Creación">{formatDate(expenseDetails.created_at)}</InfoItem>
                        </div>
                    </div>

                    {/* Tarjeta de Acciones */}
                    <div className="bg-white p-6 rounded-xl shadow-lg">
                        <h3 className="font-semibold text-slate-900 border-b border-slate-200 pb-4">Acciones</h3>
                        <div className="mt-4 space-y-3">
                            <button type="submit" form="edit-expense-form" disabled={isSubmittingExpense} className="w-full inline-flex items-center justify-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
                                <PencilSquareIcon className="w-5 h-5"/> Guardar Cambios
                            </button>
                            <button type="button" onClick={openPaymentModal} disabled={!canPerformActions} className="w-full inline-flex justify-center items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:bg-slate-300 disabled:cursor-not-allowed">
                                <PlusIcon className="w-5 h-5"/> Registrar Pago
                            </button>
                            <button type="button" onClick={handleCancelExpenseButton} disabled={!canPerformActions} className="w-full inline-flex justify-center items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:bg-slate-300 disabled:cursor-not-allowed">
                                <NoSymbolIcon className="w-5 h-5"/> Cancelar Gasto
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabla de Pagos Realizados */}
            <div className="mt-8 bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Historial de Pagos</h2>
                {expenseDetails.payments_made?.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Fecha</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Monto Pagado</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Eq. VES</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Método</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Referencia</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Registró</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100">
                                {expenseDetails.payments_made.map(p => (
                                    <tr key={p.id} className="text-sm">
                                        <td className="px-4 py-3 text-slate-500">{formatDate(p.payment_date)}</td>
                                        <td className="px-4 py-3 text-slate-800 font-medium text-right">{formatCurrency(p.amount_paid, p.currency_paid)}</td>
                                        <td className="px-4 py-3 text-slate-500 text-right">{formatCurrency(p.amount_paid_ves_equivalent, 'VES')}</td>
                                        <td className="px-4 py-3 text-slate-500">{p.payment_method_used}</td>
                                        <td className="px-4 py-3 text-slate-500">{p.reference_number || '-'}</td>
                                        <td className="px-4 py-3 text-slate-500">{p.user?.full_name || 'N/A'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-lg">
                        <BanknotesIcon className="mx-auto h-12 w-12 text-slate-300" />
                        <h3 className="mt-2 text-sm font-semibold text-slate-800">Sin Pagos Registrados</h3>
                        <p className="mt-1 text-sm text-slate-500">Cuando registres un pago para este gasto, aparecerá aquí.</p>
                    </div>
                )}
            </div>
            
            {/* Modal para Registrar Pago */}
            <Transition appear show={isPaymentModalOpen} as={Fragment}>
                <Dialog as="div" className="relative z-20" onClose={() => setIsPaymentModalOpen(false)}>
                     <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0"><div className="fixed inset-0 bg-black/30" /></Transition.Child>
                     <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4 text-center">
                            <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                                <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-slate-900 flex justify-between items-center">
                                        Registrar Nuevo Pago
                                        <button onClick={() => setIsPaymentModalOpen(false)} className="p-1 rounded-full hover:bg-slate-100"><XMarkIcon className="w-5 h-5 text-slate-500"/></button>
                                    </Dialog.Title>
                                    <form onSubmit={handleSubmitNewPayment} className="mt-4 space-y-4">
                                        <FormInput label="Fecha del Pago" id="payment_date_modal" type="date" name="payment_date" value={paymentFormData.payment_date} onChange={handlePaymentFormChange} required />
                                        <div className="grid grid-cols-2 gap-4">
                                            <FormInput label="Monto Pagado" id="amount_paid_modal" type="number" name="amount_paid" value={paymentFormData.amount_paid} onChange={handlePaymentFormChange} required min="0.01" step="0.01" />
                                            <CustomListbox placeholder="Moneda" name="currency_paid" value={paymentFormData.currency_paid} onChange={handlePaymentFormChange} options={CURRENCIES} />
                                        </div>
                                        <CustomListbox placeholder="Método de Pago" name="payment_method_used" value={paymentFormData.payment_method_used} onChange={handlePaymentFormChange} options={PAYMENT_METHODS.map(m => ({value: m, label: m}))} />
                                        <FormInput label="Nro. Referencia (Opcional)" id="reference_number_modal" type="text" name="reference_number" value={paymentFormData.reference_number} onChange={handlePaymentFormChange} />
                                        
                                        {formPaymentError && <p className="text-red-500 text-sm text-center">{formPaymentError}</p>}
                                        <div className="pt-4 flex justify-end space-x-3 border-t border-slate-200">
                                            <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50">Cancelar</button>
                                            <button type="submit" disabled={isSubmittingPayment} className="inline-flex justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
                                                {isSubmittingPayment ? 'Registrando...' : 'Registrar Pago'}
                                            </button>
                                        </div>
                                    </form>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </div>
    );
}

export default EditExpensePage;