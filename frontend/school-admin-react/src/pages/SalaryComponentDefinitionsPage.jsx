import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    getSalaryComponentDefinitions,
    createSalaryComponentDefinition,
    updateSalaryComponentDefinition,
    deleteSalaryComponentDefinition // o una función para toggle active si prefieres soft delete o manejo de estado
} from '../services/apiPersonnel'; // Asegúrate que estas funciones existan y estén en inglés
import Modal from '../components/Modal';
import { toast } from 'react-toastify';

// Constantes para los selectores del formulario, deben coincidir con los valores de los Enums del backend
const SALARY_COMPONENT_TYPES = [
    { value: "earning", label: "Asignación (Ingreso)" },
    { value: "deduction", label: "Deducción" },
];

const SALARY_COMPONENT_CALCULATION_TYPES = [
    { value: "fixed_amount", label: "Monto Fijo" },
    { value: "percentage_of_base_salary", label: "Porcentaje del Salario Base" },
    // Podrías añadir más aquí si los defines en el backend
];

const CURRENCIES_OPTIONS = [ // Ya tienes una similar, asegúrate de usar una consistente
    { value: "VES", label: "VES (Bolívares)" },
    { value: "USD", label: "USD (Dólares Americanos)" },
    { value: "EUR", label: "EUR (Euros)" },
];

const initialFormData = {
  name: '',
  description: '',
  component_type: 'earning',
  calculation_type: 'fixed_amount',
  default_value: '', // Puede ser monto o porcentaje
  default_currency: 'VES', // Aplicable solo si calculation_type es fixed_amount
  is_taxable: false,
  is_active: true,
};

function SalaryComponentDefinitionsPage() {
  const { token } = useAuth();
  const [definitions, setDefinitions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [limitPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterIsActive, setFilterIsActive] = useState('');
  const [filterComponentType, setFilterComponentType] = useState('');


  const fetchDefinitions = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const skip = (currentPage - 1) * limitPerPage;
      const params = { 
        skip, 
        limit: limitPerPage, 
        search: searchTerm || null,
        isActive: filterIsActive === '' ? null : filterIsActive === 'true',
        componentType: filterComponentType || null // El backend espera 'component_type'
      };
      const data = await getSalaryComponentDefinitions(token, params);
      setDefinitions(data.items || []);
      setTotalItems(data.total || 0);
      setTotalPages(data.pages || 0);
    } catch (err) {
      setError(err.message);
      toast.error(`Error al cargar definiciones de componentes: ${err.message}`);
      setDefinitions([]); setTotalItems(0); setTotalPages(0);
    } finally {
      setIsLoading(false);
    }
  }, [token, currentPage, limitPerPage, searchTerm, filterIsActive, filterComponentType]);

  useEffect(() => {
    fetchDefinitions();
  }, [fetchDefinitions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterIsActive, filterComponentType]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    let val = type === 'checkbox' ? checked : value;

    if (name === "default_value") {
        val = value === '' ? '' : parseFloat(value);
    }
    
    setFormData(prev => {
        const newState = { ...prev, [name]: val };
        // Si el tipo de cálculo no es monto fijo, limpiar/deshabilitar la moneda por defecto
        if (name === "calculation_type" && val !== "fixed_amount") {
            newState.default_currency = ''; // O null, según prefieras manejarlo
        }
        return newState;
    });
  };

  const openModalForCreate = () => {
    setEditingDefinition(null);
    setFormData(initialFormData);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openModalForEdit = (definition) => {
    setEditingDefinition(definition);
    setFormData({
      name: definition.name || '',
      description: definition.description || '',
      component_type: definition.component_type || 'earning',
      calculation_type: definition.calculation_type || 'fixed_amount',
      default_value: definition.default_value !== null ? definition.default_value.toString() : '',
      default_currency: definition.default_currency || (definition.calculation_type === 'fixed_amount' ? 'VES' : ''),
      is_taxable: definition.is_taxable || false,
      is_active: definition.is_active === undefined ? true : definition.is_active,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDefinition(null);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!token) { toast.error("Autenticación requerida."); return; }
    if (!formData.name.trim()) {
        toast.warn("El nombre del componente es obligatorio.");
        setFormError("El nombre es obligatorio.");
        return;
    }
     if (formData.calculation_type === 'fixed_amount' && !formData.default_currency) {
        toast.warn("Debe seleccionar una moneda para componentes de monto fijo.");
        setFormError("Moneda requerida para monto fijo.");
        return;
    }
    if (formData.default_value === '' || isNaN(parseFloat(formData.default_value))) {
        toast.warn("El valor por defecto debe ser un número.");
        setFormError("Valor por defecto inválido.");
        return;
    }


    setIsSubmitting(true);
    setFormError(null);
    try {
      const dataToSubmit = {
        name: formData.name,
        description: formData.description || null,
        component_type: formData.component_type,
        calculation_type: formData.calculation_type,
        default_value: parseFloat(formData.default_value),
        default_currency: formData.calculation_type === 'fixed_amount' ? formData.default_currency : null,
        is_taxable: formData.is_taxable,
      };

      if (editingDefinition) {
        // is_active se maneja por separado con un toggle, no en el update general
        await updateSalaryComponentDefinition(token, editingDefinition.id, dataToSubmit);
        toast.success("Definición de componente actualizada!");
      } else {
        await createSalaryComponentDefinition(token, { ...dataToSubmit, is_active: formData.is_active });
        toast.success("Definición de componente creada!");
      }
      closeModal();
      fetchDefinitions(); 
    } catch (err) {
      const errorMessage = err.message || "Ocurrió un error.";
      setFormError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (definition) => {
    if (!token) { toast.error("Autenticación requerida."); return; }
    const actionText = definition.is_active ? "desactivar" : "activar";
    if (!window.confirm(`¿Seguro que desea ${actionText} el componente "${definition.name}"?`)) return;
    
    try {
      // El backend podría tener un endpoint PATCH para is_active, o usar PUT con solo is_active.
      // Asumiendo que updateSalaryComponentDefinition puede manejar solo el cambio de is_active.
      await updateSalaryComponentDefinition(token, definition.id, { is_active: !definition.is_active });
      toast.success(`Componente ${actionText}do.`);
      fetchDefinitions();
    } catch (err) {
      toast.error(`Error al ${actionText} componente: ${err.message}`);
    }
  };
  
  const handleDelete = async (definitionId, definitionName) => {
    if (!token) { toast.error("Autenticación requerida."); return; }
    if (!window.confirm(`¿Está seguro de eliminar el componente "${definitionName}"? Esta acción no se puede deshacer y podría fallar si está en uso.`)) return;
    try {
        await deleteSalaryComponentDefinition(token, definitionId);
        toast.success(`Componente "${definitionName}" eliminado.`);
        fetchDefinitions();
    } catch (err) {
        toast.error(`Error al eliminar componente: ${err.message}`);
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
        <h1 className="text-3xl font-extrabold text-gray-800">Definiciones de Componentes Salariales</h1>
        <button
          onClick={openModalForCreate}
          className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none"
        >
          + Crear Definición
        </button>
      </div>

      <div className="mb-6 p-4 bg-gray-50 rounded-lg shadow grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <label htmlFor="searchTermSCD" className="block text-sm font-medium text-gray-700">Buscar por Nombre</label>
          <input type="text" id="searchTermSCD" placeholder="Nombre del componente..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="mt-1 block w-full input-style" disabled={isLoading}/>
        </div>
        <div>
          <label htmlFor="filterComponentTypeSCD" className="block text-sm font-medium text-gray-700">Tipo de Componente</label>
          <select id="filterComponentTypeSCD" value={filterComponentType} onChange={(e) => setFilterComponentType(e.target.value)} className="mt-1 block w-full input-style-select" disabled={isLoading}>
            <option value="">Todos</option>
            {SALARY_COMPONENT_TYPES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filterIsActiveSCD" className="block text-sm font-medium text-gray-700">Estado</label>
          <select id="filterIsActiveSCD" value={filterIsActive} onChange={(e) => setFilterIsActive(e.target.value)} className="mt-1 block w-full input-style-select" disabled={isLoading}>
            <option value="">Todos</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-center py-4">Cargando definiciones...</p>}
      {error && !isLoading && <p className="text-red-500 bg-red-100 p-3 rounded text-center mb-4">Error: {error}</p>}

      {!isLoading && !error && (
        <>
          <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Cálculo</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Valor Def.</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">¿Imponible?</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {definitions.length > 0 ? definitions.map((def) => (
                  <tr key={def.id} className="hover:bg-slate-200">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900" title={def.description || def.name}>{def.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{SALARY_COMPONENT_TYPES.find(t => t.value === def.component_type)?.label || def.component_type}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{SALARY_COMPONENT_CALCULATION_TYPES.find(t => t.value === def.calculation_type)?.label || def.calculation_type}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                        {def.default_value !== null ? parseFloat(def.default_value).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits: (def.calculation_type === 'percentage_of_base_salary' ? 4:2)}) : '-'}
                        {def.calculation_type === 'fixed_amount' && def.default_currency ? ` ${def.default_currency}` : (def.calculation_type === 'percentage_of_base_salary' ? '%' : '')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-center">{def.is_taxable ? 'Sí' : 'No'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                      <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${def.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {def.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button onClick={() => openModalForEdit(def)} className="text-indigo-600 hover:text-indigo-800">Editar</button>
                      <button onClick={() => handleToggleActive(def)} className={def.is_active ? "text-yellow-600 hover:text-yellow-800" : "text-green-600 hover:text-green-800"}>
                        {def.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                       <button onClick={() => handleDelete(def.id, def.name)} className="text-red-600 hover:text-red-800">Eliminar</button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="7" className="px-6 py-4 text-center text-sm text-gray-500">No se encontraron definiciones.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 0 && (
             <div className="mt-6 flex items-center justify-between text-xs">
                <span>Página {currentPage} de {totalPages} (Total: {totalItems} definiciones)</span>
                <div>
                    <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="px-3 py-1 btn-secondary-xs disabled:opacity-50 mr-1">Ant.</button>
                    <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="px-3 py-1 btn-secondary-xs disabled:opacity-50">Sig.</button>
                </div>
            </div>
          )}
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingDefinition ? 'Editar Definición de Componente Salarial' : 'Crear Nueva Definición de Componente Salarial'}>
        <form onSubmit={handleSubmitForm} className="space-y-4 text-sm">
          <div>
            <label htmlFor="name_scd_modal" className="block text-sm font-medium">Nombre del Componente*</label>
            <input type="text" name="name" id="name_scd_modal" value={formData.name} onChange={handleInputChange} required className="mt-1 block w-full input-style"/>
          </div>
          <div>
            <label htmlFor="description_scd_modal" className="block text-sm font-medium">Descripción</label>
            <textarea name="description" id="description_scd_modal" value={formData.description} onChange={handleInputChange} rows="2" className="mt-1 block w-full input-style"></textarea>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="component_type_scd_modal" className="block text-sm font-medium">Tipo*</label>
              <select name="component_type" id="component_type_scd_modal" value={formData.component_type} onChange={handleInputChange} className="mt-1 block w-full input-style-select">
                {SALARY_COMPONENT_TYPES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="calculation_type_scd_modal" className="block text-sm font-medium">Tipo de Cálculo*</label>
              <select name="calculation_type" id="calculation_type_scd_modal" value={formData.calculation_type} onChange={handleInputChange} className="mt-1 block w-full input-style-select">
                {SALARY_COMPONENT_CALCULATION_TYPES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="default_value_scd_modal" className="block text-sm font-medium">Valor por Defecto*</label>
              <input type="number" name="default_value" id="default_value_scd_modal" value={formData.default_value} onChange={handleInputChange} required step="any" placeholder={formData.calculation_type === 'percentage_of_base_salary' ? "Ej: 0.1 para 10%" : "Monto"} className="mt-1 block w-full input-style"/>
            </div>
            {formData.calculation_type === 'fixed_amount' && (
              <div>
                <label htmlFor="default_currency_scd_modal" className="block text-sm font-medium">Moneda del Valor Fijo*</label>
                <select name="default_currency" id="default_currency_scd_modal" value={formData.default_currency} onChange={handleInputChange} required={formData.calculation_type === 'fixed_amount'} className="mt-1 block w-full input-style-select">
                  {CURRENCIES_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-start space-x-4">
            <div className="flex items-center">
                <input id="is_taxable_scd_modal" name="is_taxable" type="checkbox" checked={formData.is_taxable} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                <label htmlFor="is_taxable_scd_modal" className="ml-2 block text-sm">¿Es Imponible (para impuestos)?</label>
            </div>
            {!editingDefinition && (
                <div className="flex items-center">
                    <input id="is_active_scd_modal" name="is_active" type="checkbox" checked={formData.is_active} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                    <label htmlFor="is_active_scd_modal" className="ml-2 block text-sm">Activo al Crear</label>
                </div>
            )}
          </div>
          {formError && <p className="text-red-500 text-xs italic text-center py-1 bg-red-50 rounded">{formError}</p>}
          <div className="pt-4 flex justify-end space-x-3 border-t">
            <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-200">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
              {isSubmitting ? 'Guardando...' : (editingDefinition ? 'Actualizar Definición' : 'Crear Definición')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default SalaryComponentDefinitionsPage;