import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler } from 'react-native';

import { duracion } from '@/shared/ui/tokens';
import { useCandado } from '@/shared/ui/useCandado';

import { mensajeComunTienda } from '../models/carritoModel';
import {
  crearPreferenciaPedido,
  esPagoEnLinea,
  esPedidoNoEncontrado,
  limitePagoPedido,
  mensajePreferenciaPedido,
  motivoConflictoPedido,
  obtenerEstadoPagoPedido,
  obtenerPedido,
  pidePagoEnLinea,
  type EstadoPagoPedido,
  type Pedido,
  type ResultadoEstadoPago,
} from '../models/pedidoModel';
import { MENSAJE_SIN_NAVEGADOR, abrirPagoEnNavegador } from './pagoPedido';

export type EstadoCargaPedido = 'cargando' | 'listo' | 'error' | 'noEncontrado';

/**
 * Lo que la pantalla cuenta del pedido:
 * - apartado: se paga al recogerlo en el salón.
 * - consultando: primera consulta del pago en línea, todavía sin respuesta.
 * - porPagar: pago en línea sin intento todavía (o sin poder consultarlo).
 * - aprobado, revision, pendiente: lo que dice Mercado Pago.
 * - noCompletado: rechazado, o sin pago cuando ya no se está consultando.
 * - cancelado: el pedido está cancelado.
 */
export type VistaPedido =
  | 'apartado'
  | 'consultando'
  | 'porPagar'
  | 'aprobado'
  | 'revision'
  | 'pendiente'
  | 'noCompletado'
  | 'cancelado';

export interface PedidoConfirmadoViewModel {
  estado: EstadoCargaPedido;
  pedido: Pedido | null;
  vista: VistaPedido;
  /** Mercado Pago rechazó el pago (en noCompletado): cambia el motivo del texto. */
  rechazado: boolean;
  /** Hay consultas del pago en curso (se actualiza sola). */
  consultando: boolean;
  /** Se pide la preferencia o el navegador está abierto. */
  abriendo: boolean;
  /** 'sábado 18 de octubre, 6:30 p. m.' mientras se puede pagar en línea; si no, null. */
  limite: string | null;
  /** Se puede ofrecer el botón para pagar en línea. */
  puedePagar: boolean;
  /**
   * Volvió de Mercado Pago y las consultas terminaron sin ver el pago: puede tardar en reflejarse,
   * así que lo primero es revisar de nuevo y pagar otra vez queda en segundo plano (evita doble cobro).
   */
  pagoPorConfirmar: boolean;
  /** Mensaje del último intento de abrir el pago, o null. */
  errorPago: string | null;
  /** Mensaje de la última consulta del pago que falló, o null. */
  errorConsulta: string | null;
  recargar: () => void;
  pagar: () => void;
  /** Vuelve a consultar el estado del pago (y sigue mientras siga pendiente). */
  revisarDeNuevo: () => void;
  verMisPedidos: () => void;
  seguirComprando: () => void;
}

const MENSAJE_NO_REVISO =
  'No pudimos revisar tu pago. Si ya pagaste, no pagues de nuevo: toca Revisar mi pago.';

/** Estados del pedido que ya implican el pago en línea aprobado. */
const ESTADOS_PAGADOS: readonly string[] = ['pagado', 'preparando', 'listo_recoger', 'entregado'];

interface OpcionesConsulta {
  /** Vuelve a consultar cada duracion.consultaPago mientras siga pendiente. */
  repetir: boolean;
  /** La clienta acaba de volver de Mercado Pago: 'sin_pago' también se vuelve a consultar. */
  trasRegreso: boolean;
}

/** Qué cuenta la pantalla según el pedido, el último estado del pago y las consultas en curso. */
function calcularVista(
  pedido: Pedido | null,
  estadoPago: EstadoPagoPedido | null,
  consultando: boolean,
  trasRegreso: boolean,
): VistaPedido {
  if (!pedido) {
    return 'apartado';
  }
  if (pedido.estado === 'cancelado' || estadoPago === 'cancelado') {
    return 'cancelado';
  }
  if (!esPagoEnLinea(pedido)) {
    return 'apartado';
  }
  // Sin respuesta del pago todavía, la consulta en curso manda sobre el estado del pedido.
  if (estadoPago === null && consultando) {
    return 'consultando';
  }
  if (estadoPago === 'aprobado' || ESTADOS_PAGADOS.includes(pedido.estado)) {
    return 'aprobado';
  }
  if (estadoPago === null) {
    return 'porPagar';
  }
  if (estadoPago === 'revision') {
    return 'revision';
  }
  if (estadoPago === 'pendiente') {
    return 'pendiente';
  }
  if (estadoPago === 'sin_pago' && consultando && trasRegreso) {
    // Recién vuelve de Mercado Pago: puede tardar en reflejarse. Texto neutro, no "procesando".
    return 'consultando';
  }
  return 'noCompletado';
}

/**
 * Confirmación de un pedido (GP-06.4). El estado siempre sale del servidor (pedido y estado del
 * pago), nunca de los parámetros de la ruta:
 * - `pagarAlAbrir` (?pagar=1, desde el checkout): abre Mercado Pago una sola vez al cargar.
 * - `revisarAlAbrir` (?retorno=mp, regreso en arranque en frío): consulta el pago al cargar.
 * - Sin parámetros, un pedido en línea pendiente consulta su pago una vez.
 * - `desdeDetalle` (?origen=pedido, "Completar el pago" del detalle): atrás regresa al detalle.
 */
export function usePedidoConfirmadoViewModel(
  pedidoId: string | undefined,
  pagarAlAbrir = false,
  revisarAlAbrir = false,
  desdeDetalle = false,
): PedidoConfirmadoViewModel {
  const router = useRouter();
  const candado = useCandado();

  const [estado, setEstado] = useState<EstadoCargaPedido>('cargando');
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [estadoPago, setEstadoPago] = useState<EstadoPagoPedido | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [trasRegreso, setTrasRegreso] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null);
  // El plazo terminó: ya no se ofrece pagar.
  const [pagoCerrado, setPagoCerrado] = useState(false);

  const idLimpio = pedidoId?.trim() ?? '';

  const montada = useRef(true);
  const solicitud = useRef(0);
  // Suelta la espera del regreso del navegador si la pantalla se desmonta.
  const soltarEspera = useRef<(() => void) | null>(null);
  // Consultas del pago: sesión activa (null: ninguna), su inicio, su temporizador y la que va en vuelo.
  const contadorSesiones = useRef(0);
  const sesionActiva = useRef<number | null>(null);
  const inicioSesion = useRef(0);
  const opcionesSesion = useRef<OpcionesConsulta>({ repetir: false, trasRegreso: false });
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVuelo = useRef(false);
  // Qué hacer al terminar la próxima carga: la acción automática de la ruta (una sola vez por
  // pantalla) o una consulta del pago.
  const automaticoUsado = useRef(false);
  const accionTrasCarga = useRef<'auto' | 'consultar' | null>('auto');

  const detenerConsultas = useCallback(() => {
    sesionActiva.current = null;
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
    if (montada.current) {
      setConsultando(false);
    }
  }, []);

  const aplicarResultado = useCallback((resultado: ResultadoEstadoPago) => {
    setEstadoPago(resultado.estado);
    if (resultado.pedidoEstado) {
      setPedido((actual) =>
        actual && actual.estado !== resultado.pedidoEstado
          ? { ...actual, estado: resultado.pedidoEstado }
          : actual,
      );
    }
  }, []);

  /**
   * Una consulta del pago. Si al volver sigue habiendo una sesión activa (la misma u otra que se
   * abrió mientras iba en vuelo), decide si se vuelve a consultar dentro del límite de tiempo.
   */
  const consultarUnaVez = useCallback(
    async (id: number) => {
      if (enVuelo.current) {
        return;
      }
      enVuelo.current = true;
      let resultado: ResultadoEstadoPago | null = null;
      let fallo: unknown = null;
      try {
        resultado = await obtenerEstadoPagoPedido(id);
      } catch (error) {
        fallo = error;
      } finally {
        enVuelo.current = false;
      }
      if (!montada.current) {
        return;
      }
      // El resultado es real aunque las consultas se hayan detenido mientras iba en vuelo.
      if (resultado) {
        aplicarResultado(resultado);
        setErrorConsulta(null);
      }
      const sesion = sesionActiva.current;
      if (sesion === null) {
        return;
      }
      if (!resultado) {
        setErrorConsulta(mensajeComunTienda(fallo) ?? MENSAJE_NO_REVISO);
        detenerConsultas();
        return;
      }
      const { repetir, trasRegreso: regreso } = opcionesSesion.current;
      const sigue =
        resultado.estado === 'pendiente' || (regreso && resultado.estado === 'sin_pago');
      const transcurrido = Date.now() - inicioSesion.current;
      // Un pago que todavía no aparece tras volver se consulta poco: la clienta pudo cerrar sin pagar.
      const limite =
        resultado.estado === 'sin_pago' ? duracion.limiteConsultaSinPago : duracion.limiteConsultaPago;
      if (repetir && sigue && transcurrido + duracion.consultaPago <= limite) {
        temporizador.current = setTimeout(() => {
          temporizador.current = null;
          if (sesionActiva.current === sesion) {
            void consultarUnaVez(id);
          }
        }, duracion.consultaPago);
        return;
      }
      detenerConsultas();
    },
    [aplicarResultado, detenerConsultas],
  );

  /** Empieza una sesión de consultas; nunca lanza una consulta encima de otra en vuelo. */
  const iniciarConsultas = useCallback(
    (id: number, opciones: OpcionesConsulta) => {
      if (temporizador.current) {
        clearTimeout(temporizador.current);
        temporizador.current = null;
      }
      contadorSesiones.current += 1;
      sesionActiva.current = contadorSesiones.current;
      inicioSesion.current = Date.now();
      opcionesSesion.current = opciones;
      setConsultando(true);
      setTrasRegreso(opciones.trasRegreso);
      setErrorConsulta(null);
      if (opciones.trasRegreso) {
        // Lo anterior (por ejemplo, un rechazo) ya no vale: se espera la primera respuesta.
        setEstadoPago(null);
      }
      // Si una consulta va en vuelo, su respuesta continúa esta sesión.
      if (!enVuelo.current) {
        void consultarUnaVez(id);
      }
    },
    [consultarUnaVez],
  );

  const recargar = useCallback(() => {
    solicitud.current += 1;
    const actual = solicitud.current;
    detenerConsultas();
    accionTrasCarga.current = automaticoUsado.current ? 'consultar' : 'auto';
    setErrorPago(null);
    setErrorConsulta(null);
    setEstado('cargando');
    obtenerPedido(idLimpio)
      .then((respuesta) => {
        if (actual !== solicitud.current) {
          return;
        }
        setPedido(respuesta);
        setEstadoPago(null);
        setEstado('listo');
      })
      .catch((error: unknown) => {
        if (actual !== solicitud.current) {
          return;
        }
        accionTrasCarga.current = null;
        setPedido(null);
        setEstado(esPedidoNoEncontrado(error) ? 'noEncontrado' : 'error');
      });
  }, [idLimpio, detenerConsultas]);

  useEffect(() => {
    montada.current = true;
    recargar();
    return () => {
      montada.current = false;
      solicitud.current += 1;
      sesionActiva.current = null;
      if (temporizador.current) {
        clearTimeout(temporizador.current);
        temporizador.current = null;
      }
      soltarEspera.current?.();
    };
  }, [recargar]);

  /**
   * Antes de pedir otra preferencia se pregunta al servidor: con un pago en proceso, en revisión
   * o aprobado no se abre Mercado Pago (evita un doble cobro, también con ?pagar=1).
   * Devuelve true si se puede seguir con el pago.
   */
  const revisarPagoPrevio = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const previo = await obtenerEstadoPagoPedido(id);
        if (!montada.current) {
          return false;
        }
        if (previo.estado !== 'sin_pago' && previo.estado !== 'rechazado') {
          setAbriendo(false);
          aplicarResultado(previo);
          if (previo.estado === 'pendiente') {
            iniciarConsultas(id, { repetir: true, trasRegreso: false });
          }
          return false;
        }
      } catch (error) {
        if (!montada.current) {
          return false;
        }
        setAbriendo(false);
        setErrorConsulta(mensajeComunTienda(error) ?? MENSAJE_NO_REVISO);
        return false;
      }
      return true;
    },
    [aplicarResultado, iniciarConsultas],
  );

  /** Pide la preferencia de Mercado Pago; si falla, deja el aviso y devuelve null. */
  const pedirPreferencia = useCallback(
    async (id: number): Promise<string | null> => {
      try {
        return await crearPreferenciaPedido(id);
      } catch (error) {
        if (!montada.current) {
          return null;
        }
        setAbriendo(false);
        const motivo = motivoConflictoPedido(error);
        if (motivo === 'noPendiente') {
          // Ya se pagó o cambió: se lee de nuevo el pedido y su pago.
          recargar();
          return null;
        }
        if (motivo === 'vencido') {
          setPagoCerrado(true);
        }
        setErrorPago(mensajePreferenciaPedido(error));
        return null;
      }
    },
    [recargar],
  );

  const pagarPedido = useCallback(
    async (id: number) => {
      detenerConsultas();
      setErrorPago(null);
      setErrorConsulta(null);
      setAbriendo(true);
      const sigue = await revisarPagoPrevio(id);
      if (!sigue) {
        return;
      }
      const initPoint = await pedirPreferencia(id);
      if (initPoint === null) {
        return;
      }
      if (!montada.current) {
        setAbriendo(false);
        return;
      }
      const resultado = await abrirPagoEnNavegador(initPoint, (soltar) => {
        soltarEspera.current = soltar;
      });
      if (!montada.current) {
        return;
      }
      setAbriendo(false);
      if (resultado === 'sinNavegador') {
        setErrorPago(MENSAJE_SIN_NAVEGADOR);
        return;
      }
      iniciarConsultas(id, { repetir: true, trasRegreso: true });
    },
    [detenerConsultas, revisarPagoPrevio, pedirPreferencia],
  );

  // Al terminar cada carga: la acción automática de la ruta (una vez) o la consulta del pago.
  useEffect(() => {
    if (estado !== 'listo' || !pedido) {
      return;
    }
    const accion = accionTrasCarga.current;
    accionTrasCarga.current = null;
    if (!accion || !esPagoEnLinea(pedido)) {
      return;
    }
    if (accion === 'auto') {
      automaticoUsado.current = true;
      if (pagarAlAbrir && pidePagoEnLinea(pedido)) {
        const id = pedido.id;
        candado(() => pagarPedido(id));
        return;
      }
      if (revisarAlAbrir) {
        iniciarConsultas(pedido.id, { repetir: true, trasRegreso: true });
        return;
      }
      if (pedido.estado === 'pendiente_pago') {
        iniciarConsultas(pedido.id, { repetir: false, trasRegreso: false });
      }
      return;
    }
    iniciarConsultas(pedido.id, { repetir: false, trasRegreso: false });
  }, [estado, pedido, pagarAlAbrir, revisarAlAbrir, candado, pagarPedido, iniciarConsultas]);

  // Las consultas se detienen al perder el foco y al pasar la app a segundo plano.
  useFocusEffect(
    useCallback(() => {
      const suscripcion = AppState.addEventListener('change', (estadoApp) => {
        if (estadoApp !== 'active' && sesionActiva.current !== null) {
          detenerConsultas();
        }
      });
      return () => {
        suscripcion.remove();
        detenerConsultas();
      };
    }, [detenerConsultas]),
  );

  const verMisPedidos = useCallback(() => {
    // Saca de la pila la compra (o el detalle), deja las pestañas en la Tienda y abre Mis pedidos
    // encima: atrás no regresa a la pestaña Carrito vacía. Las acciones del router van en orden.
    router.dismissTo('/tienda');
    router.push('/mis-pedidos');
  }, [router]);

  const seguirComprando = useCallback(() => {
    router.dismissTo('/tienda');
  }, [router]);

  // Atrás de Android no vuelve al checkout: regresa a la tienda sacando de la pila la compra.
  // Si se abrió desde el detalle del pedido, regresa a ese detalle.
  useFocusEffect(
    useCallback(() => {
      const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
        if (desdeDetalle && router.canGoBack()) {
          router.back();
        } else {
          router.dismissTo('/tienda');
        }
        return true;
      });
      return () => suscripcion.remove();
    }, [router, desdeDetalle]),
  );

  const pagar = useCallback(() => {
    if (!pedido) {
      return;
    }
    const id = pedido.id;
    candado(() => pagarPedido(id));
  }, [pedido, candado, pagarPedido]);

  const revisarDeNuevo = useCallback(() => {
    if (!pedido || abriendo) {
      return;
    }
    iniciarConsultas(pedido.id, { repetir: true, trasRegreso: false });
  }, [pedido, abriendo, iniciarConsultas]);

  // ── Lo que se muestra ──────────────────────────────────────────────────────────────────
  const vista = calcularVista(pedido, estadoPago, consultando, trasRegreso);

  const sePuedePagar = pedido != null && pidePagoEnLinea(pedido) && !pagoCerrado;
  const puedePagar =
    sePuedePagar &&
    !consultando &&
    errorConsulta === null &&
    (vista === 'porPagar' || vista === 'noCompletado');
  const pagoPorConfirmar =
    vista === 'noCompletado' && estadoPago === 'sin_pago' && trasRegreso && !consultando;
  const muestraPlazo =
    sePuedePagar && vista !== 'aprobado' && vista !== 'revision' && vista !== 'cancelado';

  return {
    estado,
    pedido,
    vista,
    rechazado: estadoPago === 'rechazado',
    consultando,
    abriendo,
    limite: muestraPlazo && pedido ? limitePagoPedido(pedido) : null,
    puedePagar,
    pagoPorConfirmar,
    errorPago,
    errorConsulta,
    recargar,
    pagar,
    revisarDeNuevo,
    verMisPedidos,
    seguirComprando,
  };
}
