const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Obtiene la lista de categorías de gasto con filtros y paginación.
 * Backend: GET /expense-categories/
 * Espera una respuesta paginada: { items: [], total: ..., page: ..., ... }
 */
export async function getExpenseCategories(token, {
    skip = 0,
    limit = 100,
    search = null,
    isActive = null
} = {}) {
    try {
        const queryParams = new URLSearchParams({
            skip: skip.toString(),
            limit: limit.toString(),
        });
        if (search) queryParams.append('search', search);
        if (isActive !== null) queryParams.append('is_active', isActive.toString());

        const response = await fetch(`${API_BASE_URL}/expense-categories/?${queryParams.toString()}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json(); // Devuelve { items: [], total: ..., page: ..., pages: ..., limit: ... }
    } catch (error) {
        console.error('Error fetching expense categories:', error);
        throw error;
    }
}

/**
 * Obtiene una categoría de gasto específica por su ID.
 * Backend: GET /expense-categories/{category_id}
 */
export async function getExpenseCategoryById(token, categoryId) {
    try {
        const response = await fetch(`${API_BASE_URL}/expense-categories/${categoryId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching expense category by ID ${categoryId}:`, error);
        throw error;
    }
}

/**
 * Crea una nueva categoría de gasto.
 * categoryData debe coincidir con schemas.ExpenseCategoryCreate del backend.
 * Backend: POST /expense-categories/
 */
export async function createExpenseCategory(token, categoryData) {
    try {
        const response = await fetch(`${API_BASE_URL}/expense-categories/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(categoryData),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error creating expense category:', error);
        throw error;
    }
}

/**
 * Actualiza una categoría de gasto existente.
 * categoryData debe coincidir con schemas.ExpenseCategoryUpdate.
 * Backend: PUT /expense-categories/{category_id}
 */
export async function updateExpenseCategory(token, categoryId, categoryData) {
    try {
        const response = await fetch(`${API_BASE_URL}/expense-categories/${categoryId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(categoryData),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error updating expense category ${categoryId}:`, error);
        throw error;
    }
}

/**
 * Cambia el estado activo/inactivo de una categoría de gasto.
 * Backend: PATCH /expense-categories/{category_id}/toggle-active
 */
export async function toggleExpenseCategoryActiveStatus(token, categoryId) {
    try {
        const response = await fetch(`${API_BASE_URL}/expense-categories/${categoryId}/toggle-active`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json(); // Devuelve la categoría actualizada
    } catch (error) {
        console.error(`Error toggling active status for expense category ${categoryId}:`, error);
        throw error;
    }
}