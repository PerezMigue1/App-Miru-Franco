import { duracion } from '@/shared/ui/tokens';

import { registrarPeticion } from './estadoConexion';
import {
  aMarcaDeTiempo,
  borrarSesionSi,
  generacionActual,
  getToken,
  leerSesion,
  reemplazarToken,
  reemplazarTokens,
  type SesionGuardada,
} from './tokenStorage';

/**
 * Límite de espera de una petición. Render (plan gratis) duerme el servidor a los 15 minutos sin uso
 * y la primera petición tarda de 30 a 60 s en despertarlo: mientras tanto se ve "Conectando con el
 * salón…" (estadoConexion.ts), no "Sin conexión".
 */
const TIMEOUT_MS = 60000;
const MINUTO_MS = 60 * 1000;
/** Duración del acceso si no se puede leer del token (el backend lo emite por 15 minutos). */
const DURACION_ACCESO_MS = 15 * MINUTO_MS;
/** Renovación de sesiones móviles (con refreshToken). Pública: no lleva Bearer. */
const RUTA_RENOVAR_MOVIL = '/api/auth/movil/renovar';
const MENSAJE_SESION_TERMINADA = 'Tu sesión terminó. Inicia sesión de nuevo.';
/** El backend solo renueva tokens con menos de 15 minutos desde su emisión. */
const LIMITE_RENOVACION_MS = 15 * MINUTO_MS;
/** Sesiones sin refreshToken: desde los 10 minutos, una petición protegida renueva antes de salir. */
const RENOVAR_DESDE_MS = 10 * MINUTO_MS;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  readonly status: number;
  /** Código estable del backend (por ejemplo, CODIGO_INVALIDO), si lo envió. */
  readonly code?: string;
  /** Referencia de un 5xx del backend (8 caracteres hexadecimales) para buscarlo en su registro. */
  readonly referencia?: string;
  /** Segundos que pide esperar un 429 o un 503 (entero de 1 o más), si los mandó. */
  readonly retryAfter?: number;
  /**
   * Campo `errors` del cuerpo de error, tal como llegó (por ejemplo, los bloqueos del 409
   * CUENTA_CON_PENDIENTES). Nunca se muestra: quien lo usa lo normaliza antes.
   */
  readonly errors?: unknown;

  constructor(
    status: number,
    message: string,
    code?: string,
    referencia?: string,
    retryAfter?: number,
    errors?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.referencia = referencia;
    this.retryAfter = retryAfter;
    this.errors = errors;
  }
}

/** Por qué no hubo respuesta: sin red o se acabó el límite de espera de la petición. */
export type MotivoErrorDeRed = 'sinRed' | 'tiempoAgotado';

/** Sin red o sin respuesta a tiempo: nunca cierra la sesión. */
export class ErrorDeRed extends Error {
  readonly motivo: MotivoErrorDeRed;

  constructor(motivo: MotivoErrorDeRed = 'sinRed') {
    super(motivo === 'tiempoAgotado' ? 'Sin respuesta del servidor a tiempo.' : 'Sin conexión con el servidor.');
    this.name = 'ErrorDeRed';
    this.motivo = motivo;
  }
}

export interface OpcionesSolicitud {
  /** Petición pública (login, registro, verificación...): sin token y sin gestión de sesión. */
  publica?: boolean;
  /**
   * Token explícito (por ejemplo, cerrar la sesión de un token que no se guardó). Se envía tal
   * cual y un 401 no renueva ni cierra la sesión.
   */
  token?: string;
}

/**
 * Resultado de intentar renovar. Solo 'rechazada' (el servidor rechazó la sesión) significa que ya
 * no sirve; 'fallida' (sin red, timeout, límite o error del servidor) nunca cierra la sesión;
 * 'descartada': la sesión cambió mientras tanto (se cerró o se inició otra) y no se escribió nada.
 */
export type ResultadoRenovacion = 'renovada' | 'rechazada' | 'fallida' | 'descartada';

/** Resultado interno: con el error que se propaga si falló y el code del rechazo, si llegó. */
interface Renovacion {
  resultado: ResultadoRenovacion;
  error?: Error;
  code?: string;
}

/**
 * Quién pidió la renovación (solo cuenta en sesiones móviles): 'previo' renueva solo si el acceso
 * está por vencer; 'reintento' (tras un 401) solo si el token guardado sigue siendo el rechazado.
 */
type MotivoRenovacion = { tipo: 'previo' } | { tipo: 'reintento'; token: string };

/** Tokens nuevos de una renovación móvil. */
interface TokensMovil {
  token: string;
  refreshToken: string;
  refreshExpiraEn?: number;
}

/**
 * Solo https: el token, la contraseña y los códigos no viajan en claro. En desarrollo (__DEV__) se
 * permite http para un backend local.
 */
export function esUrlPermitida(url: string): boolean {
  const minusculas = url.trim().toLowerCase();
  return minusculas.startsWith('https://') || (__DEV__ && minusculas.startsWith('http://'));
}

export function getBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!url) {
    throw new Error('Falta la variable de entorno EXPO_PUBLIC_API_URL.');
  }
  if (!esUrlPermitida(url)) {
    throw new Error('EXPO_PUBLIC_API_URL debe usar https.');
  }
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') {
    end--;
  }
  return url.slice(0, end);
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  // Toda petición de apiClient cuenta para el aviso de conexión lenta hasta que llega su respuesta.
  const terminar = registrarPeticion();
  let vencida = false;
  const timeoutId = setTimeout(() => {
    vencida = true;
    controller.abort();
  }, TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    // Fallo de red o el límite de espera (AbortError de este temporizador).
    throw crearErrorApi({ tipo: 'red', motivo: vencida ? 'tiempoAgotado' : 'sinRed' });
  } finally {
    clearTimeout(timeoutId);
    terminar();
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Texto de un error sin message ni error en el cuerpo: solo clasifica, nunca se muestra. */
export function mensajeGenerico(status: number): string {
  return `Error en la solicitud (${status}).`;
}

function getErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const { message, error } = body as { message?: unknown; error?: unknown };
    if (typeof message === 'string' && message) {
      return message;
    }
    if (Array.isArray(message) && message.length > 0) {
      return message.join(', ');
    }
    if (typeof error === 'string' && error) {
      return error;
    }
  }
  return mensajeGenerico(status);
}

/** `code` del cuerpo de error del backend, solo si es un texto no vacío. */
function getErrorCode(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const { code } = body as { code?: unknown };
    if (typeof code === 'string' && code) {
      return code;
    }
  }
  return undefined;
}

/** Campo `errors` del cuerpo de error del backend, si vino (sin normalizar). */
function getErrorDetalles(body: unknown): unknown {
  return body && typeof body === 'object' ? (body as { errors?: unknown }).errors : undefined;
}

/** `referencia` de un 5xx del backend, solo si son 8 caracteres hexadecimales en mayúsculas. */
function getErrorReferencia(body: unknown, status: number): string | undefined {
  if (status < 500 || !body || typeof body !== 'object') {
    return undefined;
  }
  const { referencia } = body as { referencia?: unknown };
  return typeof referencia === 'string' && /^[0-9A-F]{8}$/.test(referencia) ? referencia : undefined;
}

/** Segundos enteros de 1 o más; null si el valor no sirve (cero, negativo o no numérico). */
function segundosValidos(valor: number): number | null {
  return Number.isFinite(valor) && valor > 0 ? Math.max(1, Math.ceil(valor)) : null;
}

/** Encabezado Retry-After: segundos (solo dígitos) o una fecha HTTP futura. null si no sirve. */
function segundosDeEncabezado(encabezado: string | null | undefined, ahora: number): number | null {
  const valor = encabezado?.trim() ?? '';
  if (/^\d+$/.test(valor)) {
    return segundosValidos(Number(valor));
  }
  // Una fecha HTTP siempre lleva letras (día y mes): un número con signo o decimales no pasa por
  // fecha, y un texto vacío tampoco.
  if (!/[a-z]/i.test(valor)) {
    return null;
  }
  const fecha = Date.parse(valor);
  return Number.isNaN(fecha) ? null : segundosValidos((fecha - ahora) / 1000);
}

/** `retryAfter` del cuerpo: un número o un texto de solo dígitos. null si no viene o no sirve. */
function segundosDelCuerpo(cuerpo: unknown): number | null {
  if (!cuerpo || typeof cuerpo !== 'object') {
    return null;
  }
  const { retryAfter } = cuerpo as { retryAfter?: unknown };
  if (typeof retryAfter === 'number') {
    return segundosValidos(retryAfter);
  }
  return typeof retryAfter === 'string' && /^\d+$/.test(retryAfter.trim()) ? segundosValidos(Number(retryAfter)) : null;
}

/**
 * Segundos de espera de un 429 o un 503: `retryAfter` del cuerpo y, si no viene o no sirve, el
 * encabezado Retry-After (segundos o fecha HTTP). undefined si ninguno sirve.
 */
export function leerRetryAfter(
  cuerpo: unknown,
  encabezado?: string | null,
  ahora: number = Date.now(),
): number | undefined {
  return segundosDelCuerpo(cuerpo) ?? segundosDeEncabezado(encabezado, ahora) ?? undefined;
}

/**
 * Codes con que el servidor da por terminada una sesión. Un rechazo con otro code (por ejemplo el
 * 409 RENOVACION_EN_CURSO de /api/auth/movil/renovar, que también consume el refreshToken) cierra
 * la sesión igual, así que se presenta como SESION_VENCIDA y no como "intenta de nuevo".
 */
const CODES_SESION_TERMINADA: ReadonlySet<string> = new Set(['SESION_VENCIDA', 'SESION_REVOCADA', 'USA_RENOVAR_MOVIL']);

/** Datos para crear un error de la API; el Factory decide la clase, el mensaje, el status y el code. */
export type DatosErrorApi =
  | { tipo: 'red'; motivo?: MotivoErrorDeRed }
  | { tipo: 'respuesta'; status: number; cuerpo: unknown; retryAfter?: string | null }
  | { tipo: 'sesionTerminada'; code?: string };

/**
 * Factory de errores de la API: toda creación de ApiError y ErrorDeRed de este archivo pasa por
 * aquí. 'red': sin red ('sinRed', por omisión) o sin respuesta a tiempo ('tiempoAgotado');
 * 'respuesta': cuerpo de error del backend, con su code, su campo `errors`, en un 5xx su referencia
 *   y, en un 429 o un 503, los segundos de espera (del cuerpo o del encabezado Retry-After, que llega
 *   en `retryAfter`);
 * 'sesionTerminada': 401 con el mensaje para la clienta y el code del rechazo si es de sesión
 *   terminada (SESION_VENCIDA en otro caso).
 * El message de un ApiError solo sirve para clasificar: a la pantalla llega el texto de
 * mensajeParaClienta (mensajesError.ts), nunca este.
 */
export function crearErrorApi(datos: Extract<DatosErrorApi, { tipo: 'red' }>): ErrorDeRed;
export function crearErrorApi(datos: Exclude<DatosErrorApi, { tipo: 'red' }>): ApiError;
export function crearErrorApi(datos: DatosErrorApi): ApiError | ErrorDeRed {
  switch (datos.tipo) {
    case 'red':
      return new ErrorDeRed(datos.motivo);
    case 'respuesta':
      return new ApiError(
        datos.status,
        getErrorMessage(datos.cuerpo, datos.status),
        getErrorCode(datos.cuerpo),
        getErrorReferencia(datos.cuerpo, datos.status),
        datos.status === 429 || datos.status === 503 ? leerRetryAfter(datos.cuerpo, datos.retryAfter) : undefined,
        getErrorDetalles(datos.cuerpo),
      );
    case 'sesionTerminada':
      return new ApiError(
        401,
        MENSAJE_SESION_TERMINADA,
        datos.code && CODES_SESION_TERMINADA.has(datos.code) ? datos.code : 'SESION_VENCIDA',
      );
  }
}

function enviar(
  method: HttpMethod,
  path: string,
  body: unknown,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetchWithTimeout(`${getBaseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Encabezado Retry-After de una respuesta, si se puede leer. */
function encabezadoRetryAfter(response: Response): string | null {
  return response.headers?.get('retry-after') ?? null;
}

async function leer<T>(response: Response): Promise<T> {
  const data = await parseBody(response);
  if (!response.ok) {
    throw crearErrorApi({
      tipo: 'respuesta',
      status: response.status,
      cuerpo: data,
      retryAfter: encabezadoRetryAfter(response),
    });
  }
  return data as T;
}

let manejadorSesionExpirada: (() => void) | null = null;
let renovacionEnCurso: Promise<Renovacion> | null = null;
/**
 * Último refreshToken que el servidor ya rotó o rechazó (solo en memoria): nunca se vuelve a
 * enviar. Un 429 o un 5xx no lo marcan (el servidor no lo consumió).
 */
let refreshConsumido: string | null = null;

/** Registra quién se entera cuando la sesión expira. Devuelve la función que lo quita. */
export function alExpirarSesion(manejador: () => void): () => void {
  manejadorSesionExpirada = manejador;
  return () => {
    if (manejadorSesionExpirada === manejador) {
      manejadorSesionExpirada = null;
    }
  };
}

/**
 * Cierra la sesión que recibió el rechazo y avisa al manejador. Si mientras tanto se cerró o se
 * inició otra sesión, no toca nada: el rechazo era de una sesión que ya no está.
 */
async function expirarSesion(token: string, generacion: number): Promise<void> {
  let cerrada = false;
  try {
    cerrada = await borrarSesionSi(token, generacion);
  } catch {
    cerrada = false;
  }
  if (cerrada) {
    manejadorSesionExpirada?.();
  }
}

function edad(sesion: SesionGuardada, ahora: number = Date.now()): number {
  return Math.max(0, ahora - sesion.emitidoEn);
}

function esNumero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

/** Payload de un JWT (base64url → JSON), o null si no se puede leer. No valida la firma. */
function leerPayloadJwt(token: string): Record<string, unknown> | null {
  const partes = token.split('.');
  if (partes.length !== 3 || typeof atob !== 'function') {
    return null;
  }
  let base64 = partes[1].replaceAll('-', '+').replaceAll('_', '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  try {
    const datos: unknown = JSON.parse(atob(base64));
    return datos && typeof datos === 'object' ? (datos as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Momento (ms, reloj del teléfono) en que vence el acceso: emitidoEn más la vida del token (exp −
 * iat), así no depende de que el reloj del teléfono coincida con el del servidor.
 */
function vencimientoAcceso(sesion: Pick<SesionGuardada, 'token' | 'emitidoEn'>): number {
  const payload = leerPayloadJwt(sesion.token);
  const exp = payload?.exp;
  const iat = payload?.iat;
  if (esNumero(exp) && esNumero(iat) && exp > iat) {
    return sesion.emitidoEn + (exp - iat) * 1000;
  }
  // Sin iat, exp solo se compararía con el reloj del teléfono (que puede estar adelantado): se
  // usa la duración conocida desde que llegó el token.
  return sesion.emitidoEn + DURACION_ACCESO_MS;
}

/** El acceso ya venció o vence dentro del margen de renovación. */
export function accesoPorVencer(
  sesion: Pick<SesionGuardada, 'token' | 'emitidoEn'>,
  ahora: number = Date.now(),
): boolean {
  return vencimientoAcceso(sesion) - duracion.margenRenovacion <= ahora;
}

function accesoVencido(sesion: SesionGuardada, ahora: number = Date.now()): boolean {
  return vencimientoAcceso(sesion) <= ahora;
}

function aTokensMovil(datos: unknown): TokensMovil | null {
  if (!datos || typeof datos !== 'object') {
    return null;
  }
  const { token, refreshToken, refreshExpiraEn } = datos as Record<string, unknown>;
  if (typeof token !== 'string' || !token || typeof refreshToken !== 'string' || !refreshToken) {
    return null;
  }
  const expira = aMarcaDeTiempo(refreshExpiraEn);
  return expira === undefined ? { token, refreshToken } : { token, refreshToken, refreshExpiraEn: expira };
}

type RespuestaMovil =
  | { tipo: 'tokens'; tokens: TokensMovil }
  | { tipo: 'rechazo'; code?: string }
  | { tipo: 'falla'; error: Error };

/**
 * POST /api/auth/movil/renovar. Nunca lanza. Un refreshToken que el servidor ya respondió con 200,
 * 401 o 409 queda consumido y no se vuelve a enviar; cualquier otra respuesta o sin red es una falla
 * que conserva la sesión.
 */
async function pedirRenovacionMovil(refreshToken: string): Promise<RespuestaMovil> {
  if (refreshToken === refreshConsumido) {
    return { tipo: 'rechazo' };
  }
  let respuesta: Response;
  try {
    respuesta = await enviar('POST', RUTA_RENOVAR_MOVIL, { refreshToken }, null);
  } catch (error) {
    return { tipo: 'falla', error: error instanceof Error ? error : crearErrorApi({ tipo: 'red' }) };
  }
  const { status } = respuesta;
  // Solo 200, 401 (sesión vencida o revocada) y 409 (reuso) dicen que el servidor ya no acepta este
  // refreshToken; 404, 408, 429, 5xx y demás conservan la sesión.
  const consumido = respuesta.ok || status === 401 || status === 409;
  if (consumido) {
    refreshConsumido = refreshToken;
  }
  let datos: unknown = null;
  try {
    datos = await parseBody(respuesta);
  } catch {
    datos = null;
  }
  if (respuesta.ok) {
    // Un 200 sin tokens válidos deja la sesión sin forma de renovarse.
    const tokens = aTokensMovil(datos);
    return tokens ? { tipo: 'tokens', tokens } : { tipo: 'rechazo' };
  }
  if (consumido) {
    return { tipo: 'rechazo', code: getErrorCode(datos) };
  }
  return {
    tipo: 'falla',
    error: crearErrorApi({ tipo: 'respuesta', status, cuerpo: datos, retryAfter: encabezadoRetryAfter(respuesta) }),
  };
}

/**
 * Renovación de una sesión móvil. Guarda el acceso y el refreshToken nuevos antes de que cualquier
 * petición se repita; si el servidor rechaza la sesión (o el refreshToken rotado no se pudo
 * guardar), la cierra y avisa.
 */
async function renovarMovil(
  sesion: SesionGuardada,
  refreshToken: string,
  generacion: number,
  motivo: MotivoRenovacion | undefined,
): Promise<Renovacion> {
  // Otra renovación ya dejó un acceso vigente: no hace falta enviar nada.
  if (motivo?.tipo === 'previo' && !accesoPorVencer(sesion)) {
    return { resultado: 'renovada' };
  }
  if (motivo?.tipo === 'reintento' && motivo.token !== sesion.token) {
    return { resultado: 'renovada' };
  }
  if (generacion !== generacionActual()) {
    return { resultado: 'descartada' };
  }
  const respuesta = await pedirRenovacionMovil(refreshToken);
  if (generacion !== generacionActual()) {
    return { resultado: 'descartada' };
  }
  if (respuesta.tipo === 'falla') {
    return { resultado: 'fallida', error: respuesta.error };
  }
  if (respuesta.tipo === 'tokens') {
    let guardado = false;
    try {
      guardado = await reemplazarTokens(
        refreshToken,
        { ...respuesta.tokens, emitidoEn: Date.now() },
        generacion,
      );
    } catch {
      guardado = false;
    }
    if (guardado) {
      return { resultado: 'renovada' };
    }
    if (generacion !== generacionActual()) {
      return { resultado: 'descartada' };
    }
    // Misma sesión y no se guardó: el refreshToken anterior ya no sirve, la sesión se perdió.
  }
  await expirarSesion(sesion.token, generacion);
  return { resultado: 'rechazada', code: respuesta.tipo === 'rechazo' ? respuesta.code : undefined };
}

/**
 * /api/auth/refresh responde 400 con este code si el token es de la app móvil: esa sesión no se
 * renueva nunca por el camino anterior (le falta su refreshToken), así que cuenta como rechazo.
 */
const CODIGO_USA_RENOVAR_MOVIL = 'USA_RENOVAR_MOVIL';

/** El servidor ya no renovará este token por el camino anterior: 401, o 400 USA_RENOVAR_MOVIL. */
async function esRechazoClasico(respuesta: Response): Promise<boolean> {
  if (respuesta.status === 401) {
    return true;
  }
  return respuesta.status === 400 && getErrorCode(await parseBody(respuesta)) === CODIGO_USA_RENOVAR_MOVIL;
}

/**
 * Sesiones sin refreshToken (guardadas antes de la renovación móvil): POST /api/auth/refresh. Sin
 * red lanza ErrorDeRed (ejecutarRenovacion lo convierte en 'fallida').
 */
async function renovarClasica(sesion: SesionGuardada, generacion: number): Promise<ResultadoRenovacion> {
  const respuesta = await enviar('POST', '/api/auth/refresh', undefined, sesion.token);
  if (generacion !== generacionActual()) {
    return 'descartada';
  }
  if (await esRechazoClasico(respuesta)) {
    return 'rechazada';
  }
  if (!respuesta.ok) {
    return 'fallida';
  }
  const datos = await parseBody(respuesta);
  const nuevo = datos && typeof datos === 'object' ? (datos as { token?: unknown }).token : undefined;
  if (typeof nuevo !== 'string' || !nuevo) {
    return 'fallida';
  }
  // Solo se escribe si la sesión sigue siendo la misma: nunca se revive una sesión cerrada.
  let guardado = false;
  try {
    guardado = await reemplazarToken(sesion.token, nuevo, Date.now(), generacion);
  } catch {
    // El servidor ya revocó el token anterior y el nuevo no se pudo guardar: la sesión se perdió.
    // Se cierra y se avisa ahora, en lugar de dejar guardado un token que ya no sirve.
    await expirarSesion(sesion.token, generacion);
    return 'rechazada';
  }
  return guardado ? 'renovada' : 'descartada';
}

/** Lee la sesión dentro del vuelo y elige el camino según tenga refreshToken. Nunca lanza. */
async function ejecutarRenovacion(motivo: MotivoRenovacion | undefined): Promise<Renovacion> {
  const generacion = generacionActual();
  try {
    const sesion = await leerSesion();
    if (!sesion) {
      return { resultado: generacion === generacionActual() ? 'rechazada' : 'descartada' };
    }
    if (sesion.refreshToken) {
      return await renovarMovil(sesion, sesion.refreshToken, generacion, motivo);
    }
    return { resultado: await renovarClasica(sesion, generacion) };
  } catch {
    return { resultado: 'fallida' };
  }
}

/** Aunque lo pidan varias peticiones a la vez, sale una sola renovación; las demás esperan su resultado. */
function renovarEnVuelo(motivo?: MotivoRenovacion): Promise<Renovacion> {
  renovacionEnCurso ??= ejecutarRenovacion(motivo).finally(() => {
    renovacionEnCurso = null;
  });
  return renovacionEnCurso;
}

/**
 * Renueva la sesión guardada (un solo vuelo). En una sesión móvil solo envía si el acceso vence
 * dentro del margen; si el servidor la rechaza, ya queda cerrada y avisada.
 */
export function renovarSesion(): Promise<ResultadoRenovacion> {
  return renovarEnVuelo({ tipo: 'previo' }).then((renovacion) => renovacion.resultado);
}

/**
 * Para conexiones que no pasan por request (por ejemplo, el flujo en vivo de avisos) y recibieron
 * un 401 con `token`: comparte el vuelo único de renovación como un reintento. Si el token rechazado
 * ya no es el guardado (otra renovación ganó), responde 'renovada' sin enviar nada. Si el servidor
 * rechaza la sesión, queda cerrada y avisada al manejador de alExpirarSesion (las sesiones móviles ya
 * lo hacen al renovar; las clásicas se cierran aquí, solo si siguen siendo la misma). Nunca lanza.
 */
export async function renovarTrasRechazo(token: string): Promise<ResultadoRenovacion> {
  const generacion = generacionActual();
  // Si la lectura falla, decide la renovación (que lee de nuevo y responde 'fallida' sin lanzar).
  const actual = await getToken().catch(() => null);
  if (actual && actual !== token) {
    return 'renovada';
  }
  const { resultado } = await renovarEnVuelo({ tipo: 'reintento', token });
  if (resultado === 'rechazada') {
    // Idempotente: si la renovación móvil ya la cerró (o cambió la sesión), no toca nada.
    await expirarSesion(token, generacion);
  }
  return resultado;
}

/** Espera la renovación en curso, si la hay (por ejemplo, antes de cerrar sesión). Nunca lanza. */
export async function esperarRenovacionEnCurso(): Promise<void> {
  try {
    await renovacionEnCurso;
  } catch {
    // La renovación nunca lanza; nada que hacer.
  }
}

/**
 * Renueva una sesión móvil solo en memoria, sin guardar nada (para revocarla en el servidor
 * después de borrarla del teléfono). Devuelve null si no se pudo.
 */
export async function renovarSinGuardar(
  refreshToken: string,
): Promise<{ token: string; refreshToken: string } | null> {
  const respuesta = await pedirRenovacionMovil(refreshToken);
  if (respuesta.tipo !== 'tokens') {
    return null;
  }
  return { token: respuesta.tokens.token, refreshToken: respuesta.tokens.refreshToken };
}

/**
 * Renovación periódica de sesiones sin refreshToken: solo si el token aún puede renovarse (menos
 * de 15 minutos). Si el servidor lo rechaza, la sesión expira; sin red se conserva. Las sesiones
 * móviles se renuevan al hacer peticiones.
 */
export async function renovarSesionSiVigente(): Promise<void> {
  const generacion = generacionActual();
  const sesion = await leerSesion();
  if (!sesion || sesion.refreshToken || edad(sesion) >= LIMITE_RENOVACION_MS) {
    return;
  }
  if ((await renovarSesion()) === 'rechazada') {
    await expirarSesion(sesion.token, generacion);
  }
}

/** Entre 10 y 15 minutos de edad, renueva antes de la petición; si falla, sigue con el actual. */
async function renovarSiToca(): Promise<void> {
  try {
    const sesion = await leerSesion();
    const edadActual = sesion ? edad(sesion) : null;
    if (edadActual !== null && edadActual >= RENOVAR_DESDE_MS && edadActual < LIMITE_RENOVACION_MS) {
      await renovarSesion();
    }
  } catch {
    // La petición sale con el token que haya.
  }
}

/**
 * Petición protegida de una sesión sin refreshToken. Ante un 401, solo si la sesión con la que
 * salió sigue siendo la actual (misma generación y mismo token): si el token tiene menos de 15
 * minutos, una renovación y un único reintento; si no se puede (o es más viejo), se cierra esa
 * sesión y se avisa. Un error de red o un timeout se propaga como ErrorDeRed y nunca cierra la sesión.
 */
async function solicitudClasica<T>(method: HttpMethod, path: string, body: unknown): Promise<T> {
  await renovarSiToca();
  const generacion = generacionActual();
  const sesion = await leerSesion();
  const respuesta = await enviar(method, path, body, sesion?.token ?? null);
  if (respuesta.status !== 401) {
    return leer<T>(respuesta);
  }
  // Sin sesión, o si cambió mientras la petición estaba en vuelo, el 401 no renueva, no reintenta
  // y no cierra nada: solo se informa.
  if (!sesion || generacion !== generacionActual() || (await getToken()) !== sesion.token) {
    return leer<T>(respuesta);
  }
  if (edad(sesion) < LIMITE_RENOVACION_MS) {
    const resultado = await renovarSesion();
    if (resultado === 'fallida' || resultado === 'descartada') {
      return leer<T>(respuesta);
    }
    if (resultado === 'renovada') {
      const nuevo = await getToken();
      if (!nuevo || nuevo === sesion.token || generacion !== generacionActual()) {
        return leer<T>(respuesta);
      }
      const reintento = await enviar(method, path, body, nuevo);
      if (reintento.status !== 401) {
        return leer<T>(reintento);
      }
      await expirarSesion(nuevo, generacion);
      return leer<T>(reintento);
    }
  }
  await expirarSesion(sesion.token, generacion);
  return leer<T>(respuesta);
}

/** Sesión con la que sale una petición móvil y la renovación previa, si la hubo. */
interface SalidaMovil {
  generacion: number;
  sesion: SesionGuardada | null;
  previa: Renovacion | null;
}

/**
 * Si el acceso vence dentro del margen, renueva antes de enviar. Un rechazo cierra la sesión; si
 * la renovación falla con el acceso ya vencido, no tiene caso enviar: falla con su error.
 */
async function prepararSalidaMovil(): Promise<SalidaMovil> {
  const sesion = await leerSesion();
  if (!sesion || !accesoPorVencer(sesion)) {
    return { generacion: generacionActual(), sesion, previa: null };
  }
  const previa = await renovarEnVuelo({ tipo: 'previo' });
  if (previa.resultado === 'rechazada') {
    throw crearErrorApi({ tipo: 'sesionTerminada', code: previa.code });
  }
  if (previa.resultado === 'fallida' && accesoVencido(sesion)) {
    throw previa.error ?? crearErrorApi({ tipo: 'red' });
  }
  // 'descartada': la sesión cambió; la petición sale con la que haya ahora.
  return { generacion: generacionActual(), sesion: await leerSesion(), previa };
}

/** El acceso de la sesión fue rechazado justo después de renovarse: se cierra y se avisa. */
async function cerrarTrasRechazo(token: string, generacion: number): Promise<never> {
  await expirarSesion(token, generacion);
  throw crearErrorApi({ tipo: 'sesionTerminada' });
}

/**
 * Tras un 401 sin renovación previa en esta petición: una renovación (un solo vuelo) y un único
 * reintento con el acceso nuevo. Sin red, 429 o 5xx conservan la sesión.
 */
async function reintentarMovil<T>(
  method: HttpMethod,
  path: string,
  body: unknown,
  rechazada: Response,
  sesion: SesionGuardada,
  generacion: number,
): Promise<T> {
  const renovacion = await renovarEnVuelo({ tipo: 'reintento', token: sesion.token });
  if (renovacion.resultado === 'rechazada') {
    throw crearErrorApi({ tipo: 'sesionTerminada', code: renovacion.code });
  }
  if (renovacion.resultado === 'fallida' && renovacion.error) {
    throw renovacion.error;
  }
  const nuevo = renovacion.resultado === 'renovada' ? await getToken() : null;
  if (!nuevo || nuevo === sesion.token || generacion !== generacionActual()) {
    return leer<T>(rechazada);
  }
  const reintento = await enviar(method, path, body, nuevo);
  if (reintento.status === 401) {
    return cerrarTrasRechazo(nuevo, generacion);
  }
  return leer<T>(reintento);
}

/**
 * Petición protegida de una sesión móvil. Si el acceso vence dentro del margen, renueva antes de
 * salir; ante un 401 renueva una sola vez por petición y repite una vez. Un rechazo de la
 * renovación cierra la sesión; sin red, 429 o 5xx la conservan.
 */
async function solicitudMovil<T>(method: HttpMethod, path: string, body: unknown): Promise<T> {
  const { generacion, sesion, previa } = await prepararSalidaMovil();
  const respuesta = await enviar(method, path, body, sesion?.token ?? null);
  // Sin sesión, o si cambió mientras la petición estaba en vuelo, el 401 no renueva, no reintenta
  // y no cierra nada: solo se informa.
  if (respuesta.status !== 401 || !sesion || generacion !== generacionActual()) {
    return leer<T>(respuesta);
  }
  if (previa?.resultado === 'fallida') {
    // Ya se intentó renovar en esta petición sin respuesta útil: se conserva la sesión.
    if (previa.error) {
      throw previa.error;
    }
    return leer<T>(respuesta);
  }
  if (previa?.resultado === 'renovada') {
    // Ya renovó en esta petición y el acceso nuevo también fue rechazado.
    return cerrarTrasRechazo(sesion.token, generacion);
  }
  return reintentarMovil<T>(method, path, body, respuesta, sesion, generacion);
}

/** Petición protegida: el camino depende de si la sesión guardada tiene refreshToken. */
async function solicitudProtegida<T>(method: HttpMethod, path: string, body: unknown): Promise<T> {
  let inicial: SesionGuardada | null = null;
  try {
    inicial = await leerSesion();
  } catch {
    inicial = null;
  }
  if (inicial?.refreshToken) {
    return solicitudMovil<T>(method, path, body);
  }
  return solicitudClasica<T>(method, path, body);
}

/** Espera de un 503 en lectura antes de su único reintento: `retryAfter` con tope de 10 s; 2 s si no vino. */
const ESPERA_SATURACION_S = 2;
const TOPE_ESPERA_SATURACION_S = 10;

export function esperaTrasSaturacion(retryAfter?: number): number {
  return Math.min(retryAfter ?? ESPERA_SATURACION_S, TOPE_ESPERA_SATURACION_S) * 1000;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => {
    setTimeout(resolver, ms);
  });
}

function esSaturacion(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 503;
}

/**
 * Lectura con un solo reintento ante un 503 (servidor saturado), tras su espera. Una escritura
 * nunca pasa por aquí: repetir un POST podría crear dos pedidos. Si la sesión cambió durante la
 * espera (se cerró o se inició otra), no se repite: la petición era de la sesión anterior. El
 * reintento vuelve a pasar por el camino normal, así comparte el vuelo único de renovación.
 */
async function leerConReintento<T>(path: string, opciones: OpcionesSolicitud): Promise<T> {
  const generacion = generacionActual();
  try {
    return await solicitar<T>('GET', path, undefined, opciones);
  } catch (error) {
    if (!esSaturacion(error)) {
      throw error;
    }
    await esperar(esperaTrasSaturacion(error.retryAfter));
    const conSesion = !opciones.publica && opciones.token === undefined;
    if (conSesion && generacion !== generacionActual()) {
      throw error;
    }
    return solicitar<T>('GET', path, undefined, opciones);
  }
}

function request<T>(method: HttpMethod, path: string, body: unknown, opciones: OpcionesSolicitud): Promise<T> {
  return method === 'GET' ? leerConReintento<T>(path, opciones) : solicitar<T>(method, path, body, opciones);
}

async function solicitar<T>(
  method: HttpMethod,
  path: string,
  body: unknown,
  opciones: OpcionesSolicitud,
): Promise<T> {
  if (opciones.publica) {
    return leer<T>(await enviar(method, path, body, null));
  }
  if (opciones.token !== undefined) {
    // Un token explícito vacío nunca cae al token guardado (podría revocar la sesión actual).
    if (!opciones.token) {
      throw new Error('Token explícito vacío: la petición no se envía.');
    }
    return leer<T>(await enviar(method, path, body, opciones.token));
  }
  return solicitudProtegida<T>(method, path, body);
}

export function apiGet<T>(path: string, opciones: OpcionesSolicitud = {}): Promise<T> {
  return request<T>('GET', path, undefined, opciones);
}

export function apiPost<T>(path: string, body?: unknown, opciones: OpcionesSolicitud = {}): Promise<T> {
  return request<T>('POST', path, body, opciones);
}

export function apiPut<T>(path: string, body?: unknown, opciones: OpcionesSolicitud = {}): Promise<T> {
  return request<T>('PUT', path, body, opciones);
}

export function apiPatch<T>(path: string, body?: unknown, opciones: OpcionesSolicitud = {}): Promise<T> {
  return request<T>('PATCH', path, body, opciones);
}

/** DELETE; `body` solo para las rutas que lo piden (por ejemplo, DELETE /api/auth/me). */
export function apiDelete<T>(path: string, opciones: OpcionesSolicitud = {}, body?: unknown): Promise<T> {
  return request<T>('DELETE', path, body, opciones);
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${getBaseUrl()}/salud`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}
