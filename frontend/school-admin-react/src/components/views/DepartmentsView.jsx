// src/components/views/DepartmentsView.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from '../../services/apiPersonnel';
import Modal from '../Modal';
import { toast } from 'react-toastify';
import { BriefcaseIcon, PlusIcon, MagnifyingGlassIcon, PencilSquareIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import { FormInput, FormTextarea } from '../FormControls';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
    return () => { clearTimeout(handler); };
  }, [value, delay]);
  return debouncedValue;
}

const initialFormData = { name: '', description: '' };

const TableSkeleton = ({ rows = 5 }) => (
    [...Array(rows)].map((_, i) => (
        <tr key={i} className="animate-pulse">
            <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-3/4"></div></td>
            <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-full"></div></td>
            <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-1/2 ml-auto"></div></td>
        </tr>
    ))
);

const EmptyState = ({ onActionClick }) => (
    <tr>
        <td colSpan="3" className="text-center py-12">
            <BriefcaseIcon className="mx-auto h-12 w-12 text-slate-400" />
            <h3 className="mt-2 text-sm font-semibold text-slate-900">No se encontraron departamentos</h3>
            <p className="mt-1 text-sm text-slate-500">Comienza por añadir un nuevo departamento.</p>
            <div className="mt-6">
                <button type="button" onClick={onActionClick} className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
                    <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" />
                    Añadir Departamento
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

function DepartmentsView() {
  const { token } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [limitPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const fetchDepartments = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const skip = (currentPage - 1) * limitPerPage;
      const params = { skip, limit: limitPerPage, search: debouncedSearchTerm || null };
      const data = await getDepartments(token, params);
      setDepartments(data.items || []);
      setTotalPages(data.pages || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [token, currentPage, limitPerPage, debouncedSearchTerm]);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);
  useEffect(() => { setCurrentPage(1); }, [debouncedSearchTerm]);

  const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  
  const openModalForCreate = () => {
    setEditingDepartment(null);
    setFormData(initialFormData);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openModalForEdit = (department) => {
    setEditingDepartment(department);
    setFormData({ name: department.name, description: department.description || '' });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
        setFormError("El nombre del departamento es obligatorio.");
        return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      if (editingDepartment) {
        await updateDepartment(token, editingDepartment.id, formData);
        toast.success("Departamento actualizado!");
      } else {
        await createDepartment(token, formData);
        toast.success("Departamento creado!");
      }
      closeModal();
      fetchDepartments();
    } catch (err) {
      const errorMessage = err.message || "Ocurrió un error.";
      setFormError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (departmentId, departmentName) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar "${departmentName}"?`)) return;
    try {
      await deleteDepartment(token, departmentId);
      toast.success(`Departamento "${departmentName}" eliminado.`);
      (departments.length === 1 && currentPage > 1) ? setCurrentPage(p => p - 1) : fetchDepartments();
    } catch (err) {
      toast.error(`Error al eliminar: ${err.message}`);
    }
  };
  
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && !isLoading) setCurrentPage(newPage);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 pb-4 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800">Departamentos</h2>
          <div className="relative w-full sm:w-72">
            <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2"/>
            <input type="text" placeholder="Buscar por nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border border-slate-300 rounded-md w-full"/>
          </div>
          <button onClick={openModalForCreate} className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
            <PlusIcon className="w-5 h-5" /> <span>Añadir Departamento</span>
          </button>
        </div>

        {error && <div className="text-red-600 bg-red-50 p-4 rounded-lg text-center mb-4"><ExclamationTriangleIcon className="w-6 h-6 inline-block mr-2"/>Error al cargar datos: {error}</div>}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Descripción</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {isLoading ? <TableSkeleton /> : departments.length > 0 ? departments.map((dept) => (
                <tr key={dept.id} className="hover:bg-slate-200">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{dept.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 max-w-md truncate" title={dept.description}>{dept.description || <span className="text-slate-400">N/A</span>}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                    <button onClick={() => openModalForEdit(dept)} className="text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"><PencilSquareIcon className="w-4 h-4"/> Editar</button>
                    <button onClick={() => handleDelete(dept.id, dept.name)} className="text-red-600 hover:text-red-800 inline-flex items-center gap-1"><TrashIcon className="w-4 h-4"/> Eliminar</button>
                  </td>
                </tr>
              )) : <EmptyState onActionClick={openModalForCreate} />}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} isLoading={isLoading} />
      
        <Modal isOpen={isModalOpen} onClose={closeModal} title={editingDepartment ? 'Editar Departamento' : 'Añadir Nuevo Departamento'}>
                <form onSubmit={handleSubmitForm} className="space-y-4">
                    <FormInput
                        label="Nombre del Departamento*"
                        id="name_dept"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        required
                        placeholder="Ej: Administración"
                    />
                    <FormTextarea
                        label="Descripción (Opcional)"
                        id="desc_dept"
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        rows="3"
                        placeholder="Define el propósito del departamento"
                    />

                    {formError && <p className="text-red-500 text-xs italic text-center pt-2">{formError}</p>}
                    
                    <div className="pt-5 flex justify-end space-x-3 border-t border-slate-200 mt-6">
                        <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">Cancelar</button>
                        <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-x-2 px-6 text-sm py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
                            {isSubmitting && <ArrowPathIcon className="animate-spin -ml-1 mr-3 h-5 w-5" />}
                            {isSubmitting ? 'Guardando...' : (editingDepartment ? 'Actualizar' : 'Crear')}
                        </button>
                    </div>
                </form>
        </Modal>
    </div>
  );
}

export default DepartmentsView;