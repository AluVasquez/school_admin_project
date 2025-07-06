// src/pages/RepresentativesPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getRepresentatives, createRepresentative, deleteRepresentative } from '../services/apiRepresentatives';
import { getLatestExchangeRate } from '../services/apiExchangeRates';
import Modal from '../components/Modal';
import CreatePaymentModal from '../components/CreatePaymentModal';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

// --- Iconos para una UI más vistosa ---
const UserPlusIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9h2m-1-1v2" /></svg>
);

const SearchIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
);

const ChevronLeftIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
);

const ChevronRightIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
);


// --- Helpers (Sin cambios) ---
const initialFormData = { first_name: '', last_name: '', identification_type: 'V', identification_number: '', phone_main: '', email: '', address: '', sex: '', profession: '', workplace: '' };
const formatCurrency = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD' && locale === 'es-VE') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};
const FINANCIAL_STATUS_OPTIONS = [{ value: "", label: "Todos los Estados Financieros" }, { value: "has_debt", label: "Con Deuda Pendiente" }, { value: "solvent", label: "Solventes" }, { value: "has_credit", label: "Con Saldo a Favor" }];

function RepresentativesPage() {
    const { token } = useAuth();
    // --- Lógica de estado (Sin cambios) ---
    const [representatives, setRepresentatives] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [limitPerPage] = useState(40);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);
    const [searchTermInput, setSearchTermInput] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [filterFinancialStatus, setFilterFinancialStatus] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [formData, setFormData] = useState(initialFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [representativeToDelete, setRepresentativeToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState(null);
    const [isCreatePaymentModalOpen, setIsCreatePaymentModalOpen] = useState(false);
    const [selectedRepForPayment, setSelectedRepForPayment] = useState(null);
    const [usdToVesRate, setUsdToVesRate] = useState(null);
    const [isLoadingRate, setIsLoadingRate] = useState(true);

    // --- Lógica de efectos y funciones (Sin cambios) ---
    useEffect(() => {
        const timerId = setTimeout(() => setDebouncedSearchTerm(searchTermInput), 500);
        return () => clearTimeout(timerId);
    }, [searchTermInput]);

    const fetchExchangeRate = useCallback(async () => {
        if (!token) { setIsLoadingRate(false); return; }
        setIsLoadingRate(true);
        try {
            const rateData = await getLatestExchangeRate(token, "USD");
            setUsdToVesRate(rateData && rateData.rate ? parseFloat(rateData.rate) : null);
        } catch (err) {
            console.error("Error fetching USD exchange rate:", err);
            setUsdToVesRate(null);
        } finally {
            setIsLoadingRate(false);
        }
    }, [token]);

    const fetchReps = useCallback(async () => {
        if (!token) { setError("No autenticado."); setIsLoading(false); return; }
        setIsLoading(true); setError(null);
        try {
            const skip = (currentPage - 1) * limitPerPage;
            const params = { skip, limit: limitPerPage, search: debouncedSearchTerm || null, financialStatus: filterFinancialStatus || null };
            const data = await getRepresentatives(token, params);
            setRepresentatives(data.items || []);
            setTotalItems(data.total || 0);
            setTotalPages(data.pages || 0);
        } catch (err) {
            setError(err.message); setRepresentatives([]); setTotalItems(0); setTotalPages(0);
            toast.error(`Error al cargar representantes: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, currentPage, limitPerPage, debouncedSearchTerm, filterFinancialStatus]);

    useEffect(() => { fetchExchangeRate(); }, [fetchExchangeRate]);
    useEffect(() => { if (!isLoadingRate) fetchReps(); }, [fetchReps, isLoadingRate]);
    useEffect(() => { setCurrentPage(1); }, [debouncedSearchTerm, filterFinancialStatus]);

    const handlePageChange = (newPage) => { if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage && !isLoading) setCurrentPage(newPage); };
    const handleInputChange = (e) => {
    const { name, value } = e.target; 
        setFormData(prev => ({ ...prev, [name]: value })); 
    };
    const handleOpenAddModal = () => { setFormData(initialFormData); setFormError(null); setIsAddModalOpen(true); };
    const handleCloseAddModal = () => setIsAddModalOpen(false);

    const handleSubmitNewRepresentative = async (e) => {
        e.preventDefault();
        if (!token) { setFormError("Error de autenticación."); toast.error("Error de autenticación."); return; }
        if (!formData.first_name || !formData.last_name || !formData.identification_number || !formData.email || !formData.phone_main) {
            const msg = "Nombres, apellidos, número de identificación, email y teléfono principal son obligatorios.";
            setFormError(msg); toast.warn(msg); return;
        }
        setIsSubmitting(true); setFormError(null);
        try {
            await createRepresentative(token, { ...formData });
            toast.success("¡Representante creado exitosamente!");
            handleCloseAddModal();
            setCurrentPage(1);
            fetchReps();
        } catch (err) {
            let friendlyErrorMessage = "Ocurrió un error al crear el representante.";
            
            // Obtenemos el estado y los datos del error de forma segura
            const status = err.response?.status;
            const errorData = err.response?.data;
    
            // 1. Manejo específico para Cédula Duplicada (Error 409)
            if (status === 409 && errorData?.detail) {
                if (typeof errorData.detail === 'string' && errorData.detail.toLowerCase().includes('cedula')) {
                    friendlyErrorMessage = "Este número de cédula ya se encuentra registrado.";
                } else {
                    friendlyErrorMessage = errorData.detail;
                }
            
            // 2. Manejo para otros errores de validación (Error 422)
            } else if (status === 422 && Array.isArray(errorData?.detail)) {
                const firstError = errorData.detail[0];
                const fieldName = firstError.loc?.[1] || 'desconocido';
                const originalMsg = firstError.msg || 'inválido';
                
                if (fieldName === 'phone_main' && originalMsg.includes('min_length')) {
                    const limit = firstError.ctx?.limit_value || 7; 
                    friendlyErrorMessage = `El número de teléfono debe tener al menos ${limit} caracteres.`;
                } else if (fieldName === 'email' && originalMsg.includes('value_error.email')) {
                     friendlyErrorMessage = "El formato del correo electrónico no es válido.";
                } else {
                    friendlyErrorMessage = `El campo '${fieldName}' tiene un error. Por favor, revísalo.`;
                }
    
            // 3. Fallback para cualquier otro tipo de error
            } else if (err.message) {
                friendlyErrorMessage = err.message;
            }
            
            setFormError(friendlyErrorMessage);
            toast.error(friendlyErrorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };
    const openDeleteConfirmModal = (representative) => { setRepresentativeToDelete(representative); setDeleteError(null); setShowDeleteConfirm(true); };
    const closeDeleteConfirmModal = () => { setShowDeleteConfirm(false); setRepresentativeToDelete(null); };
    const handleConfirmDelete = async () => {
        if (!representativeToDelete || !token) { const msg = "Error: No se ha seleccionado un representante o falta autenticación."; setDeleteError(msg); toast.warn(msg); return; }
        setIsDeleting(true); setDeleteError(null);
        try {
            await deleteRepresentative(token, representativeToDelete.id);
            toast.success("¡Representante eliminado exitosamente!");
            closeDeleteConfirmModal();
            if (representatives.length === 1 && currentPage > 1) {
                setCurrentPage(prevPage => prevPage - 1);
            } else {
                fetchReps();
            }
        } catch (err) {
            const errorMessage = err.message || "Ocurrió un error al eliminar el representante.";
            setDeleteError(errorMessage);
            toast.error(`Error al eliminar: ${errorMessage}`);
        } finally {
            setIsDeleting(false);
        }
    };
    const handleOpenPaymentModal = (representative) => { setSelectedRepForPayment(representative); setIsCreatePaymentModalOpen(true); };
    const handlePaymentCreated = () => { setIsCreatePaymentModalOpen(false); setSelectedRepForPayment(null); fetchReps(); };

    // --- Inicio del JSX Refactorizado ---
    return (
        <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* --- HEADER --- */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8">
                    <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Gestión de Representantes</h1>
                    <button
                        onClick={handleOpenAddModal}
                        className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none"
                    >
                        <UserPlusIcon />
                        Añadir Representante
                    </button>
                </div>

                {/* --- PANEL DE FILTROS --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-6 mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-end">
                        <div>
                            <label htmlFor="searchTermReps" className="block text-sm font-semibold text-slate-700 mb-1">Buscar Representante</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                    <SearchIcon />
                                </span>
                                <input type="text" id="searchTermReps" placeholder="Nombre, apellido, cédula, email..." value={searchTermInput} onChange={(e) => setSearchTermInput(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm disabled:bg-slate-100" disabled={isLoadingRate} />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="filterFinancialStatus" className="block text-sm font-semibold text-slate-700 mb-1">Filtrar por Estado Financiero</label>
                            <select id="filterFinancialStatus" value={filterFinancialStatus} onChange={(e) => setFilterFinancialStatus(e.target.value)} className="block w-full py-2 px-3 border border-slate-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm disabled:bg-slate-100" disabled={isLoading || isLoadingRate}>
                                {FINANCIAL_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {(isLoading || isLoadingRate) && <p className="text-center py-10 text-slate-600 font-semibold text-lg">Cargando datos...</p>}
                {error && <p className="text-red-600 bg-red-100 p-4 rounded-lg text-center mb-4 font-medium">Error al cargar: {error}</p>}

                {/* --- TABLA DE REPRESENTANTES --- */}
                {!isLoading && !isLoadingRate && !error && (
                    <>
                        <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        {['Nombre Completo', 'Cédula/ID', 'Contacto', 'Deuda / Saldo a Favor', 'Acciones'].map(header =>
                                            <th key={header} scope="col" className={`px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider ${header.includes('Deuda') ? 'text-right' : ''} ${header === 'Acciones' ? 'text-center' : ''}`}>{header}</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {representatives.length > 0 ? representatives.map((rep) => {
                                        const debtVes = rep.current_balance_due_ves_today;
                                        const debtUsdFromBackend = rep.current_balance_due_usd;
                                        const hasPositiveDebt = debtVes !== null && parseFloat(debtVes) > 0.01;
                                        const hasCredit = debtVes !== null && parseFloat(debtVes) < -0.01;
                                        let displayUsdEquivalent = null;
                                        if(hasPositiveDebt) displayUsdEquivalent = debtUsdFromBackend > 0 ? debtUsdFromBackend : (usdToVesRate && debtVes ? parseFloat(debtVes) / usdToVesRate : null);
                                        else if(hasCredit) displayUsdEquivalent = usdToVesRate && debtVes ? parseFloat(debtVes) / usdToVesRate : null;

                                        return (
                                            <tr key={rep.id} className="hover:bg-slate-200 transition-colors duration-200">
                                                <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-semibold text-slate-900">{rep.first_name} {rep.last_name}</div></td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{rep.cedula}</td>
                                                <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-slate-900">{rep.email}</div><div className="text-xs text-slate-500">{rep.phone_main}</div></td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                                    {hasPositiveDebt ? (
                                                        <div title="Deuda pendiente">
                                                            <div className="text-red-600 font-bold">{formatCurrency(debtVes, 'VES')}</div>
                                                            {displayUsdEquivalent !== null && <div className="text-xs text-red-500">({formatCurrency(displayUsdEquivalent, 'USD')})</div>}
                                                        </div>
                                                    ) : hasCredit ? (
                                                        <div title="Saldo a favor">
                                                            <div className="text-sky-600 font-bold">A Favor: {formatCurrency(Math.abs(debtVes), 'VES')}</div>
                                                            {displayUsdEquivalent !== null && <div className="text-xs text-sky-500">(A Favor: {formatCurrency(Math.abs(displayUsdEquivalent), 'USD')})</div>}
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Solvente</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium space-x-4">
                                                    <Link to={`/representatives/${rep.id}/edit`} className="text-slate-600 hover:text-slate-900 transition-colors" title="Ver Perfil">Perfil</Link>
                                                    <Link to={`/representatives/${rep.id}/statement`} className="text-indigo-600 hover:text-indigo-900 transition-colors" title="Ver Estado de Cuenta">Edo. Cuenta</Link>
                                                    {hasPositiveDebt && <button onClick={() => handleOpenPaymentModal(rep)} className="text-emerald-600 hover:text-emerald-900 transition-colors" title={`Registrar pago para ${rep.first_name}`}>Cobrar</button>}
                                                    <button onClick={() => openDeleteConfirmModal(rep)} className="text-red-600 hover:text-red-900 transition-colors" title="Eliminar Representante">Eliminar</button>
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr><td colSpan="5" className="px-6 py-10 text-center text-sm text-slate-500">No se encontraron representantes {searchTermInput && `para "${searchTermInput}"`}.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {/* --- PAGINACIÓN --- */}
                        {totalPages > 0 && (
                            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between">
                                <div className="text-sm text-slate-700 mb-4 sm:mb-0">
                                    Página <span className="font-bold">{currentPage}</span> de <span className="font-bold">{totalPages}</span> (Total: {totalItems} representantes)
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="inline-flex items-center justify-center h-10 w-10 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                        <ChevronLeftIcon />
                                    </button>
                                    <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="inline-flex items-center justify-center h-10 w-10 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                        <ChevronRightIcon />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* --- MODALES --- */}
                <Modal isOpen={isAddModalOpen} onClose={handleCloseAddModal} title="Añadir Nuevo Representante">
                    <form onSubmit={handleSubmitNewRepresentative} className="space-y-4">
                        {/* Campos del formulario con estilos mejorados */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label htmlFor="add_first_name" className="label-style">Nombres</label><input type="text" name="first_name" id="add_first_name" value={formData.first_name} onChange={handleInputChange} required className="input-style" /></div>
                            <div><label htmlFor="add_last_name" className="label-style">Apellidos</label><input type="text" name="last_name" id="add_last_name" value={formData.last_name} onChange={handleInputChange} required className="input-style" /></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <div>
                                <label htmlFor="add_identification_type" className="block text-sm font-semibold text-slate-700 mb-1">Tipo Ident.</label>
                                <select name="identification_type" id="add_identification_type" value={formData.identification_type} onChange={handleInputChange} className="block w-full py-2 px-3 border border-slate-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm">
                                    <option value="V">V (Venezolano)</option>
                                    <option value="E">E (Extranjero)</option>
                                    <option value="P">P (Pasaporte)</option>
                                    <option value="J">J (RIF Jurídico)</option>
                                    <option value="G">G (RIF Gubernamental)</option>
                                </select>
                            </div>
                            <div className="md:col-span-2"><label htmlFor="add_identification_number" className="label-style">Número Identificación</label><input type="text" name="identification_number" id="add_identification_number" value={formData.identification_number} onChange={handleInputChange} required className="input-style" /></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div><label htmlFor="add_email" className="label-style">Correo Electrónico</label><input type="email" name="email" id="add_email" value={formData.email} onChange={handleInputChange} required className="input-style" /></div>
                             <div><label htmlFor="add_phone_main" className="label-style">Teléfono</label><input type="tel" name="phone_main" id="add_phone_main" value={formData.phone_main} onChange={handleInputChange} required className="input-style" /></div>
                        </div>
                        <div><label htmlFor="add_address" className="label-style">Dirección</label><textarea name="address" id="add_address" value={formData.address} onChange={handleInputChange} rows="2" className="input-style"></textarea></div>

                        {formError && <p className="text-red-600 text-sm text-center bg-red-100 p-2 rounded-lg">{formError}</p>}
                        <div className="pt-4 flex justify-end space-x-3">
                            <button type="button" onClick={handleCloseAddModal} className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all duration-300">Cancelar</button>
                            <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-x-2 px-3 py-2 text-sm font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none disabled:cursor-wait">{isSubmitting ? 'Guardando...' : 'Guardar Representante'}</button>
                        </div>
                    </form>
                </Modal>
                
                {representativeToDelete && (
                    <Modal isOpen={showDeleteConfirm} onClose={closeDeleteConfirmModal} title="Confirmar Eliminación">
                        <p className="text-slate-700 mb-2">¿Estás seguro de que deseas eliminar a <strong className="font-semibold text-slate-900">{representativeToDelete.first_name} {representativeToDelete.last_name}</strong> (C.I. {representativeToDelete.cedula})?</p>
                        <p className="text-sm text-red-700 font-bold bg-red-100 p-2 rounded-lg mb-4">¡ESTA ACCIÓN NO SE PODRÁ DESHACER Y PODRÍA AFECTAR A ESTUDIANTES ASOCIADOS!</p>
                        {deleteError && <p className="text-red-600 text-xs italic mb-3 text-center">{deleteError}</p>}
                        <div className="flex justify-end space-x-3 pt-2">
                            <button onClick={closeDeleteConfirmModal} disabled={isDeleting} className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all duration-300 disabled:opacity-50">Cancelar</button>
                            <button onClick={handleConfirmDelete} disabled={isDeleting} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-300 disabled:bg-red-400 disabled:cursor-wait">{isDeleting ? 'Eliminando...' : 'Sí, Eliminar'}</button>
                        </div>
                    </Modal>
                )}

                {selectedRepForPayment && <CreatePaymentModal isOpen={isCreatePaymentModalOpen} onClose={() => {setIsCreatePaymentModalOpen(false); setSelectedRepForPayment(null);}} token={token} initialRepresentativeId={selectedRepForPayment.id.toString()} onPaymentCreated={handlePaymentCreated} />}
            </div>
        </div>
    );
}
export default RepresentativesPage;