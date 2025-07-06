import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getGradeLevels, createGradeLevel, updateGradeLevel, activateGradeLevel, deactivateGradeLevel } from '../services/apiGradeLevels';
import Modal from '../components/Modal';
import { toast } from 'react-toastify';

// --- Iconos para la UI (se eliminaron los que ya no se usan en la tabla) ---
const PlusIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>;
const SearchIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const ChevronLeftIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>;
const ChevronRightIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;

const initialFormData = { name: '', description: '', order_index: 0, is_active: true };

function GradeLevelsPage() {
    const { token } = useAuth();
    const [gradeLevels, setGradeLevels] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [limitPerPage] = useState(10);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGradeLevel, setEditingGradeLevel] = useState(null);
    const [formData, setFormData] = useState(initialFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);
    const [filterStatus, setFilterStatus] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [itemToToggle, setItemToToggle] = useState(null);
    const [isTogglingStatus, setIsTogglingStatus] = useState(false);


    const fetchGradeLevels = useCallback(async () => {
        if (!token) return;
        setIsLoading(true); setError(null);
        try {
            const skip = (currentPage - 1) * limitPerPage;
            const params = { skip, limit: limitPerPage, search: searchTerm, isActive: filterStatus === '' ? null : filterStatus === 'true' };
            const data = await getGradeLevels(token, params);
            setGradeLevels(data.items || []);
            setTotalItems(data.total || 0);
            setTotalPages(data.pages || 0);
        } catch (err) {
            setError(err.message); toast.error(`Error al cargar niveles: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, currentPage, limitPerPage, searchTerm, filterStatus]);

    useEffect(() => { fetchGradeLevels(); }, [fetchGradeLevels]);
    useEffect(() => { setCurrentPage(1); }, [searchTerm, filterStatus]);

    const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };
    const openModalForCreate = () => { setEditingGradeLevel(null); setFormData(initialFormData); setFormError(null); setIsModalOpen(true); };
    const openModalForEdit = (gl) => { setEditingGradeLevel(gl); setFormData({ name: gl.name || '', description: gl.description || '', order_index: gl.order_index || 0, is_active: gl.is_active }); setFormError(null); setIsModalOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setEditingGradeLevel(null); };

    const handleSubmitForm = async (e) => {
        e.preventDefault();
        if (!token) { toast.error("No autenticado."); return; }
        setIsSubmitting(true); setFormError(null);
        try {
            const dataToSubmit = { name: formData.name, description: formData.description || null, order_index: parseInt(formData.order_index) || 0 };
            if (editingGradeLevel) {
                await updateGradeLevel(token, editingGradeLevel.id, dataToSubmit);
                toast.success("¡Nivel actualizado!");
            } else {
                await createGradeLevel(token, { ...dataToSubmit, is_active: formData.is_active });
                toast.success("¡Nivel creado!");
            }
            closeModal();
            fetchGradeLevels();
        } catch (err) {
            setFormError(err.message); toast.error(`Error: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleOpenConfirmModal = (gradeLevel) => {
        setItemToToggle(gradeLevel);
        setIsConfirmModalOpen(true);
    };

    const handleConfirmToggleStatus = async () => {
        if (!token || !itemToToggle) return;
        setIsTogglingStatus(true);
        const action = itemToToggle.is_active ? deactivateGradeLevel : activateGradeLevel;
        const actionVerb = itemToToggle.is_active ? "desactivado" : "activado";
        try {
            await action(token, itemToToggle.id);
            toast.success(`Nivel ${actionVerb} exitosamente.`);
            fetchGradeLevels();
        } catch (err) {
            toast.error(`Error al ${actionVerb.slice(0, -1)}ar nivel: ${err.message}`);
        } finally {
            setIsTogglingStatus(false);
            setIsConfirmModalOpen(false);
            setItemToToggle(null);
        }
    };

    const handlePageChange = (newPage) => { if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage); };

    return (
        <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8">
                    <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Gestión de Niveles de Grado</h1>
                    <button onClick={openModalForCreate} className="inline-flex items-center gap-x-0 px-5 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
                        <PlusIcon /> Añadir Nivel
                    </button>
                </div>

                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-6 mb-8">
                    <h2 className="text-xl font-bold text-slate-700 mb-4">Filtros</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div><label htmlFor="searchTerm" className="label-style">Buscar por Nombre/Descripción</label><div className="relative"><span className="absolute inset-y-0 left-0 flex items-center pl-3"></span><input type="text" id="searchTerm" placeholder="Escriba para buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-style pl-10"/></div></div>
                        <div><label htmlFor="filterStatus" className="label-style">Filtrar por Estado</label><select id="filterStatus" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="select-style"><option value="">Todos</option><option value="true">Activo</option><option value="false">Inactivo</option></select></div>
                    </div>
                </div>

                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl overflow-x-auto">
                    {isLoading ? <p className="text-center py-20 text-slate-600 font-semibold text-lg">Cargando niveles...</p> : 
                     error ? <p className="text-red-600 bg-red-100 p-4 rounded-lg text-center my-10 font-medium">Error: {error}</p> : (
                        <>
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        {['Nombre', 'Descripción', 'Orden', 'Estado', 'Acciones'].map(header => 
                                            <th key={header} className={`px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider ${header === 'Acciones' ? 'text-right' : ''}`}>{header}</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {gradeLevels.length > 0 ? gradeLevels.map((gl) => (
                                        <tr key={gl.id} className="hover:bg-slate-200 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-800">{gl.name}</td>
                                            <td className="px-6 py-4 text-sm text-slate-500 max-w-sm truncate" title={gl.description}>{gl.description || <span className="text-slate-400 italic">N/A</span>}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-slate-500">{gl.order_index}</td>
                                            <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${gl.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{gl.is_active ? 'Activo' : 'Inactivo'}</span></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                                                {/* --- INICIO DE LA MODIFICACIÓN --- */}
                                                <button onClick={() => openModalForEdit(gl)} className="text-indigo-600 hover:text-indigo-800 font-semibold transition-colors duration-150">Editar</button>
                                                <button onClick={() => handleOpenConfirmModal(gl)} className={`font-semibold transition-colors duration-150 ${gl.is_active ? 'text-yellow-600 hover:text-yellow-800' : 'text-green-600 hover:text-green-800'}`}>
                                                    {gl.is_active ? 'Desactivar' : 'Activar'}
                                                </button>
                                                {/* --- FIN DE LA MODIFICACIÓN --- */}
                                            </td>
                                        </tr>
                                    )) : <tr><td colSpan="5" className="px-6 py-10 text-center text-sm text-slate-500">No se encontraron niveles de grado.</td></tr>}
                                </tbody>
                            </table>
                            {totalPages > 1 && (
                                <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between border-t border-slate-200">
                                    <div className="text-sm text-slate-700 mb-4 sm:mb-0">Página <span className="font-bold">{currentPage}</span> de <span className="font-bold">{totalPages}</span> (Total: {totalItems} niveles)</div>
                                    <div className="flex items-center space-x-2">
                                        <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1} className="inline-flex items-center justify-center h-10 w-10 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronLeftIcon/></button>
                                        <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages} className="inline-flex items-center justify-center h-10 w-10 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronRightIcon/></button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <Modal isOpen={isModalOpen} onClose={closeModal} title={editingGradeLevel ? 'Editar Nivel de Grado' : 'Añadir Nuevo Nivel'}>
                    <form onSubmit={handleSubmitForm} className="space-y-4">
                        <div><label htmlFor="name" className="label-style">Nombre del Nivel</label><input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} required className="input-style"/></div>
                        <div><label htmlFor="description" className="label-style">Descripción <span className="text-slate-400 font-normal">(Opcional)</span></label><textarea name="description" id="description" value={formData.description} onChange={handleInputChange} rows="3" className="input-style"></textarea></div>
                        <div><label htmlFor="order_index" className="label-style">Índice de Orden</label><input type="number" name="order_index" id="order_index" value={formData.order_index} onChange={handleInputChange} className="input-style"/><p className="text-xs text-slate-500 mt-1">Usado para ordenar los niveles en listas (ej: 1, 2, 3...).</p></div>
                        {formError && <p className="text-red-600 text-sm bg-red-100 p-2 rounded-lg text-center">{formError}</p>}
                        <div className="pt-4 flex justify-end space-x-3 border-t border-slate-200">
                            <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">Cancelar</button>
                            <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-x-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none disabled:cursor-wait">{isSubmitting ? 'Guardando...' : (editingGradeLevel ? 'Actualizar' : 'Crear Nivel')}</button>
                        </div>
                    </form>
                </Modal>
                
                <Modal isOpen={isConfirmModalOpen} onClose={() => setIsConfirmModalOpen(false)} title={`Confirmar ${itemToToggle?.is_active ? 'Desactivación' : 'Activación'}`}>
                    <div>
                        <p className="text-sm text-slate-600 mb-4">
                            ¿Está seguro de que desea <strong className={itemToToggle?.is_active ? 'text-red-600' : 'text-green-600'}>{itemToToggle?.is_active ? 'desactivar' : 'activar'}</strong> el nivel de grado <strong className="font-semibold text-slate-800">"{itemToToggle?.name}"</strong>?
                        </p>
                        {itemToToggle?.is_active && <p className="text-xs text-amber-700 font-bold bg-amber-100 p-2 rounded-md">¡ESTO PODRÍA TENER EFECTOS EN OTRAS PARTES DEL SISTEMA, COMO EN LOS ESTUDIANTES Y CARGOS YA ASOCIADOS!</p>}
                        <div className="mt-6 flex justify-end space-x-3">
                            <button type="button" onClick={() => setIsConfirmModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg" disabled={isTogglingStatus}>Cancelar</button>
                            <button type="button" onClick={handleConfirmToggleStatus} className={`px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-md disabled:cursor-wait ${itemToToggle?.is_active ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400' : 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'}`} disabled={isTogglingStatus}>
                                {isTogglingStatus ? 'Procesando...' : `Sí, ${itemToToggle?.is_active ? 'Desactivar' : 'Activar'}`}
                            </button>
                        </div>
                    </div>
                </Modal>

            </div>
        </div>
    );
}

export default GradeLevelsPage;