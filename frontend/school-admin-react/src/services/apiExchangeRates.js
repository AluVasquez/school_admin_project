const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Obtiene la lista de tasas de cambio con filtros y paginación.
 * Backend: GET /exchange-rates/
 */
export async function getExchangeRates(token, { 
    skip = 0, 
    limit = 10, 
    fromCurrency = null, 
    toCurrency = null, 
    startDate = null, 
    endDate = null 
} = {}) {
    try {
        const queryParams = new URLSearchParams({
            skip: skip.toString(),
            limit: limit.toString(),
        });
        if (fromCurrency) queryParams.append('from_currency', fromCurrency);
        if (toCurrency) queryParams.append('to_currency', toCurrency);
        if (startDate) queryParams.append('start_date', startDate);
        if (endDate) queryParams.append('end_date', endDate);

        const response = await fetch(`${API_BASE_URL}/exchange-rates/?${queryParams.toString()}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        // El backend para get_exchange_rates en crud.py devuelve List[models.ExchangeRate]
        // El router /exchange-rates/ GET devuelve List[schemas.ExchangeRateResponse]
        // Asumiremos que NO es paginado por el backend directamente en la respuesta, sino una lista.
        // Si el backend SÍ devuelve un objeto paginado {items: [], ...}, ajustar aquí.
        // Por ahora, si el backend devuelve una lista directa, la envolvemos para la paginación en el frontend si es necesario,
        // o el backend router debería devolver el objeto paginado.
        // Revisando el router exchange_rates.py, el GET / devuelve List[schemas.ExchangeRateResponse].
        // Así que esta función devolverá la lista, y la paginación se manejará en el componente si es necesario o si son pocos datos.
        // Para consistencia con otros listados, sería mejor que el backend también paginara este.
        // Voy a asumir que el backend SÍ devuelve un objeto paginado para esta función:
        // { items: [], total: ..., page: ..., pages: ..., limit: ... }
        // Si no es así, tendrás que ajustar el backend o la forma en que manejas la respuesta aquí.
        // Por ahora, mantendré la estructura de los otros servicios que esperan paginación:
        const data = await response.json();
        if (Array.isArray(data)) { // Fallback si el backend devuelve una lista simple
             return { items: data, total: data.length, page: 1, pages: 1, limit: data.length };
        }
        return data; // Asumiendo que ya tiene formato paginado si no es un array
    } catch (error) {
        console.error('Error fetching exchange rates:', error);
        throw error;
    }
}

/**
 * Obtiene la tasa de cambio más reciente.
 * (Esta función ya la tenías, la incluyo por completitud)
 */
export async function getLatestExchangeRate(token, fromCurrency = "USD", onDate = null) {
    if (fromCurrency === 'VES') {
        return { rate: 1, from_currency: 'VES', to_currency: 'VES', rate_date: new Date().toISOString().split('T')[0] };
    }
    try {
        const queryParams = new URLSearchParams({
            from_currency: fromCurrency,
        });
        if (onDate) {
            queryParams.append('on_date', onDate);
        }

        const response = await fetch(`${API_BASE_URL}/exchange-rates/latest/?${queryParams.toString()}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`No se encontró tasa de cambio para ${fromCurrency} a VES ${onDate ? `en o antes de ${onDate}` : ''}.`);
                return null;
            }
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching latest exchange rate for ${fromCurrency}:`, error);
        return null; 
    }
}

/**
 * Crea una nueva tasa de cambio.
 * rateData: { from_currency: string, to_currency: string, rate: float, rate_date: string (YYYY-MM-DD) }
 * Backend: POST /exchange-rates/
 */
export async function createExchangeRate(token, rateData) {
    try {
        const response = await fetch(`${API_BASE_URL}/exchange-rates/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(rateData),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error creating exchange rate:', error);
        throw error;
    }
}

/**
 * Actualiza una tasa de cambio existente.
 * rateUpdateData: { rate?: float, rate_date?: string, from_currency?: string, to_currency?: string }
 * Backend: PUT /exchange-rates/{exchange_rate_id}
 */
export async function updateExchangeRate(token, rateId, rateUpdateData) {
    try {
        const response = await fetch(`${API_BASE_URL}/exchange-rates/${rateId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(rateUpdateData),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error updating exchange rate ${rateId}:`, error);
        throw error;
    }
}

/**
 * Elimina una tasa de cambio.
 * Backend: DELETE /exchange-rates/{exchange_rate_id}
 */
export async function deleteExchangeRate(token, rateId) {
    try {
        const response = await fetch(`${API_BASE_URL}/exchange-rates/${rateId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        // DELETE suele devolver 200/204 con el objeto eliminado o sin cuerpo.
        // Si devuelve el objeto, response.json() funcionará. Si es 204, no.
        if (response.status === 204) {
            return { success: true, message: "Tasa eliminada exitosamente." };
        }
        return await response.json(); 
    } catch (error) {
        console.error(`Error deleting exchange rate ${rateId}:`, error);
        throw error;
    }
}
