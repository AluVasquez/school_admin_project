import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    getEmployees,
    activateEmployee,
    deactivateEmployee,
    getPositions,
    getDepartments
} from '../services/apiPersonnel';
import { getLatestExchangeRate } from '../services/apiExchangeRates';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import RecordEmployeePaymentModal from '../components/RecordEmployeePaymentModal';

// --- Iconos SVG para una UI más rica ---
// NOTA: Se añadieron PencilSquareIcon y TrashIcon como solicitaste.
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const AddUserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const PayIcon = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const ActivateIcon = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const AlertIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
const ChevronLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>;
const ChevronRightIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
const PencilSquareIcon = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg>;
const TrashIcon = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 10.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg>;


// Helper para formatear moneda (sin cambios)
const formatCurrency = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD' && locale === 'es-VE') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};

// Opciones para el filtro de saldo (sin cambios)
const BALANCE_FILTER_OPTIONS = [
    { value: "", label: "Todos los Saldos" },
    { value: "positive", label: "Saldo Positivo (Escuela Debe)" },
    { value: "zero", label: "Saldo Cero" },
    { value: "negative", label: "Saldo Negativo (Empleado Debe)" },
];

// Componente Skeleton para el estado de carga (sin cambios)
const SkeletonTable = () => (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        <div className="animate-pulse">
            <div className="bg-gray-200 h-14"></div>
            <div className="divide-y divide-gray-200">
                {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex items-center space-x-4 p-4">
                        <div className="flex-1 space-y-2 py-1"><div className="h-3 bg-gray-300 rounded w-3/4"></div><div className="h-2 bg-gray-300 rounded w-1/2"></div></div>
                        <div className="h-8 w-24 bg-gray-300 rounded"></div>
                        <div className="h-8 w-24 bg-gray-300 rounded"></div>
                        <div className="h-8 w-24 bg-gray-300 rounded"></div>
                    </div>
                ))}
            </div>
        </div>
    </div>
);


function EmployeesPage() {
    // --- Lógica y estado sin cambios ---
    const { token } = useAuth();
    const [employees, setEmployees] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [limitPerPage] = useState(10);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
    const [filterPositionId, setFilterPositionId] = useState('');
    const [filterDepartmentId, setFilterDepartmentId] = useState('');
    const [filterIsActive, setFilterIsActive] = useState('');
    const [filterBalanceStatus, setFilterBalanceStatus] = useState('');

    const [positions, setPositions] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [isLoadingFiltersData, setIsLoadingFiltersData] = useState(true);

    const [usdToVesRate, setUsdToVesRate] = useState(null);
    const [isLoadingRate, setIsLoadingRate] = useState(true);

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedEmployeeForPayment, setSelectedEmployeeForPayment] = useState(null);
    
    // --- Hooks y funciones de lógica sin cambios ---
    useEffect(() => {
        const timerId = setTimeout(() => { setDebouncedSearchTerm(searchTerm); }, 500);
        return () => { clearTimeout(timerId); };
    }, [searchTerm]);

    const fetchExchangeRate = useCallback(async () => {
        if (!token) return;
        setIsLoadingRate(true);
        try {
            const rateData = await getLatestExchangeRate(token, "USD");
            if (rateData && rateData.rate) { setUsdToVesRate(rateData.rate); } 
            else {
                toast.warn("No se pudo obtener la tasa de cambio USD actual. Los montos en USD no se mostrarán para el saldo.");
                setUsdToVesRate(null);
            }
        } catch (err) {
            console.error("Error fetching exchange rate:", err);
            toast.error("Error al cargar la tasa de cambio.");
            setUsdToVesRate(null);
        } finally {
            setIsLoadingRate(false);
        }
    }, [token]);

    const fetchFilterData = useCallback(async () => {
        if (!token) return;
        setIsLoadingFiltersData(true);
        try {
            const [positionsData, departmentsData] = await Promise.all([
                getPositions(token, { limit: 200 }),
                getDepartments(token, { limit: 100 })
            ]);
            setPositions(positionsData.items || []);
            setDepartments(departmentsData.items || []);
        } catch (err) {
            toast.error("Error al cargar datos para filtros (cargos/departamentos).");
        } finally {
            setIsLoadingFiltersData(false);
        }
    }, [token]);

    const fetchEmployees = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        setError(null);
        try {
            const skip = (currentPage - 1) * limitPerPage;
            const backendParams = {
                skip, limit: limitPerPage, search: debouncedSearchTerm || null,
                position_id: filterPositionId || null, department_id: filterDepartmentId || null,
                is_active: filterIsActive === '' ? null : filterIsActive === 'true',
                balance_filter: filterBalanceStatus || null,
            };
            const data = await getEmployees(token, backendParams);
            setEmployees(data.items || []);
            setTotalItems(data.total || 0);
            setTotalPages(data.pages || 0);
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar empleados: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, currentPage, limitPerPage, debouncedSearchTerm, filterPositionId, filterDepartmentId, filterIsActive, filterBalanceStatus]);

    useEffect(() => {
        fetchExchangeRate();
        fetchFilterData();
    }, [fetchExchangeRate, fetchFilterData]);

    useEffect(() => {
        if (!isLoadingFiltersData && !isLoadingRate) { fetchEmployees(); }
    }, [fetchEmployees, isLoadingFiltersData, isLoadingRate]);

    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm, filterPositionId, filterDepartmentId, filterIsActive, filterBalanceStatus]);

    const handleToggleActiveStatus = async (employeeId, currentStatus, employeeName) => {
        if (!token) { toast.error("Autenticación requerida."); return; }
        const action = currentStatus ? deactivateEmployee : activateEmployee;
        const actionText = currentStatus ? "desactivar" : "activar";
        if (!window.confirm(`¿Está seguro de que desea ${actionText} al empleado "${employeeName}"?`)) return;
        try {
            await action(token, employeeId);
            toast.success(`Empleado ${actionText}do exitosamente.`);
            fetchEmployees();
        } catch (err) {
            toast.error(`Error al ${actionText} empleado: ${err.message}`);
        }
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage && !isLoading) {
            setCurrentPage(newPage);
        }
    };

    const handleOpenPaymentModal = (employee) => {
        setSelectedEmployeeForPayment(employee);
        setIsPaymentModalOpen(true);
    };

    const handleClosePaymentModal = () => {
        setIsPaymentModalOpen(false);
        setSelectedEmployeeForPayment(null);
    };

    const handlePaymentRecorded = () => {
        toast.success("Pago registrado. Actualizando lista de empleados...");
        fetchEmployees();
        handleClosePaymentModal();
    };

    const getBalanceInUSD = (balanceVes) => {
        if (usdToVesRate && usdToVesRate > 0 && balanceVes !== null && balanceVes !== undefined) {
            return parseFloat(balanceVes) / usdToVesRate;
        }
        return null;
    };

    const isInitialLoading = isLoading || isLoadingFiltersData || isLoadingRate;

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen">
            {/* --- Header y Panel de Filtros sin cambios --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                <h1 className="text-3xl font-extrabold text-gray-800 mb-4 md:mb-0">Gestión de Empleados</h1>
                <Link to="/personnel/employees/new" className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
                    <AddUserIcon /> Añadir Empleado
                </Link>
            </div>
            <div className="mb-8 p-4 bg-white rounded-lg shadow-md">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    <div className="relative">
                        <label htmlFor="searchTermEmployees" className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
                        <div className="absolute inset-y-0 left-0 pl-3 pt-7 flex items-center pointer-events-none"><SearchIcon /></div>
                        <input type="text" id="searchTermEmployees" placeholder="Nombre, apellido, CI..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition" disabled={isInitialLoading}/>
                    </div>
                    <div>
                        <label htmlFor="filterDepartmentIdEmp" className="block text-sm font-medium text-gray-700 mb-1">Departamento</label>
                        <select id="filterDepartmentIdEmp" value={filterDepartmentId} onChange={(e) => setFilterDepartmentId(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" disabled={isInitialLoading}>
                            <option value="">{isLoadingFiltersData ? "Cargando..." : "Todos"}</option>
                            {departments.map(dept => <option key={dept.id} value={dept.id.toString()}>{dept.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="filterPositionIdEmp" className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                        <select id="filterPositionIdEmp" value={filterPositionId} onChange={(e) => setFilterPositionId(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" disabled={isInitialLoading}>
                            <option value="">{isLoadingFiltersData ? "Cargando..." : "Todos"}</option>
                            {positions.map(pos => <option key={pos.id} value={pos.id.toString()}>{pos.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="filterIsActiveEmp" className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                        <select id="filterIsActiveEmp" value={filterIsActive} onChange={(e) => setFilterIsActive(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" disabled={isInitialLoading}>
                            <option value="">Todos</option>
                            <option value="true">Activo</option>
                            <option value="false">Inactivo</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="filterBalanceStatusEmp" className="block text-sm font-medium text-gray-700 mb-1">Saldo</label>
                        <select id="filterBalanceStatusEmp" value={filterBalanceStatus} onChange={(e) => setFilterBalanceStatus(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" disabled={isInitialLoading}>
                            {BALANCE_FILTER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* --- Contenido Principal: Skeleton, Error o Tabla --- */}
            {isInitialLoading ? ( <SkeletonTable /> ) 
            : error ? (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg shadow-md flex items-center" role="alert">
                    <AlertIcon/>
                    <div>
                        <p className="font-bold">Error</p>
                        <p>No se pudieron cargar los datos de los empleados. Inténtalo de nuevo más tarde.</p>
                        <p className="text-xs mt-1">Detalle: {error}</p>
                    </div>
                </div>
            ) : (
                <>
                    <div className="bg-white shadow-lg rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empleado</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cargo / Depto.</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo Actual</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teléfono</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {employees.length > 0 ? employees.map((emp) => {
                                    const balanceInVes = emp.current_balance_ves || 0;
                                    const balanceInUsd = getBalanceInUSD(balanceInVes);
                                    const balanceIsNegative = parseFloat(balanceInVes) < -0.001;
                                    const balanceIsPositive = parseFloat(balanceInVes) > 0.001;

                                    return (
                                        <tr key={emp.id} className="hover:bg-gray-50 transition-colors duration-150">
                                            <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-gray-900">{emp.full_name}</div><div className="text-sm text-gray-500">{emp.identity_document}</div></td>
                                            <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-900">{emp.position?.name || 'N/A'}</div><div className="text-sm text-gray-500">{emp.position?.department?.name || 'N/A'}</div></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className={`text-sm font-semibold ${balanceIsNegative ? 'text-red-600' : balanceIsPositive ? 'text-green-600' : 'text-gray-700'}`}>{formatCurrency(balanceInVes, 'VES')}</div>
                                                {usdToVesRate && (<div className={`text-xs ${balanceIsNegative ? 'text-red-500' : balanceIsPositive ? 'text-green-500' : 'text-gray-400'}`}>{balanceInUsd !== null ? formatCurrency(balanceInUsd, 'USD') : 'Tasa N/A'}</div>)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{emp.primary_phone}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center"><span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${emp.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{emp.is_active ? 'Activo' : 'Inactivo'}</span></td>
                                            
                                            {/* --- INICIO DE CAMBIOS SOLICITADOS --- */}
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex items-center justify-end space-x-4">
                                                    <Link to={`/personnel/employees/${emp.id}/edit`} className="text-indigo-600 hover:text-indigo-800 transition-colors inline-flex items-center gap-1">
                                                        <PencilSquareIcon className="w-4 h-4" /> Ver/Editar
                                                    </Link>
                                                    
                                                    {emp.is_active && balanceIsPositive && (
                                                        <button onClick={() => handleOpenPaymentModal(emp)} className="text-green-600 hover:text-green-800 transition-colors inline-flex items-center gap-1">
                                                            <PayIcon className="w-4 h-4" /> Pagar
                                                        </button>
                                                    )}

                                                    {emp.is_active ? (
                                                         <button onClick={() => handleToggleActiveStatus(emp.id, emp.is_active, emp.full_name)} className="text-red-600 hover:text-red-800 transition-colors inline-flex items-center gap-1">
                                                            <TrashIcon className="w-4 h-4" /> Desactivar
                                                        </button>
                                                    ) : (
                                                         <button onClick={() => handleToggleActiveStatus(emp.id, emp.is_active, emp.full_name)} className="text-green-600 hover:text-green-800 transition-colors inline-flex items-center gap-1">
                                                            <ActivateIcon className="w-4 h-4" /> Activar
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            {/* --- FIN DE CAMBIOS SOLICITADOS --- */}
                                        </tr>
                                    );
                                }) : (
                                    <tr><td colSpan="6" className="px-6 py-12 text-center text-sm text-gray-500">No se encontraron empleados con los filtros actuales.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between">
                            <div className="text-sm text-gray-700 mb-4 sm:mb-0">Página <span className="font-medium">{currentPage}</span> de <span className="font-medium">{totalPages}</span> | Total: <span className="font-medium">{totalItems}</span> empleados</div>
                            <div className="inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                                    <ChevronLeftIcon/> Anterior
                                </button>
                                <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                                    Siguiente <ChevronRightIcon/>
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {selectedEmployeeForPayment && (
                <RecordEmployeePaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={handleClosePaymentModal}
                    token={token}
                    employee={selectedEmployeeForPayment}
                    onPaymentRecorded={handlePaymentRecorded}
                />
            )}
        </div>
    );
}

export default EmployeesPage;