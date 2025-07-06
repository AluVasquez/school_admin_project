// src/pages/CreditNoteDetailsPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getCreditNoteById } from '../services/apiCreditNotes';
import { toast } from 'react-toastify';
import html2pdf from 'html2pdf.js';

// --- Helpers ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString + 'T00:00:00Z').toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return 'Bs. 0,00';
    return `Bs. ${parseFloat(amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function CreditNoteDetailsPage() {
    const { creditNoteId } = useParams();
    const { token } = useAuth();
    
    const [creditNote, setCreditNote] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchCreditNote = useCallback(async () => {
        if (!token || !creditNoteId) return;
        setIsLoading(true);
        try {
            const data = await getCreditNoteById(token, creditNoteId);
            setCreditNote(data);
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar la nota de crédito: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, creditNoteId]);

    useEffect(() => {
        fetchCreditNote();
    }, [fetchCreditNote]);
    
    const handleDownloadPdf = () => {
        const element = document.getElementById('cn-to-print');
        const opt = {
            margin:       0.5,
            filename:     `NotaCredito_${creditNote.credit_note_number}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        toast.info("Generando PDF...");
        html2pdf().set(opt).from(element).save();
    };


    if (isLoading) return <div className="p-6 text-center">Cargando nota de crédito...</div>;
    if (error) return <div className="p-6 text-center text-red-500">Error: {error}</div>;
    if (!creditNote) return <div className="p-6 text-center">No se encontró la nota de crédito.</div>;

    return (
        <div className="bg-gray-100 min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="mb-6 flex justify-between items-center">
                    <Link to="/credit-notes" className="text-sm text-indigo-600 hover:text-indigo-800">&larr; Volver al Listado</Link>
                    <button onClick={handleDownloadPdf} className="btn-secondary text-sm">Descargar PDF</button>
                </div>

                <div id="cn-to-print" className="bg-white p-8 shadow-lg rounded-lg">
                    <header className="flex justify-between items-start pb-6 border-b-2 border-gray-200">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-800">{creditNote.school_name_snapshot || 'Nombre Escuela'}</h1>
                            <p className="text-sm text-gray-600">RIF: {creditNote.school_rif_snapshot}</p>
                        </div>
                        <div className="text-right">
                            <h2 className="text-3xl font-bold text-red-600 uppercase">Nota de Crédito</h2>
                            <p className="text-sm text-gray-600">Nro. {creditNote.credit_note_number}</p>
                        </div>
                    </header>

                    <section className="grid grid-cols-2 gap-4 mt-6">
                        <div className="text-sm">
                            <h3 className="font-semibold text-gray-500 uppercase mb-2">Cliente:</h3>
                            <p className="font-bold text-gray-800">{creditNote.representative.first_name} {creditNote.representative.last_name}</p>
                            <p className="text-gray-600">RIF/CI: {creditNote.representative_rif_or_cedula_snapshot}</p>
                        </div>
                        <div className="text-right text-sm">
                            <p><span className="font-semibold text-gray-500">Fecha de Emisión: </span>{formatDate(creditNote.issue_date)}</p>
                        </div>
                    </section>
                    
                    <section className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
                        <p><strong className="font-semibold text-yellow-800">Factura Afectada:</strong> <Link to={`/invoices/${creditNote.original_invoice_id}`} className="text-indigo-600 hover:underline">{creditNote.original_invoice_number_snapshot}</Link></p>
                        <p><strong className="font-semibold text-yellow-800">Nro. Control Factura:</strong> {creditNote.original_invoice_control_number_snapshot || 'N/A'}</p>
                        <p className="mt-2"><strong className="font-semibold text-yellow-800">Motivo:</strong> {creditNote.reason}</p>
                    </section>

                    <section className="mt-8">
                        <table className="w-full text-left">
                           <thead className="bg-gray-50"><tr><th className="p-3 text-sm font-semibold uppercase">Descripción</th><th className="p-3 text-sm font-semibold uppercase text-right">Monto (VES)</th></tr></thead>
                            <tbody>
                                {creditNote.items.map(item => (
                                    <tr key={item.id} className="border-b border-gray-100">
                                        <td className="p-3 text-sm">{item.description}</td>
                                        <td className="p-3 text-sm text-right">{formatCurrency(item.item_total_ves)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                     <section className="flex justify-end mt-8">
                        <div className="w-full max-w-xs text-sm">
                            <div className="flex justify-between py-3 bg-red-100 px-3 rounded mt-2">
                                <span className="font-bold text-red-800 text-base">TOTAL ACREDITADO:</span>
                                <span className="font-bold text-red-800 text-base">{formatCurrency(creditNote.total_credited_ves)}</span>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

export default CreditNoteDetailsPage;