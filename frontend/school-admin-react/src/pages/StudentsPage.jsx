// src/pages/StudentsPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getStudents } from '../services/apiStudents';
import { getRepresentatives } from '../services/apiRepresentatives';
import { getGradeLevels } from '../services/apiGradeLevels';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

// --- Iconos para una UI más vistosa ---
const UserGroupIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.125-1.274-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.125-1.274.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
);
const ChevronLeftIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
);
const ChevronRightIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
);

// --- Lógica y estado del componente (Sin cambios) ---
function StudentsPage() {
    const { token } = useAuth();
    const [students, setStudents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTermStudentsInput, setSearchTermStudentsInput] = useState('');
    const [debouncedSearchTermStudents, setDebouncedSearchTermStudents] = useState('');
    const [representativeSearchTerm, setRepresentativeSearchTerm] = useState('');
    const [representativeSearchResults, setRepresentativeSearchResults] = useState([]);
    const [selectedRepresentative, setSelectedRepresentative] = useState(null);
    const [isLoadingRepSearch, setIsLoadingRepSearch] = useState(false);
    const [selectedGradeLevel, setSelectedGradeLevel] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [limitPerPage] = useState(10);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);
    const [gradeLevelsList, setGradeLevelsList] = useState([]);
    const [isLoadingFilters, setIsLoadingFilters] = useState(true);

    useEffect(() => {
        const loadGradeLevels = async () => {
            if (!token) { setIsLoadingFilters(false); return; }
            setIsLoadingFilters(true);
            try {
                const gradesDataResponse = await getGradeLevels(token, { limit: 100, isActive: true });
                setGradeLevelsList(gradesDataResponse.items || []);
            } catch (err) {
                toast.error("Error al cargar niveles de grado.");
            } finally {
                setIsLoadingFilters(false);
            }
        };
        loadGradeLevels();
    }, [token]);

    useEffect(() => {
        const timerId = setTimeout(() => { setDebouncedSearchTermStudents(searchTermStudentsInput); }, 500);
        return () => clearTimeout(timerId);
    }, [searchTermStudentsInput]);

    const fetchStudents = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        setError(null);
        try {
            const skip = (currentPage - 1) * limitPerPage;
            const params = {
                skip, limit: limitPerPage,
                search: debouncedSearchTermStudents,
                representativeId: selectedRepresentative ? selectedRepresentative.id : null,
                gradeLevelId: selectedGradeLevel || null,
                isActive: selectedStatus === '' ? null : selectedStatus === 'true',
            };
            const data = await getStudents(token, params);
            setStudents(data.items || []);
            setTotalItems(data.total || 0);
            setTotalPages(data.pages || 0);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [token, currentPage, limitPerPage, debouncedSearchTermStudents, selectedRepresentative, selectedGradeLevel, selectedStatus]);

    useEffect(() => {
        if (!isLoadingFilters) { fetchStudents(); }
    }, [fetchStudents, isLoadingFilters]);

    useEffect(() => {
        const searchReps = async () => {
            if (!representativeSearchTerm.trim() || representativeSearchTerm.length < 2 || !token) {
                setRepresentativeSearchResults([]);
                return;
            }
            setIsLoadingRepSearch(true);
            try {
                const data = await getRepresentatives(token, { search: representativeSearchTerm, limit: 5 });
                setRepresentativeSearchResults(data.items || []);
            } catch (error) {
                console.error("Error buscando representantes:", error);
            } finally {
                setIsLoadingRepSearch(false);
            }
        };
        const delayDebounceFn = setTimeout(searchReps, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [representativeSearchTerm, token]);

    useEffect(() => { setCurrentPage(1); }, [debouncedSearchTermStudents, selectedRepresentative, selectedGradeLevel, selectedStatus]);

    const handleSelectRepresentativeForFilter = (rep) => {
        setSelectedRepresentative({ id: rep.id, name: `${rep.first_name} ${rep.last_name} (${rep.cedula})` });
        setRepresentativeSearchTerm('');
        setRepresentativeSearchResults([]);
    };
    const clearRepresentativeFilter = () => {
        setSelectedRepresentative(null);
        setRepresentativeSearchTerm('');
    };
    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages && !isLoading) {
            setCurrentPage(newPage);
        }
    };

    // --- JSX Refactorizado ---
    return (
        <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* --- HEADER --- */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8">
                    <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Gestión de Estudiantes</h1>
                    <Link to="/representatives" className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
                        <UserGroupIcon />
                        Añadir Estudiante (Vía Representante)
                    </Link>
                </div>

                {/* --- PANEL DE FILTROS --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-6 mb-8">
                    <h2 className="text-xl font-bold text-slate-700 mb-4">Filtros y Búsqueda</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5 items-start">
                        {/* Búsqueda de Estudiante */}
                        <div>
                            <label htmlFor="searchTermStudents" className="label-style">Buscar Estudiante</label>
                            <div className="relative"><span className="absolute inset-y-0 left-0 flex items-center pl-3"></span><input type="text" id="searchTermStudents" placeholder="Nombre, apellido, cédula..." value={searchTermStudentsInput} onChange={(e) => setSearchTermStudentsInput(e.target.value)} className="input-style pl-10" disabled={isLoadingFilters} /></div>
                        </div>
                        {/* Búsqueda de Representante */}
                        <div className="relative">
                            <label htmlFor="representativeSearch" className="label-style">Filtrar por Representante</label>
                            <div className="relative"><span className="absolute inset-y-0 left-0 flex items-center pl-3"></span><input type="text" id="representativeSearch" placeholder="Escriba para buscar..." value={representativeSearchTerm} onChange={(e) => setRepresentativeSearchTerm(e.target.value)} className="input-style pl-10" disabled={isLoadingFilters || !!selectedRepresentative} /></div>
                            {isLoadingRepSearch && <div className="text-xs text-slate-500 pt-1">Buscando...</div>}
                            {representativeSearchResults.length > 0 && (
                                <ul className="absolute z-20 w-full bg-white border border-slate-300 rounded-md mt-1 max-h-48 overflow-y-auto shadow-lg">
                                    {representativeSearchResults.map(rep => (
                                        <li key={rep.id} onClick={() => handleSelectRepresentativeForFilter(rep)} className="px-4 py-2 text-sm hover:bg-indigo-100 cursor-pointer">{rep.first_name} {rep.last_name} <span className="text-slate-500">({rep.cedula})</span></li>
                                    ))}
                                </ul>
                            )}
                            {selectedRepresentative && (
                                <div className="mt-2 inline-flex items-center bg-indigo-100 text-indigo-800 text-sm font-semibold px-3 py-1 rounded-full">
                                    {selectedRepresentative.name}
                                    <button onClick={clearRepresentativeFilter} className="ml-2 -mr-1 flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full text-indigo-500 hover:bg-indigo-200 hover:text-indigo-700 focus:outline-none focus:bg-indigo-500 focus:text-white">&times;</button>
                                </div>
                            )}
                        </div>
                        {/* Filtro de Nivel */}
                        <div>
                            <label htmlFor="gradeLevelFilter" className="label-style">Nivel de Grado</label>
                            <select id="gradeLevelFilter" value={selectedGradeLevel} onChange={(e) => setSelectedGradeLevel(e.target.value)} className="select-style" disabled={isLoadingFilters || isLoading}>
                                <option value="">{isLoadingFilters ? 'Cargando...' : 'Todos los niveles'}</option>
                                {gradeLevelsList.map(gl => <option key={gl.id} value={gl.id}>{gl.name}</option>)}
                            </select>
                        </div>
                        {/* Filtro de Estado */}
                        <div>
                            <label htmlFor="statusFilter" className="label-style">Estado</label>
                            <select id="statusFilter" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="select-style" disabled={isLoading}><option value="">Todos</option><option value="true">Activo</option><option value="false">Inactivo</option></select>
                        </div>
                    </div>
                </div>

                {/* --- TABLA DE ESTUDIANTES --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl overflow-x-auto">
                    {isLoading ? (
                        <p className="text-center py-20 text-slate-600 font-semibold text-lg">Cargando estudiantes...</p>
                    ) : error ? (
                        <p className="text-red-600 bg-red-100 p-4 rounded-lg text-center my-10 font-medium">Error al cargar estudiantes: {error}</p>
                    ) : (
                        <>
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        {['Estudiante', 'Cédula', 'Nivel', 'Representante', 'Estado', 'Acciones'].map(header => (
                                            <th key={header} scope="col" className={`px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider ${header === 'Acciones' ? 'text-right' : ''}`}>{header}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {students.length > 0 ? students.map((student) => (
                                        <tr key={student.id} className="hover:bg-slate-200 transition-colors duration-200">
                                            <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-semibold text-slate-900">{student.first_name} {student.last_name}</div></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{student.cedula || 'N/A'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{student.grade_level_assigned?.name || 'N/A'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{student.representative ? <Link to={`/representatives/${student.representative.id}/edit`} className="text-indigo-600 hover:text-indigo-800 hover:underline">{student.representative.first_name} {student.representative.last_name}</Link> : 'N/A'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${student.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{student.is_active ? 'Activo' : 'Inactivo'}</span></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"><Link to={`/students/${student.id}/edit`} className="text-indigo-600 hover:text-indigo-900 font-semibold">Editar/Ver</Link></td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan="6" className="px-6 py-10 text-center text-sm text-slate-500">No se encontraron estudiantes con los filtros aplicados.</td></tr>
                                    )}
                                </tbody>
                            </table>
                            {/* --- PAGINACIÓN --- */}
                            {totalPages > 1 && (
                                <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between border-t border-slate-200">
                                    <div className="text-sm text-slate-700 mb-4 sm:mb-0">Página <span className="font-bold">{currentPage}</span> de <span className="font-bold">{totalPages}</span> (Total: {totalItems} estudiantes)</div>
                                    <div className="flex items-center space-x-2">
                                        <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="inline-flex items-center justify-center h-10 w-10 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronLeftIcon /></button>
                                        <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="inline-flex items-center justify-center h-10 w-10 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronRightIcon /></button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default StudentsPage;