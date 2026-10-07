import {
  borrarSesionSi,
  generacionActual,
  getToken,
  leerSesion,
  reemplazarToken,
  type SesionGuardada,
} from './tokenStorage';

const TIMEOUT_MS = 15000;
const MINUTO_MS = 60 * 1000;
/** El backend solo renueva tokens con menos de 15 minutos desde su emisión. */
const LIMITE_RENOVACION_MS = 15 * MINUTO_MS;
/** Desde los 10 minutos, una petición protegida renueva el token antes de salir. */
const RENOVAR_DESDE_MS = 10 * MINUTO_MS;

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
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
 * Resultado de intentar renovar. Solo 'rechazada' (401 del servidor) significa que el token ya
 * no sirve; 'fallida' (sin red, timeout o error del servidor) nunca cierra la sesión;
 * 'descartada': la sesión cambió mientras tanto (se cerró o se inició otra) y no se escribió nada.
 */
export type ResultadoRenovacion = 'renovada' | 'rechazada' | 'fallida' | 'descartada';

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
    throw new ApiError(response.status, getErrorMessage(data, response.status));
  }
  return data as T;
}

let manejadorSesionExpirada: (() => void) | null = null;
let renovacionEnCurso: Promise<ResultadoRenovacion> | null = null;

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

async function ejecutarRenovacion(): Promise<ResultadoRenovacion> {
  const generacion = generacionActual();
  try {
    const sesion = await leerSesion();
    if (!sesion) {
      return generacion === generacionActual() ? 'rechazada' : 'descartada';
    }
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
  } catch {
    return 'fallida';
  }
}

/** POST /api/auth/refresh. Aunque lo pidan varias peticiones a la vez, sale una sola. */
export function renovarSesion(): Promise<ResultadoRenovacion> {
  renovacionEnCurso ??= ejecutarRenovacion().finally(() => {
    renovacionEnCurso = null;
  });
  return renovacionEnCurso;
}

/**
 * Renovación periódica: solo si el token aún puede renovarse (menos de 15 minutos). Si el
 * servidor lo rechaza, la sesión expira; sin red se conserva.
 */
export async function renovarSesionSiVigente(): Promise<void> {
  const generacion = generacionActual();
  const sesion = await leerSesion();
  if (!sesion || edad(sesion) >= LIMITE_RENOVACION_MS) {
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
 * Petición protegida. Ante un 401, solo si la sesión con la que salió sigue siendo la actual
 * (misma generación y mismo token): si el token tiene menos de 15 minutos, una renovación y un
 * único reintento; si no se puede (o es más viejo), se cierra esa sesión y se avisa. Un error de
 * red o un timeout se propaga como ErrorDeRed y nunca cierra la sesión.
 */
async function solicitudProtegida<T>(method: HttpMethod, path: string, body: unknown): Promise<T> {
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
