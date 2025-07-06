import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getRepresentativeById, updateRepresentative } from '../services/apiRepresentatives';
import { getStudents } from '../services/apiStudents';
import { toast } from 'react-toastify';

// --- Iconos para la UI ---
const ArrowLeftIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
);
const DocumentReportIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
);
const SaveIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
);
const UserAddIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
);

// --- Lógica y estado del componente (Sin cambios) ---
const initialFormState = { first_name: '', last_name: '', identification_type: 'V', identification_number: '', phone_main: '', phone_secondary: '', email: '', address: '', sex: '', profession: '', workplace: '' };

function EditRepresentativePage() {
    const { representativeId } = useParams();
    const { token } = useAuth();
    const navigate = useNavigate();

    const [formData, setFormData] = useState(initialFormState);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [studentsOfRep, setStudentsOfRep] = useState([]);
    const [isLoadingStudents, setIsLoadingStudents] = useState(true);

    const fetchRepresentativeData = useCallback(async () => {
        if (!token || !representativeId) return;
        setIsLoading(true); setError(null);
        try {
            const data = await getRepresentativeById(token, representativeId);
            let idType = 'V', idNumber = '';
            if (data.cedula && data.cedula.length > 0) {
                const type = data.cedula.charAt(0).toUpperCase();
                if (['V', 'E', 'P', 'J', 'G'].includes(type)) {
                    idType = type;
                    idNumber = data.cedula.substring(1);
                } else {
                    idType = 'V';
                    idNumber = data.cedula;
                }
            }
            setFormData({
                first_name: data.first_name || '', last_name: data.last_name || '',
                identification_type: idType, identification_number: idNumber,
                phone_main: data.phone_main || '', phone_secondary: data.phone_secondary || '',
                email: data.email || '', address: data.address || '', sex: data.sex || '',
                profession: data.profession || '', workplace: data.workplace || '',
            });
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar datos: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, representativeId]);

    const fetchStudentsForRep = useCallback(async () => {
        if (!token || !representativeId) return;
        setIsLoadingStudents(true);
        try {
            const studentData = await getStudents(token, { representativeId: parseInt(representativeId), limit: 100 });
            setStudentsOfRep(studentData.items || []);
        } catch (err) {
            console.error("Error cargando estudiantes:", err);
            toast.error("Error al cargar estudiantes asociados.");
        } finally {
            setIsLoadingStudents(false);
        }
    }, [token, representativeId]);

    useEffect(() => {
        fetchRepresentativeData();
        fetchStudentsForRep();
    }, [fetchRepresentativeData, fetchStudentsForRep]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!token) { setError("Error de autenticación."); toast.error("Error de autenticación."); return; }
        setIsSubmitting(true); setError(null);
        try {
            const dataToUpdate = {
                first_name: formData.first_name, last_name: formData.last_name,
                identification_type: formData.identification_type, identification_number: formData.identification_number,
                phone_main: formData.phone_main, phone_secondary: formData.phone_secondary || null,
                email: formData.email, address: formData.address || null, sex: formData.sex || null,
                profession: formData.profession || null, workplace: formData.workplace || null,
            };
            await updateRepresentative(token, representativeId, dataToUpdate);
            toast.success("¡Datos actualizados exitosamente!");
        } catch (err) {
            const errorMessage = err.message || "Ocurrió un error al actualizar.";
            setError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Renderizados condicionales mejorados ---
    if (isLoading && representativeId) {
        return <div className="p-8 text-center text-xl font-semibold text-slate-700">Cargando perfil del representante...</div>;
    }
    if (error && !isSubmitting && !isLoading) {
        return (
            <div className="bg-slate-50 min-h-screen p-8 flex flex-col items-center justify-center">
                <div className="bg-white p-8 rounded-xl shadow-xl text-center">
                    <h1 className="text-2xl font-bold text-red-600 mb-4">Error al Cargar</h1>
                    <p className="text-slate-600 mb-6">{error}</p>
                    <Link to="/representatives" className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md transition-colors">
                        <ArrowLeftIcon /> Volver a la lista
                    </Link>
                </div>
            </div>
        );
    }
    if (!representativeId && !isLoading) {
        return <div className="p-8 text-center text-xl font-semibold text-red-600">Error: No se ha especificado un ID de representante.</div>;
    }

    // --- JSX Refactorizado ---
    return (
        <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* --- TARJETA DE PERFIL DEL REPRESENTANTE --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 gap-4">
                        <h1 className="text-3xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">
                            Perfil del Representante
                        </h1>
                        <div className="flex items-center space-x-3 self-start sm:self-center">
                            <Link to={`/representatives/${representativeId}/statement`} className="inline-flex items-center px-3 py-2 text-xs sm:text-sm font-semibold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-lg shadow-sm transition-colors">
                                <DocumentReportIcon /> Ver Estado de Cuenta
                            </Link>
                            <Link to="/representatives" className="inline-flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                                <ArrowLeftIcon /> Volver
                            </Link>
                        </div>
                    </div>

                    {error && isSubmitting && <p className="text-red-600 bg-red-100 p-3 rounded-lg mb-6 text-sm font-medium">{error}</p>}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label htmlFor="first_name" className="label-style">Nombres</label><input type="text" name="first_name" id="first_name" value={formData.first_name} onChange={handleInputChange} required className="input-style" /></div>
                            <div><label htmlFor="last_name" className="label-style">Apellidos</label><input type="text" name="last_name" id="last_name" value={formData.last_name} onChange={handleInputChange} required className="input-style" /></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                            <div><label htmlFor="identification_type" className="label-style">Tipo Ident.</label><select name="identification_type" id="identification_type" value={formData.identification_type} onChange={handleInputChange} className="select-style"><option value="V">V</option><option value="E">E</option><option value="P">P</option><option value="J">J</option><option value="G">G</option></select></div>
                            <div className="md:col-span-2"><label htmlFor="identification_number" className="label-style">Número Cédula/ID</label><input type="text" name="identification_number" id="identification_number" value={formData.identification_number} onChange={handleInputChange} required className="input-style" /></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label htmlFor="email" className="label-style">Correo Electrónico</label><input type="email" name="email" id="email" value={formData.email} onChange={handleInputChange} required className="input-style" /></div>
                            <div><label htmlFor="phone_main" className="label-style">Teléfono Principal</label><input type="tel" name="phone_main" id="phone_main" value={formData.phone_main} onChange={handleInputChange} required className="input-style" /></div>
                        </div>
                        <div><label htmlFor="phone_secondary" className="label-style">Teléfono Secundario <span className="text-slate-400 font-normal">(Opcional)</span></label><input type="tel" name="phone_secondary" id="phone_secondary" value={formData.phone_secondary} onChange={handleInputChange} className="input-style" /></div>
                        <div><label htmlFor="address" className="label-style">Dirección <span className="text-slate-400 font-normal">(Opcional)</span></label><textarea name="address" id="address" value={formData.address} onChange={handleInputChange} rows="3" className="input-style"></textarea></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div><label htmlFor="sex" className="label-style">Sexo <span className="text-slate-400 font-normal">(Opcional)</span></label><select name="sex" id="sex" value={formData.sex} onChange={handleInputChange} className="select-style"><option value="">No especificar</option><option value="Masculino">Masculino</option><option value="Femenino">Femenino</option><option value="Otro">Otro</option></select></div>
                            <div><label htmlFor="profession" className="label-style">Profesión <span className="text-slate-400 font-normal">(Opcional)</span></label><input type="text" name="profession" id="profession" value={formData.profession} onChange={handleInputChange} className="input-style" /></div>
                            <div><label htmlFor="workplace" className="label-style">Lugar de Trabajo <span className="text-slate-400 font-normal">(Opcional)</span></label><input type="text" name="workplace" id="workplace" value={formData.workplace} onChange={handleInputChange} className="input-style" /></div>
                        </div>
                        <div className="pt-4 flex justify-end space-x-3 border-t border-slate-200">
                            <Link to="/representatives" className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">Cancelar</Link>
                            <button type="submit" disabled={isSubmitting || isLoading} className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none">
                                <SaveIcon />
                                {isSubmitting ? 'Actualizando...' : 'Actualizar Datos'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* --- TARJETA DE ESTUDIANTES INSCRITOS --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                        <h2 className="text-2xl font-bold text-slate-700">Estudiantes Representados</h2>
                        <Link to={`/representatives/${representativeId}/students/new`} className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all disabled:bg-emerald-300 disabled:cursor-not-allowed">
                            <UserAddIcon /> Añadir Estudiante
                        </Link>
                    </div>
                    {isLoadingStudents ? (
                        <p className="text-sm text-center py-4 text-slate-500">Cargando estudiantes...</p>
                    ) : studentsOfRep.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        {['Nombre Estudiante', 'Cédula/ID', 'Nivel', 'Estado', 'Acciones'].map(header => 
                                            <th key={header} className={`px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider ${header === 'Acciones' ? 'text-right' : ''}`}>{header}</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {studentsOfRep.map(student => (
                                        <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-800">{student.first_name} {student.last_name}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">{student.cedula || 'N/A'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">{student.grade_level_assigned?.name || 'N/A'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm"><span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${student.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{student.is_active ? 'Activo' : 'Inactivo'}</span></td>
                                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                                <Link to={`/students/${student.id}/edit`} className="text-indigo-600 hover:text-indigo-900 font-semibold">Ver/Editar</Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-sm text-center py-4 text-slate-500">Este representante no tiene estudiantes asociados actualmente.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default EditRepresentativePage;