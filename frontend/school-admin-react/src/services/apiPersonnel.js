// frontend/school-admin-react/src/services/apiPersonnel.js

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Helper para manejar respuestas y errores de fetch
async function handleApiResponse(response) {
    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { detail: `Error ${response.status}: ${response.statusText || "Respuesta no válida del servidor."}` };
        }
        throw new Error(errorData.detail || `Error ${response.status}`);
    }
    if (response.status === 204) return null;
    return await response.json();
}

// --- Funciones para Departments ---
export async function getDepartments(token, { skip = 0, limit = 100, search = null } = {}) {
    try {
        const queryParams = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
        if (search) queryParams.append('search', search);
        const response = await fetch(`${API_BASE_URL}/personnel/departments/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error('Error fetching departments:', error); throw error; }
}
export async function createDepartment(token, departmentData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/departments/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(departmentData),
        });
        return handleApiResponse(response);
    } catch (error) { console.error('Error creating department:', error); throw error; }
}
export async function updateDepartment(token, departmentId, departmentData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/departments/${departmentId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(departmentData),
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error updating department ${departmentId}:`, error); throw error; }
}
export async function deleteDepartment(token, departmentId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/departments/${departmentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error deleting department ${departmentId}:`, error); throw error; }
}

// --- Funciones para Positions ---
export async function getPositions(token, { skip = 0, limit = 100, search = null, departmentId = null } = {}) {
    try {
        const queryParams = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
        if (search) queryParams.append('search', search);
        if (departmentId !== null) queryParams.append('department_id', departmentId.toString());
        const response = await fetch(`${API_BASE_URL}/personnel/positions/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error('Error fetching positions:', error); throw error; }
}
export async function createPosition(token, positionData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/positions/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(positionData),
        });
        return handleApiResponse(response);
    } catch (error) { console.error('Error creating position:', error); throw error; }
}
export async function updatePosition(token, positionId, positionData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/positions/${positionId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(positionData),
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error updating position ${positionId}:`, error); throw error; }
}
export async function deletePosition(token, positionId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/positions/${positionId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error deleting position ${positionId}:`, error); throw error; }
}

// --- Funciones para Employees ---

export async function getEmployees(token, {
    skip = 0, limit = 10, search = null,
    position_id = null,
    department_id = null,
    is_active = null,
    balance_filter = null,
    pay_frequency = null
} = {}) {
    try {
        const queryParams = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
        if (search) queryParams.append('search', search);
        if (position_id !== null) queryParams.append('position_id', position_id.toString());
        if (department_id !== null) queryParams.append('department_id', department_id.toString());
        if (is_active !== null) queryParams.append('is_active', is_active.toString());
        if (balance_filter) queryParams.append('balance_filter', balance_filter);
        if (pay_frequency) queryParams.append('pay_frequency', pay_frequency); // <-- LÍNEA ESENCIAL

        const response = await fetch(`${API_BASE_URL}/personnel/employees/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error('Error fetching employees:', error); throw error; }
}

export async function getEmployeeById(token, employeeId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error fetching employee ${employeeId}:`, error); throw error; }
}

export async function createEmployee(token, employeeData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employees/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(employeeData),
        });
        return handleApiResponse(response);
    } catch (error) { console.error('Error creating employee:', error); throw error; }
}

export async function updateEmployee(token, employeeId, employeeData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(employeeData),
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error updating employee ${employeeId}:`, error); throw error; }
}

export async function activateEmployee(token, employeeId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}/activate`, {
            method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error activating employee ${employeeId}:`, error); throw error; }
}

export async function deactivateEmployee(token, employeeId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}/deactivate`, {
            method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error deactivating employee ${employeeId}:`, error); throw error; }
}

export async function uploadEmployeePhoto(token, employeeId, photoFile) {
    const formData = new FormData();
    formData.append("photo_file", photoFile);
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}/upload-photo`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData,
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error uploading photo for employee ${employeeId}:`, error); throw error; }
}

// --- Funciones para SalaryComponentDefinition ---
export async function getSalaryComponentDefinitions(token, { 
    skip = 0, limit = 100, isActive = null, componentType = null, search = null 
} = {}) {
    try {
        const queryParams = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
        if (search) queryParams.append('search', search);
        if (isActive !== null) queryParams.append('is_active', isActive.toString());
        if (componentType) queryParams.append('component_type', componentType);
        const response = await fetch(`${API_BASE_URL}/personnel/salary-component-definitions/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error('Error fetching salary component definitions:', error); throw error; }
}

export async function createSalaryComponentDefinition(token, definitionData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/salary-component-definitions/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(definitionData),
        });
        return handleApiResponse(response);
    } catch (error) { console.error('Error creating salary component definition:', error); throw error; }
}

export async function updateSalaryComponentDefinition(token, definitionId, definitionData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/salary-component-definitions/${definitionId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(definitionData),
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error updating salary component definition ${definitionId}:`, error); throw error; }
}

export async function deleteSalaryComponentDefinition(token, definitionId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/salary-component-definitions/${definitionId}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error deleting salary component definition ${definitionId}:`, error); throw error; }
}

// --- Funciones para EmployeeSalaryComponent (Asignaciones) ---
export async function getSalaryComponentsForEmployee(token, employeeId, isActive = null) {
    try {
        const queryParams = new URLSearchParams();
        if (isActive !== null) queryParams.append('is_active', isActive.toString());
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}/salary-components/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error fetching salary components for employee ${employeeId}:`, error); throw error; }
}

export async function assignSalaryComponentToEmployee(token, assignmentData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employee-salary-components/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(assignmentData),
        });
        return handleApiResponse(response);
    } catch (error) { console.error('Error assigning salary component:', error); throw error; }
}

export async function updateEmployeeSalaryComponentAssignment(token, assignmentId, assignmentUpdateData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employee-salary-components/${assignmentId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(assignmentUpdateData),
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error updating assignment ${assignmentId}:`, error); throw error; }
}

export async function deleteEmployeeSalaryComponentAssignment(token, assignmentId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employee-salary-components/${assignmentId}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error deleting assignment ${assignmentId}:`, error); throw error; }
}

// --- Funciones para PayrollRun (Corridas de Nómina) ---
export async function createPayrollRunDraft(token, payrollRunCreateData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/payroll-runs/draft`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payrollRunCreateData),
        });
        return handleApiResponse(response);
    } catch (error) { console.error('Error creating payroll run draft:', error); throw error; }
}

export async function getPayrollRuns(token, { skip = 0, limit = 20, status = null, payFrequency = null, startDateFilter = null, endDateFilter = null } = {}) {
    try {
        const queryParams = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
        if (status) queryParams.append('status', status);
        if (payFrequency) queryParams.append('pay_frequency', payFrequency);
        if (startDateFilter) queryParams.append('start_date_filter', startDateFilter);
        if (endDateFilter) queryParams.append('end_date_filter', endDateFilter);
        const response = await fetch(`${API_BASE_URL}/personnel/payroll-runs/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error('Error fetching payroll runs:', error); throw error; }
}

export async function getPayrollRunById(token, payrollRunId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/payroll-runs/${payrollRunId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error fetching payroll run ${payrollRunId}:`, error); throw error; }
}

export async function confirmPayrollRun(token, payrollRunId, confirmPayload) {
    // confirmPayload: { employee_hours_input?: [{ employee_id: int, hours: float }] }
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/payroll-runs/${payrollRunId}/confirm`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(confirmPayload),
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error confirming payroll run ${payrollRunId}:`, error); throw error; }
}

export async function updatePayrollRunStatus(token, payrollRunId, statusUpdatePayload) {
    // statusUpdatePayload: { status: PayrollRunStatus, notes?: string }
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/payroll-runs/${payrollRunId}/status`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(statusUpdatePayload),
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error updating payroll run status ${payrollRunId}:`, error); throw error; }
}

export async function deletePayrollRunDraft(token, payrollRunId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/payroll-runs/${payrollRunId}/draft`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error deleting payroll run draft ${payrollRunId}:`, error); throw error; }
}

// --- Funciones para EmployeeBalanceAdjustment (Ajustes de Saldo) ---
export async function createEmployeeBalanceAdjustment(token, adjustmentData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employee-balance-adjustments/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(adjustmentData),
        });
        return handleApiResponse(response);
    } catch (error) { console.error('Error creating employee balance adjustment:', error); throw error; }
}

export async function getEmployeeBalanceAdjustments(token, employeeId, { skip = 0, limit = 20 } = {}) {
    try {
        const queryParams = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}/balance-adjustments/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error fetching balance adjustments for employee ${employeeId}:`, error); throw error; }
}

// --- Funciones para EmployeePayment (Pagos a Empleados) ---
/**
 * Crea un nuevo pago para un empleado, incluyendo las asignaciones detalladas.
 * @param {string} token El token de autenticación.
 * @param {object} paymentData Los datos del pago, incluyendo `allocations_details`.
 * @returns {Promise<object>} El objeto de pago creado.
 */
export async function createEmployeePayment(token, paymentData) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employee-payments/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentData),
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error('Error creating employee payment:', error);
        throw error;
    }
}

export async function getEmployeePayments(token, employeeId, { skip = 0, limit = 20 } = {}) {
    try {
        const queryParams = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}/payments-made/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) { console.error(`Error fetching payments for employee ${employeeId}:`, error); throw error; }
}

/**
 * Obtiene la lista de ítems por pagar para un empleado específico.
 * @param {string} token El token de autenticación.
 * @param {number|string} employeeId El ID del empleado.
 * @returns {Promise<Array<object>>} Una lista de EmployeePayableItem.
 */
export async function getEmployeePayableItems(token, employeeId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}/payable-items`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error(`Error fetching payable items for employee ${employeeId}:`, error);
        throw error;
    }
}

export async function createEmployeeLoan(token, loanData) {
    try {
        // El employee_id ya está en loanData, así que no necesitamos pasarlo en la URL.
        // Pero el endpoint es /employees/{employee_id}/loans, así que sí lo necesitamos.
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${loanData.employee_id}/loans`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(loanData),
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error('Error creando préstamo/adelanto:', error);
        throw error;
    }
}

export async function getLoansForEmployee(token, employeeId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}/loans`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error(`Error obteniendo préstamos para el empleado ${employeeId}:`, error);
        throw error;
    }
}

export async function runSocialBenefitsUpdate(token) {
    const response = await fetch(`${API_BASE_URL}/personnel/social-benefits/update-all`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}

export async function getEmployeeSeveranceReport(token, employeeId) {
    const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}/severance`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}

export async function getSalaryHistoryForEmployee(token, employeeId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}/salary-history`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error(`Error fetching salary history for employee ${employeeId}:`, error);
        throw error;
    }
}

export async function createAttendanceRecord(token, recordData) {
    const response = await fetch(`${API_BASE_URL}/personnel/attendance-records/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(recordData),
    });
    return handleApiResponse(response);
}

export async function getAttendanceForEmployee(token, employeeId, startDate, endDate) {
    const queryParams = new URLSearchParams({ start_date: startDate, end_date: endDate });
    const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}/attendance-records/?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}

export async function getLeaveTypes(token) {
    const response = await fetch(`${API_BASE_URL}/personnel/leave-types/`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}

export async function createLeaveType(token, typeData) {
    const response = await fetch(`${API_BASE_URL}/personnel/leave-types/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(typeData),
    });
    return handleApiResponse(response);
}

export async function updateLeaveType(token, typeId, typeData) {
    const response = await fetch(`${API_BASE_URL}/personnel/leave-types/${typeId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(typeData),
    });
    return handleApiResponse(response);
}

export async function deleteLeaveType(token, typeId) {
    const response = await fetch(`${API_BASE_URL}/personnel/leave-types/${typeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    // La respuesta 204 No Content no tiene cuerpo, así que la manejamos diferente
    if (response.status === 204) return { success: true };
    return handleApiResponse(response);
}

export async function createLeaveRequest(token, requestData) {
    const response = await fetch(`${API_BASE_URL}/personnel/leave-requests/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
    });
    return handleApiResponse(response);
}

export async function updateLeaveRequest(token, requestId, requestData) {
    const response = await fetch(`${API_BASE_URL}/personnel/leave-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
    });
    return handleApiResponse(response);
}

export async function getLeaveRequests(token, params = {}) {
    const queryParams = new URLSearchParams(params);
    const response = await fetch(`${API_BASE_URL}/personnel/leave-requests/?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleApiResponse(response);
}

export async function updateLeaveRequestStatus(token, requestId, status) {
    const response = await fetch(`${API_BASE_URL}/personnel/leave-requests/${requestId}/status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status }),
    });
    return handleApiResponse(response);
}

/**
 * Obtiene el reporte de costos para una corrida de nómina específica.
 * @param {string} token El token de autenticación.
 * @param {number|string} payrollRunId El ID de la corrida de nómina.
 * @returns {Promise<object>} Los datos del reporte de costos.
 */
export async function getPayrollCostReport(token, payrollRunId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/payroll-runs/${payrollRunId}/cost-report`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response); // Reutilizamos el manejador de errores
    } catch (error) {
        console.error(`Error fetching payroll cost report for run ${payrollRunId}:`, error);
        throw error;
    }
}


/**
 * Obtiene la lista de ítems con saldo a favor para un empleado específico (para aplicar deducciones).
 * @param {string} token El token de autenticación.
 * @param {number|string} employeeId El ID del empleado.
 * @returns {Promise<Array<object>>} Una lista de EmployeePayableItem.
 */
export async function getPositivePayableItemsForEmployee(token, employeeId) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/employees/${employeeId}/positive-payable-items`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error(`Error fetching positive payable items for employee ${employeeId}:`, error);
        throw error;
    }
}

/**
 * Ejecuta el proceso de actualización de prestaciones sociales para todos los empleados.
 * @param {string} token - El token de autenticación.
 * @returns {Promise<object>} - El resultado del proceso desde el backend.
 */
export async function runSocialBenefitsUpdateProcess(token) {
    try {
        const response = await fetch(`${API_BASE_URL}/personnel/social-benefits/update-all`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        // Asumiendo que tienes una función handleApiResponse
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Error running social benefits update process:', error);
        throw error;
    }
}