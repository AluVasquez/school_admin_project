const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Helper centralizado para manejar respuestas de la API.
 * Procesa correctamente los errores de validación de FastAPI.
 * @param {Response} response - El objeto de respuesta de la API.
 * @returns {Promise<any>} - Los datos JSON de la respuesta o lanza un error con un mensaje descriptivo.
 */
async function handleApiResponse(response) {
    if (!response.ok) {
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        try {
            const errorData = await response.json();
            if (Array.isArray(errorData.detail)) {
                errorMessage = errorData.detail.map(err => 
                    `Campo '${err.loc[err.loc.length - 1]}': ${err.msg}`
                ).join('; ');
            } else if (typeof errorData.detail === 'string') {
                errorMessage = errorData.detail;
            }
        } catch (e) {
            console.warn("No se pudo parsear el JSON del cuerpo del error.");
        }
        throw new Error(errorMessage);
    }
    if (response.status === 204) return null;
    return response.json();
}


// --- Funciones para Expenses ---

export async function getExpenses(token, {
    skip = 0, limit = 20, expenseDateStart = null, expenseDateEnd = null,
    categoryId = null, supplierId = null, paymentStatus = null,
    searchDescription = null, sortBy = "expense_date", sortOrder = "desc"
} = {}) {
    try {
        const queryParams = new URLSearchParams({ skip, limit, sort_by: sortBy, sort_order: sortOrder });
        if (expenseDateStart) queryParams.append('expense_date_start', expenseDateStart);
        if (expenseDateEnd) queryParams.append('expense_date_end', expenseDateEnd);
        if (categoryId !== null) queryParams.append('category_id', categoryId);
        if (supplierId !== null) queryParams.append('supplier_id', supplierId);
        if (paymentStatus) queryParams.append('payment_status', paymentStatus);
        if (searchDescription) queryParams.append('search_description', searchDescription);

        const response = await fetch(`${API_BASE_URL}/expenses/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error('Error fetching expenses:', error);
        throw error;
    }
}

export async function getExpenseById(token, expenseId) {
    try {
        const response = await fetch(`${API_BASE_URL}/expenses/${expenseId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error(`Error fetching expense by ID ${expenseId}:`, error);
        throw error;
    }
}

export async function createExpense(token, expenseData) {
    try {
        const response = await fetch(`${API_BASE_URL}/expenses/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(expenseData),
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error('Error creating expense:', error);
        throw error;
    }
}

export async function updateExpense(token, expenseId, expenseData) {
    try {
        const response = await fetch(`${API_BASE_URL}/expenses/${expenseId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(expenseData),
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error(`Error updating expense ${expenseId}:`, error);
        throw error;
    }
}

export async function cancelExpense(token, expenseId) {
    try {
        const response = await fetch(`${API_BASE_URL}/expenses/${expenseId}/cancel`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error(`Error cancelling expense ${expenseId}:`, error);
        throw error;
    }
}

// --- Funciones para Expense Payments ---

export async function createExpensePayment(token, expenseId, paymentData) {
    try {
        const response = await fetch(`${API_BASE_URL}/expenses/${expenseId}/payments/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentData),
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error(`Error creating payment for expense ${expenseId}:`, error);
        throw error;
    }
}

export async function getPaymentsForExpense(token, expenseId, { skip = 0, limit = 100 } = {}) {
    try {
        const queryParams = new URLSearchParams({ skip, limit });
        const response = await fetch(`${API_BASE_URL}/expenses/${expenseId}/payments/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error(`Error fetching payments for expense ${expenseId}:`, error);
        throw error;
    }
}

export async function getExpensePaymentById(token, paymentId) {
    try {
        const response = await fetch(`${API_BASE_URL}/expenses/payments/${paymentId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error(`Error fetching expense payment by ID ${paymentId}:`, error);
        throw error;
    }
}