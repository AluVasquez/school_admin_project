import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { createEmployeePayment } from '../services/apiPersonnel';
import { toast } from 'react-toastify';

const initialPaymentData = {
    payment_date: new Date().toISOString().split('T')[0],
    amount_paid_ves: '',
    payment_method: '',
    reference_number: '',
    notes: '',
};

const PAYMENT_METHODS_OPTIONS = [
    { value: "Transferencia Bancaria", label: "Transferencia Bancaria" },
    { value: "Efectivo", label: "Efectivo" },
    { value: "Cheque", label: "Cheque" },
    { value: "Pago Móvil", label: "Pago Móvil" },
    { value: "Zelle", label: "Zelle" },
    { value: "Otro Medio de Pago", label: "Otro Medio de Pago" },
];

const formatCurrency = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD' && locale === 'es-VE') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};

function RecordEmployeePaymentModal({ isOpen, onClose, token, employee, onPaymentRecorded }) {
    const [paymentData, setPaymentData] = useState(initialPaymentData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    useEffect(() => {
        if (isOpen && employee) { // Asegurarse que 'employee' no sea null o undefined
            setPaymentData({
                ...initialPaymentData,
                amount_paid_ves: (employee.current_balance_ves && employee.current_balance_ves > 0) 
                                 ? employee.current_balance_ves.toFixed(2) 
                                 : ''
            });
            setFormError(null);
        } else if (!isOpen) { // Resetear si el modal se cierra
             setPaymentData(initialPaymentData);
             setFormError(null);
        }
    }, [isOpen, employee]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setPaymentData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!token || !employee?.id) {
            toast.error("Falta información del empleado o autenticación.");
            return;
        }
        const amount = parseFloat(paymentData.amount_paid_ves);
        if (isNaN(amount) || amount <= 0) {
            toast.warn("El monto pagado debe ser un número positivo en VES.");
            setFormError("Monto pagado inválido. Debe ser un número positivo en VES.");
            return;
        }
        if (!paymentData.payment_method) {
            toast.warn("Seleccione un método de pago.");
            setFormError("Método de pago requerido.");
            return;
        }

        // ---> VENTANA DE CONFIRMACIÓN <---
        const amountToDisplay = formatCurrency(amount, 'VES');
        const confirmationMessage = `¿Está seguro de que desea registrar un pago de ${amountToDisplay} al empleado ${employee.full_name}? \nEsta acción afectará el saldo del empleado y generará un gasto para la escuela.`;
        
        if (!window.confirm(confirmationMessage)) {
            return; // El usuario canceló
        }
        // ---> FIN DE LA CONFIRMACIÓN <---

        setIsSubmitting(true);
        setFormError(null);
        try {
            const payload = {
                employee_id: employee.id,
                payment_date: paymentData.payment_date,
                amount_paid_ves: amount, // El pago se registra en VES
                payment_method: paymentData.payment_method,
                reference_number: paymentData.reference_number || null,
                notes: paymentData.notes || null,
            };
            await createEmployeePayment(token, payload);
            toast.success(`Pago de ${amountToDisplay} registrado para ${employee.full_name}.`);
            if (onPaymentRecorded) {
                onPaymentRecorded(); 
            }
            onClose();
        } catch (err) {
            const errorMsg = err.message || "Error al registrar el pago al empleado.";
            setFormError(errorMsg);
            toast.error(`Error: ${errorMsg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !employee) return null; // No renderizar si no está abierto o no hay info del empleado

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Registrar Pago a: ${employee.full_name || `Empleado ID ${employee.id}`}`}
        >
            <div className="text-sm mb-4 p-3 bg-indigo-50 rounded-md border border-indigo-200">
                <p><strong>Saldo Actual del Empleado (VES):</strong> 
                    <span className={`font-semibold ml-1 ${employee.current_balance_ves >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(employee.current_balance_ves, 'VES')}
                    </span>
                    {employee.current_balance_ves > 0.001 && <span className="text-xs text-gray-600"> (La Escuela Debe)</span>}
                    {employee.current_balance_ves < -0.001 && <span className="text-xs text-gray-600"> (Empleado Debe a Escuela)</span>}
                    {Math.abs(employee.current_balance_ves || 0) <= 0.001 && <span className="text-xs text-gray-600"> (Al día)</span>}
                </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
                <div>
                    <label htmlFor="payment_date_emp_pay_modal" className="block text-sm font-medium text-gray-700">Fecha del Pago*</label>
                    <input type="date" name="payment_date" id="payment_date_emp_pay_modal" value={paymentData.payment_date} onChange={handleInputChange} required className="mt-1 input-style"/>
                </div>
                <div>
                    <label htmlFor="amount_paid_ves_emp_pay_modal" className="block text-sm font-medium text-gray-700">Monto Pagado (VES)*</label>
                    <input type="number" name="amount_paid_ves" id="amount_paid_ves_emp_pay_modal" value={paymentData.amount_paid_ves} onChange={handleInputChange} required min="0.01" step="0.01" className="mt-1 input-style" placeholder="Monto en Bolívares"/>
                </div>
                <div>
                    <label htmlFor="payment_method_emp_pay_modal" className="block text-sm font-medium text-gray-700">Método de Pago*</label>
                    <select name="payment_method" id="payment_method_emp_pay_modal" value={paymentData.payment_method} onChange={handleInputChange} required className="mt-1 input-style-select">
                        <option value="">Seleccione un método...</option>
                        {PAYMENT_METHODS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="reference_number_emp_pay_modal" className="block text-sm font-medium text-gray-700">Nro. Referencia (Opcional)</label>
                    <input type="text" name="reference_number" id="reference_number_emp_pay_modal" value={paymentData.reference_number} onChange={handleInputChange} className="mt-1 input-style"/>
                </div>
                <div>
                    <label htmlFor="notes_emp_pay_modal" className="block text-sm font-medium text-gray-700">Notas (Opcional)</label>
                    <textarea name="notes" id="notes_emp_pay_modal" value={paymentData.notes} onChange={handleInputChange} rows="2" className="mt-1 input-style"></textarea>
                </div>

                {formError && <p className="text-red-600 text-xs italic text-center py-1 bg-red-50 rounded">{formError}</p>}
                
                <div className="pt-4 flex justify-end space-x-3 border-t">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm btn-secondary">Cancelar</button>
                    <button 
                        type="submit" 
                        disabled={isSubmitting} 
                        className="px-4 py-2 text-sm btn-primary disabled:opacity-50"
                    >
                        {isSubmitting ? 'Registrando Pago...' : 'Confirmar y Registrar Pago'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default RecordEmployeePaymentModal;