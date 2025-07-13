// src/pages/DashboardPage.jsx

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getDashboardSummary, getRevenueTrend, getExpenseTrend, getBillingPaymentTrend } from '../services/apiDashboard';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { toast } from 'react-toastify';
import { 
    UserGroupIcon, AcademicCapIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon, 
    BanknotesIcon, ExclamationTriangleIcon, ArrowPathIcon 
} from '@heroicons/react/24/outline';

// --- Componentes Reutilizables de la UI ---

const StatCard = ({ title, value, isLoading, subtext = null, icon }) => {
    // Lógica para ajustar el tamaño de la fuente basado en la longitud del texto
    const valueFontSize = value && value.length > 12 ? "text-1xl" : "text-3xl";

    return (
        <div className="bg-white p-5 rounded-xl shadow-md hover:shadow-xl transition-shadow duration-300 flex items-start space-x-4">
            <div className="bg-slate-100 p-3 rounded-lg">
                {icon}
            </div>
            <div className="flex-1 overflow-hidden">
                <h3 className="text-sm font-medium text-slate-500 truncate">{title}</h3>
                {isLoading ? (
                    <div className="mt-2 space-y-2 animate-pulse">
                        <div className="h-8 bg-slate-200 rounded w-3/4"></div>
                        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                    </div>
                ) : (
                    <>
                        <p className={`mt-1 font-semibold text-slate-800 break-all ${valueFontSize}`}>{value}</p>
                        {subtext && <p className="text-xs text-slate-400 mt-1 truncate">{subtext}</p>}
                    </>
                )}
            </div>
        </div>
    );
};

const ChartCard = ({ title, children, filters, isLoading, error }) => (
    <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 border-b border-slate-200 pb-4">
            <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
            {filters && <div className="flex items-center space-x-2 mt-2 sm:mt-0">{filters}</div>}
        </div>
        <div className="h-[300px] w-full">
            {isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <ArrowPathIcon className="w-8 h-8 animate-spin mb-2" />
                    <span>Cargando datos...</span>
                </div>
            )}
            {error && !isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-red-600 bg-red-50 p-4 rounded-lg">
                    <ExclamationTriangleIcon className="w-8 h-8 mb-2" />
                    <p className="font-semibold">Error al cargar la gráfica</p>
                    <p className="text-sm">{error}</p>
                </div>
            )}
            {!isLoading && !error && children}
        </div>
    </div>
);

const GranularityToggle = ({ value, onChange }) => (
    <div className="flex p-0.5 bg-slate-100 rounded-md">
        <button 
            onClick={() => onChange('month')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${value === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-indigo-500'}`}
        >
            Mensual
        </button>
        <button 
            onClick={() => onChange('day')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${value === 'day' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-indigo-500'}`}
        >
            Diario
        </button>
    </div>
);


const formatMoneyForDisplay = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};

// --- Componente Principal ---

function DashboardPage() {
    const { token } = useAuth();
    const [summaryData, setSummaryData] = useState(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);
    const [errorSummary, setErrorSummary] = useState(null);

    const [revenueTrendData, setRevenueTrendData] = useState([]);
    const [isLoadingRevenueTrend, setIsLoadingRevenueTrend] = useState(true);
    const [errorRevenueTrend, setErrorRevenueTrend] = useState(null);
    
    const [expenseTrendData, setExpenseTrendData] = useState([]);
    const [isLoadingExpenseTrend, setIsLoadingExpenseTrend] = useState(true);
    const [errorExpenseTrend, setErrorExpenseTrend] = useState(null);

    const [billingPaymentTrendData, setBillingPaymentTrendData] = useState([]);
    const [isLoadingBillingPaymentTrend, setIsLoadingBillingPaymentTrend] = useState(true);
    const [errorBillingPaymentTrend, setErrorBillingPaymentTrend] = useState(null);
    
    const [displayCurrency, setDisplayCurrency] = useState('VES');
    const [trendGranularity, setTrendGranularity] = useState("month");

    // --- Lógica de Carga de Datos (con useCallback) ---
    const fetchDashboardSummary = useCallback(async () => {
        if (!token) return;
        setIsLoadingSummary(true);
        try {
            const data = await getDashboardSummary(token);
            setSummaryData(data);
        } catch (err) { setErrorSummary(err.message); }
        finally { setIsLoadingSummary(false); }
    }, [token]);

    const fetchRevenueTrend = useCallback(async () => {
        if (!token) return;
        setIsLoadingRevenueTrend(true);
        try {
            const data = await getRevenueTrend(token, trendGranularity, trendGranularity === 'month' ? 12 : 30);
            setRevenueTrendData(data.map(item => ({ name: item.period, IngresosVES: item.revenue_ves, IngresosUSD: item.revenue_usd_equivalent })));
        } catch (err) { setErrorRevenueTrend(err.message); setRevenueTrendData([]); }
        finally { setIsLoadingRevenueTrend(false); }
    }, [token, trendGranularity]);

    const fetchExpenseTrendData = useCallback(async () => {
        if (!token) return;
        setIsLoadingExpenseTrend(true);
        try {
            const data = await getExpenseTrend(token, trendGranularity, trendGranularity === 'month' ? 12 : 30);
            setExpenseTrendData(data.map(item => ({ name: item.period, GastosVES: item.expenses_ves, GastosUSD: item.expenses_usd_equivalent })));
        } catch (err) { setErrorExpenseTrend(err.message); setExpenseTrendData([]); }
        finally { setIsLoadingExpenseTrend(false); }
    }, [token, trendGranularity]);
    
    const fetchBillingPaymentTrend = useCallback(async () => {
        if (!token) return;
        setIsLoadingBillingPaymentTrend(true);
        try {
            const data = await getBillingPaymentTrend(token, 12); 
            setBillingPaymentTrendData(data.map(item => ({ name: item.period, CargadoVES: item.total_charged_ves_emission, PagadoVES: item.total_paid_in_period_ves })));
        } catch (err) { setErrorBillingPaymentTrend(err.message); setBillingPaymentTrendData([]); }
        finally { setIsLoadingBillingPaymentTrend(false); }
    }, [token]);

    useEffect(() => {
        fetchDashboardSummary();
        fetchBillingPaymentTrend();
    }, [fetchDashboardSummary, fetchBillingPaymentTrend]);
    
    useEffect(() => { 
        fetchRevenueTrend();
        fetchExpenseTrendData();
    }, [fetchRevenueTrend, fetchExpenseTrendData]);

    // --- Lógica de Visualización (con useMemo para optimización) ---
    const toggleDisplayCurrency = () => setDisplayCurrency(prev => prev === 'VES' ? 'USD' : 'VES');
    const currentRateForConversion = summaryData?.current_usd_to_ves_rate_used;

    const revenueDisplay = formatMoneyForDisplay(displayCurrency === 'VES' ? summaryData?.revenue_current_month_ves : summaryData?.revenue_current_month_usd_equivalent, displayCurrency);
    const debtDisplay = formatMoneyForDisplay(displayCurrency === 'VES' ? summaryData?.total_outstanding_debt_ves : summaryData?.total_outstanding_debt_usd_equivalent, displayCurrency);
    const expensesDisplay = formatMoneyForDisplay(displayCurrency === 'VES' ? summaryData?.total_expenses_current_month_ves : summaryData?.total_expenses_current_month_usd_equivalent, displayCurrency);
    
    const combinedTrendData = useMemo(() => revenueTrendData.map(revItem => {
        const expItem = expenseTrendData.find(exp => exp.name === revItem.name);
        return {
            name: revItem.name,
            Ingresos: displayCurrency === 'VES' ? revItem.IngresosVES : revItem.IngresosUSD,
            Gastos: expItem ? (displayCurrency === 'VES' ? expItem.GastosVES : expItem.GastosUSD) : 0,
        };
    }), [revenueTrendData, expenseTrendData, displayCurrency]);

    const processedBillingData = useMemo(() => billingPaymentTrendData.map(item => ({
        name: item.name,
        "Total Cargado": displayCurrency === 'VES' || !currentRateForConversion ? item.CargadoVES : parseFloat((item.CargadoVES / currentRateForConversion).toFixed(2)),
        "Total Pagado": displayCurrency === 'VES' || !currentRateForConversion ? item.PagadoVES : parseFloat((item.PagadoVES / currentRateForConversion).toFixed(2)),
    })), [billingPaymentTrendData, displayCurrency, currentRateForConversion]);


    return (
        <div className="p-4 md:p-6 bg-slate-100 min-h-full space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <h1 className="text-3xl font-extrabold text-slate-800">Dashboard Principal</h1>
                <button
                    onClick={toggleDisplayCurrency}
                    className="inline-flex items-center gap-x-2 px-3 py-2 text-sm font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none"
                    disabled={isLoadingSummary || (!currentRateForConversion && displayCurrency === 'VES')}
                    title={!currentRateForConversion ? "Tasa USD no disponible" : `Ver en ${displayCurrency === 'VES' ? 'USD' : 'VES'}`}
                >
                    Mostrar en {displayCurrency === 'VES' ? 'USD' : 'VES'}
                </button>
            </div>

            {errorSummary && <p className="text-red-600 bg-red-100 p-3 rounded text-center">Error al cargar resumen: {errorSummary}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <StatCard title="Total Representantes" value={summaryData?.total_representatives?.toString() ?? '...'} isLoading={isLoadingSummary} icon={<UserGroupIcon className="w-6 h-6 text-blue-500" />} />
                <StatCard title="Estudiantes Activos" value={summaryData?.total_active_students?.toString() ?? '...'} isLoading={isLoadingSummary} icon={<AcademicCapIcon className="w-6 h-6 text-teal-500"/>} />
                <StatCard title={`Ingresos (Mes Actual)`} value={revenueDisplay} isLoading={isLoadingSummary} subtext={displayCurrency === 'USD' && currentRateForConversion ? `Tasa Ref: ${currentRateForConversion.toFixed(2)}` : null} icon={<ArrowTrendingUpIcon className="w-6 h-6 text-green-500" />} />
                <StatCard title={`Gastos (Mes Actual)`} value={expensesDisplay} isLoading={isLoadingSummary} icon={<ArrowTrendingDownIcon className="w-6 h-6 text-red-500"/>} />
                <StatCard title={`Deuda Pendiente Total`} value={debtDisplay} isLoading={isLoadingSummary} subtext={displayCurrency === 'VES' ? "Indexado a tasa actual" : null } icon={<BanknotesIcon className="w-6 h-6 text-orange-500" />} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <ChartCard 
                    title="Flujo de Caja (Ingresos vs. Gastos)"
                    isLoading={isLoadingRevenueTrend || isLoadingExpenseTrend}
                    error={errorRevenueTrend || errorExpenseTrend}
                    filters={<GranularityToggle value={trendGranularity} onChange={setTrendGranularity} />}
                >
                    <ResponsiveContainer>
                        <BarChart data={combinedTrendData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                            <XAxis dataKey="name" style={{ fontSize: '0.75rem' }} />
                            <YAxis tickFormatter={(val) => new Intl.NumberFormat('es-VE', { notation: "compact", compactDisplay: "short" }).format(val)} style={{ fontSize: '0.75rem' }}/>
                            <Tooltip formatter={(value) => formatMoneyForDisplay(value, displayCurrency)} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(2px)', border: '1px solid #ddd', borderRadius: '0.5rem' }} />
                            <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
                            <Bar dataKey="Ingresos" fill="#22c55e" name={`Ingresos (${displayCurrency})`} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Gastos" fill="#ef4444" name={`Gastos (${displayCurrency})`} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
                
                <ChartCard 
                    title="Facturado vs. Pagado (Últimos 12 Meses)"
                    isLoading={isLoadingBillingPaymentTrend}
                    error={errorBillingPaymentTrend}
                >
                     <ResponsiveContainer>
                        <BarChart data={processedBillingData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                            <XAxis dataKey="name" angle={-40} textAnchor="end" height={60} interval={0} style={{ fontSize: '0.7rem' }} />
                            <YAxis tickFormatter={(val) => new Intl.NumberFormat('es-VE', { notation: "compact", compactDisplay: "short" }).format(val)} style={{ fontSize: '0.75rem' }}/>
                            <Tooltip formatter={(value) => formatMoneyForDisplay(value, displayCurrency)} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(2px)', border: '1px solid #ddd', borderRadius: '0.5rem' }} />
                            <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
                            <Bar dataKey="Total Cargado" fill="#6366f1" name={`Total Cargado (${displayCurrency})`} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Total Pagado" fill="#38bdf8" name={`Total Pagado (${displayCurrency})`} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>
        </div>
    );
}

export default DashboardPage;