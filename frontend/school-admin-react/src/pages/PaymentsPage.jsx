import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPayments } from '../services/apiPayments'; // Solo necesitamos getPayments aquí
import CreatePaymentModal from '../components/CreatePaymentModal'; // <--- IMPORTAMOS EL NUEVO MODAL
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

// Estas constantes se pueden mantener aquí para los filtros de la página,
// o moverlas a un archivo de utilidades si se usan en muchos lugares.
// CreatePaymentModal.jsx también las tendría o las recibiría como props si fueran dinámicas.
const PAYMENT_METHODS = [
    { value: "Transferencia", label: "Transferencia" },
    { value: "Efectivo", label: "Efectivo" },
    { value: "Punto de Venta", label: "Punto de Venta" },
    { value: "PagoMovil", label: "PagoMóvil" },
    { value: "Zelle", label: "Zelle" },
    { value: "Otro", label: "Otro" },
];

const CURRENCIES = [
    { value: "VES", label: "VES" },
    { value: "USD", label: "USD" },
    { value: "EUR", label: "EUR" },
];

// Helper para formatear moneda
const formatCurrency = (amount, currency = 'VES') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    return parseFloat(amount).toLocaleString('es-VE', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Helper para formatear fecha
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString + 'T00:00:00Z').toLocaleDateString('es-VE', {day: '2-digit', month: '2-digit', year: 'numeric'});
};

function PaymentsPage() {
    const { token } = useAuth();
    const [payments, setPayments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Estados para los Filtros de la tabla principal
    const [filterRepresentativeId, setFilterRepresentativeId] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterPaymentMethod, setFilterPaymentMethod] = useState('');
    const [filterCurrencyPaid, setFilterCurrencyPaid] = useState('');

    // Estados para la Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const [limitPerPage] = useState(15);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);

    // --- Estado para el Modal de Registrar Nuevo Pago ---
    const [isCreatePaymentModalOpen, setIsCreatePaymentModalOpen] = useState(false); // Solo necesitamos el estado de apertura

    const fetchPayments = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        setError(null);
        try {
            const skip = (currentPage - 1) * limitPerPage;
            const params = { 
                skip, 
                limit: limitPerPage, 
                representativeId: filterRepresentativeId || null, 
                startDate: filterStartDate || null, 
                endDate: filterEndDate || null, 
                paymentMethod: filterPaymentMethod || null, 
                currencyPaid: filterCurrencyPaid || null 
            };
            const data = await getPayments(token, params);
            setPayments(data.items || []);
            setTotalItems(data.total || 0);
            setTotalPages(data.pages || 0);
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar pagos: ${err.message}`);
            setPayments([]); setTotalItems(0); setTotalPages(0);
        } finally {
            setIsLoading(false);
        }
    }, [token, currentPage, limitPerPage, filterRepresentativeId, filterStartDate, filterEndDate, filterPaymentMethod, filterCurrencyPaid]);

    useEffect(() => {
        fetchPayments();
    }, [fetchPayments]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterRepresentativeId, filterStartDate, filterEndDate, filterPaymentMethod, filterCurrencyPaid]);
    
    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
            setCurrentPage(newPage);
        }
    };

    // --- Manejadores para el Modal ---
    const handleOpenCreatePaymentModal = () => {
        setIsCreatePaymentModalOpen(true);
    };

    const handleCloseCreatePaymentModal = () => {
        setIsCreatePaymentModalOpen(false);
    };

    const handlePaymentCreated = () => {
        fetchPayments(); // Refrescar la lista de pagos
        // Opcional: ir a la primera página si se desea
        // setCurrentPage(1); 
        toast.info("Lista de pagos actualizada.");
    };

    return (
        <div>
            {/* Cabecera y Botón + Registrar Nuevo Pago */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-extrabold text-gray-800">Gestión de Pagos</h1>
                <button
                    onClick={handleOpenCreatePaymentModal} // Llama al nuevo manejador
                    className="inline-flex items-center gap-x-2 px-3 py-2 font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px"
                >
                    + Registrar Nuevo Pago
                </button>
            </div>

            {/* Sección de Filtros (sin cambios en su JSX) */}
            <div className="mb-6 p-4 bg-gray-50 rounded-md shadow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-end">
                <div>
                    <label htmlFor="filterRepIdPayments" className="block text-sm font-medium text-gray-700">ID Representante</label>
                    <input type="number" id="filterRepIdPayments" placeholder="Filtrar por ID Rep." value={filterRepresentativeId} onChange={(e) => setFilterRepresentativeId(e.target.value)} className="mt-1 block w-full input-style" disabled={isLoading}/>
                </div>
                <div>
                    <label htmlFor="filterStartDatePayments" className="block text-sm font-medium text-gray-700">Fecha Desde</label>
                    <input type="date" id="filterStartDatePayments" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="mt-1 block w-full input-style" disabled={isLoading}/>
                </div>
                <div>
                    <label htmlFor="filterEndDatePayments" className="block text-sm font-medium text-gray-700">Fecha Hasta</label>
                    <input type="date" id="filterEndDatePayments" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="mt-1 block w-full input-style" disabled={isLoading}/>
                </div>
                <div>
                    <label htmlFor="filterPaymentMethodPayments" className="block text-sm font-medium text-gray-700">Método de Pago</label>
                    <select id="filterPaymentMethodPayments" value={filterPaymentMethod} onChange={(e) => setFilterPaymentMethod(e.target.value)} className="mt-1 block w-full input-style-select" disabled={isLoading}>
                        <option value="">Todos</option>
                        {PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="filterCurrencyPaidPayments" className="block text-sm font-medium text-gray-700">Moneda Pagada</label>
                    <select id="filterCurrencyPaidPayments" value={filterCurrencyPaid} onChange={(e) => setFilterCurrencyPaid(e.target.value)} className="mt-1 block w-full input-style-select" disabled={isLoading}>
                        <option value="">Todas</option>
                        {CURRENCIES.map(curr => <option key={curr.value} value={curr.value}>{curr.label}</option>)}
                    </select>
                </div>
            </div>

            {isLoading && <p className="text-center py-4">Cargando pagos...</p>}
            {error && !isLoading && <p className="text-red-500 bg-red-100 p-3 rounded text-center mb-4">Error al cargar pagos: {error}</p>}

            {/* Tabla de Pagos (sin cambios en su JSX interno) */}
            {!isLoading && !error && (
                <>
                    <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Representante</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Pago</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monto Pagado</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Equivalente VES</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Método</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Referencia</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {payments.length > 0 ? payments.map((payment) => (
                                    <tr key={payment.id} className="hover:bg-slate-200">
                                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                                            {payment.representative ? (
                                                <Link to={`/representatives/${payment.representative.id}/edit`} className="text-indigo-600 hover:text-indigo-800 font-medium">
                                                    {payment.representative.first_name} {payment.representative.last_name}
                                                </Link>
                                            ) : `ID: ${payment.representative_id}`}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{formatDate(payment.payment_date)}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                                            {formatCurrency(payment.amount_paid, payment.currency_paid)}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                                            {formatCurrency(payment.amount_paid_ves_equivalent, 'VES')}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{payment.payment_method || '-'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500" title={payment.reference_number}>{payment.reference_number || '-'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                            <Link 
                                                to={`/payments/${payment.id}/details`} 
                                                className="text-indigo-600 hover:text-indigo-900"
                                                title="Ver Detalles y Asignaciones del Pago"
                                            >
                                                Ver Detalles
                                            </Link>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-4 text-center text-sm text-gray-500">
                                            No se encontraron pagos con los filtros actuales.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Controles de Paginación (sin cambios en su JSX) */}
                    {totalPages > 0 && (
                        <div className="mt-6 flex items-center justify-between">
                            <div className="text-sm text-gray-700">
                                Página <span className="font-medium">{currentPage}</span> de <span className="font-medium">{totalPages}</span> (Total: {totalItems} pagos)
                            </div>
                            <div className="flex space-x-2">
                                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"> Anterior </button>
                                <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"> Siguiente </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* --- RENDERIZAR EL MODAL REUTILIZABLE --- */}
            <CreatePaymentModal
                isOpen={isCreatePaymentModalOpen}
                onClose={handleCloseCreatePaymentModal}
                token={token}
                // initialRepresentativeId no se pasa aquí, para que el modal permita buscarlo
                onPaymentCreated={handlePaymentCreated} // Callback para refrescar
            />
        </div>
    );
}

export default PaymentsPage;