import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useRequiereSesion } from '@/features/auth/viewmodels/useRequiereSesion';
import { ApiError } from '@/shared/api/apiClient';
import { tipoDeError } from '@/shared/api/mensajesError';
import { useCandado } from '@/shared/ui/useCandado';

import { agregarAlCarrito, mensajeErrorCarrito } from '../models/carritoModel';
import {
  obtenerProducto,
  presentacionComprable,
  presentacionInicial,
  textoPiezas,
  type Presentacion,
  type ProductoCatalogo,
} from '../models/productoModel';

import { avisarCambioCarrito } from './usePiezasCarrito';

// La vista no importa de models/: recibe estos tipos del viewmodel.
export type { Presentacion, ProductoCatalogo } from '../models/productoModel';

export type EstadoDetalleProducto = 'cargando' | 'listo' | 'error' | 'noEncontrado';

/**
 * Resultado de agregar al carrito. `agregado`: entraron piezas nuevas. `completo`: ya estaban en
 * el carrito todas las existencias y no se sumó nada.
 */
export interface ConfirmacionCarrito {
  /** Cambia en cada agregado para que la confirmación vuelva a aparecer. */
  clave: number;
  tipo: 'agregado' | 'completo';
  mensaje: string;
}

export interface DetalleProductoViewModel {
  estado: EstadoDetalleProducto;
  /** El último error de carga fue de red. */
  errorRed: boolean;
  recargar: () => void;
  producto: ProductoCatalogo | null;
  presentacion: Presentacion | null;
  elegirPresentacion: (id: number) => void;
  /** La presentación elegida se puede comprar. */
  comprable: boolean;
  /** "3 piezas disponibles", "1 pieza disponible", "Sin existencias" o aviso de precio. */
  textoExistencias: string;
  /** Fotos de la presentación elegida o, si no tiene, las de todo el producto. */
  fotos: string[];
  cantidad: number;
  setCantidad: (cantidad: number) => void;
  agregando: boolean;
  confirmacion: ConfirmacionCarrito | null;
  errorAgregar: string | null;
  /** Con sesión agrega; sin sesión abre la invitación y agrega al iniciar sesión. */
  agregar: () => void;
  verCarrito: () => void;
  volver: () => void;
  irATienda: () => void;
}

function existenciasDe(presentacion: Presentacion | null): string {
  if (!presentacion || !presentacion.disponible || presentacion.stock <= 0) {
    return 'Sin existencias';
  }
  if (presentacion.precioCentavos <= 0) {
    return 'Consulta el precio en el salón';
  }
  return presentacion.stock === 1 ? '1 pieza disponible' : `${presentacion.stock} piezas disponibles`;
}

function fotosDe(producto: ProductoCatalogo | null, presentacion: Presentacion | null): string[] {
  if (presentacion && presentacion.imagenes.length > 0) {
    return presentacion.imagenes;
  }
  if (!producto) {
    return [];
  }
  return [...new Set(producto.presentaciones.flatMap((p) => p.imagenes))];
}

/** Detalle público de un producto (GP-06.4): presentación, cantidad y agregar al carrito. */
export function useDetalleProductoViewModel(id: string | undefined): DetalleProductoViewModel {
  const router = useRouter();
  const requiereSesion = useRequiereSesion();
  const candado = useCandado();

  const [estado, setEstado] = useState<EstadoDetalleProducto>('cargando');
  const [errorRed, setErrorRed] = useState(false);
  const [producto, setProducto] = useState<ProductoCatalogo | null>(null);
  const [presentacionId, setPresentacionId] = useState<number | null>(null);
  const [cantidad, setCantidadEstado] = useState(1);
  const [agregando, setAgregando] = useState(false);
  const [confirmacion, setConfirmacion] = useState<ConfirmacionCarrito | null>(null);
  const [errorAgregar, setErrorAgregar] = useState<string | null>(null);
  // Solo la última solicitud escribe el estado (reintentos rápidos o pantalla desmontada).
  const solicitud = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const recargar = useCallback(() => {
    solicitud.current += 1;
    const actual = solicitud.current;
    setEstado('cargando');
    obtenerProducto(id?.trim() ?? '')
      .then((respuesta) => {
        if (actual !== solicitud.current) {
          return;
        }
        setProducto(respuesta);
        setPresentacionId(presentacionInicial(respuesta)?.id ?? null);
        setCantidadEstado(1);
        setEstado('listo');
      })
      .catch((error: unknown) => {
        if (actual !== solicitud.current) {
          return;
        }
        setProducto(null);
        if (error instanceof ApiError && error.status === 404) {
          setEstado('noEncontrado');
          return;
        }
        setErrorRed(tipoDeError(error) === 'sinConexion');
        setEstado('error');
      });
  }, [id]);

  useEffect(() => {
    recargar();
    return () => {
      solicitud.current += 1;
    };
  }, [recargar]);

  const presentacion = useMemo(
    () => producto?.presentaciones.find((p) => p.id === presentacionId) ?? null,
    [producto, presentacionId],
  );
  const comprable = presentacion ? presentacionComprable(presentacion) : false;
  const fotos = useMemo(() => fotosDe(producto, presentacion), [producto, presentacion]);

  const elegirPresentacion = useCallback(
    (nuevoId: number) => {
      if (nuevoId === presentacionId) {
        return;
      }
      // Otra presentación: la cantidad vuelve a 1 y el aviso anterior ya no aplica.
      setPresentacionId(nuevoId);
      setCantidadEstado(1);
      setConfirmacion(null);
      setErrorAgregar(null);
    },
    [presentacionId],
  );

  const setCantidad = useCallback((valor: number) => {
    setCantidadEstado(valor);
    setErrorAgregar(null);
  }, []);

  const agregar = useCallback(() => {
    if (!producto || !presentacion || !presentacionComprable(presentacion)) {
      return;
    }
    // Lo elegido al tocar: si la clienta tiene que iniciar sesión primero, se agrega esto mismo.
    const linea = {
      productoId: producto.id,
      presentacionId: presentacion.id,
      cantidad: Math.min(cantidad, presentacion.stock),
      stock: presentacion.stock,
    };
    requiereSesion(() =>
      candado(async () => {
        setAgregando(true);
        setErrorAgregar(null);
        setConfirmacion(null);
        try {
          const resultado = await agregarAlCarrito(linea);
          // El número de la pestaña Carrito se vuelve a leer (también si la pantalla ya se cerró).
          avisarCambioCarrito();
          if (!montado.current) {
            return;
          }
          const { agregadas } = resultado;
          const total = resultado.cantidadEnCarrito;
          if (agregadas === 0) {
            setConfirmacion({
              clave: Date.now(),
              tipo: 'completo',
              mensaje: 'Ya tienes en tu carrito todas las piezas disponibles.',
            });
          } else {
            setConfirmacion({
              clave: Date.now(),
              tipo: 'agregado',
              mensaje: resultado.topado
                ? `Agregamos las piezas disponibles: tienes ${total} en tu carrito.`
                : `Agregamos ${textoPiezas(agregadas)} a tu carrito. Ahora tienes ${total}.`,
            });
          }
        } catch (error) {
          if (montado.current) {
            setErrorAgregar(mensajeErrorCarrito(error));
          }
        } finally {
          if (montado.current) {
            setAgregando(false);
          }
        }
      }),
    );
  }, [producto, presentacion, cantidad, requiereSesion, candado]);

  const verCarrito = useCallback(() => {
    // El carrito es una pestaña: dismissTo regresa a las pestañas que ya están abajo y abre esa;
    // push apilaría otra copia de las pestañas encima del detalle.
    router.dismissTo('/carrito' as Href);
  }, [router]);

  const volver = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.dismissTo('/tienda' as Href);
    }
  }, [router]);

  const irATienda = useCallback(() => {
    router.dismissTo('/tienda' as Href);
  }, [router]);

  return {
    estado,
    errorRed,
    recargar,
    producto,
    presentacion,
    elegirPresentacion,
    comprable,
    textoExistencias: existenciasDe(presentacion),
    fotos,
    cantidad,
    setCantidad,
    agregando,
    confirmacion,
    errorAgregar,
    agregar,
    verCarrito,
    volver,
    irATienda,
  };
}
