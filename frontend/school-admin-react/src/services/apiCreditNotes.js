// src/services/apiCreditNotes.js

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Helper para manejar las respuestas de la API.
 * @param {Response} response La respuesta de la API.
 * @returns {Promise<any>} Los datos JSON de la respuesta.
 */
const handleApiResponse = async (response) => {
    if (!response.ok) {
        let errorDetailMessage = `Error ${response.status}: ${response.statusText}`;
        try {
            const errorData = await response.json();
            errorDetailMessage = errorData.detail || errorDetailMessage;
        } catch (e) {
            // No se pudo parsear JSON, mantener el error HTTP básico.
        }
        throw new Error(errorDetailMessage);
    }
    if (response.status === 204) return null;
    return response.json();
};


/**
 * Crea una nueva nota de crédito para una factura existente.
 * @param {string} token El token de autenticación.
 * @param {object} creditNoteData Datos para la creación de la nota de crédito.
 * @returns {Promise<any>} La nota de crédito creada.
 */
export async function createCreditNote(token, creditNoteData) {
    const response = await fetch(`${API_BASE_URL}/credit-notes/`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(creditNoteData),
    });
    return handleApiResponse(response);
}

/**
 * Obtiene una lista paginada de notas de crédito.
 * @param {string} token El token de autenticación.
 * @param {object} params Parámetros de paginación y filtro.
 * @returns {Promise<any>} La lista de notas de crédito.
 */
export async function getCreditNotes(token, { skip = 0, limit = 100, representative_id = null } = {}) {
    const queryParams = new URLSearchParams({ skip, limit });
    if (representative_id) queryParams.append('representative_id', representative_id);

    const response = await fetch(`${API_BASE_URL}/credit-notes/?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}

/**
 * Obtiene los detalles de una nota de crédito específica por su ID.
 * @param {string} token El token de autenticación.
 * @param {number} creditNoteId El ID de la nota de crédito.
 * @returns {Promise<any>} Los detalles de la nota de crédito.
 */
export async function getCreditNoteById(token, creditNoteId) {
    const response = await fetch(`${API_BASE_URL}/credit-notes/${creditNoteId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}