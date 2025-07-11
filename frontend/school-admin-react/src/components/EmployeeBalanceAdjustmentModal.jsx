import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { createEmployeeBalanceAdjustment } from '../services/apiPersonnel';
import { toast } from 'react-toastify';

// Constantes para los selectores del formulario
const ADJUSTMENT_TYPES_OPTIONS = [
    { value: "earning", label: "Asignación (Ingreso Extra)" },
    { value: "deduction", label: "Deducción (Ej: Préstamo, Descuento)" },
];

const CURRENCIES_OPTIONS = [ // Reutiliza o importa desde un archivo de constantes si ya existe
    { value: "VES", label: "Bs.S (Bolívares)" },
    { value: "USD", label: "USD (Dólares)" },
    { value: "EUR", label: "EUR (Euros)" },
];

const initialFormData = {
    adjustment_date: new Date().toISOString().split('T')[0],
    description: '',
    adjustment_type: 'earning', // Por defecto una asignación
    amount: '',
    currency: 'VES', // Por defecto en VES
};

// Helper para formatear moneda (puedes tenerlo en utils.js)
const formatCurrency = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD' && locale === 'es-VE') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};

function EmployeeBalanceAdjustmentModal({ isOpen, onClose, token, employee, onAdjustmentRecorded }) {
    // employee debe tener al menos { id, full_name, current_balance_ves }
    const [formData, setFormData] = useState(initialFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    useEffect(() => {
        if (isOpen && employee) {
            setFormData({
                ...initialFormData,
                // No pre-llenamos monto aquí, ya que es un ajuste nuevo
            });
            setFormError(null);
        } else if (!isOpen) {
            setFormData(initialFormData);
            setFormError(null);
        }
    }, [isOpen, employee]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!token || !employee?.id) {
            toast.error("Falta información del empleado o autenticación.");
            return;
        }
        const amountValue = parseFloat(formData.amount);
        if (isNaN(amountValue) || amountValue <= 0) {
            toast.warn("El monto del ajuste debe ser un número positivo.");
            setFormError("Monto del ajuste inválido.");
            return;
        }
        if (!formData.description.trim()) {
            toast.warn("La descripción del ajuste es obligatoria.");
            setFormError("Descripción requerida.");
            return;
        }

        const adjustmentTypeLabel = ADJUSTMENT_TYPES_OPTIONS.find(t => t.value === formData.adjustment_type)?.label || formData.adjustment_type;
        const confirmationMessage = `¿Está seguro de registrar una ${adjustmentTypeLabel} de ${formatCurrency(amountValue, formData.currency)} para ${employee.full_name} con descripción "${formData.description}"?`;

        if (!window.confirm(confirmationMessage)) {
            return; // El usuario canceló
        }

        setIsSubmitting(true);
        setFormError(null);
        try {
            const payload = {
                employee_id: employee.id,
                adjustment_date: formData.adjustment_date,
                description: formData.description,
                adjustment_type: formData.adjustment_type,
                amount: amountValue,
                currency: formData.currency,
            };
            await createEmployeeBalanceAdjustment(token, payload);
            toast.success(`Ajuste de saldo registrado exitosamente para ${employee.full_name}.`);
            if (onAdjustmentRecorded) {
                onAdjustmentRecorded();
            }
            onClose();
        } catch (err) {
            const errorMsg = err.message || "Error al registrar el ajuste de saldo.";
            setFormError(errorMsg);
            toast.error(`Error: ${errorMsg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !employee) return null;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Registrar Ajuste de Saldo para: ${employee.full_name}`}
        >
            <div className="text-sm mb-4 p-3 bg-yellow-50 rounded-md border border-yellow-200">
                <p><strong>Saldo Actual del Empleado:</strong> 
                    <span className={`font-semibold ml-1 ${parseFloat(employee.current_balance_ves || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(employee.current_balance_ves, 'VES')}
                    </span>
                </p>
                <p className="text-xs text-gray-600 mt-1">
                    Este ajuste modificará directamente el saldo del empleado. 
                    Una 'Asignación' incrementará lo que la escuela debe (o reducirá la deuda del empleado). 
                    Una 'Deducción' disminuirá lo que la escuela debe (o incrementará la deuda del empleado).
                </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
                <div>
                    <label htmlFor="adjustment_date_adj_modal" className="block text-sm font-medium">Fecha del Ajuste*</label>
                    <input type="date" name="adjustment_date" id="adjustment_date_adj_modal" value={formData.adjustment_date} onChange={handleInputChange} required className="mt-1 input-style"/>
                </div>
                <div>
                    <label htmlFor="description_adj_modal" className="block text-sm font-medium">Descripción del Ajuste*</label>
                    <input type="text" name="description" id="description_adj_modal" value={formData.description} onChange={handleInputChange} required placeholder="Ej: Bono por Desempeño, Préstamo Personal" className="mt-1 input-style"/>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                        <label htmlFor="adjustment_type_adj_modal" className="block text-sm font-medium">Tipo de Ajuste*</label>
                        <select name="adjustment_type" id="adjustment_type_adj_modal" value={formData.adjustment_type} onChange={handleInputChange} required className="mt-1 input-style-select">
                            {ADJUSTMENT_TYPES_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-1">
                        <label htmlFor="amount_adj_modal" className="block text-sm font-medium">Monto*</label>
                        <input type="number" name="amount" id="amount_adj_modal" value={formData.amount} onChange={handleInputChange} required min="0.01" step="0.01" className="mt-1 input-style" placeholder="Monto"/>
                    </div>
                    <div className="md:col-span-1">
                        <label htmlFor="currency_adj_modal" className="block text-sm font-medium">Moneda del Monto*</label>
                        <select name="currency" id="currency_adj_modal" value={formData.currency} onChange={handleInputChange} required className="mt-1 input-style-select">
                            {CURRENCIES_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                    </div>
                </div>
                <p className="text-xs text-gray-500">
                    Si el ajuste es en USD/EUR, se usará la tasa de cambio registrada para la "Fecha del Ajuste", para calcular el impacto del saldo en Bs.S.
                </p>

                {formError && <p className="text-red-600 text-xs italic text-center py-1 bg-red-50 rounded">{formError}</p>}
                
                <div className="pt-4 flex justify-end space-x-3 border-t">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">Cancelar</button>
                    <button 
                        type="submit" 
                        disabled={isSubmitting} 
                        className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none"
                    >
                        {isSubmitting ? 'Registrando Ajuste...' : 'Confirmar y Registrar Ajuste'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default EmployeeBalanceAdjustmentModal;