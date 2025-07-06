const API_BASE_URL = "http://127.0.0.1:8000";

/**
 * Un manejador de respuestas de fetch reutilizable y robusto.
 * Si la respuesta es exitosa, devuelve el JSON.
 * Si no, construye y lanza un objeto de error que contiene los detalles de la API.
 * @param {Response} response - El objeto de respuesta de fetch.
 * @returns {Promise<any>}
 */
async function handleApiResponse(response) {
    // Si la respuesta no es OK, procesamos el error.
    if (!response.ok) {
        let errorData;
        try {
            // Intenta obtener los detalles del error del cuerpo JSON de la respuesta.
            errorData = await response.json();
        } catch (e) {
            // Si el cuerpo del error no es JSON, crea un detalle de error genérico.
            errorData = { detail: `Error ${response.status}: ${response.statusText}` };
        }
        
        // Crea un nuevo objeto de error para lanzar.
        const error = new Error('Ocurrió un error en la API.');
        
        // Adjuntamos la respuesta completa al error, similar a como lo hace Axios.
        // Esto le da al código que lo llama acceso a `error.response.data`, `error.response.status`, etc.
        error.response = {
            data: errorData,
            status: response.status,
            statusText: response.statusText,
        };
        
        throw error;
    }

    // Si la respuesta es 204 (No Content), no hay cuerpo que parsear, devuelve éxito.
    if (response.status === 204) {
        return { success: true };
    }

    // Si la respuesta es OK y tiene contenido, devuelve el JSON.
    return response.json();
}

/**
 * Todas las funciones ahora usan el manejador centralizado `handleApiResponse`
 */

export async function getRepresentatives(token, { skip = 0, limit = 10, search = '', financialStatus = null, sort_by = null, sort_order = 'desc' } = {}) {
    const queryParams = new URLSearchParams({ skip, limit });
    if (search) queryParams.append('search', search);
    if (financialStatus) queryParams.append('financialStatus', financialStatus);
    if (sort_by) {
        queryParams.append('sort_by', sort_by);
        queryParams.append('sort_order', sort_order);
    }

    try {
        const response = await fetch(`${API_BASE_URL}/representatives/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Error en getRepresentatives:', error.response?.data || error.message);
        throw error; // Vuelve a lanzar el error enriquecido
    }
}

export async function createRepresentative(token, representativeData) {
    try {
        const response = await fetch(`${API_BASE_URL}/representatives/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(representativeData),
        });
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Error en createRepresentative:', error.response?.data || error.message);
        throw error;
    }
}

export async function getRepresentativeById(token, representativeId) {
    try {
        const response = await fetch(`${API_BASE_URL}/representatives/${representativeId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return await handleApiResponse(response);
    } catch (error) {
        console.error(`Error en getRepresentativeById ${representativeId}:`, error.response?.data || error.message);
        throw error;
    }
}

export async function updateRepresentative(token, representativeId, representativeData) {
    try {
        const response = await fetch(`${API_BASE_URL}/representatives/${representativeId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(representativeData),
        });
        return await handleApiResponse(response);
    } catch (error) {
        console.error(`Error en updateRepresentative ${representativeId}:`, error.response?.data || error.message);
        throw error;
    }
}

export async function deleteRepresentative(token, representativeId) {
    try {
        const response = await fetch(`${API_BASE_URL}/representatives/${representativeId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return await handleApiResponse(response);
    } catch (error) {
        console.error(`Error en deleteRepresentative ${representativeId}:`, error.response?.data || error.message);
        throw error;
    }
}

export async function getRepresentativeStatement(token, representativeId) {
    try {
        const response = await fetch(`${API_BASE_URL}/representatives/${representativeId}/statement`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return await handleApiResponse(response);
    } catch (error) {
        console.error(`Error en getRepresentativeStatement for ID ${representativeId}:`, error.response?.data || error.message);
        throw error;
    }
}

export async function applyRepresentativeCredit(token, representativeId) {
    try {
        const response = await fetch(`${API_BASE_URL}/representatives/${representativeId}/apply-credit`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return await handleApiResponse(response);
    } catch (error) {
        console.error(`Error en applyRepresentativeCredit for ID ${representativeId}:`, error.response?.data || error.message);
        throw error;
    }
}