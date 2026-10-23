import { alCerrarSesion } from '@/shared/api/eventosSesion';
import { generacionActual } from '@/shared/api/tokenStorage';
import { duracion } from '@/shared/ui/tokens';

import { obtenerEstadoPagoPedido, type EstadoPagoPedido, type ResultadoEstadoPago } from './pedidoModel';

/**
 * Registro de la verificación del pago en línea de los pedidos (GP-07.5). Singleton de módulo con
 * oyentes (Observer) y sin React: guarda por pedido el último estado conocido del pago y si hay una
 * verificación en curso, para que la confirmación, el detalle y Mis pedidos cuenten lo mismo.
 *
 * Reglas:
 * - Una sola verificación por pedido: dos llamadas a la vez comparten la misma (y su petición).
 * - Los reintentos se limitan por número, con espera creciente (duracion.verificacionPagoEspera
 *   que se duplica hasta duracion.verificacionPagoEsperaMaxima).
 * - Un mismo resultado nunca dispara dos acciones: `transicion` llega una sola vez por cambio real
 *   del estado del pago o del pedido.
 * - Nunca abre Mercado Pago ni pide una preferencia: solo consulta el estado (GET), que en el
 *   backend aplica el pago aprobado si el webhook no llegó.
 * - Nunca rechaza: los errores quedan en el resultado.
 * - Si cambia la sesión (generacionActual de tokenStorage), lo guardado se borra y las respuestas
 *   en camino se descartan. Al cerrar sesión (alCerrarSesion de shared) se borra en ese momento.
 */

/** Por qué se verifica. Decide si hay reintentos y si un pago que aún no aparece se vuelve a consultar. */
export type MotivoVerificacion =
  /** Al abrir una pantalla: una sola consulta. */
  | 'apertura'
  /** Justo antes de pedir otra preferencia: una sola consulta, sin reintentos. */
  | 'previoAlPago'
  /** La clienta pidió revisar: reintenta mientras siga pendiente. */
  | 'revisar'
  /** Recién volvió de Mercado Pago: reintenta mientras siga pendiente o todavía no aparezca. */
  | 'regreso'
  /** La app volvió a primer plano con un pago pendiente: reintenta mientras siga pendiente. */
  | 'primerPlano';

export interface OpcionesVerificacion {
  motivo?: MotivoVerificacion;
}

/** Lo que se sabe del pago de un pedido. Cada cambio crea un objeto nuevo (sirve como instantánea). */
export interface EstadoPagoConocido {
  pedidoId: number;
  /** Último estado del pago que respondió el servidor; null si todavía no hay respuesta. */
  estado: EstadoPagoPedido | null;
  /** Estado del pedido que vino con esa respuesta ('' si no vino). */
  pedidoEstado: string;
  /** Hay una verificación en curso (consultando o esperando el siguiente reintento). */
  verificando: boolean;
  /** Volvió de Mercado Pago y el pago todavía no se confirma: se revisa otra vez al volver a primer plano. */
  porConfirmar: boolean;
  /** La última verificación terminó por llegar al tope de consultas sin una respuesta clara. */
  agotada: boolean;
  /** Error de la última consulta, o null si respondió. */
  error: unknown;
  /**
   * Respuestas del servidor guardadas hasta ahora (solo crece). Una pantalla que guarda este número
   * al abrir distingue lo que respondió el servidor después de lo que ya se sabía.
   */
  respuestas: number;
}

/** Con qué terminó una verificación. */
export interface ResultadoVerificacion {
  pedidoId: number;
  estado: EstadoPagoPedido | null;
  pedidoEstado: string;
  error: unknown;
  /** Llegó al tope de consultas con el pago pendiente (o sin aparecer tras volver de Mercado Pago). */
  agotada: boolean;
  /** Se detuvo antes de terminar (segundo plano, pantalla que se cierra o cierre de sesión). */
  detenida: boolean;
  /** Consultas que hizo esta verificación. */
  consultas: number;
}

/** Cambio real del pago: llega una sola vez por cada estado nuevo. */
export interface TransicionPago {
  anterior: EstadoPagoPedido | null;
  estado: EstadoPagoPedido;
  pedidoEstado: string;
}

export interface EventoVerificacion {
  pedidoId: number;
  /** Lo que se sabe ahora; null si se borró (cierre de sesión). */
  conocido: EstadoPagoConocido | null;
  /** Solo cuando esta respuesta cambió el estado del pago o del pedido; si no, null. */
  transicion: TransicionPago | null;
}

export type OyenteVerificacion = (evento: EventoVerificacion) => void;

/**
 * Vigilancia del primer plano (la conecta un viewmodel con AppState, porque models no depende de
 * react-native). Recibe a quién avisar y devuelve cómo dejar de vigilar.
 */
export type FabricaVigilancia = (alCambiarPlano: (enPrimerPlano: boolean) => void) => () => void;

/** Tope de consultas de una verificación con el pago pendiente. */
export const MAXIMO_CONSULTAS_PAGO = 6;
/** Tope de consultas tras volver de Mercado Pago con un pago que todavía no aparece. */
export const MAXIMO_CONSULTAS_SIN_PAGO = 3;

/** Espera antes de la consulta número `siguiente` (la segunda espera la base; luego se duplica). */
export function esperaAntesDe(siguiente: number): number {
  const exponente = Math.max(0, siguiente - 2);
  return Math.min(duracion.verificacionPagoEspera * 2 ** exponente, duracion.verificacionPagoEsperaMaxima);
}

// ── Estado del módulo ────────────────────────────────────────────────────────────────────────

interface Verificacion {
  reintentar: boolean;
  permitirSinPago: boolean;
  consultas: number;
  temporizador: ReturnType<typeof setTimeout> | null;
  promesa: Promise<ResultadoVerificacion>;
  resolver: (resultado: ResultadoVerificacion) => void;
}

interface Registro {
  conocido: EstadoPagoConocido;
  verificacion: Verificacion | null;
  /** Número de la última petición enviada y de la última aplicada (las viejas no pisan a las nuevas). */
  enviadas: number;
  aplicada: number;
  /** Último estado avisado como transición. */
  avisado: { estado: EstadoPagoPedido; pedidoEstado: string } | null;
}

const registros = new Map<number, Registro>();
const oyentes = new Set<OyenteVerificacion>();
/** Pantallas montadas que siguen el pago de cada pedido (ver mantenerVerificacion). */
const interesados = new Map<number, number>();
/** Cambia al limpiar: lo que venga de antes ya no escribe. */
let epoca = 0;
let generacionVista = generacionActual();
let fabricaVigilancia: FabricaVigilancia | null = null;
let dejarDeVigilar: (() => void) | null = null;

const ESTADOS_PENDIENTES: readonly (EstadoPagoPedido | null)[] = ['pendiente', 'revision'];
/** Con estos el pago ya tiene respuesta clara: ya no hay nada por confirmar. */
const ESTADOS_CLAROS: readonly (EstadoPagoPedido | null)[] = ['aprobado', 'rechazado', 'cancelado', 'pendiente', 'revision'];

function idValido(pedidoId: number | string): number | null {
  const id = typeof pedidoId === 'number' ? pedidoId : Number(String(pedidoId).trim());
  return Number.isInteger(id) && id > 0 ? id : null;
}

function conocidoInicial(pedidoId: number): EstadoPagoConocido {
  return {
    pedidoId,
    estado: null,
    pedidoEstado: '',
    verificando: false,
    porConfirmar: false,
    agotada: false,
    error: null,
    respuestas: 0,
  };
}

function registroDe(pedidoId: number): Registro {
  let registro = registros.get(pedidoId);
  if (!registro) {
    registro = { conocido: conocidoInicial(pedidoId), verificacion: null, enviadas: 0, aplicada: 0, avisado: null };
    registros.set(pedidoId, registro);
  }
  return registro;
}

function actualizar(registro: Registro, cambios: Partial<EstadoPagoConocido>): void {
  registro.conocido = { ...registro.conocido, ...cambios };
}

function esPendiente(conocido: EstadoPagoConocido): boolean {
  return ESTADOS_PENDIENTES.includes(conocido.estado) || conocido.porConfirmar;
}

function emitir(evento: EventoVerificacion): void {
  for (const oyente of [...oyentes]) {
    try {
      oyente(evento);
    } catch {
      // Un oyente que falla no detiene a los demás ni al registro.
    }
  }
}

function avisar(registro: Registro, transicion: TransicionPago | null = null): void {
  emitir({ pedidoId: registro.conocido.pedidoId, conocido: registro.conocido, transicion });
}

/** Conecta la vigilancia del primer plano mientras haya algo que vigilar; si no, la suelta. */
function actualizarVigilancia(): void {
  const necesita = [...registros.values()].some((registro) => registro.verificacion !== null || esPendiente(registro.conocido));
  if (necesita && !dejarDeVigilar && fabricaVigilancia) {
    dejarDeVigilar = fabricaVigilancia(cambiarPlano);
  } else if (!necesita && dejarDeVigilar) {
    soltarVigilancia();
  }
}

function soltarVigilancia(): void {
  const soltar = dejarDeVigilar;
  dejarDeVigilar = null;
  soltar?.();
}

/** Si cambió la sesión, lo guardado era de otra clienta: se borra. Devuelve true si sigue la misma. */
function revisarSesion(): boolean {
  const actual = generacionActual();
  if (actual === generacionVista) {
    return true;
  }
  generacionVista = actual;
  limpiarVerificacion();
  return false;
}

function resultadoDe(registro: Registro, verificacion: Verificacion, detenida: boolean): ResultadoVerificacion {
  const { pedidoId, estado, pedidoEstado, error, agotada } = registro.conocido;
  return { pedidoId, estado, pedidoEstado, error, agotada, detenida, consultas: verificacion.consultas };
}

/** Termina la verificación en curso del registro: suelta su temporizador, resuelve su promesa y avisa. */
function terminar(
  registro: Registro,
  verificacion: Verificacion,
  cambios: Partial<EstadoPagoConocido>,
  detenida: boolean,
  transicion: TransicionPago | null = null,
): void {
  if (verificacion.temporizador) {
    clearTimeout(verificacion.temporizador);
    verificacion.temporizador = null;
  }
  if (registro.verificacion === verificacion) {
    registro.verificacion = null;
  }
  actualizar(registro, { ...cambios, verificando: false });
  verificacion.resolver(resultadoDe(registro, verificacion, detenida));
  avisar(registro, transicion);
  actualizarVigilancia();
}

/** Guarda la respuesta y devuelve la transición si cambió el estado del pago o del pedido. */
function aplicarRespuesta(registro: Registro, verificacion: Verificacion, respuesta: ResultadoEstadoPago): TransicionPago | null {
  const { estado, pedidoEstado } = respuesta;
  // Tras volver de Mercado Pago el pago queda por confirmar hasta tener una respuesta clara; una
  // consulta sin reintentos de pago ausente (primer plano, revisar) lo da por revisado.
  const porConfirmar =
    !ESTADOS_CLAROS.includes(estado) && registro.conocido.porConfirmar && verificacion.permitirSinPago;
  actualizar(registro, { estado, pedidoEstado, error: null, porConfirmar, respuestas: registro.conocido.respuestas + 1 });
  const anterior = registro.avisado;
  if (anterior?.estado === estado && anterior.pedidoEstado === pedidoEstado) {
    return null;
  }
  registro.avisado = { estado, pedidoEstado };
  return { anterior: anterior?.estado ?? null, estado, pedidoEstado };
}

/** Si después de esta respuesta se vuelve a consultar. */
function debeSeguir(verificacion: Verificacion, estado: EstadoPagoPedido): boolean {
  if (!verificacion.reintentar) {
    return false;
  }
  if (estado === 'pendiente') {
    return verificacion.consultas < MAXIMO_CONSULTAS_PAGO;
  }
  return estado === 'sin_pago' && verificacion.permitirSinPago && verificacion.consultas < MAXIMO_CONSULTAS_SIN_PAGO;
}

/** Sin respuesta clara: el pago sigue pendiente, o no aparece cuando se esperaba verlo. */
function sinRespuestaClara(verificacion: Verificacion, estado: EstadoPagoPedido): boolean {
  return verificacion.reintentar && (estado === 'pendiente' || (estado === 'sin_pago' && verificacion.permitirSinPago));
}

/** Una consulta de la verificación; al responder decide si espera otra o termina. */
async function consultar(registro: Registro, verificacion: Verificacion): Promise<void> {
  const epocaInicio = epoca;
  const pedidoId = registro.conocido.pedidoId;
  verificacion.consultas += 1;
  registro.enviadas += 1;
  const numero = registro.enviadas;
  let respuesta: ResultadoEstadoPago | null = null;
  let fallo: unknown = null;
  try {
    respuesta = await obtenerEstadoPagoPedido(pedidoId);
  } catch (error) {
    fallo = error ?? new Error('Consulta del pago sin respuesta.');
  }
  if (epocaInicio !== epoca || !revisarSesion()) {
    return;
  }
  const vigente = registro.verificacion === verificacion;
  if (numero < registro.aplicada) {
    // Llegó después de una más nueva: no la pisa.
    return;
  }
  registro.aplicada = numero;
  if (!respuesta) {
    if (vigente) {
      terminar(registro, verificacion, { error: fallo, agotada: false }, false);
    }
    return;
  }
  const transicion = aplicarRespuesta(registro, verificacion, respuesta);
  if (!vigente) {
    // Se detuvo mientras iba en camino: la respuesta es real y cuenta, pero no se reintenta.
    avisar(registro, transicion);
    actualizarVigilancia();
    return;
  }
  if (debeSeguir(verificacion, respuesta.estado)) {
    actualizar(registro, { agotada: false });
    avisar(registro, transicion);
    programar(registro, verificacion);
    return;
  }
  terminar(registro, verificacion, { agotada: sinRespuestaClara(verificacion, respuesta.estado) }, false, transicion);
}

function programar(registro: Registro, verificacion: Verificacion): void {
  verificacion.temporizador = setTimeout(() => {
    verificacion.temporizador = null;
    // Si la sesión cambió mientras esperaba, revisarSesion borra todo y el reintento ya no consulta.
    if (registro.verificacion === verificacion && revisarSesion()) {
      void consultar(registro, verificacion);
    }
  }, esperaAntesDe(verificacion.consultas + 1));
}

/** Qué pide cada motivo: reintentos y si un pago que aún no aparece se vuelve a consultar. */
function banderasDe(motivo: MotivoVerificacion): Pick<Verificacion, 'reintentar' | 'permitirSinPago'> {
  return {
    reintentar: motivo !== 'apertura' && motivo !== 'previoAlPago',
    permitirSinPago: motivo === 'regreso',
  };
}

function crearVerificacion(motivo: MotivoVerificacion): Verificacion {
  let resolver: (resultado: ResultadoVerificacion) => void = () => undefined;
  const promesa = new Promise<ResultadoVerificacion>((resolve) => {
    resolver = resolve;
  });
  return { ...banderasDe(motivo), consultas: 0, temporizador: null, promesa, resolver };
}

// ── API pública ──────────────────────────────────────────────────────────────────────────────

/**
 * Verifica el pago del pedido con reintentos limitados según el motivo y devuelve con qué terminó.
 * Si ya hay una verificación de ese pedido, la comparte (y la amplía si este motivo pide más).
 * Nunca rechaza ni abre Mercado Pago.
 */
export function verificarPago(pedidoId: number | string, opciones: OpcionesVerificacion = {}): Promise<ResultadoVerificacion> {
  const motivo = opciones.motivo ?? 'apertura';
  const id = idValido(pedidoId);
  if (id === null) {
    return Promise.resolve({
      pedidoId: 0,
      estado: null,
      pedidoEstado: '',
      error: new Error('Pedido no válido.'),
      agotada: false,
      detenida: false,
      consultas: 0,
    });
  }
  revisarSesion();
  const registro = registroDe(id);
  const actual = registro.verificacion;
  if (actual) {
    const pide = banderasDe(motivo);
    actual.reintentar ||= pide.reintentar;
    actual.permitirSinPago ||= pide.permitirSinPago;
    if (pide.permitirSinPago && !registro.conocido.porConfirmar) {
      actualizar(registro, { porConfirmar: true });
      avisar(registro);
    }
    return actual.promesa;
  }
  const nueva = crearVerificacion(motivo);
  registro.verificacion = nueva;
  // Tras volver de Mercado Pago lo anterior (por ejemplo, un rechazo) ya no vale: se espera la
  // primera respuesta.
  const cambios: Partial<EstadoPagoConocido> =
    motivo === 'regreso' ? { estado: null, pedidoEstado: '', porConfirmar: true } : {};
  actualizar(registro, { ...cambios, verificando: true, agotada: false, error: null });
  avisar(registro);
  actualizarVigilancia();
  void consultar(registro, nueva);
  return nueva.promesa;
}

/** Lo que se sabe del pago del pedido, o null si no hay nada (o era de otra sesión). */
export function estadoPagoConocido(pedidoId: number | string): EstadoPagoConocido | null {
  const id = idValido(pedidoId);
  if (id === null || generacionVista !== generacionActual()) {
    return null;
  }
  return registros.get(id)?.conocido ?? null;
}

/** true si el pedido tiene una verificación en curso (consultando o esperando un reintento). */
export function verificacionEnCurso(pedidoId: number | string): boolean {
  const id = idValido(pedidoId);
  return id !== null && (registros.get(id)?.verificacion ?? null) !== null;
}

/** Recibe cada cambio del registro. Devuelve cómo dejar de escuchar. */
export function suscribir(oyente: OyenteVerificacion): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Pedidos con el pago pendiente o en revisión, o que se acaban de pagar y siguen sin confirmar. */
export function pedidosConPagoPendiente(): number[] {
  if (generacionVista !== generacionActual()) {
    return [];
  }
  return [...registros.values()].filter((registro) => esPendiente(registro.conocido)).map((r) => r.conocido.pedidoId);
}

/**
 * Detiene la verificación del pedido (o todas). Lo que ya se sabe se queda; la respuesta que iba en
 * camino cuenta, pero no se reintenta.
 */
export function detener(pedidoId?: number | string): void {
  let lista: Registro[] = [...registros.values()];
  if (pedidoId !== undefined) {
    const id = idValido(pedidoId);
    const registro = id === null ? undefined : registros.get(id);
    lista = registro ? [registro] : [];
  }
  for (const registro of lista) {
    if (registro.verificacion) {
      terminar(registro, registro.verificacion, {}, true);
    }
  }
}

/**
 * Una pantalla que muestra el pago del pedido avisa que lo sigue; la función que devuelve avisa que
 * ya no (al desmontarse). Cuando ninguna pantalla lo sigue, su verificación se detiene. Así, si la
 * misma pantalla queda montada dos veces o la usa otra, una que se cierra no detiene la de las demás.
 * Las verificaciones del primer plano no dependen de esto.
 */
export function mantenerVerificacion(pedidoId: number | string): () => void {
  const id = idValido(pedidoId);
  if (id === null) {
    return () => undefined;
  }
  interesados.set(id, (interesados.get(id) ?? 0) + 1);
  let soltado = false;
  return () => {
    if (soltado) {
      return;
    }
    soltado = true;
    const quedan = (interesados.get(id) ?? 1) - 1;
    if (quedan > 0) {
      interesados.set(id, quedan);
      return;
    }
    interesados.delete(id);
    detener(id);
  };
}

/**
 * Cambio de plano de la app. En segundo plano detiene todo; al volver a primer plano verifica una
 * vez (con sus reintentos) cada pedido con el pago pendiente que no se esté verificando ya.
 */
export function cambiarPlano(enPrimerPlano: boolean): void {
  if (!enPrimerPlano) {
    detener();
    return;
  }
  if (!revisarSesion()) {
    return;
  }
  for (const pedidoId of pedidosConPagoPendiente()) {
    if (!verificacionEnCurso(pedidoId)) {
      void verificarPago(pedidoId, { motivo: 'primerPlano' });
    }
  }
}

/**
 * Cierre de sesión: detiene todo, borra lo que se sabía y descarta las respuestas en camino. Los
 * oyentes reciben `conocido: null` por cada pedido borrado.
 */
export function limpiarVerificacion(): void {
  epoca += 1;
  const borrados = [...registros.values()];
  registros.clear();
  for (const registro of borrados) {
    const verificacion = registro.verificacion;
    registro.verificacion = null;
    if (verificacion) {
      if (verificacion.temporizador) {
        clearTimeout(verificacion.temporizador);
        verificacion.temporizador = null;
      }
      verificacion.resolver(resultadoDe(registro, verificacion, true));
    }
    emitir({ pedidoId: registro.conocido.pedidoId, conocido: null, transicion: null });
  }
  soltarVigilancia();
}

// Todo cierre de sesión (salir, sesión vencida o cambio de contraseña) borra en ese momento lo que se
// sabía del pago: era de la clienta que salió y no espera a que alguien vuelva a consultarlo.
alCerrarSesion(() => {
  limpiarVerificacion();
});

/** Conecta (o quita, con null) la vigilancia del primer plano. La usa el viewmodel con AppState. */
export function configurarVigilancia(fabrica: FabricaVigilancia | null): void {
  soltarVigilancia();
  fabricaVigilancia = fabrica;
  actualizarVigilancia();
}

/** Solo para pruebas: deja el registro como recién cargado (conserva la fábrica de vigilancia). */
export function reiniciarVerificacion(): void {
  limpiarVerificacion();
  oyentes.clear();
  interesados.clear();
  generacionVista = generacionActual();
}
