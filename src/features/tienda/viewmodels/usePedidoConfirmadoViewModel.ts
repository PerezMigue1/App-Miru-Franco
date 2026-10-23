import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { useTextos, type FuncionTexto } from '@/shared/api/useTextos';
import { useCandado } from '@/shared/ui/useCandado';

import { mensajeComunTienda } from '../models/carritoModel';
import {
  crearPreferenciaPedido,
  esPagoEnLinea,
  esPagoEnSalon,
  esPedidoNoEncontrado,
  limitePagoPedido,
  mensajePreferenciaPedido,
  motivoConflictoPedido,
  obtenerPedido,
  pidePagoEnLinea,
  type EstadoPagoPedido,
  type Pedido,
} from '../models/pedidoModel';
import { formatoPrecio } from '../models/productoModel';
import { abrirPagoEnNavegador } from './pagoPedido';
import {
  estadoPagoConocido,
  mantenerVerificacion,
  suscribirVerificacion,
  verificacionEnCurso,
  verificarPago,
  type EstadoPagoConocido,
} from './useVerificacionPago';

// La vista no importa de models/: recibe este tipo del viewmodel.
export type { Pedido } from '../models/pedidoModel';

export type EstadoCargaPedido = 'cargando' | 'listo' | 'error' | 'noEncontrado';

/**
 * Lo que la pantalla cuenta del pedido:
 * - apartado: se paga al recogerlo en el salón.
 * - consultando: "Verificando tu pago", todavía sin respuesta (o recién vuelve de Mercado Pago).
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

/** Textos de la pantalla, ya llenados desde el catálogo (Admin > Textos del sitio). */
export interface TextosConfirmacion {
  titulo: string;
  mensaje: string;
  /** Apartado por pagar en el salón: cuánto paga en el mostrador; si no, null. */
  pagoEnMostrador: string | null;
  /** 'Paga antes del ...' mientras se puede pagar en línea; si no, null. */
  plazo: string | null;
  verificando: string;
  abriendo: string;
  formaPago: string;
  dondeRecoges: string;
  cargando: string;
  errorCargaTitulo: string;
  errorCargaTexto: string;
  noEncontradoTitulo: string;
  noEncontradoTexto: string;
  botonReintentarCarga: string;
  /** El botón primario de pago: 'Pagar con Mercado Pago' o 'Reintentar pago'. */
  botonPagar: string;
  botonPagarDeNuevo: string;
  botonRevisarMiPago: string;
  botonRevisarDeNuevo: string;
  botonMisPedidos: string;
  botonSeguirComprando: string;
  pistaPagar: string;
  pistaPagarDeNuevo: string;
}

export interface PedidoConfirmadoViewModel {
  estado: EstadoCargaPedido;
  pedido: Pedido | null;
  vista: VistaPedido;
  textos: TextosConfirmacion;
  /** Mercado Pago rechazó el pago (en noCompletado): cambia el motivo del texto. */
  rechazado: boolean;
  /** Mercado Pago procesa o revisa el pago (vista pendiente o revision): no se pide pagar otra vez. */
  pagoEnProceso: boolean;
  /** Hay una verificación del pago en curso (se actualiza sola). */
  consultando: boolean;
  /** Se pide la preferencia o el navegador está abierto. */
  abriendo: boolean;
  /** 'sábado 18 de octubre, 6:30 p. m.' mientras se puede pagar en línea; si no, null. */
  limite: string | null;
  /** Se puede ofrecer el botón para pagar en línea. */
  puedePagar: boolean;
  /**
   * Volvió de Mercado Pago y la verificación terminó sin ver el pago: puede tardar en reflejarse,
   * así que lo primero es revisar de nuevo y pagar otra vez queda en segundo plano (evita doble cobro).
   */
  pagoPorConfirmar: boolean;
  /** Mensaje del último intento de abrir el pago, o null. */
  errorPago: string | null;
  /** Mensaje de la última consulta del pago que falló, o null. */
  errorConsulta: string | null;
  recargar: () => void;
  pagar: () => void;
  /** Vuelve a verificar el pago (con reintentos mientras siga pendiente). */
  revisarDeNuevo: () => void;
  verMisPedidos: () => void;
  seguirComprando: () => void;
}

/** Estados del pedido que ya implican el pago en línea aprobado. */
const ESTADOS_PAGADOS: readonly string[] = ['pagado', 'preparando', 'listo_recoger', 'entregado'];

/** Con estos estados del pago previo se puede abrir otro pago: no hay uno en proceso ni aprobado. */
const PERMITEN_PAGAR: readonly (EstadoPagoPedido | null)[] = ['sin_pago', 'rechazado'];

interface EntradaVista {
  pedido: Pedido | null;
  estadoPago: EstadoPagoPedido | null;
  /** Hay una verificación a la vista (la revisión previa a abrir el pago no se muestra). */
  consultando: boolean;
  trasRegreso: boolean;
}

/** Qué cuenta la pantalla según el pedido, el último estado del pago y la verificación en curso. */
function calcularVista({ pedido, estadoPago, consultando, trasRegreso }: EntradaVista): VistaPedido {
  if (!pedido) {
    return 'apartado';
  }
  if (pedido.estado === 'cancelado' || estadoPago === 'cancelado') {
    return 'cancelado';
  }
  if (!esPagoEnLinea(pedido)) {
    return 'apartado';
  }
  // Sin respuesta del pago todavía, la verificación en curso manda sobre el estado del pedido.
  if (estadoPago === null && consultando) {
    return 'consultando';
  }
  if (estadoPago === 'aprobado' || ESTADOS_PAGADOS.includes(pedido.estado)) {
    return 'aprobado';
  }
  if (estadoPago === null) {
    return 'porPagar';
  }
  if (estadoPago === 'revision' || estadoPago === 'pendiente') {
    return estadoPago;
  }
  if (estadoPago === 'sin_pago' && trasRegreso && consultando) {
    // Recién vuelve de Mercado Pago: puede tardar en reflejarse. Texto neutro, no "procesando".
    return 'consultando';
  }
  return 'noCompletado';
}

interface EntradaTextos {
  vista: VistaPedido;
  pedido: Pedido | null;
  rechazado: boolean;
  pagoPorConfirmar: boolean;
  limite: string | null;
}

/** Título y mensaje del estado del pedido y de su pago. */
function textosEstado(texto: FuncionTexto, entrada: EntradaTextos): { titulo: string; mensaje: string } {
  const { vista, pedido, rechazado, pagoPorConfirmar, limite } = entrada;
  const plazo = limite ? ` ${texto('tienda.pago.apartadoHasta', { limite })}` : '';
  switch (vista) {
    case 'aprobado':
      return { titulo: texto('tienda.pago.aprobadoTitulo'), mensaje: texto('tienda.pagoRecibidoTexto') };
    case 'revision':
      return { titulo: texto('tienda.pago.revisionTitulo'), mensaje: texto('tienda.pago.revisionTexto') };
    case 'pendiente':
      return { titulo: texto('tienda.pago.enProcesoTitulo'), mensaje: texto('tienda.pagoEnProcesoTexto') };
    case 'consultando':
      return { titulo: texto('tienda.pago.verificandoTitulo'), mensaje: texto('tienda.pago.verificandoTexto') };
    case 'noCompletado':
      if (pagoPorConfirmar) {
        return {
          titulo: texto('tienda.pago.porConfirmarTitulo'),
          mensaje: `${texto('tienda.pago.porConfirmarTexto')}${plazo}`,
        };
      }
      return {
        titulo: texto('tienda.pago.noCompletadoTitulo'),
        mensaje: `${texto(rechazado ? 'tienda.pago.rechazadoTexto' : 'tienda.pago.sinPagoTexto')}${plazo}`,
      };
    case 'porPagar':
      return { titulo: texto('tienda.pago.porPagarTitulo'), mensaje: texto('tienda.pago.porPagarTexto') };
    case 'cancelado':
      return { titulo: texto('tienda.pago.canceladoTitulo'), mensaje: texto('tienda.pago.canceladoTexto') };
    default:
      return {
        titulo: texto('tienda.confirmacionTitulo'),
        mensaje: texto(pedido && esPagoEnSalon(pedido) ? 'tienda.confirmacionApartado' : 'tienda.confirmacionRegistrado'),
      };
  }
}

function armarTextos(texto: FuncionTexto, entrada: EntradaTextos): TextosConfirmacion {
  const { pedido, limite, vista } = entrada;
  const apartadoPendiente = pedido !== null && esPagoEnSalon(pedido) && pedido.estado === 'pendiente_pago';
  return {
    ...textosEstado(texto, entrada),
    pagoEnMostrador: apartadoPendiente
      ? texto('tienda.pago.pagasEnMostrador', { precio: formatoPrecio(pedido.totalCentavos) })
      : null,
    plazo: limite ? texto('tienda.pago.plazo', { limite }) : null,
    verificando: texto('tienda.pago.verificandoTitulo'),
    abriendo: texto('tienda.pago.abriendo'),
    formaPago: texto('tienda.pago.formaPago'),
    dondeRecoges: texto('tienda.pago.dondeRecoges'),
    cargando: texto('tienda.pago.cargando'),
    errorCargaTitulo: texto('tienda.pago.errorCargaTitulo'),
    errorCargaTexto: texto('tienda.pago.errorCargaTexto'),
    noEncontradoTitulo: texto('tienda.pago.noEncontradoTitulo'),
    noEncontradoTexto: texto('tienda.pago.noEncontradoTexto'),
    botonReintentarCarga: texto('tienda.pago.botonReintentarCarga'),
    botonPagar: texto(vista === 'porPagar' ? 'tienda.pago.botonPagar' : 'tienda.pago.botonReintentar'),
    botonPagarDeNuevo: texto('tienda.pago.botonPagarDeNuevo'),
    botonRevisarMiPago: texto('tienda.pago.botonRevisarMiPago'),
    botonRevisarDeNuevo: texto('tienda.pago.botonRevisarDeNuevo'),
    botonMisPedidos: texto('tienda.pago.botonMisPedidos'),
    botonSeguirComprando: texto('tienda.pago.botonSeguirComprando'),
    pistaPagar: texto('tienda.pago.pistaPagar'),
    pistaPagarDeNuevo: texto('tienda.pago.pistaPagarDeNuevo'),
  };
}

/** La revisión previa a abrir el pago que dejó pagar: con cuántas respuestas quedó y qué se veía antes. */
interface PrevioSinEfecto {
  respuestas: number;
  estado: EstadoPagoPedido | null;
}

/**
 * El estado del pago que se muestra: solo lo que el servidor respondió después de cargar la
 * pantalla, salvo la revisión previa al pago que dejó pagar, que no cambia lo que se veía.
 */
function estadoVisible(
  conocido: EstadoPagoConocido | null,
  respuestasPrevias: number,
  previo: PrevioSinEfecto | null,
): EstadoPagoPedido | null {
  if (!conocido || conocido.respuestas <= respuestasPrevias) {
    return null;
  }
  return previo !== null && conocido.respuestas === previo.respuestas ? previo.estado : conocido.estado;
}

/** El id numérico de la ruta, o null si no es un id válido. */
function idDeRuta(idLimpio: string): number | null {
  const id = Number(idLimpio);
  return idLimpio !== '' && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Confirmación de un pedido (GP-06.4, GP-07.5). El estado siempre sale del servidor (pedido y
 * verificación del pago en el registro de useVerificacionPago), nunca de los parámetros de la ruta:
 * - `pagarAlAbrir` (?pagar=1, desde el checkout): abre Mercado Pago una sola vez al cargar.
 * - `revisarAlAbrir` (?retorno=mp, regreso en arranque en frío): verifica el pago al cargar.
 * - Sin parámetros, un pedido en línea pendiente consulta su pago una vez.
 * - `desdeDetalle` (?origen=pedido, "Completar el pago" del detalle): atrás regresa al detalle.
 *
 * Nunca abre un segundo pago: antes de pedir otra preferencia revisa el estado y, si está
 * pendiente, en revisión o aprobado, no abre Mercado Pago; mientras el navegador está abierto o
 * una verificación va en curso, pagar no hace nada.
 */
export function usePedidoConfirmadoViewModel(
  pedidoId: string | undefined,
  pagarAlAbrir = false,
  revisarAlAbrir = false,
  desdeDetalle = false,
): PedidoConfirmadoViewModel {
  const router = useRouter();
  const candado = useCandado();
  const texto = useTextos();

  const [estado, setEstado] = useState<EstadoCargaPedido>('cargando');
  const [pedido, setPedido] = useState<Pedido | null>(null);
  // Lo que el registro sabe del pago de este pedido y cuántas respuestas ya tenía al cargar: solo
  // cuenta lo que el servidor respondió después (la pantalla siempre verifica por su cuenta).
  const [conocido, setConocido] = useState<EstadoPagoConocido | null>(null);
  const [respuestasPrevias, setRespuestasPrevias] = useState(0);
  // La revisión previa a abrir el pago que dejó pagar (sin pago o rechazado) no cambia lo que se ve:
  // se sigue mostrando el estado de antes mientras esa sea la última respuesta.
  const [previoSinEfecto, setPrevioSinEfecto] = useState<PrevioSinEfecto | null>(null);
  const estadoMostrado = useRef<EstadoPagoPedido | null>(null);
  // Volvió de Mercado Pago en esta pantalla: un pago que no aparece se trata como por confirmar.
  const [trasRegreso, setTrasRegreso] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  // El plazo terminó: ya no se ofrece pagar.
  const [pagoCerrado, setPagoCerrado] = useState(false);

  const idLimpio = pedidoId?.trim() ?? '';
  const idRuta = idDeRuta(idLimpio);

  const montada = useRef(true);
  const solicitud = useRef(0);
  // Suelta la espera del regreso del navegador si la pantalla se desmonta.
  const soltarEspera = useRef<(() => void) | null>(null);
  // Qué hacer al terminar la próxima carga: la acción automática de la ruta (una sola vez por
  // pantalla) o una consulta del pago.
  const automaticoUsado = useRef(false);
  const accionTrasCarga = useRef<'auto' | 'consultar' | null>('auto');
  // El pedido a la vista, para que el mensaje del plazo vencido use las horas guardadas en él.
  const pedidoVisto = useRef<Pedido | null>(null);
  useEffect(() => {
    pedidoVisto.current = pedido;
  });

  // Observer: cada cambio del registro para este pedido. Mientras está montada, la pantalla sigue
  // ese pago: al desmontarse, si ninguna otra lo sigue, su verificación se detiene.
  useEffect(() => {
    if (idRuta === null) {
      return undefined;
    }
    const soltar = mantenerVerificacion(idRuta);
    const dejarDeEscuchar = suscribirVerificacion((evento) => {
      if (evento.pedidoId !== idRuta || !montada.current) {
        return;
      }
      setConocido(evento.conocido);
      if (!evento.conocido) {
        // Se borró (cierre de sesión): lo que llegue después empieza de cero.
        setRespuestasPrevias(0);
      }
    });
    return () => {
      dejarDeEscuchar();
      soltar();
    };
  }, [idRuta]);

  const recargar = useCallback(() => {
    solicitud.current += 1;
    const actual = solicitud.current;
    accionTrasCarga.current = automaticoUsado.current ? 'consultar' : 'auto';
    setErrorPago(null);
    setEstado('cargando');
    obtenerPedido(idLimpio)
      .then((respuesta) => {
        if (actual !== solicitud.current) {
          return;
        }
        setPedido(respuesta);
        setConocido(null);
        setPrevioSinEfecto(null);
        setRespuestasPrevias(idRuta === null ? 0 : (estadoPagoConocido(idRuta)?.respuestas ?? 0));
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
  }, [idLimpio, idRuta]);

  useEffect(() => {
    montada.current = true;
    recargar();
    return () => {
      montada.current = false;
      solicitud.current += 1;
      soltarEspera.current?.();
    };
  }, [recargar]);

  /**
   * Antes de pedir otra preferencia se pregunta al servidor: con un pago en proceso, en revisión
   * o aprobado no se abre Mercado Pago (evita un doble cobro, también con ?pagar=1). Si no se pudo
   * revisar o se detuvo, tampoco. Devuelve true si se puede seguir con el pago.
   */
  const revisarPagoPrevio = useCallback(async (id: number): Promise<boolean> => {
    const previo = await verificarPago(id, { motivo: 'previoAlPago' });
    if (!montada.current) {
      return false;
    }
    const respondio = !previo.detenida && previo.error === null;
    if (respondio && PERMITEN_PAGAR.includes(previo.estado)) {
      setPrevioSinEfecto({ respuestas: estadoPagoConocido(id)?.respuestas ?? 0, estado: estadoMostrado.current });
      return true;
    }
    setAbriendo(false);
    if (respondio && previo.estado === 'pendiente') {
      void verificarPago(id, { motivo: 'revisar' });
    }
    return false;
  }, []);

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
        setErrorPago(mensajePreferenciaPedido(error, pedidoVisto.current ?? {}));
        return null;
      }
    },
    [recargar],
  );

  const pagarPedido = useCallback(
    async (id: number) => {
      // Una verificación en curso puede encontrar el pago: no se abre otro encima.
      if (verificacionEnCurso(id)) {
        return;
      }
      setErrorPago(null);
      setAbriendo(true);
      if (!(await revisarPagoPrevio(id))) {
        return;
      }
      const initPoint = await pedirPreferencia(id);
      if (initPoint === null || !montada.current) {
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
        setErrorPago(texto('tienda.pago.sinNavegador'));
        return;
      }
      if (resultado === 'regreso') {
        setPrevioSinEfecto(null);
        setTrasRegreso(true);
        void verificarPago(id, { motivo: 'regreso' });
      }
    },
    [revisarPagoPrevio, pedirPreferencia, texto],
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
    const id = pedido.id;
    if (accion === 'consultar') {
      // Al recargar (o al volver a montarse la pantalla) tras volver de Mercado Pago, un pago que
      // todavía no aparece se sigue consultando como regreso.
      void verificarPago(id, { motivo: trasRegreso ? 'regreso' : 'apertura' });
      return;
    }
    automaticoUsado.current = true;
    if (pagarAlAbrir && pidePagoEnLinea(pedido)) {
      candado(() => pagarPedido(id));
    } else if (revisarAlAbrir) {
      setTrasRegreso(true);
      void verificarPago(id, { motivo: 'regreso' });
    } else if (pedido.estado === 'pendiente_pago') {
      void verificarPago(id, { motivo: 'apertura' });
    }
  }, [estado, pedido, pagarAlAbrir, revisarAlAbrir, trasRegreso, candado, pagarPedido]);

  // La pantalla no detiene la verificación al perder el foco ni al recargar: el registro es de toda
  // la app (otra pantalla, o la misma montada dos veces por la navegación, puede compartirla), sus
  // consultas tienen tope y se detienen solas al pasar la app a segundo plano.

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
    void verificarPago(pedido.id, { motivo: 'revisar' });
  }, [pedido, abriendo]);

  // El estado del pedido que vino con una respuesta nueva del pago (por ejemplo, ya pagado).
  const estadoPedidoNuevo = conocido && conocido.respuestas > respuestasPrevias ? conocido.pedidoEstado : '';
  useEffect(() => {
    if (estadoPedidoNuevo) {
      setPedido((actual) =>
        actual && actual.estado !== estadoPedidoNuevo ? { ...actual, estado: estadoPedidoNuevo } : actual,
      );
    }
  }, [estadoPedidoNuevo]);

  // ── Lo que se muestra ──────────────────────────────────────────────────────────────────
  const estadoPago = estadoVisible(conocido, respuestasPrevias, previoSinEfecto);
  useEffect(() => {
    estadoMostrado.current = estadoPago;
  }, [estadoPago]);
  const consultando = conocido?.verificando ?? false;
  // Mientras se abre el pago, su revisión previa no cambia lo que se ve.
  const consultaVisible = consultando && !abriendo;
  const calculada = calcularVista({ pedido, estadoPago, consultando: consultaVisible, trasRegreso });
  // Con el plazo vencido ya no se invita a pagar: la pantalla dice que el pago no se completó.
  const vista = pagoCerrado && calculada === 'porPagar' ? 'noCompletado' : calculada;

  const fallo = conocido?.error ?? null;
  const errorConsulta = fallo === null ? null : (mensajeComunTienda(fallo) ?? texto('tienda.pago.noSePudoRevisar'));
  const sePuedePagar = pedido !== null && pidePagoEnLinea(pedido) && !pagoCerrado;
  const puedePagar =
    sePuedePagar && !consultaVisible && errorConsulta === null && (vista === 'porPagar' || vista === 'noCompletado');
  const pagoPorConfirmar = vista === 'noCompletado' && estadoPago === 'sin_pago' && trasRegreso && !consultaVisible;
  const pagoEnProceso = vista === 'pendiente' || vista === 'revision';
  // Con el pago en proceso no se pide pagar antes de un plazo: ya pagó o está pagando.
  const muestraPlazo = sePuedePagar && !pagoEnProceso && vista !== 'aprobado' && vista !== 'cancelado';
  const limite = muestraPlazo && pedido ? limitePagoPedido(pedido) : null;
  const rechazado = estadoPago === 'rechazado';

  return {
    estado,
    pedido,
    vista,
    textos: armarTextos(texto, { vista, pedido, rechazado, pagoPorConfirmar, limite }),
    rechazado,
    pagoEnProceso,
    consultando: consultaVisible,
    abriendo,
    limite,
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
