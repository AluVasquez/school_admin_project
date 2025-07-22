// frontend/school-admin-react/src/pages/TimeManagementPage.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getEmployees, createAttendanceRecord, getAttendanceForEmployee } from '../services/apiPersonnel';
import { toast } from 'react-toastify';
import { CalendarDaysIcon, ClockIcon, MagnifyingGlassIcon, PlusCircleIcon, DocumentMagnifyingGlassIcon } from '@heroicons/react/24/solid';

// Helpers
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

function TimeManagementPage() {
    const { token } = useAuth();
    const [activeTab, setActiveTab] = useState('entry'); // 'entry' o 'history'

    // Estado para la pestaña de Registro de Horas
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
    const [hourlyEmployees, setHourlyEmployees] = useState([]);
    const [timeEntries, setTimeEntries] = useState({}); // { employeeId: "horas" }
    const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Estado para la pestaña de Historial
    const [historyEmployee, setHistoryEmployee] = useState(null);
    const [historyStartDate, setHistoryStartDate] = useState(new Date(new Date().setDate(1)).toISOString().split('T')[0]);
    const [historyEndDate, setHistoryEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [attendanceRecords, setAttendanceRecords] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
    const [employeeSearchResults, setEmployeeSearchResults] = useState([]);


    // Carga inicial de empleados por hora para el formulario de registro
    const fetchHourlyEmployees = useCallback(async () => {
        if (!token) return;
        setIsLoadingEmployees(true);
        try {
            const data = await getEmployees(token, { pay_frequency: 'hourly', is_active: true, limit: 500 });
            setHourlyEmployees(data.items || []);
        } catch (err) {
            toast.error("Error al cargar la lista de empleados por hora.");
        } finally {
            setIsLoadingEmployees(false);
        }
    }, [token]);

    useEffect(() => {
        fetchHourlyEmployees();
    }, [fetchHourlyEmployees]);

    // Búsqueda de empleados para el historial
    useEffect(() => {
        if (employeeSearchTerm.length < 2) {
            setEmployeeSearchResults([]);
            return;
        }
        const handler = setTimeout(async () => {
            const data = await getEmployees(token, { search: employeeSearchTerm, limit: 5 });
            setEmployeeSearchResults(data.items || []);
        }, 500);
        return () => clearTimeout(handler);
    }, [employeeSearchTerm, token]);

    const handleSelectHistoryEmployee = (employee) => {
        setHistoryEmployee(employee);
        setEmployeeSearchTerm(employee.full_name);
        setEmployeeSearchResults([]);
    };
    
    const handleFetchHistory = useCallback(async () => {
        if (!historyEmployee) {
            toast.warn("Por favor, seleccione un empleado para ver su historial.");
            return;
        }
        setIsLoadingHistory(true);
        try {
            const data = await getAttendanceForEmployee(token, historyEmployee.id, historyStartDate, historyEndDate);
            setAttendanceRecords(data || []);
        } catch(err) {
            toast.error(`Error al cargar el historial: ${err.message}`);
        } finally {
            setIsLoadingHistory(false);
        }
    }, [token, historyEmployee, historyStartDate, historyEndDate]);

    const handleTimeEntryChange = (employeeId, value) => {
        setTimeEntries(prev => ({...prev, [employeeId]: value}));
    };

    const handleSubmitEntries = async (e) => {
        e.preventDefault();
        const entriesToSubmit = Object.entries(timeEntries).filter(([_, hours]) => hours && parseFloat(hours) > 0);
        if (entriesToSubmit.length === 0) {
            toast.info("No hay horas para registrar.");
            return;
        }
        setIsSubmitting(true);
        let successCount = 0;
        
        for (const [employeeId, hours] of entriesToSubmit) {
            try {
                const payload = {
                    employee_id: parseInt(employeeId),
                    work_date: entryDate,
                    hours_worked: parseFloat(hours),
                };
                await createAttendanceRecord(token, payload);
                successCount++;
            } catch (err) {
                const empName = hourlyEmployees.find(e => e.id.toString() === employeeId)?.full_name || `ID ${employeeId}`;
                toast.error(`Error registrando horas para ${empName}: ${err.message}`);
            }
        }

        if (successCount > 0) {
            toast.success(`${successCount} registro(s) de horas guardados exitosamente.`);
            setTimeEntries({}); // Limpiar formulario
        }
        setIsSubmitting(false);
    };

    return (
        <div className="bg-slate-100 min-h-full p-4 md:p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-800">Gestión de Asistencia y Horas</h1>
                <p className="text-sm text-slate-500 mt-1">Registre las horas trabajadas por los empleados para el cálculo automático de la nómina.</p>
            </div>
            
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <button onClick={() => setActiveTab('entry')} className={`${activeTab === 'entry' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}>
                        <ClockIcon className="w-5 h-5 mr-2" /> Registro de Horas
                    </button>
                    <button onClick={() => setActiveTab('history')} className={`${activeTab === 'history' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}>
                        <DocumentMagnifyingGlassIcon className="w-5 h-5 mr-2" /> Historial por Empleado
                    </button>
                </nav>
            </div>

            {activeTab === 'entry' && (
                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <form onSubmit={handleSubmitEntries} className="space-y-6">
                        <div className="flex items-center gap-4">
                            <label htmlFor="entryDate" className="font-semibold text-slate-700">Fecha de Trabajo:</label>
                            <input type="date" id="entryDate" value={entryDate} onChange={e => setEntryDate(e.target.value)} required className="input-style w-auto"/>
                        </div>
                        
                        <div className="border rounded-lg overflow-hidden">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Empleado</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-48">Horas Trabajadas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoadingEmployees ? <tr><td colSpan="2" className="p-4 text-center">Cargando empleados...</td></tr> : 
                                     hourlyEmployees.map(emp => (
                                        <tr key={emp.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 text-sm font-medium text-slate-800">{emp.full_name}</td>
                                            <td className="px-4 py-3">
                                                <input 
                                                    type="number" 
                                                    min="0" 
                                                    step="0.01" 
                                                    value={timeEntries[emp.id] || ''}
                                                    onChange={(e) => handleTimeEntryChange(emp.id, e.target.value)}
                                                    placeholder="Ej: 8.00"
                                                    className="input-style py-1 text-right"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-end">
                            <button type="submit" disabled={isSubmitting || isLoadingEmployees} className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
                                <PlusCircleIcon className="w-5 h-5" />
                                {isSubmitting ? "Guardando..." : "Guardar Registros"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
            
            {activeTab === 'history' && (
                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-6">
                        <div className="relative">
                            <label className="block text-sm font-medium text-gray-700">Empleado</label>
                            <input type="text" placeholder="Buscar empleado..." value={employeeSearchTerm} onChange={e => setEmployeeSearchTerm(e.target.value)} className="input-style mt-1"/>
                            {employeeSearchResults.length > 0 && (
                                <ul className="absolute z-10 w-full bg-white border mt-1 rounded shadow-lg max-h-60 overflow-y-auto">
                                    {employeeSearchResults.map(e => <li key={e.id} onClick={() => handleSelectHistoryEmployee(e)} className="p-2 hover:bg-indigo-100 cursor-pointer">{e.full_name}</li>)}
                                </ul>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Desde</label>
                            <input type="date" value={historyStartDate} onChange={e => setHistoryStartDate(e.target.value)} className="input-style mt-1"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Hasta</label>
                            <input type="date" value={historyEndDate} onChange={e => setHistoryEndDate(e.target.value)} className="input-style mt-1"/>
                        </div>
                    </div>
                    <div className="flex justify-end mb-4">
                        <button onClick={handleFetchHistory} disabled={!historyEmployee || isLoadingHistory} className="btn-primary py-2 px-4 text-sm">
                            {isLoadingHistory ? "Buscando..." : "Buscar Historial"}
                        </button>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-200">
                             <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Fecha</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Horas Registradas</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Notas</th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-600">Procesado</th>
                                </tr>
                            </thead>
                             <tbody className="divide-y divide-slate-100">
                                {!historyEmployee ? <tr key="no-emp"><td colSpan="4" className="p-4 text-center text-slate-500">Seleccione un empleado para ver su historial.</td></tr> :
                                 isLoadingHistory ? <tr key="loading"><td colSpan="4" className="p-4 text-center">Cargando...</td></tr> :
                                 attendanceRecords.length === 0 ? <tr key="no-data"><td colSpan="4" className="p-4 text-center">No hay registros para este empleado en el período seleccionado.</td></tr> :
                                 attendanceRecords.map(rec => (
                                    <tr key={rec.id}>
                                        <td className="px-4 py-2 text-sm">{formatDate(rec.work_date)}</td>
                                        <td className="px-4 py-2 text-sm text-right font-medium">{rec.hours_worked.toFixed(2)}</td>
                                        <td className="px-4 py-2 text-sm text-slate-500 max-w-sm truncate" title={rec.notes}>{rec.notes || '-'}</td>
                                        <td className="px-4 py-2 text-center">
                                            {rec.payroll_run_id ? 
                                             <span className="text-green-600 font-bold" title={`Procesado en nómina ID ${rec.payroll_run_id}`}>Sí</span> : 
                                             <span className="text-slate-400">No</span>
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TimeManagementPage;