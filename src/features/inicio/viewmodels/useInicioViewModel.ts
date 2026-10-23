import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import { obtenerServicios, type Servicio } from '@/features/citas/models/servicioModel';
import {
  estaAgotado,
  obtenerCatalogo,
  type ProductoCatalogo,
} from '@/features/tienda/models/productoModel';
import { mensajeParaClienta } from '@/shared/api/mensajesError';

import { seleccionarFluidos, type FluidoHero } from '../models/FluidoModel';

export type EstadoInicio = 'cargando' | 'listo' | 'error';

/** Productos y servicios que muestra cada carrusel de Inicio. */
const DESTACADOS = 6;

export interface InicioViewModel {
  estado: EstadoInicio;
  /** Con estado 'error': por qué no se cargaron los servicios (sin red, servidor...); null si no hay error. */
  mensajeError: string | null;
  fluidos: FluidoHero[];
  /**
   * Estado del catálogo (hero y carrusel de productos): va aparte para que un fallo del catálogo no
   * tumbe los servicios; sin catálogo, el hero queda sin nombre ni precio.
   */
  estadoProductos: EstadoInicio;
  /** Con estadoProductos 'error': por qué no se cargó el catálogo (por tipo de error); si no, null. */
  mensajeErrorProductos: string | null;
  /** Vuelve a pedir solo el catálogo de productos pasando por 'cargando' (Reintentar del carrusel). */
  recargarProductos: () => void;
  /** Hasta 6 productos con existencias, al azar en cada carga. */
  productosDestacados: ProductoCatalogo[];
  /** Hasta 6 servicios activos, al azar en cada carga (siguen al `estado` general). */
  serviciosDestacados: Servicio[];
  /** Vuelve a pedir los dos catálogos pasando por 'cargando' (botón Reintentar). */
  recargar: () => void;
  /**
   * Vuelve a pedir los dos catálogos para el deslizar para actualizar: sin pasar por 'cargando' y,
   * si una lectura falla con datos en pantalla, se conservan. Nunca rechaza.
   */
  refrescar: () => Promise<void>;
}

/**
 * Hasta `cantidad` elementos de `lista` al azar, sin repetir: Fisher-Yates sobre una copia (la
 * lista original no se toca) y se toman los primeros. El azar sale del generador criptográfico de
 * expo-crypto, un Uint32 por posición pedidos de una sola vez.
 */
function elegirAlAzar<T>(lista: T[], cantidad: number): T[] {
  const copia = [...lista];
  const aleatorios = Crypto.getRandomValues(new Uint32Array(copia.length));
  for (let i = copia.length - 1; i > 0; i -= 1) {
    // Uint32 escalado a [0, i]: con listas tan cortas el sesgo es despreciable.
    const j = Math.floor((aleatorios[i] / 2 ** 32) * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, cantidad);
}

/** Un fallo deja 'error' salvo que ya hubiera datos en pantalla. */
const conservarOError = (actual: EstadoInicio): EstadoInicio => (actual === 'listo' ? actual : 'error');

/**
 * Lecturas públicas de los catálogos de Inicio: el catálogo de productos (una sola vez: de ahí salen
 * el nombre y el precio de los fluidos del hero y el carrusel de productos) y los servicios
 * (carrusel de servicios). La galería ya no sale de aquí: viene de GET /api/galeria (useContenidoInicio).
 */
export function useInicioViewModel(): InicioViewModel {
  const [estado, setEstado] = useState<EstadoInicio>('cargando');
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [fluidos, setFluidos] = useState<FluidoHero[]>(() => seleccionarFluidos([]));
  const [estadoProductos, setEstadoProductos] = useState<EstadoInicio>('cargando');
  const [errorProductos, setErrorProductos] = useState<unknown>(null);
  const [productosDestacados, setProductosDestacados] = useState<ProductoCatalogo[]>([]);
  const [serviciosDestacados, setServiciosDestacados] = useState<Servicio[]>([]);
  // Solo la última solicitud escribe el estado (reintentos rápidos o pantalla desmontada). El
  // catálogo lleva su propio contador: su Reintentar no cuenta como una carga de los servicios.
  const solicitud = useRef(0);
  const solicitudProductos = useRef(0);

  // Una sola lectura de /api/productos: el catálogo trae lo que piden el hero (nombre y precio de
  // los fluidos) y la tarjeta de producto (presentaciones, existencias y marca).
  const pedirCatalogo = useCallback((mostrarCarga: boolean): Promise<void> => {
    solicitudProductos.current += 1;
    const id = solicitudProductos.current;
    const vigente = () => id === solicitudProductos.current;
    if (mostrarCarga) {
      setEstadoProductos('cargando');
    }
    return obtenerCatalogo().then(
      (productos) => {
        if (!vigente()) {
          return;
        }
        setFluidos(seleccionarFluidos(productos));
        setProductosDestacados(
          elegirAlAzar(
            productos.filter((producto) => !estaAgotado(producto)),
            DESTACADOS,
          ),
        );
        setEstadoProductos('listo');
      },
      (error: unknown) => {
        if (vigente()) {
          setErrorProductos(error);
          setEstadoProductos(conservarOError);
        }
      },
    );
  }, []);

  // El sorteo ocurre aquí, una vez por carga (al montar, en cada Reintentar y al deslizar para
  // actualizar), nunca al pintar. Un fallo deja 'error' salvo que ya hubiera datos en pantalla.
  const pedir = useCallback((mostrarCarga: boolean): Promise<void> => {
    solicitud.current += 1;
    const id = solicitud.current;
    const vigente = () => id === solicitud.current;
    if (mostrarCarga) {
      setEstado('cargando');
    }
    const servicios = obtenerServicios().then(
      (lista) => {
        if (!vigente()) {
          return;
        }
        setServiciosDestacados(
          elegirAlAzar(
            lista.filter((servicio) => servicio.activo !== false),
            DESTACADOS,
          ),
        );
        setEstado('listo');
      },
      (error: unknown) => {
        if (vigente()) {
          setErrorCarga(error);
          setEstado(conservarOError);
        }
      },
    );
    return Promise.all([servicios, pedirCatalogo(mostrarCarga)]).then(() => undefined);
  }, [pedirCatalogo]);

  const recargar = useCallback(() => {
    void pedir(true);
  }, [pedir]);
  const recargarProductos = useCallback(() => {
    void pedirCatalogo(true);
  }, [pedirCatalogo]);
  const refrescar = useCallback(() => pedir(false), [pedir]);

  useEffect(() => {
    recargar();
    return () => {
      solicitud.current += 1;
      solicitudProductos.current += 1;
    };
  }, [recargar]);

  return {
    mensajeError: estado === 'error' ? mensajeParaClienta(errorCarga) : null,
    estado,
    fluidos,
    estadoProductos,
    mensajeErrorProductos: estadoProductos === 'error' ? mensajeParaClienta(errorProductos) : null,
    recargarProductos,
    productosDestacados,
    serviciosDestacados,
    recargar,
    refrescar,
  };
}
