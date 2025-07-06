// frontend/school-admin-react/src/pages/ExpenseReportPage.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    fetchExpensesSummaryByCategory,
    fetchExpensesSummaryBySupplier,
    fetchExpenseTrendReport,
    fetchDetailedExpenseTransactions
} from '../services/apiReports';
import { getLatestExchangeRate } from '../services/apiExchangeRates';
import { getSchoolConfiguration } from '../services/apiSettings';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { toast } from 'react-toastify';
import PrintableExpenseReport from '../components/PrintableExpenseReport';
import { exportToCSV, exportToXLSX } from '../utils/exportUtils';

// --- Iconos SVG ---
const PrinterIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M5 2.5a2.5 2.5 0 00-2.5 2.5v9.5A2.5 2.5 0 005 17h10a2.5 2.5 0 002.5-2.5V5A2.5 2.5 0 0015 2.5H5zM4.75 5a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 014.75 5zm0 2.5a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5a.75.75 0 01-.75-.75zM4.75 10a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg>;
const ArrowDownTrayIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" {...props}><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" /><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" /></svg>;
const DocumentChartBarIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M12.5 2.75a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V4.66L6.53 10.41a.75.75 0 01-1.06-1.06l5.25-5.25H9a.75.75 0 010-1.5h4.25z" /><path d="M3.5 3.5a.75.75 0 00-1.5 0v13.5A2.75 2.75 0 004.75 19h10.5A2.75 2.75 0 0018 16.25V9.75a.75.75 0 00-1.5 0v6.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25V3.5z" /></svg>;
const ArrowsRightLeftIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M15.97 2.47a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 11-1.06-1.06L18.19 7H4.75a.75.75 0 010-1.5h13.44l-2.22-2.22a.75.75 0 010-1.06zM4.03 17.53a.75.75 0 01-1.06 0l-3.25-3.25a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 1.06L1.81 13h13.44a.75.75 0 010 1.5H1.81l2.22 2.22a.75.75 0 010 1.06z" clipRule="evenodd" /></svg>;

// Helpers
const formatCurrency = (amount, currency = 'Bs.S', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: 'VES', minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD') {
        locale = 'en-US';
        options.currency = 'USD';
    }
    const formatted = parseFloat(amount).toLocaleString(locale, options);
    // Para consistencia visual, siempre mostrar Bs.S
    return formatted.replace(/VE(F|S)/, 'Bs.S');
};
const formatDateForDisplay = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-VE', {day: '2-digit', month: '2-digit', year: 'numeric'});
};

// Constantes
const REPORT_TYPES = [{ value: 'byCategory', label: 'Gastos por Categoría' }, { value: 'bySupplier', label: 'Gastos por Proveedor' }, { value: 'trend', label: 'Tendencia de Gastos' }];
const GRANULARITY_OPTIONS = [{ value: 'day', label: 'Diario' }, { value: 'month', label: 'Mensual' }, { value: 'year', label: 'Anual' }];
const PERSONNEL_FILTER_OPTIONS = [{ value: "", label: "Todos los Gastos" }, { value: "show_only_personnel", label: "Solo Sueldos y Salarios" }, { value: "exclude_personnel", label: "Excluir Sueldos y Salarios" }];
const CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82Ca9D', '#FF7300', '#A4DE6C', '#D0ED57', '#FFC658'];

function ExpenseReportsPage() {
    const { token } = useAuth();
    const getFirstDayOfCurrentMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const getLastDayOfCurrentMonth = () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];
    
    // Estados de Filtros y UI
    const [selectedReportType, setSelectedReportType] = useState(REPORT_TYPES[0].value);
    const [startDate, setStartDate] = useState(getFirstDayOfCurrentMonth());
    const [endDate, setEndDate] = useState(getLastDayOfCurrentMonth());
    const [displayCurrency, setDisplayCurrency] = useState('Bs.S');
    const [trendGranularity, setTrendGranularity] = useState(GRANULARITY_OPTIONS[1].value);
    const [personnelFilterOption, setPersonnelFilterOption] = useState('');
    const [showPrintPreview, setShowPrintPreview] = useState(false);

    // Estados de Datos y Carga
    const [currentUsdToVesRate, setCurrentUsdToVesRate] = useState(null);
    const [schoolConfig, setSchoolConfig] = useState(null);
    const [categoryReportData, setCategoryReportData] = useState([]);
    const [supplierReportData, setSupplierReportData] = useState([]);
    const [supplierOptions, setSupplierOptions] = useState([]); // <-- NUEVO ESTADO PARA EL FILTRO
    const [trendReportData, setTrendReportData] = useState([]);
    const [dataForPrint, setDataForPrint] = useState(null);
    
    // Estados de Carga y Error
    const [isLoadingRate, setIsLoadingRate] = useState(false);
    const [isLoadingSchoolConfig, setIsLoadingSchoolConfig] = useState(true);
    const [isLoadingCategoryReport, setIsLoadingCategoryReport] = useState(false);
    const [errorCategoryReport, setErrorCategoryReport] = useState(null);
    const [isLoadingSupplierReport, setIsLoadingSupplierReport] = useState(false);
    const [errorSupplierReport, setErrorSupplierReport] = useState(null);
    const [isLoadingTrendReport, setIsLoadingTrendReport] = useState(false);
    const [errorTrendReport, setErrorTrendReport] = useState(null);
    const [isLoadingExport, setIsLoadingExport] = useState(false);

    const fetchCurrentRate = useCallback(async () => { if (!token) return; setIsLoadingRate(true); try { const rateData = await getLatestExchangeRate(token, "USD"); if (rateData && rateData.rate) setCurrentUsdToVesRate(rateData.rate); else setCurrentUsdToVesRate(null); } catch (err) { console.error("Error fetching rate:", err); setCurrentUsdToVesRate(null); } finally { setIsLoadingRate(false); } }, [token]);
    const fetchSchoolConfigForPrint = useCallback(async () => { if (!token) { setIsLoadingSchoolConfig(false); return; } setIsLoadingSchoolConfig(true); try { const config = await getSchoolConfiguration(token); setSchoolConfig(config); } catch (err) { console.error("Error fetching school config:", err); } finally { setIsLoadingSchoolConfig(false); } }, [token]);
    
    useEffect(() => { fetchCurrentRate(); fetchSchoolConfigForPrint(); }, [fetchCurrentRate, fetchSchoolConfigForPrint]);

    const handleGenerateReport = useCallback(async () => {
        if (!token || !startDate || !endDate) return;
        if (new Date(startDate) > new Date(endDate)) { toast.warn("La fecha de inicio no puede ser posterior a la fecha de fin."); return; }
        
        const reportParams = { startDate, endDate, personnelExpensesFilter: personnelFilterOption || null };

        if (selectedReportType === 'byCategory') {
            setIsLoadingCategoryReport(true); setErrorCategoryReport(null); setCategoryReportData([]);
            try {
                const data = await fetchExpensesSummaryByCategory(token, reportParams);
                setCategoryReportData(data || []);
                if (!data || data.length === 0) toast.info("No hay datos por categoría para el período seleccionado.");
            } catch (err) {
                setErrorCategoryReport(err.message);
                toast.error(`Error reporte por categoría: ${err.message}`);
            } finally {
                setIsLoadingCategoryReport(false);
            }
        } else if (selectedReportType === 'bySupplier') {
            setIsLoadingSupplierReport(true); setErrorSupplierReport(null); setSupplierReportData([]);
            setSupplierOptions([]); // Limpiar opciones antes de cada búsqueda
            try {
                // CORRECCIÓN: Llamar a la función correcta
                const data = await fetchExpensesSummaryBySupplier(token, reportParams);
                setSupplierReportData(data || []);

                // LÓGICA AÑADIDA: Extraer proveedores para el menú desplegable
                if (data && data.length > 0) {
                    const uniqueSuppliers = data.map(item => ({
                        id: item.supplier_id,
                        name: item.supplier_name || 'Sin Proveedor Asignado'
                    }));
                    setSupplierOptions(uniqueSuppliers);
                }

                if (!data || data.length === 0) toast.info("No hay datos por proveedor para el período seleccionado.");
            } catch (err) {
                setErrorSupplierReport(err.message);
                toast.error(`Error reporte por proveedor: ${err.message}`);
            } finally {
                setIsLoadingSupplierReport(false);
            }
        } else if (selectedReportType === 'trend') {
            setIsLoadingTrendReport(true); setErrorTrendReport(null); setTrendReportData([]);
            try {
                // CORRECCIÓN: Llamar a la función correcta
                const data = await fetchExpenseTrendReport(token, { ...reportParams, granularity: trendGranularity });
                setTrendReportData(data || []); // El schema ya coincide con lo que el gráfico necesita
                if (!data || data.length === 0) toast.info("No hay datos de tendencia para el período seleccionado.");
            } catch (err) {
                setErrorTrendReport(err.message);
                toast.error(`Error reporte de tendencia: ${err.message}`);
            } finally {
                setIsLoadingTrendReport(false);
            }
        }
    }, [token, selectedReportType, startDate, endDate, trendGranularity, personnelFilterOption]);

    useEffect(() => {
        if (startDate && endDate && !isLoadingRate && !isLoadingSchoolConfig) {
            handleGenerateReport();
        }
    }, [startDate, endDate, selectedReportType, trendGranularity, personnelFilterOption, isLoadingRate, isLoadingSchoolConfig, handleGenerateReport]);
    
    // --- Resto de las funciones (sin cambios) ---
    const toggleDisplayCurrency = () => { if (currentUsdToVesRate) setDisplayCurrency(prev => prev === 'Bs.S' ? 'USD' : 'Bs.S'); else toast.warn("Tasa USD no disponible para cambiar visualización."); };
    const getDisplayValueForExportOrRender = (item, vesField, usdField) => { if (displayCurrency === 'USD') { if (item[usdField] !== undefined && item[usdField] !== null && currentUsdToVesRate) { return item[usdField]; } else if (currentUsdToVesRate && item[vesField] !== undefined && item[vesField] !== null) { return parseFloat((item[vesField] / currentUsdToVesRate).toFixed(2)); } } return item[vesField] ?? 0; };
    const handleOpenPrintPreview = () => { if (isLoadingSchoolConfig) { toast.info("Cargando datos de escuela..."); return; } let reportTitle = REPORT_TYPES.find(rt => rt.value === selectedReportType)?.label || "Reporte de Gastos"; let currentReportData; switch (selectedReportType) { case 'byCategory': currentReportData = categoryReportData; break; case 'bySupplier': currentReportData = supplierReportData; break; case 'trend': reportTitle = `Tendencia de Gastos (${GRANULARITY_OPTIONS.find(g => g.value === trendGranularity)?.label || trendGranularity})`; currentReportData = trendReportData; break; default: toast.warn("Tipo de reporte no válido."); return; } if (!currentReportData || currentReportData.length === 0) { toast.info("No hay datos generados para imprimir."); return; } setDataForPrint({ title: reportTitle, data: currentReportData, type: selectedReportType, dateRange: { startDate, endDate }, schoolConfig: schoolConfig, displayCurrency: displayCurrency, currentUsdToVesRate: currentUsdToVesRate, filtersApplied: { personnelFilterOption } }); setShowPrintPreview(true); };
    const getPersonnelFilterSuffix = () => { if (personnelFilterOption === "show_only_personnel") return "_solo_personal"; if (personnelFilterOption === "exclude_personnel") return "_sin_personal"; return ""; };
    const handleExportCSV = () => { let dataToExport = []; let reportHeaders = []; let filename = `reporte_gastos.csv`; const filterSuffix = getPersonnelFilterSuffix(); if (selectedReportType === 'byCategory') { if (categoryReportData.length === 0) { toast.info("No hay datos para exportar."); return; } reportHeaders = [ { key: 'category_name', label: 'Categoría' }, { key: 'display_total', label: `Total Gasto (${displayCurrency})` }, { key: 'expense_count', label: '# Transacciones' }]; dataToExport = categoryReportData.map(item => ({ ...item, display_total: getDisplayValueForExportOrRender(item, 'total_expenses_ves', 'total_expenses_usd_equivalent') })); filename = `gastos_por_categoria_${displayCurrency}${filterSuffix}_${startDate}_a_${endDate}.csv`; } else if (selectedReportType === 'bySupplier') { if (supplierReportData.length === 0) { toast.info("No hay datos para exportar."); return; } reportHeaders = [ { key: 'supplier_name', label: 'Proveedor' }, { key: 'display_total', label: `Total Gasto (${displayCurrency})` }, { key: 'expense_count', label: '# Transacciones' }]; dataToExport = supplierReportData.map(item => ({ ...item, supplier_name: item.supplier_name || 'Sin Proveedor', display_total: getDisplayValueForExportOrRender(item, 'total_expenses_ves', 'total_expenses_usd_equivalent') })); filename = `gastos_por_proveedor_${displayCurrency}${filterSuffix}_${startDate}_a_${endDate}.csv`; } else if (selectedReportType === 'trend') { if (trendReportData.length === 0) { toast.info("No hay datos para exportar."); return; } reportHeaders = [ { key: 'period', label: 'Período' }, { key: 'display_total', label: `Total Gastos (${displayCurrency})` }]; dataToExport = trendReportData.map(item => ({ ...item, display_total: getDisplayValueForExportOrRender(item, 'expenses_ves', 'expenses_usd_equivalent') })); filename = `tendencia_gastos_${trendGranularity}_${displayCurrency}${filterSuffix}_${startDate}_a_${endDate}.csv`; } else { toast.warn("Seleccione un reporte válido."); return; } exportToCSV(dataToExport, reportHeaders, filename); };
    const handleExportXLSX = () => { let dataToExport = []; let reportHeaders = []; let filename = `reporte_gastos.xlsx`; let sheetName = 'Reporte'; const filterSuffix = getPersonnelFilterSuffix(); if (selectedReportType === 'byCategory') { if (categoryReportData.length === 0) { toast.info("No hay datos para exportar."); return; } sheetName = 'GastosPorCategoria'; reportHeaders = [ { key: 'category_name', label: 'Categoría' }, { key: 'display_total', label: `Total Gasto (${displayCurrency})` }, { key: 'expense_count', label: '# Transacciones' }]; dataToExport = categoryReportData.map(item => ({ ...item, display_total: getDisplayValueForExportOrRender(item, 'total_expenses_ves', 'total_expenses_usd_equivalent') })); filename = `gastos_por_categoria_${displayCurrency}${filterSuffix}_${startDate}_a_${endDate}.xlsx`; } else if (selectedReportType === 'bySupplier') { if (supplierReportData.length === 0) { toast.info("No hay datos para exportar."); return; } sheetName = 'GastosPorProveedor'; reportHeaders = [ { key: 'supplier_name', label: 'Proveedor' }, { key: 'display_total', label: `Total Gasto (${displayCurrency})` }, { key: 'expense_count', label: '# Transacciones' }]; dataToExport = supplierReportData.map(item => ({ ...item, supplier_name: item.supplier_name || 'Sin Proveedor', display_total: getDisplayValueForExportOrRender(item, 'total_expenses_ves', 'total_expenses_usd_equivalent') })); filename = `gastos_por_proveedor_${displayCurrency}${filterSuffix}_${startDate}_a_${endDate}.xlsx`; } else if (selectedReportType === 'trend') { if (trendReportData.length === 0) { toast.info("No hay datos para exportar."); return; } sheetName = 'TendenciaDeGastos'; reportHeaders = [ { key: 'period', label: 'Período' }, { key: 'display_total', label: `Total Gastos (${displayCurrency})` }]; dataToExport = trendReportData.map(item => ({ ...item, display_total: getDisplayValueForExportOrRender(item, 'expenses_ves', 'expenses_usd_equivalent') })); filename = `tendencia_gastos_${trendGranularity}_${displayCurrency}${filterSuffix}_${startDate}_a_${endDate}.xlsx`; } else { toast.warn("Seleccione un reporte válido."); return; } exportToXLSX(dataToExport, reportHeaders, filename, sheetName); };
    const handleExportDetailedTransactions = async (format) => { if (!token) { toast.error("Autenticación requerida."); return; } if (!startDate || !endDate) { toast.warn("Seleccione un rango de fechas."); return; } if (new Date(startDate) > new Date(endDate)) { toast.warn("La fecha de inicio no puede ser posterior a la fecha de fin."); return; } setIsLoadingExport(true); try { const detailedData = await fetchDetailedExpenseTransactions(token, { startDate, endDate, personnelExpensesFilter: personnelFilterOption || null }); if (!detailedData || detailedData.length === 0) { toast.info("No hay transacciones detalladas para exportar."); setIsLoadingExport(false); return; } const headers = [ { key: 'expense_date', label: 'Fecha Gasto' }, { key: 'description', label: 'Descripción/Artículo' }, { key: 'category_name', label: 'Categoría' }, { key: 'supplier_name', label: 'Proveedor' }, { key: 'payment_status', label: 'Estado Pago' }, { key: 'original_amount', label: 'Monto Original' }, { key: 'original_currency', label: 'Moneda Original' }, { key: 'amount_ves_at_creation', label: `Gasto (${'Bs.S'} Creación)` }, { key: 'amount_usd_equivalent', label: `Gasto (USD Eq.)` } ]; const dataToExport = detailedData.map(item => ({...item, expense_date: formatDateForDisplay(item.expense_date) })); const filterSuffix = getPersonnelFilterSuffix(); const filenameBase = `detalle_gastos_transacciones${filterSuffix}_${startDate}_a_${endDate}`; if (format === 'csv') exportToCSV(dataToExport, headers, `${filenameBase}.csv`); else if (format === 'xlsx') exportToXLSX(dataToExport, headers, `${filenameBase}.xlsx`, 'DetalleGastos'); } catch (err) { toast.error(`Error generando exportación: ${err.message}`); } finally { setIsLoadingExport(false); } };
    
    const isAnyReportLoading = isLoadingCategoryReport || isLoadingSupplierReport || isLoadingTrendReport;
    const areGlobalLoadersActive = isLoadingRate || isLoadingSchoolConfig;
    let noDataForSelectedSummaryReport = true;
    if (selectedReportType === 'byCategory' && categoryReportData?.length > 0) noDataForSelectedSummaryReport = false;
    else if (selectedReportType === 'bySupplier' && supplierReportData?.length > 0) noDataForSelectedSummaryReport = false;
    else if (selectedReportType === 'trend' && trendReportData?.length > 0) noDataForSelectedSummaryReport = false;
    const isSummaryActionDisabled = isAnyReportLoading || areGlobalLoadersActive || noDataForSelectedSummaryReport;
    const isDetailedExportDisabled = isLoadingExport || areGlobalLoadersActive || !startDate || !endDate;
    
    const RenderReportContent = () => {
        const getDisplayData = (rawData, vesField, usdField) => rawData?.map(item => ({ ...item, display_total: getDisplayValueForExportOrRender(item, vesField, usdField) })) || [];
        const categoryTotal = useMemo(() => { if (selectedReportType !== 'byCategory' || !categoryReportData) return 0; const processedData = getDisplayData(categoryReportData, 'total_expenses_ves', 'total_expenses_usd_equivalent'); return processedData.reduce((acc, item) => acc + (item.display_total || 0), 0); }, [categoryReportData, displayCurrency, currentUsdToVesRate, selectedReportType]);
        const supplierTotal = useMemo(() => { if (selectedReportType !== 'bySupplier' || !supplierReportData) return 0; const processedData = getDisplayData(supplierReportData, 'total_expenses_ves', 'total_expenses_usd_equivalent'); return processedData.reduce((acc, item) => acc + (item.display_total || 0), 0); }, [supplierReportData, displayCurrency, currentUsdToVesRate, selectedReportType]);
        const renderLoading = (message) => <div className="text-center text-slate-500 py-10">{message}</div>;
        const renderError = (message) => <div className="text-red-500 bg-red-100 p-4 rounded-lg text-center">Error: {message}</div>;
        const renderNoData = () => <div className="text-center text-slate-500 py-10">No hay datos para mostrar con los filtros seleccionados.</div>;
        
        switch (selectedReportType) {
            case 'byCategory': {
                if (isLoadingCategoryReport) return renderLoading("Generando reporte...");
                if (errorCategoryReport) return renderError(errorCategoryReport);
                const processedCategoryData = getDisplayData(categoryReportData, 'total_expenses_ves', 'total_expenses_usd_equivalent');
                if (processedCategoryData.length === 0) return renderNoData();

                return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white p-6 rounded-xl shadow-xl shadow-slate-200/60">
                            <h3 className="text-xl font-bold mb-4 text-slate-700">Gastos por Categoría ({displayCurrency})</h3>
                            <div className="overflow-y-auto max-h-[32rem] relative">
                                <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
                                    <thead className="bg-slate-100 sticky top-0 z-10"><tr>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Categoría</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600 w-28"># Trans.</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600 w-40">Total ({displayCurrency})</th>
                                    </tr></thead>
                                    <tbody className="bg-white divide-y divide-slate-100">
                                        {processedCategoryData.map((item) => (
                                            <tr key={item.category_id}><td className="px-4 py-3 font-medium text-slate-800 truncate">{item.category_name}</td>
                                            <td className="px-4 py-3 text-right text-slate-600">{item.expense_count}</td>
                                            <td className="px-4 py-3 text-right text-slate-600 font-mono">{formatCurrency(item.display_total, displayCurrency)}</td></tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-200 sticky bottom-0"><tr>
                                        <td colSpan="2" className="px-4 py-3 font-bold text-slate-800 text-right text-base">TOTAL</td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono text-base">{formatCurrency(categoryTotal, displayCurrency)}</td>
                                    </tr></tfoot>
                                </table>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-xl shadow-slate-200/60">
                            <h3 className="text-xl font-bold mb-4 text-slate-700">Composición de Gastos ({displayCurrency})</h3>
                            <ResponsiveContainer width="100%" height={400}><BarChart data={processedCategoryData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tickFormatter={(value) => new Intl.NumberFormat('es-VE', { notation: "compact", compactDisplay: "short" }).format(value)} style={{fontSize: '0.75rem'}} />
                                <YAxis type="category" dataKey="category_name" width={120} interval={0} style={{fontSize: '0.75rem' }}/><Tooltip formatter={(value) => [formatCurrency(value, displayCurrency), "Total"]}/>
                                 <Bar dataKey="display_total" name={`Gasto (${displayCurrency})`} barSize={20}>{processedCategoryData.map((entry, index) => (<Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />))}</Bar>
                            </BarChart></ResponsiveContainer>
                        </div>
                    </div>
                );
            }
            case 'bySupplier': {
                if (isLoadingSupplierReport) return renderLoading("Generando reporte...");
                if (errorSupplierReport) return renderError(errorSupplierReport);
                const processedSupplierData = getDisplayData(supplierReportData, 'total_expenses_ves', 'total_expenses_usd_equivalent');
                if (processedSupplierData.length === 0) return renderNoData();

                return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white p-6 rounded-xl shadow-xl shadow-slate-200/60">
                            <h3 className="text-xl font-bold mb-4 text-slate-700">Gastos por Proveedor ({displayCurrency})</h3>
                            <div className="overflow-y-auto max-h-[32rem] relative">
                                <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
                                     <thead className="bg-slate-100 sticky top-0 z-10"><tr>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Proveedor</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600 w-28"># Trans.</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600 w-40">Total ({displayCurrency})</th>
                                     </tr></thead>
                                    <tbody className="bg-white divide-y divide-slate-100">
                                        {processedSupplierData.map((item, index) => (
                                            <tr key={item.supplier_id || `sin-proveedor-${index}`}><td className="px-4 py-3 font-medium text-slate-800 truncate">{item.supplier_name || 'Sin Proveedor'}</td>
                                            <td className="px-4 py-3 text-right text-slate-600">{item.expense_count}</td>
                                            <td className="px-4 py-3 text-right text-slate-600 font-mono">{formatCurrency(item.display_total, displayCurrency)}</td></tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-200 sticky bottom-0"><tr>
                                        <td colSpan="2" className="px-4 py-3 font-bold text-slate-800 text-right text-base">TOTAL</td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono text-base">{formatCurrency(supplierTotal, displayCurrency)}</td>
                                    </tr></tfoot>
                                </table>
                            </div>
                       </div>
                        <div className="bg-white p-6 rounded-xl shadow-xl shadow-slate-200/60">
                             <h3 className="text-xl font-bold mb-4 text-slate-700">Composición por Proveedor ({displayCurrency})</h3>
                             <ResponsiveContainer width="100%" height={400}><BarChart data={processedSupplierData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                               <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tickFormatter={(value) => new Intl.NumberFormat('es-VE', { notation: "compact", compactDisplay: "short" }).format(value)} style={{fontSize: '0.75rem'}} />
                               <YAxis type="category" dataKey="supplier_name" width={120} interval={0} style={{fontSize: '0.75rem' }}/><Tooltip formatter={(value) => [formatCurrency(value, displayCurrency), "Total"]}/>
                               <Bar dataKey="display_total" name={`Gasto (${displayCurrency})`} barSize={20}>{processedSupplierData.map((entry, index) => (<Cell key={`cell-supplier-${index}`} fill={CHART_COLORS[(index + 1) % CHART_COLORS.length]} />))}</Bar>
                           </BarChart></ResponsiveContainer>
                       </div>
                    </div>
                );
            }
            case 'trend': {
                if (isLoadingTrendReport) return renderLoading("Generando reporte de tendencia...");
                if (errorTrendReport) return renderError(errorTrendReport);
                const processedTrendData = getDisplayData(trendReportData, 'expenses_ves', 'expenses_usd_equivalent');
                if (processedTrendData.length === 0) return renderNoData();

                return (
                    <div className="bg-white p-6 rounded-xl shadow-xl shadow-slate-200/60">
                        <h3 className="text-xl font-bold mb-4 text-slate-700">Tendencia de Gastos ({displayCurrency})</h3>
                        <ResponsiveContainer width="100%" height={400}><LineChart data={processedTrendData} margin={{ top: 5, right: 30, left: 20, bottom: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" angle={-45} textAnchor="end" height={80} style={{fontSize: '0.75rem'}}/>
                             <YAxis style={{fontSize: '0.75rem'}} tickFormatter={(value) => new Intl.NumberFormat('es-VE', { notation: "compact", compactDisplay: "short" }).format(value)} />
                            <Tooltip formatter={(value) => [formatCurrency(value, displayCurrency), "Gastos"]}/><Legend />
                            <Line type="monotone" dataKey="display_total" name={`Gastos Totales (${displayCurrency})`} stroke="#8884d8" strokeWidth={2} activeDot={{ r: 8 }} />
                        </LineChart></ResponsiveContainer>
                    </div>
                );
            }
            default: return null;
        }
    };
    
    return (
        <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
            <div className="max-w-screen-2xl mx-auto">
                <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4 mb-8">
                    <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Reportes de Gastos</h1>
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={toggleDisplayCurrency} className="inline-flex items-center gap-x-2 px-3 py-2 text-sm font-semibold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none" disabled={!currentUsdToVesRate || isAnyReportLoading} title={`Ver en ${displayCurrency === 'Bs.S' ? 'USD' : 'Bs.S'}`}>
                             <ArrowsRightLeftIcon className="h-5 w-5" /> <span>Ver en {displayCurrency === 'Bs.S' ? 'USD' : 'Bs.S'}</span>
                        </button>
                        <div className="h-6 w-px bg-slate-300"></div>
                        <button onClick={handleOpenPrintPreview} className="inline-flex items-center gap-x-2 px-3 py-2 text-sm font-semibold text-slate-700 bg-gradient-to-br from-white to-orange-400 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-50 disabled:transform-none" disabled={isSummaryActionDisabled}><PrinterIcon className="h-5 w-5" /><span>Imprimir</span></button>
                        <button onClick={handleExportCSV} className="inline-flex items-center gap-x-2 px-3 py-2 text-sm font-semibold text-slate-700 bg-gradient-to-br from-white to-green-400 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-50 disabled:transform-none" disabled={isSummaryActionDisabled}><ArrowDownTrayIcon className="h-5 w-5" /><span>Resumen CSV</span></button>
                        <button onClick={handleExportXLSX} className="inline-flex items-center gap-x-2 px-3 py-2 text-sm font-semibold text-slate-700 bg-gradient-to-br from-white to-green-400 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-50 disabled:transform-none" disabled={isSummaryActionDisabled}><ArrowDownTrayIcon className="h-5 w-5" /><span>Resumen Excel</span></button>
                        <div className="h-6 w-px bg-slate-300"></div>
                        <button onClick={() => handleExportDetailedTransactions('csv')} className="inline-flex items-center gap-x-2 px-3 py-2 text-sm font-semibold text-white bg-gradient-to-br from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 rounded-lg shadow-lg hover:shadow-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none" disabled={isDetailedExportDisabled}><DocumentChartBarIcon className="h-5 w-5" /><span>Detalle CSV</span></button>
                        <button onClick={() => handleExportDetailedTransactions('xlsx')} className="inline-flex items-center gap-x-2 px-3 py-2 text-sm font-semibold text-white bg-gradient-to-br from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 rounded-lg shadow-lg hover:shadow-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none" disabled={isDetailedExportDisabled}><DocumentChartBarIcon className="h-5 w-5" /><span>Detalle Excel</span></button>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-xl shadow-slate-200/60 mb-8">
                     <h2 className="text-xl font-bold text-slate-700 mb-4">Configuración del Reporte</h2>
                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
                        <div className="w-full"><label htmlFor="reportType" className="label-style">Tipo de Reporte</label><select id="reportType" value={selectedReportType} onChange={(e) => setSelectedReportType(e.target.value)} className="select-style">{REPORT_TYPES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                         <div className="w-full"><label htmlFor="startDateReport" className="label-style">Fecha Inicio</label><input type="date" id="startDateReport" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="input-style"/></div>
                        <div className="w-full"><label htmlFor="endDateReport" className="label-style">Fecha Fin</label><input type="date" id="endDateReport" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className="input-style"/></div>
                        <div className="w-full"><label htmlFor="personnelFilterOption" className="label-style">Filtro de Personal</label><select id="personnelFilterOption" value={personnelFilterOption} onChange={(e) => setPersonnelFilterOption(e.target.value)} className="select-style">{PERSONNEL_FILTER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                        {selectedReportType === 'trend' && (
                            <div className="w-full lg:col-start-4"><label htmlFor="trendGranularity" className="label-style">Granularidad</label><select id="trendGranularity" value={trendGranularity} onChange={(e) => setTrendGranularity(e.target.value)} className="select-style">{GRANULARITY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                        )}
                        {/* El filtro dinámico de proveedor se mostraría aquí si lo implementas */}
                    </div>
                </div>
                
                <div className="mt-8">
                    <RenderReportContent />
                </div>
                
                {showPrintPreview && dataForPrint && <PrintableExpenseReport reportDetails={dataForPrint} onClose={() => setShowPrintPreview(false)} />}
            </div>
         </div>
    );
}

export default ExpenseReportsPage;
