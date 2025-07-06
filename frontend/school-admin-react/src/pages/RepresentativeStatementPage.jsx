// src/pages/RepresentativeStatementPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getRepresentativeStatement, applyRepresentativeCredit } from '../services/apiRepresentatives';
import { getLatestExchangeRate } from '../services/apiExchangeRates';
import CreatePaymentModal from '../components/CreatePaymentModal';
import CreateInvoiceModal from '../components/CreateInvoiceModal';
import Modal from '../components/Modal';
import { toast } from 'react-toastify';

// --- Iconos para una UI más vistosa (SVG como componentes de React) ---
const ArrowLeftIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
);

const PlusIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
);

const SparklesIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M4 17v4M2 19h4M17 3v4M15 5h4M19 17v4M17 19h4M12 9a3 3 0 100 6 3 3 0 000-6z" /></svg>
);

const DocumentTextIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
);

const SwitchHorizontalIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
);


// --- Helpers (Sin cambios) ---
const formatMoney = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) {
        return 'N/A';
    }
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD') {
        locale = 'en-US';
    }
    return parseFloat(amount).toLocaleString(locale, options);
};

const formatDateForDisplay = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString + 'T00:00:00Z').toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const STATUS_OPTIONS = [
    { value: "pending", label: "Pendiente" },
    { value: "paid", label: "Pagado" },
    { value: "partially_paid", label: "Parcialmente Pagado" },
    { value: "overdue", label: "Vencido" },
    { value: "cancelled", label: "Cancelado" },
];

const getStatusLabel = (statusValue) => {
    const option = STATUS_OPTIONS.find(opt => opt.value === statusValue);
    return option ? option.label : statusValue;
};


function RepresentativeStatementPage() {
    const { representativeId } = useParams();
    const { token } = useAuth();

    // --- Lógica de estado (Sin cambios) ---
    const [statementData, setStatementData] = useState(null);
    const [currentUSDRate, setCurrentUSDRate] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [displayCurrency, setDisplayCurrency] = useState('VES');
    const [isCreatePaymentModalOpen, setIsCreatePaymentModalOpen] = useState(false);
    const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = useState(false);
    const [unbilledCharges, setUnbilledCharges] = useState([]);
    const [isApplyCreditModalOpen, setIsApplyCreditModalOpen] = useState(false);
    const [isSubmittingApplyCredit, setIsSubmittingApplyCredit] = useState(false);

    // --- Lógica de carga y manejo de datos (Sin cambios) ---
    const loadPageData = useCallback(async () => {
        if (!representativeId || !token) { 
            setError("ID de representante o token no disponible.");
            setIsLoading(false);
            return;
        }
        
        setIsLoading(true);
        setError(null);
        
        try {
            const rateData = await getLatestExchangeRate(token, "USD");
            if (rateData && rateData.rate) {
                setCurrentUSDRate(parseFloat(rateData.rate));
            } else {
                toast.warn("No se pudo obtener la tasa de cambio USD actual.");
                setCurrentUSDRate(null);
            }

            const data = await getRepresentativeStatement(token, representativeId);
            setStatementData(data);
            const chargesToBill = (data.detailed_charges || []).filter(charge => charge.invoice_id === null && charge.status !== 'cancelled');
            setUnbilledCharges(chargesToBill);
        } catch (err) {
            const errorMessage = err.message || "Error al cargar los datos de la página.";
            console.error("Error en loadPageData:", err);
            setError(errorMessage);
            toast.error(errorMessage);
            setStatementData(null); 
        } finally {
            setIsLoading(false);
        }
    }, [representativeId, token]);

    useEffect(() => {
        loadPageData();
    }, [loadPageData]);

    const handleActionCompleted = () => {
        loadPageData();
    };

    const toggleDisplayCurrency = () => {
        setDisplayCurrency(prev => prev === 'VES' ? 'USD' : 'VES');
    };
    
    const handleApplyCredit = async () => {
        setIsSubmittingApplyCredit(true);
        try {
            await applyRepresentativeCredit(token, representativeId);
            toast.success("¡Saldo a favor aplicado exitosamente a las deudas pendientes!");
            setIsApplyCreditModalOpen(false);
            loadPageData();
        } catch (err) {
            toast.error(`Error al aplicar el saldo: ${err.message}`);
        } finally {
            setIsSubmittingApplyCredit(false);
        }
    };

    // --- Lógica de renderizado condicional (Sin cambios) ---
    if (isLoading) { return <div className="p-8 text-center text-xl font-semibold text-slate-700">Cargando estado de cuenta...</div>; }
    if (error) { return <div className="p-8 text-center text-xl font-semibold text-red-600">Error: {error}</div>; }
    if (!statementData) { return <div className="p-8 text-center text-xl font-semibold text-slate-700">No se encontraron datos para este representante.</div>; }

    const { account_summary: summary, representative_info: repInfo, statement_generation_date: generationDate, detailed_charges: detailedCharges, detailed_payments: detailedPayments } = statementData;
    const hasCreditToApply = summary?.explicit_available_credit_ves > 0.01;
    
    const displayTotalCharges = displayCurrency === 'VES' ? formatMoney(summary?.total_charges_ves_emission) : formatMoney(summary?.total_due_original_currency_usd, 'USD');
    const displayTotalPayments = displayCurrency === 'VES' ? formatMoney(summary?.total_payments_received_ves) : formatMoney(summary?.total_paid_original_currency_equivalent_usd, 'USD');
    const displayBalanceDue = displayCurrency === 'VES' ? formatMoney(summary?.current_balance_due_ves_today) : formatMoney(summary?.current_balance_due_usd, 'USD');
    const displayAvailableCredit = displayCurrency === 'VES' ? formatMoney(summary?.explicit_available_credit_ves) : formatMoney(summary?.explicit_available_credit_usd_equivalent, 'USD');

    // --- Inicio del JSX Refactorizado ---
    return (
        <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* --- HEADER --- */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8">
                    <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">Estado de Cuenta</h1>
                    <Link to={`/representatives/${representativeId}/edit`} className="group flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors duration-300 mt-2 sm:mt-0">
                        <ArrowLeftIcon className="transform group-hover:-translate-x-1 transition-transform duration-300" />
                        Volver al Perfil
                    </Link>
                </div>

                {/* --- TARJETA DE DATOS DEL REPRESENTANTE --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-6 mb-8">
                    <h2 className="text-2xl font-bold text-slate-700 mb-4 border-b border-slate-200 pb-3">
                        Información del Representante
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-base">
                        <p><strong className="font-semibold text-slate-600">Nombre:</strong> {repInfo?.first_name} {repInfo?.last_name}</p>
                        <p><strong className="font-semibold text-slate-600">Cédula/ID:</strong> {repInfo?.cedula}</p>
                        <p><strong className="font-semibold text-slate-600">Email:</strong> {repInfo?.email}</p>
                        <p><strong className="font-semibold text-slate-600">Teléfono:</strong> {repInfo?.phone_main || 'N/A'}</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-200/80 text-right">
                        <p className="text-xs text-slate-500">Generado el: {formatDateForDisplay(generationDate)}</p>
                        {currentUSDRate && (
                            <p className="text-xs text-sky-600 font-medium mt-1">Tasa de Referencia: {formatMoney(currentUSDRate, 'VES')} por USD</p>
                        )}
                    </div>
                </div>

                {/* --- TARJETA DE RESUMEN FINANCIERO --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-6 mb-8">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-5 border-b border-slate-200 pb-3">
                        <h2 className="text-2xl font-bold text-slate-700">Resumen Financiero</h2>
                        <button
                            onClick={toggleDisplayCurrency}
                            className="flex items-center justify-center mt-2 sm:mt-0 px-4 py-2 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-900 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all duration-300 transform hover:scale-105"
                            disabled={!currentUSDRate && displayCurrency === 'VES'}
                            title={!currentUSDRate && displayCurrency === 'VES' ? "Tasa no disponible para cambiar vista" : `Ver en ${displayCurrency === 'VES' ? 'USD' : 'VES'}`}
                        >
                            <SwitchHorizontalIcon />
                            Ver en {displayCurrency === 'VES' ? 'USD' : 'VES'}
                        </button>
                    </div>
                    
                    {(!currentUSDRate && displayCurrency === 'USD') && (
                        <p className="text-sm text-orange-600 bg-orange-100 p-3 rounded-lg mb-4 text-center">
                            No se puede mostrar el resumen en USD porque la tasa de cambio actual no está disponible.
                        </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        {/* Card: Total Cargado */}
                        <div className="bg-slate-100 p-4 rounded-lg"><p className="font-medium text-slate-600">Total Cargado ({displayCurrency === 'VES' ? 'VES Emisión*' : 'USD Equiv.'})</p><p className="text-2xl font-bold text-slate-800">{displayTotalCharges}</p>{displayCurrency === 'VES' && <p className="text-xs text-slate-500 italic mt-1">*Suma de montos VES al emitir.</p>}</div>
                        {/* Card: Total Pagos */}
                        <div className="bg-slate-100 p-4 rounded-lg"><p className="font-medium text-slate-600">Total Pagos ({displayCurrency})</p><p className="text-2xl font-bold text-slate-800">{displayTotalPayments}</p></div>
                        {/* Card: Balance Adeudado */}
                        <div className={`p-4 rounded-lg shadow-inner ${(summary?.current_balance_due_usd > 0.01) ? 'bg-red-100' : 'bg-green-100'}`}><p className={`font-semibold ${(summary?.current_balance_due_usd > 0.01) ? 'text-red-800' : 'text-green-800'}`}>Balance Adeudado ({displayCurrency === 'VES' ? 'VES Indexado' : 'USD'})</p><p className={`text-3xl font-extrabold ${(summary?.current_balance_due_usd > 0.01) ? 'text-red-700' : 'text-green-700'}`}>{displayBalanceDue}</p></div>
                        {/* Card: Saldo a Favor */}
                        <div className={`p-4 rounded-lg shadow-inner ${(hasCreditToApply) ? 'bg-cyan-50' : 'bg-slate-100'}`}><p className={`font-semibold ${(hasCreditToApply) ? 'text-cyan-800' : 'text-slate-600'}`}>Saldo a Favor ({displayCurrency})</p><p className={`text-2xl font-bold ${(hasCreditToApply) ? 'text-cyan-700' : 'text-slate-800'}`}>{displayAvailableCredit}</p></div>
                    </div>
                    <div className="mt-5 p-3 bg-amber-50 rounded-lg"><p className="text-sm font-semibold text-amber-800">Nota Importante:</p><p className="text-xs text-amber-700">"Balance Adeudado (VES Indexado)" es la deuda pendiente convertida a VES con la tasa de cambio más reciente, reflejando el monto a pagar hoy.</p></div>
                </div>
                
                {/* --- SECCIÓN DE ACCIONES RÁPIDAS --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-6 mb-8">
                    <h2 className="text-2xl font-bold text-slate-700 mb-4 border-b border-slate-200 pb-3">Acciones Rápidas</h2>
                    <div className="flex flex-wrap items-center gap-4">
                        <button 
                            onClick={() => setIsCreatePaymentModalOpen(true)}
                            className="inline-flex items-center gap-x-2 px-5 py-3 text-sm font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none"
                        >
                            <PlusIcon />
                            Registrar Pago
                        </button>
                        <button 
                            onClick={() => setIsApplyCreditModalOpen(true)}
                            className="inline-flex items-center justify-center px-5 py-3 text-sm font-bold text-white bg-sky-500 rounded-lg shadow-lg hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:scale-105 active:scale-100 disabled:bg-sky-300 disabled:cursor-not-allowed disabled:scale-100"
                            disabled={!hasCreditToApply}
                            title={!hasCreditToApply ? "No hay saldo a favor para aplicar" : "Aplicar saldo a favor a deudas pendientes"}
                        >
                            <SparklesIcon />
                            Aplicar Saldo a Favor
                        </button>
                        <button 
                            onClick={() => setIsCreateInvoiceModalOpen(true)}
                            className="inline-flex items-center justify-center px-5 py-3 text-sm font-bold text-white bg-purple-600 rounded-lg shadow-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all duration-300 transform hover:scale-105 active:scale-100 disabled:bg-purple-300 disabled:cursor-not-allowed disabled:scale-100"
                            disabled={unbilledCharges.length === 0}
                            title={unbilledCharges.length === 0 ? "No hay cargos pendientes de facturar" : "Generar factura para cargos pendientes"}
                        >
                            <DocumentTextIcon />
                            Generar Factura ({unbilledCharges.length})
                        </button>
                    </div>
                </div>


                {/* --- TABLA DETALLE DE CARGOS --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-6 mb-8">
                    <h2 className="text-2xl font-bold text-slate-700 mb-4 border-b border-slate-200 pb-3">Detalle de Cargos 🧾</h2>
                    {detailedCharges.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        {['Estudiante', 'Concepto', 'Emisión', 'Vencim.', 'Monto Orig.', 'Pagado Orig.', 'Deuda Orig.', 'Deuda VES (Hoy)', 'Estado'].map(header => (
                                            <th key={header} className={`px-4 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider ${header.includes('Monto') || header.includes('Deuda') || header.includes('Pagado') ? 'text-right' : ''}`}>{header}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {detailedCharges.map(charge => (
                                        <tr key={`charge-${charge.id}`} className="hover:bg-slate-50 transition-colors duration-200">
                                            <td className="px-4 py-3 whitespace-nowrap">{charge.student_name || 'N/A'}</td>
                                            <td className="px-4 py-3 max-w-[180px] truncate"><Link to={`/applied-charges/${charge.id}/edit`} className="text-indigo-600 hover:text-indigo-800 hover:underline font-semibold" title={charge.charge_concept_name}>{charge.charge_concept_name} (ID: {charge.id})</Link></td>
                                            <td className="px-4 py-3 whitespace-nowrap">{formatDateForDisplay(charge.issue_date)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">{formatDateForDisplay(charge.due_date)}</td>
                                            <td className="px-4 py-3 text-right">{formatMoney(charge.original_concept_amount, charge.original_concept_currency)}</td>
                                            <td className="px-4 py-3 text-right">{formatMoney(charge.amount_paid_original_currency_equivalent, charge.original_concept_currency)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatMoney(charge.pending_debt_original_currency, charge.original_concept_currency)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-blue-600">{formatMoney(charge.current_debt_ves_today_per_charge, 'VES')}</td>
                                            <td className="px-4 py-3 whitespace-nowrap"><span className={`px-2.5 py-1 text-xs font-bold rounded-full leading-tight ${
                                                {'paid': 'bg-green-100 text-green-800', 'partially_paid': 'bg-blue-100 text-blue-800', 'pending': 'bg-yellow-100 text-yellow-800', 'overdue': 'bg-red-100 text-red-800', 'cancelled': 'bg-gray-200 text-gray-700'}[charge.status] || 'bg-gray-100 text-gray-800'
                                            }`}>{getStatusLabel(charge.status)}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : <p className="text-slate-600 p-3 text-center">No hay cargos detallados para mostrar.</p>}
                </div>

                {/* --- TABLA HISTORIAL DE PAGOS --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-6">
                    <h2 className="text-2xl font-bold text-slate-700 mb-4 border-b border-slate-200 pb-3">Historial de Pagos 📜</h2>
                    {detailedPayments.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                       {['Fecha', 'Monto Pagado', 'Equiv. VES (Día Pago)', 'Método', 'Referencia', 'Asignado (VES)', 'Sobrante (VES)', 'Acciones'].map(header => (
                                           <th key={header} className={`px-4 py-3 font-semibold text-slate-600 uppercase tracking-wider ${header.includes('Equiv') || header.includes('Asignado') || header.includes('Sobrante') ? 'text-right' : (header === 'Acciones' ? 'text-center' : 'text-left')}`}>{header}</th>
                                       ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {detailedPayments.map(payment => (
                                        <tr key={`payment-${payment.id}`} className="hover:bg-slate-50 transition-colors duration-200">
                                            <td className="px-4 py-3 whitespace-nowrap">{formatDateForDisplay(payment.payment_date)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap font-semibold">{formatMoney(payment.amount_paid_original, payment.currency_paid_original)}</td>
                                            <td className="px-4 py-3 text-right">{formatMoney(payment.amount_paid_ves_equivalent, 'VES')}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">{payment.payment_method || '-'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap max-w-[120px] truncate" title={payment.reference_number}>{payment.reference_number || '-'}</td>
                                            <td className="px-4 py-3 text-right">{formatMoney(payment.total_amount_allocated_ves, 'VES')}</td>
                                            <td className="px-4 py-3 text-right">{formatMoney(payment.unallocated_remainder_ves, 'VES')}</td>
                                            <td className="px-4 py-3 text-center"><Link to={`/payments/${payment.id}/details`} className="font-semibold text-indigo-600 hover:underline">Detalles</Link></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : <p className="text-slate-600 p-3 text-center">No hay pagos detallados para mostrar.</p>}
                </div>

                {/* --- MODALES (Con estilos de botones actualizados) --- */}
                <CreatePaymentModal isOpen={isCreatePaymentModalOpen} onClose={() => setIsCreatePaymentModalOpen(false)} token={token} initialRepresentativeId={representativeId} onPaymentCreated={handleActionCompleted} />
                <CreateInvoiceModal isOpen={isCreateInvoiceModalOpen} onClose={() => setIsCreateInvoiceModalOpen(false)} token={token} representative={repInfo} unbilledCharges={unbilledCharges} onInvoiceCreated={handleActionCompleted} />

                <Modal isOpen={isApplyCreditModalOpen} onClose={() => setIsApplyCreditModalOpen(false)} title="Confirmar Aplicación de Saldo a Favor">
                    <div>
                        <p className="text-sm text-slate-600 mb-4">¿Está seguro de que desea aplicar el saldo a favor de <strong className="font-bold text-slate-800">{formatMoney(summary?.explicit_available_credit_ves)}</strong> a las deudas pendientes de este representante?</p>
                        <p className="text-xs text-slate-500 bg-slate-100 p-2 rounded-md">El sistema pagará las deudas más antiguas primero hasta agotar el saldo. Esta acción no se puede deshacer.</p>
                        <div className="mt-6 flex justify-end space-x-3">
                            <button type="button" onClick={() => setIsApplyCreditModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all duration-300" disabled={isSubmittingApplyCredit}>
                                Cancelar
                            </button>
                            <button type="button" onClick={handleApplyCredit} className="px-4 py-2 text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 disabled:bg-sky-300 disabled:cursor-wait" disabled={isSubmittingApplyCredit}>
                                {isSubmittingApplyCredit ? "Aplicando..." : "Sí, Aplicar Saldo"}
                            </button>
                        </div>
                    </div>
                </Modal>
            </div>
        </div>
    );
}

export default RepresentativeStatementPage;