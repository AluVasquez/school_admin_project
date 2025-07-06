import React, { useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import { useNavigate } from 'react-router-dom';
import { getRepresentatives, getRepresentativeById } from '../services/apiRepresentatives';
import { getAppliedCharges } from '../services/apiAppliedCharges';
import { createPayment } from '../services/apiPayments';
import { getLatestExchangeRate } from '../services/apiExchangeRates';
import { toast } from 'react-toastify';

// --- Constantes y Helpers ---
const PAYMENT_METHODS = [
    { value: "Transferencia", label: "Transferencia" }, { value: "Efectivo", label: "Efectivo" },
    { value: "Punto de Venta", label: "Punto de Venta" }, { value: "PagoMovil", label: "PagoMóvil" },
    { value: "Zelle", label: "Zelle" }, { value: "Otro", label: "Otro" },
];
const CURRENCIES = [
    { value: "VES", label: "Bs.S" }, { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" },
];
const initialPaymentFormData = {
    representative_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    amount_paid: '',
    currency_paid: 'VES',
    payment_method: '',
    reference_number: '',
    notes: '',
    allocations_details: [],
};

const formatMoney = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};

const formatDateForDisplay = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString + 'T00:00:00Z').toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// --- Componente Principal ---
function CreatePaymentModal({ isOpen, onClose, token, initialRepresentativeId = null, onPaymentCreated }) {
    const navigate = useNavigate();
    const [paymentFormData, setPaymentFormData] = useState(initialPaymentFormData);
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [formPaymentError, setFormPaymentError] = useState(null);
    const [repSearchTermModal, setRepSearchTermModal] = useState('');
    const [repSearchResultsModal, setRepSearchResultsModal] = useState([]);
    const [selectedRepForPayment, setSelectedRepForPayment] = useState(null);
    const [isLoadingRepSearchModal, setIsLoadingRepSearchModal] = useState(false);
    const [assignableCharges, setAssignableCharges] = useState([]);
    const [isLoadingAssignableCharges, setIsLoadingAssignableCharges] = useState(false);
    const [totalAllocatedInPaymentCurrency, setTotalAllocatedInPaymentCurrency] = useState(0);
    const [usdToVesRate, setUsdToVesRate] = useState(null);
    const [isLoadingRate, setIsLoadingRate] = useState(true);

    const resetModalInternalState = useCallback((keepDate = false) => {
        setPaymentFormData(prev => ({ 
            ...initialPaymentFormData, 
            payment_date: keepDate && prev.payment_date ? prev.payment_date : new Date().toISOString().split('T')[0],
        }));
        setSelectedRepForPayment(null);
        setRepSearchTermModal('');
        setRepSearchResultsModal([]);
        setAssignableCharges([]);
        setTotalAllocatedInPaymentCurrency(0);
        setFormPaymentError(null);
    }, []);

    const fetchRate = useCallback(async () => {
        if (!token) { setIsLoadingRate(false); return; }
        setIsLoadingRate(true);
        try {
            const rateData = await getLatestExchangeRate(token, "USD");
            setUsdToVesRate(rateData?.rate || null);
            if (!rateData?.rate) {
                toast.warn("No se pudo obtener la tasa de cambio USD. La conversión a USD no estará disponible.");
            }
        } catch (err) {
            console.error("Error al obtener la tasa de cambio:", err);
            setUsdToVesRate(null);
        } finally {
            setIsLoadingRate(false);
        }
    }, [token]);

    const handleSelectRepresentativeForPayment = useCallback(async (rep) => {
        if (!rep?.id) {
            toast.warn("Se proporcionó un representante inválido.");
            return;
        }
        const repDisplayName = `${rep.first_name || ''} ${rep.last_name || ''} (${rep.cedula || `ID: ${rep.id}`})`;
        
        setSelectedRepForPayment({ id: rep.id, name: repDisplayName });
        setPaymentFormData(prev => ({ ...prev, representative_id: rep.id.toString() }));
        
        setRepSearchTermModal('');
        setRepSearchResultsModal([]);
        setAssignableCharges([]);
        setTotalAllocatedInPaymentCurrency(0);

        setIsLoadingAssignableCharges(true);
        try {
            const chargesData = await getAppliedCharges(token, {
                representative_id: rep.id,
                status: ['pending', 'partially_paid', 'overdue'], 
                limit: 200 
            });
            
            setAssignableCharges((chargesData.items || []).map(charge => ({
                applied_charge_id: charge.id,
                debt_remaining_ves: parseFloat(charge.amount_due_ves_at_emission || 0) - parseFloat(charge.amount_paid_ves || 0),
                charge_description: `${charge.charge_concept?.name || 'Concepto Desc.'} (Vence: ${formatDateForDisplay(charge.due_date)}) ID:${charge.id}`,
                is_indexed: charge.is_indexed,
                original_concept_currency: charge.original_concept_currency,
                amount_due_original_currency: charge.amount_due_original_currency,
                amount_paid_original_currency_equivalent: charge.amount_paid_original_currency_equivalent,
            })));
            
            setPaymentFormData(prev => ({
                ...prev,
                allocations_details: (chargesData.items || []).map(charge => ({
                    applied_charge_id: charge.id.toString(),
                    amount_to_allocate: "",
                }))
            }));
        } catch (err) {
            toast.error(`Error al cargar cargos del representante: ${err.message}`);
        } finally {
            setIsLoadingAssignableCharges(false);
        }
    }, [token]);

    useEffect(() => {
        if (isOpen) {
            fetchRate();
            resetModalInternalState(!!paymentFormData.payment_date);
            if (initialRepresentativeId && token) {
                const loadInitialRep = async () => {
                    setIsLoadingRepSearchModal(true);
                    try {
                        const repDetails = await getRepresentativeById(token, initialRepresentativeId);
                        if (repDetails?.id) {
                           setRepSearchTermModal(`${repDetails.first_name} ${repDetails.last_name} (${repDetails.cedula})`);
                           await handleSelectRepresentativeForPayment(repDetails);
                        } else {
                           toast.error(`No se pudieron cargar datos para el representante ID: ${initialRepresentativeId}`);
                        }
                    } catch (e) {
                        toast.error(`Error al cargar info del representante inicial: ${e.message}`);
                    } finally {
                        setIsLoadingRepSearchModal(false);
                    }
                };
                loadInitialRep();
            }
        }
    }, [isOpen, initialRepresentativeId, token, resetModalInternalState, handleSelectRepresentativeForPayment, fetchRate]);

    useEffect(() => {
        if (!repSearchTermModal.trim() || repSearchTermModal.length < 2 || !token || !isOpen || selectedRepForPayment) {
            setRepSearchResultsModal([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsLoadingRepSearchModal(true);
            try {
                const data = await getRepresentatives(token, { search: repSearchTermModal, limit: 5 });
                setRepSearchResultsModal(data.items || []);
            } catch (error) { toast.error("Error al buscar representantes."); }
            finally { setIsLoadingRepSearchModal(false); }
        }, 500);
        return () => clearTimeout(timer);
    }, [repSearchTermModal, token, isOpen, selectedRepForPayment]);
        
    const handlePaymentFormInputChange = (e) => {
        setPaymentFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };
    
    const handleAllocationChange = useCallback((index, amountToAllocateStr) => {
        setPaymentFormData(prevFormData => {
            const newAllocations = prevFormData.allocations_details.map((alloc, i) =>
                i === index ? { ...alloc, amount_to_allocate: amountToAllocateStr } : alloc
            );
            return { ...prevFormData, allocations_details: newAllocations };
        });
    }, []);

    useEffect(() => {
        const sum = paymentFormData.allocations_details.reduce(
            (acc, alloc) => acc + (parseFloat(alloc.amount_to_allocate.replace(',', '.')) || 0), 0
        );
        setTotalAllocatedInPaymentCurrency(sum);
    }, [paymentFormData.allocations_details]);

    useEffect(() => {
        const totalPaid = parseFloat(paymentFormData.amount_paid) || 0;
        if (totalPaid > 0 && totalAllocatedInPaymentCurrency > totalPaid + 0.001) {
            toast.warn(
                `El total asignado (${formatMoney(totalAllocatedInPaymentCurrency, paymentFormData.currency_paid)}) supera el monto del pago (${formatMoney(totalPaid, paymentFormData.currency_paid)}).`,
                { toastId: 'allocation-warning', autoClose: 4000 }
            );
        }
    }, [totalAllocatedInPaymentCurrency, paymentFormData.amount_paid, paymentFormData.currency_paid]);

    const handleSubmitPayment = async (e) => {
        e.preventDefault();
        if (!token || !selectedRepForPayment) {
            toast.error("Debe seleccionar un representante."); return;
        }
    
        const paidAmount = parseFloat(paymentFormData.amount_paid);
        if (isNaN(paidAmount) || paidAmount <= 0) {
            toast.error("El monto pagado debe ser un número mayor a cero."); return;
        }
        
        if (totalAllocatedInPaymentCurrency > paidAmount + 0.001) {
            toast.error(`El total asignado no puede exceder el monto del pago.`);
            return;
        }
    
        // --- LÓGICA DE CONFIRMACIÓN EN DOS PASOS ---
        if (!isConfirming) {
            setIsConfirming(true);
            toast.info("Por favor, confirme el registro del pago.");
    
            // Hacemos que el botón vuelva a su estado original después de 5 segundos
            setTimeout(() => {
                setIsConfirming(false);
            }, 5000);
            return; // Detenemos la ejecución aquí en el primer clic
        }
    
        // Si isConfirming es true, procedemos con el registro
        setIsSubmittingPayment(true);
        setFormPaymentError(null);
        try {
            const dataToSubmit = {
                representative_id: parseInt(paymentFormData.representative_id),
                payment_date: paymentFormData.payment_date,
                amount_paid: paidAmount,
                currency_paid: paymentFormData.currency_paid,
                payment_method: paymentFormData.payment_method || null,
                reference_number: paymentFormData.reference_number || null,
                notes: paymentFormData.notes || null,
                allocations_details: paymentFormData.allocations_details
                    .filter(alloc => alloc.amount_to_allocate && parseFloat(alloc.amount_to_allocate) > 0.001)
                    .map(alloc => ({
                        applied_charge_id: parseInt(alloc.applied_charge_id),
                        amount_to_allocate: parseFloat(alloc.amount_to_allocate)
                    })),
            };
            
            const newPayment = await createPayment(token, dataToSubmit);
            toast.success(`Pago #${newPayment.id} registrado. Redirigiendo...`);
            
            onClose(); 
            if (onPaymentCreated) onPaymentCreated();
            navigate(`/payments/${newPayment.id}/details`);
            
        } catch (err) {
            const errorMessage = err.message || "Ocurrió un error al registrar el pago.";
            setFormPaymentError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setIsSubmittingPayment(false);
            setIsConfirming(false); 
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Registrar Nuevo Pago">
            <form onSubmit={handleSubmitPayment} className="space-y-6 text-sm">
                {!initialRepresentativeId && (
                    <fieldset className="border p-4 rounded-md">
                        <legend className="text-base font-semibold text-gray-700 px-2">1. Seleccionar Representante</legend>
                        <div className="mt-1">
                            <label htmlFor="repSearchModalPayment" className="block text-sm font-medium text-gray-700 mb-1">Buscar (Nombre, Apellido, Cédula/ID)</label>
                            <input type="text" id="repSearchModalPayment" placeholder="Escriba para buscar..." value={repSearchTermModal} onChange={(e) => setRepSearchTermModal(e.target.value)} className="mt-1 w-full input-style" disabled={!!selectedRepForPayment}/>
                            {isLoadingRepSearchModal && <p className="text-xs text-gray-500 py-1 mt-1">Buscando...</p>}
                            {repSearchResultsModal.length > 0 && !selectedRepForPayment && (
                                <ul className="border border-gray-300 rounded-md mt-2 max-h-36 overflow-y-auto shadow-sm">
                                    {repSearchResultsModal.map(rep => (
                                        <li key={rep.id} onClick={() => handleSelectRepresentativeForPayment(rep)} className="p-2.5 hover:bg-indigo-100 cursor-pointer text-sm border-b last:border-b-0">
                                            {rep.first_name} {rep.last_name} ({rep.cedula})
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </fieldset>
                )}
                 {selectedRepForPayment && (
                     <div className={`p-3 rounded-md text-sm flex justify-between items-center ${initialRepresentativeId ? 'bg-gray-100 text-gray-800' : 'bg-green-50 text-green-800'}`}>
                        <span className="font-medium">Representante: <strong>{selectedRepForPayment.name}</strong></span>
                        {!initialRepresentativeId && <button type="button" onClick={() => resetModalInternalState(true)} className="text-xs text-red-600 hover:text-red-800 font-semibold p-1 rounded hover:bg-red-100">Cambiar</button>}
                    </div>
                )}
                {(selectedRepForPayment || initialRepresentativeId) && (
                    <fieldset className="border p-4 rounded-md">
                        <legend className="text-base font-semibold text-gray-700 px-2">{initialRepresentativeId ? '1.' : '2.'} Detalles del Pago</legend>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4 mt-2">
                            <div><label htmlFor="payment_date_modal" className="block text-sm font-medium text-gray-700 mb-1">Fecha del Pago</label><input type="date" name="payment_date" id="payment_date_modal" value={paymentFormData.payment_date} onChange={handlePaymentFormInputChange} required className="mt-1 block w-full input-style"/></div>
                            <div><label htmlFor="amount_paid_modal" className="block text-sm font-medium text-gray-700 mb-1">Monto Pagado</label><input type="number" name="amount_paid" id="amount_paid_modal" value={paymentFormData.amount_paid} onChange={handlePaymentFormInputChange} required min="0.01" step="0.01" className="mt-1 block w-full input-style no-spinner" placeholder="Ej: 100.00"/></div>
                            <div><label htmlFor="currency_paid_modal" className="block text-sm font-medium text-gray-700 mb-1">Moneda Pagada</label><select name="currency_paid" id="currency_paid_modal" value={paymentFormData.currency_paid} onChange={handlePaymentFormInputChange} required className="mt-1 block w-full input-style-select">{CURRENCIES.map(curr => <option key={curr.value} value={curr.value}>{curr.label}</option>)}</select></div>
                            <div><label htmlFor="payment_method_modal" className="block text-sm font-medium text-gray-700 mb-1">Método de Pago</label><select name="payment_method" id="payment_method_modal" value={paymentFormData.payment_method} onChange={handlePaymentFormInputChange} className="mt-1 block w-full input-style-select"><option value="">Seleccionar...</option>{PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></div>
                            <div className="md:col-span-2"><label htmlFor="reference_number_modal" className="block text-sm font-medium text-gray-700 mb-1">Nro. Referencia (Opcional)</label><input type="text" name="reference_number" id="reference_number_modal" value={paymentFormData.reference_number} onChange={handlePaymentFormInputChange} className="mt-1 block w-full input-style"/></div>
                            <div className="md:col-span-2"><label htmlFor="notes_modal" className="block text-sm font-medium text-gray-700 mb-1">Notas (Opcional)</label><textarea name="notes" id="notes_modal" value={paymentFormData.notes} onChange={handlePaymentFormInputChange} rows="2" className="mt-1 block w-full input-style"></textarea></div>
                        </div>
                    </fieldset>
                )}
                {(selectedRepForPayment || initialRepresentativeId) && parseFloat(paymentFormData.amount_paid) > 0 && (
                    <fieldset className="border p-4 rounded-md">
                        <legend className="text-base font-semibold text-gray-700 px-2">{initialRepresentativeId ? '2.' : '3.'} Asignar Pago a Cargos Pendientes</legend>
                        {isLoadingAssignableCharges || isLoadingRate ? (<p className="text-sm text-gray-500 py-3 text-center">Cargando...</p>) : 
                         assignableCharges.length > 0 ? (
                            <div className="space-y-2 mt-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-600 border-b pb-2 mb-2 items-center sticky top-0 bg-gray-50 z-10 px-1 py-1">
                                    <div className="col-span-6">Descripción del Cargo (ID)</div>
                                    <div className="col-span-3 text-right">Deuda Pend. ({paymentFormData.currency_paid})</div>
                                    <div className="col-span-3 text-right">Asignar ({paymentFormData.currency_paid})</div>
                                </div>
                                {assignableCharges.map((charge, index) => {
                                    let debtToDisplay = 0;
                                    const currencyToDisplay = paymentFormData.currency_paid;
                                    if (currencyToDisplay === 'USD') {
                                        if (charge.is_indexed && charge.original_concept_currency === 'USD') {
                                            debtToDisplay = (charge.amount_due_original_currency || 0) - (charge.amount_paid_original_currency_equivalent || 0);
                                        } else if (usdToVesRate) {
                                            debtToDisplay = charge.debt_remaining_ves / usdToVesRate;
                                        } else { debtToDisplay = null; }
                                    } else {
                                        debtToDisplay = charge.debt_remaining_ves;
                                    }
                                    return (
                                        <div key={charge.applied_charge_id} className="grid grid-cols-12 gap-2 items-center border-b border-gray-100 pb-2 last:border-b-0 pt-1 px-1 hover:bg-gray-50 rounded">
                                            <div className="col-span-6 text-xs text-gray-700 truncate" title={charge.charge_description}>{charge.charge_description}</div>
                                            <div className="col-span-3 text-xs text-gray-600 text-right">{debtToDisplay !== null ? formatMoney(debtToDisplay, currencyToDisplay) : 'Tasa N/A'}</div>
                                            <div className="col-span-3">
                                                <input type="number" value={paymentFormData.allocations_details[index]?.amount_to_allocate || ''} onChange={(e) => handleAllocationChange(index, e.target.value)} min="0" step="0.01" className="w-full input-style text-xs text-right py-1.5 no-spinner" placeholder="0.00" disabled={isSubmittingPayment || isLoadingAssignableCharges}/>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 mt-2 py-3 text-center">Este representante no tiene cargos elegibles para asignación.</p>
                        )}
                        <div className="mt-4 p-3 bg-gray-100 rounded-md text-sm space-y-1">
                            <div className="flex justify-between"><span>Monto del Pago ({paymentFormData.currency_paid}):</span><span className="font-semibold">{formatMoney(paymentFormData.amount_paid, paymentFormData.currency_paid)}</span></div>
                            <div className="flex justify-between"><span>Total Asignado ({paymentFormData.currency_paid}):</span><span className="font-semibold">{formatMoney(totalAllocatedInPaymentCurrency, paymentFormData.currency_paid)}</span></div>
                        </div>
                    </fieldset>
                )}
                {formPaymentError && <p className="text-red-600 text-sm italic text-center py-2 bg-red-50 rounded-md">{formPaymentError}</p>}
                <div className="pt-5 flex justify-end space-x-3 border-t border-gray-200 mt-6">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">Cancelar</button>
                    <button 
                    type="submit" 
                    disabled={isSubmittingPayment || isLoadingAssignableCharges || (!selectedRepForPayment && !initialRepresentativeId) || !(parseFloat(paymentFormData.amount_paid) > 0)} 
                    // Clase dinámica para cambiar el color
                    className={`px-6 py-2 text-sm font-medium text-white border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300
                        ${isConfirming 
                            ? 'bg-orange-500 hover:bg-orange-600 focus:ring-orange-500' 
                            : 'inline-flex items-center gap-x-2 px-3 py-2 text-sm font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px'
                        }
                    `}
                >
                    {/* Texto dinámico del botón */}
                    {isSubmittingPayment 
                        ? 'Registrando...' 
                        : (isConfirming ? '¿Confirmar Registro?' : 'Registrar Pago')
                    }
                </button>
                                </div>
                            </form>
                        </Modal>
                    );
                }

export default CreatePaymentModal;