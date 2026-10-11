import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { obtenerServicios, type Servicio } from '../models/servicioModel';

export type EstadoCatalogo = 'cargando' | 'listo' | 'error';

export interface CatalogoServiciosViewModel {
  estado: EstadoCatalogo;
  recargar: () => void;
  busqueda: string;
  setBusqueda: (texto: string) => void;
  /** Categoría elegida; null es "Todas". */
  categoria: string | null;
  setCategoria: (categoria: string | null) => void;
  /** Categorías de los servicios activos, sin repetir y en el orden en que llegan. */
  categorias: string[];
  serviciosVisibles: Servicio[];
  hayServicios: boolean;
}

/** Minúsculas y sin acentos: "Alaciado" encuentra "alaciádo" y al revés. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Catálogo público de servicios con búsqueda por nombre y filtro por categoría. */
export function useCatalogoServiciosViewModel(): CatalogoServiciosViewModel {
  const [estado, setEstado] = useState<EstadoCatalogo>('cargando');
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  // Solo la última solicitud escribe el estado (reintentos rápidos o pantalla desmontada).
  const solicitud = useRef(0);

  const recargar = useCallback(() => {
    solicitud.current += 1;
    const id = solicitud.current;
    setEstado('cargando');
    obtenerServicios()
      .then((lista) => {
        if (id !== solicitud.current) {
          return;
        }
        setServicios(lista.filter((s) => s.activo !== false));
        setEstado('listo');
      })
      .catch(() => {
        if (id === solicitud.current) {
          setEstado('error');
        }
      });
  }, []);

  useEffect(() => {
    recargar();
    return () => {
      solicitud.current += 1;
    };
  }, [recargar]);

  const categorias = useMemo(() => {
    const vistas = new Set<string>();
    for (const servicio of servicios) {
      if (servicio.categoria) {
        vistas.add(servicio.categoria);
      }
    }
    return [...vistas];
  }, [servicios]);

  const serviciosVisibles = useMemo(() => {
    const termino = normalizar(busqueda);
    return servicios.filter(
      (s) =>
        (categoria === null || s.categoria === categoria) &&
        (termino === '' || normalizar(s.nombre).includes(termino)),
    );
  }, [servicios, busqueda, categoria]);

  return {
    estado,
    recargar,
    busqueda,
    setBusqueda,
    categoria,
    setCategoria,
    categorias,
    serviciosVisibles,
    hayServicios: servicios.length > 0,
  };
}
