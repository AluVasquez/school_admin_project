// src/pages/ExpensesPage.jsx

import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getExpenses, createExpense, cancelExpense } from '../services/apiExpenses';
import { getExpenseCategories } from '../services/apiExpenseCategories';
import { getSuppliers } from '../services/apiSuppliers';
import RecordExpensePaymentModal from '../components/RecordExpensePaymentModal';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

// --- Headless UI y Heroicons ---
import { Dialog, Listbox, Transition } from '@headlessui/react';
import { 
    PlusCircleIcon, MagnifyingGlassIcon, CheckIcon, ChevronUpDownIcon, PencilSquareIcon, 
    BanknotesIcon, ArchiveBoxXMarkIcon, XMarkIcon, ExclamationTriangleIcon, ChevronLeftIcon, ChevronRightIcon
} from '@heroicons/react/24/solid';


// --- Constantes y Helpers ---
const initialExpenseFormData = {
  expense_date: new Date().toISOString().split('T')[0],
  description: '', supplier_id: '', // category_id ya no es necesario aquí
  amount: '', currency: 'USD', notes: '', invoice_document_url: '',
};
const EXPENSE_PAYMENT_STATUS_OPTIONS = [
    { value: "pending", label: "Pendiente" }, { value: "paid", label: "Pagado" },
    { value: "partially_paid", label: "Parcialmente Pagado" }, { value: "cancelled", label: "Cancelado" },
];
const CURRENCIES = [
    { value: "USD", label: "USD ($)" }, { value: "VES", label: "VES (Bs.)" }, { value: "EUR", label: "EUR (€)" },
];

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
    return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-VE', {day: '2-digit', month: '2-digit', year: 'numeric'});
};

// --- Componentes de UI Personalizados ---
const CustomListbox = ({ options, value, onChange, placeholder, disabled, name }) => (
    <Listbox value={value} onChange={(val) => onChange({ target: { name, value: val } })} disabled={disabled} name={name}>
        <div className="relative mt-1">
            <Listbox.Button className="relative w-full cursor-default rounded-md bg-white py-2 pl-3 pr-10 text-left shadow-sm ring-1 ring-inset ring-slate-300 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm disabled:bg-slate-50 disabled:cursor-not-allowed">
                <span className="block truncate">{options.find(opt => opt.value === value)?.label || <span className="text-slate-400">{placeholder}</span>}</span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2"><ChevronUpDownIcon className="h-5 w-5 text-slate-400" aria-hidden="true" /></span>
            </Listbox.Button>
            <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                <Listbox.Options className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm">
                    {options.map((opt) => (
                        <Listbox.Option key={opt.value} className={({ active }) =>`relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-indigo-100 text-indigo-900' : 'text-slate-900'}`} value={opt.value}>
                            {({ selected }) => ( <> <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>{opt.label}</span> {selected ? (<span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-600"><CheckIcon className="h-5 w-5" aria-hidden="true" /></span>) : null} </>)}
                        </Listbox.Option>
                    ))}
                </Listbox.Options>
            </Transition>
        </div>
    </Listbox>
);
const FormInput = ({ label, id, ...props }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium leading-6 text-slate-700">{label}</label>
        <div className="mt-1">
            <input id={id} {...props} className="block w-full rounded-md border-0 px-3 py-2 bg-white text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" />
        </div>
    </div>
);

const SkeletonTable = () => (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        <div className="animate-pulse">
            <div className="bg-gray-200 h-14"></div>
            <div className="divide-y divide-gray-200">
                {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex items-center space-x-4 p-4">
                        <div className="flex-1 space-y-2 py-1"><div className="h-3 bg-gray-300 rounded w-3/4"></div><div className="h-2 bg-gray-300 rounded w-1/2"></div></div>
                         <div className="h-8 w-24 bg-gray-300 rounded"></div>
                        <div className="h-8 w-24 bg-gray-300 rounded"></div>
                        <div className="h-8 w-24 bg-gray-300 rounded"></div>
                    </div>
                ))}
            </div>
        </div>
    </div>
);


function ExpensesPage() {
    const { token } = useAuth();
    const [expenses, setExpenses] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [limitPerPage] = useState(15);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);
    const [filterExpenseDateStart, setFilterExpenseDateStart] = useState('');
    const [filterExpenseDateEnd, setFilterExpenseDateEnd] = useState('');
    const [filterCategoryId, setFilterCategoryId] = useState('');
    const [filterSupplierId, setFilterSupplierId] = useState('');
    const [filterPaymentStatus, setFilterPaymentStatus] = useState('');
    const [filterSearchDescription, setFilterSearchDescription] = useState('');
    const [expenseCategoriesList, setExpenseCategoriesList] = useState([]);
    const [suppliersList, setSuppliersList] = useState([]);
    const [isLoadingDropdowns, setIsLoadingDropdowns] = useState(true);
    const [isCreateExpenseModalOpen, setIsCreateExpenseModalOpen] = useState(false);
    const [expenseFormData, setExpenseFormData] = useState(initialExpenseFormData);
    const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
    const [formExpenseError, setFormExpenseError] = useState(null);
    const [isRecordPaymentModalOpen, setIsRecordPaymentModalOpen] = useState(false);
    const [selectedExpenseForPayment, setSelectedExpenseForPayment] = useState(null);

    const loadDropdownData = useCallback(async () => {
        if (!token) { setIsLoadingDropdowns(false); return; }
        setIsLoadingDropdowns(true);
        try {
            const [categoriesData, suppliersData] = await Promise.all([
                getExpenseCategories(token, { limit: 200, isActive: true }),
                getSuppliers(token, { limit: 200, isActive: true })
            ]);
            setExpenseCategoriesList(categoriesData.items || []);
            setSuppliersList(suppliersData.items || []);
        } catch (err) { toast.error("Error cargando datos para filtros/formularios."); } 
        finally { setIsLoadingDropdowns(false); }
    }, [token]);

    useEffect(() => { loadDropdownData(); }, [loadDropdownData]);

    const fetchExpenses = useCallback(async () => {
        if (!token || isLoadingDropdowns) { setIsLoading(false); return; }
        setIsLoading(true); setError(null);
        try {
            const skip = (currentPage - 1) * limitPerPage;
            const params = { skip, limit: limitPerPage, expenseDateStart: filterExpenseDateStart || null, expenseDateEnd: filterExpenseDateEnd || null, categoryId: filterCategoryId || null, supplierId: filterSupplierId || null, paymentStatus: filterPaymentStatus || null, searchDescription: filterSearchDescription || null };
            const data = await getExpenses(token, params);
            setExpenses(data.items || []);
            setTotalItems(data.total || 0);
            setTotalPages(data.pages || 0);
        } catch (err) { setError(err.message); toast.error(`Error al cargar gastos: ${err.message}`); setExpenses([]); setTotalItems(0); setTotalPages(0); } 
        finally { setIsLoading(false); }
    }, [token, currentPage, limitPerPage, filterExpenseDateStart, filterExpenseDateEnd, filterCategoryId, filterSupplierId, filterPaymentStatus, filterSearchDescription, isLoadingDropdowns]);

    useEffect(() => { fetchExpenses(); }, [fetchExpenses]);
    useEffect(() => { setCurrentPage(1); }, [filterExpenseDateStart, filterExpenseDateEnd, filterCategoryId, filterSupplierId, filterPaymentStatus, filterSearchDescription]);

    const handleModalFormChange = (e) => setExpenseFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const openCreateExpenseModal = () => { setExpenseFormData(initialExpenseFormData); setFormExpenseError(null); setIsCreateExpenseModalOpen(true); };
    const closeCreateExpenseModal = () => setIsCreateExpenseModalOpen(false);

    const handleSubmitNewExpense = async (e) => {
        e.preventDefault();
        if (!token) { toast.error("Error de autenticación."); return; }
        if (!expenseFormData.supplier_id) { toast.warn("Por favor, seleccione un proveedor. Es obligatorio."); return; }
        if (!expenseFormData.amount || parseFloat(expenseFormData.amount) <= 0) { toast.warn("El monto del gasto debe ser un número positivo."); return; }
        if (!expenseFormData.expense_date || !expenseFormData.description) { toast.warn("La fecha y la descripción del gasto son obligatorias."); return; }

        setIsSubmittingExpense(true); setFormExpenseError(null);
        try {
            // Ya no se envía category_id, el backend lo derivará del proveedor
            const dataToSubmit = { 
                expense_date: expenseFormData.expense_date,
                description: expenseFormData.description,
                supplier_id: parseInt(expenseFormData.supplier_id),
                amount: parseFloat(expenseFormData.amount),
                currency: expenseFormData.currency,
                notes: expenseFormData.notes,
            };
            await createExpense(token, dataToSubmit);
            toast.success("¡Gasto registrado exitosamente!");
            closeCreateExpenseModal(); fetchExpenses();
        } catch (err) { const errorMessage = err.message || "Ocurrió un error al registrar el gasto."; setFormExpenseError(errorMessage); toast.error(`Error: ${errorMessage}`); } 
        finally { setIsSubmittingExpense(false); }
    };
    
    const handleCancelExpense = async (expenseId, expenseDescription) => {
        if (!token) { toast.error("Error de autenticación."); return; }
        if (!window.confirm(`¿Está seguro de que desea cancelar el gasto: "${expenseDescription}"?`)) return;
        try { await cancelExpense(token, expenseId); toast.success(`Gasto ID ${expenseId} cancelado.`); fetchExpenses(); } 
        catch (err) { toast.error(`Error al cancelar el gasto: ${err.message}`); }
    };

    const handlePageChange = (newPage) => { if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage && !isLoading) { setCurrentPage(newPage); } };
    const handleOpenRecordPaymentModal = (expense) => { setSelectedExpenseForPayment(expense); setIsRecordPaymentModalOpen(true); };
    const handleCloseRecordPaymentModal = () => { setIsRecordPaymentModalOpen(false); setSelectedExpenseForPayment(null); };
    const handlePaymentSuccessfullyRegistered = () => { fetchExpenses(); };

    const isInitialLoading = isLoading || isLoadingDropdowns;

    const StatusBadge = ({ status }) => {
        const statusMap = {
            paid: { label: 'Pagado', classes: 'bg-green-100 text-green-800' },
            pending: { label: 'Pendiente', classes: 'bg-yellow-100 text-yellow-800' },
            partially_paid: { label: 'Parcial', classes: 'bg-blue-100 text-blue-800' },
            cancelled: { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700 line-through' },
        };
        const currentStatus = statusMap[status] || { label: status, classes: 'bg-slate-100 text-slate-800' };
        return <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium ${currentStatus.classes}`}>{currentStatus.label}</span>;
    };

    return (
        <div className="bg-slate-100 min-h-full p-4 md:p-6">
            <div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                     <h1 className="text-3xl font-extrabold text-gray-800 mb-4 md:mb-0">Gestión de Gastos</h1>
                    <button onClick={openCreateExpenseModal} className="inline-flex items-center gap-x-2 px-3 py-2 font-semibold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
                        <PlusCircleIcon className="w-5 h-5 mr-2"/> Registrar Gasto
                    </button>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
                         <div className="lg:col-span-1">
                            <label htmlFor="filterSearchDescription" className="block text-sm font-medium leading-6 text-slate-700">Buscar por Descripción</label>
                            <div className="relative mt-1">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><MagnifyingGlassIcon className="h-5 w-5 text-slate-400"/></div>
                                <input type="text" id="filterSearchDescription" placeholder="Ej: Compra de papelería..." value={filterSearchDescription} onChange={(e) => setFilterSearchDescription(e.target.value)} className="block w-full rounded-md border-0 pl-10 py-2 bg-white text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm"/>
                                 </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <FormInput label="Desde" id="filterExpenseDateStart" type="date" value={filterExpenseDateStart} onChange={(e) => setFilterExpenseDateStart(e.target.value)} />
                            <FormInput label="Hasta" id="filterExpenseDateEnd" type="date" value={filterExpenseDateEnd} onChange={(e) => setFilterExpenseDateEnd(e.target.value)} />
                        </div>
                         <div>
                            <label className="block text-sm font-medium leading-6 text-slate-700">Estado del Pago</label>
                            <CustomListbox name="filterPaymentStatus" options={[{value: '', label: 'Todos'}, ...EXPENSE_PAYMENT_STATUS_OPTIONS]} value={filterPaymentStatus} onChange={(e) => setFilterPaymentStatus(e.target.value)} placeholder="Todos los estados" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium leading-6 text-slate-700">Categoría</label>
                             <CustomListbox name="filterCategoryId" options={[{value: '', label: 'Todas'}, ...expenseCategoriesList.map(c => ({ value: c.id, label: c.name }))]} value={filterCategoryId} onChange={(e) => setFilterCategoryId(e.target.value)} placeholder="Todas las categorías" disabled={isLoadingDropdowns} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium leading-6 text-slate-700">Proveedor</label>
                            <CustomListbox name="filterSupplierId" options={[{value: '', label: 'Todos'}, ...suppliersList.map(s => ({ value: s.id, label: s.name }))]} value={filterSupplierId} onChange={(e) => setFilterSupplierId(e.target.value)} placeholder="Todos los proveedores" disabled={isLoadingDropdowns} />
                         </div>
                    </div>
                </div>

                {isInitialLoading ? ( <SkeletonTable /> ) 
                : error ? (
                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg shadow-md flex items-center" role="alert">
                        <ExclamationTriangleIcon className="h-6 w-6 mr-2" />
                        <div>
                            <p className="font-bold">Error</p>
                            <p>No se pudieron cargar los datos de los gastos. Inténtalo de nuevo más tarde.</p>
                            <p className="text-xs mt-1">Detalle: {error}</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="bg-white shadow-lg rounded-lg overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                 <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Fecha</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Descripción</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Categoría</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Monto</th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Estado</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>
                                    </tr>
                                 </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {expenses.length > 0 ? expenses.map((exp) => (
                                        <tr key={exp.id} className="hover:bg-slate-200 transition-colors duration-150">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{formatDate(exp.expense_date)}</td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-medium text-slate-900 max-w-xs truncate" title={exp.description}>{exp.description}</div>
                                                <div className="text-sm text-slate-500">{exp.supplier?.name || 'Varios'}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{exp.category?.name || 'N/A'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800 font-semibold text-right">{formatCurrency(exp.amount, exp.currency)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center"><StatusBadge status={exp.payment_status} /></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex items-center justify-end gap-x-4">
                                                    <Link to={`/expenses/${exp.id}/edit`} className="text-indigo-600 hover:text-indigo-800 transition-colors inline-flex items-center gap-1"><PencilSquareIcon className="w-4 h-4" /> Editar</Link>
                                                    {exp.payment_status !== 'paid' && exp.payment_status !== 'cancelled' && (
                                                        <button onClick={() => handleOpenRecordPaymentModal(exp)} className="text-green-600 hover:text-green-800 transition-colors inline-flex items-center gap-1"><BanknotesIcon className="w-4 h-4" /> Pagar</button>
                                                   )}
                                                    {exp.payment_status !== 'cancelled' && exp.payment_status !== 'paid' && (
                                                        <button onClick={() => handleCancelExpense(exp.id, exp.description)} className="text-red-600 hover:text-red-800 transition-colors inline-flex items-center gap-1"><ArchiveBoxXMarkIcon className="w-4 h-4" /> Cancelar</button>
                                                 )}
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan="6" className="px-6 py-12 text-center text-sm text-gray-500">No se encontraron gastos con los filtros actuales.</td></tr>
                                    )}
                                 </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between">
                                <div className="text-sm text-gray-700 mb-4 sm:mb-0">Página <span className="font-medium">{currentPage}</span> de <span className="font-medium">{totalPages}</span> | Total: <span className="font-medium">{totalItems}</span> gastos</div>
                                <div className="inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                     <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"><ChevronLeftIcon className="h-5 w-5" /></button>
                                    <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"><ChevronRightIcon className="h-5 w-5" /></button>
                                </div>
                             </div>
                        )}
                    </>
                )}

                <Transition appear show={isCreateExpenseModalOpen} as={Fragment}>
                    <Dialog as="div" className="relative z-10" onClose={closeCreateExpenseModal}>
                        <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0"><div className="fixed inset-0 bg-black/30" /></Transition.Child>
                        <div className="fixed inset-0 overflow-y-auto">
                             <div className="flex min-h-full items-center justify-center p-4 text-center">
                                <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                                    <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                         <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-slate-900 flex justify-between items-center">Registrar Nuevo Gasto <button onClick={closeCreateExpenseModal} className="p-1 rounded-full hover:bg-slate-100"><XMarkIcon className="w-5 h-5 text-slate-500"/></button></Dialog.Title>
                                        <form onSubmit={handleSubmitNewExpense} className="mt-4 space-y-4">
                                            <FormInput label="Fecha del Gasto*" id="expense_date_modal" type="date" name="expense_date" value={expenseFormData.expense_date} onChange={handleModalFormChange} required />
                                            <FormInput label="Descripción*" id="description_modal" type="text" name="description" value={expenseFormData.description} onChange={handleModalFormChange} required placeholder="Ej: Compra de resmas de papel" />
                                            
                                            <div>
                                                <label className="block text-sm font-medium leading-6 text-slate-700">Proveedor*</label>
                                                <CustomListbox 
                                                    name="supplier_id" 
                                                    options={suppliersList.map(s => ({ value: s.id.toString(), label: `${s.name} (${s.category.name})` }))} 
                                                    value={expenseFormData.supplier_id} 
                                                    onChange={handleModalFormChange} 
                                                    placeholder="Seleccionar proveedor..." 
                                                    disabled={isLoadingDropdowns} 
                                                />
                                                {expenseFormData.supplier_id && (
                                                    <p className="text-xs text-slate-500 mt-1">
                                                        Categoría asignada automáticamente: <strong>{suppliersList.find(s=>s.id.toString() === expenseFormData.supplier_id)?.category.name}</strong>
                                                    </p>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <FormInput label="Monto*" id="amount_modal" type="number" name="amount" value={expenseFormData.amount} onChange={handleModalFormChange} required min="0.01" step="0.01" placeholder="Ej: 150.75" />
                                                <div><label className="block text-sm font-medium leading-6 text-slate-700">Moneda*</label><CustomListbox name="currency" options={CURRENCIES} value={expenseFormData.currency} onChange={handleModalFormChange} placeholder="Seleccionar..." /></div>
                                             </div>
                                            <div><label htmlFor="notes_modal" className="block text-sm font-medium text-slate-700">Notas</label><textarea name="notes" id="notes_modal" value={expenseFormData.notes} onChange={handleModalFormChange} rows="2" className="mt-1 block w-full rounded-md border-0 px-3 py-2 bg-white text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"></textarea></div>
                                            {formExpenseError && <p className="text-red-500 text-sm text-center">{formExpenseError}</p>}
                                             <div className="pt-4 flex justify-end space-x-3 border-t border-slate-200">
                                                 <button type="button" onClick={closeCreateExpenseModal} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">Cancelar</button>
                                                 <button type="submit" disabled={isSubmittingExpense || isLoadingDropdowns} className="inline-flex items-center gap-x-2 px-3 py-2 font-semibold text-sm text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">{isSubmittingExpense ? 'Registrando...' : 'Registrar Gasto'}</button>
                                             </div>
                                         </form>
                                    </Dialog.Panel>
                                </Transition.Child>
                            </div>
                         </div>
                    </Dialog>
                </Transition>

                {selectedExpenseForPayment && (
                    <RecordExpensePaymentModal isOpen={isRecordPaymentModalOpen} onClose={() => { setIsRecordPaymentModalOpen(false); setSelectedExpenseForPayment(null); }} token={token} expenseToPay={selectedExpenseForPayment} onPaymentRegistered={handlePaymentSuccessfullyRegistered} />
                )}
            </div>
        </div>
    );
}

export default ExpensesPage;