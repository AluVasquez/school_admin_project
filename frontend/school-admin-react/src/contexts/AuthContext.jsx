import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { loginUser as apiLoginUser } from '../services/apiAuth'; // Ya lo tienes
// Necesitarás una función en apiAuth.js para obtener los datos del usuario actual
// Ejemplo: import { getCurrentUserDetails } from '../services/apiAuth'; 
// Esta función llamaría a GET /auth/users/me/

const API_BASE_URL = "http://127.0.0.1:8000"; // O tu constante

// Esta función iría en apiAuth.js o donde tengas tus llamadas de API
async function fetchUserDetailsFromServer(token) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/users/me/`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            // Si el token es inválido o expiró, podríamos limpiar el token aquí
            if (response.status === 401) {
                localStorage.removeItem('authToken');
                // Podrías incluso llamar a logout() aquí si está disponible
            }
            throw new Error(`Error ${response.status}: No se pudieron obtener los detalles del usuario.`);
        }
        return await response.json(); // Devuelve el objeto User con is_superuser
    } catch (error) {
        console.error("Error fetching user details:", error);
        // Podrías querer limpiar el token aquí también si falla
        // localStorage.removeItem('authToken');
        throw error; // O retornar null
    }
}


const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('authToken'));
  const [user, setUser] = useState(null); // <--- NUEVO ESTADO PARA EL OBJETO USER
  const [isLoading, setIsLoading] = useState(false); // Loading general para login/setup inicial
  const [isUserLoading, setIsUserLoading] = useState(true); // Loading específico para detalles del usuario
  const [error, setError] = useState(null);

  const loadUserFromToken = useCallback(async (currentToken) => {
    if (currentToken) {
      setIsUserLoading(true);
      try {
        const userData = await fetchUserDetailsFromServer(currentToken); // Llama a la función que obtiene /auth/users/me/
        if (userData) {
          setUser(userData); // Almacena el objeto user completo
        } else {
          // Token podría ser inválido, limpiar
          setToken(null);
          setUser(null);
          localStorage.removeItem('authToken');
        }
      } catch (err) {
        console.error("Fallo al cargar datos del usuario con token:", err);
        setToken(null); // Token inválido o error
        setUser(null);
        localStorage.removeItem('authToken');
      } finally {
        setIsUserLoading(false);
      }
    } else {
      setIsUserLoading(false); // No hay token, no hay usuario que cargar
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    if (storedToken) {
      setToken(storedToken);
      loadUserFromToken(storedToken);
    } else {
      setIsUserLoading(false); // No hay token, terminamos de "cargar"
    }
  }, [loadUserFromToken]);

  const login = async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
        const result = await apiLoginUser(email, password); // Tu función de apiAuth.js
        console.log('Resultado de apiLoginUser:', result); 
        if (result && result.success) { // Verifica que result no sea undefined
            setToken(result.token);
            localStorage.setItem('authToken', result.token);
            await loadUserFromToken(result.token); // Cargar detalles del usuario después del login
            setIsLoading(false);
            return true;
        } else {
            setError(result ? result.message : 'Error desconocido en el login.');
            setIsLoading(false);
            return false;
        }
    } catch (err) { // Por si apiLoginUser mismo lanza un error no manejado como {success:false}
        console.error("Error en el proceso de login del contexto:", err);
        setError(err.message || 'Error inesperado durante el login.');
        setIsLoading(false);
        return false;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null); // <--- LIMPIAR USUARIO AL HACER LOGOUT
    localStorage.removeItem('authToken');
  };

  // El valor del contexto ahora incluye 'user' y 'isUserLoading'
  const contextValue = { 
    token, 
    user, // <--- PROVEER EL OBJETO USER
    isAuthenticated: !!token && !!user, // Autenticado si hay token Y usuario cargado
    isUserLoading, // Para saber si los detalles del usuario aún están cargando
    login, 
    logout, 
    isLoading, 
    error 
  };

  // Podrías mostrar un loader global mientras isUserLoading es true si es el primer login
  // if (isUserLoading && !user && token) {
  //   return <div>Cargando sesión...</div>; // O un spinner global
  // }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);