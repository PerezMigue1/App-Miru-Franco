import { ApiError, ErrorDeRed, mensajeGenerico } from './apiClient';
import { obtenerTexto, RESPALDO_TEXTOS, type ClaveTexto } from './textosSitio';

/**
 * Traducción única de errores a texto para la clienta (GP-07.6). Todas las features pasan por aquí:
 * ningún texto del servidor (el message de un ApiError) llega a la pantalla. El orden es:
 *   1. el code estable del backend: primero el de la feature (opciones.porCode) y luego los comunes;
 *   2. el tipo de error (sin red, tiempo agotado, sesión, límite de solicitudes, servidor...);
 *   3. el respaldo de la pantalla (opciones.respaldo) o el texto general del tipo.
 * La excepción es un límite (429 o 503 con su espera, o BLOQUEO_TEMPORAL): su message ya viene en
 * español para la clienta y se muestra tal cual, antes que todo lo demás (GP-09).
 * Los textos se leen del catálogo por sus claves 'errores.*' de textosSitio.ts. Hoy son respaldos de
 * la app: esas claves no existen en el catálogo del backend (textos-sitio/catalogo.ts) y el admin podrá
 * editarlos cuando el backend las agregue. Los textos propios de cada dominio (por ejemplo,
 * "Ese horario ya se ocupó. Elige otro.") se quedan en su feature y llegan como respaldo o por code.
 */

export type TipoError =
  | 'sinConexion'
  | 'tiempoAgotado'
  | 'sesionTerminada'
  | 'sinPermiso'
  | 'noEncontrado'
  | 'conflicto'
  | 'demasiadoGrande'
  | 'demasiadasSolicitudes'
  | 'servidor'
  | 'solicitud'
  | 'desconocido';

export interface OpcionesMensajeError {
  /** Texto de la pantalla para lo que no es de red, de sesión ni del límite de solicitudes. */
  respaldo?: string;
  /** Textos propios de la feature por code; ganan a los comunes. */
  porCode?: Readonly<Record<string, string>>;
}

/** El único texto de sin conexión de la app (respaldo de la clave errores.sinConexion). */
export const MENSAJE_SIN_CONEXION: string = RESPALDO_TEXTOS['errores.sinConexion'];
/** El texto de sesión terminada (respaldo de la clave errores.sesionTerminada). */
export const MENSAJE_SESION_TERMINADA: string = RESPALDO_TEXTOS['errores.sesionTerminada'];

/** Tipo por estado HTTP exacto; lo demás se decide por rango. */
const TIPO_POR_ESTADO: Readonly<Record<number, TipoError>> = {
  0: 'sinConexion',
  401: 'sesionTerminada',
  403: 'sinPermiso',
  404: 'noEncontrado',
  408: 'tiempoAgotado',
  409: 'conflicto',
  413: 'demasiadoGrande',
  // 429 incluye el ThrottlerException del backend.
  429: 'demasiadasSolicitudes',
  504: 'tiempoAgotado',
};

/** Clave del catálogo de cada code estable del backend que la app conoce. */
const CLAVE_POR_CODE: Readonly<Record<string, ClaveTexto>> = {
  SESION_VENCIDA: 'errores.sesionTerminada',
  SESION_REVOCADA: 'errores.sesionTerminada',
  USA_RENOVAR_MOVIL: 'errores.sesionTerminada',
  RENOVACION_EN_CURSO: 'errores.renovacionEnCurso',
  CUENTA_NO_ACTIVADA: 'errores.cuentaNoActivada',
  CODIGO_INVALIDO: 'errores.codigoInvalido',
  CODIGO_VENCIDO: 'errores.codigoVencido',
  CODIGO_INCORRECTO: 'errores.codigoIncorrecto',
  INTENTOS_AGOTADOS: 'errores.intentosAgotados',
  DEMASIADOS_CODIGOS: 'errores.demasiadosCodigos',
  CODIGO_EN_CURSO: 'errores.codigoEnCurso',
  CORREO_NO_ENVIADO: 'errores.correoNoEnviado',
  CUENTA_SIN_PASSWORD: 'errores.cuentaSinPassword',
  CUENTA_NO_CONFIRMADA: 'errores.cuentaNoConfirmada',
  PASSWORD_ACTUAL_INCORRECTA: 'errores.passwordActualIncorrecta',
  PASSWORD_ACTUAL_REQUERIDA: 'errores.passwordActualRequerida',
  CUENTA_GOOGLE_SIN_PREGUNTA: 'errores.cuentaGoogleSinPregunta',
  CORREO_EN_USO: 'errores.correoEnUso',
  CORREO_IGUAL: 'errores.correoIgual',
  SIN_SOLICITUD: 'errores.sinSolicitudCorreo',
  CONSENTIMIENTO_SALUD_REQUERIDO: 'errores.consentimientoSalud',
  PROMOCIONES_SOLO_TITULAR: 'errores.promocionesSoloTitular',
  CANCELACION_ABIERTA: 'errores.cancelacionAbierta',
  OPERACIONES_EN_CURSO: 'errores.operacionesEnCurso',
  CUENTA_DE_PERSONAL: 'errores.cuentaDePersonal',
  INSUFFICIENT_ROLE: 'errores.sinPermiso',
  INSUFFICIENT_PERMISSIONS: 'errores.sinPermiso',
  NO_PERMISSIONS: 'errores.sinPermiso',
};

/**
 * Tipos que no dependen de la pantalla: su texto gana al respaldo (decir "sin conexión" es más útil
 * que "no pudimos cancelar tu cita").
 */
const TIPOS_SIN_CONTEXTO: ReadonlySet<TipoError> = new Set([
  'sinConexion',
  'tiempoAgotado',
  'sesionTerminada',
  'demasiadasSolicitudes',
]);

const propio = <T>(registro: Readonly<Record<string, T>>, clave: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(registro, clave) ? registro[clave] : undefined;

/** Qué clase de error es, sin leer nunca el texto del servidor. */
export function tipoDeError(error: unknown): TipoError {
  if (error instanceof ErrorDeRed) {
    return error.motivo === 'tiempoAgotado' ? 'tiempoAgotado' : 'sinConexion';
  }
  if (!(error instanceof ApiError)) {
    return 'desconocido';
  }
  const exacto = propio(TIPO_POR_ESTADO, String(error.status));
  if (exacto) {
    return exacto;
  }
  if (error.status >= 500) {
    return 'servidor';
  }
  return error.status >= 400 ? 'solicitud' : 'desconocido';
}

/** true si no hubo respuesta del servidor (sin red o tiempo agotado). */
export function esSinRespuesta(error: unknown): boolean {
  const tipo = tipoDeError(error);
  return tipo === 'sinConexion' || tipo === 'tiempoAgotado';
}

/** Texto del code del error: el de la feature o el común; undefined si no trae uno conocido. */
function textoDelCode(error: unknown, porCode: Readonly<Record<string, string>>): string | undefined {
  const code = error instanceof ApiError ? error.code : undefined;
  if (!code) {
    return undefined;
  }
  const clave = propio(CLAVE_POR_CODE, code);
  return propio(porCode, code) ?? (clave ? obtenerTexto(clave) : undefined);
}

/** La frase de la referencia de un 5xx; '' si no trae una. */
function fraseReferencia(error: unknown): string {
  const referencia = error instanceof ApiError && error.status >= 500 ? error.referencia : undefined;
  return referencia ? obtenerTexto('errores.referencia', { referencia }) : '';
}

/** Code del 429 por varias contraseñas incorrectas: no es sesión vencida ni cuenta sin activar. */
export const CODIGO_BLOQUEO_TEMPORAL = 'BLOQUEO_TEMPORAL';
/** Espera de un 429 que no dijo cuánto esperar (el límite más común del backend es por minuto). */
export const ESPERA_LIMITE_S = 60;

/** Nombres HTTP en inglés que llegan como `error` cuando el cuerpo no trae message. */
const NOMBRES_HTTP: ReadonlySet<string> = new Set([
  'bad request',
  'unauthorized',
  'forbidden',
  'not found',
  'conflict',
  'too many requests',
  'internal server error',
  'bad gateway',
  'service unavailable',
  'gateway timeout',
]);

/**
 * El message de un ApiError tal cual, solo para las respuestas cuyo texto el backend ya escribe en
 * español para la clienta (contratos de las rondas 6 a 8: límites, saturación y piezas agotadas).
 * Es el único lugar de src que devuelve un message; quien lo llama decide antes, por status o code,
 * que la respuesta es de esas. null si no es un ApiError o si el texto no es para la clienta: vacío,
 * el genérico de apiClient, un nombre HTTP o uno técnico (ThrottlerException...).
 */
export function textoDelServidor(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  const texto = error.message.trim();
  const tecnico = /exception/i.test(texto) || NOMBRES_HTTP.has(texto.toLowerCase());
  return texto && texto !== mensajeGenerico(error.status) && !tecnico ? texto : null;
}

/**
 * El message del backend de un límite: un 429 o un 503 que dice cuánto esperar (retryAfter) o el 429
 * BLOQUEO_TEMPORAL. Desde las rondas 6 y 7 ese message ya viene en español para la clienta ("Hay
 * mucha demanda, intenta de nuevo en unos segundos"). null si no es un límite o si el texto no es
 * para la clienta (ver textoDelServidor).
 */
export function mensajeDelLimite(error: unknown): string | null {
  if (!(error instanceof ApiError) || (error.status !== 429 && error.status !== 503)) {
    return null;
  }
  if (error.retryAfter === undefined && error.code !== CODIGO_BLOQUEO_TEMPORAL) {
    return null;
  }
  return textoDelServidor(error);
}

/**
 * Segundos que la acción queda en espera tras un 429: los que pidió el servidor o ESPERA_LIMITE_S si
 * no los mandó. null si no es un 429 (un 503 no deja la acción en espera: solo se muestra su texto).
 */
export function segundosDeLimite(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 429) {
    return null;
  }
  return error.retryAfter ?? ESPERA_LIMITE_S;
}

/**
 * Texto para la clienta de cualquier error (ApiError, ErrorDeRed, Error, texto o undefined). Nunca
 * devuelve el message de un ApiError, salvo el de un límite (mensajeDelLimite), que gana a todo. Un
 * 5xx con referencia agrega la frase para compartirla.
 */
export function mensajeParaClienta(error: unknown, opciones: OpcionesMensajeError = {}): string {
  const delLimite = mensajeDelLimite(error);
  if (delLimite) {
    return [delLimite, fraseReferencia(error)].filter(Boolean).join(' ');
  }
  const delCode = textoDelCode(error, opciones.porCode ?? {});
  const tipo = tipoDeError(error);
  const base =
    delCode ??
    (TIPOS_SIN_CONTEXTO.has(tipo) || opciones.respaldo === undefined ? obtenerTexto(`errores.${tipo}`) : opciones.respaldo);
  return [base, fraseReferencia(error)].filter(Boolean).join(' ');
}

/**
 * Solo lo que no depende de la pantalla: el message de un límite (429 o 503 con su espera), un code
 * conocido o sin red, tiempo agotado, sesión terminada o límite de solicitudes. null si no es nada
 * de eso (la feature decide el resto).
 */
export function mensajeSinContexto(error: unknown, porCode: Readonly<Record<string, string>> = {}): string | null {
  if (mensajeDelLimite(error)) {
    return mensajeParaClienta(error);
  }
  const delCode = textoDelCode(error, porCode);
  if (delCode !== undefined) {
    return delCode;
  }
  return TIPOS_SIN_CONTEXTO.has(tipoDeError(error)) ? mensajeParaClienta(error) : null;
}
