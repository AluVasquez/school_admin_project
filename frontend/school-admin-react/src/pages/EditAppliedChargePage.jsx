import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAppliedChargeById, updateAppliedCharge } from '../services/apiAppliedCharges';
import { getChargeConcepts } from '../services/apiChargeConcepts'; // Para mostrar info o si se permite cambiar concepto
import { toast } from 'react-toastify';

// Opciones para el filtro de estado (deben coincidir con AppliedChargeStatus del backend)
const STATUS_OPTIONS = [
    { value: "pending", label: "Pendiente" },
    { value: "paid", label: "Pagado" },
    { value: "partially_paid", label: "Parcialmente Pagado" },
    { value: "overdue", label: "Vencido" },
    { value: "cancelled", label: "Cancelado" },
];

const initialFormData = {
  student_id: '', // No editable aquí, solo informativo
  charge_concept_id: '', // No editable aquí, solo informativo
  description: '',
  amount_due_ves: '', // No editable directamente por el usuario, se calcula en backend
  issue_date: '',
  due_date: '',
  status: 'pending',
  // Campos informativos que se cargarán:
  student_name: '',
  charge_concept_name: '',
  original_concept_amount: '',
  original_concept_currency: '',
  exchange_rate_applied: '',
  amount_paid_ves: ''
};

function EditAppliedChargePage() {
  const { appliedChargeId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState(initialFormData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [canEditDetails, setCanEditDetails] = useState(true); // Para controlar campos editables

  const loadAppliedCharge = useCallback(async () => {
    if (!token || !appliedChargeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const chargeData = await getAppliedChargeById(token, appliedChargeId);
      const formattedIssueDate = chargeData.issue_date ? chargeData.issue_date.split('T')[0] : '';
      const formattedDueDate = chargeData.due_date ? chargeData.due_date.split('T')[0] : '';

      setFormData({
        student_id: chargeData.student?.id || '',
        charge_concept_id: chargeData.charge_concept?.id || '',
        description: chargeData.description || '',
        amount_due_ves: parseFloat(chargeData.amount_due_ves || 0).toFixed(2),
        issue_date: formattedIssueDate,
        due_date: formattedDueDate,
        status: chargeData.status || 'pending',
        student_name: `${chargeData.student?.first_name || ''} ${chargeData.student?.last_name || ''}`,
        charge_concept_name: chargeData.charge_concept?.name || '',
        original_concept_amount: chargeData.original_concept_amount?.toLocaleString(undefined, {minimumFractionDigits:2}) || '',
        original_concept_currency: chargeData.original_concept_currency || '',
        exchange_rate_applied: chargeData.exchange_rate_applied || '',
        amount_paid_ves: parseFloat(chargeData.amount_paid_ves || 0).toFixed(2)
      });

      // Lógica de restricciones de edición según el estado del cargo (del backend)
      // Tu backend tiene la lógica en crud.update_applied_charge
      // Aquí simulamos una restricción simple: si está pagado o cancelado, no se editan fechas ni descripción.
      if (chargeData.status === 'paid' || chargeData.status === 'cancelled') {
        setCanEditDetails(false);
      } else {
        setCanEditDetails(true);
      }

    } catch (err) {
      setError(err.message);
      toast.error(`Error al cargar cargo aplicado: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [token, appliedChargeId]);

  useEffect(() => {
    loadAppliedCharge();
  }, [loadAppliedCharge]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      toast.error("Error de autenticación.");
      return;
    }
    // Validaciones básicas
    if (!formData.issue_date || !formData.due_date || !formData.status) {
        toast.error("Fechas y estado son requeridos.");
        return;
    }
    if (new Date(formData.due_date) < new Date(formData.issue_date)) {
        toast.error("La fecha de vencimiento no puede ser anterior a la fecha de emisión.");
        return;
    }

    setIsSubmitting(true);
    setError(null);

    // El schema AppliedChargeUpdate del backend espera estos campos:
    // description, amount_due_ves (opcional, pero con cuidado), issue_date, due_date, status
    // NO enviaremos amount_due_ves desde el frontend si no queremos que el usuario lo modifique directamente.
    // Si se cambian las fechas, y el backend recalcula montos (ej. por tasa de cambio en issue_date),
    // el `createAppliedCharge` es el que tiene esa lógica, `updateAppliedCharge` usualmente no.
    // Por ahora, solo actualizaremos los campos permitidos por AppliedChargeUpdate.
    const dataToUpdate = {
      description: formData.description || null,
      issue_date: formData.issue_date,
      due_date: formData.due_date,
      status: formData.status,
      // amount_due_ves: formData.amount_due_ves ? parseFloat(formData.amount_due_ves) : undefined, // Comentado, no permitir editar monto directamente
    };

    // Si el cargo no es editable (pagado/cancelado), solo permitir cambiar el estado a "cancelado" si estaba "pagado"
    // o no permitir ningún cambio si estaba "cancelado". La lógica exacta está en el backend.
    // Aquí solo evitamos enviar campos no permitidos.
    if (!canEditDetails && formData.status !== 'cancelled') {
        // Si no es editable y no se está intentando cancelar, solo enviar el status si es el único cambio permitido.
        // La lógica del backend en update_applied_charge es la que realmente manda.
        // Para ser más precisos, deberíamos ver qué permite exactamente el backend.
        // Por ahora, si canEditDetails es false, solo permitimos enviar el status.
        const restrictedUpdate = { status: formData.status };
        if (formData.description !== initialFormData.description) { // Asumiendo que initialFormData se carga bien con los datos originales
             restrictedUpdate.description = formData.description; // Permitir cambiar descripción
        }

         // Validar si el estado original era PAID y el nuevo es CANCELLED
        const originalStatus = (await getAppliedChargeById(token, appliedChargeId)).status; // Recargar para el estado original
        if (originalStatus === 'paid' && formData.status === 'cancelled') {
            // Permitir este cambio específico
        } else if (originalStatus === 'cancelled' && formData.status !== 'cancelled') {
             toast.error("Un cargo cancelado no puede cambiar su estado a menos que sea otra cancelación (lo cual no tiene sentido).");
             setIsSubmitting(false);
             return;
        } else if (originalStatus === 'paid' && formData.status !== 'paid' && formData.status !== 'cancelled') {
            toast.error("Un cargo pagado solo puede cambiar su estado a cancelado.");
            setIsSubmitting(false);
            return;
        }


        try {
            await updateAppliedCharge(token, appliedChargeId, restrictedUpdate);
            toast.success("Cargo Aplicado actualizado (estado/descripción).");
            loadAppliedCharge(); // Recargar para ver el estado actualizado
        } catch (err) {
            setError(err.message);
            toast.error(`Error al actualizar cargo: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
        return;
    }


    try {
      await updateAppliedCharge(token, appliedChargeId, dataToUpdate);
      toast.success("¡Cargo Aplicado actualizado exitosamente!");
      // navigate('/applied-charges'); // O recargar datos en esta página
      loadAppliedCharge();
    } catch (err) {
      setError(err.message);
      toast.error(`Error al actualizar cargo: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="p-6"><h1 className="text-2xl font-bold mb-6">Editar Cargo Aplicado</h1><p>Cargando datos del cargo...</p></div>;
  }
  if (error && !isSubmitting) {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Editar Cargo Aplicado</h1>
            <p className="text-red-500 bg-red-100 p-3 rounded mb-4">Error al cargar: {error}</p>
            <Link to="/applied-charges" className="text-indigo-600 hover:text-indigo-800 mt-4 inline-block">
                &larr; Volver a la lista de cargos
            </Link>
        </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-white shadow-xl rounded-lg max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-2">
        <h1 className="text-2xl font-bold text-gray-800">
          Editar Cargo Aplicado <span className="text-indigo-600">(ID: {appliedChargeId})</span>
        </h1>
        <Link to="/applied-charges" className="text-sm text-indigo-600 hover:text-indigo-800 self-start sm:self-center">
          &larr; Volver a la lista
        </Link>
      </div>

      <div className="space-y-3 mb-6 p-4 border rounded-md bg-gray-50 text-sm">
        <p><strong>Estudiante:</strong> {formData.student_name || 'N/A'} (ID: {formData.student_id || 'N/A'})</p>
        <p><strong>Concepto:</strong> {formData.charge_concept_name || 'N/A'} (ID: {formData.charge_concept_id || 'N/A'})</p>
        {formData.original_concept_amount && (
            <p><strong>Monto Original Concepto:</strong> {formData.original_concept_amount} {formData.original_concept_currency}
            {formData.exchange_rate_applied && ` (Tasa Aplicada: ${formData.exchange_rate_applied})`}</p>
        )}
        <p><strong>Monto Adeudado (VES):</strong> {parseFloat(formData.amount_due_ves || 0).toLocaleString('es-VE', { style: 'currency', currency: 'VES' })}</p>
        <p><strong>Monto Pagado (VES):</strong> {parseFloat(formData.amount_paid_ves || 0).toLocaleString('es-VE', { style: 'currency', currency: 'VES' })}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset className="border p-4 rounded-md">
          <legend className="text-lg font-semibold text-gray-700 px-2">Detalles del Cargo</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-2">
            <div>
              <label htmlFor="issue_date_applied_charge" className="block text-sm font-medium text-gray-700">Fecha de Emisión</label>
              <input 
                type="date" 
                name="issue_date" 
                id="issue_date_applied_charge" 
                value={formData.issue_date} 
                onChange={handleInputChange} 
                required 
                className="mt-1 block w-full input-style"
                disabled={!canEditDetails} 
              />
            </div>
            <div>
              <label htmlFor="due_date_applied_charge" className="block text-sm font-medium text-gray-700">Fecha de Vencimiento</label>
              <input 
                type="date" 
                name="due_date" 
                id="due_date_applied_charge" 
                value={formData.due_date} 
                onChange={handleInputChange} 
                required 
                className="mt-1 block w-full input-style"
                disabled={!canEditDetails}
              />
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="description_applied_charge" className="block text-sm font-medium text-gray-700">Descripción Específica (Opcional)</label>
            <textarea 
                name="description" 
                id="description_applied_charge" 
                value={formData.description} 
                onChange={handleInputChange} 
                rows="3" 
                className="mt-1 block w-full input-style"
                // Se permite editar descripción incluso si está pagado/cancelado según tu crud.py
            ></textarea>
          </div>
          <div className="mt-4">
            <label htmlFor="status_applied_charge" className="block text-sm font-medium text-gray-700">Estado del Cargo</label>
            <select 
                name="status" 
                id="status_applied_charge" 
                value={formData.status} 
                onChange={handleInputChange} 
                required 
                className="mt-1 block w-full input-style-select"
                // La lógica de qué estados se pueden seleccionar aquí es compleja
                // ya que depende del estado actual y las reglas del backend.
                // El backend validará si el cambio de estado es permitido.
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
             {!canEditDetails && formData.status !== 'cancelled' && (
                <p className="text-xs text-yellow-600 mt-1">
                    Para cargos pagados, solo puede cambiar el estado a "Cancelado". 
                    Otros campos (excepto descripción) no son editables.
                </p>
            )}
            {!canEditDetails && formData.status === 'cancelled' && (
                 <p className="text-xs text-gray-500 mt-1">
                    Este cargo está cancelado. Solo la descripción es editable.
                </p>
            )}

          </div>
        </fieldset>

        {error && isSubmitting && (
          <p className="text-red-500 text-sm text-center bg-red-100 p-2 rounded mt-4">{error}</p>
        )}

        <div className="pt-5 flex justify-end space-x-3 border-t border-gray-200 mt-8">
          <Link to="/applied-charges" className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-all">
            Cancelar
          </Link>
          <button 
            type="submit" 
            disabled={isSubmitting || isLoading } // No permitir submit si está cargando datos originales
            className="inline-flex items-center gap-x-2 px-3 py-2 text-sm font-bold text-white bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-800 rounded-lg shadow-lg hover:shadow-sky-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-300 transform hover:-translate-y-px"
          >
            {isSubmitting ? 'Guardando Cambios...' : 'Guardar Cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default EditAppliedChargePage;