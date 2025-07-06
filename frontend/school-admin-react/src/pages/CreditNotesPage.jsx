// src/pages/CreditNotesPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getCreditNotes } from '../services/apiCreditNotes';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

// --- Helpers ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString + 'T00:00:00Z').toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return 'Bs. 0,00';
    return `Bs. ${parseFloat(amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function CreditNotesPage() {
    const { token } = useAuth();
    const [creditNotes, setCreditNotes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const [limitPerPage] = useState(15);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);

    const fetchCreditNotes = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        setError(null);
        try {
            const params = {
                skip: (currentPage - 1) * limitPerPage,
                limit: limitPerPage,
            };
            const data = await getCreditNotes(token, params);
            setCreditNotes(data.items || []);
            setTotalItems(data.total || 0);
            setTotalPages(data.pages || 0);
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar notas de crédito: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, currentPage, limitPerPage]);

    useEffect(() => {
        fetchCreditNotes();
    }, [fetchCreditNotes]);

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage);
    };

    return (
        <div className="container mx-auto p-4">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-extrabold text-gray-800">Historial de Notas de Crédito</h1>
            </div>

            {isLoading && <p className="text-center py-4">Cargando notas de crédito...</p>}
            {error && <p className="text-red-500 text-center py-4">Error: {error}</p>}
            {!isLoading && (
                <>
                    <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Nro. Nota Crédito</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Factura Original</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Representante</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Fecha Emisión</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase">Monto Acreditado</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {creditNotes.length > 0 ? creditNotes.map(cn => (
                                    <tr key={cn.id} className="hover:bg-slate-200">
                                        <td className="px-4 py-3 font-medium">{cn.credit_note_number}</td>
                                        <td className="px-4 py-3">
                                            <Link to={`/invoices/${cn.original_invoice_id}`} className="text-indigo-600 hover:underline">
                                                {cn.original_invoice_number_snapshot}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3">{cn.representative.first_name} {cn.representative.last_name}</td>
                                        <td className="px-4 py-3">{formatDate(cn.issue_date)}</td>
                                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(cn.total_credited_ves)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <Link to={`/credit-notes/${cn.id}`} className="text-blue-600 hover:text-blue-800">Ver Detalles</Link>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="6" className="text-center py-10 text-gray-500">No se encontraron notas de crédito.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="mt-4 flex items-center justify-between text-xs">
                            <span>Página {currentPage} de {totalPages} (Total: {totalItems})</span>
                            <div>
                                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1} className="btn-secondary-xs mr-1">Ant.</button>
                                <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages} className="btn-secondary-xs">Sig.</button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default CreditNotesPage;