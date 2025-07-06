// src/pages/InvoicesPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getInvoices, annulInvoice } from '../services/apiInvoices';
import { getRepresentatives } from '../services/apiRepresentatives';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';

// --- Helpers ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return 'N/A';
    return `Bs. ${parseFloat(amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const INVOICE_STATUS_OPTIONS = [
    { value: 'emitted', label: 'Emitida', color: 'bg-green-100 text-green-800' },
    { value: 'annulled', label: 'Anulada', color: 'bg-red-100 text-red-800' },
    { value: 'pending_emission', label: 'Pendiente Emisión', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'error', label: 'Error', color: 'bg-orange-100 text-orange-800' },
];

const getStatusStyle = (status) => INVOICE_STATUS_OPTIONS.find(s => s.value === status) || { label: status, color: 'bg-gray-100 text-gray-800' };

// --- Component ---
function InvoicesPage() {
    const { token } = useAuth();
    const [invoices, setInvoices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const [limitPerPage] = useState(15);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);

    // Filtros
    const [filters, setFilters] = useState({
        representativeId: '', startDate: '', endDate: '',
        status: '', invoiceNumber: ''
    });
    const [repSearchTerm, setRepSearchTerm] = useState('');
    const [repSearchResults, setRepSearchResults] = useState([]);
    const [isLoadingRepSearch, setIsLoadingRepSearch] = useState(false);
    const [selectedRepDisplay, setSelectedRepDisplay] = useState('');

    // Modal de Anulación
    const [isAnnulModalOpen, setIsAnnulModalOpen] = useState(false);
    const [invoiceToAnnul, setInvoiceToAnnul] = useState(null);
    const [annulReason, setAnnulReason] = useState('');
    const [isSubmittingAnnul, setIsSubmittingAnnul] = useState(false);

    const fetchInvoices = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        setError(null);
        try {
            const params = {
                skip: (currentPage - 1) * limitPerPage,
                limit: limitPerPage,
                representative_id: filters.representativeId || null,
                start_date: filters.startDate || null,
                end_date: filters.endDate || null,
                status: filters.status || null,
                invoice_number: filters.invoiceNumber || null,
            };
            const data = await getInvoices(token, params);
            setInvoices(data.items || []);
            setTotalItems(data.total || 0);
            setTotalPages(data.pages || 0);
        } catch (err) {
            setError(err.message);
            toast.error(`Error al cargar facturas: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token, currentPage, limitPerPage, filters]);

    useEffect(() => {
        fetchInvoices();
    }, [fetchInvoices]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters]);

    const handleFilterChange = (e) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };
    
    // Búsqueda de representante
    useEffect(() => {
        if (repSearchTerm.length < 2) { setRepSearchResults([]); return; }
        const timerId = setTimeout(async () => {
            setIsLoadingRepSearch(true);
            try {
                const data = await getRepresentatives(token, { search: repSearchTerm, limit: 5 });
                setRepSearchResults(data.items || []);
            } catch (err) { console.error("Error buscando representantes:", err); }
            finally { setIsLoadingRepSearch(false); }
        }, 500);
        return () => clearTimeout(timerId);
    }, [repSearchTerm, token]);

    const handleSelectRep = (rep) => {
        setFilters(prev => ({...prev, representativeId: rep.id.toString()}));
        setSelectedRepDisplay(`${rep.first_name} ${rep.last_name} (${rep.cedula})`);
        setRepSearchTerm('');
        setRepSearchResults([]);
    };

    const clearRepFilter = () => {
        setFilters(prev => ({...prev, representativeId: ''}));
        setSelectedRepDisplay('');
    };

    // Lógica del modal de anulación
    const openAnnulModal = (invoice) => {
        setInvoiceToAnnul(invoice);
        setAnnulReason('');
        setIsAnnulModalOpen(true);
    };

    const handleConfirmAnnul = async (e) => {
        e.preventDefault();
        if (!invoiceToAnnul || !annulReason.trim()) {
            toast.warn("La razón de la anulación es obligatoria.");
            return;
        }
        setIsSubmittingAnnul(true);
        try {
            await annulInvoice(token, invoiceToAnnul.id, annulReason);
            toast.success(`Factura #${invoiceToAnnul.invoice_number} anulada.`);
            setIsAnnulModalOpen(false);
            fetchInvoices();
        } catch (err) {
            toast.error(`Error al anular factura: ${err.message}`);
        } finally {
            setIsSubmittingAnnul(false);
        }
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage);
    };

    return (
        <div className="container mx-auto p-4">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-extrabold text-gray-800">Listado de Facturas</h1>
                <p className="text-sm text-gray-500">
                    Las facturas se generan desde el Estado de Cuenta de un Representante.
                </p>
            </div>

            {/* Filtros */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg shadow grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                <div className="relative">
                    <label htmlFor="repSearch" className="block text-sm font-medium">Representante</label>
                    <input type="text" id="repSearch" placeholder="Buscar..." value={selectedRepDisplay || repSearchTerm} onChange={e => { setSelectedRepDisplay(''); setFilters(prev => ({...prev, representativeId: ''})); setRepSearchTerm(e.target.value); }} className="mt-1 w-full input-style"/>
                    {selectedRepDisplay && <button onClick={clearRepFilter} className="absolute right-1 top-7 text-red-500 hover:text-red-700 p-1 text-xs" title="Limpiar">&times;</button>}
                    {isLoadingRepSearch && <p className="text-xs text-gray-500">Buscando...</p>}
                    {repSearchResults.length > 0 && (<ul className="absolute z-20 w-full bg-white border mt-1 rounded shadow-lg">{repSearchResults.map(r => (<li key={r.id} onClick={()=>handleSelectRep(r)} className="p-2 hover:bg-indigo-100 cursor-pointer">{r.first_name} {r.last_name}</li>))}</ul>)}
                </div>
                <div><label htmlFor="startDate" className="block text-sm font-medium">Fecha Desde</label><input type="date" name="startDate" id="startDate" value={filters.startDate} onChange={handleFilterChange} className="mt-1 w-full input-style"/></div>
                <div><label htmlFor="endDate" className="block text-sm font-medium">Fecha Hasta</label><input type="date" name="endDate" id="endDate" value={filters.endDate} onChange={handleFilterChange} className="mt-1 w-full input-style"/></div>
                <div><label htmlFor="status" className="block text-sm font-medium">Estado</label><select name="status" id="status" value={filters.status} onChange={handleFilterChange} className="mt-1 w-full input-style-select"><option value="">Todos</option>{INVOICE_STATUS_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select></div>
                <div><label htmlFor="invoiceNumber" className="block text-sm font-medium">Nro Factura/Control</label><input type="text" name="invoiceNumber" id="invoiceNumber" value={filters.invoiceNumber} onChange={handleFilterChange} className="mt-1 w-full input-style"/></div>
            </div>

            {isLoading && <p className="text-center py-4">Cargando facturas...</p>}
            {error && <p className="text-red-500 text-center py-4">Error: {error}</p>}
            {!isLoading && (
                <>
                    <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Nro. Factura</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Nro. Control</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Representante</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Fecha</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase">Monto Total</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Estado</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {invoices.length > 0 ? invoices.map(invoice => (
                                    <tr key={invoice.id} className="hover:bg-slate-200">
                                        <td className="px-4 py-3">{invoice.invoice_number}</td>
                                        <td className="px-4 py-3">{invoice.fiscal_control_number || '-'}</td>
                                        <td className="px-4 py-3">{invoice.representative_name_snapshot}</td>
                                        <td className="px-4 py-3">{formatDate(invoice.issue_date)}</td>
                                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(invoice.total_amount_ves)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 text-xs leading-5 font-semibold rounded-full ${getStatusStyle(invoice.status).color}`}>
                                                {getStatusStyle(invoice.status).label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right space-x-2">
                                            <Link to={`/invoices/${invoice.id}`} className="text-blue-600 hover:text-blue-800">Ver</Link>
                                            {invoice.status === 'emitted' && <button onClick={() => openAnnulModal(invoice)} className="text-red-600 hover:text-red-800">Anular</button>}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="7" className="text-center py-10 text-gray-500">No se encontraron facturas.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Paginación */}
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
            
            {/* Modal de Anulación */}
            {invoiceToAnnul && (
                <Modal isOpen={isAnnulModalOpen} onClose={() => setIsAnnulModalOpen(false)} title={`Anular Factura #${invoiceToAnnul.invoice_number}`}>
                    <form onSubmit={handleConfirmAnnul}>
                        <p className="mb-4 text-sm">¿Está seguro de anular esta factura? Los cargos asociados serán liberados para poder ser facturados nuevamente.</p>
                        <div className="mb-4">
                            <label htmlFor="annulReason" className="block text-sm font-medium text-gray-700">Razón de la Anulación*</label>
                            <textarea id="annulReason" value={annulReason} onChange={(e) => setAnnulReason(e.target.value)} required rows="3" className="mt-1 w-full input-style"></textarea>
                        </div>
                        <div className="flex justify-end space-x-2">
                            <button type="button" onClick={() => setIsAnnulModalOpen(false)} className="btn-secondary">Cancelar</button>
                            <button type="submit" disabled={isSubmittingAnnul} className="btn-danger">{isSubmittingAnnul ? 'Anulando...' : 'Confirmar Anulación'}</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}

export default InvoicesPage;