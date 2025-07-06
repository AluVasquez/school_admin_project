const API_BASE_URL = "http://127.0.0.1:8000"; // O tu constante global

/**
 * Realiza el login de un usuario.
 * Devuelve { success: true, token: "..." } o { success: false, message: "..." }.
 */
export async function loginUser(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: email, // El backend espera 'username' para el email
        password: password,
      }),
    });

    // Intenta parsear JSON incluso si la respuesta no es ok,
    // ya que FastAPI a menudo devuelve detalles del error en JSON.
    const data = await response.json().catch(() => {
        // Si response.json() falla (ej. cuerpo vacío o no JSON),
        // lanzamos un error con el statusText si response.ok es false.
        // Si response.ok es true pero el cuerpo no es JSON, es un problema diferente.
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText || 'Respuesta no válida del servidor.'}`);
        }
        // Si response.ok es true pero no es JSON, es un error inesperado del servidor
        throw new Error('Respuesta inesperada del servidor después de una solicitud exitosa.');
    });

    if (!response.ok) {
      // data.detail es común para errores FastAPI.
      throw new Error(data.detail || `Error ${response.status}: ${response.statusText || 'Error desconocido del servidor.'}`);
    }

    if (data.access_token) {
      return { success: true, token: data.access_token };
    } else {
      // Esto no debería ocurrir si response.ok es true y el backend funciona como se espera.
      throw new Error(data.detail || 'No se recibió el token de acceso en una respuesta exitosa.');
    }
  } catch (error) {
    console.error('Error en loginUser:', error);
    // Asegurar que siempre se retorne un objeto con 'success: false' y un mensaje.
    return { 
        success: false, 
        message: error.message || 'Ocurrió un error al intentar iniciar sesión. Verifique la consola del servidor backend.' 
    };
  }
}

/**
 * (Superadmin) Crea un nuevo usuario administrador.
 * userData: { email: string, full_name?: string, password: string }
 * Backend: POST /auth/users/
 */
export async function createAdminUser(token, userData) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/users/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData),
        });

        const responseData = await response.json().catch(() => {
            if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText || 'Respuesta no válida.'}`);
            throw new Error('Respuesta inesperada del servidor.');
        });

        if (!response.ok) {
            throw new Error(responseData.detail || `Error ${response.status}`);
        }
        return responseData; // Devuelve el usuario creado (schemas.User)
    } catch (error) {
        console.error('Error creating admin user:', error);
        throw error; // Relanza para que el componente lo maneje (ej. toast)
    }
}

/**
 * (Superadmin) Obtiene la lista de todos los usuarios administradores.
 * Backend: GET /auth/users/
 */
export async function getAllAdminUsers(token, { skip = 0, limit = 100 } = {}) {
    try {
        const queryParams = new URLSearchParams({
            skip: skip.toString(),
            limit: limit.toString(),
        });
        const response = await fetch(`${API_BASE_URL}/auth/users/?${queryParams.toString()}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        
        const responseData = await response.json().catch(() => {
            if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText || 'Respuesta no válida.'}`);
            throw new Error('Respuesta inesperada del servidor.');
        });

        if (!response.ok) {
            throw new Error(responseData.detail || `Error ${response.status}`);
        }
        return responseData; // Espera { items: [], total: ..., page: ..., ... }
    } catch (error) {
        console.error('Error fetching all admin users:', error);
        throw error;
    }
}

/**
 * (Superadmin) Actualiza los detalles de un usuario administrador específico.
 * userIdToUpdate: ID del usuario a modificar.
 * updateData: Objeto con los campos a actualizar (schemas.UserUpdate: { full_name?, is_active?, is_superuser? }).
 * Backend: PUT /auth/users/{user_id_to_update}
 */
export async function updateAdminUserDetails(token, userIdToUpdate, updateData) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/users/${userIdToUpdate}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData),
        });

        const responseData = await response.json().catch(() => {
            if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText || 'Respuesta no válida.'}`);
            throw new Error('Respuesta inesperada del servidor.');
        });
        
        if (!response.ok) {
            throw new Error(responseData.detail || `Error ${response.status}`);
        }
        return responseData; // Devuelve el usuario actualizado (schemas.User)
    } catch (error) {
        console.error(`Error updating user ${userIdToUpdate}:`, error);
        throw error;
    }
}