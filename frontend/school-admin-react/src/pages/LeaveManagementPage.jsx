// frontend/school-admin-react/src/pages/LeaveManagementPage.jsx

import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
    getLeaveRequests, 
    updateLeaveRequestStatus, 
    getLeaveTypes, 
    createLeaveType, 
    updateLeaveType, 
    deleteLeaveType,
    getEmployees,
    createLeaveRequest,
    updateLeaveRequest
} from '../services/apiPersonnel';
import { toast } from 'react-toastify';
import { 
    CheckCircleIcon, XCircleIcon, ClockIcon, CalendarDaysIcon, Cog6ToothIcon, PlusIcon, 
    PencilSquareIcon, TrashIcon, UserPlusIcon 
} from '@heroicons/react/24/solid';
import Modal from '../components/Modal';
import { Switch } from '@headlessui/react';


const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const initialTypeFormData = { name: '', description: '', is_paid: true };
const initialRequestFormData = { employee_id: '', leave_type_id: '', start_date: '', end_date: '', reason: '' };

function LeaveManagementPage() {
    const { token } = useAuth();
    const [activeTab, setActiveTab] = useState('pending');

    const [pendingRequests, setPendingRequests] = useState([]);
    const [isLoadingPending, setIsLoadingPending] = useState(true);

    const [approvedLeaves, setApprovedLeaves] = useState([]);
    const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
    
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [isLoadingTypes, setIsLoadingTypes] = useState(false);
    const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
    const [editingLeaveType, setEditingLeaveType] = useState(null);
    const [typeFormData, setTypeFormData] = useState(initialTypeFormData);
    const [isSubmittingType, setIsSubmittingType] = useState(false);

    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [requestFormData, setRequestFormData] = useState(initialRequestFormData);
    const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
    
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingRequest, setEditingRequest] = useState(null);
    
    const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
    const [employeeSearchResults, setEmployeeSearchResults] = useState([]);

    const fetchAllData = useCallback(async () => {
        if (!token) return;
        
        setIsLoadingPending(true);
        setIsLoadingCalendar(true);
        setIsLoadingTypes(true);

        try {
            const [pendingData, approvedData, typesData] = await Promise.all([
                getLeaveRequests(token, { status: 'pending' }),
                getLeaveRequests(token, { status: 'approved' }),
                getLeaveTypes(token)
            ]);
            setPendingRequests(pendingData || []);
            setApprovedLeaves(approvedData || []);
            setLeaveTypes(typesData || []);
        } catch (err) {
            toast.error(`Error al cargar los datos: ${err.message}`);
        } finally {
            setIsLoadingPending(false);
            setIsLoadingCalendar(false);
            setIsLoadingTypes(false);
        }
    }, [token]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    useEffect(() => {
        if (employeeSearchTerm.length < 2) {
            setEmployeeSearchResults([]);
            return;
        }
        const handler = setTimeout(async () => {
            const data = await getEmployees(token, { search: employeeSearchTerm, limit: 5, is_active: true });
            setEmployeeSearchResults(data.items || []);
        }, 500);
        return () => clearTimeout(handler);
    }, [employeeSearchTerm, token]);

    const handleRequestAction = async (requestId, newStatus) => {
        const actionText = newStatus === 'approved' ? 'aprobar' : 'rechazar';
        if (!window.confirm(`¿Está seguro de que desea ${actionText} esta solicitud?`)) return;
        try {
            await updateLeaveRequestStatus(token, requestId, newStatus);
            toast.success(`Solicitud ${actionText}da exitosamente.`);
            fetchAllData();
        } catch (err) { toast.error(`Error al ${actionText} la solicitud: ${err.message}`); }
    };
    
    const openRequestModal = (request = null) => {
        if (request) {
            setEditingRequest(request);
            setRequestFormData({
                employee_id: request.employee.id,
                leave_type_id: request.leave_type.id,
                start_date: request.start_date.split('T')[0],
                end_date: request.end_date.split('T')[0],
                reason: request.reason || ''
            });
            setEmployeeSearchTerm(request.employee.full_name);
        } else {
            setEditingRequest(null);
            setRequestFormData(initialRequestFormData);
            setEmployeeSearchTerm('');
        }
        setIsRequestModalOpen(true);
    };

    const handleRequestFormSubmit = async (e) => {
        e.preventDefault();
        const { employee_id, leave_type_id, start_date, end_date } = requestFormData;
        if (!employee_id || !leave_type_id || !start_date || !end_date) {
            toast.warn("Debe seleccionar un empleado, tipo de ausencia y fechas."); return;
        }
        setIsSubmittingRequest(true);
        const action = editingRequest ? 'actualizar' : 'registrar';
        try {
            if (editingRequest) {
                await updateLeaveRequest(token, editingRequest.id, requestFormData);
            } else {
                await createLeaveRequest(token, requestFormData);
            }
            toast.success(`Solicitud de ausencia ${action}da exitosamente.`);
            setIsRequestModalOpen(false);
            fetchAllData();
        } catch(err) { toast.error(`Error al ${action} la solicitud: ${err.message}`); }
        finally { setIsSubmittingRequest(false); }
    };

    const handleSelectEmployee = (employee) => {
        setRequestFormData(prev => ({ ...prev, employee_id: employee.id }));
        setEmployeeSearchTerm(employee.full_name);
        setEmployeeSearchResults([]);
    };

    const openTypeModal = (type = null) => {
        if (type) {
            setEditingLeaveType(type);
            setTypeFormData({ name: type.name, description: type.description || '', is_paid: type.is_paid });
        } else {
            setEditingLeaveType(null);
            setTypeFormData(initialTypeFormData);
        }
        setIsTypeModalOpen(true);
    };

    const handleTypeFormSubmit = async (e) => {
        e.preventDefault();
        setIsSubmittingType(true);
        const action = editingLeaveType ? 'actualizar' : 'crear';
        try {
            if (editingLeaveType) {
                await updateLeaveType(token, editingLeaveType.id, typeFormData);
            } else {
                await createLeaveType(token, typeFormData);
            }
            toast.success(`Tipo de ausencia ${action}do exitosamente.`);
            setIsTypeModalOpen(false);
            fetchAllData();
        } catch(err) { toast.error(`Error al ${action} tipo: ${err.message}`); }
        finally { setIsSubmittingType(false); }
    };

    const handleDeleteType = async (typeId, typeName) => {
        if (!window.confirm(`¿Seguro que desea eliminar el tipo "${typeName}"? Esta acción no se puede deshacer.`)) return;
        try {
            await deleteLeaveType(token, typeId);
            toast.success("Tipo de ausencia eliminado.");
            fetchAllData();
        } catch(err) { toast.error(`Error al eliminar: ${err.message}`); }
    };
    
    const TableHeader = () => (
        <thead className="bg-gray-100">
            <tr>
                <th scope="col" className="w-1/4 px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Empleado</th>
                <th scope="col" className="w-1/5 px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tipo de Ausencia</th>
                <th scope="col" className="w-1/5 px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Fechas</th>
                <th scope="col" className="w-1/4 px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Motivo</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>
            </tr>
        </thead>
    );

    const renderTabContent = () => {
        if (activeTab === 'pending') {
            if (isLoadingPending) return <p className="text-center py-10">Cargando solicitudes...</p>;
            if (pendingRequests.length === 0) return <p className="text-center py-10 text-gray-500">No hay solicitudes de ausencia pendientes.</p>;
            return (
                <table className="min-w-full divide-y divide-gray-200">
                    <TableHeader />
                    <tbody className="bg-white divide-y divide-gray-200">
                        {pendingRequests.map(req => (
                            <tr key={req.id}>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{req.employee.full_name}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">{req.leave_type.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-500">{formatDate(req.start_date)} - {formatDate(req.end_date)}</td>
                                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title={req.reason}>{req.reason || '-'}</td>
                                <td className="px-4 py-3 text-center text-sm font-medium space-x-2">
                                    <button onClick={() => handleRequestAction(req.id, 'approved')} className="action-btn-icon bg-green-100 text-green-700 hover:bg-green-200"><CheckCircleIcon className="h-4 w-4 mr-1"/>Aprobar</button>
                                    <button onClick={() => handleRequestAction(req.id, 'denied')} className="action-btn-icon bg-red-100 text-red-700 hover:bg-red-200"><XCircleIcon className="h-4 w-4 mr-1"/>Rechazar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        }
        if (activeTab === 'calendar') {
            if (isLoadingCalendar) return <p className="text-center py-10">Cargando calendario...</p>;
            if (approvedLeaves.length === 0) return <p className="text-center py-10 text-gray-500">No hay ausencias aprobadas para mostrar.</p>;
            return (
                <table className="min-w-full divide-y divide-gray-200">
                    <TableHeader />
                    <tbody className="bg-white divide-y divide-gray-200">
                        {approvedLeaves.map(req => (
                            <tr key={req.id}>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{req.employee.full_name}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">{req.leave_type.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-500">{formatDate(req.start_date)} - {formatDate(req.end_date)}</td>
                                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title={req.reason}>{req.reason || '-'}</td>
                                <td className="px-4 py-3 text-center text-sm font-medium">
                                    <button onClick={() => openRequestModal(req)} className="action-btn-icon bg-blue-100 text-blue-700 hover:bg-blue-200"><PencilSquareIcon className="h-4 w-4 mr-1"/>Editar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        }
        if (activeTab === 'types') {
            if (isLoadingTypes) return <p className="text-center py-10">Cargando tipos...</p>;
            return (
                <div>
                    <div className="flex justify-end mb-4"><button onClick={() => openTypeModal()} className="btn-primary py-2 px-4 text-sm"><PlusIcon className="w-5 h-5 mr-1 inline"/>Crear Nuevo Tipo</button></div>
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                <th scope="col" className="w-1/3 px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Nombre</th>
                                <th scope="col" className="w-1/6 px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remunerada</th>
                                <th scope="col" className="w-1/3 px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Descripción</th>
                                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {leaveTypes.map(type => (
                                <tr key={type.id}>
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{type.name}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700">{type.is_paid ? 'Sí' : 'No'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title={type.description}>{type.description || '-'}</td>
                                    <td className="px-4 py-3 text-center text-sm font-medium space-x-2">
                                        <button onClick={() => openTypeModal(type)} className="action-btn-icon bg-blue-100 text-blue-700 hover:bg-blue-200"><PencilSquareIcon className="h-4 w-4 mr-1"/>Editar</button>
                                        <button onClick={() => handleDeleteType(type.id, type.name)} className="action-btn-icon bg-red-100 text-red-700 hover:bg-red-200"><TrashIcon className="h-4 w-4 mr-1"/>Eliminar</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }
    };
    

    return (
        <div className="container mx-auto p-4 md:p-6">
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-800">Gestión de Ausencias</h1>
                    <p className="text-sm text-gray-500 mt-1">Administra las solicitudes, calendario y tipos de ausencia de los empleados.</p>
                </div>
                <button onClick={() => openRequestModal()} className="inline-flex items-center gap-x-2 px-4 py-2 font-semibold text-sm text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:cursor-wait">
                    <UserPlusIcon className="w-5 h-5 mr-2 inline" />
                    Registrar Ausencia
                </button>
            </div>
            
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    {[
                        { key: 'pending', label: 'Solicitudes Pendientes', icon: ClockIcon },
                        { key: 'calendar', label: 'Calendario de Ausencias', icon: CalendarDaysIcon },
                        { key: 'types', label: 'Configurar Tipos', icon: Cog6ToothIcon },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`${activeTab === tab.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}>
                            <tab.icon className="w-5 h-5 mr-2" /> {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="bg-white shadow-xl rounded-b-2xl overflow-hidden mt-0">
                <div className="p-6">
                    {renderTabContent()}
                </div>
            </div>

            <Modal isOpen={isTypeModalOpen} onClose={() => setIsTypeModalOpen(false)} title={editingLeaveType ? "Editar Tipo de Ausencia" : "Crear Nuevo Tipo de Ausencia"}>
                <form onSubmit={handleTypeFormSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nombre del Tipo*</label>
                        <input type="text" value={typeFormData.name} onChange={e => setTypeFormData({...typeFormData, name: e.target.value})} className="mt-1 input-style" required/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Descripción</label>
                        <textarea value={typeFormData.description} onChange={e => setTypeFormData({...typeFormData, description: e.target.value})} rows="3" className="mt-1 input-style"/>
                    </div>
                    <Switch.Group as="div" className="flex items-center justify-between">
                        <span className="flex-grow flex flex-col"><Switch.Label as="span" className="text-sm font-medium text-gray-900" passive>Es Remunerada</Switch.Label><Switch.Description as="span" className="text-xs text-gray-500">Si está activo, no se descontará del salario.</Switch.Description></span>
                        <Switch checked={typeFormData.is_paid} onChange={checked => setTypeFormData({...typeFormData, is_paid: checked})} className={`${typeFormData.is_paid ? 'bg-indigo-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}><span className={`${typeFormData.is_paid ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}/></Switch>
                    </Switch.Group>
                    <div className="pt-4 flex justify-end gap-3"><button type="button" onClick={() => setIsTypeModalOpen(false)} className="btn-secondary py-2 px-4">Cancelar</button><button type="submit" disabled={isSubmittingType} className="btn-primary py-2 px-4 disabled:opacity-50">{isSubmittingType ? "Guardando..." : "Guardar"}</button></div>
                </form>
            </Modal>
            
            <Modal isOpen={isRequestModalOpen} onClose={() => setIsRequestModalOpen(false)} title={editingRequest ? "Editar Solicitud de Ausencia" : "Registrar Nueva Ausencia"}>
                <form onSubmit={handleRequestFormSubmit} className="space-y-4">
                    <div className="relative">
                        <label className="block text-sm font-medium text-gray-700">Empleado*</label>
                        <input type="text" placeholder="Buscar empleado por nombre..." value={employeeSearchTerm} onChange={e => setEmployeeSearchTerm(e.target.value)} className="mt-1 input-style" required disabled={!!editingRequest}/>
                        {employeeSearchResults.length > 0 && !editingRequest && (
                            <ul className="absolute z-10 w-full bg-white border mt-1 rounded shadow-lg max-h-48 overflow-y-auto">
                                {employeeSearchResults.map(e => <li key={e.id} onClick={() => handleSelectEmployee(e)} className="p-2 hover:bg-indigo-100 cursor-pointer">{e.full_name}</li>)}
                            </ul>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Tipo de Ausencia*</label>
                        <select value={requestFormData.leave_type_id} onChange={e => setRequestFormData({...requestFormData, leave_type_id: e.target.value})} className="mt-1 input-style-select" required>
                            <option value="" disabled>Seleccione un tipo...</option>
                            {leaveTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Fecha de Inicio*</label>
                            <input type="date" value={requestFormData.start_date} onChange={e => setRequestFormData({...requestFormData, start_date: e.target.value})} className="mt-1 input-style" required/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Fecha de Fin*</label>
                            <input type="date" value={requestFormData.end_date} onChange={e => setRequestFormData({...requestFormData, end_date: e.target.value})} className="mt-1 input-style" required/>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Motivo (Opcional)</label>
                        <textarea value={requestFormData.reason} onChange={e => setRequestFormData({...requestFormData, reason: e.target.value})} rows="3" className="mt-1 input-style"/>
                    </div>
                    <div className="pt-4 flex justify-end gap-3"><button type="button" onClick={() => setIsRequestModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all duration-300 disabled:opacity-50">Cancelar</button><button type="submit" disabled={isSubmittingRequest} className="inline-flex items-center gap-x-2 px-4 py-2 font-semibold text-sm text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:cursor-wait">{isSubmittingRequest ? "Guardando..." : "Guardar Solicitud"}</button></div>
                </form>
            </Modal>
        </div>
    );
}

export default LeaveManagementPage;