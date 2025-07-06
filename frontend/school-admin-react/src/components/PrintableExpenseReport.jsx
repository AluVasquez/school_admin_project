import React, { useEffect } from 'react';

// Helpers de formato (puedes tenerlos en un archivo utils.js y exportarlos/importarlos)
const formatCurrency = (amount, currency = 'VES', locale = 'es-VE') => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (currency === 'USD') locale = 'en-US';
    return parseFloat(amount).toLocaleString(locale, options);
};

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    // Ajustar por la zona horaria si las fechas del backend son UTC y se muestran un día antes/después
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

function PrintableExpenseReport({ reportDetails, onClose }) {
  const { 
    title, 
    data, 
    type, // 'byCategory', 'bySupplier', 'trend'
    dateRange, 
    schoolConfig, 
    displayCurrency, // Moneda en la que se deben mostrar los datos en el reporte
    currentUsdToVesRate // Tasa para posibles conversiones si el backend no dio USD
  } = reportDetails;

  useEffect(() => {
    // Esta clase en el body ayuda a que los estilos @media print
    // puedan ocultar todo EXCEPTO este componente de vista previa.
    document.body.classList.add('print-preview-active');
    return () => {
      document.body.classList.remove('print-preview-active');
    };
  }, []);

  const handlePrint = () => {

  };

  // Función para obtener el valor a mostrar (VES o USD)
  // Asume que 'item' puede tener un campo '_usd_equivalent' si el backend lo proveyó.
  const getDisplayValue = (item, vesField, usdField) => {
    if (displayCurrency === 'USD') {
        // Usar el equivalente USD si está disponible y es válido
        if (item[usdField] !== undefined && item[usdField] !== null && currentUsdToVesRate) {
            return item[usdField];
        } 
        // Si no hay equivalente USD del backend pero sí hay tasa y valor VES, calcularlo
        else if (currentUsdToVesRate && item[vesField] !== undefined && item[vesField] !== null) {
            return parseFloat((item[vesField] / currentUsdToVesRate).toFixed(2));
        }
        // Si no se puede convertir a USD, mostrar el valor VES (o N/A si tampoco hay)
        return item[vesField] ?? 'N/A'; 
    }
    // Por defecto, o si es VES, mostrar el valor VES
    return item[vesField] ?? 'N/A';
  };

  const renderReportTable = () => {
    if (!data || data.length === 0) return <p className="text-center py-10 text-gray-600">No hay datos para mostrar en este reporte.</p>;

    let headers = [];
    let rows = [];

    if (type === 'byCategory') {
      headers = ["Categoría", `Total Gasto (${displayCurrency})`, "# Trans."];
      rows = data.map((item, index) => (
        <tr key={item.category_id || index}>
          <td className="border border-gray-300 p-2">{item.category_name}</td>
          <td className="border border-gray-300 p-2 text-right">{formatCurrency(getDisplayValue(item, 'total_expenses_ves', 'total_expenses_usd_equivalent'), displayCurrency)}</td>
          <td className="border border-gray-300 p-2 text-right">{item.expense_count}</td>
        </tr>
      ));
    } else if (type === 'bySupplier') {
      headers = ["Proveedor", `Total Gasto (${displayCurrency})`, "# Trans."];
      rows = data.map((item, index) => (
        <tr key={item.supplier_id || `no-supplier-${index}`}>
          <td className="border border-gray-300 p-2">{item.supplier_name || 'Sin Proveedor Asignado'}</td>
          <td className="border border-gray-300 p-2 text-right">{formatCurrency(getDisplayValue(item, 'total_expenses_ves', 'total_expenses_usd_equivalent'), displayCurrency)}</td>
          <td className="border border-gray-300 p-2 text-right">{item.expense_count}</td>
        </tr>
      ));
    } else if (type === 'trend') {
        headers = ["Período", `Total Gastos (${displayCurrency})`];
        rows = data.map((item, index) => (
          <tr key={item.period || index}>
            <td className="border border-gray-300 p-2">{item.period}</td>
            {/* Para tendencia, los datos ya vienen con total_expenses_ves y total_expenses_usd_equivalent */}
            <td className="border border-gray-300 p-2 text-right">{formatCurrency(getDisplayValue(item, 'total_expenses_ves', 'total_expenses_usd_equivalent'), displayCurrency)}</td>
          </tr>
        ));
    }

    if (rows.length === 0) return <p className="text-center py-10 text-gray-600">No hay datos tabulares para este tipo de reporte.</p>;

    return (
      <table className="w-full text-sm border-collapse border border-gray-400">
        <thead>
          <tr className="bg-gray-100">
            {headers.map((header, index) => (
              <th key={index} className={`border border-gray-300 p-2 font-semibold ${index > 0 ? 'text-right' : 'text-left'}`}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-100 z-[100] flex flex-col print-preview-container p-4 sm:p-8">
      <style>
        {`
          @media print {
            /* --- Estrategia de Ocultar Todo y Mostrar Específico --- */
            /* 1. Ocultar todo por defecto */
            body * {
              visibility: hidden !important;
            }

            /* 2. Hacer visible NUESTRO contenedor de impresión y TODO su contenido */
            .print-preview-container,
            .print-preview-container * {
              visibility: visible !important;
              /* Podrías necesitar display: block !important; para algunos elementos si visibility no es suficiente,
                 pero con cuidado para no romper el layout de la tabla. */
            }
            
            /* 3. Estilos para que el contenedor de impresión ocupe la página */
            .print-preview-container {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important; /* El navegador ajustará esto al tamaño del papel */
              height: auto !important;
              margin: 0 !important;
              padding: 0 !important;
              border: none !important;
              box-shadow: none !important;
              background-color: white !important;
              overflow: visible !important; /* Mostrar todo el contenido */
            }

            /* 4. Ocultar los botones "Cerrar" e "Imprimir" de la vista previa */
            .print-controls {
              display: none !important;
            }

            /* 5. Estilos para el contenido imprimible en sí */
            .printable-content {
              width: 100%;
              margin: 0 auto;
              padding: 0; /* Los márgenes se controlan con @page */
              font-family: Arial, sans-serif; /* O la fuente que prefieras para impresión */
              color: black !important;
              font-size: 10pt; /* Tamaño de fuente base para impresión */
              background-color: white !important;
            }
            .printable-content h1, .printable-content h2, .printable-content h3 {
              color: black !important;
              page-break-after: avoid;
              margin-top: 1.5em; /* Espaciado para títulos */
              margin-bottom: 0.5em;
            }
            .printable-content table {
              width: 100%;
              border-collapse: collapse !important; /* Importante para bordes consistentes */
              margin-bottom: 1rem;
              font-size: 9pt;
              page-break-inside: auto;
            }
            /* Asegurar que los elementos de la tabla se muestren como tabla */
            .printable-content table, 
            .printable-content thead, 
            .printable-content tbody, 
            .printable-content tr, 
            .printable-content th, 
            .printable-content td {
                display: revert !important; /* Intenta revertir a sus display por defecto de tabla */
                visibility: visible !important; /* Asegurar que sean visibles */
            }
            .printable-content th, .printable-content td {
              border: 1px solid #333 !important; /* Bordes definidos */
              padding: 5px 8px; /* Ajusta el padding */
              text-align: left;
              color: black !important;
            }
            .printable-content th {
              background-color: #f2f2f2 !important; /* Fondo muy claro para encabezados */
              font-weight: bold;
              display: table-header-group !important; /* Para repetir encabezados en múltiples páginas */
            }
            .printable-content tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
            .printable-content .text-right { text-align: right !important; }
            .printable-content .text-center { text-align: center !important; }
            .printable-content img { max-width: 100% !important; page-break-inside: avoid; }
            .printable-content .whitespace-pre-line { white-space: pre-line !important; }


            /* 6. Configuración de la página (tamaño y márgenes) */
            @page {
              size: Letter; /* O A4. 'Oficio' es menos estándar, podrías usar Legal: size: Legal; */
                           /* Para Oficio venezolano (aprox 216x330mm), podrías probar: size: 8.5in 13in; */
              margin: 15mm; /* Margen general. Puedes especificar top, right, bottom, left. */
            }
          }
        `}
      </style>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl mx-auto h-full flex flex-col">
        <div className="print-controls flex justify-between items-center p-3 sm:p-4 border-b bg-gray-50 rounded-t-lg">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-700 truncate pr-2">
            Vista Previa: {title}
          </h2>
          <div className="flex-shrink-0 space-x-2">
            <button 
                onClick={onClose} 
                className="px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-150"
            >
                Cerrar Vista Previa
            </button>
            <button 
                onClick={handlePrint} 
                className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-150"
            >
                Imprimir
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-8 overflow-y-auto flex-grow printable-content">
          <header className="mb-8 text-center border-b-2 border-gray-300 pb-4">
            {schoolConfig?.document_logo_url && (
                <img src={schoolConfig.document_logo_url} alt="Logo Escuela" className="h-20 max-w-[200px] mx-auto mb-3 object-contain" />
            )}
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{schoolConfig?.school_name || 'Nombre de la Institución'}</h1>
            {schoolConfig?.school_rif && <p className="text-sm text-gray-600">RIF: {schoolConfig.school_rif}</p>}
            {schoolConfig?.school_address && <p className="text-xs text-gray-500">{schoolConfig.school_address}</p>}
            {schoolConfig?.school_phone && <p className="text-xs text-gray-500">Teléfono: {schoolConfig.school_phone}</p>}
            <h2 className="text-lg sm:text-xl font-semibold mt-4 text-gray-700">{title}</h2>
            <p className="text-sm text-gray-500">Período del Reporte: {formatDate(dateRange.startDate)} al {formatDate(dateRange.endDate)}</p>
             {displayCurrency === 'USD' && currentUsdToVesRate && (
                <p className="text-xs text-gray-500">Montos expresados en USD (Tasa de Referencia: {currentUsdToVesRate.toFixed(2)} VES/USD)</p>
            )}
          </header>

          <section className="my-6">
            {renderReportTable()}
          </section>
          
          <footer className="mt-8 pt-4 border-t text-xs text-center text-gray-500">
            <p>Reporte generado el {new Date().toLocaleDateString('es-VE', { day:'2-digit', month: '2-digit', year:'numeric'})} a las {new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}.</p>
            {schoolConfig?.invoice_terms_and_conditions && (
                <div className="mt-4 text-left text-[8pt] leading-tight">
                    <h4 className="font-semibold mb-1">Términos y Condiciones:</h4>
                    <p className="whitespace-pre-line">{schoolConfig.invoice_terms_and_conditions}</p>
                </div>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}

export default PrintableExpenseReport;