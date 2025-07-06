// src/pages/ProcurementPage.jsx

import React, { useState } from 'react';
import SuppliersView from '../components/views/SuppliersView';
import ExpenseCategoriesView from '../components/views/ExpenseCategoriesView';
import { BuildingStorefrontIcon, TagIcon } from '@heroicons/react/24/outline';

const tabs = [
    { id: 'suppliers', label: 'Proveedores', icon: <BuildingStorefrontIcon className="w-5 h-5 mr-2" /> },
    { id: 'categories', label: 'Categorías de Gasto', icon: <TagIcon className="w-5 h-5 mr-2" /> },
];

function ProcurementPage() {
    const [activeTab, setActiveTab] = useState('suppliers');

    return (
        <div className="bg-slate-100 min-h-full p-4 md:p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-800">Gestión de Compras y Proveedores</h1>
                <p className="text-sm text-slate-500 mt-1">Administra los proveedores y las categorías para el registro de gastos.</p>
            </div>

            {/* Navegación de Pestañas */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`${
                                activeTab === tab.id
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Contenido de la Pestaña Activa */}
            <div className="pt-4">
                {activeTab === 'suppliers' && <SuppliersView />}
                {activeTab === 'categories' && <ExpenseCategoriesView />}
            </div>
        </div>
    );
}

export default ProcurementPage;