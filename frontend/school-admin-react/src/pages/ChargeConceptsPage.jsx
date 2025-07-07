// src/pages/ChargeConceptsPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    getChargeConcepts,
    createChargeConcept,
    updateChargeConcept,
    activateChargeConcept,
    deactivateChargeConcept
} from '../services/apiChargeConcepts';
import { getGradeLevels } from '../services/apiGradeLevels';
import { getLatestExchangeRate } from '../services/apiExchangeRates';
import Modal from '../components/Modal';
import ApplyGlobalChargeModal from '../components/ApplyGlobalChargeModal'; // <--- NUEVA IMPORTACIÓN
import { toast } from 'react-toastify';

const CHARGE_FREQUENCIES = [
    { value: "mensual", label: "Mensual" }, { value: "quincenal", label: "Quincenal" },
    { value: "anual", label: "Anual" }, { value: "unico", label: "Único" },
    { value: "otro", label: "Otro" },
];
const CHARGE_CATEGORIES = [
    { value: "mensualidad", label: "Mensualidad" }, { value: "inscripcion", label: "Inscripción" },
    { value: "servicio_recurrente", label: "Servicio Recurrente" }, { value: "cargo_unico", label: "Cargo Único" },
    { value: "producto", label: "Producto" }, { value: "otro", label: "Otro" },
];
const CURRENCIES = [
    { value: "USD", label: "USD ($)" }, { value: "VES", label: "VES (Bs.)" }, { value: "EUR", label: "EUR (€)" },
];

const initialFormData = {
  name: '', description: '', default_amount: 0, default_amount_currency: 'USD',
  is_amount_fixed: true, default_frequency: 'unico', category: 'otro',
  iva_percentage: 0.0, applicable_grade_level_id: null, is_active: true,
};

const formatLocalCurrency = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};

function ChargeConceptsPage() {
  const { token } = useAuth();
  const [chargeConcepts, setChargeConcepts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [limitPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false); // Para CRUD de conceptos
  const [editingConcept, setEditingConcept] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterGradeLevel, setFilterGradeLevel] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterFrequency, setFilterFrequency] = useState('');

  const [gradeLevelsList, setGradeLevelsList] = useState([]);
  const [isLoadingFiltersData, setIsLoadingFiltersData] = useState(true);

  const [currentUSDRate, setCurrentUSDRate] = useState(null);
  const [isLoadingRates, setIsLoadingRates] = useState(true);

  // --- ESTADOS PARA EL NUEVO MODAL DE CARGO GLOBAL ---
  const [isGlobalChargeModalOpen, setIsGlobalChargeModalOpen] = useState(false);
  const [selectedConceptForGlobal, setSelectedConceptForGlobal] = useState(null);

  const fetchChargeConcepts = useCallback(async () => {
    if (!token) return;
    setIsLoading(true); setError(null);
    try {
      const skip = (currentPage - 1) * limitPerPage;
      const params = {
        skip, limit: limitPerPage, search: searchTerm,
        isActive: filterStatus === '' ? null : filterStatus === 'true',
        applicableGradeLevelId: filterGradeLevel === '' ? null : (filterGradeLevel === '0' ? 0 : parseInt(filterGradeLevel)),
        category: filterCategory || null, frequency: filterFrequency || null,
      };
      const data = await getChargeConcepts(token, params);
      setChargeConcepts(data.items || []);
      setTotalItems(data.total || 0);
      setTotalPages(data.pages || 0);
    } catch (err) { setError(err.message); toast.error(`Error al cargar conceptos: ${err.message}`); }
    finally { setIsLoading(false); }
  }, [token, currentPage, limitPerPage, searchTerm, filterStatus, filterGradeLevel, filterCategory, filterFrequency]);

  useEffect(() => {
    const loadFilterDropdowns = async () => {
        if (!token) { setIsLoadingFiltersData(false); return; }
        setIsLoadingFiltersData(true);
        try {
            const gradesData = await getGradeLevels(token, { limit: 100, isActive: true });
            if (gradesData && (Array.isArray(gradesData) || Array.isArray(gradesData.items))) {
                setGradeLevelsList(Array.isArray(gradesData) ? gradesData : gradesData.items);
            } else { setGradeLevelsList([]); }
        } catch (err) { toast.error("Error cargando niveles para filtros."); console.error(err); }
        finally { setIsLoadingFiltersData(false); }
    };
    loadFilterDropdowns();
  }, [token]);

  useEffect(() => {
    const fetchRates = async () => {
        if (!token) { setIsLoadingRates(false); return; }
        setIsLoadingRates(true);
        try {
            const usdRateData = await getLatestExchangeRate(token, "USD");
            if (usdRateData && usdRateData.rate) { setCurrentUSDRate(parseFloat(usdRateData.rate)); }
            else { setCurrentUSDRate(null); toast.warn("Tasa USD no disponible."); }
        } catch (err) { setCurrentUSDRate(null); toast.error("Error cargando tasas."); console.error(err); }
        finally { setIsLoadingRates(false); }
    };
    fetchRates();
  }, [token]);

  useEffect(() => { fetchChargeConcepts(); }, [fetchChargeConcepts]);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterStatus, filterGradeLevel, filterCategory, filterFrequency]);

  const handleInputChange = (e) => { /* ... (sin cambios) ... */
    const { name, value, type, checked } = e.target;
    let val = type === 'checkbox' ? checked : value;
    if (name === 'default_amount' || name === 'iva_percentage') {
        val = value === '' ? '' : parseFloat(value); 
    } else if (name === 'applicable_grade_level_id' && val === 'null') { 
        val = null;
    }
    setFormData(prev => ({ ...prev, [name]: val }));
  };
  const openModalForCreate = () => { /* ... (sin cambios) ... */
    setEditingConcept(null);
    setFormData(initialFormData);
    setFormError(null);
    setIsModalOpen(true);
  };
  const openModalForEdit = (concept) => { /* ... (sin cambios) ... */
    setEditingConcept(concept);
    setFormData({
      name: concept.name || '', description: concept.description || '',
      default_amount: concept.default_amount || 0, default_amount_currency: concept.default_amount_currency || 'USD',
      is_amount_fixed: concept.is_amount_fixed === undefined ? true : concept.is_amount_fixed,
      default_frequency: concept.default_frequency || 'unico', category: concept.category || 'otro',
      iva_percentage: concept.iva_percentage || 0.0,
      applicable_grade_level_id: concept.applicable_grade_level_id === null ? 'null' : (concept.applicable_grade_level_id?.toString() || 'null'),
      is_active: concept.is_active,
    });
    setFormError(null);
    setIsModalOpen(true);
  };
  const closeModal = () => setIsModalOpen(false);
  const handleSubmitForm = async (e) => { /* ... (sin cambios) ... */
    e.preventDefault();
    if (!token) { return; }
    setIsSubmitting(true); setFormError(null);
    try {
      const dataToSubmit = {
        ...formData,
        default_amount: parseFloat(formData.default_amount) || 0,
        iva_percentage: parseFloat(formData.iva_percentage) || 0.0,
        applicable_grade_level_id: formData.applicable_grade_level_id === 'null' || formData.applicable_grade_level_id === '' ? null : parseInt(formData.applicable_grade_level_id),
      };
      if (editingConcept) { delete dataToSubmit.is_active; }

      if (editingConcept) {
        await updateChargeConcept(token, editingConcept.id, dataToSubmit);
        toast.success("Concepto de Cargo actualizado!");
      } else {
        await createChargeConcept(token, {...dataToSubmit, is_active: formData.is_active });
        toast.success("Concepto de Cargo creado!");
      }
      closeModal(); fetchChargeConcepts();
    } catch (err) { setFormError(err.message); toast.error(`Error: ${err.message}`); }
    finally { setIsSubmitting(false); }
  };
  const toggleActiveStatus = async (concept) => { /* ... (sin cambios) ... */
    if (!token) { return; }
    const action = concept.is_active ? deactivateChargeConcept : activateChargeConcept;
    const actionVerb = concept.is_active ? "desactivado" : "activado";
    const confirmMessage = concept.is_active 
        ? `¿Seguro que deseas desactivar "${concept.name}"?`
        : `¿Seguro que deseas activar "${concept.name}"?`;
    if (!window.confirm(confirmMessage)) return;
    try {
      await action(token, concept.id);
      toast.success(`Concepto ${actionVerb}.`); fetchChargeConcepts();
    } catch (err) { toast.error(`Error al ${actionVerb.slice(0,-1)}ar: ${err.message}`); }
  };
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      setCurrentPage(newPage);
    }
  };

  // --- MANEJADORES PARA EL MODAL DE CARGO GLOBAL ---
  const openApplyGlobalModal = (concept) => {
    setSelectedConceptForGlobal(concept);
    setIsGlobalChargeModalOpen(true);
  };

  const handleGlobalChargeApplied = (summary) => {

    setIsGlobalChargeModalOpen(false); 

  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold text-gray-800">Gestión de Conceptos de Cargo</h1>
        <button onClick={openModalForCreate} className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
          + Añadir Concepto
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-6 p-4 bg-gray-50 rounded-md shadow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-end">
        {/* ... (JSX de filtros sin cambios) ... */}
        <div>
          <label htmlFor="searchTermConcepts" className="block text-sm font-medium text-gray-700">Buscar</label>
          <input type="text" id="searchTermConcepts" placeholder="Nombre o descripción..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="mt-1 block w-full input-style"/>
        </div>
        <div>
          <label htmlFor="filterGradeLevelConcepts" className="block text-sm font-medium text-gray-700">Nivel Aplicable</label>
          <select id="filterGradeLevelConcepts" value={filterGradeLevel} onChange={(e) => setFilterGradeLevel(e.target.value)} className="mt-1 block w-full input-style-select" disabled={isLoadingFiltersData}>
            <option value="">{isLoadingFiltersData ? "Cargando..." : "Todos"}</option>
            <option value="0">General (Ninguno)</option>
            {gradeLevelsList.map(gl => <option key={gl.id} value={gl.id}>{gl.name}</option>)}
          </select>
        </div>
         <div>
          <label htmlFor="filterCategoryConcepts" className="block text-sm font-medium text-gray-700">Categoría</label>
          <select id="filterCategoryConcepts" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="mt-1 block w-full input-style-select">
            <option value="">Todas</option>
            {CHARGE_CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filterFrequencyConcepts" className="block text-sm font-medium text-gray-700">Frecuencia</label>
          <select id="filterFrequencyConcepts" value={filterFrequency} onChange={(e) => setFilterFrequency(e.target.value)} className="mt-1 block w-full input-style-select">
            <option value="">Todas</option>
            {CHARGE_FREQUENCIES.map(freq => <option key={freq.value} value={freq.value}>{freq.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filterStatusConcepts" className="block text-sm font-medium text-gray-700">Estado</label>
          <select id="filterStatusConcepts" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="mt-1 block w-full input-style-select">
            <option value="">Todos</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </div>
      </div>
      
      {isLoadingRates && <p className="text-sm text-center text-gray-500 mb-2">Cargando tasa de cambio...</p>}
      {isLoading && <p className="text-center py-4">Cargando conceptos de cargo...</p>}
      {error && !isLoading && <p className="text-red-500 bg-red-100 p-3 rounded text-center mb-4">Error: {error}</p>}

      {!isLoading && !error && (
        <>
          <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monto Def.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frec.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nivel Aplic.</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">%IVA</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monto Eq. Bs.S (Aprox.)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {chargeConcepts.length > 0 ? chargeConcepts.map((concept) => {
                    let equivalentVesAmount = 'Calculando...';
                    if (!isLoadingRates) {
                        if (concept.default_amount_currency === 'VES') {
                            equivalentVesAmount = formatLocalCurrency(concept.default_amount, 'VES');
                        } else if (concept.default_amount_currency === 'USD' && currentUSDRate) {
                            equivalentVesAmount = formatLocalCurrency(concept.default_amount * currentUSDRate, 'VES');
                        } else if (concept.default_amount_currency === 'USD' && !currentUSDRate) {
                            equivalentVesAmount = 'Tasa USD no disp.';
                        }
                        // Añadir lógica para EUR si es necesario
                    }
                    return (
                      <tr key={concept.id} className="hover:bg-slate-200">
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900" title={concept.description || concept.name}>{concept.name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">{concept.default_amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} {concept.default_amount_currency}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 capitalize">{concept.default_frequency}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 capitalize">{concept.category.replace('_', ' ')}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{concept.grade_level?.name || 'General'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">{(concept.iva_percentage * 100).toFixed(0)}%</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">{equivalentVesAmount}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${concept.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{concept.is_active ? 'Activo' : 'Inactivo'}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-1"> {/* Reducido space-x-1 para acomodar botón */}
                          <button onClick={() => openModalForEdit(concept)} className="text-indigo-600 hover:text-indigo-900 px-2 py-1 rounded hover:bg-indigo-50 text-xs">Editar</button>
                          <button onClick={() => toggleActiveStatus(concept)} className={`${concept.is_active ? "text-yellow-600 hover:text-yellow-900" : "text-green-600 hover:text-green-900"} px-2 py-1 rounded hover:bg-yellow-50 text-xs`}>
                            {concept.is_active ? 'Desactivar' : 'Activar'}
                          </button>
                          {/* --- NUEVO BOTÓN "APLICAR GLOBAL" --- */}
                          {concept.is_active && (
                            <button 
                                onClick={() => openApplyGlobalModal(concept)} 
                                className="text-blue-600 hover:text-blue-900 px-2 py-1 rounded hover:bg-blue-50 text-xs font-medium"
                                title={`Aplicar "${concept.name}" globalmente`}
                            >
                                Aplicar Global
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                }) : (
                  <tr><td colSpan="9" className="px-6 py-4 text-center text-sm text-gray-500">No se encontraron conceptos de cargo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Paginación */}
          {totalPages > 0 && ( /* ... (JSX de paginación sin cambios) ... */ 
            <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-700">Página <span className="font-medium">{currentPage}</span> de <span className="font-medium">{totalPages}</span> (Total: {totalItems} conceptos)</div>
                <div className="flex space-x-2">
                    <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="px-4 py-2 text-sm btn-secondary disabled:opacity-50">Anterior</button>
                    <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="px-4 py-2 text-sm btn-secondary disabled:opacity-50">Siguiente</button>
                </div>
            </div>
          )}
        </>
      )}

      {/* Modal para CRUD de Conceptos (existente) */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingConcept ? 'Editar Concepto de Cargo' : 'Añadir Nuevo Concepto de Cargo'}>
        {/* ... (JSX del formulario del modal de CRUD de conceptos sin cambios) ... */}
        <form onSubmit={handleSubmitForm} className="space-y-4">
          <div><label htmlFor="name" className="block text-sm font-medium text-gray-700">Nombre</label><input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} required className="mt-1 block w-full input-style" /></div>
          <div><label htmlFor="description" className="block text-sm font-medium text-gray-700">Descripción</label><textarea name="description" id="description" value={formData.description} onChange={handleInputChange} rows="2" className="mt-1 block w-full input-style"></textarea></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label htmlFor="default_amount" className="block text-sm font-medium text-gray-700">Monto Def.</label><input type="number" name="default_amount" id="default_amount" value={formData.default_amount} onChange={handleInputChange} required min="0" step="0.01" className="mt-1 block w-full input-style" /></div>
            <div><label htmlFor="default_amount_currency" className="block text-sm font-medium text-gray-700">Moneda</label><select name="default_amount_currency" id="default_amount_currency" value={formData.default_amount_currency} onChange={handleInputChange} className="mt-1 block w-full input-style-select">{CURRENCIES.map(curr => <option key={curr.value} value={curr.value}>{curr.label}</option>)}</select></div>
          </div>
          <div className="flex items-center"><input id="is_amount_fixed" name="is_amount_fixed" type="checkbox" checked={formData.is_amount_fixed} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"/><label htmlFor="is_amount_fixed" className="ml-2 block text-sm text-gray-900">¿Monto Fijo?</label></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label htmlFor="default_frequency" className="block text-sm font-medium text-gray-700">Frecuencia</label><select name="default_frequency" id="default_frequency" value={formData.default_frequency} onChange={handleInputChange} className="mt-1 block w-full input-style-select">{CHARGE_FREQUENCIES.map(freq => <option key={freq.value} value={freq.value}>{freq.label}</option>)}</select></div>
            <div><label htmlFor="category" className="block text-sm font-medium text-gray-700">Categoría</label><select name="category" id="category" value={formData.category} onChange={handleInputChange} className="mt-1 block w-full input-style-select">{CHARGE_CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label htmlFor="iva_percentage" className="block text-sm font-medium text-gray-700">% IVA</label><input type="number" name="iva_percentage" id="iva_percentage" value={formData.iva_percentage} onChange={handleInputChange} min="0" max="1" step="0.01" className="mt-1 block w-full input-style" /></div>
            <div><label htmlFor="applicable_grade_level_id" className="block text-sm font-medium text-gray-700">Nivel Aplicable</label><select name="applicable_grade_level_id" id="applicable_grade_level_id" value={formData.applicable_grade_level_id === null ? 'null' : formData.applicable_grade_level_id} onChange={handleInputChange} className="mt-1 block w-full input-style-select" disabled={isLoadingFiltersData}><option value="null">{isLoadingFiltersData ? "Cargando..." : "General"}</option>{gradeLevelsList.map(gl => <option key={gl.id} value={gl.id}>{gl.name}</option>)}</select></div>
          </div>
          {!editingConcept && (<div className="flex items-center"><input id="is_active" name="is_active" type="checkbox" checked={formData.is_active} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 rounded"/><label htmlFor="is_active" className="ml-2 block text-sm">Activo al crear</label></div>)}
          {formError && <p className="text-red-500 text-xs italic">{formError}</p>}
          <div className="pt-4 flex justify-end space-x-2"><button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">Cancelar</button><button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-x-2 px-7 py-2 text-sm font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:transform-none disabled:opacity-50">{isSubmitting ? 'Guardando...' : (editingConcept ? 'Actualizar' : 'Crear')}</button></div>
        </form>
      </Modal>

      {/* --- RENDERIZAR EL NUEVO MODAL DE CARGO GLOBAL --- */}
      {selectedConceptForGlobal && (
        <ApplyGlobalChargeModal
            isOpen={isGlobalChargeModalOpen}
            onClose={() => setIsGlobalChargeModalOpen(false)}
            token={token}
            chargeConcept={selectedConceptForGlobal}
            onGlobalChargeApplied={handleGlobalChargeApplied}
        />
      )}
    </div>
  );
}

export default ChargeConceptsPage;