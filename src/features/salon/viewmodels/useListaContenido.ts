import { useCallback, useEffect, useRef, useState } from 'react';

import { mensajeParaClienta, tipoDeError, type TipoError } from '@/shared/api/mensajesError';

import {
  obtenerEquipo,
  obtenerGaleria,
  obtenerPreguntasFrecuentes,
  obtenerPromociones,
  type FotoGaleriaSalon,
  type IntegranteEquipo,
  type PreguntaFrecuente,
  type Promocion,
} from '../models/contenidoSalonModel';

export type EstadoLista = 'cargando' | 'listo' | 'vacio' | 'error';

export interface ListaContenido<T> {
  estado: EstadoLista;
  datos: T[];
  /** Con estado 'error': qué clase de error fue y su texto para la clienta; null si no hay error. */
  tipoError: TipoError | null;
  mensajeError: string | null;
  /** Vuelve a pedir la lista mostrando 'cargando' (botón Reintentar). */
  reintentar: () => void;
  /**
   * Vuelve a pedir la lista para el deslizar para actualizar. Si ya había datos no pasa por
   * 'cargando' y, si falla, se conservan. Nunca rechaza: resuelve cuando la lectura termina.
   */
  recargar: () => Promise<void>;
}

/**
 * Estado de una lista de contenido público. Pide la lista al montar con `cargar` (una función
 * estable, por ejemplo las de contenidoSalonModel: si cambia, se vuelve a pedir). Solo la última
 * solicitud escribe el estado y nada se escribe después de desmontar.
 */
export function useListaContenido<T>(cargar: () => Promise<T[]>): ListaContenido<T> {
  const [estado, setEstado] = useState<EstadoLista>('cargando');
  const [datos, setDatos] = useState<T[]>([]);
  const [error, setError] = useState<unknown>(null);
  // Solo la última solicitud escribe el estado (reintentos rápidos o pantalla desmontada).
  const solicitud = useRef(0);
  const hayDatos = useRef(false);

  const pedir = useCallback(
    (mostrarCarga: boolean): Promise<void> => {
      solicitud.current += 1;
      const id = solicitud.current;
      if (mostrarCarga) {
        setEstado('cargando');
      }
      return cargar().then(
        (lista) => {
          if (id !== solicitud.current) {
            return;
          }
          hayDatos.current = lista.length > 0;
          setDatos(lista);
          setEstado(lista.length > 0 ? 'listo' : 'vacio');
        },
        (causa: unknown) => {
          // Si una recarga falla con datos en pantalla, se quedan; sin datos, se muestra el error.
          if (id === solicitud.current && (mostrarCarga || !hayDatos.current)) {
            hayDatos.current = false;
            setDatos([]);
            setError(causa);
            setEstado('error');
          }
        },
      );
    },
    [cargar],
  );

  const reintentar = useCallback(() => {
    void pedir(true);
  }, [pedir]);

  const recargar = useCallback(() => pedir(!hayDatos.current), [pedir]);

  useEffect(() => {
    void pedir(true);
    return () => {
      solicitud.current += 1;
    };
  }, [pedir]);

  const conError = estado === 'error';
  return {
    estado,
    datos,
    tipoError: conError ? tipoDeError(error) : null,
    mensajeError: conError ? mensajeParaClienta(error) : null,
    reintentar,
    recargar,
  };
}

export interface ContenidoSalon {
  promociones: ListaContenido<Promocion>;
  preguntas: ListaContenido<PreguntaFrecuente>;
  equipo: ListaContenido<IntegranteEquipo>;
  galeria: ListaContenido<FotoGaleriaSalon>;
  /** Recarga las cuatro listas a la vez; resuelve cuando terminan todas (nunca rechaza). */
  recargarTodo: () => Promise<void>;
}

/**
 * Contenido público del salón: promociones, preguntas frecuentes, equipo y galería, cada una con su
 * propio estado (un fallo en una no tumba a las demás).
 */
export function useContenidoSalon(): ContenidoSalon {
  const promociones = useListaContenido(obtenerPromociones);
  const preguntas = useListaContenido(obtenerPreguntasFrecuentes);
  const equipo = useListaContenido(obtenerEquipo);
  const galeria = useListaContenido(obtenerGaleria);

  const recargarPromociones = promociones.recargar;
  const recargarPreguntas = preguntas.recargar;
  const recargarEquipo = equipo.recargar;
  const recargarGaleria = galeria.recargar;
  const recargarTodo = useCallback(
    () =>
      Promise.all([recargarPromociones(), recargarPreguntas(), recargarEquipo(), recargarGaleria()]).then(
        () => undefined,
      ),
    [recargarPromociones, recargarPreguntas, recargarEquipo, recargarGaleria],
  );

  return { promociones, preguntas, equipo, galeria, recargarTodo };
}
