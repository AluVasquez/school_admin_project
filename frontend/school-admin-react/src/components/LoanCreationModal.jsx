// frontend/school-admin-react/src/components/LoanCreationModal.jsx

import React, { useState } from 'react';
import Modal from './Modal';
import { createEmployeeLoan } from '../services/apiPersonnel';
import { toast } from 'react-toastify';

const initialLoanFormData = {
    loan_type: 'loan',
    request_date: new Date().toISOString().split('T')[0],
    description: '',
    total_amount_ves: '',
    number_of_installments: '',
};

function LoanCreationModal({ isOpen, onClose, token, employeeId, onLoanCreated }) {
    const [formData, setFormData] = useState(initialLoanFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.description.trim() || !formData.total_amount_ves) {
            toast.warn("Descripción y Monto Total son obligatorios.");
            return;
        }
        if (formData.loan_type === 'loan' && (!formData.number_of_installments || parseInt(formData.number_of_installments) <= 0)) {
            toast.warn("El número de cuotas es obligatorio para un préstamo y debe ser mayor a cero.");
            return;
        }

        setIsSubmitting(true);
        setFormError(null);
        try {
            const payload = {
                employee_id: parseInt(employeeId),
                loan_type: formData.loan_type,
                request_date: formData.request_date,
                description: formData.description,
                total_amount_ves: parseFloat(formData.total_amount_ves),
                number_of_installments: formData.loan_type === 'loan' ? parseInt(formData.number_of_installments) : 1,
            };
            await createEmployeeLoan(token, payload);
            toast.success("Préstamo/Adelanto registrado exitosamente.");
            if (onLoanCreated) onLoanCreated();
            onClose();
        } catch (err) {
            const errorMsg = err.message || "Error al registrar.";
            setFormError(errorMsg);
            toast.error(`Error: ${errorMsg}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Registrar Préstamo o Adelanto">
            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Tipo de Registro*</label>
                    <div className="mt-2 flex space-x-4">
                        <label className="flex items-center"><input type="radio" name="loan_type" value="loan" checked={formData.loan_type === 'loan'} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 border-gray-300"/> <span className="ml-2">Préstamo (en cuotas)</span></label>
                        <label className="flex items-center"><input type="radio" name="loan_type" value="advance" checked={formData.loan_type === 'advance'} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 border-gray-300"/> <span className="ml-2">Adelanto (1 cuota)</span></label>
                    </div>
                </div>
                <div>
                    <label htmlFor="request_date_loan_modal" className="block text-sm font-medium">Fecha de Otorgamiento*</label>
                    <input type="date" name="request_date" id="request_date_loan_modal" value={formData.request_date} onChange={handleInputChange} required className="mt-1 input-style"/>
                </div>
                <div>
                    <label htmlFor="description_loan_modal" className="block text-sm font-medium">Descripción/Motivo*</label>
                    <input type="text" name="description" id="description_loan_modal" value={formData.description} onChange={handleInputChange} required placeholder="Ej: Adelanto de quincena, Préstamo para emergencias" className="mt-1 input-style"/>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="total_amount_ves_loan_modal" className="block text-sm font-medium">Monto Total (VES)*</label>
                        <input type="number" name="total_amount_ves" id="total_amount_ves_loan_modal" value={formData.total_amount_ves} onChange={handleInputChange} required min="0.01" step="0.01" className="mt-1 input-style" placeholder="Monto en Bolívares"/>
                    </div>
                    {formData.loan_type === 'loan' && (
                        <div>
                            <label htmlFor="number_of_installments_loan_modal" className="block text-sm font-medium">Número de Cuotas*</label>
                            <input type="number" name="number_of_installments" id="number_of_installments_loan_modal" value={formData.number_of_installments} onChange={handleInputChange} required min="1" step="1" className="mt-1 input-style" placeholder="Ej: 6"/>
                        </div>
                    )}
                </div>
                 {formError && <p className="text-red-600 text-xs italic text-center py-1 bg-red-50 rounded">{formError}</p>}
                <div className="pt-4 flex justify-end space-x-3 border-t">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg">Cancelar</button>
                    <button type="submit" disabled={isSubmitting} className="btn-primary-xs px-4 py-2 disabled:opacity-50">{isSubmitting ? 'Registrando...' : 'Registrar'}</button>
                </div>
            </form>
        </Modal>
    );
}

export default LoanCreationModal;