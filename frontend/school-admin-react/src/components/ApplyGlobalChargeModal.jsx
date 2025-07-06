import React, { useState, useEffect } from 'react';
import Modal from './Modal'; 
import { toast } from 'react-toastify';
import { applyGlobalCharge as apiApplyGlobalCharge } from '../services/apiBillingProcesses'; // Importamos el nuevo servicio

// import { CURRENCIES } from '../utils/constants'; // Ejemplo si tienes constantes compartidas

const CURRENCIES_MODAL = [ // Podrías importar esto de un archivo de constantes
    { value: "USD", label: "USD ($)" },
    { value: "VES", label: "VES (Bs.)" },
    { value: "EUR", label: "EUR (€)" },
];

const initialModalFormData = {
    description: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
    target_students: 'all_active', // 'all_active' o 'all'
    override_amount: '',
    override_currency: '', // Dejar vacío para usar la del concepto, o seleccionar una
    confirmation_text: '',
};

function ApplyGlobalChargeModal({ isOpen, onClose, token, chargeConcept, onGlobalChargeApplied }) {
    const [formData, setFormData] = useState(initialModalFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    useEffect(() => {
        if (isOpen && chargeConcept) {
            // Pre-llenar descripción si no hay una, y resetear confirmación
            setFormData(prev => ({
                ...initialModalFormData,
                description: prev.description || chargeConcept.name, // Usa nombre del concepto si no hay descripción
                issue_date: initialModalFormData.issue_date, // Mantener fecha de hoy al abrir
            }));
            setFormError(null);
        } else if (!isOpen) {
            setFormData(initialModalFormData); // Reset completo al cerrar
        }
    }, [isOpen, chargeConcept]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.confirmation_text.toUpperCase() !== "APLICAR") {
            toast.warn("Debe escribir 'APLICAR' en el campo de confirmación para proceder.");
            setFormError("Confirmación incorrecta.");
            return;
        }
        if (!chargeConcept || !chargeConcept.id) {
            toast.error("Error: Concepto de cargo no especificado.");
            return;
        }

        setIsSubmitting(true);
        setFormError(null);

        const payload = {
            charge_concept_id: chargeConcept.id,
            description: formData.description || chargeConcept.name,
            issue_date: formData.issue_date,
            due_date: formData.due_date,
            target_students: formData.target_students,
            override_amount: formData.override_amount ? parseFloat(formData.override_amount) : null,
            override_currency: formData.override_currency || null,
        };

        try {
            const summaryResponse = await apiApplyGlobalCharge(token, payload);
            toast.success(summaryResponse.message || "Cargo global aplicado exitosamente.");
            if (summaryResponse.errors_list && summaryResponse.errors_list.length > 0) {
                summaryResponse.errors_list.forEach(err => {
                    toast.warn(`Error para estudiante ${err.student_name || err.student_id}: ${err.reason}`, { autoClose: 7000 });
                });
            }
            if (onGlobalChargeApplied) onGlobalChargeApplied(summaryResponse);
            onClose();
        } catch (error) {
            console.error("Error en handleSubmit de ApplyGlobalChargeModal:", error);
            setFormError(error.message || "Ocurrió un error al aplicar el cargo global.");
            toast.error(error.message || "Ocurrió un error al aplicar el cargo global.");
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (!isOpen || !chargeConcept) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Aplicar Cargo Global: "${chargeConcept.name}"`}>
            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
                <div>
                    <label htmlFor="gc_description" className="block text-sm font-medium text-gray-700 mb-1">
                        Descripción para este Lote de Cargos <span className="text-xs text-gray-500">(Opcional, por defecto: "{chargeConcept.name}")</span>
                    </label>
                    <input
                        type="text"
                        name="description"
                        id="gc_description"
                        value={formData.description}
                        onChange={handleInputChange}
                        className="mt-1 w-full input-style"
                        placeholder={chargeConcept.name}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="gc_issue_date" className="block text-sm font-medium text-gray-700 mb-1">Fecha de Emisión</label>
                        <input type="date" name="issue_date" id="gc_issue_date" value={formData.issue_date} onChange={handleInputChange} required className="mt-1 block w-full input-style"/>
                    </div>
                    <div>
                        <label htmlFor="gc_due_date" className="block text-sm font-medium text-gray-700 mb-1">Fecha de Vencimiento</label>
                        <input type="date" name="due_date" id="gc_due_date" value={formData.due_date} onChange={handleInputChange} required className="mt-1 block w-full input-style"/>
                    </div>
                </div>

                <div>
                    <label htmlFor="gc_target_students" className="block text-sm font-medium text-gray-700 mb-1">Aplicar A</label>
                    <select name="target_students" id="gc_target_students" value={formData.target_students} onChange={handleInputChange} className="mt-1 block w-full input-style-select">
                        <option value="all_active">Todos los Estudiantes Activos</option>
                        <option value="all">Absolutamente Todos los Estudiantes</option>
                    </select>
                </div>
                
                <fieldset className="border p-3 rounded-md mt-2">
                    <legend className="text-xs font-medium text-gray-500 px-1">Sobrescribir Monto/Moneda del Concepto (Opcional)</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div>
                            <label htmlFor="gc_override_amount" className="block text-sm font-medium text-gray-700 mb-1">Nuevo Monto</label>
                            <input type="number" name="override_amount" id="gc_override_amount" value={formData.override_amount} onChange={handleInputChange} min="0.01" step="0.01" className="mt-1 block w-full input-style" placeholder={`Defecto: ${chargeConcept.default_amount}`}/>
                        </div>
                        <div>
                            <label htmlFor="gc_override_currency" className="block text-sm font-medium text-gray-700 mb-1">Nueva Moneda</label>
                            <select name="override_currency" id="gc_override_currency" value={formData.override_currency} onChange={handleInputChange} className="mt-1 block w-full input-style-select">
                                <option value="">Usar del Concepto ({chargeConcept.default_amount_currency})</option>
                                {CURRENCIES_MODAL.map(curr => <option key={curr.value} value={curr.value}>{curr.label}</option>)}
                            </select>
                        </div>
                    </div>
                </fieldset>

                <div className="mt-6 p-4 border-t border-b border-red-300 bg-red-50 rounded-md">
                    <label htmlFor="gc_confirmation_text" className="block text-sm font-semibold text-red-700 mb-1">Confirmación Requerida</label>
                    <p className="text-xs text-red-600 mb-2">Esta acción aplicará el cargo <strong className="font-bold text-transform: uppercase">"{formData.description || chargeConcept.name}"</strong> a <strong className="font-semibold">{formData.target_students === 'all_active' ? 'todos los estudiantes activos' : 'absolutamente todos los estudiantes'}</strong>. Es una operación delicada.</p>
                    <input
                        type="text"
                        name="confirmation_text"
                        id="gc_confirmation_text"
                        value={formData.confirmation_text}
                        onChange={handleInputChange}
                        className="mt-1 w-full input-style border-red-400 focus:ring-red-500 focus:border-red-500"
                        placeholder="Escriba 'APLICAR' para confirmar"
                    />
                </div>

                {formError && <p className="text-red-600 text-xs italic text-center py-1">{formError}</p>}
                
                <div className="pt-4 flex justify-end space-x-3">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">
                        Cancelar
                    </button>
                    <button 
                        type="submit" 
                        disabled={isSubmitting || formData.confirmation_text.toUpperCase() !== "APLICAR"} 
                        className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Aplicando Cargo Global...' : 'Confirmar y Aplicar Cargo Global'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default ApplyGlobalChargeModal;