const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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
            console.log("Backend error data:", errorData); // Log para ver la estructura completa del error
            if (errorData.detail) {
                if (Array.isArray(errorData.detail)) {
                    // Formatear la lista de errores de validación de FastAPI
                    errorDetailMessage = errorData.detail.map(err => {
                        const loc = err.loc && err.loc.length > 1 ? err.loc.slice(1).join(' -> ') : (err.loc ? err.loc.join(' -> ') : 'campo desconocido'); // ej: field_name
                        return `Campo '${loc}': ${err.msg} (Tipo: ${err.type})`;
                    }).join('; ');
                } else if (typeof errorData.detail === 'string') {
                    errorDetailMessage = errorData.detail;
                } else {
                    // Si detail es un objeto u otro tipo, intentar convertirlo a string
                    errorDetailMessage = JSON.stringify(errorData.detail);
                }
            }
        } catch (e) {
            // No se pudo parsear el JSON del cuerpo del error, mantener el error HTTP básico
            console.warn("No se pudo parsear el JSON del cuerpo del error:", e);
        }
        throw new Error(errorDetailMessage); // Lanzar el mensaje de error más detallado
    }
    if (response.status === 204) return null; // No Content
    return response.json();
};

// Tu función applyGlobalCharge (o apiApplyGlobalCharge)
export async function applyGlobalCharge(token, payload) { // Nombre consistente con la importación
    try {
        const response = await fetch(`${API_BASE_URL}/billing-processes/apply-global-charge`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error("Error en servicio applyGlobalCharge:", error); // Loguea el error procesado por handleApiResponse
        throw error; // Relanza para que el componente lo maneje
    }
}

// La función generateRecurringChargesService que te di antes iría aquí también
export async function generateRecurringChargesService(token, payload) {
    /* ... (implementación como en la respuesta anterior) ... */
    try {
        const response = await fetch(`${API_BASE_URL}/billing-processes/generate-recurring-charges`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error("Error en generateRecurringChargesService:", error);
        throw error;
    }
}