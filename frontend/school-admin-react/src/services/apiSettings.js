const API_BASE_URL = "http://127.0.0.1:8000"; // O tu constante global

/**
 * Obtiene la configuración actual de la escuela.
 * Backend: GET /config/school/
 * Espera una respuesta: schemas.SchoolConfigurationResponse
 */
export async function getSchoolConfiguration(token) {
    try {
        const response = await fetch(`${API_BASE_URL}/config/school/`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            if (response.status === 404) { // Backend devuelve 404 si no hay config aún
                console.warn("No se encontró configuración de escuela. Es posible que sea la primera vez o no esté establecida.");
                return null; // Indica que no hay configuración establecida, para que el frontend pueda manejarlo
            }
            // Intenta parsear el error como JSON
            const errorData = await response.json().catch(() => {
                // Si el parseo falla, usa el statusText
                throw new Error(`Error ${response.status}: ${response.statusText || 'Respuesta no válida del servidor.'}`);
            });
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching school configuration:', error);
        // Relanza el error para que el componente que llama pueda manejarlo (ej. toast)
        throw error;
    }
}

/**
 * Crea o actualiza la configuración de la escuela.
 * configData debe coincidir con schemas.SchoolConfigurationCreate del backend.
 * Backend: PUT /config/school/
 */
export async function updateSchoolConfiguration(token, configData) {
    try {
        const response = await fetch(`${API_BASE_URL}/config/school/`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(configData),
        });
        
        const responseData = await response.json().catch(() => {
            if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText || 'Respuesta no válida del servidor.'}`);
            // Si es ok pero no es JSON (poco probable para PUT exitoso con response_model)
            throw new Error('Respuesta inesperada del servidor tras una actualización exitosa.');
        });

        if (!response.ok) {
            throw new Error(responseData.detail || `Error ${response.status}`);
        }
        return responseData; // Devuelve la configuración actualizada (schemas.SchoolConfigurationResponse)
    } catch (error) {
        console.error('Error updating school configuration:', error);
        throw error;
    }
}