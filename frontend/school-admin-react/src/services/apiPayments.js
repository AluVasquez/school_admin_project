const API_BASE_URL = "http://127.0.0.1:8000"; // Idealmente, esta URL debería ser una constante global o una variable de entorno

/**
 * Obtiene la lista de pagos con filtros y paginación.
 * Backend: GET /payments/
 * Espera una respuesta paginada: { items: [], total: ..., page: ..., ... }
 */
export async function getPayments(token, {
    skip = 0,
    limit = 10,
    representativeId = null,
    startDate = null, // YYYY-MM-DD
    endDate = null,   // YYYY-MM-DD
    paymentMethod = null,
    currencyPaid = null // Enum: VES, USD, EUR
} = {}) {
    try {
        const queryParams = new URLSearchParams({
            skip: skip.toString(),
            limit: limit.toString(),
        });

        if (representativeId !== null) queryParams.append('representative_id', representativeId.toString());
        if (startDate) queryParams.append('start_date', startDate);
        if (endDate) queryParams.append('end_date', endDate);
        if (paymentMethod) queryParams.append('payment_method', paymentMethod);
        if (currencyPaid) queryParams.append('currency_paid', currencyPaid);
        // sortBy y sortOrder podrían añadirse si el backend los soporta para pagos

        const response = await fetch(`${API_BASE_URL}/payments/?${queryParams.toString()}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json(); // Espera { items: [], total: ..., ... }
    } catch (error) {
        console.error('Error fetching payments:', error);
        throw error;
    }
}

/**
 * Obtiene los detalles de un pago específico, incluyendo sus asignaciones.
 * Backend: GET /payments/{payment_id}
 * El backend carga datos del representante, asignaciones, y dentro de ellas, el cargo aplicado con su estudiante y concepto. [cite: 158]
 */
export async function getPaymentById(token, paymentId) {
    try {
        const response = await fetch(`${API_BASE_URL}/payments/${paymentId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching payment by ID ${paymentId}:`, error);
        throw error;
    }
}

/**
 * Registra un nuevo pago y sus asignaciones a cargos aplicados.
 * Backend: POST /payments/
 * paymentData debe coincidir con schemas.PaymentCreate del backend.
 * El backend calcula el amount_paid_ves_equivalent y actualiza los AppliedCharge afectados. [cite: 153, 156]
 */
export async function createPayment(token, paymentData) {
    // paymentData ahora se espera que tenga:
    // {
    //   representative_id,
    //   payment_date,
    //   amount_paid,        // Monto en la moneda original del pago
    //   currency_paid,      // Moneda original del pago (VES, USD, EUR)
    //   payment_method,
    //   reference_number,
    //   notes,
    //   allocations_details: [
    //     {
    //       applied_charge_id: int,
    //       amount_to_allocate: float // <--- ESTE ES EL MONTO EN LA currency_paid
    //     }
    //   ]
    // }
    try {
      const response = await fetch(`${API_BASE_URL}/payments/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData), // Enviamos paymentData tal cual, el backend hará la conversión de allocations
      });
  
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}: ${response.statusText}` }));
        throw new Error(errorData.detail || `Error ${response.status}`);
      }
      return await response.json(); // Devuelve el objeto Payment creado con sus detalles
    } catch (error) {
      console.error('Error creating payment:', error);
      throw error;
    }
  }