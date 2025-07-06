import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    getExpenseCategories,
    createExpenseCategory,
    updateExpenseCategory,
    toggleExpenseCategoryActiveStatus
} from '../services/apiExpenseCategories';
import Modal from '../components/Modal';
import { toast } from 'react-toastify';

const initialFormData = {
  name: '',
  description: '',
  is_active: true, // Por defecto activo al crear
};

function ExpenseCategoriesPage() {
  const { token } = useAuth();
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Estados para paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [limitPerPage] = useState(10); // Puedes ajustar esto
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  // Estados para el modal (Crear/Editar)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null); // null para crear, objeto para editar
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Estados para filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterIsActive, setFilterIsActive] = useState(''); // '', 'true', 'false'

  const fetchExpenseCategories = useCallback(async () => {
    if (!token) {
        setIsLoading(false);
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const skip = (currentPage - 1) * limitPerPage;
      const params = {
        skip,
        limit: limitPerPage,
        search: searchTerm || null,
        isActive: filterIsActive === '' ? null : filterIsActive === 'true',
      };
      const data = await getExpenseCategories(token, params);
      setCategories(data.items || []);
      setTotalItems(data.total || 0);
      setTotalPages(data.pages || 0);
    } catch (err) {
      setError(err.message);
      toast.error(`Error al cargar categorías de gasto: ${err.message}`);
      setCategories([]); setTotalItems(0); setTotalPages(0);
    } finally {
      setIsLoading(false);
    }
  }, [token, currentPage, limitPerPage, searchTerm, filterIsActive]);

  useEffect(() => {
    fetchExpenseCategories();
  }, [fetchExpenseCategories]);

  // Resetear a página 1 cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterIsActive]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const openModalForCreate = () => {
    setEditingCategory(null);
    setFormData(initialFormData);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openModalForEdit = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name || '',
      description: category.description || '',
      is_active: category.is_active, // El estado activo se maneja con toggle, no en este form de edición
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null); // Limpiar categoría en edición al cerrar
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!token) {
      toast.error("Error de autenticación.");
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      const dataToSubmit = {
        name: formData.name,
        description: formData.description || null,
        // is_active solo se envía al crear. Al editar, se usa toggle.
      };

      if (editingCategory) {
        // Para actualizar, solo enviamos nombre y descripción. is_active se maneja por separado.
        const updatePayload = { name: formData.name, description: formData.description };
        if (formData.is_active !== editingCategory.is_active) {
            // Si el usuario quisiera cambiar 'is_active' desde el form de edición (no recomendado aquí)
            // se podría añadir: updatePayload.is_active = formData.is_active;
            // Pero es mejor usar el botón de toggle para claridad.
        }
        await updateExpenseCategory(token, editingCategory.id, updatePayload);
        toast.success("Categoría de gasto actualizada!");
      } else {
        await createExpenseCategory(token, { ...dataToSubmit, is_active: formData.is_active });
        toast.success("Categoría de gasto creada!");
      }
      closeModal();
      fetchExpenseCategories(); // Recargar lista
    } catch (err) {
      const errorMessage = err.message || "Ocurrió un error.";
      setFormError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (category) => {
    if (!token) {
      toast.error("Error de autenticación.");
      return;
    }
    const actionText = category.is_active ? "desactivar" : "activar";
    if (!window.confirm(`¿Estás seguro de que deseas ${actionText} la categoría "${category.name}"?`)) {
      return;
    }
    try {
      await toggleExpenseCategoryActiveStatus(token, category.id);
      toast.success(`Categoría ${actionText}da exitosamente.`);
      fetchExpenseCategories(); // Recargar lista
    } catch (err) {
      toast.error(`Error al ${actionText} la categoría: ${err.message}`);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage && !isLoading) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Gestión de Categorías de Gasto</h1>
        <button
          onClick={openModalForCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded shadow-md transition duration-150 ease-in-out"
        >
          + Añadir Categoría
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg shadow grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div>
          <label htmlFor="searchTermCategories" className="block text-sm font-medium text-gray-700">Buscar por Nombre/Descripción</label>
          <input
            type="text"
            id="searchTermCategories"
            placeholder="Escriba para buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mt-1 block w-full input-style"
            disabled={isLoading}
          />
        </div>
        <div>
          <label htmlFor="filterIsActiveCategories" className="block text-sm font-medium text-gray-700">Filtrar por Estado</label>
          <select
            id="filterIsActiveCategories"
            value={filterIsActive}
            onChange={(e) => setFilterIsActive(e.target.value)}
            className="mt-1 block w-full input-style-select"
            disabled={isLoading}
          >
            <option value="">Todos</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-center py-4 text-gray-600">Cargando categorías...</p>}
      {error && !isLoading && <p className="text-red-500 bg-red-100 p-3 rounded text-center mb-4">Error: {error}</p>}

      {!isLoading && !error && (
        <>
          <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Descripción</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {categories.length > 0 ? categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cat.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-md truncate" title={cat.description}>{cat.description || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${cat.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {cat.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                      <button onClick={() => openModalForEdit(cat)} className="text-indigo-600 hover:text-indigo-800 transition-colors duration-150">Editar</button>
                      <button onClick={() => handleToggleActive(cat)} className={`${cat.is_active ? "text-yellow-600 hover:text-yellow-800" : "text-green-600 hover:text-green-800"} transition-colors duration-150`}>
                        {cat.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500">
                      No se encontraron categorías de gasto con los filtros actuales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 0 && (
             <div className="mt-6 flex flex-col sm:flex-row items-center justify-between">
                <div className="text-sm text-gray-700 mb-2 sm:mb-0">
                    Página <span className="font-medium">{currentPage}</span> de <span className="font-medium">{totalPages}</span> (Total: {totalItems} categorías)
                </div>
                <div className="flex space-x-2">
                    <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1 || isLoading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors duration-150"
                    >
                    Anterior
                    </button>
                    <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages || isLoading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors duration-150"
                    >
                    Siguiente
                    </button>
                </div>
            </div>
          )}
        </>
      )}

      {/* Modal para Crear/Editar Categoría */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingCategory ? 'Editar Categoría de Gasto' : 'Añadir Nueva Categoría de Gasto'}>
        <form onSubmit={handleSubmitForm} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nombre de la Categoría</label>
            <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} required className="mt-1 block w-full input-style" />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">Descripción (Opcional)</label>
            <textarea name="description" id="description" value={formData.description} onChange={handleInputChange} rows="3" className="mt-1 block w-full input-style"></textarea>
          </div>
          {!editingCategory && ( // Solo mostrar al crear
            <div className="flex items-center">
              <input id="is_active" name="is_active" type="checkbox" checked={formData.is_active} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"/>
              <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">Activa al crear</label>
            </div>
          )}
          {formError && <p className="text-red-500 text-xs italic text-center py-1">{formError}</p>}
          <div className="pt-5 flex justify-end space-x-3 border-t">
            <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 shadow-sm transition-colors duration-150">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md border border-transparent shadow-sm disabled:opacity-50 transition-colors duration-150">
              {isSubmitting ? 'Guardando...' : (editingCategory ? 'Actualizar Categoría' : 'Crear Categoría')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default ExpenseCategoriesPage;