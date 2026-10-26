import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { esErrorDeRed } from '@/features/auth/models/AuthModel';
import { enlaceTelefono } from '@/features/salon/models/salonModel';
import { ApiError } from '@/shared/api/apiClient';
import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useConfiguracionPublica } from '@/shared/api/useConfiguracionPublica';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { useCandado } from '@/shared/ui/useCandado';
import { tiendaCompra } from '@/shared/ui/tokens';

import {
  listarDevolucionesPedido,
  listarPagosPedido,
  tieneRevocacion,
  type Devolucion,
  type PagoPedido,
} from '../models/devolucionesModel';
import {
  cancelarPedido,
  esPedidoNoEncontrado,
  mensajeCancelarPedido,
  motivoErrorCancelar,
  obtenerPedido,
  pidePagoEnLinea,
  type Pedido,
} from '../models/pedidoModel';
import {
  mensajeRevocar,
  montoRevocable,
  motivoErrorRevocar,
  revocarCompra,
  textoResultadoRevocacion,
  type MotivoErrorRevocar,
} from '../models/revocacionModel';
import { abrirEnlace } from './checkoutTienda';
import {
  avisoCancelado,
  pagoEnProcesoDe,
  presentarDetalle,
  presentarDevoluciones,
  presentarPagos,
  type AvisoPedido,
  type DevolucionVisible,
  type PagoVisible,
  type PresentacionDetalle,
} from './detallePedido';
import { useSolicitudDevolucion, type SolicitudDevolucionViewModel } from './useSolicitudDevolucion';
import {
  mantenerVerificacion,
  suscribirVerificacion,
  useEstadoPagoConocido,
  verificarPago,
} from './useVerificacionPago';

// La vista no importa de models/: recibe estos tipos del viewmodel.
export type { Pedido } from '../models/pedidoModel';
export type { AvisoPedido, DevolucionVisible, PagoVisible, PresentacionDetalle } from './detallePedido';
export type {
  OpcionSolicitud,
  SolicitudDevolucionViewModel,
  TextosRetirar,
  TextosSolicitud,
} from './useSolicitudDevolucion';

export type EstadoDetallePedido = 'cargando' | 'listo' | 'error' | 'noEncontrado';
export type EstadoDevoluciones = 'cargando' | 'listo' | 'error';

/** Textos de la sección de devoluciones y reembolsos, del catálogo. */
export interface TextosDevoluciones {
  titulo: string;
  cargando: string;
  vacia: string;
  error: string;
  reintentar: string;
  pagosTitulo: string;
  notaTitulo: string;
}

/** Textos de la hoja para revocar, del catálogo. */
export interface TextosRevocar {
  boton: string;
  titulo: string;
  motivo: string;
  motivoAyuda: string;
  confirmar: string;
  revocando: string;
  conservar: string;
}

export interface DetallePedidoViewModel {
  /** Con estado 'error': por qué no se cargó el pedido (sin red, servidor...); null si no hay error. */
  mensajeError: string | null;
  estado: EstadoDetallePedido;
  pedido: Pedido | null;
  /** Lo que se pinta del pedido (textos, acciones y plazos); null sin pedido. */
  detalle: PresentacionDetalle | null;
  /** Número del pedido para el título (el del parámetro mientras carga); null si no es válido. */
  numero: string | null;
  /** Vuelve a cargar con skeleton (botón Reintentar). */
  recargar: () => void;
  regresar: () => void;
  verMisPedidos: () => void;
  /** Abre la confirmación del pedido con el pago de Mercado Pago. */
  completarPago: () => void;
  /** Abre la confirmación del pedido solo para consultar su pago (sin abrir Mercado Pago). */
  revisarPago: () => void;
  /**
   * El pago en línea está en proceso (registro de la verificación): no se pide pagar otra vez ni se
   * ofrece cancelar.
   */
  pagoEnProceso: boolean;
  hojaCancelarVisible: boolean;
  abrirCancelar: () => void;
  /** Cierra la hoja; mientras cancela no hace nada para no perder el resultado. */
  cerrarCancelar: () => void;
  cancelar: () => void;
  cancelando: boolean;
  /** Tras un 429 al cancelar: el botón de la hoja queda deshabilitado hasta que pase la espera. */
  cancelarEnEspera: boolean;
  /** "Intenta de nuevo en N s" en el botón de la hoja mientras dura la espera; null sin espera. */
  textoEsperaCancelar: string | null;
  /** Mensaje para la clienta dentro de la hoja si la cancelación falla, o null. */
  errorCancelacion: string | null;
  hojaRevocarVisible: boolean;
  abrirRevocar: () => void;
  cerrarRevocar: () => void;
  motivoRevocacion: string;
  cambiarMotivoRevocacion: (motivo: string) => void;
  largoMotivoRevocacion: number;
  revocar: () => void;
  revocando: boolean;
  errorRevocacion: string | null;
  textosRevocar: TextosRevocar;
  aviso: AvisoPedido | null;
  /** "Llamar al ..." si hay un teléfono del salón para marcar; null si no. */
  textoLlamar: string | null;
  llamarSalon: () => void;
  estadoDevoluciones: EstadoDevoluciones;
  devoluciones: DevolucionVisible[];
  pagos: PagoVisible[];
  textosDevoluciones: TextosDevoluciones;
  reintentarDevoluciones: () => void;
  /** Pedir una solicitud de cambio o reembolso y retirar una pendiente. */
  solicitud: SolicitudDevolucionViewModel;
}

/** Id numérico positivo del parámetro de la ruta, en texto; null si no es válido. */
function numeroValido(id: string | undefined): string | null {
  const limpio = id?.trim() ?? '';
  return /^[1-9]\d*$/.test(limpio) ? limpio : null;
}

/** 409 y 404 de revocar que cierran la hoja y se avisan en la pantalla (el pedido se vuelve a leer). */
const REVOCAR_EN_PANTALLA: readonly MotivoErrorRevocar[] = [
  'yaRevocada',
  'cancelado',
  'sinPago',
  'plazoTerminado',
  'devolucionActiva',
  'yaReembolsado',
  'cambio',
  'noEncontrado',
];

/** Estos piden comunicarse con el salón. */
const REVOCAR_CON_SALON: readonly MotivoErrorRevocar[] = ['plazoTerminado', 'devolucionActiva'];

/** Sin respuesta del servidor: antes de decir que no se pudo, se vuelve a leer el pedido. */
function sinRespuesta(error: unknown): boolean {
  return esErrorDeRed(error) || (error instanceof ApiError && error.status === 0);
}

/**
 * Detalle de un pedido de la clienta (GP-06.4, GP-07.5): estado y qué sigue con las reglas guardadas
 * en el pedido, cancelar (nunca con el pago en línea en proceso), revocar la compra (art. 56 LFPC) y
 * sus devoluciones y reembolsos. Recarga en silencio cada vez que la pantalla vuelve a estar
 * enfocada; el pago en línea lo sigue el registro de la verificación (useVerificacionPago).
 */
export function useDetallePedidoViewModel(pedidoId: string | undefined): DetallePedidoViewModel {
  const router = useRouter();
  const candado = useCandado();
  const { configuracion } = useConfiguracionPublica();
  // Un 429 al cancelar deja el botón de la hoja en espera; el message del backend queda en la hoja.
  const { activa: cancelarEnEspera, texto: textoEsperaCancelar, esperarSiLimite } = useEsperaLimite();
  const [estado, setEstado] = useState<EstadoDetallePedido>('cargando');
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [hojaCancelarVisible, setHojaCancelarVisible] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelacion, setErrorCancelacion] = useState<string | null>(null);
  const [hojaRevocarVisible, setHojaRevocarVisible] = useState(false);
  const [motivoRevocacion, setMotivoRevocacion] = useState('');
  const [revocando, setRevocando] = useState(false);
  const [errorRevocacion, setErrorRevocacion] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoPedido | null>(null);
  const [estadoDevoluciones, setEstadoDevoluciones] = useState<EstadoDevoluciones>('cargando');
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [pagos, setPagos] = useState<PagoPedido[]>([]);
  // Solo la última solicitud escribe el estado (recargas al enfocar, reintentos o pantalla desmontada).
  const solicitud = useRef(0);
  const solicitudDevoluciones = useRef(0);
  const montada = useRef(true);
  const hayDatos = useRef(false);
  const hayDevoluciones = useRef(false);
  // El estado del pedido a la vista, al momento (el oyente del registro lo compara sin esperar a pintar).
  const estadoVisto = useRef('');
  // Un doble toque no abre dos pantallas; se libera al volver a enfocar.
  const navegando = useRef(false);

  const numero = numeroValido(pedidoId);
  const idNumero = numero === null ? null : Number(numero);
  const conocido = useEstadoPagoConocido(idNumero);
  const pagoEnProceso = pagoEnProcesoDe(conocido);

  /** Devoluciones y pagos del pedido, en paralelo. Si fallan, el detalle sigue y la sección lo dice. */
  const cargarDevoluciones = useCallback((id: number) => {
    solicitudDevoluciones.current += 1;
    const actual = solicitudDevoluciones.current;
    if (!hayDevoluciones.current) {
      setEstadoDevoluciones('cargando');
    }
    Promise.all([listarDevolucionesPedido(id), listarPagosPedido(id)])
      .then(([listaDevoluciones, listaPagos]) => {
        if (actual !== solicitudDevoluciones.current) {
          return;
        }
        hayDevoluciones.current = true;
        setDevoluciones(listaDevoluciones);
        setPagos(listaPagos);
        setEstadoDevoluciones('listo');
      })
      .catch(() => {
        if (actual !== solicitudDevoluciones.current) {
          return;
        }
        // Con la sección ya mostrada, una recarga silenciosa que falla la deja como estaba.
        if (!hayDevoluciones.current) {
          setEstadoDevoluciones('error');
        }
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
          estadoVisto.current = respuesta.estado;
          setPedido(respuesta);
          setEstado('listo');
          cargarDevoluciones(respuesta.id);
          // Con el pago en línea por hacer, una consulta del pago (el registro la comparte si ya va una).
          if (pidePagoEnLinea(respuesta)) {
            void verificarPago(respuesta.id, { motivo: 'apertura' });
          }
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
          estadoVisto.current = '';
          setPedido(null);
          setHojaCancelarVisible(false);
          setHojaRevocarVisible(false);
          setErrorCarga(error);
          setEstado(noEncontrado ? 'noEncontrado' : 'error');
        });
    },
    [numero, cargarDevoluciones],
  );

  const recargar = useCallback(() => cargar(false), [cargar]);

  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
      solicitud.current += 1;
      solicitudDevoluciones.current += 1;
    };
  }, []);

  // La carga más reciente, para el oyente del registro (sin volver a suscribirse).
  const cargarActual = useRef(cargar);
  useEffect(() => {
    cargarActual.current = cargar;
  });

  // Mientras la pantalla está montada sigue el pago del pedido. Cada cambio real del pago que trae
  // otro estado del pedido (pagado, cancelado) se muestra de inmediato y el pedido se vuelve a leer
  // una sola vez (la transición llega una sola vez por cambio).
  useEffect(() => {
    if (idNumero === null) {
      return undefined;
    }
    const soltar = mantenerVerificacion(idNumero);
    const dejarDeEscuchar = suscribirVerificacion(({ pedidoId: id, transicion }) => {
      if (id !== idNumero || !transicion || !montada.current) {
        return;
      }
      const nuevo = transicion.pedidoEstado;
      if (nuevo && nuevo !== estadoVisto.current) {
        estadoVisto.current = nuevo;
        setPedido((actual) => (actual && actual.id === id ? { ...actual, estado: nuevo } : actual));
        cargarActual.current(true);
      }
    });
    return () => {
      dejarDeEscuchar();
      soltar();
    };
  }, [idNumero]);

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

  const completarPago = useCallback(() => {
    // Con un pago en proceso nunca se abre otro (evita un cobro doble).
    if (pagoEnProceso) {
      return;
    }
    abrirConfirmacion('pagar=1&origen=pedido');
  }, [abrirConfirmacion, pagoEnProceso]);

  // Sin pagar=1: la confirmación solo consulta el pago, nunca abre otro (evita un cobro doble).
  const revisarPago = useCallback(() => abrirConfirmacion('origen=pedido'), [abrirConfirmacion]);

  const detalle = pedido
    ? presentarDetalle({
        pedido,
        pagoEnProceso,
        verificandoPago: conocido?.verificando ?? false,
        devoluciones,
        ahora: Date.now(),
        config: configuracion,
      })
    : null;
  const puedeCancelarAhora = detalle?.puedeCancelar ?? false;
  const puedeRevocarAhora = detalle?.puedeRevocar ?? false;

  const abrirCancelar = useCallback(() => {
    if (!puedeCancelarAhora) {
      return;
    }
    setErrorCancelacion(null);
    setHojaCancelarVisible(true);
  }, [puedeCancelarAhora]);

  const cerrarCancelar = useCallback(() => {
    if (cancelando) {
      return;
    }
    setHojaCancelarVisible(false);
    setErrorCancelacion(null);
  }, [cancelando]);

  /** Muestra el pedido como quedó (cancelado o revocado), cierra las hojas y deja el aviso. */
  const mostrarResultado = useCallback(
    (nuevo: Pedido, nuevoAviso: AvisoPedido) => {
      // Ninguna recarga anterior pisa el pedido nuevo.
      solicitud.current += 1;
      hayDatos.current = true;
      estadoVisto.current = nuevo.estado;
      setPedido(nuevo);
      setEstado('listo');
      setAviso(nuevoAviso);
      setHojaCancelarVisible(false);
      setHojaRevocarVisible(false);
      cargarDevoluciones(nuevo.id);
    },
    [cargarDevoluciones],
  );

  /**
   * Tras cancelar sin respuesta, lee el pedido; si ya quedó cancelado, se muestra así. Devuelve
   * true si ya no hay nada más que hacer (se mostró cancelado o la pantalla se desmontó).
   */
  const releerCancelado = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const leido = await obtenerPedido(id);
        if (montada.current && leido.estado === 'cancelado') {
          mostrarResultado(leido, avisoCancelado(null, configuracion));
          return true;
        }
      } catch {
        // Tampoco hubo respuesta: queda el mensaje de sin conexión en la hoja.
      }
      return !montada.current;
    },
    [mostrarResultado, configuracion],
  );

  /** Muestra en la hoja o en la pantalla el error de cancelar, según el código del servidor. */
  const atenderErrorCancelacion = useCallback(
    (error: unknown) => {
      const mensaje = mensajeCancelarPedido(error, configuracion);
      const motivo = motivoErrorCancelar(error);
      if (motivo === 'devolucionEnProceso') {
        // No cambió nada: se cancela con el salón. La sección de devoluciones muestra la que está en proceso.
        setHojaCancelarVisible(false);
        setAviso({ tipo: 'aviso', texto: mensaje, llamarSalon: true });
        if (pedido) {
          cargarDevoluciones(pedido.id);
        }
        return;
      }
      if (motivo === 'cambio' || motivo === 'noEncontrado') {
        // El pedido cambió (o ya no existe): se cierra la hoja y se lee de nuevo.
        setHojaCancelarVisible(false);
        setAviso(motivo === 'cambio' ? { tipo: 'info', texto: mensaje } : null);
        cargar(true);
        return;
      }
      setErrorCancelacion(mensaje);
      if (motivo === 'preparando') {
        // Ya está en preparación: la recarga quita la opción de cancelar de la pantalla.
        cargar(true);
      }
    },
    [cargar, cargarDevoluciones, configuracion, pedido],
  );

  const cancelar = useCallback(() => {
    const actualPedido = pedido;
    if (!actualPedido || !puedeCancelarAhora || cancelarEnEspera) {
      return;
    }
    candado(async () => {
      setCancelando(true);
      setErrorCancelacion(null);
      try {
        const { pedido: nuevo, reembolso } = await cancelarPedido(actualPedido.id);
        if (montada.current) {
          mostrarResultado(nuevo, avisoCancelado(reembolso, configuracion));
        }
      } catch (error) {
        // Sin respuesta (el reembolso con Mercado Pago puede tardar): antes de decir que no se pudo,
        // se lee el pedido; si ya quedó cancelado, se muestra así.
        const terminado = !montada.current || (sinRespuesta(error) && (await releerCancelado(actualPedido.id)));
        if (!terminado) {
          esperarSiLimite(error);
          atenderErrorCancelacion(error);
        }
      } finally {
        if (montada.current) {
          setCancelando(false);
        }
      }
    });
  }, [
    pedido,
    puedeCancelarAhora,
    cancelarEnEspera,
    candado,
    mostrarResultado,
    configuracion,
    releerCancelado,
    atenderErrorCancelacion,
    esperarSiLimite,
  ]);

  // ── Revocar la compra ──────────────────────────────────────────────────────────────────

  const abrirRevocar = useCallback(() => {
    if (!puedeRevocarAhora) {
      return;
    }
    setMotivoRevocacion('');
    setErrorRevocacion(null);
    setHojaRevocarVisible(true);
  }, [puedeRevocarAhora]);

  const cerrarRevocar = useCallback(() => {
    if (revocando) {
      return;
    }
    setHojaRevocarVisible(false);
    setErrorRevocacion(null);
  }, [revocando]);

  const cambiarMotivoRevocacion = useCallback(
    (motivo: string) => {
      if (!revocando) {
        setMotivoRevocacion(motivo.slice(0, tiendaCompra.largoMotivoRevocacion));
      }
    },
    [revocando],
  );

  /**
   * Tras revocar sin respuesta, lee el pedido y sus devoluciones: si ya hay una revocación, se
   * muestra que quedó registrada. Devuelve true si ya no hay nada más que hacer.
   */
  const releerRevocado = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const [leido, lista] = await Promise.all([obtenerPedido(id), listarDevolucionesPedido(id)]);
        if (montada.current && tieneRevocacion(lista)) {
          mostrarResultado(leido, { tipo: 'exito', texto: obtenerTexto('tienda.revocar.registrada', {}, configuracion) });
          return true;
        }
      } catch {
        // Tampoco hubo respuesta: queda el mensaje de sin conexión en la hoja.
      }
      return !montada.current;
    },
    [mostrarResultado, configuracion],
  );

  const atenderErrorRevocacion = useCallback(
    (error: unknown) => {
      const mensaje = mensajeRevocar(error, configuracion);
      const motivo = motivoErrorRevocar(error);
      if (motivo === null || !REVOCAR_EN_PANTALLA.includes(motivo)) {
        // Sin conexión, motivo con caracteres no permitidos o un error del servidor: se queda en la hoja.
        setErrorRevocacion(mensaje);
        return;
      }
      // El servidor no la permitió (o el pedido cambió): se cierra la hoja, se avisa y se lee de nuevo.
      setHojaRevocarVisible(false);
      setAviso({ tipo: 'info', texto: mensaje, llamarSalon: REVOCAR_CON_SALON.includes(motivo) });
      cargar(true);
    },
    [cargar, configuracion],
  );

  const revocar = useCallback(() => {
    const actualPedido = pedido;
    if (!actualPedido || !puedeRevocarAhora) {
      return;
    }
    const motivo = motivoRevocacion;
    candado(async () => {
      setRevocando(true);
      setErrorRevocacion(null);
      try {
        const { pedido: nuevo, revocacion } = await revocarCompra(actualPedido.id, motivo);
        if (montada.current) {
          setMotivoRevocacion('');
          // Sin monto válido en la respuesta, el que el detalle ya ofrecía (nunca "$0").
          const conMonto =
            revocacion.montoCentavos > 0 ? revocacion : { ...revocacion, montoCentavos: montoRevocable(actualPedido) };
          mostrarResultado(nuevo, {
            tipo: revocacion.estado === 'en_revision' ? 'info' : 'exito',
            texto: textoResultadoRevocacion(conMonto, configuracion),
          });
        }
      } catch (error) {
        const terminado = !montada.current || (sinRespuesta(error) && (await releerRevocado(actualPedido.id)));
        if (!terminado) {
          atenderErrorRevocacion(error);
        }
      } finally {
        if (montada.current) {
          setRevocando(false);
        }
      }
    });
  }, [pedido, puedeRevocarAhora, motivoRevocacion, candado, mostrarResultado, configuracion, releerRevocado, atenderErrorRevocacion]);

  // ── Salón y devoluciones ───────────────────────────────────────────────────────────────

  const telefono = configuracion.salon.telefono;
  const marcable = enlaceTelefono(telefono);
  const llamarSalon = useCallback(() => abrirEnlace(marcable), [marcable]);

  const reintentarDevoluciones = useCallback(() => {
    if (!pedido) {
      return;
    }
    hayDevoluciones.current = false;
    cargarDevoluciones(pedido.id);
  }, [pedido, cargarDevoluciones]);

  // ── Pedir y retirar una solicitud ──────────────────────────────────────────────────────

  const idCargado = pedido?.id ?? null;

  /** Vuelve a leer la sección en silencio (la que ya se ve se conserva si falla). */
  const releerDevoluciones = useCallback(() => {
    if (idCargado !== null) {
      cargarDevoluciones(idCargado);
    }
  }, [idCargado, cargarDevoluciones]);

  const agregarDevolucion = useCallback(
    (nueva: Devolucion) => {
      hayDevoluciones.current = true;
      setDevoluciones((actuales) => [nueva, ...actuales.filter((devolucion) => devolucion.id !== nueva.id)]);
      setEstadoDevoluciones('listo');
      releerDevoluciones();
    },
    [releerDevoluciones],
  );

  const marcarRetirada = useCallback(
    (id: number) => {
      setDevoluciones((actuales) =>
        actuales.map((devolucion) => (devolucion.id === id ? { ...devolucion, estado: 'cancelada' } : devolucion)),
      );
      releerDevoluciones();
    },
    [releerDevoluciones],
  );

  const solicitudDevolucion = useSolicitudDevolucion({
    pedido,
    devoluciones,
    config: configuracion,
    avisar: setAviso,
    agregarDevolucion,
    marcarRetirada,
    recargarDevoluciones: releerDevoluciones,
  });

  const texto = (clave: Parameters<typeof obtenerTexto>[0], contexto = {}) => obtenerTexto(clave, contexto, configuracion);

  return {
    mensajeError: estado === 'error' ? mensajeParaClienta(errorCarga) : null,
    estado,
    pedido,
    detalle,
    numero,
    recargar,
    regresar,
    verMisPedidos,
    completarPago,
    revisarPago,
    pagoEnProceso,
    hojaCancelarVisible,
    abrirCancelar,
    cerrarCancelar,
    cancelar,
    cancelando,
    cancelarEnEspera,
    textoEsperaCancelar,
    errorCancelacion,
    hojaRevocarVisible,
    abrirRevocar,
    cerrarRevocar,
    motivoRevocacion,
    cambiarMotivoRevocacion,
    largoMotivoRevocacion: tiendaCompra.largoMotivoRevocacion,
    revocar,
    revocando,
    errorRevocacion,
    textosRevocar: {
      boton: texto('tienda.revocar.boton'),
      titulo: texto('tienda.revocar.titulo', { pedido: pedido?.id ?? numero }),
      motivo: texto('tienda.revocar.motivo'),
      motivoAyuda: texto('tienda.revocar.motivoAyuda'),
      confirmar: texto('tienda.revocar.confirmar'),
      revocando: texto('tienda.revocar.revocando'),
      conservar: texto('tienda.revocar.conservar'),
    },
    aviso,
    textoLlamar: marcable ? texto('salon.contacto.telefono', { telefono }) : null,
    llamarSalon,
    estadoDevoluciones,
    devoluciones: presentarDevoluciones(devoluciones, configuracion),
    pagos: presentarPagos(pagos, configuracion),
    textosDevoluciones: {
      titulo: texto('tienda.devoluciones.titulo'),
      cargando: texto('tienda.devoluciones.cargando'),
      vacia: texto('pedidos.sinDevoluciones'),
      error: texto('tienda.devoluciones.error'),
      reintentar: texto('tienda.devoluciones.reintentar'),
      pagosTitulo: texto('tienda.devoluciones.pagosTitulo'),
      notaTitulo: texto('tienda.devoluciones.notaTitulo'),
    },
    reintentarDevoluciones,
    solicitud: solicitudDevolucion,
  };
}
