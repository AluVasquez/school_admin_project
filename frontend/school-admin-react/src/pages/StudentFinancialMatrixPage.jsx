import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchStudentAnnualFinancialSummary } from '../services/apiStudents'; 
import { getLatestExchangeRate } from '../services/apiExchangeRates';
import { exportToCSV, exportToXLSX } from '../utils/exportUtils';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom'; // Opcional, para enlazar a detalles

// --- Iconos SVG para la UI ---
const ExportCSVIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const ExportExcelIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;

// Helpers
const formatCurrency = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};
const MONTH_NAMES_ES_SHORT = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const DELINQUENCY_STATUS_OPTIONS = [
    { value: '', label: "Todos los Estados" },
    { value: 'green', label: "Al Día" },
    { value: 'orange', label: "Retraso Leve" },
    { value: 'red', label: "Retraso Grave" },
    { value: 'none', label: "Sin Deuda/Evaluable" },
];

function StudentFinancialMatrixPage() {
    const { token } = useAuth();
    const [summaryData, setSummaryData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const currentYear = new Date().getFullYear();
    const [selectedSchoolYearStartYear, setSelectedSchoolYearStartYear] = useState(currentYear);
    const [selectedSchoolYearStartMonth] = useState(9); // Agosto por defecto
    const [studentSearchTerm, setStudentSearchTerm] = useState('');
    const [filterDelinquencyStatus, setFilterDelinquencyStatus] = useState(''); // NUEVO filtro

    const [currentPage, setCurrentPage] = useState(1);
    const [limitPerPage] = useState(50);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);

    const [displayCurrency, setDisplayCurrency] = useState('VES');
    const [currentUsdToVesRate, setCurrentUsdToVesRate] = useState(null);
    const [isLoadingRate, setIsLoadingRate] = useState(false);
    const [showDelinquencyColors, setShowDelinquencyColors] = useState(true);

    const [isLoadingExport, setIsLoadingExport] = useState(false); // Para los botones de exportación

    const schoolYearOptions = useMemo(() => {
        const years = [];
        const baseYear = new Date().getFullYear();
        for (let i = 2; i >= -1; i--) { // Desde 2 años atrás hasta 1 año adelante
            years.push({ value: baseYear - i, label: `${baseYear - i} - ${baseYear - i + 1}` });
        }
        return years.sort((a,b) => b.value - a.value);
    }, []);

    const fetchRate = useCallback(async () => {
        if(!token) return;
        setIsLoadingRate(true);
        try {
            const rateData = await getLatestExchangeRate(token, "USD");
            setCurrentUsdToVesRate(rateData?.rate || null);
        } catch (err) { console.error("Error fetching rate:", err); setCurrentUsdToVesRate(null); }
        finally { setIsLoadingRate(false); }
    }, [token]);

    const fetchFinancialSummary = useCallback(async () => {
        if (!token || !selectedSchoolYearStartYear) { setIsLoading(false); return; }
        setIsLoading(true); setError(null);
        try {
            const params = {
                schoolYearStartYear: selectedSchoolYearStartYear,
                schoolYearStartMonth: selectedSchoolYearStartMonth,
                studentSearchTerm: studentSearchTerm || null,
                delinquencyFilter: filterDelinquencyStatus || null, // Pasar el nuevo filtro
                skip: (currentPage - 1) * limitPerPage,
                limit: limitPerPage,
            };
            const data = await fetchStudentAnnualFinancialSummary(token, params);
            setSummaryData(data.items || []);
            setTotalItems(data.total || 0);
            setTotalPages(data.pages || 0);
            if (!data.items || data.items.length === 0) {
                // No mostrar toast aquí, la tabla mostrará "No se encontraron datos"
            }
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar resumen financiero: ${err.message}`);
            setSummaryData([]); setTotalItems(0); setTotalPages(0);
        } finally {
            setIsLoading(false);
        }
    }, [token, selectedSchoolYearStartYear, selectedSchoolYearStartMonth, studentSearchTerm, filterDelinquencyStatus, currentPage, limitPerPage]);

    useEffect(() => { fetchRate(); }, [fetchRate]);

    useEffect(() => {
        if (!isLoadingRate) { fetchFinancialSummary(); }
    }, [fetchFinancialSummary, isLoadingRate]);

    useEffect(() => { setCurrentPage(1); }, [selectedSchoolYearStartYear, studentSearchTerm, filterDelinquencyStatus]);

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage && !isLoading) {
            setCurrentPage(newPage);
        }
    };

    const toggleDisplayCurrency = () => {
        if (currentUsdToVesRate) setDisplayCurrency(prev => prev === 'VES' ? 'USD' : 'VES');
        else toast.warn("Tasa USD no disponible.");
    };

    const monthHeaders = useMemo(() => {
        if (!selectedSchoolYearStartYear) return [];
        const headers = [];
        let currentMonth = selectedSchoolYearStartMonth;
        let currentYear = selectedSchoolYearStartYear;
        for (let i = 0; i < 12; i++) {
            headers.push({
                key: `${currentYear}-${String(currentMonth).padStart(2, '0')}`,
                label: `${MONTH_NAMES_ES_SHORT[currentMonth]}. '${String(currentYear).slice(-2)}`
            });
            currentMonth++;
            if (currentMonth > 12) { currentMonth = 1; currentYear++; }
        }
        return headers;
    }, [selectedSchoolYearStartYear, selectedSchoolYearStartMonth]);

    const getDelinquencyColorClass = (status) => {
        if (!showDelinquencyColors) return 'hover:bg-gray-50'; // Comportamiento normal sin colores
        switch (status) {
            case 'green': return 'hover:bg-gray-200';
            case 'orange': return 'bg-orange-100 hover:bg-orange-300';
            case 'red': return 'bg-red-100 hover:bg-red-300';
            default: return 'hover:bg-gray-50';
        }
    };
    
    // --- LÓGICA DE EXPORTACIÓN ---
    const handleExportMatrix = async (format) => {
        if (!token) { toast.error("Autenticación requerida."); return; }
        if (!selectedSchoolYearStartYear) { toast.warn("Seleccione un año escolar."); return; }
        
        setIsLoadingExport(true);
        try {
            // Para exportar TODO, esto hace llamada sin paginación
            const params = {
                schoolYearStartYear: selectedSchoolYearStartYear,
                schoolYearStartMonth: selectedSchoolYearStartMonth,
                studentSearchTerm: studentSearchTerm || null,
                delinquencyFilter: filterDelinquencyStatus || null,
                skip: 0,
                limit: totalItems > 0 ? totalItems : 1000, // Cargar todos los items filtrados
            };
            const allData = await fetchStudentAnnualFinancialSummary(token, params);
            const dataForExport = allData.items || [];

            if (dataForExport.length === 0) {
                toast.info("No hay datos en la matriz para exportar con los filtros actuales.");
                setIsLoadingExport(false);
                return;
            }

            const baseHeaders = [
                { key: 'student_full_name', label: 'Estudiante' },
                { key: 'student_cedula', label: 'Cédula' },
            ];
            const monthExportHeaders = monthHeaders.map(mh => ({
                key: `month_debt_${mh.key}`, // Clave única para datos procesados
                label: mh.label
            }));
            const finalHeaders = [
                ...baseHeaders,
                ...monthExportHeaders,
                { key: 'total_outstanding_debt_display', label: `Deuda Total Pend. (${displayCurrency})` },
                { key: 'delinquency_status_label', label: 'Estado Morosidad' }
            ];

            const delinquencyLabels = { green: "Al Día", orange: "Retraso Leve", red: "Retraso Grave", none: "N/A" };

            const processedDataToExport = dataForExport.map(row => {
                const monthlyDebtsProcessed = {};
                monthHeaders.forEach(mh => {
                    const monthDetail = row.monthly_debt_details.find(md => md.month_year === mh.key);
                    const debtValue = monthDetail 
                        ? (displayCurrency === 'USD' && monthDetail.debt_generated_usd_equivalent !== null && currentUsdToVesRate ? monthDetail.debt_generated_usd_equivalent : monthDetail.debt_generated_ves) 
                        : 0;
                    monthlyDebtsProcessed[`month_debt_${mh.key}`] = debtValue !== null && debtValue !== undefined ? parseFloat(debtValue).toFixed(2) : '0.00';
                });

                return {
                    student_full_name: row.student_full_name,
                    student_cedula: row.student_cedula || '',
                    ...monthlyDebtsProcessed,
                    total_outstanding_debt_display: parseFloat(
                        displayCurrency === 'USD' && row.total_outstanding_debt_usd_equivalent !== null && currentUsdToVesRate 
                        ? row.total_outstanding_debt_usd_equivalent 
                        : row.total_outstanding_debt_ves
                    ).toFixed(2),
                    delinquency_status_label: delinquencyLabels[row.delinquency_status] || row.delinquency_status,
                };
            });
            
            const filenameBase = `matriz_financiera_estudiantes_${selectedSchoolYearStartYear}_${displayCurrency}`;

            if (format === 'csv') {
                exportToCSV(processedDataToExport, finalHeaders, `${filenameBase}.csv`);
            } else if (format === 'xlsx') {
                exportToXLSX(processedDataToExport, finalHeaders, `${filenameBase}.xlsx`, 'MatrizFinanciera');
            }
        } catch (err) {
            toast.error(`Error al generar exportación: ${err.message}`);
        } finally {
            setIsLoadingExport(false);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-6 bg-gray-100 min-h-screen">
            <header className="mb-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">Matriz Financiera de Estudiantes</h1>
                    <div className="flex items-center space-x-2">
                        {currentUsdToVesRate && (
                            <button
                                onClick={toggleDisplayCurrency}
                                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50 transition-colors"
                                title={`Tasa: ${currentUsdToVesRate?.toFixed(2)}`}
                            >
                                Ver en {displayCurrency === 'VES' ? 'USD' : 'Bs.S'}
                            </button>
                        )}
                        <button
                            onClick={() => setShowDelinquencyColors(prev => !prev)}
                            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-md shadow-sm"
                        >
                            {showDelinquencyColors ? 'Quitar' : 'Mostrar'} Colores
                        </button>
                        <button
                            onClick={() => handleExportMatrix('csv')}
                            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md shadow-sm"
                            disabled={isLoading || isLoadingExport || summaryData.length === 0}
                        >
                            <ExportCSVIcon className="mr-2" />
                            {isLoadingExport ? 'Exportando...' : 'CSV'}
                        </button>
                        <button
                            onClick={() => handleExportMatrix('xlsx')}
                            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm"
                            disabled={isLoading || isLoadingExport || summaryData.length === 0}
                        >
                            <ExportExcelIcon className="mr-2" />
                            {isLoadingExport ? 'Exportando...' : 'Excel'}
                        </button>
                    </div>
                </div>
            </header>

            {/* Filtros */}
            <div className="mb-6 p-4 bg-white rounded-lg shadow grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label htmlFor="schoolYearFilterMatrix" className="block text-sm font-medium text-gray-700">Año Escolar (Inicia en Agosto)</label>
                    <select
                        id="schoolYearFilterMatrix"
                        value={selectedSchoolYearStartYear}
                        onChange={(e) => setSelectedSchoolYearStartYear(parseInt(e.target.value))}
                        className="mt-1 block w-full input-style-select"
                    >
                        {schoolYearOptions.map(year => <option key={year.value} value={year.value}>{year.label}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="studentSearchTermMatrix" className="block text-sm font-medium text-gray-700">Buscar Estudiante</label>
                    <input
                        type="text"
                        id="studentSearchTermMatrix"
                        value={studentSearchTerm}
                        onChange={(e) => setStudentSearchTerm(e.target.value)}
                        placeholder="Nombre o Cédula..."
                        className="mt-1 block w-full input-style"
                    />
                </div>
                <div>
                    <label htmlFor="filterDelinquencyStatusMatrix" className="block text-sm font-medium text-gray-700">Estado Morosidad</label>
                    <select
                        id="filterDelinquencyStatusMatrix"
                        value={filterDelinquencyStatus}
                        onChange={(e) => setFilterDelinquencyStatus(e.target.value)}
                        className="mt-1 block w-full input-style-select"
                    >
                        {DELINQUENCY_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </div>
            </div>

            {isLoading && <p className="text-center py-4 text-gray-600">Cargando datos financieros de estudiantes...</p>}
            {error && !isLoading && <p className="text-red-500 bg-red-100 p-3 rounded text-center mb-4">Error: {error}</p>}

            {!isLoading && !error && (
                <>
                    <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-100 z-20">Estudiante</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Cédula</th>
                                    {monthHeaders.map(mh => <th key={mh.key} className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">{mh.label}</th>)}
                                    <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap min-w-[120px]">Deuda Total Pend. ({displayCurrency})</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {summaryData.length > 0 ? summaryData.map((row) => (
                                    <tr key={row.student_id} className={`${getDelinquencyColorClass(row.delinquency_status)} transition-colors duration-150`}>
                                        <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900 sticky left-0 bg-inherit z-10">{row.student_full_name}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">{row.student_cedula || '-'}</td>
                                        {monthHeaders.map(mh => {
                                            const monthDetail = row.monthly_debt_details.find(md => md.month_year === mh.key);
                                            const debtToShow = monthDetail 
                                                ? (displayCurrency === 'USD' && monthDetail.debt_generated_usd_equivalent !== null && currentUsdToVesRate ? monthDetail.debt_generated_usd_equivalent : monthDetail.debt_generated_ves) 
                                                : 0;
                                            return <td key={mh.key} className="px-3 py-2 whitespace-nowrap text-right text-gray-600">{debtToShow > 0.001 ? formatCurrency(debtToShow, displayCurrency) : '-'}</td>;
                                        })}
                                        <td className="px-3 py-2 whitespace-nowrap text-right text-gray-700 font-semibold">
                                            {formatCurrency(displayCurrency === 'USD' && row.total_outstanding_debt_usd_equivalent !== null && currentUsdToVesRate ? row.total_outstanding_debt_usd_equivalent : row.total_outstanding_debt_ves, displayCurrency)}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={4 + monthHeaders.length} className="px-6 py-10 text-center text-sm text-gray-500">No se encontraron datos de estudiantes con los filtros aplicados.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 0 && (
                        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between text-xs">
                            <span className="mb-2 sm:mb-0">Página {currentPage} de {totalPages} (Total: {totalItems} estudiantes)</span>
                            <div className="flex space-x-1">
                                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="px-3 py-1 btn-secondary-xs disabled:opacity-50">Anterior</button>
                                <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="px-3 py-1 btn-secondary-xs disabled:opacity-50">Siguiente</button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default StudentFinancialMatrixPage;