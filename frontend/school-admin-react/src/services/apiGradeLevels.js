const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function getGradeLevels(token, { skip = 0, limit = 10, search = '', isActive = null } = {}) {
  try {
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    if (search) queryParams.append('search', search);
    if (isActive !== null) queryParams.append('is_active', isActive.toString());

    const response = await fetch(`${API_BASE_URL}/grade-levels/?${queryParams.toString()}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    const data = await response.json();
    // Si el backend devuelve {items: [], total: ...} directamente, está bien.
    // Si devuelve solo un array (para el caso de no paginación explícita en el backend para este endpoint en particular):
    if (Array.isArray(data)) {
      return { items: data, total: data.length, page: 1, pages: 1, limit: data.length };
    }
    return data; // Asume que ya tiene la estructura {items, total, page, pages, limit}
  } catch (error) {
    console.error('Error fetching grade levels:', error);
    throw error;
  }
}

/**
 * Obtiene un nivel de grado específico por su ID.
 */
export async function getGradeLevelById(token, gradeLevelId) {
  try {
    const response = await fetch(`${API_BASE_URL}/grade-levels/${gradeLevelId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching grade level by ID ${gradeLevelId}:`, error);
    throw error;
  }
}

/**
 * Crea un nuevo nivel de grado.
 * gradeLevelData debe coincidir con schemas.GradeLevelCreate del backend.
 */
export async function createGradeLevel(token, gradeLevelData) {
  try {
    const response = await fetch(`${API_BASE_URL}/grade-levels/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gradeLevelData),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating grade level:', error);
    throw error;
  }
}

/**
 * Actualiza un nivel de grado existente.
 * gradeLevelData debe coincidir con schemas.GradeLevelUpdate.
 */
export async function updateGradeLevel(token, gradeLevelId, gradeLevelData) {
  try {
    const response = await fetch(`${API_BASE_URL}/grade-levels/${gradeLevelId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gradeLevelData),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error updating grade level ${gradeLevelId}:`, error);
    throw error;
  }
}

/**
 * Desactiva un nivel de grado (borrado lógico).
 * El backend usa DELETE para esto.
 */
export async function deactivateGradeLevel(token, gradeLevelId) {
  try {
    const response = await fetch(`${API_BASE_URL}/grade-levels/${gradeLevelId}`, {
      method: 'DELETE', // Endpoint DELETE para desactivar
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json(); // FastAPI devuelve el objeto desactivado
  } catch (error) {
    console.error(`Error deactivating grade level ${gradeLevelId}:`, error);
    throw error;
  }
}

/**
 * Activa un nivel de grado previamente desactivado.
 */
export async function activateGradeLevel(token, gradeLevelId) {
  try {
    const response = await fetch(`${API_BASE_URL}/grade-levels/${gradeLevelId}/activate`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error activating grade level ${gradeLevelId}:`, error);
    throw error;
  }
}