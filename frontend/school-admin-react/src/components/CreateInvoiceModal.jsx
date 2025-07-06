// src/components/CreateInvoiceModal.jsx

import React, { useState, useEffect, useMemo } from 'react';
import Modal from './Modal';
import { toast } from 'react-toastify';
import { createInvoice } from '../services/apiInvoices';

// --- Iconos SVG para una mejor UI ---
const CheckCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
);

const AlertTriangleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-4a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
    </svg>
);


// --- Helpers (sin cambios en su lógica) ---
const formatCurrency = (amount, currency = 'VES') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    return parseFloat(amount).toLocaleString('es-VE', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    // Se asume que la fecha viene como YYYY-MM-DD y se trata como UTC para evitar problemas de zona horaria.
    return new Date(dateString + 'T00:00:00Z').toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// --- Constantes ---
const EMISSION_TYPES = [
    { value: 'DIGITAL', label: 'Factura Digital', description: 'Vía Imprenta Digital autorizada.' },
    { value: 'FISCAL_PRINTER', label: 'Impresora Fiscal', description: 'Emitida desde una impresora fiscal.' },
    { value: 'FORMA_LIBRE', label: 'Forma Libre', description: 'Factura pre-impresa llenada manualmente.' },
];

const STEPS = [
    { id: 1, name: 'Seleccionar Cargos' },
    { id: 2, name: 'Datos de Facturación' },
    { id: 3, name: 'Emisión y Confirmación' },
];

function CreateInvoiceModal({ isOpen, onClose, token, representative, unbilledCharges, onInvoiceCreated }) {
    const [step, setStep] = useState(1);
    const [selectedChargeIds, setSelectedChargeIds] = useState(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    const [billingInfo, setBillingInfo] = useState({
        bill_to_name: '',
        bill_to_rif_or_cedula: '',
        bill_to_address: '',
    });

    const [emissionDetails, setEmissionDetails] = useState({
        emission_type: 'DIGITAL',
        manual_control_number: '',
    });

    // --- Efectos y Lógica de Estado (sin cambios funcionales) ---
    useEffect(() => {
        if (isOpen) {
            setStep(1);
            const allChargeIds = new Set(unbilledCharges.map(c => c.id));
            setSelectedChargeIds(allChargeIds);
            
            setBillingInfo({
                bill_to_name: `${representative?.first_name || ''} ${representative?.last_name || ''}`.trim(),
                bill_to_rif_or_cedula: representative?.rif || representative?.cedula || '',
                bill_to_address: representative?.address || '',
            });
            setEmissionDetails({ emission_type: 'DIGITAL', manual_control_number: '' });
            setIsSubmitting(false);
            setFormError(null);
        }
    }, [isOpen, representative, unbilledCharges]);
    
    const selectedCharges = useMemo(() => {
        return unbilledCharges.filter(charge => selectedChargeIds.has(charge.id));
    }, [unbilledCharges, selectedChargeIds]);

    const invoiceTotals = useMemo(() => {
        let subtotal = 0;
        let iva = 0;
        selectedCharges.forEach(charge => {
            const chargeAmount = parseFloat(charge.amount_due_ves_at_emission || 0);
            // Asumimos que iva_percentage es un valor entre 0 y 1 (ej: 0.16 para 16%)
            const ivaPercentage = charge.charge_concept?.iva_percentage || 0;
            const chargeIva = chargeAmount * ivaPercentage;
            subtotal += chargeAmount;
            iva += chargeIva;
        });
        const total = subtotal + iva;
        return { subtotal, iva, total };
    }, [selectedCharges]);

    // --- Handlers (con una nueva adición: handleSelectAll) ---

    const handleChargeSelection = (chargeId) => {
        setSelectedChargeIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(chargeId)) {
                newSet.delete(chargeId);
            } else {
                newSet.add(chargeId);
            }
            return newSet;
        });
    };
    
    // NUEVA FUNCIÓN: Permite seleccionar o deseleccionar todos los cargos a la vez
    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedChargeIds(new Set(unbilledCharges.map(c => c.id)));
        } else {
            setSelectedChargeIds(new Set());
        }
    };

    const handleBillingInfoChange = (e) => {
        setBillingInfo({ ...billingInfo, [e.target.name]: e.target.value });
    };

    const handleEmissionDetailsChange = (e) => {
        setEmissionDetails({ ...emissionDetails, [e.target.name]: e.target.value });
    };
    
    // --- Lógica de Navegación y Envío (sin cambios funcionales) ---
    const handleNextStep = () => {
        setFormError(null); // Limpiar errores al avanzar
        if (step === 1 && selectedChargeIds.size === 0) {
            toast.warn("Debe seleccionar al menos un cargo para facturar.");
            return;
        }
        if (step === 2) {
             if (!billingInfo.bill_to_name.trim() || !billingInfo.bill_to_rif_or_cedula.trim() || !billingInfo.bill_to_address.trim()) {
                toast.warn("Los datos del receptor (nombre, RIF/CI, dirección) son obligatorios.");
                return;
             }
        }
        setStep(prev => prev + 1);
    };
    
    const handlePrevStep = () => setStep(prev => prev - 1);

    const handleSubmitInvoice = async (e) => {
        e.preventDefault(); 
        if (!token || !representative?.id) {
            setFormError("Faltan datos del representante o autenticación. Cierre el modal y reintente.");
            toast.error("Faltan datos del representante o autenticación.");
            return;
        }
        if (emissionDetails.emission_type === 'FORMA_LIBRE' && !emissionDetails.manual_control_number.trim()) {
            setFormError("Debe ingresar el número de control para la facturación con Forma Libre.");
            toast.warn("El número de control es requerido.");
            return;
        }

        setIsSubmitting(true);
        setFormError(null);

        const payload = {
            representative_id: representative.id,
            applied_charge_ids: Array.from(selectedChargeIds),
            emission_type: emissionDetails.emission_type,
            bill_to_name: billingInfo.bill_to_name.trim(),
            bill_to_rif_or_cedula: billingInfo.bill_to_rif_or_cedula.trim(),
            bill_to_address: billingInfo.bill_to_address.trim(),
            manual_control_number: emissionDetails.emission_type === 'FORMA_LIBRE' ? emissionDetails.manual_control_number.trim() : undefined,
        };

        try {
            const newInvoice = await createInvoice(token, payload);
            toast.success(`¡Factura #${newInvoice.invoice_number} creada exitosamente!`);
            if(onInvoiceCreated) onInvoiceCreated();
            onClose();
        } catch (err) {
            const errorMessage = err.response?.data?.detail || err.message || "Ocurrió un error al crear la factura.";
            setFormError(errorMessage);
            toast.error(`Error: ${errorMessage}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Componentes de Renderizado de Pasos (completamente rediseñados) ---
    
    const renderStepContent = () => {
        switch (step) {
            case 1: // Selección de Cargos
                const areAllSelected = unbilledCharges.length > 0 && selectedChargeIds.size === unbilledCharges.length;
                return (
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 mb-4">Seleccione los Cargos a Facturar</h3>
                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                            <div className="max-h-80 overflow-y-auto">
                                {unbilledCharges.length > 0 ? (
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                            <tr>
                                                <th scope="col" className="w-12 px-4 py-2.5">
                                                    <input type="checkbox"
                                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                        checked={areAllSelected}
                                                        onChange={handleSelectAll}
                                                        aria-label="Seleccionar todos los cargos"
                                                    />
                                                </th>
                                                <th scope="col" className="px-4 py-2.5 text-left font-medium text-slate-600">Concepto</th>
                                                <th scope="col" className="px-4 py-2.5 text-left font-medium text-slate-600">Fecha Emisión</th>
                                                <th scope="col" className="px-4 py-2.5 text-right font-medium text-slate-600">Monto (VES)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-slate-200">
                                        {unbilledCharges.map(charge => (
                                            <tr key={charge.id} className="hover:bg-slate-50 transition-colors duration-150">
                                                <td className="px-4 py-3"><input type="checkbox" checked={selectedChargeIds.has(charge.id)} onChange={() => handleChargeSelection(charge.id)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"/></td>
                                                <td className="px-4 py-3 text-slate-700">{charge.charge_concept?.name || 'N/A'}</td>
                                                <td className="px-4 py-3 text-slate-500">{formatDate(charge.issue_date)}</td>
                                                <td className="px-4 py-3 text-right text-slate-800">{formatCurrency(charge.amount_due_ves_at_emission)}</td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <p className="p-8 text-center text-slate-500">Este representante no tiene cargos pendientes de facturación.</p>
                                )}
                            </div>
                        </div>
                    </div>
                );
    
            case 2: // Revisión y Datos Fiscales
                return (
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 mb-4">Revise los Datos de la Factura</h3>
                        <div className="space-y-6">
                             <div className="border border-slate-200 p-4 rounded-lg bg-slate-50">
                                <h4 className="font-medium text-slate-700 mb-2">Ítems Seleccionados:</h4>
                                <ul className="text-sm space-y-1.5 max-h-40 overflow-y-auto pr-2">{selectedCharges.map(c => <li key={c.id} className="flex justify-between items-center"><span>{c.charge_concept?.name}</span><span className="text-slate-600">{formatCurrency(c.amount_due_ves_at_emission)}</span></li>)}</ul>
                            </div>
                            <fieldset>
                                <legend className="text-md font-medium text-slate-800 mb-3">Datos del Receptor</legend>
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="bill_to_name" className="block text-sm font-medium text-slate-700">Facturar a (Nombre/Razón Social)*</label>
                                        <input type="text" id="bill_to_name" name="bill_to_name" value={billingInfo.bill_to_name} onChange={handleBillingInfoChange} required className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"/>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div>
                                          <label htmlFor="bill_to_rif_or_cedula" className="block text-sm font-medium text-slate-700">RIF / Cédula*</label>
                                          <input type="text" id="bill_to_rif_or_cedula" name="bill_to_rif_or_cedula" value={billingInfo.bill_to_rif_or_cedula} onChange={handleBillingInfoChange} required className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"/>
                                      </div>
                                    </div>
                                    <div>
                                        <label htmlFor="bill_to_address" className="block text-sm font-medium text-slate-700">Dirección Fiscal*</label>
                                        <textarea id="bill_to_address" name="bill_to_address" value={billingInfo.bill_to_address} onChange={handleBillingInfoChange} required rows="3" className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"></textarea>
                                    </div>
                                </div>
                            </fieldset>
                        </div>
                    </div>
                );
    
            case 3: // Método de Emisión y Confirmación
                return (
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 mb-4">Confirme y Emita la Factura</h3>
                        <fieldset>
                            <legend className="text-md font-medium text-slate-800 mb-3">Método de Emisión</legend>
                            <div className="space-y-3">
                                {EMISSION_TYPES.map(type => {
                                    const isChecked = emissionDetails.emission_type === type.value;
                                    return (
                                        <div key={type.value}>
                                            <label htmlFor={`emission_${type.value}`} className={`relative flex items-start p-4 border rounded-lg cursor-pointer transition-all ${isChecked ? 'border-indigo-600 ring-2 ring-indigo-200 bg-indigo-50' : 'border-slate-300 hover:border-slate-400'}`}>
                                                <input id={`emission_${type.value}`} name="emission_type" type="radio" value={type.value} checked={isChecked} onChange={handleEmissionDetailsChange} className="absolute opacity-0 w-0 h-0 peer"/>
                                                <div className="flex-1 text-sm">
                                                    <p className="font-medium text-slate-800">{type.label}</p>
                                                    <p className="text-slate-500">{type.description}</p>
                                                </div>
                                                {isChecked && <CheckCircleIcon />}
                                            </label>
                                            {type.value === 'FORMA_LIBRE' && isChecked && (
                                                <div className="pl-4 pr-2 py-3 -mt-1 border-l border-r border-b border-indigo-600 rounded-b-lg bg-indigo-50">
                                                    <label htmlFor="manual_control_number" className="block text-sm font-medium text-indigo-800">Número de Control (Forma Libre)*</label>
                                                    <input type="text" id="manual_control_number" name="manual_control_number" value={emissionDetails.manual_control_number} onChange={handleEmissionDetailsChange} required className="mt-1 block w-full rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="Ej: 00-123456"/>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </fieldset>
                        {formError &&
                          <div className="mt-4 p-3 flex items-center rounded-md bg-red-50 text-sm text-red-700 border border-red-200">
                            <AlertTriangleIcon />
                            <span>{formError}</span>
                          </div>
                        }
                    </div>
                );
            default:
                return null;
        }
    };
    
    // --- Componente Principal ---
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Generar Factura para ${representative?.first_name || ''} ${representative?.last_name || ''}`.trim()}>
            {/* NUEVO: Indicador de Pasos */}
            <nav aria-label="Progress">
                <ol role="list" className="flex items-center mb-8">
                    {STEPS.map((s, index) => (
                        <li key={s.name} className={`relative ${index !== STEPS.length - 1 ? 'pr-8 sm:pr-20' : ''}`}>
                            {s.id < step ? (
                                <>
                                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                        <div className="h-0.5 w-full bg-indigo-600" />
                                    </div>
                                    <span className="relative flex h-8 w-8 items-center justify-center bg-indigo-600 rounded-full hover:bg-indigo-900 cursor-pointer" onClick={() => setStep(s.id)}>
                                        <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.052-.143z" clipRule="evenodd" /></svg>
                                    </span>
                                </>
                            ) : s.id === step ? (
                                <>
                                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                        <div className="h-0.5 w-full bg-slate-200" />
                                    </div>
                                    <span className="relative flex h-8 w-8 items-center justify-center bg-white border-2 border-indigo-600 rounded-full" aria-current="step">
                                        <span className="h-2.5 w-2.5 bg-indigo-600 rounded-full" aria-hidden="true" />
                                    </span>
                                </>
                            ) : (
                                <>
                                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                        <div className="h-0.5 w-full bg-slate-200" />
                                    </div>
                                    <span className="relative flex h-8 w-8 items-center justify-center bg-white border-2 border-slate-300 rounded-full"></span>
                                </>
                            )}
                        </li>
                    ))}
                </ol>
            </nav>
    
            <form onSubmit={handleSubmitInvoice} noValidate>
                <div className="min-h-[300px]">
                    {renderStepContent()}
                </div>
    
                {/* Resumen de Factura Rediseñado */}
                <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <h4 className="font-semibold text-slate-800 mb-3">Resumen de Factura</h4>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between items-baseline"><dt className="text-slate-600">Sub-Total:</dt><dd className="text-slate-900">{formatCurrency(invoiceTotals.subtotal)}</dd></div>
                        <div className="flex justify-between items-baseline"><dt className="text-slate-600">IVA ({invoiceTotals.subtotal > 0 ? (invoiceTotals.iva / invoiceTotals.subtotal * 100).toFixed(0) : '0'}%):</dt><dd className="text-slate-900">{formatCurrency(invoiceTotals.iva)}</dd></div>
                        <div className="flex justify-between items-baseline font-bold text-base border-t border-slate-300 pt-2 mt-2">
                            <dt className="text-slate-800">TOTAL A PAGAR:</dt>
                            <dd className="text-indigo-600">{formatCurrency(invoiceTotals.total)}</dd>
                        </div>
                    </dl>
                </div>
    
                {/* Botones de Acción Rediseñados */}
                <div className="pt-6 mt-4 flex justify-between items-center border-t border-slate-200">
                    <div>
                        {step > 1 && <button type="button" onClick={handlePrevStep} className="inline-flex justify-center py-2 px-4 border border-slate-300 rounded-md shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Atrás</button>}
                    </div>
                    <div>
                        {step < 3 && <button type="button" onClick={handleNextStep} disabled={selectedChargeIds.size === 0} className="inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">Siguiente</button>}
                        {step === 3 && <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isSubmitting ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    Emitiendo...
                                </>
                            ) : 'Confirmar y Emitir Factura'}
                        </button>}
                    </div>
                </div>
            </form>
        </Modal>
    );
    }
    
    export default CreateInvoiceModal;