import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/shared/api/apiClient';
import { useCandado } from '@/shared/ui/useCandado';

import {
  cancelarPedido,
  esPedidoNoEncontrado,
  mensajeCancelarPedido,
  obtenerPedido,
  type Pedido,
} from '../models/pedidoModel';

export type EstadoDetallePedido = 'cargando' | 'listo' | 'error' | 'noEncontrado';

/** Aviso en la pantalla tras cancelar, o cuando el pedido cambió mientras se cancelaba. */
export interface AvisoPedido {
  tipo: 'exito' | 'info';
  texto: string;
}

export interface DetallePedidoViewModel {
  estado: EstadoDetallePedido;
  pedido: Pedido | null;
  /** Número del pedido para el título (el del parámetro mientras carga); null si no es válido. */
  numero: string | null;
  /** Vuelve a cargar con skeleton (botón Reintentar). */
  recargar: () => void;
  regresar: () => void;
  verMisPedidos: () => void;
  /** Abre la confirmación del pedido con el pago de Mercado Pago. */
  completarPago: () => void;
  hojaCancelarVisible: boolean;
  abrirCancelar: () => void;
  /** Cierra la hoja; mientras cancela no hace nada para no perder el resultado. */
  cerrarCancelar: () => void;
  cancelar: () => void;
  cancelando: boolean;
  /** Mensaje para la clienta dentro de la hoja si la cancelación falla, o null. */
  errorCancelacion: string | null;
  aviso: AvisoPedido | null;
}

const MENSAJE_CANCELADO = 'Tu pedido quedó cancelado.';

/** Id numérico positivo del parámetro de la ruta, en texto; null si no es válido. */
function numeroValido(id: string | undefined): string | null {
  const limpio = id?.trim() ?? '';
  return /^[1-9]\d*$/.test(limpio) ? limpio : null;
}

/**
 * Detalle de un pedido de la clienta y su cancelación (GP-06.4). Recarga en silencio cada vez que
 * la pantalla vuelve a estar enfocada (por ejemplo, al regresar de pagar en Mercado Pago).
 */
export function useDetallePedidoViewModel(pedidoId: string | undefined): DetallePedidoViewModel {
  const router = useRouter();
  const candado = useCandado();
  const [estado, setEstado] = useState<EstadoDetallePedido>('cargando');
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [hojaCancelarVisible, setHojaCancelarVisible] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelacion, setErrorCancelacion] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoPedido | null>(null);
  // Solo la última solicitud escribe el estado (recargas al enfocar, reintentos o pantalla desmontada).
  const solicitud = useRef(0);
  const montada = useRef(true);
  const hayDatos = useRef(false);
  // Un doble toque no abre dos pantallas; se libera al volver a enfocar.
  const navegando = useRef(false);

  const numero = numeroValido(pedidoId);

  const cargar = useCallback(
    (silenciosa: boolean) => {
      solicitud.current += 1;
      const actual = solicitud.current;
      if (numero === null) {
        hayDatos.current = false;
        setPedido(null);
        setEstado('noEncontrado');
        return;
      }
      if (!silenciosa) {
        setEstado('cargando');
      }
      obtenerPedido(numero)
        .then((respuesta) => {
          if (actual !== solicitud.current) {
            return;
          }
          hayDatos.current = true;
          setPedido(respuesta);
          setEstado('listo');
        })
        .catch((error: unknown) => {
          if (actual !== solicitud.current) {
            return;
          }
          const noEncontrado = esPedidoNoEncontrado(error);
          // En silencio, un fallo de red deja el pedido que ya se ve; un 404 sí lo quita.
          if (silenciosa && !noEncontrado) {
            return;
          }
          hayDatos.current = false;
          setPedido(null);
          setHojaCancelarVisible(false);
          setEstado(noEncontrado ? 'noEncontrado' : 'error');
        });
    },
    [numero],
  );

  const recargar = useCallback(() => cargar(false), [cargar]);

  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
      solicitud.current += 1;
    };
  }, []);

  // La primera vez carga con skeleton; al volver a la pantalla, en silencio.
  useFocusEffect(
    useCallback(() => {
      navegando.current = false;
      cargar(hayDatos.current);
    }, [cargar]),
  );

  const regresar = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/mis-pedidos' as Href);
    }
  }, [router]);

  const verMisPedidos = useCallback(() => {
    // Regresa a Mis pedidos si está debajo; si no, la pone en lugar del detalle.
    router.dismissTo('/mis-pedidos' as Href);
  }, [router]);

  const idPedido = pedido ? encodeURIComponent(String(pedido.id)) : null;

  const completarPago = useCallback(() => {
    if (!idPedido || navegando.current) {
      return;
    }
    navegando.current = true;
    router.push(`/pedido-confirmado/${idPedido}?pagar=1&origen=pedido` as Href);
  }, [idPedido, router]);

  const abrirCancelar = useCallback(() => {
    setErrorCancelacion(null);
    setHojaCancelarVisible(true);
  }, []);

  const cerrarCancelar = useCallback(() => {
    if (cancelando) {
      return;
    }
    setHojaCancelarVisible(false);
    setErrorCancelacion(null);
  }, [cancelando]);

  const cancelar = useCallback(() => {
    const actualPedido = pedido;
    if (!actualPedido) {
      return;
    }
    candado(async () => {
      setCancelando(true);
      setErrorCancelacion(null);
      try {
        const nuevo = await cancelarPedido(actualPedido.id);
        if (!montada.current) {
          return;
        }
        // Ninguna recarga anterior pisa el pedido ya cancelado.
        solicitud.current += 1;
        hayDatos.current = true;
        setPedido(nuevo);
        setEstado('listo');
        setAviso({ tipo: 'exito', texto: MENSAJE_CANCELADO });
        setHojaCancelarVisible(false);
      } catch (error) {
        if (!montada.current) {
          return;
        }
        const mensaje = mensajeCancelarPedido(error);
        const status = error instanceof ApiError ? error.status : null;
        if (status === 409 || status === 404) {
          // El pedido cambió (o ya no existe): se cierra la hoja y se lee de nuevo.
          setHojaCancelarVisible(false);
          setAviso(status === 409 ? { tipo: 'info', texto: mensaje } : null);
          cargar(true);
        } else {
          setErrorCancelacion(mensaje);
          if (status === 403) {
            // Ya está en preparación: la recarga quita la opción de cancelar de la pantalla.
            cargar(true);
          }
        }
      } finally {
        if (montada.current) {
          setCancelando(false);
        }
      }
    });
  }, [pedido, candado, cargar]);

  return {
    estado,
    pedido,
    numero,
    recargar,
    regresar,
    verMisPedidos,
    completarPago,
    hojaCancelarVisible,
    abrirCancelar,
    cerrarCancelar,
    cancelar,
    cancelando,
    errorCancelacion,
    aviso,
  };
}
