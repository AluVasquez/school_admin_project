import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getStudentById, updateStudent, activateStudent, deactivateStudent } from '../services/apiStudents';
import { getGradeLevels } from '../services/apiGradeLevels';
import { toast } from 'react-toastify';
import ChangeRepresentativeModal from '../components/ChangeRepresentativeModal';
import Modal from '../components/Modal'; // Asegúrate que el Modal genérico esté importado

// --- Iconos para la UI ---
const ArrowLeftIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
const UsersIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197M3 10a4 4 0 110-5.292A4 4 0 013 10z" /></svg>;
const PowerIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" /></svg>;
const SaveIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>;

const initialFormData = { first_name: '', last_name: '', cedula: '', birth_date: '', sex: '', representative_id: '', grade_level_id: '', blood_type: '', allergies: '', emergency_contact_name: '', emergency_contact_phone: '', is_special_case: false, special_case_description: '', has_scholarship: false, scholarship_percentage: '', scholarship_fixed_amount: '', is_active: true };

function EditStudentPage() {
    const { studentId } = useParams();
    const { token } = useAuth();
    const navigate = useNavigate();

    const [formData, setFormData] = useState(initialFormData);
    const [currentRepresentativeDisplay, setCurrentRepresentativeDisplay] = useState('');
    const [calculatedAge, setCalculatedAge] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isTogglingStatus, setIsTogglingStatus] = useState(false);
    const [error, setError] = useState(null);
    const [gradeLevelsList, setGradeLevelsList] = useState([]);
    const [showChangeRepModal, setShowChangeRepModal] = useState(false);
    const [isConfirmStatusModalOpen, setIsConfirmStatusModalOpen] = useState(false);

    const calculateAge = (birthDateString) => {
        if (!birthDateString) return null;
        const birthDateObj = new Date(birthDateString);
        const today = new Date();
        let age = today.getFullYear() - birthDateObj.getFullYear();
        const m = today.getMonth() - birthDateObj.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDateObj.getDate())) age--;
        return age >= 0 ? age : null;
    };

    const loadInitialData = useCallback(async () => {
        if (!token || !studentId) return;
        setIsLoading(true); setError(null);
        try {
            const studentData = await getStudentById(token, studentId);
            const formattedBirthDate = studentData.birth_date ? studentData.birth_date.split('T')[0] : '';
            setFormData({
                first_name: studentData.first_name || '', last_name: studentData.last_name || '', cedula: studentData.cedula || '',
                birth_date: formattedBirthDate, sex: studentData.sex || '',
                representative_id: studentData.representative?.id?.toString() || '',
                grade_level_id: studentData.grade_level_assigned?.id?.toString() || '',
                blood_type: studentData.blood_type || '', allergies: studentData.allergies || '',
                emergency_contact_name: studentData.emergency_contact_name || '', emergency_contact_phone: studentData.emergency_contact_phone || '',
                is_special_case: studentData.is_special_case || false, special_case_description: studentData.special_case_description || '',
                has_scholarship: studentData.has_scholarship || false, scholarship_percentage: studentData.scholarship_percentage?.toString() || '',
                scholarship_fixed_amount: studentData.scholarship_fixed_amount?.toString() || '',
                is_active: studentData.is_active === undefined ? true : studentData.is_active,
            });
            if (studentData.representative) setCurrentRepresentativeDisplay(`${studentData.representative.first_name} ${studentData.representative.last_name} (${studentData.representative.cedula})`);
            else setCurrentRepresentativeDisplay('No asignado');
            if (studentData.age !== null && studentData.age !== undefined) setCalculatedAge(studentData.age);
            else setCalculatedAge(calculateAge(formattedBirthDate));
            const gradesData = await getGradeLevels(token, { limit: 100, isActive: true });
            setGradeLevelsList(gradesData.items || []);
        } catch (err) {
            setError(err.message); toast.error(`Error al cargar datos: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, studentId]);

    useEffect(() => { loadInitialData(); }, [loadInitialData]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        if (name === 'birth_date') setCalculatedAge(calculateAge(value));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!token) { toast.error("Error de autenticación."); return; }
        if (!formData.grade_level_id) { toast.error("Debe seleccionar un nivel de grado."); return; }
        if (!formData.representative_id) { toast.error("El estudiante debe tener un representante asignado."); return; }
        setIsSubmitting(true); setError(null);
        const studentDataToUpdate = {
            first_name: formData.first_name, last_name: formData.last_name, cedula: formData.cedula || null,
            birth_date: formData.birth_date || null, sex: formData.sex || null,
            representative_id: parseInt(formData.representative_id), grade_level_id: parseInt(formData.grade_level_id),
            blood_type: formData.blood_type || null, allergies: formData.allergies || null,
            emergency_contact_name: formData.emergency_contact_name || null, emergency_contact_phone: formData.emergency_contact_phone || null,
            is_special_case: formData.is_special_case, special_case_description: formData.is_special_case ? (formData.special_case_description || null) : null,
            has_scholarship: formData.has_scholarship,
            scholarship_percentage: formData.has_scholarship && formData.scholarship_percentage !== '' ? parseFloat(formData.scholarship_percentage) : null,
            scholarship_fixed_amount: formData.has_scholarship && formData.scholarship_fixed_amount !== '' ? parseFloat(formData.scholarship_fixed_amount) : null,
        };
        try {
            await updateStudent(token, studentId, studentDataToUpdate);
            toast.success("¡Estudiante actualizado exitosamente!");
            loadInitialData();
        } catch (err) {
            setError(err.message); toast.error(`Error al actualizar: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleStudentStatus = async () => {
        if (!token) { toast.error("Error de autenticación."); return; }
        setIsTogglingStatus(true);
        try {
            const updatedStudent = formData.is_active ? await deactivateStudent(token, studentId) : await activateStudent(token, studentId);
            toast.success(`Estudiante ${formData.is_active ? 'desactivado' : 'activado'}.`);
            setFormData(prev => ({ ...prev, is_active: updatedStudent.is_active }));
        } catch (err) {
            toast.error(`Error al cambiar estado: ${err.message}`);
        } finally {
            setIsTogglingStatus(false);
        }
    };
    
    const handleOpenConfirmStatusModal = () => {
        setIsConfirmStatusModalOpen(true);
    };

    const handleConfirmToggleStatus = () => {
        setIsConfirmStatusModalOpen(false);
        toggleStudentStatus();
    };

    const handleOpenChangeRepModal = () => setShowChangeRepModal(true);
    const handleCloseChangeRepModal = () => setShowChangeRepModal(false);
    const handleSelectNewRepresentative = (newRepId, newRepName) => {
        setFormData(prev => ({ ...prev, representative_id: newRepId.toString() }));
        setCurrentRepresentativeDisplay(newRepName);
        setShowChangeRepModal(false);
        toast.info(`Nuevo representante seleccionado. Recuerde guardar los cambios.`);
    };

    if (isLoading) return <div className="p-8 text-center text-xl font-semibold text-slate-700">Cargando perfil del estudiante...</div>;
    if (error && !isSubmitting) return <div className="p-8 text-center text-xl font-semibold text-red-600">Error al cargar: {error}</div>;

    return (
        <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
            <form onSubmit={handleSubmit} className="max-w-5xl mx-auto space-y-8">
                {/* --- HEADER --- */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-start mb-6 gap-4">
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">{formData.first_name} {formData.last_name}</h1>
                        <span className={`px-3 py-1 inline-flex text-sm leading-5 font-bold rounded-full ${formData.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{formData.is_active ? 'Activo' : 'Inactivo'}</span>
                    </div>
                    <Link to="/students" className="inline-flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors self-start sm:self-center">
                        <ArrowLeftIcon /> Volver a la lista
                    </Link>
                </div>

                {/* --- SECCIONES Y FORMULARIO ... (sin cambios) --- */}
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-8">
                    <h2 className="text-2xl font-bold text-slate-700 mb-6">Datos Personales</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><label htmlFor="first_name" className="label-style">Nombres</label><input type="text" name="first_name" id="first_name" value={formData.first_name} onChange={handleInputChange} required className="input-style" /></div>
                        <div><label htmlFor="last_name" className="label-style">Apellidos</label><input type="text" name="last_name" id="last_name" value={formData.last_name} onChange={handleInputChange} required className="input-style" /></div>
                        <div><label htmlFor="cedula" className="label-style">Cédula <span className="text-slate-400 font-normal">(Opcional)</span></label><input type="text" name="cedula" id="cedula" value={formData.cedula} onChange={handleInputChange} className="input-style" /></div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 md:col-span-2">
                            <div className="col-span-2 sm:col-span-1"><label htmlFor="birth_date" className="label-style">Fecha de Nacimiento</label><input type="date" name="birth_date" id="birth_date" value={formData.birth_date} onChange={handleInputChange} className="input-style" /></div>
                            <div><label htmlFor="age" className="label-style">Edad</label><input type="text" name="age" id="age" value={calculatedAge !== null ? `${calculatedAge} años` : 'N/A'} readOnly className="input-style bg-slate-100 cursor-not-allowed" /></div>
                            <div><label htmlFor="sex" className="label-style">Sexo</label><select name="sex" id="sex" value={formData.sex} onChange={handleInputChange} className="select-style"><option value="">Seleccionar...</option><option value="Masculino">Masculino</option><option value="Femenino">Femenino</option><option value="Otro">Otro</option></select></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-8">
                    <h2 className="text-2xl font-bold text-slate-700 mb-6">Asignación Académica</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><label htmlFor="grade_level_id" className="label-style">Nivel de Grado</label><select name="grade_level_id" id="grade_level_id" value={formData.grade_level_id} onChange={handleInputChange} required className="select-style"><option value="">Seleccionar Nivel...</option>{gradeLevelsList.map(gl => <option key={gl.id} value={gl.id}>{gl.name}</option>)}</select></div>
                        <div><label className="label-style">Representante Asignado</label><div className="flex items-center gap-3"><p className="flex-grow p-2.5 border border-slate-200 rounded-lg bg-slate-50 text-sm text-slate-700">{currentRepresentativeDisplay}</p><button type="button" onClick={handleOpenChangeRepModal} className="inline-flex items-center justify-center p-2 text-sm font-semibold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-lg shadow-sm transition-colors" title="Cambiar representante"><UsersIcon className="h-5 w-5"/></button></div></div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-8">
                        <h2 className="text-2xl font-bold text-slate-700 mb-6">Beca</h2>
                        <div className="flex items-center"><input id="has_scholarship" name="has_scholarship" type="checkbox" checked={formData.has_scholarship} onChange={handleInputChange} className="h-5 w-5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"/><label htmlFor="has_scholarship" className="ml-3 text-base font-medium text-slate-800">Este estudiante tiene una beca</label></div>
                        {formData.has_scholarship && <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4"><hr className="col-span-full" /><div><label htmlFor="scholarship_percentage" className="label-style">Porcentaje Beca (%)</label><input type="number" name="scholarship_percentage" id="scholarship_percentage" value={formData.scholarship_percentage} onChange={handleInputChange} min="0" max="100" step="0.01" placeholder="0 - 100" className="input-style" /></div><div><label htmlFor="scholarship_fixed_amount" className="label-style">Monto Fijo Beca (VES)</label><input type="number" name="scholarship_fixed_amount" id="scholarship_fixed_amount" value={formData.scholarship_fixed_amount} onChange={handleInputChange} min="0" step="0.01" placeholder="Ej: 50.00" className="input-style" /></div></div>}
                    </div>
                    <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-8">
                        <h2 className="text-2xl font-bold text-slate-700 mb-6">Caso Especial</h2>
                        <div className="flex items-center"><input id="is_special_case" name="is_special_case" type="checkbox" checked={formData.is_special_case} onChange={handleInputChange} className="h-5 w-5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500" /><label htmlFor="is_special_case" className="ml-3 text-base font-medium text-slate-800">Marcar como caso especial</label></div>
                        {formData.is_special_case && <div className="mt-4"><hr className="mb-4"/><label htmlFor="special_case_description" className="label-style">Descripción del Caso Especial</label><textarea name="special_case_description" id="special_case_description" value={formData.special_case_description} onChange={handleInputChange} rows="3" className="input-style"></textarea></div>}
                    </div>
                </div>
                
                <div className="bg-white shadow-xl shadow-slate-200/60 rounded-xl p-8">
                    <h2 className="text-2xl font-bold text-slate-700 mb-6">Información Médica y de Emergencia</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><label htmlFor="blood_type" className="label-style">Tipo de Sangre</label><input type="text" name="blood_type" id="blood_type" value={formData.blood_type} onChange={handleInputChange} className="input-style" /></div>
                        <div className="md:row-span-2"><label htmlFor="allergies" className="label-style">Alergias</label><textarea name="allergies" id="allergies" value={formData.allergies} onChange={handleInputChange} rows="5" className="input-style"></textarea></div>
                        <div><label htmlFor="emergency_contact_name" className="label-style">Contacto de Emergencia (Nombre)</label><input type="text" name="emergency_contact_name" id="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleInputChange} className="input-style" /></div>
                        <div><label htmlFor="emergency_contact_phone" className="label-style">Contacto de Emergencia (Teléfono)</label><input type="tel" name="emergency_contact_phone" id="emergency_contact_phone" value={formData.emergency_contact_phone} onChange={handleInputChange} className="input-style" /></div>
                    </div>
                </div>

                {/* --- SECCIÓN DE ACCIONES PELIGROSAS (ESTADO) --- */}
                <div className="bg-white shadow-xl shadow-red-200/40 rounded-xl p-8 border border-red-200">
                    <h2 className="text-2xl font-bold text-red-800 mb-4">Zona de Acciones</h2>
                    <div className="flex items-center gap-4">
                        <p className="text-slate-600">El estudiante se encuentra actualmente <span className="font-bold">{formData.is_active ? 'Activo' : 'Inactivo'}</span>.</p>
                        <button type="button" onClick={handleOpenConfirmStatusModal} disabled={isTogglingStatus || isSubmitting} className={`inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-white rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-300 transform hover:scale-105 active:scale-100 disabled:opacity-50 disabled:scale-100 ${formData.is_active ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'}`} >
                            <PowerIcon /> {isTogglingStatus ? (formData.is_active ? 'Desactivando...' : 'Activando...') : (formData.is_active ? 'Desactivar Estudiante' : 'Activar Estudiante')}
                        </button>
                    </div>
                </div>

                {/* --- BARRA DE ACCIONES FLOTANTE/FIJA INFERIOR --- */}
                <div className="p-4 bg-white/80 backdrop-blur-sm border-t border-slate-200 sticky bottom-0 flex justify-end space-x-4">
                    {error && isSubmitting && <p className="text-red-600 text-sm font-medium mr-auto self-center">{error}</p>}
                    <Link to="/students" className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">Cancelar</Link>
                    <button type="submit" disabled={isSubmitting || isLoading || isTogglingStatus} className="inline-flex items-center gap-x-2 px-3 py-2 text-sm font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px disabled:opacity-70 disabled:transform-none disabled:cursor-not-allowed">
                        <SaveIcon /> {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </form>

            <ChangeRepresentativeModal isOpen={showChangeRepModal} onClose={handleCloseChangeRepModal} currentStudentName={`${formData.first_name} ${formData.last_name}`} onSelectRepresentative={handleSelectNewRepresentative} />
            
            <Modal isOpen={isConfirmStatusModalOpen} onClose={() => setIsConfirmStatusModalOpen(false)} title={`Confirmar ${formData.is_active ? 'Desactivación' : 'Activación'}`}>
                <div>
                    <p className="text-sm text-slate-600 mb-4">¿Está seguro de que desea <strong className={formData.is_active ? 'text-red-600' : 'text-green-600'}>{formData.is_active ? 'desactivar' : 'activar'}</strong> al estudiante <strong className="font-semibold text-slate-800">{`${formData.first_name} ${formData.last_name}`}</strong>?</p>
                    {formData.is_active && (<p className="text-xs text-amber-700 font-bold bg-amber-100 p-2 rounded-md">¡DESACTIVAR UN ESTUDIANTE USUALMENTE PREVIENE QUE SE LE APLIQUEN NUEVOS CARGOS!</p>)}
                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={() => setIsConfirmStatusModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg" disabled={isTogglingStatus}>Cancelar</button>
                        <button type="button" onClick={handleConfirmToggleStatus} className={`px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-md disabled:cursor-wait ${formData.is_active ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400' : 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'}`} disabled={isTogglingStatus}>
                            {isTogglingStatus ? 'Procesando...' : `Sí, ${formData.is_active ? 'Desactivar' : 'Activar'}`}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

export default EditStudentPage;