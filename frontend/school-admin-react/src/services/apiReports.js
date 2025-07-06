const API_BASE_URL = "http://127.0.0.1:8000"; // O tu constante global

// Helper para manejar respuestas de la API
const handleApiResponse = async (response) => {
    if (!response.ok) {
        // Intenta obtener el detalle del error del JSON, si falla, usa el statusText
        const errorData = await response.json().catch(() => ({ detail: response.statusText || `Error ${response.status}` }));
        throw new Error(errorData.detail || `Error ${response.status}`);
    }
    // Manejar respuestas 204 No Content que son .ok pero no tienen cuerpo JSON
    if (response.status === 204) {
        return null;
    }
    return response.json();
};

/**
 * Obtiene el resumen de gastos agrupados por categoría.
 * @param {string} token - El token de autenticación.
 * @param {object} params - Parámetros de la solicitud.
 * @param {string} params.startDate - Fecha de inicio (YYYY-MM-DD).
 * @param {string} params.endDate - Fecha de fin (YYYY-MM-DD).
 * @param {string} [params.personnelExpensesFilter=null] - Filtro para gastos de personal ("show_only_personnel", "exclude_personnel").
 * @returns {Promise<Array<object>>} - Lista de objetos ExpenseSummaryByCategory.
 */
export async function fetchExpensesSummaryByCategory(token, { startDate, endDate, personnelExpensesFilter = null }) {
    if (!startDate || !endDate) {
        throw new Error("Las fechas de inicio y fin son obligatorias para el reporte por categoría.");
    }
    const queryParams = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
    });
    if (personnelExpensesFilter) {
        queryParams.append('personnel_expenses_filter', personnelExpensesFilter);
    }

    const response = await fetch(`${API_BASE_URL}/expenses/reports/by-category?${queryParams.toString()}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}

/**
 * Obtiene el resumen de gastos agrupados por proveedor.
 * @param {string} token - El token de autenticación.
 * @param {object} params - Parámetros de la solicitud.
 * @param {string} params.startDate - Fecha de inicio (YYYY-MM-DD).
 * @param {string} params.endDate - Fecha de fin (YYYY-MM-DD).
 * @param {string} [params.personnelExpensesFilter=null] - Filtro para gastos de personal.
 * @returns {Promise<Array<object>>} - Lista de objetos ExpenseSummaryBySupplier.
 */
export async function fetchExpensesSummaryBySupplier(token, { startDate, endDate, personnelExpensesFilter = null }) {
    if (!startDate || !endDate) {
        throw new Error("Las fechas de inicio y fin son obligatorias para el reporte por proveedor.");
    }
    const queryParams = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
    });
    if (personnelExpensesFilter) {
        queryParams.append('personnel_expenses_filter', personnelExpensesFilter);
    }

    const response = await fetch(`${API_BASE_URL}/expenses/reports/by-supplier?${queryParams.toString()}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}

/**
 * Obtiene la tendencia de gastos para un rango de fechas y granularidad.
 * @param {string} token - El token de autenticación.
 * @param {object} params - Parámetros de la solicitud.
 * @param {string} params.startDate - Fecha de inicio (YYYY-MM-DD).
 * @param {string} params.endDate - Fecha de fin (YYYY-MM-DD).
 * @param {string} params.granularity - 'day', 'month', o 'year'.
 * @param {string} [params.personnelExpensesFilter=null] - Filtro para gastos de personal.
 * @returns {Promise<Array<object>>} - Lista de objetos MonthlyExpenseSummary (o equivalente).
 */
export async function fetchExpenseTrendReport(token, { startDate, endDate, granularity = "month", personnelExpensesFilter = null }) {
    if (!startDate || !endDate) {
        throw new Error("Las fechas de inicio y fin son obligatorias para el reporte de tendencia.");
    }
    const queryParams = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        granularity: granularity,
    });
    if (personnelExpensesFilter) {
        queryParams.append('personnel_expenses_filter', personnelExpensesFilter);
    }

    const response = await fetch(`${API_BASE_URL}/expenses/reports/trend?${queryParams.toString()}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}

/**
 * Obtiene el listado detallado de transacciones de gastos.
 * @param {string} token - El token de autenticación.
 * @param {object} params - Parámetros de la solicitud.
 * @param {string} params.startDate - Fecha de inicio (YYYY-MM-DD).
 * @param {string} params.endDate - Fecha de fin (YYYY-MM-DD).
 * @param {string} [params.personnelExpensesFilter=null] - Filtro para gastos de personal.
 * @returns {Promise<Array<object>>} - Lista de objetos DetailedExpenseTransaction.
 */
export async function fetchDetailedExpenseTransactions(token, { startDate, endDate, personnelExpensesFilter = null }) {
    if (!startDate || !endDate) {
        throw new Error("Las fechas de inicio y fin son obligatorias para el reporte detallado.");
    }
    const queryParams = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
    });
    if (personnelExpensesFilter) {
        queryParams.append('personnel_expenses_filter', personnelExpensesFilter);
    }

    const response = await fetch(`${API_BASE_URL}/expenses/reports/detailed-transactions?${queryParams.toString()}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}

// --- Funciones para el Dashboard Principal (si se mantienen en este archivo) ---

/**
 * Obtiene el resumen del dashboard principal.
 * @param {string} token - El token de autenticación.
 * @returns {Promise<object>} - Objeto con los datos del resumen del dashboard.
 */
export async function getDashboardSummary(token) {
    const response = await fetch(`${API_BASE_URL}/dashboard/summary`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response); //
}

/**
 * Obtiene la tendencia de ingresos.
 * @param {string} token - El token de autenticación.
 * @param {string} granularity - Granularidad ('day' o 'month').
 * @param {number} count - Número de períodos hacia atrás.
 * @returns {Promise<Array<object>>} - Lista de datos de la tendencia de ingresos.
 */
export async function getRevenueTrend(token, granularity, count) {
    const params = new URLSearchParams({ granularity, count });
    const response = await fetch(`${API_BASE_URL}/dashboard/revenue-trend?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response); //
}

/**
 * Obtiene la tendencia de gastos para el dashboard principal.
 * @param {string} token - El token de autenticación.
 * @param {string} granularity - Granularidad ('day' o 'month').
 * @param {number} count - Número de períodos hacia atrás.
 * @returns {Promise<Array<object>>} - Lista de datos de la tendencia de gastos.
 */
export async function getExpenseTrend(token, granularity, count) {
    const params = new URLSearchParams({ granularity, count });
    const response = await fetch(`${API_BASE_URL}/dashboard/expense-trend?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response); //
}

/**
 * Obtiene la comparación mensual entre cargos emitidos y pagos recibidos.
 * @param {string} token - El token de autenticación.
 * @param {number} months - Número de meses hacia atrás para la comparación.
 * @returns {Promise<Array<object>>} - Lista de datos de la comparación.
 */
export async function getBillingPaymentTrend(token, months) {
    const params = new URLSearchParams({ months });
    const response = await fetch(`${API_BASE_URL}/dashboard/billing-payment-trend?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response); //
}