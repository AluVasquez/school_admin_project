import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createStudent } from '../services/apiStudents';
import { getGradeLevels } from '../services/apiGradeLevels';
import { getRepresentativeById } from '../services/apiRepresentatives';
import { toast } from 'react-toastify';

// --- Iconos para la UI ---
const ArrowLeftIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
const UserAddIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9h2m-1-1v2" /></svg>;

// --- Lógica del Componente (SIN CAMBIOS) ---
const initialFormData = { first_name: '', last_name: '', cedula: '', birth_date: '', sex: '', representative_id: '', grade_level_id: '', blood_type: '', allergies: '', emergency_contact_name: '', emergency_contact_phone: '', is_special_case: false, special_case_description: '', has_scholarship: false, scholarship_percentage: '', scholarship_fixed_amount: '' };

function CreateStudentPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const { representativeId: routeRepresentativeId } = useParams();

    const [formData, setFormData] = useState({ ...initialFormData, representative_id: routeRepresentativeId || '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);
    const [representativeName, setRepresentativeName] = useState('');
    const [gradeLevelsList, setGradeLevelsList] = useState([]);
    const [isLoadingDropdowns, setIsLoadingDropdowns] = useState(true);

    useEffect(() => {
        const loadInitialData = async () => {
            if (!token) return;
            setIsLoadingDropdowns(true);
            try {
                if (routeRepresentativeId) {
                    const repData = await getRepresentativeById(token, routeRepresentativeId);
                    setRepresentativeName(`${repData.first_name} ${repData.last_name} (${repData.cedula})`);
                    setFormData(prev => ({ ...prev, representative_id: routeRepresentativeId }));
                } else {
                    toast.error("No se especificó un representante.");
                    navigate("/representatives");
                    return;
                }
                const gradesData = await getGradeLevels(token, { limit: 100, isActive: true });
                setGradeLevelsList(gradesData.items || []);
            } catch (error) {
                console.error("Error cargando datos:", error);
                toast.error("Error cargando opciones para el formulario.");
            } finally {
                setIsLoadingDropdowns(false);
            }
        };
        loadInitialData();
    }, [token, routeRepresentativeId, navigate]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!token) { setFormError("Error de autenticación."); toast.error("Error de autenticación."); return; }
        if (!formData.representative_id || !formData.grade_level_id) {
            setFormError("Debe seleccionar un nivel de grado.");
            toast.error("Debe seleccionar un nivel de grado.");
            return;
        }
        setIsSubmitting(true);
        setFormError(null);
        const studentData = {
            ...formData,
            cedula: formData.cedula || null,
            birth_date: formData.birth_date || null,
            scholarship_percentage: formData.scholarship_percentage ? parseFloat(formData.scholarship_percentage) : null,
            scholarship_fixed_amount: formData.scholarship_fixed_amount ? parseFloat(formData.scholarship_fixed_amount) : null,
        };
        try {
            await createStudent(token, studentData);
            toast.success("¡Estudiante añadido exitosamente!");
            navigate(`/representatives/${routeRepresentativeId}/edit`);
        } catch (err) {
            const errorMessage = err.message || "Ocurrió un error al crear el estudiante.";
            setFormError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoadingDropdowns) {
        return <div className="p-8 text-center text-xl font-semibold text-slate-700">Preparando formulario...</div>;
    }

    // --- JSX Refactorizado ---
    return (
        <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-8">
                {/* --- HEADER --- */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Inscribir Nuevo Estudiante</h1>
                        <p className="mt-2 text-lg text-slate-600">Para el representante: <strong className="font-semibold text-indigo-600">{representativeName}</strong></p>
                    </div>
                    <Link to={routeRepresentativeId ? `/representatives/${routeRepresentativeId}/edit` : '/representatives'} className="inline-flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors self-start sm:self-center">
                        <ArrowLeftIcon /> Volver al Perfil
                    </Link>
                </div>
                
                {/* --- SECCIÓN DATOS PERSONALES --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-8">
                    <h2 className="text-2xl font-bold text-slate-700 mb-6">1. Datos Personales del Estudiante</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><label htmlFor="first_name" className="label-style">Nombres</label><input type="text" name="first_name" id="first_name" value={formData.first_name} onChange={handleInputChange} required className="input-style" /></div>
                        <div><label htmlFor="last_name" className="label-style">Apellidos</label><input type="text" name="last_name" id="last_name" value={formData.last_name} onChange={handleInputChange} required className="input-style" /></div>
                        <div><label htmlFor="cedula" className="label-style">Cédula <span className="text-slate-400 font-normal">(Opcional)</span></label><input type="text" name="cedula" id="cedula" value={formData.cedula} onChange={handleInputChange} className="input-style" /></div>
                        <div><label htmlFor="birth_date" className="label-style">Fecha de Nacimiento</label><input type="date" name="birth_date" id="birth_date" value={formData.birth_date} onChange={handleInputChange} className="input-style" /></div>
                        <div><label htmlFor="sex" className="label-style">Sexo</label><select name="sex" id="sex" value={formData.sex} onChange={handleInputChange} className="select-style"><option value="">Seleccionar...</option><option value="Masculino">Masculino</option><option value="Femenino">Femenino</option><option value="Otro">Otro</option></select></div>
                    </div>
                </div>

                {/* --- SECCIÓN ASIGNACIÓN ACADÉMICA --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-8">
                    <h2 className="text-2xl font-bold text-slate-700 mb-6">2. Asignación Académica</h2>
                    <div><label htmlFor="grade_level_id" className="label-style">Nivel de Grado a Inscribir</label><select name="grade_level_id" id="grade_level_id" value={formData.grade_level_id} onChange={handleInputChange} required className="select-style"><option value="">Seleccionar Nivel...</option>{gradeLevelsList.map(gl => <option key={gl.id} value={gl.id}>{gl.name}</option>)}</select></div>
                </div>

                {/* --- SECCIÓN INFORMACIÓN ADICIONAL --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-8">
                     <h2 className="text-2xl font-bold text-slate-700 mb-6">3. Información Adicional <span className="text-xl font-normal text-slate-400">(Opcional)</span></h2>
                     <div className="space-y-6">
                        {/* Beca */}
                        <div className="p-4 border border-slate-200 rounded-lg">
                            <div className="flex items-center"><input id="has_scholarship" name="has_scholarship" type="checkbox" checked={formData.has_scholarship} onChange={handleInputChange} className="h-5 w-5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500" /><label htmlFor="has_scholarship" className="ml-3 text-base font-medium text-slate-800">Asignar Beca</label></div>
                            {formData.has_scholarship && <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4 pt-4 border-t border-slate-200"><div><label htmlFor="scholarship_percentage" className="label-style">Porcentaje Beca (%)</label><input type="number" name="scholarship_percentage" id="scholarship_percentage" value={formData.scholarship_percentage} onChange={handleInputChange} min="0" max="100" step="0.01" placeholder="Ej: 50" className="input-style" /></div><div><label htmlFor="scholarship_fixed_amount" className="label-style">Monto Fijo Beca (VES)</label><input type="number" name="scholarship_fixed_amount" id="scholarship_fixed_amount" value={formData.scholarship_fixed_amount} onChange={handleInputChange} min="0" step="0.01" placeholder="Ej: 100.00" className="input-style" /></div></div>}
                        </div>
                        {/* Caso Especial */}
                        <div className="p-4 border border-slate-200 rounded-lg">
                            <div className="flex items-center"><input id="is_special_case" name="is_special_case" type="checkbox" checked={formData.is_special_case} onChange={handleInputChange} className="h-5 w-5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500" /><label htmlFor="is_special_case" className="ml-3 text-base font-medium text-slate-800">Marcar como Caso Especial</label></div>
                            {formData.is_special_case && <div className="mt-4 pt-4 border-t border-slate-200"><label htmlFor="special_case_description" className="label-style">Descripción del Caso Especial</label><textarea name="special_case_description" id="special_case_description" value={formData.special_case_description} onChange={handleInputChange} rows="3" className="input-style"></textarea></div>}
                        </div>
                        {/* Contacto de Emergencia */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label htmlFor="emergency_contact_name" className="label-style">Contacto de Emergencia (Nombre)</label><input type="text" name="emergency_contact_name" id="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleInputChange} className="input-style" /></div>
                            <div><label htmlFor="emergency_contact_phone" className="label-style">Contacto de Emergencia (Teléfono)</label><input type="tel" name="emergency_contact_phone" id="emergency_contact_phone" value={formData.emergency_contact_phone} onChange={handleInputChange} className="input-style" /></div>
                            <div><label htmlFor="blood_type" className="label-style">Tipo de Sangre</label><input type="text" name="blood_type" id="blood_type" value={formData.blood_type} onChange={handleInputChange} className="input-style" /></div>
                            <div><label htmlFor="allergies" className="label-style">Alergias</label><input type="text" name="allergies" id="allergies" value={formData.allergies} onChange={handleInputChange} className="input-style" /></div>
                        </div>
                     </div>
                </div>

                {/* --- BARRA DE ACCIONES FIJA INFERIOR --- */}
                <div className="p-4 bg-white/80 backdrop-blur-sm border-t border-slate-200 sticky bottom-0 flex justify-end items-center space-x-4">
                    {formError && <p className="text-red-600 text-sm font-semibold mr-auto">{formError}</p>}
                    <Link to={routeRepresentativeId ? `/representatives/${routeRepresentativeId}/edit` : '/students'} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">
                        Cancelar
                    </Link>
                    <button type="submit" disabled={isSubmitting || isLoadingDropdowns} className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:bg-blue-400 disabled:cursor-not-allowed">
                        <UserAddIcon />
                        {isSubmitting ? 'Guardando Estudiante...' : 'Guardar Estudiante'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default CreateStudentPage;