const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Función para obtener la lista de estudiantes con filtros y paginación
export async function getStudents(token, { skip = 0, limit = 10, search = '', representativeId = null, gradeLevelId = null, isActive = null } = {}) {
  try {
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    if (search) queryParams.append('search', search);
    if (representativeId !== null) queryParams.append('representative_id', representativeId.toString());
    if (gradeLevelId !== null) queryParams.append('grade_level_id', gradeLevelId.toString());
    if (isActive !== null) queryParams.append('is_active', isActive.toString());
    // Aquí podrías añadir sort_by y sort_order si los implementas en la UI

    const response = await fetch(`${API_BASE_URL}/students/?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json(); // Backend debe devolver { items: [], total: ..., page: ..., ... }
  } catch (error) {
    console.error('Error fetching students:', error);
    throw error;
  }
}

// Función para crear un nuevo estudiante
export async function createStudent(token, studentData) {
  // studentData debe coincidir con schemas.StudentCreate
  try {
    const response = await fetch(`${API_BASE_URL}/students/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(studentData),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating student:', error);
    throw error;
  }
}

// Función para obtener un estudiante por su ID
export async function getStudentById(token, studentId) {
  try {
    const response = await fetch(`${API_BASE_URL}/students/${studentId}`, { // Tu backend tiene GET /students/{student_id}
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching student by ID ${studentId}:`, error);
    throw error;
  }
}

// Función para actualizar un estudiante
export async function updateStudent(token, studentId, studentData) {
  // studentData debe coincidir con schemas.StudentUpdate
  try {
    const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(studentData),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error updating student ${studentId}:`, error);
    throw error;
  }
}

// Función para desactivar un estudiante
export async function deactivateStudent(token, studentId) {
  try {
    const response = await fetch(`${API_BASE_URL}/students/${studentId}/deactivate`, {
      method: 'PATCH', // El backend usa PATCH para esto
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error deactivating student ${studentId}:`, error);
    throw error;
  }
}

// Función para activar un estudiante
export async function activateStudent(token, studentId) {
  try {
    const response = await fetch(`${API_BASE_URL}/students/${studentId}/activate`, {
      method: 'PATCH', // El backend usa PATCH para esto
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `Error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error activating student ${studentId}:`, error);
    throw error;
  }
}

/**
 * Obtiene el resumen financiero anual de los estudiantes.
 * Backend: GET /students/annual-financial-summary/
 * @param {string} token - El token de autenticación.
 * @param {object} params - Parámetros de la solicitud.
 * @param {number} params.schoolYearStartYear - Año de inicio del período escolar.
 * @param {number} params.schoolYearStartMonth - Mes de inicio del período escolar (1-12).
 * @param {string} [params.studentSearchTerm] - Término para buscar estudiantes.
 * @param {number} [params.skip=0] - Número de registros a saltar para paginación.
 * @param {number} [params.limit=20] - Número de registros a devolver por página.
 * @returns {Promise<object>} - Objeto paginado con la lista de StudentAnnualFinancialSummary.
 */

export async function fetchStudentAnnualFinancialSummary(token, {
  schoolYearStartYear,
  schoolYearStartMonth = 8, // Default a Agosto si no se especifica
  studentSearchTerm = null,
  delinquencyFilter = null,
  skip = 0,
  limit = 20
}) {
  try {
      if (!schoolYearStartYear) {
          throw new Error("El año de inicio del período escolar es obligatorio.");
      }
      const queryParams = new URLSearchParams({
          school_year_start_year: schoolYearStartYear.toString(),
          school_year_start_month: schoolYearStartMonth.toString(),
          skip: skip.toString(),
          limit: limit.toString(),
      });
      if (studentSearchTerm) queryParams.append('student_search_term', studentSearchTerm);
      if (delinquencyFilter) queryParams.append('delinquency_filter', delinquencyFilter);
      // El backend puede tener un current_processing_date_override, pero lo manejaremos con la fecha actual del servidor por defecto.

      const response = await fetch(`${API_BASE_URL}/students/annual-financial-summary/?${queryParams.toString()}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
      });

      const responseData = await response.json().catch(() => {
          if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText || 'Respuesta no válida del servidor.'}`);
          throw new Error('Respuesta inesperada del servidor.');
      });

      if (!response.ok) {
          throw new Error(responseData.detail || `Error ${response.status}`);
      }
      return responseData; // Espera { items: List[StudentAnnualFinancialSummary], total, page, ... }
  } catch (error) {
      console.error('Error fetching student annual financial summary:', error);
      throw error;
  }
}