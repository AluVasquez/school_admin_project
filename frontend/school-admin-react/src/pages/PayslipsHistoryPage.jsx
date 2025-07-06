// frontend/school-admin-react/src/pages/PayslipsHistoryPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPayslips } from '../services/apiPayslips';
import { getPositions } from '../services/apiPersonnel';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

// --- Iconos para la UI ---
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const ChevronLeftIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>;
const ChevronRightIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
const DocumentTextIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;

// --- Helpers ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString + 'T00:00:00Z').toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatCurrency = (amount, currency = 'VES') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    return parseFloat(amount).toLocaleString('es-VE', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// --- Componente Skeleton para la Tabla ---
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


function PayslipsHistoryPage() {
    const { token } = useAuth();
    const [payslips, setPayslips] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Paginación y Filtros
    const [currentPage, setCurrentPage] = useState(1);
    const [limitPerPage] = useState(15);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [filterPositionId, setFilterPositionId] = useState('');

    const [positions, setPositions] = useState([]);
    const [isLoadingFilters, setIsLoadingFilters] = useState(true);

    useEffect(() => {
        const timerId = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 500);
        return () => clearTimeout(timerId);
    }, [searchTerm]);

    useEffect(() => {
        const loadPositions = async () => {
            if (!token) { setIsLoadingFilters(false); return; }
            try {
                const data = await getPositions(token, { limit: 200 });
                setPositions(data.items || []);
            } catch (err) {
                toast.error("No se pudieron cargar los cargos para el filtro.");
            } finally {
                setIsLoadingFilters(false);
            }
        };
        loadPositions();
    }, [token]);

    const fetchPayslips = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        setError(null);
        try {
            const skip = (currentPage - 1) * limitPerPage;
            const params = {
                skip,
                limit: limitPerPage,
                search: debouncedSearchTerm || null,
                start_date: startDate || null,
                end_date: endDate || null,
                positionId: filterPositionId || null,
            };
            const data = await getPayslips(token, params);
            setPayslips(data.items || []);
            setTotalItems(data.total || 0);
            setTotalPages(data.pages || 0);
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar recibos: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, currentPage, limitPerPage, debouncedSearchTerm, startDate, endDate, filterPositionId]);

    useEffect(() => {
        if (!isLoadingFilters) { // Solo busca recibos una vez que los filtros (cargos) estén listos
            fetchPayslips();
        }
    }, [fetchPayslips, isLoadingFilters]);
    
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm, startDate, endDate, filterPositionId]);

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages && !isLoading) {
            setCurrentPage(newPage);
        }
    };

    return (
        <div className="bg-slate-100 min-h-screen p-4 md:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Historial de Recibos de Pago</h1>
                    <p className="text-sm text-slate-500 mt-1">Consulta, busca y visualiza todos los recibos de pago generados.</p>
                </header>

                <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
                        <div className="lg:col-span-1">
                            <label htmlFor="searchTermPayslips" className="block text-sm font-semibold text-slate-700 mb-1">Buscar Empleado</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon /></span>
                                <input type="text" id="searchTermPayslips" placeholder="Nombre o Cédula..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm" disabled={isLoading} />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="filterPositionId" className="block text-sm font-semibold text-slate-700 mb-1">Filtrar por Cargo</label>
                            <select id="filterPositionId" value={filterPositionId} onChange={(e) => setFilterPositionId(e.target.value)} className="block w-full py-2 px-3 border border-slate-300 bg-white rounded-lg shadow-sm" disabled={isLoading || isLoadingFilters}>
                                <option value="">{isLoadingFilters ? 'Cargando...' : 'Todos los Cargos'}</option>
                                {positions.map(pos => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
                             <div>
                                <label htmlFor="startDatePayslips" className="block text-sm font-semibold text-slate-700 mb-1">Desde</label>
                                <input type="date" id="startDatePayslips" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="block w-full py-2 px-3 border border-slate-300 rounded-lg shadow-sm sm:text-sm" disabled={isLoading} />
                            </div>
                            <div>
                                <label htmlFor="endDatePayslips" className="block text-sm font-semibold text-slate-700 mb-1">Hasta</label>
                                <input type="date" id="endDatePayslips" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="block w-full py-2 px-3 border border-slate-300 rounded-lg shadow-sm sm:text-sm" disabled={isLoading} />
                            </div>
                        </div>
                    </div>
                </div>

                {isLoading ? ( <SkeletonTable /> ) 
                : error ? ( <p className="text-center py-10 text-red-600 bg-red-50 rounded-lg shadow">Error: {error}</p> ) 
                : (
                    <>
                        <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Empleado</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Cargo</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha de Pago</th>
                                        <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Neto Pagado (VES)</th>
                                        <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {payslips.length > 0 ? payslips.map((payslip) => (
                                        <tr key={payslip.id} className="hover:bg-slate-200 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-semibold text-slate-900">{payslip.employee_full_name_snapshot}</div>
                                                <div className="text-xs text-slate-500">{payslip.employee_identity_document_snapshot}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{payslip.employee_position_snapshot || 'N/A'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{formatDate(payslip.payment_date_snapshot)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800 text-right font-mono font-semibold">{formatCurrency(payslip.net_pay_ves)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                                <Link to={`/personnel/payslips/${payslip.id}`} className="text-indigo-600 hover:text-indigo-900 hover:underline">
                                                    Ver Recibo
                                                </Link>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="5" className="text-center py-12">
                                                <DocumentTextIcon/>
                                                <h3 className="mt-2 text-sm font-semibold text-slate-900">No se encontraron recibos</h3>
                                                <p className="mt-1 text-sm text-slate-500">Intenta ajustar los filtros de búsqueda.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between">
                                <div className="text-sm text-slate-700 mb-4 sm:mb-0">
                                    Página <span className="font-bold">{currentPage}</span> de <span className="font-bold">{totalPages}</span> (Total: {totalItems} recibos)
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="inline-flex items-center justify-center h-10 w-10 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50"><ChevronLeftIcon /></button>
                                    <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="inline-flex items-center justify-center h-10 w-10 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50"><ChevronRightIcon /></button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default PayslipsHistoryPage;