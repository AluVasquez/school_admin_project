const API_BASE_URL = "http://127.0.0.1:8000"; // Idealmente, centraliza esta URL

/**
 * Obtiene la lista de conceptos de cargo.
 * Asume que el backend devuelve una estructura paginada:
 * { items: [], total: number, page: number, pages: number, limit: number }
 */
export async function getChargeConcepts(token, { 
    skip = 0, 
    limit = 10, 
    search = '', 
    isActive = null,
    applicableGradeLevelId = null,
    category = null,
    frequency = null 
} = {}) {
  try {
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    if (search) queryParams.append('search', search);
    if (isActive !== null) queryParams.append('is_active', isActive.toString());
    if (applicableGradeLevelId !== null) queryParams.append('applicable_grade_level_id', applicableGradeLevelId.toString());
    if (category) queryParams.append('category', category);
    if (frequency) queryParams.append('frequency', frequency);
    // sort_by y sort_order pueden añadirse si se implementan en la UI

    const response = await fetch(`${API_BASE_URL}/charge-concepts/?${queryParams.toString()}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json(); 
  } catch (error) {
    console.error('Error fetching charge concepts:', error);
    throw error;
  }
}

/**
 * Obtiene un concepto de cargo específico por su ID.
 */
export async function getChargeConceptById(token, conceptId) {
  try {
    const response = await fetch(`${API_BASE_URL}/charge-concepts/${conceptId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching charge concept by ID ${conceptId}:`, error);
    throw error;
  }
}

/**
 * Crea un nuevo concepto de cargo.
 * conceptData debe coincidir con schemas.ChargeConceptCreate del backend.
 */
export async function createChargeConcept(token, conceptData) {
  try {
    const response = await fetch(`${API_BASE_URL}/charge-concepts/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(conceptData),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating charge concept:', error);
    throw error;
  }
}

/**
 * Actualiza un concepto de cargo existente.
 * conceptData debe coincidir con schemas.ChargeConceptUpdate.
 */
export async function updateChargeConcept(token, conceptId, conceptData) {
  try {
    const response = await fetch(`${API_BASE_URL}/charge-concepts/${conceptId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(conceptData),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error updating charge concept ${conceptId}:`, error);
    throw error;
  }
}

/**
 * Desactiva un concepto de cargo.
 * El backend usa DELETE para esto (según routers/charge_concept.py).
 */
export async function deactivateChargeConcept(token, conceptId) {
  try {
    const response = await fetch(`${API_BASE_URL}/charge-concepts/${conceptId}`, {
      method: 'DELETE', 
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json(); // FastAPI devuelve el objeto desactivado
  } catch (error) {
    console.error(`Error deactivating charge concept ${conceptId}:`, error);
    throw error;
  }
}

/**
 * Activa un concepto de cargo previamente desactivado.
 */
export async function activateChargeConcept(token, conceptId) {
  try {
    const response = await fetch(`${API_BASE_URL}/charge-concepts/${conceptId}/activate`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error activating charge concept ${conceptId}:`, error);
    throw error;
  }
}