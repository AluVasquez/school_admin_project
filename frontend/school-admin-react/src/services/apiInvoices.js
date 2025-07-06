// src/services/apiInvoices.js

const API_BASE_URL = "http://127.0.0.1:8000";

/**
 * Helper para manejar las respuestas de la API y los errores comunes.
 * @param {Response} response - El objeto de respuesta de la API.
 * @returns {Promise<any>} - Los datos JSON de la respuesta o lanza un error.
 */
const handleApiResponse = async (response) => {
    if (!response.ok) {
        let errorDetailMessage = `Error HTTP ${response.status}: ${response.statusText || 'Respuesta desconocida del servidor.'}`;
        try {
            const errorData = await response.json();
            if (errorData.detail) {
                if (Array.isArray(errorData.detail)) {
                    errorDetailMessage = errorData.detail.map(err => `Campo '${err.loc.slice(1).join('->')}': ${err.msg}`).join('; ');
                } else if (typeof errorData.detail === 'string') {
                    errorDetailMessage = errorData.detail;
                }
            }
        } catch (e) {
            // No se pudo parsear JSON, mantener el error HTTP básico.
        }
        throw new Error(errorDetailMessage);
    }
    if (response.status === 204) return null;
    return response.json();
};

/**
 * Obtiene la lista de facturas con filtros y paginación.
 */
export async function getInvoices(token, {
    skip = 0, limit = 10, representativeId = null,
    startDate = null, endDate = null, status = null, invoiceNumber = null
} = {}) {
    const queryParams = new URLSearchParams({ skip, limit });
    if (representativeId) queryParams.append('representative_id', representativeId);
    if (startDate) queryParams.append('start_date', startDate);
    if (endDate) queryParams.append('end_date', endDate);
    if (status) queryParams.append('status', status);
    if (invoiceNumber) queryParams.append('invoice_number', invoiceNumber);

    const response = await fetch(`${API_BASE_URL}/invoices/?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}

/**
 * Obtiene los detalles de una factura específica por su ID.
 */
export async function getInvoiceById(token, invoiceId) {
    const response = await fetch(`${API_BASE_URL}/invoices/${invoiceId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}

/**
 * Crea una nueva factura.
 * @param {object} invoiceData - Coincide con schemas.InvoiceCreate del backend.
 */
export async function createInvoice(token, invoiceData) {
    const response = await fetch(`${API_BASE_URL}/invoices/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData),
    });
    return handleApiResponse(response);
}

/**
 * Anula una factura existente.
 * @param {string} reason - Razón para la anulación.
 */
export async function annulInvoice(token, invoiceId, reason) {
    const response = await fetch(`${API_BASE_URL}/invoices/${invoiceId}/annul`, {
        method: 'POST', // El router espera POST para anular
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
    });
    return handleApiResponse(response);
}