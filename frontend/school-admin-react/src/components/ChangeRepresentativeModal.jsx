import React, { useState, useEffect } from 'react';
import Modal from './Modal'; // Reutilizamos nuestro componente Modal genérico
import { getRepresentatives } from '../services/apiRepresentatives'; // Para buscar representantes
import { useAuth } from '../contexts/AuthContext'; // Para el token
import { toast } from 'react-toastify';

function ChangeRepresentativeModal({ isOpen, onClose, currentStudentName, onSelectRepresentative }) {
  const { token } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [selectedRep, setSelectedRep] = useState(null);

  useEffect(() => {
    // Limpiar resultados y selección cuando el modal se abre/cierra o cambia el término
    if (!isOpen) {
      setSearchTerm('');
      setSearchResults([]);
      setSelectedRep(null);
    }
  }, [isOpen]);

  const handleSearch = async (e) => {
    if (e) e.preventDefault(); // Prevenir submit de formulario si es un evento
    if (!searchTerm.trim() || !token) {
      setSearchResults([]);
      return;
    }
    setIsLoadingSearch(true);
    try {
      const data = await getRepresentatives(token, { search: searchTerm, limit: 10 }); // Limitar a 10 resultados por ahora
      setSearchResults(data.items || []);
      if ((data.items || []).length === 0) {
        toast.info("No se encontraron representantes con ese criterio.");
      }
    } catch (error) {
      console.error("Error buscando representantes:", error);
      toast.error(`Error al buscar: ${error.message}`);
      setSearchResults([]);
    } finally {
      setIsLoadingSearch(false);
    }
  };

  // Efecto para buscar cuando el término cambia (con debounce sería ideal en una app grande)
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
        if (searchTerm.trim().length > 2 || searchTerm.trim().length === 0) { // Buscar con al menos 3 caracteres o si se borra
             handleSearch();
        } else if (searchTerm.trim().length > 0 && searchTerm.trim().length <=2 ) {
            setSearchResults([]); // Limpiar resultados si el término es muy corto
        }
    }, 500); // Espera 500ms después de que el usuario deja de escribir

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, token]);


  const handleSelect = (representative) => {
    setSelectedRep(representative);
  };

  const handleConfirmSelection = () => {
    if (selectedRep) {
      onSelectRepresentative(selectedRep.id, `${selectedRep.first_name} <span class="math-inline">\{selected\_rep\.last\_name\} \(</span>{selectedRep.cedula})`);
      onClose(); // Cierra el modal principal
    } else {
      toast.warn("Por favor, seleccione un representante de la lista.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Cambiar Representante para ${currentStudentName || 'el Estudiante'}`}>
      <div className="space-y-4">
        <form onSubmit={handleSearch}>
          <label htmlFor="repSearch" className="block text-sm font-medium text-gray-700">
            Buscar Representante (por nombre, apellido, cédula/ID)
          </label>
          <div className="mt-1 flex rounded-md shadow-sm">
            <input
              type="text"
              name="repSearch"
              id="repSearch"
              className="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block w-full rounded-none rounded-l-md sm:text-sm border-gray-300 input-style"
              placeholder="Escriba para buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button
              type="submit"
              disabled={isLoadingSearch}
              className="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-500 hover:bg-gray-100 text-sm disabled:opacity-50"
            >
              {isLoadingSearch ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </form>

        {searchResults.length > 0 && (
          <div className="mt-4 max-h-60 overflow-y-auto border rounded-md">
            <p className="text-xs text-gray-500 p-2">Resultados de la búsqueda (seleccione uno):</p>
            <ul className="divide-y divide-gray-200">
              {searchResults.map(rep => (
                <li
                  key={rep.id}
                  onClick={() => handleSelect(rep)}
                  className={`p-3 hover:bg-indigo-50 cursor-pointer ${selectedRep?.id === rep.id ? 'bg-indigo-100 ring-2 ring-indigo-500' : ''}`}
                >
                  <p className="text-sm font-medium text-gray-900">{rep.first_name} {rep.last_name}</p>
                  <p className="text-xs text-gray-500">ID: {rep.cedula} - Email: {rep.email}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {searchTerm && !isLoadingSearch && searchResults.length === 0 && (
             <p className="text-sm text-gray-500 text-center py-3">No se encontraron representantes.</p>
        )}


        <div className="pt-4 flex justify-end space-x-3 border-t mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 shadow-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmSelection}
            disabled={!selectedRep || isLoadingSearch}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            Confirmar Selección
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ChangeRepresentativeModal;