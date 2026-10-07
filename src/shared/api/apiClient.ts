import { duracion } from '@/shared/ui/tokens';

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

const TIMEOUT_MS = 15000;
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

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Sin red o sin respuesta a tiempo: nunca cierra la sesión. */
export class ErrorDeRed extends Error {
  constructor() {
    super('Sin conexión con el servidor.');
    this.name = 'ErrorDeRed';
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
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    // Fallo de red o timeout (AbortError).
    throw new ErrorDeRed();
  } finally {
    clearTimeout(timeoutId);
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
  return `Error en la solicitud (${status}).`;
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

async function leer<T>(response: Response): Promise<T> {
  const data = await parseBody(response);
  if (!response.ok) {
    throw new ApiError(response.status, getErrorMessage(data, response.status), getErrorCode(data));
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
    return { tipo: 'falla', error: error instanceof Error ? error : new ErrorDeRed() };
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
    error: new ApiError(status, getErrorMessage(datos, status), getErrorCode(datos)),
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

/** Sesiones sin refreshToken (guardadas antes de la renovación móvil): POST /api/auth/refresh. */
async function renovarClasica(sesion: SesionGuardada, generacion: number): Promise<ResultadoRenovacion> {
  const respuesta = await enviar('POST', '/api/auth/refresh', undefined, sesion.token);
  if (generacion !== generacionActual()) {
    return 'descartada';
  }
  if (respuesta.status === 401) {
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
  const guardado = await reemplazarToken(sesion.token, nuevo, Date.now(), generacion);
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

function sesionTerminada(code: string | undefined): ApiError {
  return new ApiError(401, MENSAJE_SESION_TERMINADA, code ?? 'SESION_VENCIDA');
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
    throw sesionTerminada(previa.code);
  }
  if (previa.resultado === 'fallida' && accesoVencido(sesion)) {
    throw previa.error ?? new ErrorDeRed();
  }
  // 'descartada': la sesión cambió; la petición sale con la que haya ahora.
  return { generacion: generacionActual(), sesion: await leerSesion(), previa };
}

/** El acceso de la sesión fue rechazado justo después de renovarse: se cierra y se avisa. */
async function cerrarTrasRechazo(token: string, generacion: number): Promise<never> {
  await expirarSesion(token, generacion);
  throw sesionTerminada(undefined);
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
    throw sesionTerminada(renovacion.code);
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

async function request<T>(
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

export function apiDelete<T>(path: string, opciones: OpcionesSolicitud = {}): Promise<T> {
  return request<T>('DELETE', path, undefined, opciones);
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${getBaseUrl()}/salud`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}
