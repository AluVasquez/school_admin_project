// frontend/school-admin-react/src/App.jsx

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './layouts/DashboardLayout';
import DashboardPage from './pages/DashboardPage';
import RepresentativesPage from './pages/RepresentativesPage';
import EditRepresentativePage from './pages/EditRepresentativePage';
import StudentsPage from './pages/StudentsPage';
import CreateStudentPage from './pages/CreateStudentPage'; 
import EditStudentPage from './pages/EditStudentPage'; 
import SettingsPage from './pages/SettingsPage';
import GradeLevelsPage from './pages/GradeLevelsPage';
import ChargeConceptsPage from './pages/ChargeConceptsPage';
import AppliedChargesPage from './pages/AppliedChargesPage';
import EditAppliedChargePage from './pages/EditAppliedChargePage';
import PaymentsPage from './pages/PaymentsPage';
import PaymentDetailsPage from './pages/PaymentDetailsPage';
import RepresentativeStatementPage from './pages/RepresentativeStatementPage';
import ProcurementPage from './pages/ProcurementPage'; 
import ExpensesPage from './pages/ExpensesPage';
import InvoicesPage from './pages/InvoicesPage'; 
import InvoiceDetailsPage from './pages/InvoiceDetailsPage';
import CreditNotesPage from './pages/CreditNotesPage'; 
import CreditNoteDetailsPage from './pages/CreditNoteDetailsPage';
import EditExpensePage from './pages/EditExpensePage';
import ExpenseReportsPage from './pages/ExpenseReportPage';
import StudentFinancialMatrixPage from './pages/StudentFinancialMatrixPage';
import OrganizationPage from './pages/OrganizationPage';
import EmployeesPage from './pages/EmployeesPage';
import CreateEmployeePage from './pages/CreateEmployeePage';
import EditEmployeePage from './pages/EditEmployeePage';
import SalaryComponentDefinitionsPage from './pages/SalaryComponentDefinitionsPage';
import PayrollRunsPage from './pages/PayrollRunsPage';
import PayrollRunDetailsPage from './pages/PayrollRunDetailsPage';
import PayslipsHistoryPage from './pages/PayslipsHistoryPage';
import PayslipDetailPage from './pages/PayslipDetailPage';
import TimeManagementPage from './pages/TimeManagementPage';
import LeaveManagementPage from './pages/LeaveManagementPage';
import PayrollCostReportPage from './pages/PayrollCostReportPage';
import { ToastContainer } from 'react-toastify'; 
import 'react-toastify/dist/ReactToastify.css';  

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function App() {
  return (
    <> {/* <--- Acá envolvemos la guarandinga del tostify para los estilos de popups */}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Routes>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="representatives" element={<RepresentativesPage />} />
                  <Route path="representatives/:representativeId/edit" element={<EditRepresentativePage />} />
                  <Route path="representatives/:representativeId/students/new" element={<CreateStudentPage />} />
                  <Route path="representatives/:representativeId/statement" element={<RepresentativeStatementPage />} />                
                  <Route path="students" element={<StudentsPage />} />
                  <Route path="students/new" element={<CreateStudentPage />} />
                  <Route path="students/:studentId/edit" element={<EditStudentPage />} />
                  <Route path="grade-levels" element={<GradeLevelsPage />} />
                  <Route path="charge-concepts" element={<ChargeConceptsPage />} />
                  <Route path="applied-charges" element={<AppliedChargesPage />} />
                  <Route path="applied-charges/:appliedChargeId/edit" element={<EditAppliedChargePage />} />
                  <Route path="payments" element={<PaymentsPage />} />
                  <Route path="payments/:paymentId/details" element={<PaymentDetailsPage />} />
                  <Route path="invoices" element={<InvoicesPage />} />
                  <Route path="invoices/:invoiceId" element={<InvoiceDetailsPage />} />
                  <Route path="credit-notes" element={<CreditNotesPage />} />
                  <Route path="credit-notes/:creditNoteId" element={<CreditNoteDetailsPage />} />
                  <Route path="expenses" element={<ExpensesPage />} />
                  <Route path="procurement" element={<ProcurementPage />} />
                  <Route path="/expenses/:expenseId/edit" element={<EditExpensePage />} />
                  <Route path="expense-reports" element={<ExpenseReportsPage />} />                 
                  <Route path="/students/financial-matrix" element={<StudentFinancialMatrixPage />} />
                  <Route path="personnel/organization" element={<OrganizationPage />} />
                  <Route path="personnel/employees" element={<EmployeesPage />} />
                  <Route path="personnel/employees/new" element={<CreateEmployeePage />} />
                  <Route path="personnel/employees/:employeeId/edit" element={<EditEmployeePage />} />
                  <Route path="personnel/salary-component-definitions" element={<SalaryComponentDefinitionsPage />} />
                  <Route path="personnel/payroll-runs" element={<PayrollRunsPage />} />
                  <Route path="personnel/payroll-runs/:runId/details" element={<PayrollRunDetailsPage />} />
                  <Route path="personnel/payslips" element={<PayslipsHistoryPage />} />
                  <Route path="personnel/payslips/:payslipId" element={<PayslipDetailPage />} />
                  <Route path="personnel/time-management" element={<TimeManagementPage />} />
                  <Route path="personnel/leave-management" element={<LeaveManagementPage />} />
                  <Route path="/personnel/payroll-runs/:runId/cost-report" element={<PayrollCostReportPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<div><h1 className="text-xl font-bold">Página no encontrada dentro del panel</h1><p>Error 404</p></div>} />
                </Routes>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
      <ToastContainer 
        position="top-right"
        autoClose={5000} 
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored" // Puedes usar "light", "dark", o "colored"
      />
    </>
  );
}

export default App;