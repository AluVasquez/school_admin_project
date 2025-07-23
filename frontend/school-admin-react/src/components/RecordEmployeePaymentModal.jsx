// frontend/school-admin-react/src/components/RecordEmployeePaymentModal.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Modal from './Modal';
import { getEmployeePayableItems, createEmployeePayment } from '../services/apiPersonnel';
import { getLatestExchangeRate } from '../services/apiExchangeRates';
import { toast } from 'react-toastify';

// --- Constantes y Helpers ---
// --- CAMBIO 1: Añadir "Punto de Venta" a las opciones ---
const PAYMENT_METHODS_OPTIONS = [
    "Transferencia Bancaria", "Pago Móvil", "Punto de Venta", "Zelle", "Cheque", "Efectivo", "Otro"
]; //
const CURRENCIES_OPTIONS = [
    { value: "VES", label: "Bs.S (Bolívares)" }, { value: "USD", label: "USD (Dólares)" }
]; //
const initialPaymentData = {
    payment_date: new Date().toISOString().split('T')[0],
    amount_paid: '',
    currency_paid: 'VES',
    payment_method: 'Pago Móvil',
    reference_number: '',
    notes: '',
}; //

const formatCurrency = (amount, currency = 'VES') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    return parseFloat(amount).toLocaleString('es-VE', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
}; //

// --- Componente Principal del Modal ---
function RecordEmployeePaymentModal({ isOpen, onClose, token, employee, onPaymentRecorded }) {
    const [paymentData, setPaymentData] = useState(initialPaymentData);
    const [payableItems, setPayableItems] = useState([]);
    const [allocations, setAllocations] = useState({});
    const [isLoadingItems, setIsLoadingItems] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [exchangeRate, setExchangeRate] = useState(null);

    const loadDataForModal = useCallback(async () => {
        if (!isOpen || !token || !employee?.id) return;
        setIsLoadingItems(true);
        try {
            const [items, rateData] = await Promise.all([
                getEmployeePayableItems(token, employee.id),
                getLatestExchangeRate(token, 'USD', paymentData.payment_date) 
            ]); //
            setPayableItems(items || []);
            setExchangeRate(rateData?.rate || null);
            if (!rateData?.rate) {
                toast.warn("No se encontró tasa de cambio para hoy. La conversión a USD no estará disponible.", { toastId: 'rate-warning' });
            }
        } catch (err) {
            toast.error(`Error al cargar datos del modal: ${err.message}`);
            setPayableItems([]);
        } finally {
            setIsLoadingItems(false);
        }
    }, [isOpen, token, employee, paymentData.payment_date]);

    useEffect(() => {
        if (isOpen) {
            setPaymentData(initialPaymentData);
            setAllocations({});
            loadDataForModal();
        }
    }, [isOpen, loadDataForModal]);
    
    useEffect(() => {
        if(isOpen) {
            loadDataForModal();
        }
    }, [paymentData.payment_date, isOpen]);


    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setPaymentData(prev => ({ ...prev, [name]: value }));
    }; //

    const handleAllocationChange = (itemId, value) => {
        const numericValue = value ? parseFloat(value) : 0;
        setAllocations(prev => ({ ...prev, [itemId]: numericValue }));
    }; //

    const totalAllocatedInPaymentCurrency = useMemo(() => {
        return Object.values(allocations).reduce((sum, amount) => sum + (amount || 0), 0);
    }, [allocations]);
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        
        const totalPaid = parseFloat(paymentData.amount_paid);
        if (isNaN(totalPaid) || totalPaid <= 0) {
            toast.warn("El monto pagado debe ser un número positivo.");
            return;
        }

        // --- CAMBIO 3: Validación del número de referencia ---
        if (paymentData.payment_method !== 'Efectivo' && !paymentData.reference_number.trim()) {
            toast.warn("El número de referencia es obligatorio para este método de pago.");
            return;
        }
        // --- FIN DEL CAMBIO ---

        if (paymentData.currency_paid === 'USD' && !exchangeRate) {
            toast.error("No hay tasa de cambio disponible para procesar un pago en USD. Por favor, registre una tasa en la configuración.");
            return;
        }
        
        if (Math.abs(totalAllocatedInPaymentCurrency - totalPaid) > 0.01) {
            toast.error('El monto total asignado debe ser exactamente igual al monto total del pago.');
            setError('El total asignado debe ser exactamente igual al monto del pago.');
            return;
        }

        setIsSubmitting(true);

        const allocationsDetails = Object.entries(allocations)
            .filter(([_, amount]) => amount && parseFloat(amount) > 0)
            .map(([itemId, amount]) => {
                let amountInVes = parseFloat(amount);
                if (paymentData.currency_paid === 'USD' && exchangeRate) {
                    amountInVes = parseFloat(amount) * exchangeRate;
                }
                return {
                    payable_item_id: parseInt(itemId),
                    amount_to_allocate_ves: parseFloat(amountInVes.toFixed(2)),
                };
            });

        const payload = {
            employee_id: employee.id,
            payment_date: paymentData.payment_date,
            amount_paid: totalPaid,
            currency_paid: paymentData.currency_paid,
            payment_method: paymentData.payment_method,
            reference_number: paymentData.reference_number,
            notes: paymentData.notes,
            allocations_details: allocationsDetails,
        }; //

        try {
            await createEmployeePayment(token, payload); //
            toast.success("Pago al empleado registrado exitosamente.");
            if (onPaymentRecorded) onPaymentRecorded();
            onClose();
        } catch (err) {
            const errorMessage = err.response?.data?.detail || err.message || "Ocurrió un error desconocido.";
            setError(errorMessage);
            toast.error(`Error: ${errorMessage}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !employee) return null;

    const totalPaidInVes = paymentData.currency_paid === 'USD' && exchangeRate 
        ? (parseFloat(paymentData.amount_paid) || 0) * exchangeRate
        : (parseFloat(paymentData.amount_paid) || 0);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Registrar Pago a: ${employee.full_name}`}>
            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
                <fieldset className="border p-4 rounded-md">
                    <legend className="text-base font-semibold px-2">1. Detalles del Pago</legend>
                    {/* --- CAMBIO 2: Reestructuración del grid y campo condicional --- */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <FormInput label="Fecha del Pago*" id="payment_date" type="date" name="payment_date" value={paymentData.payment_date} onChange={handleInputChange} required />
                        <FormInput label="Monto Pagado*" id="amount_paid" type="number" name="amount_paid" value={paymentData.amount_paid} onChange={handleInputChange} min="0.01" step="0.01" required />
                        <FormInput as="select" label="Moneda*" id="currency_paid" name="currency_paid" value={paymentData.currency_paid} onChange={handleInputChange}>
                            {CURRENCIES_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </FormInput>
                        <FormInput as="select" label="Método de Pago*" id="payment_method" name="payment_method" value={paymentData.payment_method} onChange={handleInputChange}>
                            {PAYMENT_METHODS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </FormInput>

                        {/* Renderizado condicional del campo de referencia */}
                        {paymentData.payment_method !== 'Efectivo' && (
                           <FormInput 
                                label="Número de Referencia*"
                                id="reference_number"
                                type="text"
                                name="reference_number"
                                value={paymentData.reference_number}
                                onChange={handleInputChange}
                                placeholder="Ej: 00123456"
                                required 
                            />
                        )}
                        
                        <div className="md:col-span-2">
                           <FormInput
                                label="Notas (Opcional)"
                                id="notes"
                                as="textarea"
                                name="notes"
                                value={paymentData.notes}
                                onChange={handleInputChange}
                                rows="2"
                                placeholder="Detalles adicionales sobre el pago"
                            />
                        </div>
                    </div>
                     {/* --- FIN DEL CAMBIO --- */}
                </fieldset>

                <fieldset className="border p-4 rounded-md">
                    <legend className="text-base font-semibold px-2">2. Asignar Pago a Conceptos Pendientes</legend>
                    {isLoadingItems ? <p>Cargando conceptos pendientes...</p> : 
                     payableItems.length > 0 ? (
                        <div className="mt-2 max-h-60 overflow-y-auto pr-2 space-y-2">
                            {payableItems.map(item => {
                                const pendingDebtVes = item.amount_ves_at_creation - item.amount_paid_ves;
                                let debtToDisplay = pendingDebtVes;
                                let currencyForDisplay = 'VES';
                                
                                if (paymentData.currency_paid === 'USD') {
                                    debtToDisplay = exchangeRate ? pendingDebtVes / exchangeRate : null;
                                    currencyForDisplay = 'USD';
                                }
                                
                                return (
                                    <div key={item.id} className="grid grid-cols-3 gap-4 items-center">
                                        <div className="col-span-2">
                                            <p className="font-medium text-slate-800 truncate" title={item.description}>{item.description}</p>
                                            <p className="text-xs text-slate-500">Pendiente: {formatCurrency(debtToDisplay, currencyForDisplay)}</p>
                                        </div>
                                        <div className="col-span-1">
                                            <input
                                                type="number"
                                                placeholder="0.00"
                                                min="0"
                                                step="0.01"
                                                value={allocations[item.id] || ''}
                                                onChange={(e) => handleAllocationChange(item.id, e.target.value)}
                                                className="input-style text-right"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : <p className="text-slate-500 mt-2">Este empleado no tiene conceptos pendientes de pago.</p>}
                </fieldset>

                <div className="p-4 bg-slate-100 rounded-md text-sm space-y-2">
                    <div className="flex justify-between font-medium"><p>Monto Total del Pago:</p><p>{formatCurrency(paymentData.amount_paid || 0, paymentData.currency_paid)}</p></div>
                    {paymentData.currency_paid === 'USD' && <div className="flex justify-between text-xs"><p>Equivalente en Bs.S (Tasa: {exchangeRate?.toFixed(2) ?? 'N/A'}):</p><p>{formatCurrency(totalPaidInVes)}</p></div>}
                    <div className="flex justify-between font-medium text-blue-700"><p>Total Asignado ({paymentData.currency_paid}):</p><p>{formatCurrency(totalAllocatedInPaymentCurrency, paymentData.currency_paid)}</p></div>
                    {totalAllocatedInPaymentCurrency > parseFloat(paymentData.amount_paid) + 0.01 && <p className="text-red-600 font-bold text-center">¡El monto asignado excede el pago!</p>}
                </div>
                
                {error && <p className="text-red-600 text-center">{error}</p>}
                
                <div className="pt-4 flex  justify-end space-x-3 border-t ">
                    <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
                    <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-x-2 px-4 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg disabled:opacity-70">
                        {isSubmitting ? "Registrando..." : "Confirmar Pago"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

// Componente FormInput local
const FormInput = ({ as = 'input', label, id, children, ...props }) => {
    const Component = as;
    const baseClasses = "mt-1 block w-full rounded-md border-0 px-3 py-2 bg-white text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm";
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium leading-6 text-slate-700">{label}</label>
        <Component id={id} {...props} className={baseClasses}>{children}</Component>
      </div>
    );
};

export default RecordEmployeePaymentModal;