// frontend/school-admin-react/src/pages/PayrollRunsPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    getPayrollRuns,
    createPayrollRunDraft,
    confirmPayrollRun,
    updatePayrollRunStatus,
    deletePayrollRunDraft
} from '../services/apiPersonnel';
import Modal from '../components/Modal';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

// Constantes para selectores
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

// Helper para formatear fecha
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const initialCreateFormData = {
    name: '',
    period_start_date: '',
    period_end_date: '',
    pay_frequency_covered: 'monthly',
    exchange_rate_usd_ves: '',
};

const initialStatusUpdateFormData = {
    status: '',
    notes: '',
};

function PayrollRunsPage() {
    const { token } = useAuth();
    const [payrollRuns, setPayrollRuns] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [limitPerPage] = useState(10);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);

    // Filtros
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPayFrequency, setFilterPayFrequency] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    
    // Modal para Crear Borrador de Nómina
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createFormData, setCreateFormData] = useState(initialCreateFormData);
    const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
    const [formCreateError, setFormCreateError] = useState(null);

    // Modal para Confirmar Nómina
    const [confirmationText, setConfirmationText] = useState('');
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [runToConfirm, setRunToConfirm] = useState(null);
    const [isSubmittingConfirm, setIsSubmittingConfirm] = useState(false);
    const [formConfirmError, setFormConfirmError] = useState(null);

    // Modal para Actualizar Estado
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [runToUpdateStatus, setRunToUpdateStatus] = useState(null);
    const [statusUpdateFormData, setStatusUpdateFormData] = useState(initialStatusUpdateFormData);
    const [isSubmittingStatusUpdate, setIsSubmittingStatusUpdate] = useState(false);
    const [formStatusUpdateError, setFormStatusUpdateError] = useState(null);


    const fetchPayrollRunsList = useCallback(async () => {
        if (!token) return;
        setIsLoading(true); setError(null);
        try {
            const skip = (currentPage - 1) * limitPerPage;
            const params = {
                skip, limit: limitPerPage,
                status: filterStatus || null,
                payFrequency: filterPayFrequency || null,
                startDateFilter: filterStartDate || null,
                endDateFilter: filterEndDate || null,
            };
            const data = await getPayrollRuns(token, params);
            setPayrollRuns(data.items || []);
            setTotalItems(data.total || 0);
            setTotalPages(data.pages || 0);
        } catch (err) { setError(err.message); toast.error(`Error al cargar corridas de nómina: ${err.message}`); }
        finally { setIsLoading(false); }
    }, [token, currentPage, limitPerPage, filterStatus, filterPayFrequency, filterStartDate, filterEndDate]);

    useEffect(() => {
        fetchPayrollRunsList();
    }, [fetchPayrollRunsList]);

    useEffect(() => { setCurrentPage(1); }, [filterStatus, filterPayFrequency, filterStartDate, filterEndDate]);

    // --- Manejadores para Crear Borrador ---
    const handleCreateInputChange = (e) => {
        const { name, value } = e.target;
        setCreateFormData(prev => ({ ...prev, [name]: value }));
    };
    const openCreateModal = () => {
        setCreateFormData(initialCreateFormData);
        setFormCreateError(null);
        setIsCreateModalOpen(true);
    };
    const handleSubmitCreateDraft = async (e) => {
        e.preventDefault();
        if (!createFormData.name || !createFormData.period_start_date || !createFormData.period_end_date) {
            toast.warn("Nombre y fechas de período son obligatorios."); return;
        }
        setIsSubmittingCreate(true); setFormCreateError(null);
        try {
            const payload = {
                ...createFormData,
                exchange_rate_usd_ves: createFormData.exchange_rate_usd_ves ? parseFloat(createFormData.exchange_rate_usd_ves) : null,
            };
            await createPayrollRunDraft(token, payload);
            toast.success("Borrador de corrida de nómina creado exitosamente.");
            setIsCreateModalOpen(false);
            fetchPayrollRunsList();
        } catch (err) { setFormCreateError(err.message); toast.error(`Error: ${err.message}`); }
        finally { setIsSubmittingCreate(false); }
    };

    // --- Manejadores para Confirmar Nómina ---
    const openConfirmModal = (run) => {
        setRunToConfirm(run);
        setFormConfirmError(null);
        setConfirmationText('');
        setIsConfirmModalOpen(true);
    };
    
    const handleSubmitConfirmRun = async (e) => {
        e.preventDefault();
        if (!runToConfirm) return;
        
        if (confirmationText.toUpperCase() !== 'APLICAR') {
        toast.warn("Debe escribir 'APLICAR' para confirmar el proceso.");
            return;
        }
        setIsSubmittingConfirm(true); setFormConfirmError(null);
        try {
            // El payload ahora es simple, el backend hace el trabajo pesado
            const payload = { employee_hours_input: [] };
            await confirmPayrollRun(token, runToConfirm.id, payload);
            toast.success(`Nómina "${runToConfirm.name}" confirmada y aplicada exitosamente.`);
            setIsConfirmModalOpen(false);
            fetchPayrollRunsList();
        } catch (err) { setFormConfirmError(err.message); toast.error(`Error al confirmar nómina: ${err.message}`); }
        finally { setIsSubmittingConfirm(false); }
    };
    
    // --- Manejadores para Actualizar Estado de Nómina ---
    const openStatusModal = (run) => {
        setRunToUpdateStatus(run);
        setStatusUpdateFormData({ status: run.status, notes: '' });
        setFormStatusUpdateError(null);
        setIsStatusModalOpen(true);
    };
    const handleStatusUpdateInputChange = (e) => {
        const { name, value } = e.target;
        setStatusUpdateFormData(prev => ({ ...prev, [name]: value }));
    };
    const handleSubmitStatusUpdate = async (e) => {
        e.preventDefault();
        if (!runToUpdateStatus || !statusUpdateFormData.status) {
            toast.warn("Debe seleccionar un nuevo estado."); return;
        }
        setIsSubmittingStatusUpdate(true); setFormStatusUpdateError(null);
        try {
            const payload = {
                status: statusUpdateFormData.status,
                notes: statusUpdateFormData.notes || null,
            };
            await updatePayrollRunStatus(token, runToUpdateStatus.id, payload);
            toast.success("Estado de la corrida de nómina actualizado.");
            setIsStatusModalOpen(false);
            fetchPayrollRunsList();
        } catch (err) { setFormStatusUpdateError(err.message); toast.error(`Error: ${err.message}`); }
        finally { setIsSubmittingStatusUpdate(false); }
    };

    // --- Manejador para Eliminar Borrador ---
    const handleDeleteDraft = async (runId, runName) => {
        if (!window.confirm(`¿Está seguro de eliminar el borrador de nómina "${runName}"?`)) return;
        try {
            await deletePayrollRunDraft(token, runId);
            toast.success("Borrador de nómina eliminado.");
            fetchPayrollRunsList();
        } catch (err) { toast.error(`Error al eliminar borrador: ${err.message}`); }
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages && !isLoading) {
            setCurrentPage(newPage);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-extrabold text-gray-800">Procesos de Nómina</h1>
                <button onClick={openCreateModal} className="inline-flex items-center gap-x-2 px-4 py-2 font-semibold text-sm text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:cursor-wait">
                    + Iniciar Nuevo Proceso de Nómina
                </button>
            </div>

            {/* Filtros */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg shadow grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div><label htmlFor="filterStartDatePR" className="block text-sm font-medium">Período Desde</label><input type="date" id="filterStartDatePR" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="mt-1 input-style"/></div>
                <div><label htmlFor="filterEndDatePR" className="block text-sm font-medium">Período Hasta</label><input type="date" id="filterEndDatePR" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="mt-1 input-style"/></div>
                <div><label htmlFor="filterPayFrequencyPR" className="block text-sm font-medium">Frecuencia Cubierta</label><select id="filterPayFrequencyPR" value={filterPayFrequency} onChange={e => setFilterPayFrequency(e.target.value)} className="mt-1 input-style-select"><option value="">Todas</option>{PAY_FREQUENCIES.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
                <div><label htmlFor="filterStatusPR" className="block text-sm font-medium">Estado</label><select id="filterStatusPR" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="mt-1 input-style-select"><option value="">Todos</option>{PAYROLL_RUN_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
            </div>

            {isLoading && <p className="text-center py-4">Cargando procesos de nómina...</p>}
            {error && !isLoading && <p className="text-red-500 p-3 text-center">Error: {error}</p>}

            {!isLoading && !error && (
                <>
                    <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Nombre de Proceso</th>
                                    <th className="px-3 py-2 text-left font-semibold">Período</th>
                                    <th className="px-3 py-2 text-left font-semibold">Frecuencia</th>
                                    <th className="px-3 py-2 text-right font-semibold">Tasa USD (Bs.S)</th>
                                    <th className="px-3 py-2 text-left font-semibold ">Estado</th>
                                    <th className="px-3 py-2 text-left font-semibold">Procesado por</th>
                                    <th className="px-3 py-2 text-right font-semibold">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {payrollRuns.length > 0 ? payrollRuns.map(run => (
                                    <tr key={run.id} className="hover:bg-slate-200">
                                        <td className="px-3 py-2">{run.name}</td>
                                        <td className="px-3 py-2">{formatDate(run.period_start_date)} - {formatDate(run.period_end_date)}</td>
                                        <td className="px-3 py-2">{PAY_FREQUENCIES.find(f=>f.value === run.pay_frequency_covered)?.label || run.pay_frequency_covered}</td>
                                        <td className="px-3 py-2 text-right">{run.exchange_rate_usd_ves ? parseFloat(run.exchange_rate_usd_ves).toFixed(2) : 'N/A'}</td>
                                        <td className="px-3 py-2"><span className={`px-2 py-0.5 font-medium rounded-full text-xs ${run.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : run.status === 'confirmed' ? 'bg-green-100 text-green-700' : run.status === 'paid_out' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{PAYROLL_RUN_STATUSES.find(s=>s.value === run.status)?.label || run.status}</span></td>
                                        <td className="px-3 py-2" title={run.processed_by_user?.email}>{run.processed_by_user?.full_name || run.processed_by_user?.email || 'N/A'}</td>
                                        <td className="px-3 py-2 text-right space-x-1">
                                                {run.status === 'confirmed' && (
                                            <Link to={`/personnel/payroll-runs/${run.id}/cost-report`} className="text-teal-600 hover:text-teal-800 font-semibold">Ver Reporte</Link>)}
                                            {run.status === 'draft' && (<button onClick={() => openConfirmModal(run)} className="text-green-600 hover:text-green-800">Confirmar</button>)}
                                            {run.status !== 'cancelled' && (<button onClick={() => openStatusModal(run)} className="px-3 text-blue-500 hover:text-blue-800">Estado</button>)}
                                            {run.status === 'draft' && (<button onClick={() => handleDeleteDraft(run.id, run.name)} className="text-red-600 hover:text-red-800">Eliminar</button>)}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="7" className="text-center py-4">No se encontraron procesos de nómina.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 0 && ( /* Paginación */
                        <div className="mt-4 flex items-center justify-between text-xs">
                            <span>Página {currentPage} de {totalPages} (Total: {totalItems} procesos)</span>
                            <div><button onClick={()=>handlePageChange(currentPage-1)} disabled={currentPage<=1} className="btn-secondary-xs mr-1">Ant.</button><button onClick={()=>handlePageChange(currentPage+1)} disabled={currentPage>=totalPages} className="btn-secondary-xs">Sig.</button></div>
                        </div>
                    )}
                </>
            )}

            {/* Modal para Crear Borrador de Nómina */}
            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Iniciar Nuevo Proceso de Nómina (Borrador)">
                 <form onSubmit={handleSubmitCreateDraft} className="space-y-4 text-sm">
                    <div><label htmlFor="name_pr_create" className="block font-medium">Nombre del Proceso*</label><input type="text" name="name" id="name_pr_create" value={createFormData.name} onChange={handleCreateInputChange} required className="mt-1 input-style" placeholder="Ej: 1ra Quincena Julio 2025"/></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label htmlFor="period_start_date_pr_create" className="block font-medium">Fecha Inicio Periodo*</label><input type="date" name="period_start_date" id="period_start_date_pr_create" value={createFormData.period_start_date} onChange={handleCreateInputChange} required className="mt-1 input-style"/></div>
                        <div><label htmlFor="period_end_date_pr_create" className="block font-medium">Fecha Fin Periodo*</label><input type="date" name="period_end_date" id="period_end_date_pr_create" value={createFormData.period_end_date} onChange={handleCreateInputChange} required className="mt-1 input-style"/></div>
                    </div>
                    <div><label htmlFor="pay_frequency_covered_pr_create" className="block font-medium">Frecuencia a Cubrir*</label><select name="pay_frequency_covered" id="pay_frequency_covered_pr_create" value={createFormData.pay_frequency_covered} onChange={handleCreateInputChange} className="mt-1 input-style-select">{PAY_FREQUENCIES.map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                    <div><label htmlFor="exchange_rate_usd_ves_pr_create" className="block font-medium">Tasa USD-Bs.S (Opcional)</label><input type="number" name="exchange_rate_usd_ves" id="exchange_rate_usd_ves_pr_create" value={createFormData.exchange_rate_usd_ves} onChange={handleCreateInputChange} step="any" placeholder="Si se omite, se usará la más reciente" className="mt-1 input-style"/><p className="text-xs text-gray-500">Dejar vacío para usar la tasa más reciente del sistema para la fecha fin del período.</p></div>
                    {formCreateError && <p className="text-red-500 text-xs p-2 bg-red-50 rounded">{formCreateError}</p>}
                    <div className="pt-4 flex justify-end space-x-2 border-t"><button type="button" onClick={()=>setIsCreateModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all duration-300 disabled:opacity-50">Cancelar</button><button type="submit" disabled={isSubmittingCreate} className="inline-flex items-center gap-x-2 px-4 py-2 font-semibold text-sm text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:cursor-wait">{isSubmittingCreate ? 'Creando...' : 'Crear Borrador'}</button></div>
                </form>
            </Modal>

            {/* Modal para Confirmar Nómina */}
            {runToConfirm && (
            <Modal isOpen={isConfirmModalOpen} onClose={() => setIsConfirmModalOpen(false)} title={`Confirmar Nómina: "${runToConfirm.name}"`}>
                <form onSubmit={handleSubmitConfirmRun} className="space-y-4 text-sm">
                    <p className="text-gray-700 font-bold">¡Está a punto de confirmar y aplicar los cálculos de esta nómina a los saldos de los empleados. Esta acción es importante!</p>
                    <p className="text-xs">Período: <span className="font-medium">{formatDate(runToConfirm.period_start_date)}</span> a <span className="font-medium">{formatDate(runToConfirm.period_end_date)}</span></p>
                    <p className="text-xs">Frecuencia: <span className="font-medium">{PAY_FREQUENCIES.find(f=>f.value === runToConfirm.pay_frequency_covered)?.label}</span></p>
                    <p className="text-xs">Tasa USD (si aplica): <span className="font-medium">{runToConfirm.exchange_rate_usd_ves ? parseFloat(runToConfirm.exchange_rate_usd_ves).toFixed(2) + ' Bs.S' : 'Se usará la más reciente'}</span></p>

                    {runToConfirm.pay_frequency_covered === 'hourly' && (
                        <div className="mt-4 pt-3 border-t">
                            <p className="text-amber-700 bg-amber-100 p-3 rounded-md text-xs">
                                Se calcularán y procesarán automáticamente todas las horas de asistencia registradas para los empleados por hora dentro del período de esta nómina.
                            </p>
                        </div>
                    )}
                                        <div className="mt-4 p-4 border-t border-b border-red-300 bg-red-50 rounded-md">
                        <label htmlFor="confirmation_text_pr_confirm" className="block text-sm font-semibold text-red-700 mb-1">
                            Confirmación Requerida
                        </label>
                        <p className="text-xs text-red-600 mb-2">
                            Para continuar, escriba la palabra <strong>APLICAR</strong> en el campo de abajo.
                        </p>
                        <input
                            type="text"
                            id="confirmation_text_pr_confirm"
                            value={confirmationText}
                            onChange={(e) => setConfirmationText(e.target.value)}
                            className="mt-1 w-full input-style border-red-400 focus:ring-red-500 focus:border-red-500"
                            placeholder="APLICAR"
                        />
                    </div>

                    {formConfirmError && <p className="text-red-500 text-xs p-2 bg-red-50 rounded">{formConfirmError}</p>}
                    <div className="pt-4 flex justify-end space-x-2 border-t"><button type="button" onClick={()=>setIsConfirmModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all duration-300 disabled:opacity-50">Cancelar</button><button type="submit" disabled={isSubmittingConfirm || confirmationText.toUpperCase() !== 'APLICAR'}  className="inline-flex items-center gap-x-2 px-4 py-2 font-semibold text-sm text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:cursor-wait">{isSubmittingConfirm ? 'Confirmando...' : 'Confirmar y Aplicar Nómina'}</button></div>
                </form>
            </Modal>
            )}

            {/* Modal para Actualizar Estado de Nómina */}
            {runToUpdateStatus && (
            <Modal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} title={`Actualizar Estado de Nómina: "${runToUpdateStatus.name}"`}>
                <form onSubmit={handleSubmitStatusUpdate} className="space-y-4 text-sm">
                    <p className="text-xs">Estado Actual: <span className="font-semibold">{PAYROLL_RUN_STATUSES.find(s=>s.value === runToUpdateStatus.status)?.label}</span></p>
                    <div><label htmlFor="new_status_pr_update" className="block font-medium">Nuevo Estado*</label>
                        <select name="status" id="new_status_pr_update" value={statusUpdateFormData.status} onChange={handleStatusUpdateInputChange} className="mt-1 input-style-select">
                            {PAYROLL_RUN_STATUSES.map(opt => <option key={opt.value} value={opt.value} disabled={opt.value === runToUpdateStatus.status || (runToUpdateStatus.status !== 'draft' && opt.value ==='draft') }>{opt.label}</option>)}
                        </select>
                    </div>
                    <div><label htmlFor="notes_pr_update" className="block font-medium">Notas (Opcional)</label><textarea name="notes" id="notes_pr_update" value={statusUpdateFormData.notes} onChange={handleStatusUpdateInputChange} rows="2" className="mt-1 input-style"></textarea></div>
                    {formStatusUpdateError && <p className="text-red-500 text-xs p-2 bg-red-50 rounded">{formStatusUpdateError}</p>}
                    <div className="pt-4 flex justify-end space-x-2 border-t"><button type="button" onClick={()=>setIsStatusModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all duration-300 disabled:opacity-50">Cancelar</button><button type="submit" disabled={isSubmittingStatusUpdate} className="inline-flex items-center gap-x-2 px-4 py-2 font-semibold text-sm text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:cursor-wait">{isSubmittingStatusUpdate ? 'Actualizando...' : 'Actualizar Estado'}</button></div>
                </form>
            </Modal>
            )}
        </div>
    );
}

export default PayrollRunsPage;