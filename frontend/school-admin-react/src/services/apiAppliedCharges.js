const API_BASE_URL = import.meta.env.VITE_API_BASE_URL; // Centralizar esta URL

/**
 * Obtiene la lista de cargos aplicados con filtros y paginación.
 * Backend: GET /applied-charges/
 * Espera una respuesta paginada: { items: [], total: ..., page: ..., ... }
 */

export async function getAppliedCharges(token, {
    skip = 0,
    limit = 10,
    student_id = null,
    charge_concept_id = null,
    status = null, // Puede ser un string o un array de strings
    representative_id = null,
    start_issue_date = null,
    end_issue_date = null,
    start_due_date = null,
    end_due_date = null,
    // sortBy y sortOrder si los usas
} = {}) {
    try {
        const queryParams = new URLSearchParams({
            skip: skip.toString(),
            limit: limit.toString(),
        });

        if (student_id !== null && student_id !== '') queryParams.append('student_id', student_id.toString());
        if (charge_concept_id !== null && charge_concept_id !== '') queryParams.append('charge_concept_id', charge_concept_id.toString());
        
        // Manejo del parámetro 'status' (puede ser string o array)
        if (status) {
            if (Array.isArray(status)) {
                status.forEach(sVal => {
                    if (sVal) queryParams.append('status', sVal); // Añadir cada estado como un parámetro 'status'
                });
            } else if (typeof status === 'string' && status !== '') {
                queryParams.append('status', status);
            }
        }
        
        if (representative_id !== null && representative_id !== '') queryParams.append('representative_id', representative_id.toString());
        
        if (start_issue_date) queryParams.append('start_issue_date', start_issue_date);
        if (end_issue_date) queryParams.append('end_issue_date', end_issue_date);
        if (start_due_date) queryParams.append('start_due_date', start_due_date);
        if (end_due_date) queryParams.append('end_due_date', end_due_date);

        const response = await fetch(`${API_BASE_URL}/applied-charges/?${queryParams.toString()}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        let responseData;
        try {
            if (response.status === 204) { // No Content
                responseData = { items: [], total: 0, page: 1, pages: 0, limit: limit }; // Estructura paginada vacía
            } else {
                responseData = await response.json();
            }
        } catch (jsonError) {
            console.error("Error al parsear JSON de cargos aplicados:", jsonError);
            const responseText = await response.text().catch(() => "No se pudo leer el cuerpo de la respuesta.");
            console.error("Cuerpo de la respuesta (texto crudo) en getAppliedCharges:", responseText.substring(0, 500));
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText || 'Respuesta no válida del servidor.'} Cuerpo: ${responseText.substring(0, 200)}`);
            }
            throw new Error(`Respuesta inesperada del servidor (status ${response.status}, ok: ${response.ok}): ${responseText.substring(0, 200) || "Cuerpo vacío o no JSON."}`);
        }
        
        if (!response.ok) {
            // Si responseData.detail existe (error FastAPI), úsalo.
            const detail = typeof responseData?.detail === 'string' ? responseData.detail : 
                           Array.isArray(responseData?.detail) ? responseData.detail.map(d => d.msg || JSON.stringify(d)).join(', ') :
                           `Error ${response.status} al obtener cargos aplicados.`;
            throw new Error(detail);
        }
        return responseData; // Espera { items: [], total, page, pages, limit }
    } catch (error) {
        console.error('Error en getAppliedCharges:', error);
        // Ya no llamamos a toast aquí, el componente que llama lo hará.
        throw error;
    }
}

// --- NUEVA FUNCIÓN: Obtener un Cargo Aplicado por su ID ---
/**
 * Obtiene un cargo aplicado específico por su ID.
 * Backend: GET /applied-charges/{applied_charge_id}
 * @param {string} token - El token de autenticación.
 * @param {number|string} appliedChargeId - El ID del cargo aplicado a obtener.
 * @returns {Promise<object>} - El objeto AppliedChargeResponse.
 */
export async function getAppliedChargeById(token, appliedChargeId) {
    if (!appliedChargeId) {
        console.error("getAppliedChargeById: appliedChargeId es requerido.");
        throw new Error("El ID del cargo aplicado es requerido.");
    }
    try {
        const response = await fetch(`${API_BASE_URL}/applied-charges/${appliedChargeId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                // 'Content-Type': 'application/json' // No es estrictamente necesario para GET sin cuerpo
            },
        });

        let responseData;
        try {
            if (response.status === 204) { // En caso de que un GET por ID devuelva 204 si no se encuentra (poco común para GET por ID)
                responseData = null; // O lanzar un error 404 específico
            } else {
                responseData = await response.json();
            }
        } catch (jsonError) {
            console.error(`Error al parsear JSON para cargo aplicado ID ${appliedChargeId}:`, jsonError);
            const responseText = await response.text().catch(() => "No se pudo leer el cuerpo de la respuesta.");
            console.error("Cuerpo de la respuesta (texto crudo):", responseText.substring(0, 500));
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText || 'Respuesta no válida del servidor.'} Cuerpo: ${responseText.substring(0, 200)}`);
            }
            throw new Error(`Respuesta inesperada del servidor (status ${response.status}, ok: ${response.ok}): ${responseText.substring(0, 200) || "Cuerpo vacío o no JSON."}`);
        }
        
        if (!response.ok) {
            const detail = typeof responseData?.detail === 'string' ? responseData.detail : 
                           Array.isArray(responseData?.detail) ? responseData.detail.map(d => d.msg || JSON.stringify(d)).join(', ') :
                           (response.status === 404 ? "Cargo aplicado no encontrado" : `Error ${response.status} al obtener el cargo.`);
            throw new Error(detail);
        }
        
        if (responseData === null && response.status === 404) { // Si el backend devuelve 404
             throw new Error("Cargo aplicado no encontrado.");
        }

        return responseData; // Espera schemas.AppliedChargeResponse
    } catch (error) {
        console.error(`Error fetching applied charge by ID ${appliedChargeId}:`, error);
        // No llamar a toast aquí, dejar que el componente lo haga
        throw error;
    }
}

// ... tus otras funciones como createAppliedCharge, updateAppliedCharge, getAppliedChargeById ...
// Asegúrate que createAppliedCharge y otras no tengan el problema de `toast is not defined`.
// Por ejemplo, para createAppliedCharge:

export async function createAppliedCharge(token, chargeData) {
    try {
        const response = await fetch(`${API_BASE_URL}/applied-charges/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chargeData),
        });
        const responseData = await response.json().catch(() => { /* ...manejo similar al de arriba... */ });
        if (!response.ok) {
            const detail = typeof responseData?.detail === 'string' ? responseData.detail : 
                           Array.isArray(responseData?.detail) ? responseData.detail.map(d => d.msg || JSON.stringify(d)).join(', ') :
                           `Error ${response.status} al crear cargo.`;
            throw new Error(detail);
        }
        return responseData;
    } catch (error) {
        console.error('Error creating applied charge:', error);
        throw error;
    }
}

/**
 * Actualiza un cargo aplicado existente.
 * chargeUpdateData debe coincidir con schemas.AppliedChargeUpdate.
 * Backend: PUT /applied-charges/{applied_charge_id}
 */
export async function updateAppliedCharge(token, appliedChargeId, chargeUpdateData) {
    try {
        const response = await fetch(`${API_BASE_URL}/applied-charges/${appliedChargeId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chargeUpdateData),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error updating applied charge ${appliedChargeId}:`, error);
        throw error;
    }
}