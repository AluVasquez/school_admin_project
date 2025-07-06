import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom'; // <--- IMPORTAR useNavigate y useLocation

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error, isAuthenticated } = useAuth();
  const navigate = useNavigate(); // <--- Hook para navegar
  const location = useLocation(); // <--- Hook para obtener la ubicación

  // Para redirigir si ya está autenticado o después de un login exitoso
  useEffect(() => {
    if (isAuthenticated) {
      // Si el usuario intentó acceder a una ruta específica antes de ser redirigido al login,
      // lo enviamos allí después del login. Si no, al dashboard.
      const from = location.state?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    await login(email, password); // login ya maneja el estado, useEffect se encargará de la redirección
    // No necesitamos verificar 'success' aquí si useEffect maneja la redirección basada en isAuthenticated
  };

  // El useEffect ya maneja la redirección si está autenticado,
  // así que esta parte del render no es estrictamente necesaria si el useEffect funciona rápido.
  // Sin embargo, la dejamos como un fallback o para claridad.
  if (isAuthenticated) {
     return (
        <div className="min-h-screen flex items-center justify-center">
            <p>Redirigiendo...</p> {/* O un spinner de carga */}
        </div>
    );
  }


  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-800 p-4">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
        <div className="text-center mb-6">
            {/* <img src="/logo-escuela-placeholder.png" alt="Logo Escuela" className="w-20 h-20 mx-auto mb-2 rounded-full bg-white p-1"/> */}
            <h2 className="text-3xl font-bold text-gray-700">
            Iniciar Sesión
            </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-600 mb-1"
            >
              Correo Electrónico
            </label>
            <input
              type="email"
              id="email"
              autoComplete="current-password"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="admin@admin.com"
            />
          </div>
          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-600 mb-1"
            >
              Contraseña
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Tu contraseña"
            />
          </div>
          {error && (
            <p className="text-red-500 text-xs italic mb-4 text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
      <p className="mt-8 text-center text-xs text-gray-400">
        Sistema de Administración Escolar v0.1
      </p>
    </div>
  );
}

export default LoginPage;