// src/pages/PaymentDetailsPage.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getPaymentById } from '../services/apiPayments';
import CreateInvoiceModal from '../components/CreateInvoiceModal'; 
import { toast } from 'react-toastify';

// --- Helpers (sin cambios) ---
const formatCurrency = (amount, currency = 'VES') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    return parseFloat(amount).toLocaleString('es-VE', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString + 'T00:00:00Z').toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

function PaymentDetailsPage() {
    const { paymentId } = useParams();
    const { token } = useAuth();
    const [paymentDetails, setPaymentDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- NUEVOS ESTADOS PARA EL MODAL DE FACTURACIÓN ---
    const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = useState(false);
    
    const fetchPaymentDetails = useCallback(async () => {
        if (!token || !paymentId) {
            setIsLoading(false);
            setError("Información insuficiente para cargar el pago.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const data = await getPaymentById(token, paymentId);
            setPaymentDetails(data);
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar detalles del pago: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, paymentId]);

    useEffect(() => {
        fetchPaymentDetails();
    }, [fetchPaymentDetails]);

    // --- LÓGICA PARA EL MODAL DE FACTURACIÓN ---

    const unbilledChargesForPayment = useMemo(() => {
        if (!paymentDetails || !paymentDetails.allocations) {
            return [];
        }
        return paymentDetails.allocations
            .map(alloc => alloc.applied_charge)
            .filter(charge => charge && charge.invoice_id === null && charge.status !== 'cancelled');
    }, [paymentDetails]);
    
    const handleInvoiceCreated = () => {
        setIsCreateInvoiceModalOpen(false);
        toast.success("Factura creada. Actualizando detalles del pago...");
        fetchPaymentDetails(); // Recargamos para ver si los cargos ahora aparecen como facturados
    };


    if (isLoading) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold text-gray-800 mb-6">Detalles del Pago</h1>
                <p>Cargando detalles del pago...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold text-gray-800 mb-6">Detalles del Pago</h1>
                <p className="text-red-500 bg-red-100 p-3 rounded mb-4">Error: {error}</p>
                <Link to="/payments" className="text-indigo-600 hover:text-indigo-800">
                    &larr; Volver a la lista de pagos
                </Link>
            </div>
        );
    }

    if (!paymentDetails) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold text-gray-800 mb-6">Detalles del Pago</h1>
                <p>No se encontraron detalles para este pago.</p>
                <Link to="/payments" className="text-indigo-600 hover:text-indigo-800">
                    &larr; Volver a la lista de pagos
                </Link>
            </div>
        );
    }

    const totalAllocatedInPayment = (paymentDetails.allocations || []).reduce(
        (sum, alloc) => sum + parseFloat(alloc.amount_allocated_ves || 0),
        0
    );

    return (
        <div className="p-4 md:p-6 bg-gray-50">
            <div className="bg-white shadow-xl rounded-lg max-w-4xl mx-auto p-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-2">
                    <h1 className="text-2xl font-bold text-gray-800">
                        Detalles del Pago <span className="text-indigo-600">(ID: {paymentDetails.id})</span>
                    </h1>
                    <Link to="/payments" className="text-sm text-indigo-600 hover:text-indigo-800 self-start sm:self-center">
                        &larr; Volver a la lista de pagos
                    </Link>
                </div>

                {/* --- SECCIÓN DE ACCIONES RÁPIDAS (NUEVA) --- */}
                <div className="mb-8 p-4 border rounded-md bg-gray-50 space-y-3">
                    <h2 className="text-lg font-semibold text-gray-700">Acciones</h2>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => setIsCreateInvoiceModalOpen(true)}
                            className="bg-purple-500 hover:bg-purple-600 text-white font-medium py-2 px-4 rounded-md text-sm shadow-sm transition-colors"
                            disabled={unbilledChargesForPayment.length === 0}
                            title={unbilledChargesForPayment.length === 0 ? "Todos los cargos de este pago ya fueron facturados" : "Generar factura para los cargos asociados a este pago"}
                        >
                            Facturar Cargos de este Pago ({unbilledChargesForPayment.length})
                        </button>
                        {/* Aquí podrías añadir otras acciones, como 'Anular Pago', etc. */}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    {/* Columna Izquierda: Información del Pago */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">Información del Pago</h3>
                        <p><strong className="text-gray-600">Representante:</strong> <Link to={`/representatives/${paymentDetails.representative.id}/edit`} className="text-indigo-600 hover:underline">{paymentDetails.representative.first_name} {paymentDetails.representative.last_name}</Link></p>
                        <p><strong className="text-gray-600">Fecha del Pago:</strong> {formatDate(paymentDetails.payment_date)}</p>
                        <p><strong className="text-gray-600">Monto Pagado:</strong> <span className="font-semibold">{formatCurrency(paymentDetails.amount_paid, paymentDetails.currency_paid)}</span></p>
                        <p><strong className="text-gray-600">Equivalente en VES:</strong> <span className="font-semibold">{formatCurrency(paymentDetails.amount_paid_ves_equivalent, 'VES')}</span></p>
                        {paymentDetails.exchange_rate_applied && <p><strong className="text-gray-600">Tasa Aplicada:</strong> 1 {paymentDetails.currency_paid} = {formatCurrency(paymentDetails.exchange_rate_applied, 'VES')}</p>}
                        <p><strong className="text-gray-600">Método:</strong> {paymentDetails.payment_method || '-'}</p>
                        <p><strong className="text-gray-600">Referencia:</strong> {paymentDetails.reference_number || '-'}</p>
                        {paymentDetails.notes && <p><strong className="text-gray-600">Notas:</strong> <span className="whitespace-pre-wrap">{paymentDetails.notes}</span></p>}
                    </div>

                    {/* Columna Derecha: Asignaciones de este Pago */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">Cargos Asignados a este Pago</h3>
                        {paymentDetails.allocations && paymentDetails.allocations.length > 0 ? (
                            <div className="overflow-x-auto border rounded-md">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-500">Concepto (Cargo ID)</th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-500">Monto Asignado (VES)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {paymentDetails.allocations.map(alloc => (
                                            <tr key={alloc.id} className="hover:bg-gray-50">
                                                <td className="px-3 py-2">
                                                    <Link to={`/applied-charges/${alloc.applied_charge?.id}/edit`} className="text-indigo-600 hover:underline">
                                                        {alloc.applied_charge?.charge_concept?.name || 'Concepto Desc.'} ({alloc.applied_charge_id})
                                                    </Link>
                                                    {alloc.applied_charge?.invoice_id && <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Facturado</span>}
                                                </td>
                                                <td className="px-3 py-2 text-right font-medium">{formatCurrency(alloc.amount_allocated_ves, 'VES')}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-100 font-bold">
                                            <td className="px-3 py-2 text-right">Total Asignado:</td>
                                            <td className="px-3 py-2 text-right">{formatCurrency(totalAllocatedInPayment, 'VES')}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm">Este pago no tiene asignaciones a cargos específicos.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal para Crear Factura, ahora se activa desde esta página */}
            <CreateInvoiceModal
                isOpen={isCreateInvoiceModalOpen}
                onClose={() => setIsCreateInvoiceModalOpen(false)}
                token={token}
                representative={paymentDetails.representative}
                unbilledCharges={unbilledChargesForPayment} // Pasamos solo los cargos relevantes
                onInvoiceCreated={handleInvoiceCreated}
            />
        </div>
    );
}

export default PaymentDetailsPage;