import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { esErrorDeRed } from '@/features/auth/models/AuthModel';
import { ApiError } from '@/shared/api/apiClient';
import { useCandado } from '@/shared/ui/useCandado';

import {
  cancelarPedido,
  esPedidoNoEncontrado,
  mensajeCancelarPedido,
  obtenerEstadoPagoPedido,
  obtenerPedido,
  pidePagoEnLinea,
  type Pedido,
  type ReembolsoCancelacion,
} from '../models/pedidoModel';
import { formatoPrecio } from '../models/productoModel';

// La vista no importa de models/: recibe este tipo del viewmodel.
export type { Pedido } from '../models/pedidoModel';

export type EstadoDetallePedido = 'cargando' | 'listo' | 'error' | 'noEncontrado';

/**
 * Aviso en la pantalla tras cancelar, o cuando el pedido cambió mientras se cancelaba. 'aviso':
 * cancelado, pero la devolución del pago quedó en revisión.
 */
export interface AvisoPedido {
  tipo: 'exito' | 'aviso' | 'info';
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
  /**
   * Mercado Pago procesa o revisa el pago en línea de este pedido (se consulta al cargarlo): no se
   * pide pagar otra vez, solo revisar el pago.
   */
  pagoEnProceso: boolean;
  /** Abre la confirmación del pedido solo para consultar su pago (sin abrir Mercado Pago). */
  revisarPago: () => void;
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

/** Aviso tras cancelar con lo que respondió el backend sobre la devolución del pago. */
function avisoCancelado(reembolso: ReembolsoCancelacion | null): AvisoPedido {
  if (reembolso?.estado === 'reembolsado') {
    return {
      tipo: 'exito',
      // Sin monto válido no se escribe "$0": se dice la devolución sin cifra.
      texto: `${MENSAJE_CANCELADO} Ya pedimos a Mercado Pago la devolución${
        reembolso.montoCentavos > 0 ? ` de ${formatoPrecio(reembolso.montoCentavos)}` : ''
      } al mismo medio con que pagaste. Puede tardar unos días en reflejarse, según tu banco.`,
    };
  }
  if (reembolso?.estado === 'en_revision') {
    return {
      tipo: 'aviso',
      texto: `${MENSAJE_CANCELADO} La devolución de tu pago quedó en revisión: el salón la hará y te avisará.`,
    };
  }
  return { tipo: 'exito', texto: MENSAJE_CANCELADO };
}

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
  const [pagoEnProceso, setPagoEnProceso] = useState(false);
  // Solo la última solicitud escribe el estado (recargas al enfocar, reintentos o pantalla desmontada).
  const solicitud = useRef(0);
  const montada = useRef(true);
  const hayDatos = useRef(false);
  // Un doble toque no abre dos pantallas; se libera al volver a enfocar.
  const navegando = useRef(false);

  const numero = numeroValido(pedidoId);

  /**
   * Con el pedido en línea por pagar y dentro de su plazo, pregunta una vez y en silencio si
   * Mercado Pago ya procesa un pago. Si la consulta falla, el detalle queda como estaba. Solo
   * escribe si sigue siendo la última solicitud (y la pantalla está montada).
   */
  const consultarPago = useCallback((cargado: Pedido, actual: number) => {
    if (!pidePagoEnLinea(cargado)) {
      setPagoEnProceso(false);
      return;
    }
    obtenerEstadoPagoPedido(cargado.id)
      .then(({ estado: estadoPago, pedidoEstado }) => {
        if (actual !== solicitud.current) {
          return;
        }
        setPagoEnProceso(estadoPago === 'pendiente' || estadoPago === 'revision');
        // Pagado o cancelado del lado del servidor: se muestra el estado real del pedido.
        if ((estadoPago === 'aprobado' || estadoPago === 'cancelado') && pedidoEstado) {
          setPedido((previo) =>
            previo && previo.id === cargado.id && previo.estado !== pedidoEstado
              ? { ...previo, estado: pedidoEstado }
              : previo,
          );
        }
      })
      .catch(() => {
        // En silencio: sin respuesta, el detalle sigue como lo mandó el pedido.
      });
  }, []);

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
          consultarPago(respuesta, actual);
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
    [numero, consultarPago],
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

  /** Abre la confirmación del pedido una sola vez (un doble toque no apila dos pantallas). */
  const abrirConfirmacion = useCallback(
    (consulta: string) => {
      if (!idPedido || navegando.current) {
        return;
      }
      navegando.current = true;
      router.push(`/pedido-confirmado/${idPedido}?${consulta}` as Href);
    },
    [idPedido, router],
  );

  const completarPago = useCallback(() => abrirConfirmacion('pagar=1&origen=pedido'), [abrirConfirmacion]);

  // Sin pagar=1: la confirmación solo consulta el pago, nunca abre otro (evita un cobro doble).
  const revisarPago = useCallback(() => abrirConfirmacion('origen=pedido'), [abrirConfirmacion]);

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

  /** Muestra el pedido ya cancelado, cierra la hoja y deja el aviso. */
  const mostrarCancelado = useCallback((cancelado: Pedido, nuevoAviso: AvisoPedido) => {
    // Ninguna recarga anterior pisa el pedido ya cancelado.
    solicitud.current += 1;
    hayDatos.current = true;
    setPedido(cancelado);
    setEstado('listo');
    setAviso(nuevoAviso);
    setHojaCancelarVisible(false);
  }, []);

  /**
   * Tras cancelar sin respuesta, lee el pedido; si ya quedó cancelado, se muestra así. Devuelve
   * true si ya no hay nada más que hacer (se mostró cancelado o la pantalla se desmontó).
   */
  const releerTrasFalloDeRed = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const leido = await obtenerPedido(id);
        if (montada.current && leido.estado === 'cancelado') {
          mostrarCancelado(leido, { tipo: 'exito', texto: MENSAJE_CANCELADO });
          return true;
        }
      } catch {
        // Tampoco hubo respuesta: queda el mensaje de sin conexión en la hoja.
      }
      return !montada.current;
    },
    [mostrarCancelado],
  );

  /** Muestra en la hoja o en la pantalla el error de cancelar, según el código del servidor. */
  const atenderErrorCancelacion = useCallback(
    (status: number | null, mensaje: string) => {
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
    },
    [cargar],
  );

  const cancelar = useCallback(() => {
    const actualPedido = pedido;
    if (!actualPedido) {
      return;
    }
    candado(async () => {
      setCancelando(true);
      setErrorCancelacion(null);
      try {
        const { pedido: nuevo, reembolso } = await cancelarPedido(actualPedido.id);
        if (!montada.current) {
          return;
        }
        mostrarCancelado(nuevo, avisoCancelado(reembolso));
      } catch (error) {
        if (!montada.current) {
          return;
        }
        const mensaje = mensajeCancelarPedido(error);
        const status = error instanceof ApiError ? error.status : null;
        // Sin respuesta (el reembolso con Mercado Pago puede tardar): antes de decir que no se pudo,
        // se lee el pedido; si ya quedó cancelado, se muestra así.
        if (esErrorDeRed(error) || status === 0) {
          const terminado = await releerTrasFalloDeRed(actualPedido.id);
          if (terminado) {
            return;
          }
        }
        atenderErrorCancelacion(status, mensaje);
      } finally {
        if (montada.current) {
          setCancelando(false);
        }
      }
    });
  }, [pedido, candado, mostrarCancelado, releerTrasFalloDeRed, atenderErrorCancelacion]);

  return {
    estado,
    pedido,
    numero,
    recargar,
    regresar,
    verMisPedidos,
    completarPago,
    pagoEnProceso,
    revisarPago,
    hojaCancelarVisible,
    abrirCancelar,
    cerrarCancelar,
    cancelar,
    cancelando,
    errorCancelacion,
    aviso,
  };
}
