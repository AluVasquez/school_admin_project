import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSchoolConfiguration, updateSchoolConfiguration } from '../services/apiSettings';
import { getExchangeRates, createExchangeRate, updateExchangeRate, deleteExchangeRate } from '../services/apiExchangeRates';
import { getAllAdminUsers, createAdminUser, updateAdminUserDetails } from '../services/apiAuth';
import Modal from '../components/Modal';
import { toast } from 'react-toastify';

// --- Iconos SVG para la UI ---
const BuildingIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" ry="2"/><path d="M12 12h.01"/></svg>;
const ReceiptIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h6"/><path d="M12 17.5v-11"/></svg>;
const CoinsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82-.71-.71z"/></svg>;
const UsersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const InfoIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>;

// --- Formularios y datos iniciales ---
const initialSchoolConfigFormData = {
    school_name: '', school_rif: '', school_address: '', school_phone: '',
    billing_email: '', current_period_name: '', payment_due_day: 5,
    internal_invoice_reference_prefix: '', next_internal_invoice_reference: 1,
    default_iva_percentage: 0.16, document_logo_url: '', invoice_terms_and_conditions: '',
    fiscal_printer_brand: '', fiscal_printer_port: '',
    imprenta_digital_api_url: '', imprenta_digital_api_key: '', imprenta_digital_api_token: ''
};

const initialRateFormData = {
    from_currency: 'USD', to_currency: 'VES', rate: '',
    rate_date: new Date().toISOString().split('T')[0],
};

const initialUserFormData = {
    email: '', full_name: '', password: '', confirm_password: '',
    is_active: true, is_superuser: false,
};

// --- Helpers ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-VE', {day: '2-digit', month: '2-digit', year: 'numeric'});
};

// --- Validación de Email ---
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function SettingsPage() {
    const { token, user } = useAuth();

    // --- Estados ---
    const [activeTab, setActiveTab] = useState(user?.is_superuser ? 'general' : 'rates');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Para colapsar sidebar en móvil

    // Configuración Escuela
    const [configFormData, setConfigFormData] = useState(initialSchoolConfigFormData);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Tasas de Cambio
    const [exchangeRates, setExchangeRates] = useState([]);
    const [isLoadingRates, setIsLoadingRates] = useState(false);
    const [isRateModalOpen, setIsRateModalOpen] = useState(false);
    const [editingRate, setEditingRate] = useState(null);
    const [rateFormData, setRateFormData] = useState(initialRateFormData);
    const [isSubmittingRate, setIsSubmittingRate] = useState(false);
    const [currentRatePage, setCurrentRatePage] = useState(1);
    const [ratesLimitPerPage] = useState(5);
    const [totalRatePages, setTotalRatePages] = useState(0);

    // Usuarios Admin
    const [adminUsers, setAdminUsers] = useState([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [userFormData, setUserFormData] = useState(initialUserFormData);
    const [isSubmittingUser, setIsSubmittingUser] = useState(false);
    const [userCurrentPage, setUserCurrentPage] = useState(1);
    const [userLimitPerPage] = useState(10);
    const [userTotalPages, setUserTotalPages] = useState(0);

    // --- Carga de Datos ---
    const loadAllData = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            // Fetch configuration and rates for all users
            const [configData, ratesData] = await Promise.all([
                getSchoolConfiguration(token),
                getExchangeRates(token, { skip: (currentRatePage - 1) * ratesLimitPerPage, limit: ratesLimitPerPage }),
            ]);

            if (configData) setConfigFormData(prev => ({ ...prev, ...configData }));
            if (ratesData) {
                setExchangeRates(ratesData.items || []);
                setTotalRatePages(ratesData.pages || 0);
            }

            // Fetch admin users only if the current user is a superuser
            if (user?.is_superuser) {
                const usersData = await getAllAdminUsers(token, { skip: (userCurrentPage - 1) * userLimitPerPage, limit: userLimitPerPage });
                if (usersData) {
                    setAdminUsers(usersData.items || []);
                    setUserTotalPages(usersData.pages || 0);
                }
            } else {
                // Clear admin users data if not a superuser
                setAdminUsers([]);
                setUserTotalPages(0);
            }
        } catch (err) {
            toast.error(`Error al cargar datos: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, user?.is_superuser, currentRatePage, ratesLimitPerPage, userCurrentPage, userLimitPerPage]);


    useEffect(() => {
        loadAllData();
    }, [loadAllData]);

    // --- Manejadores de Eventos ---
    const handleConfigInputChange = (e) => setConfigFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleRateInputChange = (e) => setRateFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleUserInputChange = (e) => setUserFormData(prev => ({...prev, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

    const handleConfigSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const dataToSubmit = {
                ...configFormData,
                payment_due_day: parseInt(configFormData.payment_due_day, 10) || null,
                next_internal_invoice_reference: parseInt(configFormData.next_internal_invoice_reference, 10) || 1,
                default_iva_percentage: parseFloat(configFormData.default_iva_percentage) || 0,
            };
            await updateSchoolConfiguration(token, dataToSubmit);
            toast.success("Configuración guardada.");
        } catch (err) {
            toast.error(`Error al guardar: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const openRateModalForCreate = () => { setEditingRate(null); setRateFormData(initialRateFormData); setIsRateModalOpen(true); };
    const openRateModalForEdit = (rate) => { setEditingRate(rate); setRateFormData({ ...rate, rate_date: rate.rate_date.split('T')[0] }); setIsRateModalOpen(true); };
    const closeRateModal = () => setIsRateModalOpen(false);
    const handleSubmitRateForm = async (e) => {
        e.preventDefault();
        setIsSubmittingRate(true);
        try {
            const payload = { ...rateFormData, rate: parseFloat(rateFormData.rate) };
            if (editingRate) {
                await updateExchangeRate(token, editingRate.id, payload);
                toast.success("Tasa actualizada.");
            } else {
                await createExchangeRate(token, payload);
                toast.success("Tasa creada.");
            }
            closeRateModal();
            loadAllData();
        } catch (err) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setIsSubmittingRate(false);
        }
    };
    const handleDeleteRate = async (rateId) => {
        if (window.confirm("¿Está seguro de eliminar esta tasa?")) {
            try {
                await deleteExchangeRate(token, rateId);
                toast.success("Tasa eliminada.");
                loadAllData();
            } catch (err) {
                toast.error(err.message);
            }
        }
    };
    const handleRatePageChange = (newPage) => { if (newPage >= 1 && newPage <= totalRatePages) setCurrentRatePage(newPage); };

    const openUserModalForCreate = () => { setEditingUser(null); setUserFormData(initialUserFormData); setIsUserModalOpen(true); };
    const openUserModalForEdit = (user) => { setEditingUser(user); setUserFormData({...user, password: '', confirm_password: ''}); setIsUserModalOpen(true); };
    const closeUserModal = () => setIsUserModalOpen(false);
    const handleSubmitUserForm = async (e) => {
        e.preventDefault();
        if (!editingUser && userFormData.password !== userFormData.confirm_password) {
            toast.error("Las contraseñas no coinciden."); return;
        }
        setIsSubmittingUser(true);
        try {
            if (editingUser) {
                await updateAdminUserDetails(token, editingUser.id, { full_name: userFormData.full_name, is_active: userFormData.is_active, is_superuser: userFormData.is_superuser });
                toast.success("Usuario actualizado.");
            } else {
                await createAdminUser(token, userFormData);
                toast.success("Usuario creado.");
            }
            closeUserModal();
            loadAllData();
        } catch (err) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setIsSubmittingUser(false);
        }
    };
    const handleUserPageChange = (newPage) => { if (newPage >= 1 && newPage <= userTotalPages) setUserCurrentPage(newPage); };

    // --- Renderizado por Pestaña ---
    const renderContent = () => {
        if (isLoading) {
            return <div className="text-center p-10"><p className="text-gray-600">Cargando configuración...</p></div>;
        }
        switch (activeTab) {
            case 'general': return user?.is_superuser ? <GeneralSettingsView data={configFormData} onChange={handleConfigInputChange} onSubmit={handleConfigSubmit} isSubmitting={isSubmitting} /> : null;
            case 'billing': return user?.is_superuser ? <BillingSettingsView data={configFormData} onChange={handleConfigInputChange} onSubmit={handleConfigSubmit} isSubmitting={isSubmitting} /> : null;
            case 'rates': return <RatesSettingsView rates={exchangeRates} page={currentRatePage} totalPages={totalRatePages} onPageChange={handleRatePageChange} onAdd={openRateModalForCreate} onEdit={openRateModalForEdit} onDelete={handleDeleteRate} />;
            case 'users': return user?.is_superuser ? <UsersSettingsView users={adminUsers} currentUser={user} page={userCurrentPage} totalPages={userTotalPages} onPageChange={handleUserPageChange} onAdd={openUserModalForCreate} onEdit={openUserModalForEdit} /> : null;
            default: return null;
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-6 bg-gray-100 min-h-screen">
            <header className="mb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Configuración</h1>
                        <p className="text-sm text-gray-600 mt-1">Gestiona los ajustes de tu institución y sistema.</p>
                    </div>
                    <button className="md:hidden p-2 rounded-md bg-gray-200" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
                    </button>
                </div>
            </header>

            <div className="flex flex-col md:flex-row gap-6">
                {/* Navegación Lateral */}
                <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 md:w-1/5 bg-white shadow-lg transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out`}>
                    <div className="p-4 border-b flex justify-between items-center md:hidden">
                        <h2 className="text-lg font-semibold">Menú</h2>
                        <button onClick={() => setIsSidebarOpen(false)} className="text-gray-600">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <nav className="p-4 space-y-2">
                        {user?.is_superuser && <TabButton icon={<BuildingIcon />} label="General" tabName="general" activeTab={activeTab} onClick={setActiveTab} />}
                        {user?.is_superuser && <TabButton icon={<ReceiptIcon />} label="Facturación" tabName="billing" activeTab={activeTab} onClick={setActiveTab} />}
                        <TabButton icon={<CoinsIcon />} label="Tasas de Cambio" tabName="rates" activeTab={activeTab} onClick={setActiveTab} />
                        {user?.is_superuser && <TabButton icon={<UsersIcon />} label="Usuarios Admin" tabName="users" activeTab={activeTab} onClick={setActiveTab} />}
                    </nav>
                </aside>
                {isSidebarOpen && <div className="fixed inset-0 bg-black opacity-50 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>}

                {/* Contenido Principal */}
                <main className="flex-1">
                    {renderContent()}
                </main>
            </div>

            {/* Modales */}
            {isRateModalOpen && <RateModal isOpen={isRateModalOpen} onClose={closeRateModal} isEditing={!!editingRate} formData={rateFormData} onFormChange={handleRateInputChange} onSubmit={handleSubmitRateForm} isSubmitting={isSubmittingRate} />}
            {isUserModalOpen && <UserModal isOpen={isUserModalOpen} onClose={closeUserModal} isEditing={!!editingUser} formData={userFormData} onFormChange={handleUserInputChange} onSubmit={handleSubmitUserForm} isSubmitting={isSubmittingUser} currentUser={user} />}
        </div>
    );
}

// --- Componentes hijos ---
const TabButton = ({ icon, label, tabName, activeTab, onClick }) => (
    <button
        onClick={() => onClick(tabName)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === tabName ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100 hover:text-indigo-600'}`}
        title={label}
    >
        {icon}
        <span>{label}</span>
    </button>
);

const SectionCard = ({ title, description, children }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6">
        <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-600 mt-1 mb-4">{description}</p>
        {children}
    </div>
);

const GeneralSettingsView = ({ data, onChange, onSubmit, isSubmitting }) => (
    <div>
        <SectionCard title="Datos de la Institución" description="Información fiscal y de contacto de la escuela.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="school_name" className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Escuela*</label>
                    <input type="text" name="school_name" value={data.school_name || ''} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" required />
                </div>
                <div>
                    <label htmlFor="school_rif" className="block text-sm font-medium text-gray-700 mb-1">RIF de la Escuela*</label>
                    <input type="text" name="school_rif" value={data.school_rif || ''} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" required />
                </div>
                <div className="md:col-span-2">
                    <label htmlFor="school_address" className="block text-sm font-medium text-gray-700 mb-1">Dirección Fiscal*</label>
                    <textarea name="school_address" value={data.school_address || ''} onChange={onChange} rows="3" className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" required />
                </div>
                <div>
                    <label htmlFor="school_phone" className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                    <input type="text" name="school_phone" value={data.school_phone || ''} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                    <label htmlFor="billing_email" className="block text-sm font-medium text-gray-700 mb-1">Email para Facturación*</label>
                    <input type="email" name="billing_email" value={data.billing_email || ''} onChange={onChange} className={`w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 ${!isValidEmail(data.billing_email) && data.billing_email ? 'border-red-500' : 'border-gray-300'}`} required />
                    {!isValidEmail(data.billing_email) && data.billing_email && <p className="text-red-500 text-xs mt-1">Ingrese un email válido.</p>}
                </div>
            </div>
        </SectionCard>
        <SectionCard title="Período y Pagos" description="Configuración del ciclo escolar y parámetros de pago.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label htmlFor="current_period_name" className="block text-sm font-medium text-gray-700 mb-1">Nombre del Período*</label>
                    <input type="text" name="current_period_name" value={data.current_period_name || ''} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="Ej: Año Escolar 2024-2025" required />
                </div>
                <div>
                    <label htmlFor="payment_due_day" className="block text-sm font-medium text-gray-700 mb-1">Día Vencimiento (1-28)*</label>
                    <input type="number" name="payment_due_day" value={data.payment_due_day || ''} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" min="1" max="28" required />
                </div>
                <div>
                    <label htmlFor="default_iva_percentage" className="block text-sm font-medium text-gray-700 mb-1">IVA por Defecto*</label>
                    <input type="number" name="default_iva_percentage" value={data.default_iva_percentage || ''} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" step="0.01" min="0" max="1" placeholder="Ej: 0.16" required />
                </div>
            </div>
        </SectionCard>
        <div className="flex justify-end">
            <button onClick={onSubmit} disabled={isSubmitting} className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors">{isSubmitting ? 'Guardando...' : 'Guardar'}</button>
        </div>
    </div>
);

const BillingSettingsView = ({ data, onChange, onSubmit, isSubmitting }) => (
    <div>
        <SectionCard title="Correlativos y Documentos" description="Control sobre la numeración y contenido de las facturas.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="internal_invoice_reference_prefix" className="block text-sm font-medium text-gray-700 mb-1">Prefijo Factura</label>
                    <input type="text" name="internal_invoice_reference_prefix" value={data.internal_invoice_reference_prefix || ''} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="Ej: FAC-" />
                </div>
                <div>
                    <label htmlFor="next_internal_invoice_reference" className="block text-sm font-medium text-gray-700 mb-1">Siguiente Nro. Factura*</label>
                    <input type="number" name="next_internal_invoice_reference" value={data.next_internal_invoice_reference || 1} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" min="1" required />
                </div>
                <div className="md:col-span-2">
                    <label htmlFor="invoice_terms_and_conditions" className="block text-sm font-medium text-gray-700 mb-1">Términos y Condiciones</label>
                    <textarea name="invoice_terms_and_conditions" value={data.invoice_terms_and_conditions || ''} onChange={onChange} rows="3" className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
            </div>
        </SectionCard>
        <SectionCard title="Integraciones de Emisión Fiscal" description="Conecte sus dispositivos y servicios de facturación autorizados.">
            <div className="space-y-6">
                <div>
                    <h4 className="font-semibold text-gray-800 mb-2">Impresora Fiscal</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="fiscal_printer_brand" className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                            <select name="fiscal_printer_brand" value={data.fiscal_printer_brand || ''} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500">
                                <option value="">No Usar</option>
                                <option value="EPSON">Epson</option>
                                <option value="BIXOLON">Bixolon</option>
                                <option value="OTHER">Otra</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="fiscal_printer_port" className="block text-sm font-medium text-gray-700 mb-1">Puerto</label>
                            <input type="text" name="fiscal_printer_port" value={data.fiscal_printer_port || ''} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="Ej: COM3" />
                        </div>
                    </div>
                </div>
                <div className="border-t pt-6">
                    <h4 className="font-semibold text-gray-800 mb-2">Imprenta Digital</h4>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="imprenta_digital_api_url" className="block text-sm font-medium text-gray-700 mb-1">URL API</label>
                            <input type="url" name="imprenta_digital_api_url" value={data.imprenta_digital_api_url || ''} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div>
                            <label htmlFor="imprenta_digital_api_key" className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                            <input type="password" name="imprenta_digital_api_key" value={data.imprenta_digital_api_key || ''} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="••••••••" />
                        </div>
                        <div>
                            <label htmlFor="imprenta_digital_api_token" className="block text-sm font-medium text-gray-700 mb-1">API Token/Secret</label>
                            <input type="password" name="imprenta_digital_api_token" value={data.imprenta_digital_api_token || ''} onChange={onChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="••••••••" />
                        </div>
                    </div>
                </div>
            </div>
        </SectionCard>
        <div className="flex justify-end">
            <button onClick={onSubmit} disabled={isSubmitting} className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors">{isSubmitting ? 'Guardando...' : 'Guardar'}</button>
        </div>
    </div>
);

const RatesSettingsView = ({ rates, page, totalPages, onPageChange, onAdd, onEdit, onDelete }) => (
    <SectionCard title="Gestión de Tasas de Cambio" description="Mantenga un registro histórico de las tasas de cambio para conversiones monetarias.">
        <div className="flex justify-end mb-4">
            <button onClick={onAdd} className="px-4 py-2 bg-green-600 text-white rounded-md font-semibold hover:bg-green-700 transition-colors">+ Añadir Tasa</button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full bg-white">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600">Fecha</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600">De</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600">A</th>
                        <th className="py-3 px-4 text-right text-xs font-semibold text-gray-600">Tasa</th>
                        <th className="py-3 px-4 text-right text-xs font-semibold text-gray-600">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {rates.length > 0 ? rates.map(rate => (
                        <tr key={rate.id} className="hover:bg-slate-200">
                            <td className="py-3 px-4 text-sm text-gray-900">{formatDate(rate.rate_date)}</td>
                            <td className="py-3 px-4 text-sm text-gray-900">{rate.from_currency}</td>
                            <td className="py-3 px-4 text-sm text-gray-900">{rate.to_currency}</td>
                            <td className="py-3 px-4 text-sm text-gray-900 text-right">{rate.rate}</td>
                            <td className="py-3 px-4 text-right space-x-3">
                                <button onClick={() => onEdit(rate)} className="text-indigo-600 hover:text-indigo-800">Editar</button>
                                <button onClick={() => onDelete(rate.id)} className="text-red-600 hover:text-red-800">Eliminar</button>
                            </td>
                        </tr>
                    )) : (
                        <tr>
                            <td colSpan="5" className="py-4 text-center text-gray-500">No hay tasas registradas.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
        {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4 text-sm">
                <p>Página {page} de {totalPages}</p>
                <div className="space-x-2">
                    <button onClick={() => onPageChange(1)} disabled={page <= 1} className="px-2 py-1 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50">Primera</button>
                    <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="px-2 py-1 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50">Anterior</button>
                    <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="px-2 py-1 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50">Siguiente</button>
                    <button onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} className="px-2 py-1 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50">Última</button>
                </div>
            </div>
        )}
    </SectionCard>
);

const UsersSettingsView = ({ users, currentUser, page, totalPages, onPageChange, onAdd, onEdit }) => (
    <SectionCard title="Usuarios Administradores" description="Gestione las cuentas con acceso al panel de administración.">
        <div className="flex justify-end mb-4">
            <button onClick={onAdd} className="px-4 py-2 bg-green-600 font-semibold text-white rounded-md hover:bg-green-700 transition-colors">+ Crear Usuario</button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full bg-white">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600">Email</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600">Nombre</th>
                        <th className="py-3 px-4 text-center text-xs font-semibold text-gray-600">Activo</th>
                        <th className="py-3 px-4 text-center text-xs font-semibold text-gray-600">Superusuario</th>
                        <th className="py-3 px-4 text-right text-xs font-semibold text-gray-600">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {users.map(u => (
                        <tr key={u.id} className="hover:bg-slate-200">
                            <td className="py-3 px-4 text-sm text-gray-900">{u.email}</td>
                            <td className="py-3 px-4 text-sm text-gray-900">{u.full_name || '-'}</td>
                            <td className="py-3 px-4 text-center"><span className={`px-2 py-0.5 text-xs rounded-full ${u.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{u.is_active ? 'Sí' : 'No'}</span></td>
                            <td className="py-3 px-4 text-center"><span className={`px-2 py-0.5 text-xs rounded-full ${u.is_superuser ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>{u.is_superuser ? 'Sí' : 'No'}</span></td>
                            <td className="py-3 px-4 text-right">
                                <button onClick={() => onEdit(u)} className="text-indigo-600 hover:text-indigo-800">Editar</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4 text-sm">
                <p>Página {page} de {totalPages}</p>
                <div className="space-x-2">
                    <button onClick={() => onPageChange(1)} disabled={page <= 1} className="px-2 py-1 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50">Primera</button>
                    <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="px-2 py-1 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50">Anterior</button>
                    <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="px-2 py-1 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50">Siguiente</button>
                    <button onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} className="px-2 py-1 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50">Última</button>
                </div>
            </div>
        )}
    </SectionCard>
);

const RateModal = ({ isOpen, onClose, isEditing, formData, onFormChange, onSubmit, isSubmitting }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Tasa de Cambio' : 'Añadir Nueva Tasa'}>
        <div className="space-y-4">
            <p className="text-sm text-gray-600 flex items-center"><InfoIcon /> Las tasas se usan para conversiones monetarias en la fecha especificada.</p>
            <div>
                <label htmlFor="rate_date" className="block text-sm font-medium text-gray-700 mb-1">Fecha de la Tasa*</label>
                <input type="date" name="rate_date" value={formData.rate_date.split('T')[0]} onChange={onFormChange} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="from_currency" className="block text-sm font-medium text-gray-700 mb-1">De*</label>
                    <select name="from_currency" value={formData.from_currency} onChange={onFormChange} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500">
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="to_currency" className="block text-sm font-medium text-gray-700 mb-1">A*</label>
                    <input type="text" value="VES" readOnly className="w-full p-2 border border-gray-300 rounded-md bg-gray-100" />
                </div>
            </div>
            <div>
                <label htmlFor="rate" className="block text-sm font-medium text-gray-700 mb-1">Tasa (1 Moneda Origen = X VES)*</label>
                <input type="number" name="rate" value={formData.rate} onChange={onFormChange} required min="0.000001" step="any" placeholder="Ej: 36.5012" className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div className="pt-4 flex justify-end space-x-3 border-t">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors">Cancelar</button>
                <button onClick={onSubmit} disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors">{isSubmitting ? 'Guardando...' : 'Guardar'}</button>
            </div>
        </div>
    </Modal>
);

const UserModal = ({ isOpen, onClose, isEditing, formData, onFormChange, onSubmit, isSubmitting, currentUser }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? `Editar Usuario: ${formData.email}` : 'Crear Nuevo Administrador'}>
        <div className="space-y-4">
            <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email*</label>
                <input type="email" name="email" value={formData.email} onChange={onFormChange} required disabled={isEditing} className={`w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 ${isEditing ? 'bg-gray-100' : 'border-gray-300'} ${!isValidEmail(formData.email) && formData.email ? 'border-red-500' : ''}`} />
                {!isValidEmail(formData.email) && formData.email && <p className="text-red-500 text-xs mt-1">Ingrese un email válido.</p>}
            </div>
            <div>
                <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                <input type="text" name="full_name" value={formData.full_name || ''} onChange={onFormChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            {!isEditing && (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Contraseña*</label>
                        <input type="password" name="password" value={formData.password} onChange={onFormChange} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                        <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-1">Confirmar Contraseña*</label>
                        <input type="password" name="confirm_password" value={formData.confirm_password} onChange={onFormChange} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                </div>
            )}
            <div className="flex flex-col space-y-2 pt-2">
                <label className="flex items-center">
                    <input type="checkbox" name="is_active" checked={formData.is_active} onChange={onFormChange} disabled={isEditing && formData.id === currentUser.id} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                    <span className="ml-2 text-sm text-gray-700">Usuario Activo</span>
                </label>
                <label className="flex items-center">
                    <input type="checkbox" name="is_superuser" checked={formData.is_superuser} onChange={onFormChange} disabled={isEditing && formData.id === currentUser.id} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                    <span className="ml-2 text-sm text-gray-700">Es Superusuario</span>
                </label>
            </div>
            <div className="pt-4 flex justify-end space-x-3 border-t">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors">Cancelar</button>
                <button onClick={onSubmit} disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors">{isSubmitting ? 'Guardando...' : 'Guardar'}</button>
            </div>
        </div>
    </Modal>
);

export default SettingsPage;