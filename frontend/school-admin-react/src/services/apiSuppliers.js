const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Obtiene la lista de proveedores con filtros y paginación.
 * Backend: GET /suppliers/
 * Espera una respuesta paginada: { items: [], total: ..., page: ..., ... }
 */
export async function getSuppliers(token, {
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

        const response = await fetch(`${API_BASE_URL}/suppliers/?${queryParams.toString()}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching suppliers:', error);
        throw error;
    }
}

/**
 * Obtiene un proveedor específico por su ID.
 * Backend: GET /suppliers/{supplier_id}
 */
export async function getSupplierById(token, supplierId) {
    try {
        const response = await fetch(`${API_BASE_URL}/suppliers/${supplierId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching supplier by ID ${supplierId}:`, error);
        throw error;
    }
}

/**
 * Crea un nuevo proveedor.
 * supplierData debe coincidir con schemas.SupplierCreate del backend.
 * Backend: POST /suppliers/
 */
export async function createSupplier(token, supplierData) {
    try {
        const response = await fetch(`${API_BASE_URL}/suppliers/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(supplierData),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error creating supplier:', error);
        throw error;
    }
}

/**
 * Actualiza un proveedor existente.
 * supplierData debe coincidir con schemas.SupplierUpdate.
 * Backend: PUT /suppliers/{supplier_id}
 */
export async function updateSupplier(token, supplierId, supplierData) {
    try {
        const response = await fetch(`${API_BASE_URL}/suppliers/${supplierId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(supplierData),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error updating supplier ${supplierId}:`, error);
        throw error;
    }
}

/**
 * Cambia el estado activo/inactivo de un proveedor.
 * Backend: PATCH /suppliers/{supplier_id}/toggle-active
 */
export async function toggleSupplierActiveStatus(token, supplierId) {
    try {
        const response = await fetch(`${API_BASE_URL}/suppliers/${supplierId}/toggle-active`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json(); // Devuelve el proveedor actualizado
    } catch (error) {
        console.error(`Error toggling active status for supplier ${supplierId}:`, error);
        throw error;
    }
}