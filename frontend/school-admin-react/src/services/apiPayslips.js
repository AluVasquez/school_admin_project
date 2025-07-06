// frontend/school-admin-react/src/services/apiPayslips.js

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Helper genérico para manejar las respuestas de la API y los errores.
 * @param {Response} response - El objeto de respuesta de la API.
 * @returns {Promise<any>} - Los datos JSON de la respuesta.
 * @throws {Error} - Lanza un error con un mensaje descriptivo si la respuesta no es OK.
 */
async function handleApiResponse(response) {
    if (!response.ok) {
        let errorDetailMessage = `Error HTTP ${response.status}: ${response.statusText || "Respuesta desconocida del servidor."}`;
        try {
            const errorData = await response.json();
            if (errorData.detail) {
                // Maneja errores de validación de FastAPI que vienen como un array de objetos
                if (Array.isArray(errorData.detail)) {
                    errorDetailMessage = errorData.detail.map(err => `Campo '${err.loc.slice(1).join('->')}': ${err.msg}`).join('; ');
                } else if (typeof errorData.detail === 'string') {
                    errorDetailMessage = errorData.detail;
                }
            }
        } catch (e) {
            // Si el cuerpo del error no es JSON, se mantiene el mensaje de error HTTP básico.
        }
        throw new Error(errorDetailMessage);
    }
    // Si la respuesta es "204 No Content", no hay cuerpo para parsear.
    if (response.status === 204) {
        return null;
    }
    return response.json();
}

/**
 * Obtiene una lista paginada de recibos de pago.
 * @param {string} token - El token de autenticación del usuario.
 * @param {object} params - Objeto con parámetros de paginación y filtro.
 * @returns {Promise<object>} - Un objeto con la estructura de paginación { items, total, page, ... }.
 */
export async function getPayslips(token, {
    skip = 0,
    limit = 15,
    search = null,
    startDate = null,
    endDate = null,
    positionId = null // <--- NUEVO PARÁMETRO
} = {}) {
    try {
        const queryParams = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
        if (search) queryParams.append('search', search);
        if (startDate) queryParams.append('start_date', startDate);
        if (endDate) queryParams.append('end_date', endDate);
        if (positionId) queryParams.append('position_id', positionId); // <--- AÑADIR A LA QUERY

        const response = await fetch(`${API_BASE_URL}/payslips/?${queryParams.toString()}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response); // handleApiResponse se mantiene igual
    } catch (error) {
        console.error('Error fetching payslips:', error);
        throw error;
    }
}

/**
 * Obtiene los detalles de un único recibo de pago por su ID.
 * @param {string} token - El token de autenticación.
 * @param {number|string} payslipId - El ID del recibo de pago a obtener.
 * @returns {Promise<object>} - El objeto detallado del recibo de pago.
 */
export async function getPayslipById(token, payslipId) {
    try {
        const response = await fetch(`${API_BASE_URL}/payslips/${payslipId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error(`Error fetching payslip by ID ${payslipId}:`, error);
        throw error;
    }
}