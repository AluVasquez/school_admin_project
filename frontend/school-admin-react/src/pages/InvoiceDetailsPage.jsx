// src/pages/InvoiceDetailsPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getInvoiceById } from '../services/apiInvoices';
import { createCreditNote } from '../services/apiCreditNotes';
import { toast } from 'react-toastify';
import html2pdf from 'html2pdf.js';
import Modal from '../components/Modal';

// --- Iconos para la UI ---
const ArrowLeftIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
const PrinterIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>;
const DownloadIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;
const DocumentRemoveIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6M12 17l-4-4m0 0l4-4m-4 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
const DocumentReportIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;


// --- Helpers y Lógica del Componente (SIN CAMBIOS) ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString + 'T00:00:00Z').toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return 'Bs. 0,00';
    return `Bs. ${parseFloat(amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const INVOICE_STATUS_STYLES = {
    emitted: { label: 'Emitida', color: 'bg-green-100 text-green-800', badgeColor: 'bg-green-500' },
    annulled: { label: 'Anulada', color: 'bg-red-100 text-red-800', badgeColor: 'bg-red-500' },
    pending_emission: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', badgeColor: 'bg-yellow-500' },
    error: { label: 'Error', color: 'bg-orange-100 text-orange-800', badgeColor: 'bg-orange-500' },
};

function InvoiceDetailsPage() {
    const { invoiceId } = useParams();
    const { token } = useAuth();
    const navigate = useNavigate();
    const [invoice, setInvoice] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isCreditNoteModalOpen, setIsCreditNoteModalOpen] = useState(false);
    const [creditNoteReason, setCreditNoteReason] = useState('');
    const [isSubmittingCreditNote, setIsSubmittingCreditNote] = useState(false);

    const fetchInvoice = useCallback(async () => {
        if (!token || !invoiceId) return;
        setIsLoading(true); setError(null);
        try {
            const data = await getInvoiceById(token, invoiceId);
            setInvoice(data);
        } catch (err) {
            setError(err.message); toast.error(`Error al cargar la factura: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, invoiceId]);

    useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

    const handlePrint = () => window.print();
    const handleDownloadPdf = () => {
        const element = document.getElementById('invoice-to-print');
        const opt = { margin: 0.5, filename: `Factura_${invoice.invoice_number}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
        toast.info("Generando PDF...");
        html2pdf().set(opt).from(element).save();
    };
    const handleOpenCreditNoteModal = () => { setCreditNoteReason(''); setIsCreditNoteModalOpen(true); };
    const handleSubmitCreditNote = async (e) => {
        e.preventDefault();
        if (!creditNoteReason.trim() || creditNoteReason.length < 10) { toast.warn("Debe proporcionar una razón detallada (mínimo 10 caracteres)."); return; }
        setIsSubmittingCreditNote(true);
        try {
            const payload = { original_invoice_id: invoice.id, reason: creditNoteReason };
            const newCreditNote = await createCreditNote(token, payload);
            toast.success(`Nota de Crédito #${newCreditNote.credit_note_number} creada. La factura ha sido anulada.`);
            setIsCreditNoteModalOpen(false);
            fetchInvoice();
        } catch (err) {
            toast.error(`Error al emitir Nota de Crédito: ${err.message}`);
        } finally {
            setIsSubmittingCreditNote(false);
        }
    };

    if (isLoading) return <div className="p-8 text-center text-xl font-semibold text-slate-700">Cargando factura...</div>;
    if (error) return <div className="p-8 text-center text-xl font-semibold text-red-600">Error: {error}</div>;
    if (!invoice) return <div className="p-8 text-center text-xl font-semibold text-slate-700">No se encontró la factura.</div>;

    const statusInfo = INVOICE_STATUS_STYLES[invoice.status] || { label: invoice.status, color: 'bg-gray-100 text-gray-800', badgeColor: 'bg-gray-500' };
    
    // --- JSX Refactorizado ---
    return (
        <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
            <style>{`@media print { body * { visibility: hidden; } #invoice-to-print, #invoice-to-print * { visibility: visible; } #invoice-to-print { position: absolute; left: 0; top: 0; margin: 0; padding: 0.5in; width: 100%; } .no-print { display: none; } }`}</style>
            
            <div className="max-w-5xl mx-auto">
                {/* --- BARRA DE ACCIONES SUPERIOR --- */}
                <div className="no-print mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
                    <Link to="/invoices" className="inline-flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                        <ArrowLeftIcon /> Volver al Listado
                    </Link>
                    <div className="flex flex-wrap items-center gap-3">
                        <button onClick={handlePrint} className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 transition-colors"><PrinterIcon /> Imprimir</button>
                        <button onClick={handleDownloadPdf} className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 transition-colors"><DownloadIcon /> Descargar</button>
                        {invoice.credit_note_id && <Link to={`/credit-notes/${invoice.credit_note_id}`} className="inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-md transition-all"><DocumentReportIcon /> Ver N/C</Link>}
                        {invoice.status === 'emitted' && <button onClick={handleOpenCreditNoteModal} className="inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-md transition-all"><DocumentRemoveIcon /> Anular (Emitir N/C)</button>}
                    </div>
                </div>

                {/* --- CONTENEDOR DE LA FACTURA --- */}
                <div id="invoice-to-print" className="bg-white p-8 sm:p-10 lg:p-12 shadow-2xl shadow-slate-300/40 rounded-xl relative">
                    {invoice.status === 'annulled' && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                            <div className="border-8 border-red-500/30 rounded-lg p-8 transform -rotate-15">
                                <h1 className="text-8xl md:text-9xl font-black text-red-500/30 tracking-widest">ANULADA</h1>
                            </div>
                        </div>
                    )}
                    
                    {/* Encabezado de la Factura */}
                    <header className="flex justify-between items-start pb-6 mb-8 border-b-2 border-slate-200">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800">{invoice.school_name_snapshot}</h1>
                            <p className="text-sm text-slate-500">RIF: {invoice.school_rif_snapshot}</p>
                            <p className="text-sm text-slate-500 max-w-xs">{invoice.school_address_snapshot}</p>
                            <p className="text-sm text-slate-500">Teléfono: {invoice.school_phone_snapshot}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <h2 className="text-4xl sm:text-4xl font-extrabold text-slate-800 tracking-widest uppercase">FACTURA</h2>
                            <p className="text-sm text-slate-600 mt-1">Nro. <span className="font-semibold">{invoice.fiscal_invoice_number || invoice.invoice_number}</span></p>
                        </div>
                    </header>

                    {/* Detalles del Cliente y Factura */}
                    <section className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-10">
                        <div className="text-sm">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Facturar a</h3>
                            <p className="font-bold text-slate-700 text-base">{invoice.representative_name_snapshot}</p>
                            <p className="text-slate-500">RIF/CI: {invoice.representative_rif_or_cedula_snapshot}</p>
                            <p className="text-slate-500">{invoice.representative_address_snapshot}</p>
                        </div>
                        <div className="text-sm sm:text-right">
                            <div className="mb-2"><span className="font-semibold text-slate-500">Nro. Control: </span><span className="font-medium text-slate-700">{invoice.fiscal_control_number || 'N/A'}</span></div>
                            <div><span className="font-semibold text-slate-500">Fecha de Emisión: </span><span className="font-medium text-slate-700">{formatDate(invoice.issue_date)}</span></div>
                            <div className="mt-4"><span className={`text-white text-xs font-bold uppercase px-3 py-1.5 rounded-full ${statusInfo.badgeColor}`}>{statusInfo.label}</span></div>
                        </div>
                    </section>

                    {/* Tabla de Items */}
                    <section className="mb-10">
                        <table className="w-full text-left">
                            <thead className="border-b border-slate-300"><tr className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                <th className="p-3">Descripción</th>
                                <th className="p-3 text-right">Cant.</th>
                                <th className="p-3 text-right">Precio Unitario</th>
                                <th className="p-3 text-right">Sub-total</th>
                            </tr></thead>
                            <tbody>{invoice.items.map(item => (
                                <tr key={item.id} className="border-b border-slate-100"><td className="p-3 text-sm text-slate-800 font-medium">{item.description}</td><td className="p-3 text-sm text-slate-600 text-right">{item.quantity}</td><td className="p-3 text-sm text-slate-600 text-right">{formatCurrency(item.unit_price_ves)}</td><td className="p-3 text-sm text-slate-600 text-right">{formatCurrency(item.item_subtotal_ves)}</td></tr>
                            ))}</tbody>
                        </table>
                    </section>
                    
                    {/* Sección de Totales */}
                    <section className="flex justify-end mb-8">
                        <div className="w-full max-w-sm text-sm">
                            <div className="flex justify-between py-2 border-b border-slate-200"><span className="font-medium text-slate-600">Sub-Total:</span><span className="font-medium text-slate-800">{formatCurrency(invoice.subtotal_ves)}</span></div>
                            <div className="flex justify-between py-2 border-b border-slate-200"><span className="font-medium text-slate-600">IVA ({invoice.total_iva_ves > 0 ? '16%' : '0%'}):</span><span className="font-medium text-slate-800">{formatCurrency(invoice.total_iva_ves)}</span></div>
                            <div className="flex justify-between py-3 bg-slate-100 px-4 rounded-lg mt-2"><span className="font-bold text-slate-800 text-base">TOTAL:</span><span className="font-extrabold text-slate-900 text-lg">{formatCurrency(invoice.total_amount_ves)}</span></div>
                        </div>
                    </section>
                    
                    {/* Footer con Notas */}
                    {invoice.notes && (
                        <footer className="mt-8 pt-6 border-t border-slate-200 text-xs text-slate-500">
                            <h4 className="font-semibold mb-1 text-slate-600">Notas:</h4>
                            <p className="whitespace-pre-wrap">{invoice.notes}</p>
                        </footer>
                    )}
                </div>
            </div>

            {/* Modal para Nota de Crédito */}
            <Modal isOpen={isCreditNoteModalOpen} onClose={() => setIsCreditNoteModalOpen(false)} title={`Emitir Nota de Crédito para Factura #${invoice.invoice_number}`}>
                <form onSubmit={handleSubmitCreditNote}>
                    <p className="mb-4 text-sm text-slate-600">Está a punto de anular esta factura y generar una nota de crédito por <strong className="font-semibold text-slate-800">{formatCurrency(invoice.total_amount_ves)}</strong>. Este monto se añadirá como saldo a favor para el representante.</p>
                    <div className="mb-4">
                        <label htmlFor="creditNoteReason" className="label-style">Razón de la Emisión*</label>
                        <textarea id="creditNoteReason" value={creditNoteReason} onChange={(e) => setCreditNoteReason(e.target.value)} required minLength="10" rows="3" className="input-style" placeholder="Ej: Anulación por error en los servicios cobrados..."></textarea>
                        <p className="text-xs text-slate-500 mt-1">Por favor, sea explícito. Mínimo 10 caracteres.</p>
                    </div>
                    <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                        <button type="button" onClick={() => setIsCreditNoteModalOpen(false)} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancelar</button>
                        <button type="submit" disabled={isSubmittingCreditNote} className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-md disabled:bg-red-400 disabled:cursor-wait">{isSubmittingCreditNote ? 'Procesando...' : 'Confirmar y Emitir'}</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default InvoiceDetailsPage;