import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    getSuppliers,
    createSupplier,
    updateSupplier,
    toggleSupplierActiveStatus
} from '../services/apiSuppliers';
import Modal from '../components/Modal';
import { toast } from 'react-toastify';

const IDENTIFICATION_TYPES = [
  { value: "V", label: "V (Cédula Venezolana)" },
  { value: "E", label: "E (Cédula Extranjera)" },
  { value: "J", label: "J (RIF Jurídico)" },
  { value: "P", label: "P (Pasaporte)" },
  { value: "G", label: "G (RIF Gubernamental)" },
];

const initialFormData = {
  name: '',
  identification_type: 'J', // Default a J para proveedores
  identification_number: '', // Solo el número
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  is_active: true,
};

function SuppliersPage() {
  const { token } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [limitPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterIsActive, setFilterIsActive] = useState('');

  const fetchSuppliers = useCallback(async () => {
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
      const data = await getSuppliers(token, params);
      setSuppliers(data.items || []);
      setTotalItems(data.total || 0);
      setTotalPages(data.pages || 0);
    } catch (err) {
      setError(err.message);
      toast.error(`Error al cargar proveedores: ${err.message}`);
      setSuppliers([]); setTotalItems(0); setTotalPages(0);
    } finally {
      setIsLoading(false);
    }
  }, [token, currentPage, limitPerPage, searchTerm, filterIsActive]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterIsActive]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const openModalForCreate = () => {
    setEditingSupplier(null);
    setFormData(initialFormData);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openModalForEdit = (supplier) => {
    setEditingSupplier(supplier);
    let idType = 'J'; // Default
    let idNumber = '';
    if (supplier.rif_ci) {
        const typeMatch = supplier.rif_ci.match(/^[VEJPG]/i); // Solo V, E, J, P, G
        if (typeMatch) {
            idType = typeMatch[0].toUpperCase();
            idNumber = supplier.rif_ci.substring(1);
        } else if (/^\d+$/.test(supplier.rif_ci)) { // Si es solo numérico (ej. cédula sin prefijo)
            idType = 'V'; // Asumir V o dejar que el usuario corrija
            idNumber = supplier.rif_ci;
        } else {
            // Si no coincide, podría ser un pasaporte complejo o un RIF mal formado.
            // Mejor dejar que el usuario lo vea y corrija si es necesario.
            // O podrías intentar una lógica más compleja para 'P' si los pasaportes son alfanuméricos.
            // Por ahora, para el patrón actual del backend, esto es lo más cercano.
            idType = supplier.rif_ci.charAt(0).toUpperCase(); // Intenta tomar la primera letra
            idNumber = supplier.rif_ci.substring(1);
            if (!IDENTIFICATION_TYPES.find(it => it.value === idType)) idType = 'J'; // Default si no es válido
        }
    }

    setFormData({
      name: supplier.name || '',
      identification_type: idType,
      identification_number: idNumber,
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      // is_active no se edita en el form, se usa toggle
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!token) {
      toast.error("Error de autenticación.");
      return;
    }
    setIsSubmitting(true);
    setFormError(null);

    // Combinar tipo y número para el campo rif_ci del backend
    // El backend espera un string como "J123456789" o null.
    // El patrón backend: r"^[VEJPGGvejpgg]?\d+$"
    let combinedRifCi = null;
    if (formData.identification_number) {
        const numPart = formData.identification_number.replace(/[^0-9]/g, ""); // Solo dígitos para el número
        if (numPart) { // Solo si hay un número después de limpiar
            combinedRifCi = `${formData.identification_type}${numPart}`;
        }
    }


    const dataPayload = {
      name: formData.name,
      rif_ci: combinedRifCi, // Enviar el RIF/CI combinado o null
      contact_person: formData.contact_person || null,
      phone: formData.phone || null,
      email: formData.email || null, // Enviar null si está vacío, Pydantic con EmailStr lo validará
      address: formData.address || null,
    };

    try {
      if (editingSupplier) {
        await updateSupplier(token, editingSupplier.id, dataPayload);
        toast.success("Proveedor actualizado!");
      } else {
        await createSupplier(token, { ...dataPayload, is_active: formData.is_active });
        toast.success("Proveedor creado!");
      }
      closeModal();
      fetchSuppliers();
    } catch (err) {
      const errorMessage = err.message || "Ocurrió un error.";
      setFormError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (supplier) => {
    // ... (lógica idéntica a ExpenseCategoriesPage)
    if (!token) {
      toast.error("Error de autenticación.");
      return;
    }
    const actionText = supplier.is_active ? "desactivar" : "activar";
    if (!window.confirm(`¿Estás seguro de que deseas ${actionText} al proveedor "${supplier.name}"?`)) {
      return;
    }
    try {
      await toggleSupplierActiveStatus(token, supplier.id);
      toast.success(`Proveedor ${actionText}do exitosamente.`);
      fetchSuppliers();
    } catch (err) {
      toast.error(`Error al ${actionText} el proveedor: ${err.message}`);
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
        <h1 className="text-3xl font-extrabold text-gray-800">Gestión de Proveedores</h1>
        <button
          onClick={openModalForCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded shadow-md transition duration-150 ease-in-out"
        >
          + Añadir Proveedor
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg shadow grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div>
          <label htmlFor="searchTermSuppliers" className="block text-sm font-medium text-gray-700">Buscar (Nombre, RIF/CI, Email, Contacto)</label>
          <input
            type="text"
            id="searchTermSuppliers"
            placeholder="Escriba para buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mt-1 block w-full input-style"
            disabled={isLoading}
          />
        </div>
        <div>
          <label htmlFor="filterIsActiveSuppliers" className="block text-sm font-medium text-gray-700">Filtrar por Estado</label>
          <select
            id="filterIsActiveSuppliers"
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

      {isLoading && <p className="text-center py-4 text-gray-600">Cargando proveedores...</p>}
      {error && !isLoading && <p className="text-red-500 bg-red-100 p-3 rounded text-center mb-4">Error: {error}</p>}

      {!isLoading && !error && (
        <>
          <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">RIF/CI</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Teléfono</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {suppliers.length > 0 ? suppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sup.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sup.rif_ci || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sup.email || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sup.phone || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${sup.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {sup.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                      <button onClick={() => openModalForEdit(sup)} className="text-indigo-600 hover:text-indigo-800 transition-colors duration-150">Editar</button>
                      <button onClick={() => handleToggleActive(sup)} className={`${sup.is_active ? "text-yellow-600 hover:text-yellow-800" : "text-green-600 hover:text-green-800"} transition-colors duration-150`}>
                        {sup.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500">
                      No se encontraron proveedores.
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
                    Página <span className="font-medium">{currentPage}</span> de <span className="font-medium">{totalPages}</span> (Total: {totalItems} proveedores)
                </div>
                <div className="flex space-x-2">
                    <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="px-4 py-2 text-sm btn-secondary disabled:opacity-50">Anterior</button>
                    <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="px-4 py-2 text-sm btn-secondary disabled:opacity-50">Siguiente</button>
                </div>
            </div>
          )}
        </>
      )}

      {/* Modal para Crear/Editar Proveedor */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingSupplier ? 'Editar Proveedor' : 'Añadir Nuevo Proveedor'}>
        <form onSubmit={handleSubmitForm} className="space-y-4">
          <div>
            <label htmlFor="name_supplier" className="block text-sm font-medium text-gray-700">Nombre o Razón Social</label>
            <input type="text" name="name" id="name_supplier" value={formData.name} onChange={handleInputChange} required className="mt-1 block w-full input-style" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label htmlFor="identification_type_supplier" className="block text-sm font-medium text-gray-700">Tipo Ident.</label>
              <select 
                name="identification_type" 
                id="identification_type_supplier" 
                value={formData.identification_type} 
                onChange={handleInputChange} 
                className="mt-1 block w-full input-style-select"
              >
                {IDENTIFICATION_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="identification_number_supplier" className="block text-sm font-medium text-gray-700">Número Identificación (Opcional)</label>
              <input 
                type="text" 
                name="identification_number" // Cambiado de rif_ci a identification_number para el form
                id="identification_number_supplier" 
                value={formData.identification_number} 
                onChange={handleInputChange} 
                className="mt-1 block w-full input-style" 
                placeholder="Ej: 12345678, P123XYZ"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email_supplier" className="block text-sm font-medium text-gray-700">Email (Opcional)</label>
              <input type="email" name="email" id="email_supplier" value={formData.email} onChange={handleInputChange} className="mt-1 block w-full input-style" />
            </div>
            <div>
              <label htmlFor="phone_supplier" className="block text-sm font-medium text-gray-700">Teléfono (Opcional)</label>
              <input type="tel" name="phone" id="phone_supplier" value={formData.phone} onChange={handleInputChange} className="mt-1 block w-full input-style" />
            </div>
          </div>
          <div>
            <label htmlFor="contact_person_supplier" className="block text-sm font-medium text-gray-700">Persona de Contacto (Opcional)</label>
            <input type="text" name="contact_person" id="contact_person_supplier" value={formData.contact_person} onChange={handleInputChange} className="mt-1 block w-full input-style" />
          </div>
          <div>
            <label htmlFor="address_supplier" className="block text-sm font-medium text-gray-700">Dirección (Opcional)</label>
            <textarea name="address" id="address_supplier" value={formData.address} onChange={handleInputChange} rows="2" className="mt-1 block w-full input-style"></textarea>
          </div>
          {!editingSupplier && (
            <div className="flex items-center">
              <input id="is_active_supplier" name="is_active" type="checkbox" checked={formData.is_active} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"/>
              <label htmlFor="is_active_supplier" className="ml-2 block text-sm text-gray-900">Activo al crear</label>
            </div>
          )}
          {formError && <p className="text-red-500 text-xs italic text-center py-1">{formError}</p>}
          <div className="pt-5 flex justify-end space-x-3 border-t">
            <button 
              type="button" 
              onClick={closeModal} 
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting} 
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : (editingSupplier ? 'Actualizar Proveedor' : 'Crear Proveedor')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default SuppliersPage;