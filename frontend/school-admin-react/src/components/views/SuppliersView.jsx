import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getSuppliers, createSupplier, updateSupplier, toggleSupplierActiveStatus } from '../../services/apiSuppliers';
import { getExpenseCategories } from '../../services/apiExpenseCategories';
import Modal from '../Modal';
import { toast } from 'react-toastify';
import { ChevronLeftIcon, ChevronRightIcon, PencilSquareIcon, PowerIcon } from '@heroicons/react/24/solid';

const IDENTIFICATION_TYPES = [
  { value: "V", label: "V (Cédula Venezolana)" }, { value: "E", label: "E (Cédula Extranjera)" },
  { value: "J", label: "J (RIF Jurídico)" }, { value: "P", label: "P (Pasaporte)" },
  { value: "G", label: "G (RIF Gubernamental)" },
];

const initialFormData = {
  name: '', identification_type: 'J', identification_number: '',
  category_id: '', // Campo para el ID de la categoría
  contact_person: '', phone: '', email: '', address: '', is_active: true,
};

function SuppliersView() {
  const { token } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [limitPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterIsActive, setFilterIsActive] = useState('');

  const [categoriesList, setCategoriesList] = useState([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  const fetchCategoriesForSelect = useCallback(async () => {
    if (!token) return;
    setIsLoadingCategories(true);
    try {
        const data = await getExpenseCategories(token, { limit: 200, isActive: true });
        setCategoriesList(data.items || []);
    } catch (err) {
        toast.error("No se pudieron cargar las categorías para el formulario.");
    } finally {
        setIsLoadingCategories(false);
    }
  }, [token]);

  const fetchSuppliers = useCallback(async () => {
    if (!token) { setIsLoading(false); return; }
    setIsLoading(true); setError(null);
    try {
      const skip = (currentPage - 1) * limitPerPage;
      const params = {
        skip, limit: limitPerPage, search: searchTerm || null,
        is_active: filterIsActive === '' ? null : filterIsActive === 'true',
      };
      const data = await getSuppliers(token, params);
      setSuppliers(data.items || []);
      setTotalPages(data.pages || 0);
    } catch (err) {
      setError(err.message);
      toast.error(`Error al cargar proveedores: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [token, currentPage, limitPerPage, searchTerm, filterIsActive]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterIsActive]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const openModalForCreate = () => {
    setEditingSupplier(null);
    setFormData(initialFormData);
    setFormError(null);
    setIsModalOpen(true);
    fetchCategoriesForSelect(); 
  };

  const openModalForEdit = (supplier) => {
    setEditingSupplier(supplier);
    let idType = 'J'; let idNumber = '';
    if (supplier.rif_ci) {
        const typeMatch = supplier.rif_ci.match(/^[VEJPG]/i);
        idType = typeMatch ? typeMatch[0].toUpperCase() : 'J';
        idNumber = supplier.rif_ci.substring(1);
    }
    setFormData({
      name: supplier.name || '', identification_type: idType,
      identification_number: idNumber,
      category_id: supplier.category?.id || '',
      contact_person: supplier.contact_person || '', phone: supplier.phone || '',
      email: supplier.email || '', address: supplier.address || '',
      is_active: supplier.is_active,
    });
    setFormError(null);
    setIsModalOpen(true);
    fetchCategoriesForSelect();
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.category_id) {
        toast.warn("Debe seleccionar una categoría para el proveedor.");
        return;
    }
    setIsSubmitting(true); setFormError(null);
    let combinedRifCi = null;
    if (formData.identification_number) {
        const numPart = formData.identification_number.replace(/[^0-9]/g, "");
        if (numPart) combinedRifCi = `${formData.identification_type}${numPart}`;
    }
    
    const dataPayload = {
      name: formData.name, rif_ci: combinedRifCi,
      category_id: parseInt(formData.category_id),
      contact_person: formData.contact_person || null, phone: formData.phone || null,
      email: formData.email || null, address: formData.address || null,
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
      setFormError(errorMessage); toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (supplier) => {
    if (!token) return;
    const actionText = supplier.is_active ? "desactivar" : "activar";
    if (!window.confirm(`¿Estás seguro de que deseas ${actionText} al proveedor "${supplier.name}"?`)) return;
    try {
      await toggleSupplierActiveStatus(token, supplier.id);
      toast.success(`Proveedor ${actionText}do.`);
      fetchSuppliers();
    } catch (err) { toast.error(`Error al ${actionText}: ${err.message}`); }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage && !isLoading) {
      setCurrentPage(newPage);
    }
  };
  
  const inputStyle = "block w-full rounded-md border-0 px-3 py-2 bg-white text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6";
  const selectStyle = "block w-full py-2.5 px-3 border border-slate-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm";

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800">Proveedores</h2>
            <button onClick={openModalForCreate} className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
                + Añadir Proveedor
            </button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                <div>
                    <label htmlFor="searchTermSuppliers" className="block text-sm font-medium text-gray-700 mb-1">Buscar (Nombre, RIF/CI, Email)</label>
                    <input type="text" id="searchTermSuppliers" placeholder="Escriba para buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={inputStyle} disabled={isLoading}/>
                </div>
                <div>
                    <label htmlFor="filterIsActiveSuppliers" className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Estado</label>
                    <select id="filterIsActiveSuppliers" value={filterIsActive} onChange={(e) => setFilterIsActive(e.target.value)} className={selectStyle} disabled={isLoading}>
                        <option value="">Todos</option>
                        <option value="true">Activo</option>
                        <option value="false">Inactivo</option>
                    </select>
                </div>
            </div>
        </div>

        {isLoading && <p className="text-center py-4 text-gray-600">Cargando proveedores...</p>}
        {error && !isLoading && <p className="text-red-500 bg-red-100 p-3 rounded text-center mb-4">Error: {error}</p>}
        
        {!isLoading && !error && (
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Nombre</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Categoría</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">RIF/CI</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {suppliers.length > 0 ? suppliers.map((sup) => (
                            <tr key={sup.id} className="hover:bg-slate-200">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sup.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sup.category?.name || <span className="italic text-red-500">Sin Categoría</span>}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sup.rif_ci || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sup.email || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                                    <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${sup.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{sup.is_active ? 'Activo' : 'Inactivo'}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button onClick={() => openModalForEdit(sup)} className="text-indigo-600 hover:text-indigo-800 transition-colors inline-flex items-center gap-1"><PencilSquareIcon className="w-4 h-4"/> Editar</button>
                                    <button onClick={() => handleToggleActive(sup)} className={`${sup.is_active ? "text-yellow-600 hover:text-yellow-800" : "text-green-600 hover:text-green-800"} transition-colors inline-flex items-center gap-1 ml-4`}><PowerIcon className="w-4 h-4"/> {sup.is_active ? 'Desactivar' : 'Activar'}</button>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="6" className="text-center py-10">No se encontraron proveedores.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        )}

        <Modal isOpen={isModalOpen} onClose={closeModal} title={editingSupplier ? 'Editar Proveedor' : 'Añadir Nuevo Proveedor'}>
            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div>
                <label htmlFor="name_supplier" className="block text-sm font-medium text-gray-700">Nombre o Razón Social*</label>
                <input type="text" name="name" id="name_supplier" value={formData.name} onChange={handleInputChange} required className="mt-1 block w-full input-style" />
              </div>
              
              <div>
                <label htmlFor="category_id" className="block text-sm font-medium text-gray-700">Categoría del Proveedor*</label>
                <select id="category_id" name="category_id" value={formData.category_id} onChange={handleInputChange} required className="mt-1 block w-full input-style-select" disabled={isLoadingCategories}>
                    <option value="" disabled>{isLoadingCategories ? 'Cargando categorías...' : 'Seleccione una categoría'}</option>
                    {categoriesList.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                </select>
                {categoriesList.length === 0 && !isLoadingCategories && <p className="text-xs text-red-500 mt-1">No hay categorías activas. Debe crear una categoría antes de añadir un proveedor.</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label htmlFor="identification_type_supplier" className="block text-sm font-medium text-gray-700">Tipo Ident.</label>
                  <select name="identification_type" id="identification_type_supplier" value={formData.identification_type} onChange={handleInputChange} className="mt-1 block w-full input-style-select">
                    {IDENTIFICATION_TYPES.map(type => (<option key={type.value} value={type.value}>{type.label}</option>))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="identification_number_supplier" className="block text-sm font-medium text-gray-700">Número (Opcional)</label>
                  <input type="text" name="identification_number" id="identification_number_supplier" value={formData.identification_number} onChange={handleInputChange} className="mt-1 block w-full input-style" placeholder="Ej: 12345678"/>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label htmlFor="email_supplier" className="block text-sm font-medium text-gray-700">Email (Opcional)</label><input type="email" name="email" id="email_supplier" value={formData.email} onChange={handleInputChange} className="mt-1 block w-full input-style" /></div>
                <div><label htmlFor="phone_supplier" className="block text-sm font-medium text-gray-700">Teléfono (Opcional)</label><input type="tel" name="phone" id="phone_supplier" value={formData.phone} onChange={handleInputChange} className="mt-1 block w-full input-style" /></div>
              </div>
              <div><label htmlFor="contact_person_supplier" className="block text-sm font-medium text-gray-700">Persona de Contacto (Opcional)</label><input type="text" name="contact_person" id="contact_person_supplier" value={formData.contact_person} onChange={handleInputChange} className="mt-1 block w-full input-style" /></div>
              <div><label htmlFor="address_supplier" className="block text-sm font-medium text-gray-700">Dirección (Opcional)</label><textarea name="address" id="address_supplier" value={formData.address} onChange={handleInputChange} rows="2" className="mt-1 block w-full input-style"></textarea></div>
              {!editingSupplier && (<div className="flex items-center"><input id="is_active_supplier" name="is_active" type="checkbox" checked={formData.is_active} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"/><label htmlFor="is_active_supplier" className="ml-2 block text-sm text-gray-900">Activo al crear</label></div>)}
              {formError && <p className="text-red-500 text-xs italic text-center py-1">{formError}</p>}
              
              <div className="pt-5 flex justify-end space-x-3 border-t">
                <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">Cancelar</button>
                <button type="submit" disabled={isSubmitting || isLoadingCategories} className="text-sm inline-flex items-center gap-x-2 px-3 py-2 font-semibold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
                  {isSubmitting ? 'Guardando...' : (editingSupplier ? 'Actualizar Proveedor' : 'Crear Proveedor')}
                </button>
              </div>
            </form>
        </Modal>
    </div>
  );
}

export default SuppliersView;