// frontend/school-admin-react/src/pages/PayrollCostReportPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getPayrollCostReport } from '../services/apiPersonnel';
import { toast } from 'react-toastify';
import { ArrowLeftIcon, PrinterIcon, BanknotesIcon, PlusIcon, ArrowDownTrayIcon as DownloadIcon } from '@heroicons/react/24/solid';
import { exportToXLSX } from '../utils/exportUtils'; // Reutilizaremos la función de exportación

// --- Helpers ---
const formatCurrency = (amount, currency = 'VES') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    return parseFloat(amount).toLocaleString('es-VE', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// --- Componente de Tarjeta de Resumen ---
const SummaryCard = ({ title, value, icon, bgColorClass }) => (
    <div className={`p-5 rounded-xl shadow-lg flex items-start space-x-4 ${bgColorClass}`}>
        <div className="bg-white/30 p-3 rounded-lg">
            {React.cloneElement(icon, { className: "w-6 h-6 text-white" })}
        </div>
        <div className="flex-1">
            <h3 className="text-sm font-medium text-white/90 truncate">{title}</h3>
            <p className="text-2xl font-bold text-white break-words">{value}</p>
        </div>
    </div>
);

// --- Componente Principal de la Página ---
function PayrollCostReportPage() {
    const { runId } = useParams();
    const { token } = useAuth();
    const [reportData, setReportData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchReport = useCallback(async () => {
        if (!token || !runId) return;
        setIsLoading(true);
        try {
            const data = await getPayrollCostReport(token, runId);
            setReportData(data);
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar el reporte: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, runId]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);
    
    const handleExportExcel = () => {
        if (!reportData || !reportData.details || reportData.details.length === 0) {
            toast.info("No hay datos detallados para exportar.");
            return;
        }

        const headers = [
            { key: 'employee_id', label: 'ID Empleado' },
            { key: 'employee_full_name', label: 'Nombre Completo' },
            { key: 'base_salary_ves', label: 'Salario Base (Bs.S)' },
            { key: 'total_earnings_ves', label: 'Total Asignaciones (Bs.S)' },
            { key: 'total_deductions_ves', label: 'Total Deducciones (Bs.S)' },
            { key: 'net_pay_ves', label: 'Neto a Pagar (Bs.S)' },
        ];
        
        const filename = `Reporte_Costo_Nomina_${reportData.payroll_run_name.replace(/ /g, '_')}.xlsx`;
        exportToXLSX(reportData.details, headers, filename, "Detalle de Costos");
        toast.success("Reporte exportado a Excel exitosamente.");
    };

    const handlePrint = () => window.print();

    if (isLoading) return <div className="p-8 text-center text-lg font-semibold">Cargando reporte...</div>;
    if (error) return <div className="p-8 text-center text-red-600 bg-red-50 rounded-lg">Error al cargar el reporte: {error}</div>;
    if (!reportData) return <div className="p-8 text-center">No se encontraron datos para este reporte de nómina.</div>;

    const { details = [], ...summary } = reportData;

    return (
        <div className="bg-slate-50 min-h-screen">
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    .printable-area, .printable-area * { visibility: visible; }
                    .printable-area { position: absolute; left: 0; top: 0; width: 100%; padding: 2rem; }
                    .no-print { display: none; }
                }
            `}</style>
            
            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                <header className="no-print mb-8">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        <div>
                            <h1 className="text-3xl font-extrabold text-slate-800">Reporte de Costo de Nómina</h1>
                            <p className="text-lg text-slate-600 mt-1">{summary.payroll_run_name}</p>
                        </div>
                        <div className="flex items-center space-x-3">
                            <Link to="/personnel/payroll-runs" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center">
                                <ArrowLeftIcon /> Volver
                            </Link>
                            <button onClick={handlePrint} className="btn-secondary-xs py-2 px-3 flex items-center"><PrinterIcon className="w-5 h-5 mr-2"/>Imprimir</button>
                            <button onClick={handleExportExcel} className="btn-primary-xs py-2 px-3 flex items-center"><DownloadIcon className="w-5 h-5 mr-2"/>Exportar a Excel</button>
                        </div>
                    </div>
                </header>

                <div className="printable-area space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <SummaryCard title="Salario Base Total" value={formatCurrency(summary.total_base_salary_ves)} icon={<BanknotesIcon />} bgColorClass="bg-gradient-to-br from-blue-400 to-blue-600"/>
                        <SummaryCard title="Total Asignaciones" value={formatCurrency(summary.total_earnings_ves - summary.total_base_salary_ves)} icon={<PlusIcon />} bgColorClass="bg-gradient-to-br from-green-400 to-green-600"/>
                        <SummaryCard title="Total Deducciones" value={formatCurrency(summary.total_deductions_ves)} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" /></svg>} bgColorClass="bg-gradient-to-br from-red-400 to-red-600"/>
                        <SummaryCard title="Costo Neto Total (Pago)" value={formatCurrency(summary.total_net_pay_ves)} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 8h6m-5 4h.01M4 16.5V7.5a2.5 2.5 0 012.5-2.5h11A2.5 2.5 0 0120 7.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 16.5z" /></svg>} bgColorClass="bg-gradient-to-br from-indigo-500 to-purple-600"/>
                    </div>
                     <div className="bg-white p-6 rounded-xl shadow-lg">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">Desglose por Empleado ({summary.employee_count} en total)</h2>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-100">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Empleado</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">Salario Base</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">Asignaciones</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">Deducciones</th>
                                        <th className="px-4 py-3 text-right font-bold text-slate-700">Neto Pagado</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {details.map(item => (
                                        <tr key={item.employee_id}>
                                            <td className="px-4 py-3 font-medium text-slate-800">{item.employee_full_name}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatCurrency(item.base_salary_ves)}</td>
                                            <td className="px-4 py-3 text-right font-mono text-green-600">{formatCurrency(item.total_earnings_ves - item.base_salary_ves)}</td>
                                            <td className="px-4 py-3 text-right font-mono text-red-600">{formatCurrency(item.total_deductions_ves)}</td>
                                            <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700">{formatCurrency(item.net_pay_ves)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default PayrollCostReportPage;