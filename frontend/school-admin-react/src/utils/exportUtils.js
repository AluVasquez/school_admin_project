import * as XLSX from 'xlsx'; // Importar la librería
import { toast } from 'react-toastify'; // Opcional, para notificaciones

/**
 * Obtiene el listado detallado de transacciones de gastos.
 * Backend: GET /expenses/reports/detailed-transactions
 * @param {string} token - El token de autenticación.
 * @param {object} params - Parámetros de la solicitud.
 * @param {string} params.startDate - Fecha de inicio (YYYY-MM-DD).
 * @param {string} params.endDate - Fecha de fin (YYYY-MM-DD).
 * @returns {Promise<Array<object>>} - Lista de objetos DetailedExpenseTransaction.
 */

export function exportToXLSX(data, headers, filename = 'reporte.xlsx', sheetName = 'Datos') {
    if (!data || data.length === 0) {
        console.warn("No hay datos para exportar a XLSX.");
        toast.info("No hay datos para exportar a Excel."); // Notificación al usuario
        return;
    }

    try {
        // 1. Preparar los datos para la hoja de cálculo:
        //    La primera fila será los encabezados (labels).
        //    Las filas siguientes serán los valores de los datos correspondientes a cada 'key' del header.
        const worksheetData = [
            headers.map(h => h.label) // Fila de encabezados
        ];

        data.forEach(row => {
            const dataRow = headers.map(header => row[header.key]);
            worksheetData.push(dataRow);
        });

        // 2. Crear la hoja de cálculo a partir del array de arrays.
        const ws = XLSX.utils.aoa_to_sheet(worksheetData);

        // (Opcional) Ajustar anchos de columna (esto es un poco más avanzado y puede ser una mejora)
        // const colWidths = headers.map(h => ({ wch: Math.max(20, h.label.length, ...data.map(row => String(row[h.key] || '').length)) }));
        // ws['!cols'] = colWidths;


        // 3. Crear un nuevo libro de trabajo.
        const wb = XLSX.utils.book_new();

        // 4. Añadir la hoja de cálculo al libro de trabajo.
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // 5. Escribir el libro y forzar la descarga.
        XLSX.writeFile(wb, filename);

    } catch (error) {
        console.error("Error al exportar a XLSX:", error);
        toast.error("Ocurrió un error al generar el archivo Excel.");
    }
}

export function exportToCSV(data, headers, filename = 'reporte.csv') {
    if (!data || data.length === 0) {
        console.warn("No hay datos para exportar a CSV.");
        // Podrías usar toast.info() si tienes toast disponible aquí
        return;
    }

    // Crear los encabezados del CSV
    const csvHeader = headers.map(h => `"${h.label.replace(/"/g, '""')}"`).join(',');

    // Crear las filas del CSV
    const csvRows = data.map(row => {
        return headers.map(header => {
            const value = row[header.key];
            let cellValue = (value === null || value === undefined) ? '' : String(value);
            // Escapar comillas dobles dentro del valor y envolver en comillas dobles
            cellValue = `"${cellValue.replace(/"/g, '""')}"`;
            return cellValue;
        }).join(',');
    });

    // Unir encabezado y filas
    const csvString = [csvHeader, ...csvRows].join('\\r\\n');

    // Crear y descargar el archivo
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) { // Feature detection
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } else {
        // Fallback para navegadores más antiguos (menos común ahora)
        alert("Tu navegador no soporta la descarga directa. Por favor, intenta copiar y pegar los datos.");
    }
}

