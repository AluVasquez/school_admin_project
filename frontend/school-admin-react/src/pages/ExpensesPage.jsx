// src/pages/ExpensesPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '@headlessui/react';
import { toast } from 'react-toastify';
import { FaPlus, FaTimes } from 'react-icons/fa';

// Componentes reutilizables
import CustomListbox from '../components/common/CustomListbox';
import PageTitle from '../components/common/PageTitle';
import PrimaryButton from '../components/common/PrimaryButton';
import ExpenseDetailsModal from '../components/modals/ExpenseDetailsModal';
import ExpensesTable from '../components/tables/ExpensesTable';
import LoadingSpinner from '../components/common/LoadingSpinner';

// Servicios de API
import { getAllExpenses, createExpense } from '../services/apiExpenses';
import { getAllSuppliers } from '../services/apiSuppliers';
import { getAllExpenseCategories } from '../services/apiExpenseCategories';
import { formatDateForInput } from '../utils/dateUtils';

const ExpensesPage = () => {
    // Estados para la data
    const [expenses, setExpenses] = useState([]);
    const [suppliersList, setSuppliersList] = useState([]);
    const [expenseCategoriesList, setExpenseCategoriesList] = useState([]);
    const [selectedExpense, setSelectedExpense] = useState(null);

    // Estados para la UI
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingDropdowns, setIsLoadingDropdowns] = useState(true);
    const [isNewExpenseModalOpen, setIsNewExpenseModalOpen] = useState(false);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Estado inicial del formulario modal
    const initialExpenseFormData = {
        expense_date: formatDateForInput(new Date()),
        description: '',
        supplier_id: '',
        category_id: '', // <-- CORRECCIÓN: Campo añadido
        amount: '',
        currency: 'USD',
        notes: '',
        invoice_document_url: '',
    };
    const [expenseFormData, setExpenseFormData] = useState(initialExpenseFormData);

    // Cargar todos los datos necesarios al montar el componente
    const fetchRequiredData = useCallback(async () => {
        setIsLoading(true);
        setIsLoadingDropdowns(true);
        try {
            const [expensesData, suppliersData, categoriesData] = await Promise.all([
                getAllExpenses(),
                getAllSuppliers(),
                getAllExpenseCategories()
            ]);
            setExpenses(expensesData.sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date)));
            setSuppliersList(suppliersData);
            setExpenseCategoriesList(categoriesData);
        } catch (error) {
            toast.error("Error al cargar los datos. Por favor, recarga la página.");
        } finally {
            setIsLoading(false);
            setIsLoadingDropdowns(false);
        }
    }, []);

    useEffect(() => {
        fetchRequiredData();
    }, [fetchRequiredData]);

    // Manejadores de eventos
    const handleModalFormChange = (e) => {
        const { name, value } = e.target;
        setExpenseFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleOpenModal = (expense) => {
        setSelectedExpense(expense);
        setIsDetailsModalOpen(true);
    };

    const handleSubmitNewExpense = async (e) => {
        e.preventDefault();
        // <-- CORRECCIÓN: Validación para categoría
        if (!expenseFormData.category_id || !expenseFormData.supplier_id || !expenseFormData.amount || !expenseFormData.description) {
            toast.warn("Por favor, complete todos los campos requeridos (*).");
            return;
        }

        const dataToSubmit = {
            expense_date: expenseFormData.expense_date,
            description: expenseFormData.description,
            supplier_id: expenseFormData.supplier_id ? parseInt(expenseFormData.supplier_id) : null,
            category_id: parseInt(expenseFormData.category_id), // <-- CORRECCIÓN: Se añade al envío
            amount: parseFloat(expenseFormData.amount),
            currency: expenseFormData.currency,
            notes: expenseFormData.notes,
        };

        try {
            await createExpense(dataToSubmit);
            toast.success("¡Gasto registrado con éxito!");
            setIsNewExpenseModalOpen(false);
            setExpenseFormData(initialExpenseFormData);
            fetchRequiredData(); // Recargar la lista de gastos
        } catch (error) {
            console.error("Error al registrar el gasto:", error);
            const errorMessage = error.response?.data?.detail || "No se pudo registrar el gasto.";
            toast.error(errorMessage);
        }
    };

    // Filtrar gastos según el término de búsqueda
    const filteredExpenses = expenses.filter(expense =>
        expense.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.category.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isLoading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-slate-50">
            <PageTitle title="Gestión de Gastos y Compras" />

            <div className="flex justify-between items-center mb-6">
                <div className="w-1/3">
                    <input
                        type="text"
                        placeholder="Buscar por descripción, proveedor..."
                        className="p-2 border border-slate-300 rounded-md w-full focus:ring-2 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <PrimaryButton onClick={() => setIsNewExpenseModalOpen(true)}>
                    <FaPlus className="mr-2" />
                    Registrar Gasto
                </PrimaryButton>
            </div>

            <ExpensesTable expenses={filteredExpenses} onRowClick={handleOpenModal} />

            {/* Modal para registrar nuevo gasto */}
            <Dialog open={isNewExpenseModalOpen} onClose={() => setIsNewExpenseModalOpen(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
                    <Dialog.Panel className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
                        <Dialog.Title className="text-xl font-semibold text-slate-800 flex justify-between items-center">
                            Registrar Nuevo Gasto
                            <button onClick={() => setIsNewExpenseModalOpen(false)} className="text-slate-500 hover:text-slate-800">
                                <FaTimes />
                            </button>
                        </Dialog.Title>
                        <hr className="my-4" />

                        <form onSubmit={handleSubmitNewExpense} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium leading-6 text-slate-700">Descripción*</label>
                                <input type="text" name="description" value={expenseFormData.description} onChange={handleModalFormChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium leading-6 text-slate-700">Proveedor*</label>
                                <CustomListbox
                                    name="supplier_id"
                                    options={suppliersList.map(s => ({ value: s.id, label: s.name }))}
                                    value={expenseFormData.supplier_id}
                                    onChange={handleModalFormChange}
                                    placeholder="Seleccionar proveedor..."
                                    disabled={isLoadingDropdowns}
                                />
                            </div>

                            {/* --- INICIO DE LA CORRECCIÓN --- */}
                            <div>
                                <label className="block text-sm font-medium leading-6 text-slate-700">Categoría*</label>
                                <CustomListbox
                                    name="category_id"
                                    options={expenseCategoriesList.map(c => ({ value: c.id, label: c.name }))}
                                    value={expenseFormData.category_id}
                                    onChange={handleModalFormChange}
                                    placeholder="Seleccionar categoría..."
                                    disabled={isLoadingDropdowns}
                                />
                            </div>
                            {/* --- FIN DE LA CORRECCIÓN --- */}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Monto*</label>
                                    <input type="number" name="amount" value={expenseFormData.amount} onChange={handleModalFormChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Fecha*</label>
                                    <input type="date" name="expense_date" value={expenseFormData.expense_date} onChange={handleModalFormChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm" required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Notas (Opcional)</label>
                                <textarea name="notes" value={expenseFormData.notes} onChange={handleModalFormChange} rows="3" className="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                            </div>
                            <div className="flex justify-end pt-4">
                                <PrimaryButton type="submit">Registrar</PrimaryButton>
                            </div>
                        </form>
                    </Dialog.Panel>
                </div>
            </Dialog>

            {/* Modal para ver detalles del gasto */}
            {selectedExpense && (
                <ExpenseDetailsModal
                    isOpen={isDetailsModalOpen}
                    onClose={() => setIsDetailsModalOpen(false)}
                    expense={selectedExpense}
                />
            )}
        </div>
    );
};

export default ExpensesPage;