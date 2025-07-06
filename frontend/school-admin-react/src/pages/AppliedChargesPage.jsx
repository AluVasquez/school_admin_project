import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getAppliedCharges, createAppliedCharge } from '../services/apiAppliedCharges';
import { getStudents } from '../services/apiStudents';
import { getRepresentatives } from '../services/apiRepresentatives';
import { getChargeConcepts } from '../services/apiChargeConcepts';
import { getLatestExchangeRate } from '../services/apiExchangeRates';
import Modal from '../components/Modal';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

const STATUS_OPTIONS = [
    { value: "pending", label: "Pendiente" },
    { value: "paid", label: "Pagado" },
    { value: "partially_paid", label: "Parcialmente Pagado" },
    { value: "overdue", label: "Vencido" },
    { value: "cancelled", label: "Cancelado" },
];

const initialChargeFormData = {
  student_id: '',
  charge_concept_id: '',
  description: '',
  amount_override: '',
  currency_override: '',
  issue_date: new Date().toISOString().split('T')[0],
  due_date: '',
};

// Helper para formatear moneda 
const formatCurrency = (amount, currency, rate, targetCurrency = 'VES') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) {
        return 'N/A';
    }
    let displayAmount = parseFloat(amount);
    let displayCurrency = currency;

    if (currency !== targetCurrency && currency !== 'VES' && targetCurrency === 'VES' && rate) {
        displayAmount = parseFloat(amount) * rate;
        displayCurrency = 'VES';
    } else if (currency !== targetCurrency && currency === 'VES' && targetCurrency === 'USD' && rate) {
        displayAmount = parseFloat(amount) / rate;
        displayCurrency = 'USD';
    }

    if (!displayCurrency || typeof displayCurrency !== 'string' || !['USD', 'VES', 'EUR'].includes(displayCurrency.toUpperCase())) {
        console.warn(`formatCurrency: Código de moneda inválido "${displayCurrency}" para el monto ${amount}. Se mostrará sin formato de moneda.`);
        return `${amount} (Moneda Inv.)`; 
    }

    const options = { style: 'currency', currency: displayCurrency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    let locale = displayCurrency === 'USD' ? 'en-US' : 'es-VE';

    return displayAmount.toLocaleString(locale, options);
};

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-VE', {day: '2-digit', month: '2-digit', year: 'numeric'});
};

function AppliedChargesPage() {
    const { token } = useAuth();
    const [appliedCharges, setAppliedCharges] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [limitPerPage] = useState(10);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);

    const [filters, setFilters] = useState({
        studentId: '',
        chargeConceptId: '',
        status: '',
        representativeId: '',
        startIssueDate: '',
        endIssueDate: '',
        startDueDate: '',
        endDueDate: '',
    });

    // Estados para búsqueda de Estudiante en el filtro principal
    const [studentSearchTerm, setStudentSearchTerm] = useState('');
    const [studentSearchResults, setStudentSearchResults] = useState([]);
    const [isLoadingStudentSearch, setIsLoadingStudentSearch] = useState(false);
    const [selectedStudentDisplay, setSelectedStudentDisplay] = useState('');

    // Estados para búsqueda de Representante en el filtro principal
    const [representativeSearchTerm, setRepresentativeSearchTerm] = useState('');
    const [representativeSearchResults, setRepresentativeSearchResults] = useState([]);
    const [isLoadingRepSearch, setIsLoadingRepSearch] = useState(false);
    const [selectedRepresentativeDisplay, setSelectedRepresentativeDisplay] = useState('');
    
    // Estados para el modal de creación
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [chargeFormData, setChargeFormData] = useState(initialChargeFormData);
    const [isSubmittingCharge, setIsSubmittingCharge] = useState(false);
    const [formChargeError, setFormChargeError] = useState(null);
    const [modalChargeConceptsList, setModalChargeConceptsList] = useState([]);
    const [isLoadingModalData, setIsLoadingModalData] = useState(false);
    const [currentRateForModal, setCurrentRateForModal] = useState(null);

    // --- ESTADOS PARA LA BÚSQUEDA DE ESTUDIANTES EN EL MODAL ---
    const [modalStudentSearchTerm, setModalStudentSearchTerm] = useState('');
    const [modalStudentSearchResults, setModalStudentSearchResults] = useState([]);
    const [isLoadingModalStudentSearch, setIsLoadingModalStudentSearch] = useState(false);
    const [selectedStudentForModal, setSelectedStudentForModal] = useState(null);

    const fetchAppliedCharges = useCallback(async () => {
        if (!token) return;
        setIsLoading(true); setError(null);
        try {
            const skip = (currentPage - 1) * limitPerPage;
            const apiFilters = {
                skip, limit: limitPerPage,
                student_id: filters.studentId || null,
                charge_concept_id: filters.chargeConceptId || null,
                status: filters.status || null,
                representative_id: filters.representativeId || null,
                start_issue_date: filters.startIssueDate || null,
                end_issue_date: filters.endIssueDate || null,
                start_due_date: filters.startDueDate || null,
                end_due_date: filters.endDueDate || null,
            };
            const data = await getAppliedCharges(token, apiFilters);
            setAppliedCharges(data.items || []);
            setTotalItems(data.total || 0);
            setTotalPages(data.pages || 0);
        } catch (err) { setError(err.message); toast.error(`Error al cargar cargos: ${err.message}`); }
        finally { setIsLoading(false); }
    }, [token, currentPage, limitPerPage, filters]);

    useEffect(() => {
        fetchAppliedCharges();
    }, [fetchAppliedCharges]);

    useEffect(() => { setCurrentPage(1); }, [filters]);

    const handleGenericFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleStudentSearchChange = (e) => {
        const term = e.target.value;
        setStudentSearchTerm(term);
        setSelectedStudentDisplay(term);
        setFilters(prev => ({ ...prev, studentId: '' })); 
        
        if (term.length > 1) {
            setIsLoadingStudentSearch(true);
            getStudents(token, { search: term, limit: 7, isActive: true })
                .then(data => setStudentSearchResults(data.items || []))
                .catch(err => { console.error("Error buscando estudiantes:", err); setStudentSearchResults([]); })
                .finally(() => setIsLoadingStudentSearch(false));
        } else {
            setStudentSearchResults([]);
        }
    };
    const handleSelectStudent = (student) => {
        setFilters(prev => ({ ...prev, studentId: student.id.toString() }));
        setStudentSearchTerm('');
        setSelectedStudentDisplay(`${student.first_name} ${student.last_name} (CI: ${student.cedula || 'N/A'})`);
        setStudentSearchResults([]);
    };
    const clearStudentFilter = () => {
        setFilters(prev => ({ ...prev, studentId: '' }));
        setStudentSearchTerm(''); setSelectedStudentDisplay(''); setStudentSearchResults([]);
    };

    const handleRepresentativeSearchChange = (e) => {
        const term = e.target.value;
        setRepresentativeSearchTerm(term);
        setSelectedRepresentativeDisplay(term);
        setFilters(prev => ({ ...prev, representativeId: '' }));

        if (term.length > 1) {
            setIsLoadingRepSearch(true);
            getRepresentatives(token, { search: term, limit: 7 })
                .then(data => setRepresentativeSearchResults(data.items || []))
                .catch(err => { console.error("Error buscando representantes:", err); setRepresentativeSearchResults([]); })
                .finally(() => setIsLoadingRepSearch(false));
        } else {
            setRepresentativeSearchResults([]);
        }
    };
    const handleSelectRepresentative = (representative) => {
        setFilters(prev => ({ ...prev, representativeId: representative.id.toString() }));
        setRepresentativeSearchTerm('');
        setSelectedRepresentativeDisplay(`${representative.first_name} ${representative.last_name} (CI: ${representative.identification_number || representative.cedula || 'N/A'})`);
        setRepresentativeSearchResults([]);
    };
    const clearRepresentativeFilter = () => {
        setFilters(prev => ({ ...prev, representativeId: '' }));
        setRepresentativeSearchTerm(''); setSelectedRepresentativeDisplay(''); setRepresentativeSearchResults([]);
    };
    
    // --- Lógica para el Modal de Creación ---
    const loadModalData = useCallback(async () => {
        if (!token) return;
        setIsLoadingModalData(true);
        try {
            const [conceptsData, rateData] = await Promise.all([
                getChargeConcepts(token, { limit: 200, isActive: true }),
                getLatestExchangeRate(token, "USD")
            ]);
            setModalChargeConceptsList(conceptsData.items || []);
            setCurrentRateForModal(rateData?.rate || null);
        } catch (error) {
            toast.error("Error cargando datos para el formulario de creación.");
            console.error("Error en loadModalData:", error);
        } finally {
            setIsLoadingModalData(false);
        }
    }, [token]);

    const openCreateModal = () => {
        setChargeFormData(initialChargeFormData);
        setFormChargeError(null);
        setModalStudentSearchTerm('');
        setModalStudentSearchResults([]);
        setSelectedStudentForModal(null);
        setIsCreateModalOpen(true);
        loadModalData();
    };

    const handleCloseCreateModal = () => setIsCreateModalOpen(false);

    // --- NUEVA LÓGICA DE BÚSQUEDA EN MODAL ---
    useEffect(() => {
        if (modalStudentSearchTerm.length < 2) {
            setModalStudentSearchResults([]);
            return;
        }

        const fetchStudentsForModal = async () => {
            if (!token) return;
            setIsLoadingModalStudentSearch(true);
            try {
                const data = await getStudents(token, { search: modalStudentSearchTerm, limit: 5, isActive: true });
                setModalStudentSearchResults(data.items || []);
            } catch (err) {
                console.error("Error buscando estudiantes para el modal:", err);
                setModalStudentSearchResults([]);
            } finally {
                setIsLoadingModalStudentSearch(false);
            }
        };

        const debounceTimer = setTimeout(() => {
            fetchStudentsForModal();
        }, 500);

        return () => clearTimeout(debounceTimer);
    }, [modalStudentSearchTerm, token]);

    // --- NUEVA FUNCIÓN PARA MANEJAR LA SELECCIÓN EN MODAL ---
    const handleSelectStudentForModal = (student) => {
        setChargeFormData(prev => ({ ...prev, student_id: student.id.toString() }));
        setSelectedStudentForModal(student);
        setModalStudentSearchTerm('');
        setModalStudentSearchResults([]);
    };

    const handleClearSelectedStudent = () => {
        setChargeFormData(prev => ({ ...prev, student_id: '' }));
        setSelectedStudentForModal(null);
    };

    const handleChargeFormChange = (e) => {
        const { name, value } = e.target;
        let newFormData = { ...chargeFormData, [name]: value };

        if (name === "charge_concept_id" && value) {
            const concept = modalChargeConceptsList.find(c => c.id.toString() === value);
            if (concept) {
                newFormData.description = concept.description || '';
                newFormData.amount_override = concept.default_amount?.toString() || '';
                newFormData.currency_override = concept.default_amount_currency || 'USD';
            }
        }
        setChargeFormData(newFormData);
    };

    const handleCreateChargeSubmit = async (e) => {
        e.preventDefault();
        if (!token) { toast.error("Autenticación requerida."); return; }
        if (!chargeFormData.student_id || !chargeFormData.charge_concept_id || !chargeFormData.issue_date || !chargeFormData.due_date) {
            setFormChargeError("Estudiante, Concepto, Fecha de Emisión y Fecha de Vencimiento son obligatorios.");
            return;
        }
        if (new Date(chargeFormData.due_date) < new Date(chargeFormData.issue_date)) {
            setFormChargeError("La fecha de vencimiento no puede ser anterior a la fecha de emisión.");
            return;
        }

        setIsSubmittingCharge(true); setFormChargeError(null);
        try {
            const payload = {
                student_id: parseInt(chargeFormData.student_id),
                charge_concept_id: parseInt(chargeFormData.charge_concept_id),
                description: chargeFormData.description || undefined,
                amount_override: chargeFormData.amount_override ? parseFloat(chargeFormData.amount_override) : undefined,
                currency_override: chargeFormData.currency_override || undefined,
                issue_date: chargeFormData.issue_date,
                due_date: chargeFormData.due_date,
            };
            await createAppliedCharge(token, payload);
            toast.success("¡Cargo aplicado creado exitosamente!");
            handleCloseCreateModal();
            fetchAppliedCharges();
        } catch (err) {
            const errorMsg = err.message || "Error al crear el cargo aplicado.";
            setFormChargeError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setIsSubmittingCharge(false);
        }
    };
    
    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage && !isLoading) {
            setCurrentPage(newPage);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-extrabold text-gray-800">Cargos Aplicados a Estudiantes</h1>
                <button onClick={openCreateModal} className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px">
                    + Aplicar Cargo Manual
                </button>
            </div>

            {/* Filtros */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg shadow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-end">
                {/* Filtro Estudiante */}
                <div className="relative">
                    <label htmlFor="studentSearch" className="block text-sm font-medium text-gray-700">Estudiante (Nombre/Cédula)</label>
                    <input type="text" id="studentSearch" placeholder="Buscar..." value={selectedStudentDisplay || studentSearchTerm} onChange={handleStudentSearchChange} className="mt-1 block w-full input-style"/>
                    {filters.studentId && (<button onClick={clearStudentFilter} className="absolute right-1 top-7 text-red-500 hover:text-red-700 p-1 text-xs" title="Limpiar">&times;</button>)}
                    {isLoadingStudentSearch && <p className="text-xs text-gray-500">Buscando...</p>}
                    {studentSearchResults.length > 0 && (<ul className="absolute z-20 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-48 overflow-y-auto shadow-lg">{studentSearchResults.map(s => (<li key={s.id} onClick={() => handleSelectStudent(s)} className="px-3 py-2 hover:bg-indigo-100 cursor-pointer text-sm">{s.first_name} {s.last_name} (CI: {s.cedula || 'N/A'})</li>))}</ul>)}
                </div>

                {/* Filtro Representante */}
                <div className="relative">
                    <label htmlFor="representativeSearch" className="block text-sm font-medium text-gray-700">Representante (Nombre/Cédula)</label>
                    <input type="text" id="representativeSearch" placeholder="Buscar..." value={selectedRepresentativeDisplay || representativeSearchTerm} onChange={handleRepresentativeSearchChange} className="mt-1 block w-full input-style"/>
                    {filters.representativeId && (<button onClick={clearRepresentativeFilter} className="absolute right-1 top-7 text-red-500 hover:text-red-700 p-1 text-xs" title="Limpiar">&times;</button>)}
                    {isLoadingRepSearch && <p className="text-xs text-gray-500">Buscando...</p>}
                    {representativeSearchResults.length > 0 && (<ul className="absolute z-20 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-48 overflow-y-auto shadow-lg">{representativeSearchResults.map(r => (<li key={r.id} onClick={() => handleSelectRepresentative(r)} className="px-3 py-2 hover:bg-indigo-100 cursor-pointer text-sm">{r.first_name} {r.last_name} (CI: {r.identification_number || r.cedula || 'N/A'})</li>))}</ul>)}
                </div>
                
                 <div>
                    <label htmlFor="chargeConceptId_filter" className="block text-sm font-medium text-gray-700">Concepto de Cargo</label>
                     <select name="chargeConceptId" id="chargeConceptId_filter" value={filters.chargeConceptId} onChange={handleGenericFilterChange} className="mt-1 block w-full input-style-select" disabled={isLoadingModalData}>
                        <option value="">{isLoadingModalData ? "Cargando..." : "Todos los Conceptos"}</option>
                        {modalChargeConceptsList.map(concept => ( <option key={concept.id} value={concept.id}>{concept.name} ({concept.default_currency})</option> ))}
                    </select>
                </div>
                 <div>
                    <label htmlFor="status_filter" className="block text-sm font-medium text-gray-700">Estado</label>
                    <select name="status" id="status_filter" value={filters.status} onChange={handleGenericFilterChange} className="mt-1 block w-full input-style-select">
                        <option value="">Todos</option>
                        {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="startIssueDate_filter" className="block text-sm font-medium text-gray-700">Emisión Desde</label>
                    <input type="date" name="startIssueDate" id="startIssueDate_filter" value={filters.startIssueDate} onChange={handleGenericFilterChange} className="mt-1 block w-full input-style"/>
                </div>
                <div>
                    <label htmlFor="endIssueDate_filter" className="block text-sm font-medium text-gray-700">Emisión Hasta</label>
                    <input type="date" name="endIssueDate" id="endIssueDate_filter" value={filters.endIssueDate} onChange={handleGenericFilterChange} className="mt-1 block w-full input-style"/>
                </div>
                <div>
                    <label htmlFor="startDueDate_filter" className="block text-sm font-medium text-gray-700">Vencimiento Desde</label>
                     <input type="date" name="startDueDate" id="startDueDate_filter" value={filters.startDueDate} onChange={handleGenericFilterChange} className="mt-1 block w-full input-style"/>
                </div>
                <div>
                    <label htmlFor="endDueDate_filter" className="block text-sm font-medium text-gray-700">Vencimiento Hasta</label>
                    <input type="date" name="endDueDate" id="endDueDate_filter" value={filters.endDueDate} onChange={handleGenericFilterChange} className="mt-1 block w-full input-style"/>
                </div>
            </div>

            {/* Tabla y Paginación */}
            {isLoading && <p className="text-center py-4">Cargando cargos aplicados...</p>}
             {error && !isLoading && <p className="text-red-500 text-center py-4">Error: {error}</p>}
            {!isLoading && !error && (
                <>
                    <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                            <thead className="bg-gray-100">
                                <tr>
                                     <th className="px-3 py-2 text-left font-semibold text-gray-600">ID</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Estudiante</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Concepto</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Descripción</th>
                                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Monto Original</th>
                                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Monto Bs.S (Emisión)</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">F. Emisión</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">F. Vencim.</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Estado</th>
                                     <th className="px-3 py-2 text-right font-semibold text-gray-600">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {appliedCharges.length > 0 ? appliedCharges.map(charge => (
                                     <tr key={charge.id} className="hover:bg-slate-200">
                                        <td className="px-3 py-2 whitespace-nowrap">{charge.id}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{charge.student?.first_name} {charge.student?.last_name}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{charge.charge_concept?.name}</td>
                                         <td className="px-3 py-2 max-w-xs truncate" title={charge.description}>{charge.description}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-right">{formatCurrency(charge.amount_due_original_currency, charge.original_concept_currency, charge.exchange_rate_applied_at_emission, charge.original_concept_currency)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-right">{formatCurrency(charge.amount_due_ves_at_emission, 'VES')}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(charge.issue_date)}</td>
                                         <td className="px-3 py-2 whitespace-nowrap">{formatDate(charge.due_date)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <span className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${
                                                charge.status === 'paid' ? 'bg-green-100 text-green-800' :
                                                 charge.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                charge.status === 'partially_paid' ? 'bg-blue-100 text-blue-800' :
                                                charge.status === 'overdue' ? 'bg-orange-100 text-orange-800' :
                                                 charge.status === 'cancelled' ? 'bg-gray-200 text-gray-700 line-through' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                                {STATUS_OPTIONS.find(s => s.value === charge.status)?.label || charge.status}
                                             </span>
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-right">
                                            <Link to={`/applied-charges/${charge.id}/edit`} className="text-indigo-600 hover:text-indigo-800 text-xs">Editar</Link>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="10" className="px-6 py-4 text-center text-gray-500">No se encontraron cargos aplicados.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 0 && (
                        <div className="mt-4 flex items-center justify-between text-xs">
                             <span>Página {currentPage} de {totalPages} (Total: {totalItems} cargos)</span>
                            <div>
                                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="px-3 py-1 btn-secondary-xs disabled:opacity-50 mr-1">Ant.</button>
                                <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="px-3 py-1 btn-secondary-xs disabled:opacity-50">Sig.</button>
                            </div>
                         </div>
                    )}
                </>
            )}

            {/* Modal para crear nuevo cargo aplicado */}
            <Modal isOpen={isCreateModalOpen} onClose={handleCloseCreateModal} title="Aplicar Nuevo Cargo Manualmente">
                <form onSubmit={handleCreateChargeSubmit} className="space-y-4 text-sm">
                    <div>
                        <label htmlFor="student_search_modal" className="block text-sm font-medium">Estudiante*</label>
                        {!selectedStudentForModal ? (
                            <div className="relative">
                                <input
                                    type="text"
                                    id="student_search_modal"
                                    placeholder="Buscar por nombre, apellido o cédula..."
                                    value={modalStudentSearchTerm}
                                    onChange={(e) => setModalStudentSearchTerm(e.target.value)}
                                    className="mt-1 block w-full input-style"
                                    autoComplete="off"
                                />
                                {isLoadingModalStudentSearch && <p className="text-xs text-gray-500 mt-1">Buscando...</p>}
                                {modalStudentSearchResults.length > 0 && (
                                    <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-40 overflow-y-auto shadow-lg">
                                        {modalStudentSearchResults.map(s => (
                                            <li
                                                key={s.id}
                                                onClick={() => handleSelectStudentForModal(s)}
                                                className="px-3 py-2 hover:bg-indigo-100 cursor-pointer text-sm"
                                            >
                                                {s.first_name} {s.last_name} (CI: {s.cedula || 'N/A'})
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ) : (
                            <div className="mt-1 flex items-center justify-between p-2 bg-indigo-50 border border-indigo-200 rounded-md">
                                <span className="text-sm font-medium text-indigo-800">
                                    {selectedStudentForModal.first_name} {selectedStudentForModal.last_name}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleClearSelectedStudent}
                                    className="text-red-500 hover:text-red-700 text-sm font-bold"
                                    title="Cambiar estudiante"
                                >
                                    &times; Cambiar
                                </button>
                            </div>
                        )}
                    </div>
                    <div>
                        <label htmlFor="charge_concept_id_modal" className="block text-sm font-medium">Concepto de Cargo*</label>
                         <select name="charge_concept_id" id="charge_concept_id_modal" value={chargeFormData.charge_concept_id} onChange={handleChargeFormChange} required className="mt-1 block w-full input-style-select" disabled={isLoadingModalData}>
                            <option value="">{isLoadingModalData ? "Cargando..." : "Seleccione Concepto..."}</option>
                            {modalChargeConceptsList.map(c => <option key={c.id} value={c.id}>{c.name} ({formatCurrency(c.default_amount, c.default_amount_currency, null, c.default_amount_currency)})</option>)}
                        </select>
                    </div>
                    {chargeFormData.charge_concept_id && (
                        <>
                            <div>
                                <label htmlFor="description_modal_charge" className="block text-sm font-medium">Descripción (auto-llenado, puede editar)</label>
                                <input type="text" name="description" id="description_modal_charge" value={chargeFormData.description} onChange={handleChargeFormChange} className="mt-1 block w-full input-style"/>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                 <div>
                                    <label htmlFor="amount_override_modal" className="block text-sm font-medium">Monto Override (Opcional)</label>
                                    <input type="number" name="amount_override" id="amount_override_modal" value={chargeFormData.amount_override} onChange={handleChargeFormChange} placeholder="Dejar vacío para usar el del concepto" step="0.01" className="mt-1 block w-full input-style"/>
                                </div>
                                 <div>
                                    <label htmlFor="currency_override_modal" className="block text-sm font-medium">Moneda Override (Opcional)</label>
                                    <select name="currency_override" id="currency_override_modal" value={chargeFormData.currency_override} onChange={handleChargeFormChange} className="mt-1 block w-full input-style-select">
                                        <option value="">Usar moneda del concepto</option>
                                        <option value="USD">USD</option><option value="VES">Bs.S</option><option value="EUR">EUR</option>
                                     </select>
                                </div>
                            </div>
                        </>
                    )}
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                             <label htmlFor="issue_date_modal" className="block text-sm font-medium">Fecha de Emisión*</label>
                            <input type="date" name="issue_date" id="issue_date_modal" value={chargeFormData.issue_date} onChange={handleChargeFormChange} required className="mt-1 block w-full input-style"/>
                        </div>
                        <div>
                            <label htmlFor="due_date_modal" className="block text-sm font-medium">Fecha de Vencimiento*</label>
                             <input type="date" name="due_date" id="due_date_modal" value={chargeFormData.due_date} onChange={handleChargeFormChange} required className="mt-1 block w-full input-style"/>
                        </div>
                    </div>
                    {formChargeError && <p className="text-red-500 text-xs italic text-center py-1 bg-red-50 rounded">{formChargeError}</p>}
                    <div className="pt-4 flex justify-end space-x-3 border-t mt-4">
                        <button type="button" onClick={handleCloseCreateModal} className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">Cancelar</button>
                        <button type="submit" disabled={isSubmittingCharge || isLoadingModalData || !chargeFormData.student_id || !chargeFormData.charge_concept_id} className="inline-flex items-center gap-x-2 px-3 py-2 text-sm font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px">
                            {isSubmittingCharge ? 'Creando...' : 'Aplicar Cargo'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default AppliedChargesPage;