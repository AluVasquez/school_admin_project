// frontend/school-admin-react/src/pages/PayslipDetailPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getPayslipById } from '../services/apiPayslips';
import { toast } from 'react-toastify';
import html2pdf from 'html2pdf.js';

// --- Iconos para la UI ---
const ArrowLeftIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
const PrinterIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M5 2.5a2.5 2.5 0 00-2.5 2.5v9.5A2.5 2.5 0 005 17h10a2.5 2.5 0 002.5-2.5V5A2.5 2.5 0 0015 2.5H5zM4.75 5a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 014.75 5zm0 2.5a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5a.75.75 0 01-.75-.75zM4.75 10a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg>;
const ArrowDownTrayIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" {...props}><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" /><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" /></svg>;

// --- Helpers ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString + 'T00:00:00Z').toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatCurrency = (amount, currency = 'VES') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    return parseFloat(amount).toLocaleString('es-VE', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function PayslipDetailPage() {
    const { payslipId } = useParams();
    const { token } = useAuth();
    const [payslip, setPayslip] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchPayslipDetails = useCallback(async () => {
        if (!token || !payslipId) return;
        setIsLoading(true);
        try {
            const data = await getPayslipById(token, payslipId);
            setPayslip(data);
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar el recibo de pago: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, payslipId]);

    useEffect(() => {
        fetchPayslipDetails();
    }, [fetchPayslipDetails]);

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPdf = () => {
        const element = document.getElementById('payslip-to-print');
        const opt = {
            margin:       0.5,
            filename:     `Recibo_Pago_${payslip.employee_full_name_snapshot}_${payslip.payment_date_snapshot}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        toast.info("Generando PDF...");
        html2pdf().set(opt).from(element).save();
    };

    if (isLoading) return <div className="p-8 text-center">Cargando recibo de pago...</div>;
    if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;
    if (!payslip) return <div className="p-8 text-center">No se encontró el recibo de pago.</div>;
    
    // El backend ya nos devuelve el JSON parseado
    const breakdown = Array.isArray(payslip.payment_breakdown_json) ? payslip.payment_breakdown_json : [];
    const earnings = breakdown.filter(item => item.type === 'earning');
    const deductions = breakdown.filter(item => item.type === 'deduction');

    return (
        <div className="bg-slate-100 min-h-screen p-4 sm:p-6 lg:p-8">
            <style>{`
                @media print {
                    body * { visibility: hidden !important; }
                    #payslip-to-print, #payslip-to-print * { visibility: visible !important; }
                    #payslip-to-print { 
                        position: absolute !important; left: 0 !important; top: 0 !important; 
                        margin: 0 !important; padding: 0.5in !important; width: 100% !important; 
                        border: none !important; box-shadow: none !important;
                    }
                    .no-print { display: none !important; }
                }
            `}</style>

            <div className="max-w-4xl mx-auto">
                <div className="no-print mb-6 flex justify-between items-center">
                    <Link to="/personnel/payslips" className="flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                        <ArrowLeftIcon /> Volver al Historial
                    </Link>
                    <div className="flex items-center space-x-3">
                        <button onClick={handlePrint} className="inline-flex items-center px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all"><PrinterIcon className="h-5 w-5 mr-2" /> Imprimir</button>
                        <button onClick={handleDownloadPdf} className="inline-flex items-center gap-x-2 px-3 py-2 font-semibold text-sm text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none"><ArrowDownTrayIcon className="h-5 w-5 mr-2" /> Descargar PDF</button>
                    </div>
                </div>

                <div id="payslip-to-print" className="bg-white p-8 sm:p-10 lg:p-12 shadow-lg rounded-lg font-sans">
                    <header className="flex justify-between items-start pb-6 mb-8 border-b-2 border-slate-200">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-800">{payslip.school_name_snapshot}</h1>
                            <p className="text-sm text-slate-600">RIF: {payslip.school_rif_snapshot}</p>
                        </div>
                        <div className="text-right">
                            <h2 className="text-2xl font-bold text-slate-500 uppercase tracking-wider">Recibo de Pago</h2>
                            <p className="text-sm text-slate-600 mt-1">Recibo Nro. <span className="font-semibold">{payslip.id}</span></p>
                        </div>
                    </header>

                    <section className="grid grid-cols-2 gap-8 mb-8 text-sm">
                        <div>
                            <h3 className="font-semibold text-slate-400 uppercase text-xs mb-2">Empleado</h3>
                            <p className="font-bold text-slate-800 text-base">{payslip.employee_full_name_snapshot}</p>
                            <p className="text-slate-600">C.I: {payslip.employee_identity_document_snapshot}</p>
                            <p className="text-slate-600">Cargo: {payslip.employee_position_snapshot || 'N/A'}</p>
                            <p className="text-slate-600">Departamento: {payslip.employee_department_snapshot || 'N/A'}</p>
                        </div>
                        <div className="text-right">
                            <h3 className="font-semibold text-slate-400 uppercase text-xs mb-2">Detalles del Pago</h3>
                            <p><strong className="text-slate-600">Fecha de Pago:</strong> {formatDate(payslip.payment_date_snapshot)}</p>
                            {payslip.period_start_date && <p><strong className="text-slate-600">Período:</strong> {formatDate(payslip.period_start_date)} al {formatDate(payslip.period_end_date)}</p>}
                        </div>
                    </section>

                    <section>
                        <div className="grid grid-cols-2 gap-8">
                            {/* Columna de Asignaciones */}
                            <div>
                                <h3 className="font-semibold text-slate-800 border-b-2 border-slate-200 pb-2 mb-2">Asignaciones</h3>
                                {earnings.length > 0 ? earnings.map((item, index) => (
                                    <div key={`earning-${index}`} className="flex justify-between items-center py-1.5 text-sm">
                                        <span className="text-slate-700">{item.name}</span>
                                        <span className="font-mono text-slate-800">{formatCurrency(item.amount_ves)}</span>
                                    </div>
                                )) : <p className="text-sm text-slate-500 italic">No hay asignaciones.</p>}
                            </div>
                             {/* Columna de Deducciones */}
                            <div>
                                <h3 className="font-semibold text-slate-800 border-b-2 border-slate-200 pb-2 mb-2">Deducciones</h3>
                                {deductions.length > 0 ? deductions.map((item, index) => (
                                    <div key={`deduction-${index}`} className="flex justify-between items-center py-1.5 text-sm">
                                        <span className="text-slate-700">{item.name}</span>
                                        <span className="font-mono text-red-600">({formatCurrency(item.amount_ves)})</span>
                                    </div>
                                )) : <p className="text-sm text-slate-500 italic">No hay deducciones.</p>}
                            </div>
                        </div>
                    </section>

                    <section className="mt-8 pt-4 border-t-2 border-slate-300">
                        <div className="grid grid-cols-2 gap-8 text-sm">
                             {/* Columna de Totales */}
                            <div className="space-y-2">
                                <div className="flex justify-between"><strong className="text-slate-600">Total Asignaciones:</strong><span className="font-semibold font-mono">{formatCurrency(payslip.total_earnings_ves)}</span></div>
                                <div className="flex justify-between"><strong className="text-slate-600">Total Deducciones:</strong><span className="font-semibold font-mono">{formatCurrency(payslip.total_deductions_ves)}</span></div>
                            </div>
                             {/* Total Neto */}
                            <div className="bg-slate-100 p-4 rounded-lg text-right">
                                <p className="text-sm font-bold text-slate-600 uppercase">Neto Pagado</p>
                                <p className="text-2xl font-extrabold text-slate-800">{formatCurrency(payslip.net_pay_ves)}</p>
                            </div>
                        </div>
                    </section>

                    <footer className="mt-20 text-center">
                        <div className="inline-block border-t-2 border-slate-300 px-10 pt-2">
                            <p className="text-sm font-semibold">{payslip.employee_full_name_snapshot}</p>
                            <p className="text-xs text-slate-500">Firma del Empleado</p>
                        </div>
                    </footer>
                </div>
            </div>
        </div>
    );
}

export default PayslipDetailPage;