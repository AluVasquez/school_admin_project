import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
    getEmployeeById, 
    updateEmployee, 
    getPositions,
    uploadEmployeePhoto,
    getSalaryComponentsForEmployee,
    assignSalaryComponentToEmployee,
    updateEmployeeSalaryComponentAssignment,
    deleteEmployeeSalaryComponentAssignment,
    getSalaryComponentDefinitions
} from '../services/apiPersonnel';
import RecordEmployeePaymentModal from '../components/RecordEmployeePaymentModal'; //
import EmployeeBalanceAdjustmentModal from '../components/EmployeeBalanceAdjustmentModal';  //
import { toast } from 'react-toastify';

// --- Headless UI y Heroicons ---
import { Tab, Dialog, Listbox, Switch, Transition } from '@headlessui/react';
import { 
    ArrowLeftIcon, UserCircleIcon, BriefcaseIcon, PhoneIcon, ChatBubbleBottomCenterTextIcon, CheckIcon, ChevronUpDownIcon,
    PhotoIcon, ArrowUpTrayIcon, XCircleIcon, ExclamationTriangleIcon, PlusIcon, PencilIcon, TrashIcon,
    CurrencyDollarIcon, AdjustmentsHorizontalIcon, PowerIcon, CheckCircleIcon, NoSymbolIcon, BanknotesIcon
} from '@heroicons/react/24/solid';

// --- Opciones y Constantes (Sin Cambios) ---
const CONTRACT_TYPE_OPTIONS = [
    { value: "full_time", label: "Tiempo Completo" }, { value: "part_time", label: "Medio Tiempo" },
    { value: "hourly", label: "Por Horas" }, { value: "internship",label: "Pasantía" },
    { value: "temporary", label: "Temporal" }, { value: "indefinite", label: "Indefinido" },
    { value: "other", label: "Otro" },
];
const GENDER_OPTIONS = [
    { value: "Masculino", label: "Masculino" }, { value: "Femenino", label: "Femenino" },
    { value: "Otro", label: "Otro" }, { value: "Prefiero no decirlo", label: "Prefiero no decirlo"}
];
const CURRENCIES_OPTIONS = [
    { value: "VES", label: "VES (Bolívares)" }, { value: "USD", label: "USD (Dólares)" }, { value: "EUR", label: "EUR (Euros)" },
];
const API_BASE_URL = "http://127.0.0.1:8000";

const initialEmployeeFormData = {
  first_name: '', last_name: '', identity_document: '', birth_date: '', gender: '', address: '',
  primary_phone: '', secondary_phone: '', personal_email: '', emergency_contact_name: '',
  emergency_contact_phone: '', emergency_contact_relationship: '', employee_code: '', position_id: '',
  hire_date: '', termination_date: '', contract_type: 'indefinite', user_id: '', photo_url: '',
  additional_notes: '', is_active: true,
  base_salary_amount: '', base_salary_currency: 'VES', pay_frequency: 'monthly', hourly_rate: '',
  current_balance_ves: 0, 
  accumulated_hours: 0, 
};

const initialAssignedComponentFormData = {
    component_definition_id: '',
    override_value: '',
    override_currency: '',
    is_active: true,
};

const formatCurrency = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD' && locale === 'es-VE') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};


// --- Componentes de UI Personalizados ---

const CustomListbox = ({ options, value, onChange, placeholder, disabled }) => (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
        <div className="relative">
            <Listbox.Button className="relative w-full cursor-default rounded-lg bg-white py-2 pl-3 pr-10 text-left shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-300 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed">
                <span className="block truncate">{options.find(opt => opt.value === value)?.label || <span className="text-gray-400">{placeholder}</span>}</span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </span>
            </Listbox.Button>
            <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm">
                    {options.map((opt) => (
                        <Listbox.Option key={opt.value} className={({ active }) =>`relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-900'}`} value={opt.value}>
                            {({ selected }) => (
                                <>
                                    <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>{opt.label}</span>
                                    {selected ? (<span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-600"><CheckIcon className="h-5 w-5" aria-hidden="true" /></span>) : null}
                                </>
                            )}
                        </Listbox.Option>
                    ))}
                </Listbox.Options>
            </Transition>
        </div>
    </Listbox>
);

// FormInput ahora con padding horizontal (px-3)
const FormInput = ({ label, id, ...props }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium leading-6 text-gray-900">{label}</label>
        <div className="mt-2">
            <input id={id} {...props} className="block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" />
        </div>
    </div>
);

// --- Componente Principal ---

function EditEmployeePage() {
    // --- Toda la lógica de negocio (hooks, state, callbacks) se mantiene intacta ---
    const { employeeId } = useParams();
    const { token } = useAuth();
    const navigate = useNavigate();

    const [formData, setFormData] = useState(initialEmployeeFormData);
    const [positions, setPositions] = useState([]);
    const [currentPhotoUrl, setCurrentPhotoUrl] = useState(null);
    const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingPositions, setIsLoadingPositions] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [formError, setFormError] = useState(null);
    const [photoUploadError, setPhotoUploadError] = useState(null);

    const [assignedSalaryComponents, setAssignedSalaryComponents] = useState([]);
    const [isLoadingAssignedComponents, setIsLoadingAssignedComponents] = useState(true);
    const [availableDefinitions, setAvailableDefinitions] = useState([]);
    const [isLoadingDefinitions, setIsLoadingDefinitions] = useState(true);
    
    const [isComponentModalOpen, setIsComponentModalOpen] = useState(false);
    const [editingAssignedComponent, setEditingAssignedComponent] = useState(null);
    const [componentFormData, setComponentFormData] = useState(initialAssignedComponentFormData);
    const [isSubmittingComponent, setIsSubmittingComponent] = useState(false);
    const [formComponentError, setFormComponentError] = useState(null);

    const [isRecordPaymentModalOpen, setIsRecordPaymentModalOpen] = useState(false);
    const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);

    const fetchEmployeeData = useCallback(async () => {
        if (!token || !employeeId) return;
        setIsLoading(true); setFormError(null);
        try {
            const data = await getEmployeeById(token, employeeId);
            setFormData({
                first_name: data.first_name || '', last_name: data.last_name || '',
                identity_document: data.identity_document || '',
                birth_date: data.birth_date ? data.birth_date.split('T')[0] : '',
                gender: data.gender || '', address: data.address || '',
                primary_phone: data.primary_phone || '', secondary_phone: data.secondary_phone || '',
                personal_email: data.personal_email || '',
                emergency_contact_name: data.emergency_contact_name || '',
                emergency_contact_phone: data.emergency_contact_phone || '',
                emergency_contact_relationship: data.emergency_contact_relationship || '',
                employee_code: data.employee_code || '',
                position_id: data.position?.id?.toString() || '',
                hire_date: data.hire_date ? data.hire_date.split('T')[0] : '',
                termination_date: data.termination_date ? data.termination_date.split('T')[0] : '',
                contract_type: data.contract_type || 'indefinite',
                user_id: data.system_user?.id?.toString() || '',
                photo_url: data.photo_url || '',
                additional_notes: data.additional_notes || '',
                is_active: data.is_active === undefined ? true : data.is_active,
                base_salary_amount: data.base_salary_amount !== null && data.base_salary_amount !== undefined ? data.base_salary_amount.toString() : '',
                base_salary_currency: data.base_salary_currency || 'VES',
                pay_frequency: data.pay_frequency || 'monthly',
                hourly_rate: data.hourly_rate !== null && data.hourly_rate !== undefined ? data.hourly_rate.toString() : '',
                current_balance_ves: data.current_balance_ves !== null && data.current_balance_ves !== undefined ? data.current_balance_ves : 0,
                accumulated_hours: data.accumulated_hours !== null && data.accumulated_hours !== undefined ? data.accumulated_hours : 0,
            });
            setCurrentPhotoUrl(data.photo_url ? `${API_BASE_URL}${data.photo_url}` : null);
        } catch (err) { setFormError(err.message); toast.error(`Error al cargar empleado: ${err.message}`); }
        finally { setIsLoading(false); }
    }, [token, employeeId]);

    const fetchPositionsForSelect = useCallback(async () => {
        if (!token) return; setIsLoadingPositions(true);
        try {
            const data = await getPositions(token, { limit: 200 });
            setPositions(data.items || []);
        } catch (err) { toast.error("Error al cargar cargos (posiciones)."); }
        finally { setIsLoadingPositions(false); }
    }, [token]);

    const fetchAssignedComponents = useCallback(async () => {
        if (!token || !employeeId) return; 
        setIsLoadingAssignedComponents(true);
        try {
            const data = await getSalaryComponentsForEmployee(token, employeeId, null); 
            setAssignedSalaryComponents(data || []);
        } catch (err) { toast.error("Error al cargar componentes salariales asignados."); setAssignedSalaryComponents([]); } 
        finally { setIsLoadingAssignedComponents(false); }
    }, [token, employeeId]);

    const fetchAvailableDefinitions = useCallback(async () => {
        if (!token) return; 
        setIsLoadingDefinitions(true);
        try {
            const data = await getSalaryComponentDefinitions(token, { limit: 200, isActive: true });
            setAvailableDefinitions(data.items || []);
        } catch (err) { toast.error("Error al cargar definiciones de componentes salariales."); setAvailableDefinitions([]); } 
        finally { setIsLoadingDefinitions(false); }
    }, [token]);

    useEffect(() => {
        if (token && employeeId) {
            fetchEmployeeData();
            fetchPositionsForSelect();
            fetchAssignedComponents();
            fetchAvailableDefinitions();
        }
    }, [token, employeeId, fetchEmployeeData, fetchPositionsForSelect, fetchAssignedComponents, fetchAvailableDefinitions]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };
    const handleListboxChange = (name, value) => {
        setFormData(prev => ({...prev, [name]: value }));
    };
     const handleSwitchChange = (name, checked) => {
        setFormData(prev => ({ ...prev, [name]: checked }));
    };

    const handlePhotoFileChange = (e) => {
        if (e.target.files && e.target.files[0]) { setSelectedPhotoFile(e.target.files[0]); setPhotoUploadError(null); }
        else { setSelectedPhotoFile(null); }
    };
    const handlePhotoUpload = async () => {
        if (!selectedPhotoFile || !token || !employeeId) { toast.warn("Seleccione un archivo de imagen."); return; }
        setIsUploadingPhoto(true); setPhotoUploadError(null);
        try {
            const updatedEmployee = await uploadEmployeePhoto(token, employeeId, selectedPhotoFile);
            setCurrentPhotoUrl(updatedEmployee.photo_url ? `${API_BASE_URL}${updatedEmployee.photo_url}` : null);
            setFormData(prev => ({ ...prev, photo_url: updatedEmployee.photo_url || ''}));
            setSelectedPhotoFile(null); 
            toast.success("Foto de perfil actualizada!");
        } catch (err) { setPhotoUploadError(err.message); toast.error(`Error al subir foto: ${err.message}`); }
        finally { setIsUploadingPhoto(false); }
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!token) { toast.error("Autenticación requerida."); return; }
        if (formData.pay_frequency === 'hourly' && (!formData.hourly_rate || parseFloat(formData.hourly_rate) <= 0)) {
            toast.warn("Si la frecuencia es 'Por Hora', la tarifa por hora debe ser un número positivo."); return;
        }
        if (formData.pay_frequency !== 'hourly' && (!formData.base_salary_amount || parseFloat(formData.base_salary_amount) <= 0)) {
            toast.warn("Si la frecuencia es mensual o quincenal, el monto del salario base debe ser positivo."); return;
        }
        if ((formData.base_salary_amount && parseFloat(formData.base_salary_amount) > 0) || (formData.hourly_rate && parseFloat(formData.hourly_rate) > 0)) {
            if (!formData.base_salary_currency) { toast.warn("Debe seleccionar una moneda para el salario/tarifa."); return; }
        }
        setIsSubmitting(true); setFormError(null);
        const payload = {
            first_name: formData.first_name, last_name: formData.last_name,
            identity_document: formData.identity_document, birth_date: formData.birth_date || null, gender: formData.gender || null,
            address: formData.address || null, primary_phone: formData.primary_phone, secondary_phone: formData.secondary_phone || null,
            personal_email: formData.personal_email || null, emergency_contact_name: formData.emergency_contact_name || null,
            emergency_contact_phone: formData.emergency_contact_phone || null, emergency_contact_relationship: formData.emergency_contact_relationship || null,
            employee_code: formData.employee_code || null, position_id: formData.position_id ? parseInt(formData.position_id) : null,
            hire_date: formData.hire_date, termination_date: formData.termination_date || null, contract_type: formData.contract_type || null,
            user_id: formData.user_id ? parseInt(formData.user_id) : null, photo_url: formData.photo_url || null,
            additional_notes: formData.additional_notes || null, is_active: formData.is_active,
            base_salary_amount: formData.pay_frequency !== 'hourly' && formData.base_salary_amount !== '' ? parseFloat(formData.base_salary_amount) : null,
            base_salary_currency: (formData.base_salary_amount || formData.hourly_rate) ? formData.base_salary_currency : null,
            pay_frequency: formData.pay_frequency || null,
            hourly_rate: formData.pay_frequency === 'hourly' && formData.hourly_rate !== '' ? parseFloat(formData.hourly_rate) : null,
        };
        try {
            await updateEmployee(token, employeeId, payload);
            toast.success("Datos del empleado actualizados.");
            fetchEmployeeData(); 
        } catch (err) { setFormError(err.message); toast.error(`Error al actualizar datos: ${err.message}`);}
        finally { setIsSubmitting(false); }
    };
    const handleComponentFormInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setComponentFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };
    const openComponentModalForCreate = () => {
        setEditingAssignedComponent(null);
        setComponentFormData(initialAssignedComponentFormData);
        setFormComponentError(null);
        setIsComponentModalOpen(true);
    };
    const openComponentModalForEdit = (assignedComponent) => {
        setEditingAssignedComponent(assignedComponent);
        const definition = assignedComponent.component_definition;
        setComponentFormData({
            component_definition_id: assignedComponent.component_definition_id.toString(),
            override_value: assignedComponent.override_value !== null && assignedComponent.override_value !== undefined ? assignedComponent.override_value.toString() : '',
            override_currency: assignedComponent.override_currency || (definition?.calculation_type === 'fixed_amount' ? (definition?.default_currency || '') : ''),
            is_active: assignedComponent.is_active,
        });
        setFormComponentError(null);
        setIsComponentModalOpen(true);
    };
    const closeComponentModal = () => {
        setIsComponentModalOpen(false); 
        setEditingAssignedComponent(null); 
        setComponentFormData(initialAssignedComponentFormData);
    };
    const handleSubmitComponentForm = async (e) => {
        e.preventDefault();
        if (!token || !employeeId) { toast.error("Error de datos del empleado o autenticación."); return; }
        if (!componentFormData.component_definition_id) {
            toast.warn("Debe seleccionar una definición de componente."); 
            setFormComponentError("Seleccione un componente de la lista."); return;
        }
        const selectedDef = availableDefinitions.find(def => def.id.toString() === componentFormData.component_definition_id);
        if (!selectedDef) { 
            toast.error("La definición de componente seleccionada no es válida o no se encontró."); 
            setFormComponentError("Definición no válida."); return; 
        }
        let finalOverrideValue = null;
        if (componentFormData.override_value !== '' && componentFormData.override_value !== null) {
            const parsedValue = parseFloat(componentFormData.override_value);
            if (isNaN(parsedValue)) {
                toast.warn("El valor personalizado debe ser un número.");
                setFormComponentError("Valor personalizado inválido."); return;
            }
            if (selectedDef.calculation_type === 'percentage_of_base_salary' && (parsedValue < 0 || parsedValue > 1)) {
                toast.warn("Para porcentajes, el valor debe estar entre 0.0 (0%) y 1.0 (100%). Ej: 0.1 para 10%.");
                setFormComponentError("Porcentaje inválido."); return;
            }
            finalOverrideValue = parsedValue;
        }
        let finalOverrideCurrency = null;
        if (selectedDef.calculation_type === 'fixed_amount' && finalOverrideValue !== null) {
            if (componentFormData.override_currency) { finalOverrideCurrency = componentFormData.override_currency; } 
            else if (selectedDef.default_currency) { finalOverrideCurrency = selectedDef.default_currency; } 
            else { finalOverrideCurrency = 'VES';}
        }
        setIsSubmittingComponent(true); setFormComponentError(null);
        const payload = {
            employee_id: parseInt(employeeId), component_definition_id: parseInt(componentFormData.component_definition_id),
            override_value: finalOverrideValue, override_currency: finalOverrideCurrency, is_active: componentFormData.is_active,
        };
        try {
            if (editingAssignedComponent) {
                await updateEmployeeSalaryComponentAssignment(token, editingAssignedComponent.id, payload);
                toast.success("Asignación de componente salarial actualizada exitosamente!");
            } else {
                await assignSalaryComponentToEmployee(token, payload);
                toast.success("Componente salarial asignado al empleado exitosamente!");
            }
            closeComponentModal(); 
            fetchAssignedComponents();
        } catch (err) { 
            const errorMsg = err.message || "Ocurrió un error al guardar la asignación del componente."; 
            setFormComponentError(errorMsg); 
            toast.error(`Error: ${errorMsg}`); 
        }
        finally { setIsSubmittingComponent(false); }
    };
    const handleToggleAssignedComponentActive = async (assignedComponent) => {
        if (!token) return;
        const actionText = assignedComponent.is_active ? "desactivar" : "activar";
        if (!window.confirm(`¿Seguro que desea ${actionText} el componente "${assignedComponent.component_definition.name}" para este empleado?`)) return;
        try {
            await updateEmployeeSalaryComponentAssignment(token, assignedComponent.id, { is_active: !assignedComponent.is_active });
            toast.success(`Componente ${actionText}do para el empleado.`);
            fetchAssignedComponents();
        } catch (err) { toast.error(`Error al ${actionText} el componente: ${err.message}`);}
    };
    const handleDeleteAssignedComponent = async (assignmentId, componentName) => {
        if (!token) return;
        if (!window.confirm(`¿Seguro que desea quitar la asignación del componente "${componentName}" de este empleado?`)) return;
        try {
            await deleteEmployeeSalaryComponentAssignment(token, assignmentId);
            toast.success(`Componente "${componentName}" quitado del empleado.`);
            fetchAssignedComponents();
        } catch (err) { toast.error(`Error al quitar componente: ${err.message}`);}
    };
    const handlePaymentSuccessfullyRecorded = () => {
        toast.info("Actualizando datos del empleado después del pago...");
        fetchEmployeeData(); 
    };
    const handleAdjustmentRecorded = () => {
        toast.info("Actualizando datos del empleado después del ajuste de saldo...");
        fetchEmployeeData(); 
    };

    // --- RENDERIZADO MEJORADO ---
    
    // Estado de Carga Inicial
    if (isLoading || isLoadingPositions || isLoadingDefinitions) {
        return (
            <div className="p-8 bg-gray-50 min-h-screen">
                <div className="animate-pulse">
                    <div className="h-8 bg-gray-300 rounded w-1/3 mb-6"></div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-8">
                            <div className="h-64 bg-gray-200 rounded-xl"></div>
                            <div className="h-96 bg-gray-200 rounded-xl"></div>
                        </div>
                        <div className="lg:col-span-1 space-y-8">
                            <div className="h-48 bg-gray-200 rounded-xl"></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    
    // Estado de Error o No Encontrado
    if (formError || (!formData.first_name && !isLoading && employeeId)) {
        return (
             <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
                <div className="text-center">
                    <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-yellow-400" />
                    <h2 className="mt-4 text-2xl font-bold text-gray-800">No se pudieron cargar los datos</h2>
                    <p className="mt-2 text-base text-gray-600">
                      {formError ? `Ocurrió un error: ${formError}` : `No se encontró un empleado con el ID ${employeeId}.`}
                    </p>
                    <Link to="/personnel/employees" className="mt-6 inline-flex items-center gap-x-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                        <ArrowLeftIcon className="h-4 w-4" />
                        Volver a la lista
                    </Link>
                </div>
            </div>
        );
    }
    
    // Renderizado Principal de la Página
    return (
    <div className="bg-gray-50 min-h-screen">
      <form onSubmit={handleSubmit}>
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
              <Link to="/personnel/employees" className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
                  <ArrowLeftIcon className="w-5 h-5" />
                  Volver a la lista de empleados
              </Link>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">
                  Editar Empleado
              </h1>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Columna Izquierda y Central (Formulario y Datos) */}
            <div className="xl:col-span-2 space-y-8">
              
              {/* --- Pestañas del Formulario Principal --- */}
              <div className="bg-white p-2 sm:p-4 rounded-xl shadow-sm">
                <Tab.Group>
                  <Tab.List className="flex space-x-1 rounded-xl bg-gray-100 p-1">
                    {[
                      {name: "Personal", icon: UserCircleIcon},
                      {name: "Laboral y Salarial", icon: BriefcaseIcon},
                      {name: "Contacto Emergencia", icon: PhoneIcon},
                      {name: "Otros", icon: ChatBubbleBottomCenterTextIcon}
                    ].map((tab) => (
                      <Tab key={tab.name} className={({ selected }) => `w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium leading-5 transition-colors focus:outline-none ${selected ? 'bg-white text-indigo-700 shadow' : 'text-gray-600 hover:bg-white/70 hover:text-indigo-600'}`}>
                        <tab.icon className="w-5 h-5"/> {tab.name}
                      </Tab>
                    ))}
                  </Tab.List>
                  <Tab.Panels className="mt-4">
                    {/* Panel de Información Personal */}
                    <Tab.Panel className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <FormInput label="Nombres*" id="first_name_emp_edit" name="first_name" type="text" value={formData.first_name} onChange={handleInputChange} required />
                        <FormInput label="Apellidos*" id="last_name_emp_edit" name="last_name" type="text" value={formData.last_name} onChange={handleInputChange} required />
                        <FormInput label="Documento ID*" id="identity_document_emp_edit" name="identity_document" type="text" value={formData.identity_document} onChange={handleInputChange} required />
                        <FormInput label="Fecha de Nacimiento" id="birth_date_emp_edit" name="birth_date" type="date" value={formData.birth_date} onChange={handleInputChange} />
                        <div>
                           <label className="block text-sm font-medium leading-6 text-gray-900">Género</label>
                            <CustomListbox options={GENDER_OPTIONS} value={formData.gender} onChange={(val) => handleListboxChange('gender', val)} placeholder="Seleccionar género..." />
                        </div>
                        <div className="sm:col-span-2">
                           <label htmlFor="address_emp_edit" className="block text-sm font-medium leading-6 text-gray-900">Dirección</label>
                           <textarea name="address" id="address_emp_edit" value={formData.address} onChange={handleInputChange} rows="3" className="mt-2 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"></textarea>
                        </div>
                        <FormInput label="Teléfono Principal*" id="primary_phone_emp_edit" name="primary_phone" type="tel" value={formData.primary_phone} onChange={handleInputChange} required />
                        <FormInput label="Teléfono Secundario" id="secondary_phone_emp_edit" name="secondary_phone" type="tel" value={formData.secondary_phone} onChange={handleInputChange} />
                        <div className="sm:col-span-2"><FormInput label="Email Personal" id="personal_email_emp_edit" name="personal_email" type="email" value={formData.personal_email} onChange={handleInputChange} /></div>
                      </div>
                    </Tab.Panel>

                    {/* Panel de Información Laboral y Salarial */}
                    <Tab.Panel className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <FormInput label="Código de Empleado" id="employee_code_emp_edit" name="employee_code" type="text" value={formData.employee_code} onChange={handleInputChange} />
                            <div>
                                <label className="block text-sm font-medium leading-6 text-gray-900">Cargo (Posición)*</label>
                                <CustomListbox options={positions.map(p => ({value: p.id.toString(), label: `${p.name} (${p.department?.name})`}))} value={formData.position_id} onChange={(val) => handleListboxChange('position_id', val)} placeholder={isLoadingPositions ? 'Cargando...' : 'Seleccionar cargo...'} disabled={isLoadingPositions} />
                            </div>
                            <FormInput label="Fecha de Ingreso*" id="hire_date_emp_edit" name="hire_date" type="date" value={formData.hire_date} onChange={handleInputChange} required />
                            <FormInput label="Fecha de Egreso" id="termination_date_emp_edit" name="termination_date" type="date" value={formData.termination_date} onChange={handleInputChange} />
                            <div>
                                <label className="block text-sm font-medium leading-6 text-gray-900">Tipo de Contrato</label>
                                <CustomListbox options={CONTRACT_TYPE_OPTIONS} value={formData.contract_type} onChange={(val) => handleListboxChange('contract_type', val)} placeholder="Seleccionar contrato..." />
                            </div>
                            <FormInput label="ID Usuario del Sistema" id="user_id_emp_edit" name="user_id" type="number" value={formData.user_id} onChange={handleInputChange} placeholder="ID numérico (opcional)" />
                            
                            <div className="sm:col-span-2 pt-4 mt-4 border-t border-gray-200">
                                <p className="text-md font-semibold text-gray-800">Configuración Salarial Base</p>
                            </div>

                             <div>
                                <label className="block text-sm font-medium leading-6 text-gray-900">Frecuencia de Pago</label>
                                <CustomListbox options={[{value: 'monthly', label: 'Mensual'}, {value: 'fortnightly', label: 'Quincenal'}, {value: 'hourly', label: 'Por Hora'}]} value={formData.pay_frequency} onChange={(val) => handleListboxChange('pay_frequency', val)} placeholder="Seleccionar frecuencia..." />
                            </div>
                             <div>
                                <label className="block text-sm font-medium leading-6 text-gray-900">Moneda Salario/Tarifa</label>
                                <CustomListbox options={CURRENCIES_OPTIONS} value={formData.base_salary_currency} onChange={(val) => handleListboxChange('base_salary_currency', val)} placeholder="Seleccionar moneda..." />
                            </div>
                            {formData.pay_frequency === 'hourly' ? (
                                <FormInput label="Tarifa por Hora*" id="hourly_rate_emp_edit" name="hourly_rate" type="number" value={formData.hourly_rate} onChange={handleInputChange} min="0" step="0.01" required />
                            ) : (
                                <FormInput label="Monto Salario Base*" id="base_salary_amount_emp_edit" name="base_salary_amount" type="number" value={formData.base_salary_amount} onChange={handleInputChange} min="0" step="0.01" required />
                            )}
                            {formData.pay_frequency === 'hourly' && (
                                <div>
                                    <label className="block text-sm font-medium leading-6 text-gray-900">Horas Acumuladas</label>
                                    <p className="mt-2 block w-full rounded-md border-0 px-3 py-1.5 bg-gray-100 text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 sm:text-sm">{parseFloat(formData.accumulated_hours || 0).toFixed(2)}</p>
                                </div>
                            )}
                        </div>
                    </Tab.Panel>

                    {/* Panel de Contacto de Emergencia */}
                    <Tab.Panel className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                       <FormInput label="Nombre de Contacto" id="emergency_contact_name_emp_edit" name="emergency_contact_name" type="text" value={formData.emergency_contact_name} onChange={handleInputChange} />
                       <FormInput label="Teléfono de Contacto" id="emergency_contact_phone_emp_edit" name="emergency_contact_phone" type="tel" value={formData.emergency_contact_phone} onChange={handleInputChange} />
                       <FormInput label="Parentesco" id="emergency_contact_relationship_emp_edit" name="emergency_contact_relationship" type="text" value={formData.emergency_contact_relationship} onChange={handleInputChange} />
                    </Tab.Panel>

                    {/* Panel de Otros */}
                    <Tab.Panel className="space-y-6">
                        <div>
                            <label htmlFor="additional_notes_emp_edit" className="block text-sm font-medium leading-6 text-gray-900">Notas Adicionales</label>
                            <textarea name="additional_notes" id="additional_notes_emp_edit" value={formData.additional_notes} onChange={handleInputChange} rows="4" className="mt-2 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"></textarea>
                        </div>
                        <Switch.Group as="div" className="flex items-center justify-between">
                            <span className="flex-grow flex flex-col">
                                <Switch.Label as="span" className="text-sm font-medium leading-6 text-gray-900" passive>Empleado Activo</Switch.Label>
                                <Switch.Description as="span" className="text-sm text-gray-500">Controla si el empleado aparece en las listas activas y puede ser incluido en nóminas.</Switch.Description>
                            </span>
                             <Switch checked={formData.is_active} onChange={(val) => handleSwitchChange('is_active', val)} className={`${formData.is_active ? 'bg-indigo-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75`}>
                                <span className={`${formData.is_active ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
                            </Switch>
                        </Switch.Group>
                    </Tab.Panel>
                  </Tab.Panels>
                </Tab.Group>
              </div>

              {/* --- Sección de Componentes Salariales --- */}
              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm">
                 <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">Componentes Salariales Asignados</h2>
                    <button type="button" onClick={openComponentModalForCreate} className="inline-flex items-center gap-x-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                        <PlusIcon className="-ml-0.5 h-5 w-5" /> Asignar Componente
                    </button>
                 </div>
                 <div className="space-y-3">
                    {isLoadingAssignedComponents && <p className="text-sm text-center text-gray-500 py-4">Cargando componentes...</p>}
                    {!isLoadingAssignedComponents && assignedSalaryComponents.length === 0 && (
                        <div className="text-center py-6 px-4 bg-gray-50 rounded-lg">
                            <CurrencyDollarIcon className="mx-auto h-10 w-10 text-gray-400"/>
                            <h3 className="mt-2 text-sm font-semibold text-gray-900">Sin Componentes Asignados</h3>
                            <p className="mt-1 text-sm text-gray-500">Este empleado solo recibe su salario base.</p>
                        </div>
                    )}
                    {assignedSalaryComponents.map(assignedComp => {
                        const def = assignedComp.component_definition;
                        let valueDisplay = "N/A";
                        if(def) {
                           const value = assignedComp.override_value ?? def.default_value;
                           const currency = assignedComp.override_currency ?? def.default_currency;
                           if (value !== null) {
                                valueDisplay = def.calculation_type === 'percentage_of_base_salary'
                                    ? `${(parseFloat(value) * 100).toFixed(2)}%`
                                    : formatCurrency(value, currency || 'VES');
                           }
                        }
                        return (
                            <div key={assignedComp.id} className={`p-3 rounded-lg border ${!assignedComp.is_active ? 'bg-gray-50 opacity-70' : 'bg-white'}`}>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="flex-1">
                                        <p className="font-semibold text-gray-800 flex items-center gap-2">
                                           {def?.name || 'Componente Desconocido'}
                                           <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${def?.component_type === 'earning' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' : 'bg-red-50 text-red-700 ring-red-600/10'}`}>{def?.component_type === 'earning' ? 'Asignación' : 'Deducción'}</span>
                                        </p>
                                        <p className="text-sm text-gray-600">
                                            {valueDisplay}
                                            <span className="text-xs text-gray-400">{assignedComp.override_value !== null ? ' (Personalizado)' : ' (Por Defecto)'}</span>
                                        </p>
                                        {!assignedComp.is_active && <p className="text-xs font-bold text-yellow-700 mt-1">ASIGNACIÓN INACTIVA</p>}
                                    </div>
                                    <div className="flex items-center space-x-3 flex-shrink-0 self-end sm:self-center">
                                       <button type="button" onClick={() => openComponentModalForEdit(assignedComp)} className="p-1 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 transition-colors"><PencilIcon className="w-5 h-5"/></button>
                                       <button type="button" onClick={() => handleToggleAssignedComponentActive(assignedComp)} className={`p-1 rounded-full transition-colors ${assignedComp.is_active ? 'text-gray-400 hover:text-yellow-600 hover:bg-gray-100' : 'text-gray-400 hover:text-green-600 hover:bg-gray-100'}`}>{assignedComp.is_active ? <PowerIcon className="w-5 h-5"/> : <CheckCircleIcon className="w-5 h-5"/>}</button>
                                       <button type="button" onClick={() => handleDeleteAssignedComponent(assignedComp.id, def?.name)} className="p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors"><TrashIcon className="w-5 h-5"/></button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                 </div>
              </div>

               {/* --- Sección de Pagos y Ajustes de Saldo --- */}
              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm">
                 <h2 className="text-lg font-semibold text-gray-900 mb-4">Pagos y Ajustes de Saldo</h2>
                 <div className="flex flex-col sm:flex-row items-center justify-between p-4 rounded-lg bg-gray-50 border border-gray-200">
                    <div>
                        <p className="text-sm text-gray-600">Saldo Actual</p>
                        <p className={`text-2xl font-bold ${parseFloat(formData.current_balance_ves || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(parseFloat(formData.current_balance_ves || 0), 'VES')}
                        </p>
                        <p className="text-xs text-gray-500">{parseFloat(formData.current_balance_ves || 0) > 0 ? "La escuela le debe al empleado." : parseFloat(formData.current_balance_ves || 0) < 0 ? "El empleado le debe a la escuela." : "El saldo está en cero."}</p>
                    </div>
                    <div className="flex gap-3 mt-4 sm:mt-0">
                         <button type="button" onClick={() => setIsRecordPaymentModalOpen(true)} disabled={parseFloat(formData.current_balance_ves || 0) <= 0} className="inline-flex items-center gap-x-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:bg-gray-300 disabled:cursor-not-allowed">
                             <BanknotesIcon className="-ml-0.5 h-5 w-5" /> Registrar Pago
                         </button>
                         <button type="button" onClick={() => setIsAdjustmentModalOpen(true)} className="inline-flex items-center gap-x-1.5 rounded-md bg-yellow-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-yellow-400">
                             <AdjustmentsHorizontalIcon className="-ml-0.5 h-5 w-5" /> Ajustar Saldo
                         </button>
                    </div>
                 </div>
              </div>

            </div>

            {/* Columna Derecha (Resumen y Acciones) */}
            <div className="xl:col-span-1 space-y-8">
              <div className="sticky top-8">
                {/* Card de Acciones */}
                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900">Acciones</h3>
                  <div className="mt-6 space-y-4">
                    <button type="submit" disabled={isSubmitting || isLoading || isLoadingPositions || isUploadingPhoto} className="w-full inline-flex items-center justify-center gap-x-2 rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-indigo-300 disabled:cursor-wait">
                      {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                    <Link to="/personnel/employees" className="w-full block text-center rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
                      Cancelar
                    </Link>
                  </div>
                  {formError && isSubmitting && <p className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-md">{formError}</p>}
                </div>
                
                {/* Card de Foto de Perfil */}
                <div className="mt-8 bg-white p-6 rounded-xl shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><PhotoIcon className="w-5 h-5 text-gray-400"/> Foto de Perfil</h3>
                  <div className="mt-4 flex flex-col items-center gap-4">
                      <img src={currentPhotoUrl || "/placeholder-avatar.png"} alt="Foto de perfil" className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"/>
                      <input type="file" name="photo_file" id="photo_file_emp_edit" accept="image/*" onChange={handlePhotoFileChange} className="sr-only"/>
                      <label htmlFor="photo_file_emp_edit" className="cursor-pointer text-sm font-semibold text-indigo-600 hover:text-indigo-500">
                          {selectedPhotoFile ? `Archivo seleccionado: ${selectedPhotoFile.name}` : 'Seleccionar una imagen'}
                      </label>
                      {selectedPhotoFile && (
                          <button type="button" onClick={handlePhotoUpload} disabled={isUploadingPhoto} className="inline-flex items-center gap-x-1.5 rounded-md bg-indigo-100 px-3 py-2 text-sm font-semibold text-indigo-600 shadow-sm hover:bg-indigo-200 disabled:opacity-50">
                              <ArrowUpTrayIcon className="-ml-0.5 h-5 w-5"/>
                              {isUploadingPhoto ? "Subiendo..." : "Subir Ahora"}
                          </button>
                      )}
                      {photoUploadError && <p className="text-red-500 text-xs mt-1">{photoUploadError}</p>}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </form>
      
      {/* --- MODALES --- */}
      {/* Modal para Asignar/Editar Componentes (usando Headless UI Dialog) */}
        <Transition appear show={isComponentModalOpen} as={Fragment}>
            <Dialog as="div" className="relative z-10" onClose={closeComponentModal}>
                <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-black/25" />
                </Transition.Child>
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">{editingAssignedComponent ? 'Editar Asignación' : 'Asignar Componente'}</Dialog.Title>
                                 <form onSubmit={handleSubmitComponentForm} className="mt-4 space-y-4">
                                     <div>
                                        <label className="block text-sm font-medium text-gray-700">Componente</label>
                                        <CustomListbox 
                                            options={availableDefinitions.map(def => ({ value: def.id.toString(), label: `${def.name} (${def.component_type === 'earning' ? 'Asig.' : 'Deduc.'})` }))}
                                            value={componentFormData.component_definition_id}
                                            onChange={(val) => setComponentFormData(prev => ({...prev, component_definition_id: val}))}
                                            placeholder={isLoadingDefinitions ? "Cargando..." : "Seleccione una definición..."}
                                            disabled={isLoadingDefinitions || !!editingAssignedComponent}
                                        />
                                        {editingAssignedComponent && <p className="text-xs text-gray-500 mt-1">La definición no se puede cambiar. Para ello, elimine y cree una nueva asignación.</p>}
                                     </div>
                                      {componentFormData.component_definition_id && (() => { 
                                          const selectedDef = availableDefinitions.find(d => d.id.toString() === componentFormData.component_definition_id);
                                          if (!selectedDef) return null;
                                          if (selectedDef.calculation_type === 'fixed_amount') {
                                              return (
                                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                      <FormInput label="Valor Personalizado" type="number" name="override_value" value={componentFormData.override_value} onChange={handleComponentFormInputChange} step="0.01" placeholder={`Defecto: ${selectedDef.default_value ?? 'N/A'}`} />
                                                      <div>
                                                          <label className="block text-sm font-medium text-gray-700">Moneda</label>
                                                          <CustomListbox options={CURRENCIES_OPTIONS} value={componentFormData.override_currency} onChange={(val) => setComponentFormData(prev => ({...prev, override_currency: val}))} placeholder={`Defecto: ${selectedDef.default_currency || 'N/A'}`} />
                                                      </div>
                                                  </div>
                                              );
                                          } else if (selectedDef.calculation_type === 'percentage_of_base_salary') {
                                              return <FormInput label="Valor Personalizado (%)" type="number" name="override_value" value={componentFormData.override_value} onChange={handleComponentFormInputChange} step="0.0001" min="0" max="1" placeholder={`Ej: 0.1 para 10%. Defecto: ${(selectedDef.default_value * 100).toFixed(2)}%`} />;
                                          }
                                      })()}
                                      <Switch.Group as="div" className="flex items-center justify-between pt-2">
                                          <Switch.Label className="text-sm font-medium text-gray-700">Asignación Activa</Switch.Label>
                                          <Switch checked={componentFormData.is_active} onChange={(val) => setComponentFormData(p => ({...p, is_active: val}))} className={`${componentFormData.is_active ? 'bg-indigo-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}>
                                              <span className={`${componentFormData.is_active ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                                          </Switch>
                                      </Switch.Group>
                                     {formComponentError && <p className="text-red-500 text-sm text-center">{formComponentError}</p>}
                                     <div className="mt-6 flex justify-end space-x-3">
                                         <button type="button" onClick={closeComponentModal} className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Cancelar</button>
                                         <button type="submit" disabled={isSubmittingComponent || isLoadingDefinitions} className="inline-flex items-center justify-center gap-x-2 rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"> {isSubmittingComponent ? 'Guardando...' : 'Guardar'}</button>
                                     </div>
                                 </form>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>

      {/* Se mantienen los modales de Pago y Ajuste, que se asume ya están bien diseñados o son menos prioritarios */}
      <RecordEmployeePaymentModal isOpen={isRecordPaymentModalOpen} onClose={() => setIsRecordPaymentModalOpen(false)} token={token} employee={{id: parseInt(employeeId), full_name: `${formData.first_name} ${formData.last_name}`, current_balance_ves: parseFloat(formData.current_balance_ves || 0)}} onPaymentRecorded={handlePaymentSuccessfullyRecorded} />
      <EmployeeBalanceAdjustmentModal isOpen={isAdjustmentModalOpen} onClose={() => setIsAdjustmentModalOpen(false)} token={token} employee={{id: parseInt(employeeId), full_name: `${formData.first_name} ${formData.last_name}`, current_balance_ves: parseFloat(formData.current_balance_ves || 0)}} onAdjustmentRecorded={handleAdjustmentRecorded} />
    </div>
  );
}

export default EditEmployeePage;