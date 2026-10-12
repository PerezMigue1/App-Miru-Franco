import { useCallback, useEffect, useRef, useState } from 'react';

import { obtenerServicios, type Servicio } from '@/features/citas/models/servicioModel';
import {
  estaAgotado,
  obtenerCatalogo,
  type ProductoCatalogo,
} from '@/features/tienda/models/productoModel';

import { fotosDeServicios, type FotoGaleria } from '../models/FotoModel';
import { seleccionarFluidos, type FluidoHero } from '../models/FluidoModel';
import { obtenerProductos } from '../models/inicioService';

export type EstadoInicio = 'cargando' | 'listo' | 'error';

/** Productos y servicios que muestra cada carrusel de Inicio. */
const DESTACADOS = 6;

export interface InicioViewModel {
  estado: EstadoInicio;
  fluidos: FluidoHero[];
  fotos: FotoGaleria[];
  /** Estado del carrusel de productos: va aparte para que un fallo del catálogo no tumbe el inicio. */
  estadoProductos: EstadoInicio;
  /** Hasta 6 productos con existencias, al azar en cada carga. */
  productosDestacados: ProductoCatalogo[];
  /** Hasta 6 servicios activos, al azar en cada carga (siguen al `estado` general). */
  serviciosDestacados: Servicio[];
  recargar: () => void;
}

/**
 * Hasta `cantidad` elementos de `lista` al azar, sin repetir: Fisher-Yates sobre una copia (la
 * lista original no se toca) y se toman los primeros.
 */
function elegirAlAzar<T>(lista: T[], cantidad: number): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, cantidad);
}

/**
 * Lecturas públicas del inicio: nombre y precio de los fluidos del hero, fotos de la galería y los
 * carruseles de productos y servicios.
 */
export function useInicioViewModel(): InicioViewModel {
  const [estado, setEstado] = useState<EstadoInicio>('cargando');
  const [fluidos, setFluidos] = useState<FluidoHero[]>(() => seleccionarFluidos([]));
  const [fotos, setFotos] = useState<FotoGaleria[]>([]);
  const [estadoProductos, setEstadoProductos] = useState<EstadoInicio>('cargando');
  const [productosDestacados, setProductosDestacados] = useState<ProductoCatalogo[]>([]);
  const [serviciosDestacados, setServiciosDestacados] = useState<Servicio[]>([]);
  // Solo la última solicitud escribe el estado (reintentos rápidos o pantalla desmontada).
  const solicitud = useRef(0);

  // El sorteo ocurre aquí, una vez por carga (al montar y en cada Reintentar), nunca al pintar.
  const recargar = useCallback(() => {
    solicitud.current += 1;
    const id = solicitud.current;
    setEstado('cargando');
    setEstadoProductos('cargando');
    Promise.all([obtenerProductos(), obtenerServicios()])
      .then(([productos, servicios]) => {
        if (id !== solicitud.current) {
          return;
        }
        setFluidos(seleccionarFluidos(productos));
        setFotos(fotosDeServicios(servicios));
        setServiciosDestacados(
          elegirAlAzar(
            servicios.filter((servicio) => servicio.activo !== false),
            DESTACADOS,
          ),
        );
        setEstado('listo');
      })
      .catch(() => {
        if (id === solicitud.current) {
          setEstado('error');
        }
      });
    // El catálogo de la tienda trae las presentaciones (existencias, precio original y marca) que
    // necesita la tarjeta de producto; la lectura del hero no las trae.
    obtenerCatalogo()
      .then((catalogo) => {
        if (id !== solicitud.current) {
          return;
        }
        setProductosDestacados(
          elegirAlAzar(
            catalogo.filter((producto) => !estaAgotado(producto)),
            DESTACADOS,
          ),
        );
        setEstadoProductos('listo');
      })
      .catch(() => {
        if (id === solicitud.current) {
          setEstadoProductos('error');
        }
      });
  }, []);

  useEffect(() => {
    recargar();
    return () => {
      solicitud.current += 1;
    };
  }, [recargar]);

  return {
    estado,
    fluidos,
    fotos,
    estadoProductos,
    productosDestacados,
    serviciosDestacados,
    recargar,
  };
}
