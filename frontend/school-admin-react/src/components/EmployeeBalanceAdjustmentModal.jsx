// frontend/school-admin-react/src/components/EmployeeBalanceAdjustmentModal.jsx

import React, { useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import { createEmployeeBalanceAdjustment, getPositivePayableItemsForEmployee } from '../services/apiPersonnel'; // Importar nueva función
import { toast } from 'react-toastify';

// --- Constantes y Helpers ---
const ADJUSTMENT_TYPES_OPTIONS = [
    { value: "earning", label: "Asignación (Aumenta saldo a pagar)" },
    { value: "deduction", label: "Deducción (Disminuye saldo a pagar)" },
];
const CURRENCIES_OPTIONS = [
    { value: "VES", label: "VES (Bolívares)" }, { value: "USD", label: "USD (Dólares)" },
];
const initialFormData = {
    adjustment_date: new Date().toISOString().split('T')[0],
    description: '',
    adjustment_type: 'earning',
    amount: '',
    currency: 'VES',
};
const formatCurrency = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD' && locale === 'es-VE') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};

function EmployeeBalanceAdjustmentModal({ isOpen, onClose, token, employee, onAdjustmentRecorded }) {
    const [formData, setFormData] = useState(initialFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);
    
    const [positivePayableItems, setPositivePayableItems] = useState([]);
    const [isLoadingItems, setIsLoadingItems] = useState(false);
    const [targetPayableItemId, setTargetPayableItemId] = useState('');

    
    useEffect(() => {
        if (isOpen) {
            // Resetear todo al abrir el modal
            setFormData(initialFormData);
            setFormError(null);
            setPositivePayableItems([]);
            setTargetPayableItemId('');
        }
    }, [isOpen]);


    const fetchPayableItems = useCallback(async () => {
        if (formData.adjustment_type === 'deduction' && token && employee?.id) {
            setIsLoadingItems(true);
            setPositivePayableItems([]);
            setTargetPayableItemId('');
            try {
                const items = await getPositivePayableItemsForEmployee(token, employee.id); //
                setPositivePayableItems(items || []);
                if (!items || items.length === 0) {
                    toast.info("Este empleado no tiene conceptos con saldo pendiente a los que aplicar una deducción.");
                }
            } catch (err) {
                toast.error(`Error al cargar conceptos a deducir: ${err.message}`);
            } finally {
                setIsLoadingItems(false);
            }
        } else {
            setPositivePayableItems([]);
            setTargetPayableItemId('');
        }
    }, [formData.adjustment_type, token, employee]);

    useEffect(() => {
        if (isOpen) {
            fetchPayableItems();
        }
    }, [isOpen, fetchPayableItems]);


    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError(null);

        if (!token || !employee?.id) { toast.error("Falta información clave."); return; }
        const amountValue = parseFloat(formData.amount);
        if (isNaN(amountValue) || amountValue <= 0) { toast.warn("El monto debe ser un número positivo."); return; }
        if (!formData.description.trim()) { toast.warn("La descripción es obligatoria."); return; }


        if (formData.adjustment_type === 'deduction' && !targetPayableItemId) {
            toast.warn("Debe seleccionar el concepto al que desea aplicar la deducción.");
            return;
        }


        const confirmationMessage = `¿Está seguro de registrar este ajuste para ${employee.full_name}?`;
        if (!window.confirm(confirmationMessage)) return;

        setIsSubmitting(true);
        try {

            const payload = {
                employee_id: employee.id,
                adjustment_date: formData.adjustment_date,
                description: formData.description,
                adjustment_type: formData.adjustment_type,
                amount: amountValue,
                currency: formData.currency,
                // Añadir el ID del item objetivo solo si es una deducción
                ...(formData.adjustment_type === 'deduction' && { target_payable_item_id: parseInt(targetPayableItemId) }),
            }; //

            
            await createEmployeeBalanceAdjustment(token, payload); //
            
            toast.success(`Ajuste de saldo registrado para ${employee.full_name}.`);
            onAdjustmentRecorded?.();
            onClose();
        } catch (err) {
            const errorMsg = err.response?.data?.detail || err.message || "Error al registrar el ajuste de saldo.";
            setFormError(errorMsg);
            toast.error(`Error: ${errorMsg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !employee) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Registrar Ajuste de Saldo para: ${employee.full_name}`}>
            <div className="text-sm mb-4 p-3 bg-yellow-50 rounded-md border border-yellow-200">
                <p><strong>Saldo Actual del Empleado:</strong> 
                    <span className={`font-semibold ml-1 ${parseFloat(employee.current_balance_ves || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(employee.current_balance_ves, 'VES')}
                    </span>
                </p>
                <p className="text-xs text-gray-600 mt-1">Este ajuste modificará el saldo del empleado.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
                <div>
                    <label htmlFor="adjustment_date_adj_modal" className="block text-sm font-medium">Fecha del Ajuste*</label>
                    <input type="date" name="adjustment_date" id="adjustment_date_adj_modal" value={formData.adjustment_date} onChange={handleInputChange} required className="mt-1 input-style"/>
                </div>
                <div>
                    <label htmlFor="description_adj_modal" className="block text-sm font-medium">Descripción del Ajuste*</label>
                    <input type="text" name="description" id="description_adj_modal" value={formData.description} onChange={handleInputChange} required placeholder="Ej: Bono por Desempeño, Descuento por..." className="mt-1 input-style"/>
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


                {formData.adjustment_type === 'deduction' && (
                    <div className="pt-2">
                        <label htmlFor="target_payable_item_id_adj_modal" className="block text-sm font-medium text-red-700">Aplicar Deducción A*</label>
                        {isLoadingItems ? (
                            <p className="text-xs text-gray-500">Cargando conceptos pendientes...</p>
                        ) : (
                            <select 
                                name="target_payable_item_id" 
                                id="target_payable_item_id_adj_modal" 
                                value={targetPayableItemId} 
                                onChange={(e) => setTargetPayableItemId(e.target.value)} 
                                required 
                                className="mt-1 input-style-select"
                            >
                                <option value="">-- Seleccione un concepto a afectar --</option>
                                {positivePayableItems.map(item => {
                                    const pendingAmount = item.amount_ves_at_creation - item.amount_paid_ves;
                                    return (
                                        <option key={item.id} value={item.id}>
                                            {`${item.description} (Pendiente: ${formatCurrency(pendingAmount, 'VES')})`}
                                        </option>
                                    );
                                })}
                            </select>
                        )}
                        <p className="text-xs text-gray-500 mt-1">La deducción se restará del saldo pendiente del concepto que seleccione.</p>
                    </div>
                )}
                
                <p className="text-xs text-gray-500">Si el ajuste es en USD, se usará la tasa de cambio registrada para la "Fecha del Ajuste" para calcular el impacto en el saldo.</p>

                {formError && <p className="text-red-600 text-xs italic text-center py-1 bg-red-50 rounded">{formError}</p>}
                
                <div className="pt-4 flex justify-end space-x-3 border-t">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg">Cancelar</button>
                    <button 
                        type="submit" 
                        disabled={isSubmitting || (formData.adjustment_type === 'deduction' && isLoadingItems)} 
                        className="inline-flex items-center gap-x-2 px-4 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg disabled:opacity-70"
                    >
                        {isSubmitting ? 'Registrando Ajuste...' : 'Confirmar y Registrar'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

// Estilos (deben estar en tu CSS global o puedes definirlos aquí si es necesario)
const inputBaseStyle = "block w-full rounded-md border-0 px-3 py-2 bg-white text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm";
const inputStyle = `${inputBaseStyle}`;
const inputStyleSelect = `${inputBaseStyle}`;

export default EmployeeBalanceAdjustmentModal;