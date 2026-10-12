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
  /** Filtros que ya filtran la lista. */
  filtros: FiltrosServicios;
  /** Cuántos filtros aplicados tienen valor (cada campo y la casilla cuentan uno). */
  filtrosActivos: number;
  /** Hoja de filtros: lo que se edita ahí es un borrador hasta tocar "Aplicar". */
  hojaFiltrosVisible: boolean;
  borradorFiltros: FiltrosServicios;
  borradorActivos: number;
  abrirFiltros: () => void;
  /** Cierra la hoja y descarta el borrador. */
  cerrarFiltros: () => void;
  cambiarBorrador: (cambios: Partial<FiltrosServicios>) => void;
  /** Aplica el borrador y cierra la hoja. */
  aplicarFiltros: () => void;
  /** Vacía los filtros aplicados y el borrador, y cierra la hoja (como "Limpiar filtros" de la web). */
  limpiarFiltros: () => void;
}

/** Filtros avanzados de la web: precio en pesos, duración en minutos y evaluación previa. */
export interface FiltrosServicios {
  /** Solo dígitos; '' es sin límite. */
  precioMinimo: string;
  precioMaximo: string;
  duracionMinima: string;
  duracionMaxima: string;
  soloEvaluacion: boolean;
}

export const FILTROS_VACIOS: FiltrosServicios = {
  precioMinimo: '',
  precioMaximo: '',
  duracionMinima: '',
  duracionMaxima: '',
  soloEvaluacion: false,
};

/** Cada rango cuenta 1 (con mínimo, máximo o los dos), como en Tienda; la casilla, 1. */
function contarActivos(filtros: FiltrosServicios): number {
  const conValor = (valor: string) => valor.trim() !== '';
  const precio = conValor(filtros.precioMinimo) || conValor(filtros.precioMaximo) ? 1 : 0;
  const duracionActiva = conValor(filtros.duracionMinima) || conValor(filtros.duracionMaxima) ? 1 : 0;
  return precio + duracionActiva + (filtros.soloEvaluacion ? 1 : 0);
}

/** '' es sin límite; si no, el número del campo. */
function limite(valor: string): number | undefined {
  const limpio = valor.trim();
  if (limpio === '') {
    return undefined;
  }
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : undefined;
}

/** "$1,200" a 1200. Sin precio cuenta como 0, igual que precioANumero de la web. */
function precioEnPesos(precio: string | null): number {
  if (!precio) {
    return 0;
  }
  const numero = Number(precio.replace(/[$,\s]/g, ''));
  return Number.isFinite(numero) ? numero : 0;
}

function esDigito(caracter: string): boolean {
  return caracter >= '0' && caracter <= '9';
}

/**
 * Primer número seguido (con o sin espacios) de `unidad`, como /(\d+)\s*unidad/ pero en un solo
 * recorrido: una regex sin ancla tarda O(n²) con una cadena larga de dígitos.
 */
function numeroAntesDe(texto: string, unidad: string): number | undefined {
  let i = 0;
  while (i < texto.length) {
    if (!esDigito(texto[i])) {
      i++;
      continue;
    }
    const inicio = i;
    while (i < texto.length && esDigito(texto[i])) {
      i++;
    }
    const numero = texto.slice(inicio, i);
    let j = i;
    while (j < texto.length && texto[j].trim() === '') {
      j++;
    }
    if (texto.startsWith(unidad, j)) {
      return Number(numero);
    }
    i = j;
  }
  return undefined;
}

/** "45 min", "1 h 30 min" o "3 h" a minutos. Sin duración cuenta como 0, igual que en la web. */
function duracionEnMinutos(duracion: string | null): number {
  if (!duracion) {
    return 0;
  }
  const horas = numeroAntesDe(duracion, 'h');
  const minutos = numeroAntesDe(duracion, 'min');
  return (horas === undefined ? 0 : horas * 60) + (minutos ?? 0);
}

/** Rango inclusivo; un límite vacío no filtra. */
function dentroDe(valor: number, minimo: number | undefined, maximo: number | undefined): boolean {
  return (minimo === undefined || valor >= minimo) && (maximo === undefined || valor <= maximo);
}

/** Minúsculas y sin acentos: "Alaciado" encuentra "alaciádo" y al revés. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Catálogo público de servicios con búsqueda por nombre, filtro por categoría y los filtros
 * avanzados de la web (precio, duración y evaluación previa) sobre los servicios ya cargados.
 */
export function useCatalogoServiciosViewModel(): CatalogoServiciosViewModel {
  const [estado, setEstado] = useState<EstadoCatalogo>('cargando');
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosServicios>(FILTROS_VACIOS);
  const [borradorFiltros, setBorradorFiltros] = useState<FiltrosServicios>(FILTROS_VACIOS);
  const [hojaFiltrosVisible, setHojaFiltrosVisible] = useState(false);
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
    const precioMinimo = limite(filtros.precioMinimo);
    const precioMaximo = limite(filtros.precioMaximo);
    const duracionMinima = limite(filtros.duracionMinima);
    const duracionMaxima = limite(filtros.duracionMaxima);
    return servicios.filter(
      (s) =>
        (categoria === null || s.categoria === categoria) &&
        (termino === '' || normalizar(s.nombre).includes(termino)) &&
        dentroDe(precioEnPesos(s.precio), precioMinimo, precioMaximo) &&
        dentroDe(duracionEnMinutos(s.duracion), duracionMinima, duracionMaxima) &&
        (!filtros.soloEvaluacion || s.requiereEvaluacion),
    );
  }, [servicios, busqueda, categoria, filtros]);

  const abrirFiltros = useCallback(() => {
    setBorradorFiltros(filtros);
    setHojaFiltrosVisible(true);
  }, [filtros]);

  const cerrarFiltros = useCallback(() => {
    setHojaFiltrosVisible(false);
  }, []);

  const cambiarBorrador = useCallback((cambios: Partial<FiltrosServicios>) => {
    setBorradorFiltros((actual) => ({ ...actual, ...cambios }));
  }, []);

  const aplicarFiltros = useCallback(() => {
    setFiltros(borradorFiltros);
    setHojaFiltrosVisible(false);
  }, [borradorFiltros]);

  const limpiarFiltros = useCallback(() => {
    setFiltros(FILTROS_VACIOS);
    setBorradorFiltros(FILTROS_VACIOS);
    setHojaFiltrosVisible(false);
  }, []);

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
    filtros,
    filtrosActivos: contarActivos(filtros),
    hojaFiltrosVisible,
    borradorFiltros,
    borradorActivos: contarActivos(borradorFiltros),
    abrirFiltros,
    cerrarFiltros,
    cambiarBorrador,
    aplicarFiltros,
    limpiarFiltros,
  };
}
