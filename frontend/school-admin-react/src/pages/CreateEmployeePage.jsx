import React, { useState, useEffect, Fragment } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createEmployee, getPositions, uploadEmployeePhoto } from '../services/apiPersonnel';
import { toast } from 'react-toastify';

// --- Headless UI y Heroicons ---
import { Tab, Listbox, Switch, Transition } from '@headlessui/react';
import { 
    ArrowLeftIcon, UserCircleIcon, BriefcaseIcon, PhoneIcon, ChatBubbleBottomCenterTextIcon, CheckIcon, ChevronUpDownIcon,
    ExclamationTriangleIcon, PlusCircleIcon, PhotoIcon
} from '@heroicons/react/24/solid';

// --- Opciones y Constantes ---
const CONTRACT_TYPE_OPTIONS = [
    { value: "full_time", label: "Tiempo Completo" }, { value: "part_time", label: "Medio Tiempo" },
    { value: "hourly", label: "Por Horas" }, { value: "internship", label: "Pasantía" },
    { value: "temporary", label: "Temporal" }, { value: "indefinite", label: "Indefinido" },
    { value: "other", label: "Otro" },
];
const GENDER_OPTIONS = [
    { value: "Masculino", label: "Masculino" }, { value: "Femenino", label: "Femenino" },
    { value: "Otro", label: "Otro" }, { value: "Prefiero no decirlo", label: "Prefiero no decirlo"}
];
const initialFormData = {
  first_name: '', last_name: '', identity_document: '', birth_date: '',
  gender: '', address: '', primary_phone: '', secondary_phone: '',
  personal_email: '', emergency_contact_name: '', emergency_contact_phone: '',
  emergency_contact_relationship: '', employee_code: '', position_id: '',
  hire_date: new Date().toISOString().split('T')[0],
  termination_date: '', contract_type: 'indefinite', user_id: '',
  photo_url: '', additional_notes: '', is_active: true,
  // --- INICIO DE MODIFICACIÓN: Añadimos campos salariales al estado inicial ---
  base_salary_amount: '', 
  base_salary_currency: 'VES', 
  pay_frequency: 'monthly', 
  hourly_rate: '',
  // --- FIN DE MODIFICACIÓN ---
};
const CURRENCIES_OPTIONS = [
    { value: "VES", label: "VES (Bolívares)" }, { value: "USD", label: "USD (Dólares)" }, { value: "EUR", label: "EUR (Euros)" },
];


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

const FormInput = ({ label, id, ...props }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium leading-6 text-gray-900">
      {label}
    </label>
        <div className="mt-2">
            <input id={id} {...props} className="block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" />
        </div>
    </div>
);


// --- Componente Principal ---
function CreateEmployeePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState(initialFormData);
  const [positions, setPositions] = useState([]);
  const [isLoadingPositions, setIsLoadingPositions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);


  useEffect(() => {
    const fetchPositionsForSelect = async () => {
      if (!token) return;
      setIsLoadingPositions(true);
      try {
        const data = await getPositions(token, { limit: 200 }); 
        setPositions(data.items || []);
      } catch (err) {
        toast.error("Error al cargar cargos (posiciones) para el selector.");
        setPositions([]);
      } finally {
        setIsLoadingPositions(false);
      }
    };
    fetchPositionsForSelect();
  }, [token]);

  useEffect(() => {
    return () => {
        if (photoPreview) {
            URL.revokeObjectURL(photoPreview);
        }
    }
  }, [photoPreview]);

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
    const file = e.target.files && e.target.files[0];
    if (file) {
        if (photoPreview) {
            URL.revokeObjectURL(photoPreview);
        }
        setSelectedPhotoFile(file);
        setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) { toast.error("Autenticación requerida."); return; }

    if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.identity_document.trim() || !formData.primary_phone.trim() || !formData.hire_date) {
        toast.warn("Nombres, apellidos, documento de identidad, teléfono principal y fecha de ingreso son obligatorios.");
        setFormError("Complete todos los campos obligatorios (*).");
        return;
    }
    if (!formData.position_id) {
        toast.warn("Debe seleccionar un cargo (posición) para el empleado.");
        setFormError("El cargo es obligatorio.");
        return;
    }

    // --- INICIO DE MODIFICACIÓN: Nueva lógica de validación para salario ---
    if (!formData.pay_frequency) {
        toast.warn("Debe seleccionar una frecuencia de pago.");
        setFormError("La frecuencia de pago es obligatoria.");
        return;
    }

    if (formData.pay_frequency === 'hourly') {
        if (!formData.hourly_rate || parseFloat(formData.hourly_rate) <= 0) {
            toast.warn("Para empleados por hora, la tarifa por hora es obligatoria y debe ser positiva.");
            setFormError("Tarifa por hora inválida.");
            return;
        }
    } else { // mensual o quincenal
        if (!formData.base_salary_amount || parseFloat(formData.base_salary_amount) <= 0) {
            toast.warn("Para empleados con salario, el monto del salario base es obligatorio y debe ser positivo.");
            setFormError("Monto de salario base inválido.");
            return;
        }
    }

    if ((formData.base_salary_amount || formData.hourly_rate) && !formData.base_salary_currency) {
         toast.warn("Debe seleccionar una moneda para el salario o tarifa.");
         setFormError("La moneda del salario es obligatoria.");
         return;
    }
    // --- FIN DE MODIFICACIÓN ---

    setIsSubmitting(true);
    setFormError(null);

    const payload = {
      first_name: formData.first_name, last_name: formData.last_name,
      identity_document: formData.identity_document,
      birth_date: formData.birth_date || null, gender: formData.gender || null,
      address: formData.address || null, primary_phone: formData.primary_phone,
      secondary_phone: formData.secondary_phone || null, personal_email: formData.personal_email || null,
      emergency_contact_name: formData.emergency_contact_name || null,
      emergency_contact_phone: formData.emergency_contact_phone || null,
      emergency_contact_relationship: formData.emergency_contact_relationship || null,
      employee_code: formData.employee_code || null,
      position_id: parseInt(formData.position_id), hire_date: formData.hire_date,
      contract_type: formData.contract_type || null,
      user_id: formData.user_id ? parseInt(formData.user_id) : null,
      additional_notes: formData.additional_notes || null, is_active: formData.is_active,
      // --- INICIO DE MODIFICACIÓN: Añadir campos de salario al payload ---
      base_salary_amount: formData.pay_frequency !== 'hourly' && formData.base_salary_amount ? parseFloat(formData.base_salary_amount) : null,
      base_salary_currency: (formData.base_salary_amount || formData.hourly_rate) ? formData.base_salary_currency : null,
      pay_frequency: formData.pay_frequency,
      hourly_rate: formData.pay_frequency === 'hourly' && formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
      // --- FIN DE MODIFICACIÓN ---
    };
    
    try {
      const newEmployee = await createEmployee(token, payload);
      
      if (selectedPhotoFile) {
        try {
            await uploadEmployeePhoto(token, newEmployee.id, selectedPhotoFile);
            toast.success(`Empleado "${newEmployee.full_name}" creado y foto subida exitosamente!`);
        } catch (photoError) {
            toast.warn(`Empleado creado, pero la foto no se pudo subir: ${photoError.message}`);
        }
      } else {
        toast.success(`Empleado "${newEmployee.full_name}" creado exitosamente!`);
      }
      
      navigate(`/personnel/employees/${newEmployee.id}/edit`);

    } catch (err) {
      const errorMessage = err.message || "Ocurrió un error al crear el empleado.";
      setFormError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };


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
              Registrar Nuevo Empleado
            </h1>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Columna Izquierda y Central (Formulario) */}
            <div className="xl:col-span-2 space-y-8">
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
                        <FormInput label="Nombres*" id="first_name" name="first_name" type="text" value={formData.first_name} onChange={handleInputChange} required />
                        <FormInput label="Apellidos*" id="last_name" name="last_name" type="text" value={formData.last_name} onChange={handleInputChange} required />
                        <FormInput label="Documento de Identidad*" id="identity_document" name="identity_document" type="text" value={formData.identity_document} onChange={handleInputChange} required placeholder="Ej: V12345678, E87654321" />
                        <FormInput label="Fecha de Nacimiento" id="birth_date" name="birth_date" type="date" value={formData.birth_date} onChange={handleInputChange} />
                        <div>
                           <label className="block text-sm font-medium leading-6 text-gray-900">Género</label>
                           <CustomListbox options={GENDER_OPTIONS} value={formData.gender} onChange={(val) => handleListboxChange('gender', val)} placeholder="Seleccionar género..." />
                        </div>
                        <div className="sm:col-span-2">
                           <label htmlFor="address" className="block text-sm font-medium leading-6 text-gray-900">Dirección</label>
                           <textarea name="address" id="address" value={formData.address} onChange={handleInputChange} rows="3" className="mt-2 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"></textarea>
                        </div>
                        <FormInput label="Teléfono Principal*" id="primary_phone" name="primary_phone" type="tel" value={formData.primary_phone} onChange={handleInputChange} required />
                        <FormInput label="Teléfono Secundario" id="secondary_phone" name="secondary_phone" type="tel" value={formData.secondary_phone} onChange={handleInputChange} />
                        <div className="sm:col-span-2"><FormInput label="Email Personal" id="personal_email" name="personal_email" type="email" value={formData.personal_email} onChange={handleInputChange} /></div>
                      </div>
                     </Tab.Panel>
                    
                    {/* Panel de Información Laboral y Salarial */}
                    <Tab.Panel className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <FormInput label="Código de Empleado" id="employee_code" name="employee_code" type="text" value={formData.employee_code} onChange={handleInputChange} />
                        <div>
                           <label className="block text-sm font-medium leading-6 text-gray-900">Cargo (Posición)*</label>
                          <CustomListbox options={positions.map(p => ({value: p.id.toString(), label: `${p.name} (${p.department?.name})`}))} value={formData.position_id} onChange={(val) => handleListboxChange('position_id', val)} placeholder={isLoadingPositions ? "Cargando..." : "Seleccione cargo..."} disabled={isLoadingPositions} />
                        </div>
                        <FormInput label="Fecha de Ingreso*" id="hire_date" name="hire_date" type="date" value={formData.hire_date} onChange={handleInputChange} required />
                        <div>
                          <label className="block text-sm font-medium leading-6 text-gray-900">Tipo de Contrato</label>
                           <CustomListbox options={CONTRACT_TYPE_OPTIONS} value={formData.contract_type} onChange={(val) => handleListboxChange('contract_type', val)} placeholder="Seleccionar contrato..." />
                        </div>
                        <FormInput label="ID Usuario del Sistema (Opcional)" id="user_id" name="user_id" type="number" value={formData.user_id} onChange={handleInputChange} placeholder="ID numérico si tendrá acceso" />
                        
                        {/* --- INICIO DE MODIFICACIÓN: Añadimos campos de salario --- */}
                        <div className="sm:col-span-2 pt-4 mt-4 border-t border-gray-200">
                            <p className="text-md font-semibold text-gray-800">Configuración Salarial Base*</p>
                        </div>

                         <div>
                            <label className="block text-sm font-medium leading-6 text-gray-900">Frecuencia de Pago*</label>
                            <CustomListbox options={[{value: 'monthly', label: 'Mensual'}, {value: 'fortnightly', label: 'Quincenal'}, {value: 'hourly', label: 'Por Hora'}]} value={formData.pay_frequency} onChange={(val) => handleListboxChange('pay_frequency', val)} placeholder="Seleccionar frecuencia..." />
                        </div>
                         <div>
                            <label className="block text-sm font-medium leading-6 text-gray-900">Moneda Salario/Tarifa*</label>
                            <CustomListbox options={CURRENCIES_OPTIONS} value={formData.base_salary_currency} onChange={(val) => handleListboxChange('base_salary_currency', val)} placeholder="Seleccionar moneda..." />
                        </div>

                        {formData.pay_frequency === 'hourly' ? (
                            <FormInput label="Tarifa por Hora*" id="hourly_rate" name="hourly_rate" type="number" value={formData.hourly_rate} onChange={handleInputChange} min="0" step="0.01" required />
                        ) : (
                            <FormInput label="Monto Salario Base*" id="base_salary_amount" name="base_salary_amount" type="number" value={formData.base_salary_amount} onChange={handleInputChange} min="0" step="0.01" required />
                        )}
                        {/* --- FIN DE MODIFICACIÓN --- */}

                      </div>
                    </Tab.Panel>
                    
                    {/* Panel de Contacto de Emergencia */}
                     <Tab.Panel className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                      <FormInput label="Nombre de Contacto" id="emergency_contact_name" name="emergency_contact_name" type="text" value={formData.emergency_contact_name} onChange={handleInputChange} />
                      <FormInput label="Teléfono de Contacto" id="emergency_contact_phone" name="emergency_contact_phone" type="tel" value={formData.emergency_contact_phone} onChange={handleInputChange} />
                      <FormInput label="Parentesco" id="emergency_contact_relationship" name="emergency_contact_relationship" type="text" value={formData.emergency_contact_relationship} onChange={handleInputChange} />
                    </Tab.Panel>
                    
                    {/* Panel de Otros */}
                    <Tab.Panel className="space-y-6">
                       <div>
                        <label htmlFor="additional_notes" className="block text-sm font-medium leading-6 text-gray-900">Notas Adicionales</label>
                        <textarea name="additional_notes" id="additional_notes" value={formData.additional_notes} onChange={handleInputChange} rows="4" className="mt-2 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"></textarea>
                       </div>
                      <Switch.Group as="div" className="flex items-center justify-between">
                        <span className="flex-grow flex flex-col">
                           <Switch.Label as="span" className="text-sm font-medium leading-6 text-gray-900" passive>Empleado Activo</Switch.Label>
                          <Switch.Description as="span" className="text-sm text-gray-500">El empleado estará activo por defecto al ser creado.</Switch.Description>
                        </span>
                        <Switch checked={formData.is_active} onChange={(val) => handleSwitchChange('is_active', val)} className={`${formData.is_active ? 'bg-indigo-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75`}>
                          <span className={`${formData.is_active ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
                         </Switch>
                      </Switch.Group>
                    </Tab.Panel>
                  </Tab.Panels>
                </Tab.Group>
              </div>
            </div>

            {/* Columna Derecha (Acciones y Foto) */}
            <div className="xl:col-span-1">
              <div className="sticky top-8 space-y-8">
                <div className="bg-white p-6 rounded-xl shadow-sm">
                   <h3 className="text-lg font-semibold text-gray-900">Acciones</h3>
                    {formError && (
                    <div className="mt-4 flex items-start gap-x-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
                        <p>{formError}</p>
                    </div>
                    )}
                    <div className="mt-6 space-y-4">
                     <button type="submit" disabled={isSubmitting || isLoadingPositions} className="w-full inline-flex items-center justify-center gap-x-2 rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-indigo-300 disabled:cursor-wait">
                        <PlusCircleIcon className="w-5 h-5" />
                        {isSubmitting ? 'Creando Empleado...' : 'Crear Empleado'}
                    </button>
                    <Link to="/personnel/employees" className="w-full block text-center rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
                        Cancelar
                     </Link>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><PhotoIcon className="w-5 h-5 text-gray-400"/> Foto de Perfil</h3>
                  <div className="mt-4 flex flex-col items-center gap-4">
                      <img src={photoPreview || "/placeholder-avatar.png"} alt="Previsualización de perfil" className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"/>
                      <input type="file" name="photo_file" id="photo_file_emp_create" accept="image/*" onChange={handlePhotoFileChange} className="sr-only"/>
                       <label htmlFor="photo_file_emp_create" className="cursor-pointer text-sm font-semibold text-indigo-600 hover:text-indigo-500">
                          {selectedPhotoFile ? `Archivo: ${selectedPhotoFile.name}` : 'Seleccionar una imagen (Opcional)'}
                      </label>
                      {selectedPhotoFile && (
                        <button type="button" onClick={() => { setSelectedPhotoFile(null); setPhotoPreview(null); }} className="text-xs text-red-600 hover:text-red-800">
                            Quitar imagen
                         </button>
                      )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default CreateEmployeePage;