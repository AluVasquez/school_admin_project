import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { createExpensePayment } from '../services/apiExpenses'; // Asumiendo que la función está en apiExpenses.js
import { toast } from 'react-toastify';

// Reutilizamos las constantes y helpers si es necesario, o las pasamos como props
const CURRENCIES = [
    { value: "USD", label: "USD ($)" },
    { value: "VES", label: "VES (Bs.)" },
    { value: "EUR", label: "EUR (€)" },
];

const initialPaymentFormData = {
  payment_date: new Date().toISOString().split('T')[0],
  amount_paid: '',
  currency_paid: 'VES', // Default a VES para pagos
  payment_method_used: '',
  reference_number: '',
  notes: '',
};

// Helper para formatear moneda (puedes moverlo a utils.js si lo usas en muchos sitios)
const formatCurrency = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return '0,00'; // Default a 0,00 si no es un número
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};


function RecordExpensePaymentModal({ isOpen, onClose, token, expenseToPay, onPaymentRegistered }) {
  const [paymentFormData, setPaymentFormData] = useState(initialPaymentFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (isOpen && expenseToPay) {
      // Pre-llenar moneda de pago si el gasto original fue en VES, o si la deuda es clara
      let defaultPaymentCurrency = 'VES';
      if (expenseToPay.currency === 'VES') {
          defaultPaymentCurrency = 'VES';
      } else if (expenseToPay.currency === 'USD') {
          defaultPaymentCurrency = 'USD'; // Sugerir pagar en la misma moneda del gasto si es USD
      }
      // Podrías también pre-llenar el monto si quieres sugerir pagar el total pendiente.
      // const pendingAmount = (expenseToPay.amount_ves_equivalent_at_creation || expenseToPay.amount) - expenseToPay.total_amount_paid_ves;

      setPaymentFormData({
        ...initialPaymentFormData,
        currency_paid: defaultPaymentCurrency,
        // amount_paid: pendingAmount > 0 ? pendingAmount.toFixed(2) : '', // Opcional: pre-llenar monto
      });
      setFormError(null);
    }
  }, [isOpen, expenseToPay]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPaymentFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token || !expenseToPay?.id) {
      toast.error("Falta información del gasto o autenticación.");
      return;
    }
    if (!paymentFormData.amount_paid || parseFloat(paymentFormData.amount_paid) <= 0) {
      toast.warn("El monto del pago debe ser un número positivo.");
      setFormError("El monto del pago debe ser un número positivo.");
      return;
    }
    if (!paymentFormData.payment_method_used) {
      toast.warn("Por favor, ingrese el método de pago.");
      setFormError("El método de pago es requerido.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const paymentPayload = {
        expense_id: expenseToPay.id,
        payment_date: paymentFormData.payment_date,
        amount_paid: parseFloat(paymentFormData.amount_paid),
        currency_paid: paymentFormData.currency_paid,
        payment_method_used: paymentFormData.payment_method_used,
        reference_number: paymentFormData.reference_number || null,
        notes: paymentFormData.notes || null,
      };
      await createExpensePayment(token, expenseToPay.id, paymentPayload);
      toast.success("Pago registrado exitosamente para el gasto!");
      if (onPaymentRegistered) {
        onPaymentRegistered(); // Llama al callback para refrescar la lista de gastos
      }
      onClose(); // Cierra el modal
    } catch (err) {
      const errorMessage = err.message || "Error al registrar el pago.";
      setFormError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !expenseToPay) return null;

  // Calcular deuda pendiente para mostrarla (informativo)
  const expenseAmountInVES = expenseToPay.currency === 'VES' 
                             ? expenseToPay.amount 
                             : (expenseToPay.amount_ves_equivalent_at_creation || 0);
  const pendingAmountVES = parseFloat(expenseAmountInVES) - parseFloat(expenseToPay.total_amount_paid_ves || 0);


  return (
    <Modal 
        isOpen={isOpen} 
        onClose={onClose} 
        title={`Registrar Pago para Gasto: "${expenseToPay.description.substring(0,30)}..." (ID: ${expenseToPay.id})`}
    >
      <div className="text-sm mb-3 p-3 bg-gray-50 rounded-md border">
        <p><strong>Monto Original del Gasto:</strong> {formatCurrency(expenseToPay.amount, expenseToPay.currency)}</p>
        <p><strong>Total Pagado (VES):</strong> {formatCurrency(expenseToPay.total_amount_paid_ves, 'VES')}</p>
        <p className="font-semibold"><strong>Deuda Pendiente (aprox. VES):</strong> {formatCurrency(pendingAmountVES, 'VES')}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <div>
          <label htmlFor="payment_date_expense_modal" className="block text-sm font-medium text-gray-700">Fecha del Pago*</label>
          <input type="date" name="payment_date" id="payment_date_expense_modal" value={paymentFormData.payment_date} onChange={handleInputChange} required className="mt-1 block w-full input-style"/>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
              <label htmlFor="amount_paid_expense_modal" className="block text-sm font-medium text-gray-700">Monto Pagado*</label>
              <input type="number" name="amount_paid" id="amount_paid_expense_modal" value={paymentFormData.amount_paid} onChange={handleInputChange} required min="0.01" step="0.01" className="mt-1 block w-full input-style" placeholder="Ej: 50.00"/>
          </div>
          <div>
              <label htmlFor="currency_paid_expense_modal" className="block text-sm font-medium text-gray-700">Moneda del Pago*</label>
              <select name="currency_paid" id="currency_paid_expense_modal" value={paymentFormData.currency_paid} onChange={handleInputChange} required className="mt-1 block w-full input-style-select">
                  {CURRENCIES.map(curr => <option key={curr.value} value={curr.value}>{curr.label}</option>)}
              </select>
          </div>
        </div>
        <div>
          <label htmlFor="payment_method_used_expense_modal" className="block text-sm font-medium text-gray-700">Método de Pago Usado*</label>
          <input type="text" name="payment_method_used" id="payment_method_used_expense_modal" value={paymentFormData.payment_method_used} onChange={handleInputChange} required className="mt-1 block w-full input-style" placeholder="Ej: Transferencia Banco Mercantil"/>
        </div>
        <div>
          <label htmlFor="reference_number_expense_modal" className="block text-sm font-medium text-gray-700">Nro. Referencia (Opcional)</label>
          <input type="text" name="reference_number" id="reference_number_expense_modal" value={paymentFormData.reference_number} onChange={handleInputChange} className="mt-1 block w-full input-style"/>
        </div>
        <div>
          <label htmlFor="payment_notes_expense_modal" className="block text-sm font-medium text-gray-700">Notas del Pago (Opcional)</label>
          <textarea name="notes" id="payment_notes_expense_modal" value={paymentFormData.notes} onChange={handleInputChange} rows="2" className="mt-1 block w-full input-style"></textarea>
        </div>
        {formError && <p className="text-red-500 text-xs italic text-center py-1 bg-red-50 rounded">{formError}</p>}
        <div className="pt-5 flex justify-end space-x-3 border-t">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Cancelar
          </button>
          <button 
            type="submit" 
            disabled={isSubmitting} 
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          >
            {isSubmitting ? 'Registrando Pago...' : 'Confirmar Pago'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default RecordExpensePaymentModal;