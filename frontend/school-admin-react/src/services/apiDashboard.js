const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;


const handleApiResponse = async (response) => { 
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText || `Error ${response.status}` }));
        throw new Error(errorData.detail || `Error ${response.status}`);
    }
    if (response.status === 204) {
        return null;
    }
    return response.json();
};


export async function getDashboardSummary(token) {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/summary`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching dashboard summary:', error);
        throw error;
    }
}

// Nueva función para la tendencia de gastos
export async function getExpenseTrend(token, granularity = "month", count = 12) {
    try {
        const queryParams = new URLSearchParams({
            granularity: granularity,
            count: count.toString(),
        });
        const response = await fetch(`${API_BASE_URL}/dashboard/expense-trend?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json(); // Espera List[MonthlyExpenseSummary]
    } catch (error) {
        console.error('Error fetching expense trend:', error);
        throw error;
    }
}

export async function getRevenueTrend(token, granularity = "month", count = 12) {
    try {
        const queryParams = new URLSearchParams({
            granularity: granularity,
            count: count.toString(),
        });
        const response = await fetch(`${API_BASE_URL}/dashboard/revenue-trend?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching revenue trend:', error);
        throw error;
    }
}


export async function getBillingPaymentTrend(token, months = 12) {
    try {
        const queryParams = new URLSearchParams({ months: months.toString() });
        const response = await fetch(`${API_BASE_URL}/dashboard/billing-payment-trend?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching billing/payment trend:', error);
        throw error;
    }
}


export const fetchExchangeRateAlertStatus = async (token) => {
    const response = await fetch(`${API_BASE_URL}/dashboard/alerts/exchange-rate-status`, { // La ruta del nuevo endpoint
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
};

export async function getDashboardData(token) {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error('Error en la función getDashboardData:', error.message);
        throw error;
    }
}