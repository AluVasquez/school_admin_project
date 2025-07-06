import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { fetchExchangeRateAlertStatus } from '../services/apiDashboard';
import { 
    HomeIcon, UsersIcon, AcademicCapIcon, UserGroupIcon, 
    CurrencyDollarIcon, DocumentTextIcon, BanknotesIcon, TableCellsIcon, 
    PrinterIcon, DocumentMinusIcon, BuildingLibraryIcon, BriefcaseIcon, 
    UserCircleIcon, Cog8ToothIcon, ArrowRightOnRectangleIcon, ChevronDownIcon,
    XMarkIcon, Bars3Icon, MagnifyingGlassIcon, BuildingStorefrontIcon,
    DocumentChartBarIcon, PresentationChartLineIcon, FingerPrintIcon, IdentificationIcon,
    WalletIcon, DocumentDuplicateIcon,
} from '@heroicons/react/24/outline'; // Usando un paquete de iconos popular

// --- COMPONENTE PARA EL CONTENIDO DEL TOAST (Sin cambios funcionales, estilo actualizado) ---
const RateUpdateToast = ({ closeToast, message }) => {
  const navigate = useNavigate();

  const handleNavigateAndClose = () => {
    navigate('/settings');
    closeToast();
  };

  return (
    <div>
      <p className="mb-2 font-medium">{message}</p>
      <button
        onClick={handleNavigateAndClose}
        className="mt-1 w-full px-3 py-1.5 text-sm font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400 focus:ring-offset-gray-800"
      >
        Actualizar Tasa de Cambio
      </button>
    </div>
  );
};

// --- ESTRUCTURA DE NAVEGACIÓN ENRIQUECIDA CON ICONOS ---
const navStructure = [
  {
    category: "Principal",
    links: [
      { path: '/dashboard', label: 'Dashboard', icon: HomeIcon },
    ]
  },
  {
    category: "Gestión Académica",
    links: [
      { path: '/representatives', label: 'Representantes', icon: UserGroupIcon },
      { path: '/students', label: 'Estudiantes', icon: AcademicCapIcon },
      { path: '/grade-levels', label: 'Niveles de Grado', icon: BuildingLibraryIcon },
    ]
  },
  {
    category: "Gestión Financiera",
    links: [
      { path: '/charge-concepts', label: 'Conceptos de Cargo', icon: WalletIcon },
      { path: '/applied-charges', label: 'Cargos Aplicados', icon: DocumentTextIcon },
      { path: '/payments', label: 'Pagos Recibidos', icon: BanknotesIcon },
      { path: '/students/financial-matrix', label: 'Grilla Estudiantil', icon: TableCellsIcon },
      { path: '/invoices', label: 'Facturación', icon: PrinterIcon },
      { path: '/credit-notes', label: 'Notas de Crédito', icon: DocumentMinusIcon },
    ]
  },
  {
    category: "Gestión de Gastos",
    links: [
      { path: '/expenses', label: 'Registro de Gastos', icon: CurrencyDollarIcon },
      { path: '/procurement', label: 'Proveedores', icon: BuildingStorefrontIcon },
      { path: '/expense-reports', label: 'Reportes', icon: DocumentChartBarIcon },
    ]
  },
  {
    category: "Gestión de Personal",
    links: [
      { path: '/personnel/employees', label: 'Empleados', icon: UsersIcon },
      { path: '/personnel/organization', label: 'Organización', icon: BriefcaseIcon },
      { path: '/personnel/payroll-runs', label: 'Nómina', icon: PresentationChartLineIcon },
      { path: '/personnel/payslips', label: 'Historial de Pagos', icon: DocumentDuplicateIcon },
      { path: '/personnel/salary-component-definitions', label: 'Componentes Salariales', icon: FingerPrintIcon }
    ]
  },
  {
    category: "Sistema",
    links: [
      { path: '/settings', label: 'Configuración', icon: Cog8ToothIcon },
    ]
  },  
];

const Sidebar = ({ isSidebarOpen, setIsSidebarOpen }) => {
  const location = useLocation();
  const [openSections, setOpenSections] = useState({});

  // Determina la sección activa y la abre por defecto
  useEffect(() => {
    const activeSection = navStructure.find(section => 
      section.links.some(link => location.pathname.startsWith(link.path))
    );
    if (activeSection) {
      setOpenSections(prev => ({ ...prev, [activeSection.category]: true }));
    }
  }, [location.pathname]);

  const toggleSection = (category) => {
    setOpenSections(prev => ({ ...prev, [category]: !prev[category] }));
  };
  
  const isActive = (path) => location.pathname.startsWith(path);

  const NavLinks = () => (
    <nav className="flex-1 px-3 py-4 space-y-2">
      {navStructure.map((section) => (
        <div key={section.category}>
          <button
            onClick={() => toggleSection(section.category)}
            className="w-full flex justify-between items-center py-2 px-3 text-sm font-semibold text-slate-300 rounded-md hover:bg-slate-700 transition-colors duration-150"
          >
            <span>{section.category}</span>
            <ChevronDownIcon
              className={`w-5 h-5 transition-transform duration-300 ${openSections[section.category] ? 'rotate-180' : ''}`}
            />
          </button>
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${openSections[section.category] ? 'max-h-96' : 'max-h-0'}`}>
            <ul className="pl-3 mt-1 space-y-1 border-l border-slate-600">
              {section.links.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={() => setIsSidebarOpen(false)} // Cierra el sidebar en móvil al hacer clic
                    className={`flex items-center gap-3 py-2 px-3 rounded-md transition-all duration-150 text-sm
                      ${isActive(item.path)
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                      }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-800 text-white flex flex-col transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700 h-16">
          <div className="flex items-center gap-3">
             <img src="/kakaka.jpg" alt="Logo" className="w-9 h-9 rounded-full bg-white p-0.5" />
             <h2 className="text-xl font-bold text-white">I.E. Islámico Venezolano</h2>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        
        {/* Búsqueda (opcional) */}
        <div className="p-4">
            <div className="relative">
                <MagnifyingGlassIcon className="w-5 h-5 text-slate-500 absolute top-1/2 left-3 -translate-y-1/2"/>
                <input 
                    type="text" 
                    placeholder="Buscar..."
                    className="w-full bg-slate-700 border-slate-600 rounded-md pl-10 pr-4 py-2 text-sm text-white focus:ring-indigo-500 focus:border-indigo-500"
                />
            </div>
        </div>

        <div className="overflow-y-auto flex-grow">
            <NavLinks />
        </div>
      </aside>
      {/* Overlay para móvil */}
      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-40 md:hidden"></div>}
    </>
  );
};

const Header = ({ onMenuButtonClick }) => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const userName = user?.full_name || user?.email || "Administrador";

  const currentPage = useMemo(() => {
    for (const section of navStructure) {
      for (const link of section.links) {
        if (location.pathname.startsWith(link.path)) {
          return link.label;
        }
      }
    }
    return "Dashboard";
  }, [location.pathname]);

  return (
    <header className="bg-white shadow-sm p-4 flex justify-between items-center sticky top-0 z-30 h-16 border-b border-gray-200">
      <div className="flex items-center">
        <button onClick={onMenuButtonClick} className="mr-3 text-gray-600 md:hidden">
            <Bars3Icon className="w-6 h-6"/>
        </button>
        <h1 className="text-xl font-bold text-gray-800">{currentPage}</h1>
      </div>
      <div className="flex items-center space-x-4">
        <span className="text-sm text-gray-600 hidden sm:inline">Hola, {userName}</span>
        <button
          onClick={logout}
          title="Cerrar Sesión"
          className="p-2 rounded-full text-gray-500 hover:bg-red-100 hover:text-red-600 transition-colors duration-150"
        >
          <ArrowRightOnRectangleIcon className="w-6 h-6" />
        </button>
      </div>
    </header>
  );
};

// Componente DashboardLayout principal que orquesta todo
const DashboardLayout = ({ children }) => {
  const { token } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const checkRateStatus = useCallback(async () => {
    if (!token) return;
    try {
      const alertData = await fetchExchangeRateAlertStatus(token);
      if (alertData?.needs_update) {
        toast.warn(({ closeToast }) => <RateUpdateToast message={alertData.message} closeToast={closeToast} />, {
          toastId: 'exchange-rate-alert',
          autoClose: false, 
          closeOnClick: false,
          position: "top-center",
          draggable: false,
          theme: "dark",
        });
      }
    } catch (error) {
      console.error("Error al verificar el estado de la tasa de cambio:", error);
    }
  }, [token]);

  useEffect(() => {
    checkRateStatus();
  }, [checkRateStatus]);

  return (
    <div className="flex h-screen bg-slate-100 font-sans">
      <Sidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden"> 
        <Header onMenuButtonClick={() => setIsSidebarOpen(true)} />
        <main className="p-4 md:p-6 flex-1 overflow-y-auto"> 
          {children}
        </main>
        <footer className="bg-white p-3 text-center text-xs text-gray-500 border-t">
          © {new Date().getFullYear()} Sistema de Administración Escolar. Creado por Alu con ❤️
        </footer>
      </div>
    </div>
  );
};

export default DashboardLayout;