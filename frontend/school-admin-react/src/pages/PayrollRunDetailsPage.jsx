import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getPayrollRunById } from '../services/apiPersonnel';
import { toast } from 'react-toastify';
import Modal from '../components/Modal'; // Para mostrar el desglose de componentes

// Constantes (puedes moverlas a un archivo utils si se repiten)
const PAY_FREQUENCIES = [
    { value: "monthly", label: "Mensual" },
    { value: "fortnightly", label: "Quincenal" },
    { value: "hourly", label: "Por Hora" },
];
const PAYROLL_RUN_STATUSES = [
    { value: "draft", label: "Borrador" },
    { value: "confirmed", label: "Confirmada (Aplicada a Saldos)" },
    { value: "paid_out", label: "Pagada" },
    { value: "cancelled", label: "Cancelada" },
];

const formatCurrency = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD' && locale === 'es-VE') locale = 'en-US'; // Usar formato USD para en-US
    return parseFloat(amount).toLocaleString(locale, options);
};

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-VE', {day: '2-digit', month: '2-digit', year: 'numeric'});
};

const formatDateTime = (dateTimeString) => {
    if (!dateTimeString) return 'N/A';
    return new Date(dateTimeString).toLocaleString('es-VE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
};


function PayrollRunDetailsPage() {
    const { runId } = useParams(); // Obtiene el ID de la corrida de la URL
    const { token } = useAuth();
    const [payrollRun, setPayrollRun] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const [showComponentsModal, setShowComponentsModal] = useState(false);
    const [selectedEmployeeComponents, setSelectedEmployeeComponents] = useState([]);
    const [selectedEmployeeName, setSelectedEmployeeName] = useState('');

    const fetchPayrollRunDetails = useCallback(async () => {
        if (!token || !runId) return;
        setIsLoading(true); setError(null);
        try {
            const data = await getPayrollRunById(token, runId);
            setPayrollRun(data);
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar detalles de la corrida: ${err.message}`);
            setPayrollRun(null);
        } finally {
            setIsLoading(false);
        }
    }, [token, runId]);

    useEffect(() => {
        fetchPayrollRunDetails();
    }, [fetchPayrollRunDetails]);

    const handleShowComponents = (employeeDetail) => {
        try {
            const components = employeeDetail.applied_components_details_json 
                ? JSON.parse(employeeDetail.applied_components_details_json) 
                : [];
            setSelectedEmployeeComponents(components);
            setSelectedEmployeeName(employeeDetail.employee?.full_name || `Empleado ID ${employeeDetail.employee?.id}`);
            setShowComponentsModal(true);
        } catch (e) {
            console.error("Error parseando JSON de componentes aplicados:", e);
            toast.error("No se pudo mostrar el desglose de componentes.");
            setSelectedEmployeeComponents([]);
        }
    };

    if (isLoading) {
        return <div className="p-6"><h1 className="text-2xl font-bold mb-6">Detalles de Corrida de Nómina</h1><p>Cargando detalles...</p></div>;
    }
    if (error) {
        return <div className="p-6"><h1 className="text-2xl font-bold mb-6">Detalles de Corrida de Nómina</h1><p className="text-red-500 bg-red-100 p-3 rounded">Error: {error}</p></div>;
    }
    if (!payrollRun) {
        return <div className="p-6"><h1 className="text-2xl font-bold mb-6">Detalles de Corrida de Nómina</h1><p>No se encontró la corrida de nómina.</p></div>;
    }

    const { name, period_start_date, period_end_date, pay_frequency_covered, exchange_rate_usd_ves, status, processed_by_user, processed_at, employee_details = [] } = payrollRun;

    return (
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 pb-3 border-b">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
                    Detalle Nómina: <span className="text-indigo-600">{name}</span>
                </h1>
                <Link to="/personnel/payroll-runs" className="text-sm text-indigo-600 hover:text-indigo-800 mt-2 sm:mt-0">
                    &larr; Volver a Procesos de Nómina
                </Link>
            </div>

            <div className="bg-white shadow-lg rounded-lg p-6 mb-8 text-sm">
                <h2 className="text-lg font-semibold text-gray-700 mb-3 border-b pb-2">Información General del Proceso</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                    <p><strong>ID Proceso:</strong> {payrollRun.id}</p>
                    <p><strong>Período:</strong> {formatDate(period_start_date)} - {formatDate(period_end_date)}</p>
                    <p><strong>Frecuencia Cubierta:</strong> {PAY_FREQUENCIES.find(f => f.value === pay_frequency_covered)?.label || pay_frequency_covered}</p>
                    <p><strong>Estado:</strong> 
                        <span className={`ml-1 px-2 py-0.5 font-medium rounded-full text-xs ${status === 'draft' ? 'bg-yellow-100 text-yellow-700' : status === 'confirmed' ? 'bg-green-100 text-green-700' : status === 'paid_out' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                            {PAYROLL_RUN_STATUSES.find(s => s.value === status)?.label || status}
                        </span>
                    </p>
                    <p><strong>Tasa USD-VES Usada:</strong> {exchange_rate_usd_ves ? `${parseFloat(exchange_rate_usd_ves).toFixed(2)} VES` : 'N/A (o solo VES)'}</p>
                    <p><strong>Procesado por:</strong> {processed_by_user?.full_name || processed_by_user?.email || 'N/A'}</p>
                    <p><strong>Fecha Procesamiento:</strong> {formatDateTime(processed_at) || 'N/A'}</p>
                    <p><strong>Empleados Incluidos:</strong> {employee_details.length}</p>
                    <p className="md:col-span-2 lg:col-span-3"><strong>Notas del Proceso:</strong> <span className="text-gray-600">{payrollRun.processing_notes || '-'}</span></p>
                </div>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <h2 className="text-lg font-semibold text-gray-700 p-4 border-b">Detalle por Empleado</h2>
                {employee_details.length > 0 ? (
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">Empleado</th>
                                <th className="px-3 py-2 text-left font-semibold">Documento ID</th>
                                <th className="px-3 py-2 text-right font-semibold">Salario Base (VES)</th>
                                <th className="px-3 py-2 text-right font-semibold">Total Asignaciones (VES)</th>
                                <th className="px-3 py-2 text-right font-semibold">Total Deducciones (VES)</th>
                                <th className="px-3 py-2 text-right font-bold text-indigo-700">NETO A PAGAR (VES)</th>
                                {payrollRun.pay_frequency_covered === 'hourly' && <th className="px-3 py-2 text-right font-semibold">Horas Proc.</th>}
                                <th className="px-3 py-2 text-center font-semibold">Componentes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {employee_details.map(detail => (
                                <tr key={detail.employee.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 whitespace-nowrap">{detail.employee.full_name}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{detail.employee.identity_document || '-'}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(detail.base_salary_amount_period_ves)}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(detail.total_earnings_ves)}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(detail.total_deductions_ves)}</td>
                                    <td className="px-3 py-2 text-right font-bold text-indigo-600">{formatCurrency(detail.net_amount_to_pay_ves)}</td>
                                    {payrollRun.pay_frequency_covered === 'hourly' && <td className="px-3 py-2 text-right">{detail.accumulated_hours_processed !== null ? parseFloat(detail.accumulated_hours_processed).toFixed(2) : '-'}</td>}
                                    <td className="px-3 py-2 text-center">
                                        <button 
                                            onClick={() => handleShowComponents(detail)}
                                            className="text-blue-500 hover:text-blue-700 text-xs underline"
                                        >
                                            Ver Desglose
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="p-4 text-center text-gray-500">No hay detalles de empleados para esta corrida de nómina.</p>
                )}
            </div>

            {/* Modal para Desglose de Componentes */}
            <Modal isOpen={showComponentsModal} onClose={() => setShowComponentsModal(false)} title={`Desglose de Componentes para: ${selectedEmployeeName}`}>
                {selectedEmployeeComponents.length > 0 ? (
                    <div className="text-xs space-y-1 max-h-80 overflow-y-auto">
                        {selectedEmployeeComponents.map((comp, index) => (
                            <div key={index} className={`p-1.5 border-b flex justify-between items-center ${comp.type === 'deduction' ? 'text-red-700' : 'text-green-700'}`}>
                                <span>{comp.name}:</span>
                                <span className="font-medium">{formatCurrency(comp.amount_ves)}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">No hay desglose de componentes disponible.</p>
                )}
                 <div className="pt-4 mt-3 flex justify-end border-t">
                    <button type="button" onClick={() => setShowComponentsModal(false)} className="btn-secondary-xs px-3 py-1.5">Cerrar</button>
                </div>
            </Modal>
        </div>
    );
}

export default PayrollRunDetailsPage;
