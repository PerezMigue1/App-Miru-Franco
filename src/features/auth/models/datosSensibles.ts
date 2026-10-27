import { ApiError, apiGet, apiPost } from '@/shared/api/apiClient';
import { esTextoDatosSensiblesActualizado } from '@/shared/api/documentosActualizados';
import { esHashDocumento } from '@/shared/api/documentosLegales';

/**
 * Autorización expresa de datos sensibles (Ronda 5, art. 9 de la LFPDPPP): las alergias son datos de
 * salud y solo se guardan, se muestran o se mandan con la autorización vigente de la titular. Contrato
 * de datos-sensibles.controller.ts del backend:
 * - GET  /api/consentimientos/datos-sensibles/texto (público): { version, hash, texto }.
 * - GET  /api/consentimientos/datos-sensibles (sesión): { autorizado, pendiente, desde, version, hash }.
 * - POST /api/consentimientos/datos-sensibles { version, hash } (sesión, 10 por minuto): autoriza.
 * - POST /api/consentimientos/datos-sensibles/retirar (sesión, 10 por minuto): la retira; el dato se
 *   oculta de inmediato y no se borra.
 * El texto siempre sale del servidor (nunca se escribe en la app): autorizar manda la versión y el hash
 * del texto que la clienta tuvo a la vista, y si cambió el backend responde 400.
 */

/** Ruta de la app desde la que se autoriza o se retira (rutaOrigen de la constancia). */
export type RutaDatosSensibles = '/registro' | '/editar-perfil' | '/mis-datos' | '/inicio';

/** Texto vigente de la autorización. */
export interface TextoDatosSensibles {
  version: string;
  hash: string;
  /** Párrafos separados por una línea en blanco. */
  texto: string;
}

/** La versión y el hash del texto que la clienta autorizó (lo que se manda al backend). */
export interface AutorizacionDatosSensibles {
  version: string;
  hash: string;
}

/** Estado de la titular. */
export interface EstadoDatosSensibles {
  autorizado: boolean;
  /** Tiene alergias guardadas que esperan su autorización (no se muestran ni se usan). */
  pendiente: boolean;
  /** Fecha de la autorización vigente (ISO), o null. */
  desde: string | null;
}

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

const textoRecortado = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

/** Versión del texto: corta (el backend acepta hasta 20) y sin espacios. */
const VERSION = /^[0-9A-Za-z._-]{1,20}$/;

function respuestaInvalida(): ApiError {
  return new ApiError(500, 'La respuesta del servidor no trae la autorización de datos sensibles.');
}

/** El texto del servidor validado, o null si le falta algo o el hash no tiene el formato SHA-256. */
export function normalizarTextoDatosSensibles(crudo: unknown): TextoDatosSensibles | null {
  if (!esObjeto(crudo)) {
    return null;
  }
  const version = textoRecortado(crudo.version);
  const hash = textoRecortado(crudo.hash);
  // El texto va tal cual: su hash es el del backend y no se toca ni se recorta por dentro.
  const texto = typeof crudo.texto === 'string' ? crudo.texto : '';
  if (!VERSION.test(version) || !esHashDocumento(hash) || !texto.trim()) {
    return null;
  }
  return { version, hash, texto };
}

/** El estado del servidor; lo que no llega exactamente true cuenta como false (nunca se supone autorización). */
export function normalizarEstadoDatosSensibles(crudo: unknown): EstadoDatosSensibles | null {
  if (!esObjeto(crudo)) {
    return null;
  }
  const autorizado = crudo.autorizado === true;
  const desde = autorizado ? textoRecortado(crudo.desde) || null : null;
  return { autorizado, pendiente: !autorizado && crudo.pendiente === true, desde };
}

/** Párrafos del texto para pintarlos uno por uno (sin los vacíos). */
export function parrafosDe(texto: string): string[] {
  return texto
    .split(/\r?\n\s*\r?\n/)
    .map((parrafo) => parrafo.trim())
    .filter(Boolean);
}

/** GET /api/consentimientos/datos-sensibles/texto (público). */
export async function obtenerTextoDatosSensibles(): Promise<TextoDatosSensibles> {
  const respuesta = await apiGet<{ data?: unknown } | null>('/api/consentimientos/datos-sensibles/texto', {
    publica: true,
  });
  const texto = normalizarTextoDatosSensibles(respuesta?.data);
  if (!texto) {
    throw respuestaInvalida();
  }
  return texto;
}

/** GET /api/consentimientos/datos-sensibles (sesión). */
export async function obtenerEstadoDatosSensibles(): Promise<EstadoDatosSensibles> {
  const respuesta = await apiGet<{ data?: unknown } | null>('/api/consentimientos/datos-sensibles');
  const estado = normalizarEstadoDatosSensibles(respuesta?.data);
  if (!estado) {
    throw respuestaInvalida();
  }
  return estado;
}

/**
 * POST /api/consentimientos/datos-sensibles con la versión y el hash del texto que la clienta leyó. Un
 * 400 dice que el texto cambió (o que la autorización no es válida): hay que volver a mostrarlo.
 */
export async function autorizarDatosSensibles(
  autorizacion: AutorizacionDatosSensibles,
  rutaOrigen: RutaDatosSensibles,
): Promise<void> {
  await apiPost<unknown>('/api/consentimientos/datos-sensibles', {
    version: autorizacion.version,
    hash: autorizacion.hash,
    rutaOrigen,
  });
}

/** POST /api/consentimientos/datos-sensibles/retirar: las alergias se ocultan de inmediato (no se borran). */
export async function retirarDatosSensibles(rutaOrigen: RutaDatosSensibles): Promise<void> {
  await apiPost<unknown>('/api/consentimientos/datos-sensibles/retirar', { rutaOrigen });
}

/**
 * El 400 de autorizar: el texto cambió (code TEXTO_DATOS_SENSIBLES_NO_VIGENTE desde la Ronda 9) o,
 * con un backend anterior, un 400 sin code. Un 400 con otro code no es un cambio del texto.
 */
export function esTextoCambiado(error: unknown): boolean {
  return esTextoDatosSensiblesActualizado(error) || (error instanceof ApiError && error.status === 400 && !error.code);
}
