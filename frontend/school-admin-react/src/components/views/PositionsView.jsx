// src/components/views/PositionsView.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getPositions, createPosition, updatePosition, deletePosition, getDepartments } from '../../services/apiPersonnel';
import Modal from '../Modal';
import { toast } from 'react-toastify';
import { IdentificationIcon, PlusIcon, MagnifyingGlassIcon, PencilSquareIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import { FormInput, FormTextarea, FormSelect } from '../FormControls';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
    return () => { clearTimeout(handler); };
  }, [value, delay]);
  return debouncedValue;
}

const initialFormData = { name: '', description: '', department_id: '' };

const TableSkeleton = ({ rows = 5 }) => (
    [...Array(rows)].map((_, i) => (
        <tr key={i} className="animate-pulse">
            <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-3/4"></div></td>
            <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-1/2"></div></td>
            <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-full"></div></td>
            <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-1/2 ml-auto"></div></td>
        </tr>
    ))
);

const EmptyState = ({ onActionClick }) => (
    <tr>
        <td colSpan="4" className="text-center py-12">
            <IdentificationIcon className="mx-auto h-12 w-12 text-slate-400" />
            <h3 className="mt-2 text-sm font-semibold text-slate-900">No se encontraron cargos</h3>
            <p className="mt-1 text-sm text-slate-500">Prueba a cambiar los filtros o añade un nuevo cargo.</p>
            <div className="mt-6">
                <button type="button" onClick={onActionClick} className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
                    <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" /> Añadir Cargo
                </button>
            </div>
        </td>
    </tr>
);

const Pagination = ({ currentPage, totalPages, onPageChange, isLoading }) => {
    if (totalPages <= 1) return null;
    return (
        <nav className="flex items-center justify-between border-t border-slate-200 px-4 sm:px-0 mt-6 pt-4">
            <div className="flex w-0 flex-1">
                <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="inline-flex items-center border-t-2 border-transparent pr-1 pt-4 text-sm font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700 disabled:text-slate-300">
                    <ChevronLeftIcon className="mr-3 h-5 w-5" /> Anterior
                </button>
            </div>
            <div className="hidden md:flex"><span className="text-sm text-slate-500">Página {currentPage} de {totalPages}</span></div>
            <div className="flex w-0 flex-1 justify-end">
                <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="inline-flex items-center border-t-2 border-transparent pl-1 pt-4 text-sm font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700 disabled:text-slate-300">
                    Siguiente <ChevronRightIcon className="ml-3 h-5 w-5" />
                </button>
            </div>
        </nav>
    );
};

function PositionsView() {
  const { token } = useAuth();
  const [positions, setPositions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [limitPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const fetchDepartmentsForSelect = useCallback(async () => {
    if (!token) return;
    setIsLoadingDepartments(true);
    try {
      const data = await getDepartments(token, { limit: 200 }); // Fetch all for dropdown
      setDepartments(data.items || []);
    } catch (err) { toast.error(`Error al cargar departamentos: ${err.message}`); }
    finally { setIsLoadingDepartments(false); }
  }, [token]);

  const fetchPositions = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const skip = (currentPage - 1) * limitPerPage;
      const params = { skip, limit: limitPerPage, search: debouncedSearchTerm || null, departmentId: filterDepartmentId || null };
      const data = await getPositions(token, params);
      setPositions(data.items || []);
      setTotalPages(data.pages || 0);
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  }, [token, currentPage, limitPerPage, debouncedSearchTerm, filterDepartmentId]);

  useEffect(() => { fetchDepartmentsForSelect(); }, [fetchDepartmentsForSelect]);
  useEffect(() => { fetchPositions(); }, [fetchPositions]);
  useEffect(() => { setCurrentPage(1); }, [debouncedSearchTerm, filterDepartmentId]);

  const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const openModalForCreate = () => {
    setEditingPosition(null);
    setFormData({ ...initialFormData, department_id: departments.length > 0 ? departments[0].id.toString() : '' });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openModalForEdit = (position) => {
    setEditingPosition(position);
    setFormData({ name: position.name, description: position.description || '', department_id: position.department_id?.toString() || '' });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.department_id) {
        setFormError("Nombre y departamento son obligatorios.");
        return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      const dataToSubmit = { ...formData, department_id: parseInt(formData.department_id) };
      if (editingPosition) {
        await updatePosition(token, editingPosition.id, dataToSubmit);
        toast.success("Cargo actualizado!");
      } else {
        await createPosition(token, dataToSubmit);
        toast.success("Cargo creado!");
      }
      closeModal();
      fetchPositions();
    } catch (err) {
      const errorMessage = err.message || "Ocurrió un error.";
      setFormError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (positionId, positionName) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar "${positionName}"?`)) return;
    try {
      await deletePosition(token, positionId);
      toast.success(`Cargo "${positionName}" eliminado.`);
      (positions.length === 1 && currentPage > 1) ? setCurrentPage(p => p - 1) : fetchPositions();
    } catch (err) {
      toast.error(`Error al eliminar: ${err.message}`);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && !isLoading) setCurrentPage(newPage);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
          <h2 className="text-xl font-semibold text-slate-800">Cargos</h2>
           <button onClick={openModalForCreate} className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
            <PlusIcon className="w-5 h-5" /><span>Añadir Cargo</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 pb-4 border-b border-slate-200">
            <div className="relative">
                <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2"/>
                <input type="text" placeholder="Buscar por nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border border-slate-300 rounded-md w-full" />
            </div>
            <div className="relative">
                <select value={filterDepartmentId} onChange={(e) => setFilterDepartmentId(e.target.value)} className="w-full pl-3 pr-10 py-2 border border-slate-300 rounded-md" disabled={isLoadingDepartments}>
                    <option value="">{isLoadingDepartments ? "Cargando..." : "Todos los Departamentos"}</option>
                    {departments.map(dept => <option key={dept.id} value={dept.id.toString()}>{dept.name}</option>)}
                </select>
            </div>
        </div>

        {error && <div className="text-red-600 bg-red-50 p-4 rounded-lg text-center mb-4"><ExclamationTriangleIcon className="w-6 h-6 inline-block mr-2"/>Error al cargar datos: {error}</div>}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Nombre del Cargo</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Departamento</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Descripción</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {isLoading ? <TableSkeleton /> : positions.length > 0 ? positions.map((pos) => (
                <tr key={pos.id} className="hover:bg-slate-200">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{pos.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{pos.department?.name || <span className="text-slate-400 italic">N/A</span>}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 max-w-md truncate" title={pos.description}>{pos.description || <span className="text-slate-400">N/A</span>}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                    <button onClick={() => openModalForEdit(pos)} className="text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"><PencilSquareIcon className="w-4 h-4"/> Editar</button>
                    <button onClick={() => handleDelete(pos.id, pos.name)} className="text-red-600 hover:text-red-800 inline-flex items-center gap-1"><TrashIcon className="w-4 h-4"/> Eliminar</button>
                  </td>
                </tr>
              )) : <EmptyState onActionClick={openModalForCreate} />}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} isLoading={isLoading} />
      
        <Modal isOpen={isModalOpen} onClose={closeModal} title={editingPosition ? 'Editar Cargo' : 'Añadir Nuevo Cargo'}>
                <form onSubmit={handleSubmitForm} className="space-y-4">
                    <FormInput
                        label="Nombre del Cargo*"
                        id="name_pos"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        required
                        placeholder="Ej: Asistente Administrativo"
                    />
                    <FormSelect
                        label="Departamento*"
                        id="dept_id_pos"
                        name="department_id"
                        value={formData.department_id}
                        onChange={handleInputChange}
                        required
                        disabled={isLoadingDepartments}
                    >
                        <option value="" disabled>{isLoadingDepartments ? "Cargando..." : "Seleccione un Departamento"}</option>
                        {departments.map(dept => <option key={dept.id} value={dept.id.toString()}>{dept.name}</option>)}
                    </FormSelect>
                    <FormTextarea
                        label="Descripción (Opcional)"
                        id="desc_pos"
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        rows="3"
                        placeholder="Resume las responsabilidades del cargo"
                    />

                    {formError && <p className="text-red-500 text-xs italic text-center pt-2">{formError}</p>}
                    
                    <div className="pt-5 flex justify-end space-x-3 border-t border-slate-200 mt-6">
                        <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">Cancelar</button>
                        <button type="submit" disabled={isSubmitting || isLoadingDepartments} className="inline-flex items-center gap-x-2 px-3 py-2 text-sm font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
                            {isSubmitting && <ArrowPathIcon className="animate-spin -ml-1 mr-3 h-5 w-5" />}
                            {isSubmitting ? 'Guardando...' : (editingPosition ? 'Actualizar' : 'Crear Cargo')}
                        </button>
                    </div>
                </form>
        </Modal>
    </div>
  );
}

export default PositionsView;