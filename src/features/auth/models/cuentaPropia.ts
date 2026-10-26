import { ApiError, apiDelete, apiGet, apiPost } from '@/shared/api/apiClient';
import { CODIGO_BLOQUEO_TEMPORAL, mensajeParaClienta, textoDelServidor } from '@/shared/api/mensajesError';
import { obtenerTexto, type ClaveTexto } from '@/shared/api/textosSitio';

import { CODIGO_CUENTA_DESACTIVADA, mensajeDelReenvio, type RespuestaSimple } from './AuthModel';

/**
 * Cuenta propia (GP-09): desactivar, eliminar y reactivar. Contrato del backend en
 * CONTRATO_APP_CUENTA.md (src/cuenta/ de Backend-Miru-Franco). Todo se decide por status y code;
 * el message solo se muestra cuando el code dice que es para la clienta (textoDelServidor).
 */

// ── Revisión de pendientes ─────────────────────────────────────────────────────────────────

/** Cómo confirma la clienta que es ella: con su contraseña o, si entra solo con Google, con un código. */
export type MetodoConfirmacion = 'password' | 'codigo';

/** Pantalla de la app que abre un pendiente: su cita (Mis citas) o su pedido (Mis pedidos). */
export type EntidadPendiente = 'cita' | 'pedido';

/** Una cita o un pedido de la revisión (o de errors.bloqueos del 409). */
export interface PendienteCuenta {
  tipo: string;
  /** null si el backend mandó otra entidad o un id que no sirve: el pendiente no abre nada. */
  entidad: EntidadPendiente | null;
  id: string | null;
  /** Texto ya lleno del catálogo; '' si no vino (la pantalla pone el suyo). */
  mensaje: string;
}

/** GET /api/auth/me/cuenta/revision, normalizada. */
export interface RevisionCuenta {
  metodoConfirmacion: MetodoConfirmacion;
  /** Lo que se cancela sin costo al confirmar (citas sin anticipo y pedidos sin pagar). */
  seResuelveSolo: PendienteCuenta[];
  /** Lo que hay que resolver antes; con uno solo ya no se puede continuar. */
  bloqueos: PendienteCuenta[];
  /** Solo true si el servidor lo dijo y no hay bloqueos. */
  puedeContinuar: boolean;
}

const METODOS: ReadonlySet<string> = new Set<MetodoConfirmacion>(['password', 'codigo']);
const ENTIDADES: ReadonlySet<string> = new Set<EntidadPendiente>(['cita', 'pedido']);

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Id entero positivo (número o texto de solo dígitos), como texto; null si no sirve. */
function idValido(valor: unknown): string | null {
  const texto = typeof valor === 'number' || typeof valor === 'string' ? String(valor).trim() : '';
  return /^[1-9]\d{0,15}$/.test(texto) ? texto : null;
}

/**
 * Un pendiente tal como llegue. Uno sin la forma esperada sigue contando (un bloqueo desconocido
 * bloquea igual): solo pierde lo que no sirve (entidad, id o mensaje).
 */
export function normalizarPendiente(valor: unknown): PendienteCuenta {
  const datos = esObjeto(valor) ? valor : {};
  const { tipo, entidad, id, mensaje } = datos;
  const entidadValida = typeof entidad === 'string' && ENTIDADES.has(entidad) ? (entidad as EntidadPendiente) : null;
  const idTexto = idValido(id);
  return {
    tipo: typeof tipo === 'string' ? tipo : '',
    entidad: entidadValida && idTexto ? entidadValida : null,
    id: entidadValida && idTexto ? idTexto : null,
    mensaje: typeof mensaje === 'string' ? mensaje.trim() : '',
  };
}

/**
 * Revisión normalizada, o null si no se puede confiar en ella: sin método conocido, o sin las dos
 * listas. Los valores desconocidos nunca permiten continuar: un pendiente que se cancela solo sin
 * texto invalida la revisión (no se cancela nada sin decírselo a la clienta), y `puedeContinuar`
 * solo vale si llegó exactamente true y no hay bloqueos.
 */
export function normalizarRevision(valor: unknown): RevisionCuenta | null {
  if (!esObjeto(valor)) {
    return null;
  }
  const { metodoConfirmacion, seResuelveSolo, bloqueos, puedeContinuar } = valor;
  if (typeof metodoConfirmacion !== 'string' || !METODOS.has(metodoConfirmacion)) {
    return null;
  }
  if (!Array.isArray(seResuelveSolo) || !Array.isArray(bloqueos)) {
    return null;
  }
  const seCancelan = seResuelveSolo.map(normalizarPendiente);
  if (seCancelan.some((pendiente) => !pendiente.mensaje)) {
    return null;
  }
  const bloqueosNormalizados = bloqueos.map(normalizarPendiente);
  return {
    metodoConfirmacion: metodoConfirmacion as MetodoConfirmacion,
    seResuelveSolo: seCancelan,
    bloqueos: bloqueosNormalizados,
    puedeContinuar: puedeContinuar === true && bloqueosNormalizados.length === 0,
  };
}

/** Respuesta del servidor que no se puede usar: la pantalla muestra su error general. */
function respuestaInvalida(): ApiError {
  return new ApiError(500, 'La respuesta del servidor no trae una revisión válida.');
}

/** GET /api/auth/me/cuenta/revision (10 por minuto): qué se cancela solo, qué bloquea y cómo se confirma. */
export async function revisarCuenta(): Promise<RevisionCuenta> {
  const respuesta = await apiGet<{ data?: unknown } | null>('/api/auth/me/cuenta/revision');
  const revision = normalizarRevision(respuesta?.data);
  if (!revision) {
    throw respuestaInvalida();
  }
  return revision;
}

// ── Confirmación y baja ────────────────────────────────────────────────────────────────────

/** El dato con que la clienta confirma, según el método de la revisión. */
export type DatoConfirmacion = { metodo: 'password'; password: string } | { metodo: 'codigo'; codigo: string };

/** Cuerpo exacto del contrato: solo el campo del método (los de más se rechazan) y confirmacion: true. */
export function cuerpoConfirmacion(
  dato: DatoConfirmacion,
): { password: string; confirmacion: true } | { codigo: string; confirmacion: true } {
  return dato.metodo === 'password'
    ? { password: dato.password, confirmacion: true }
    : { codigo: dato.codigo, confirmacion: true };
}

/** Respuesta de POST /api/auth/me/cuenta/codigo: nunca trae el código. */
export interface CodigoCuentaEnviado {
  /** Texto para la clienta, o null si no vino uno que se pueda mostrar. */
  mensaje: string | null;
  vigenciaMinutos: number | null;
}

/** POST /api/auth/me/cuenta/codigo (3 por minuto, solo cuentas sin contraseña): código de 6 dígitos al correo. */
export async function pedirCodigoCuenta(): Promise<CodigoCuentaEnviado> {
  const respuesta = await apiPost<(RespuestaSimple & { vigenciaMinutos?: unknown }) | null>('/api/auth/me/cuenta/codigo', {});
  const vigencia = respuesta?.vigenciaMinutos;
  return {
    mensaje: mensajeDelReenvio(respuesta),
    vigenciaMinutos: typeof vigencia === 'number' && Number.isInteger(vigencia) && vigencia > 0 ? vigencia : null,
  };
}

/** Resultado de desactivar o eliminar: el servidor ya revocó todas las sesiones. */
export interface ResultadoBaja {
  mensaje: string | null;
  /** Folio ARCO de la eliminación (solo al eliminar), o null si no vino uno válido. */
  folio: string | null;
}

/** Folio como ARCO-2026-000123: letras mayúsculas, dígitos y guiones. */
function folioValido(valor: unknown): string | null {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return /^[A-Z0-9][A-Z0-9-]{0,39}$/.test(texto) ? texto : null;
}

export function normalizarResultadoBaja(respuesta: unknown): ResultadoBaja {
  const datos = esObjeto(respuesta) && esObjeto(respuesta.data) ? respuesta.data : {};
  return { mensaje: mensajeDelReenvio(respuesta), folio: folioValido(datos.folio) };
}

/**
 * POST /api/auth/me/desactivar. Comparte con eliminar un límite de 5 por minuto. Todo o nada: si
 * responde un error, no se canceló nada y la cuenta sigue como estaba.
 */
export async function desactivarCuenta(dato: DatoConfirmacion): Promise<ResultadoBaja> {
  return normalizarResultadoBaja(await apiPost<unknown>('/api/auth/me/desactivar', cuerpoConfirmacion(dato)));
}

/** DELETE /api/auth/me (definitivo): mismo cuerpo, límite y reglas que desactivar; trae data.folio. */
export async function eliminarCuenta(dato: DatoConfirmacion): Promise<ResultadoBaja> {
  return normalizarResultadoBaja(await apiDelete<unknown>('/api/auth/me', {}, cuerpoConfirmacion(dato)));
}

// ── Reactivar (públicas) ───────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/reactivar/solicitar (3 por minuto): responde siempre lo mismo, exista o no la
 * cuenta, así que la app nunca dice si existe. Devuelve el texto neutro o null.
 */
export async function solicitarReactivacion(email: string): Promise<string | null> {
  return mensajeDelReenvio(await apiPost<unknown>('/api/auth/reactivar/solicitar', { email }, { publica: true }));
}

/** POST /api/auth/reactivar/confirmar (5 por minuto): reactiva con el código. No inicia sesión. */
export async function confirmarReactivacion(email: string, codigo: string): Promise<string | null> {
  return mensajeDelReenvio(await apiPost<unknown>('/api/auth/reactivar/confirmar', { email, codigo }, { publica: true }));
}

// ── Errores por code ───────────────────────────────────────────────────────────────────────

export const CODIGO_CUENTA_CON_PENDIENTES = 'CUENTA_CON_PENDIENTES';
export const CODIGO_CUENTA_CAMBIO = 'CUENTA_CAMBIO';
export const CODIGO_CUENTA_DE_PERSONAL = 'CUENTA_DE_PERSONAL';
export const CODIGO_PASSWORD_REQUERIDA = 'PASSWORD_REQUERIDA';
export const CODIGO_PASSWORD_INCORRECTA = 'PASSWORD_INCORRECTA';

/** Los 400 de la confirmación (nunca 401: no son sesión vencida). */
export const CODIGOS_CONFIRMACION: ReadonlySet<string> = new Set([
  CODIGO_PASSWORD_REQUERIDA,
  CODIGO_PASSWORD_INCORRECTA,
  'CODIGO_REQUERIDO',
  'SIN_CODIGO',
  'CODIGO_INCORRECTO',
  'CODIGO_VENCIDO',
  'INTENTOS_AGOTADOS',
  'CODIGO_INVALIDO',
]);

function conCode(error: unknown, status: number, code: string): boolean {
  return error instanceof ApiError && error.status === status && error.code === code;
}

/** 409 CUENTA_CON_PENDIENTES: algo bloquea; trae los bloqueos en errors.bloqueos. Nada se canceló. */
export function esCuentaConPendientes(error: unknown): boolean {
  return conCode(error, 409, CODIGO_CUENTA_CON_PENDIENTES);
}

/** 409 CUENTA_CAMBIO: algo cambió entre la revisión y la confirmación; hay que pedir la revisión otra vez. */
export function esCuentaCambio(error: unknown): boolean {
  return conCode(error, 409, CODIGO_CUENTA_CAMBIO);
}

/** 409 CUENTA_CON_PASSWORD al pedir el código: la cuenta tiene contraseña y se confirma con ella. */
export function esCuentaConPassword(error: unknown): boolean {
  return conCode(error, 409, 'CUENTA_CON_PASSWORD');
}

/** 403 CUENTA_DE_PERSONAL: solo la administración maneja esa cuenta. */
export function esCuentaDePersonal(error: unknown): boolean {
  return conCode(error, 403, CODIGO_CUENTA_DE_PERSONAL);
}

/** Un 400 de la confirmación (contraseña o código), reconocido por su code. */
export function esErrorDeConfirmacion(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && error.code !== undefined && CODIGOS_CONFIRMACION.has(error.code);
}

/** El 400 de la contraseña (requerida o incorrecta): su mensaje va junto al campo. */
export function esErrorDePassword(error: unknown): boolean {
  return (
    conCode(error, 400, CODIGO_PASSWORD_REQUERIDA) || conCode(error, 400, CODIGO_PASSWORD_INCORRECTA)
  );
}

/** Bloqueos de errors.bloqueos de un 409 CUENTA_CON_PENDIENTES; [] si no es ese error o no los trae. */
export function bloqueosDelError(error: unknown): PendienteCuenta[] {
  if (!esCuentaConPendientes(error)) {
    return [];
  }
  const errors = (error as ApiError).errors;
  const bloqueos = esObjeto(errors) ? errors.bloqueos : undefined;
  return Array.isArray(bloqueos) ? bloqueos.map(normalizarPendiente) : [];
}

/**
 * Codes cuyo message escribe el backend para la clienta (catálogo de Textos del sitio), con el
 * respaldo de la app si el message no sirve. Los de código vencido, incorrecto, inválido o agotado,
 * y CORREO_NO_ENVIADO, ya tienen su respaldo común en mensajesError.
 */
const RESPALDO_POR_CODE: Readonly<Record<string, ClaveTexto | null>> = {
  [CODIGO_PASSWORD_REQUERIDA]: 'cuenta.app.error.passwordRequerida',
  [CODIGO_PASSWORD_INCORRECTA]: 'cuenta.app.error.passwordIncorrecta',
  CODIGO_REQUERIDO: 'cuenta.app.error.codigoRequerido',
  SIN_CODIGO: 'cuenta.app.error.sinCodigo',
  CODIGO_INCORRECTO: null,
  CODIGO_VENCIDO: null,
  INTENTOS_AGOTADOS: null,
  CODIGO_INVALIDO: null,
  ESPERA_CODIGO: 'cuenta.app.error.esperaCodigo',
  CUENTA_CON_PASSWORD: 'cuenta.app.error.cuentaConPassword',
  CORREO_NO_ENVIADO: null,
  [CODIGO_CUENTA_DE_PERSONAL]: 'cuenta.personal',
  [CODIGO_CUENTA_CAMBIO]: 'cuenta.app.cambio',
  [CODIGO_CUENTA_CON_PENDIENTES]: 'cuenta.revision.bloquea',
  [CODIGO_CUENTA_DESACTIVADA]: 'cuenta.login.desactivada',
  [CODIGO_BLOQUEO_TEMPORAL]: null,
};

const propio = (registro: Readonly<Record<string, unknown>>, clave: string): boolean =>
  Object.prototype.hasOwnProperty.call(registro, clave);

/**
 * Texto para la clienta de un error de la cuenta propia: el message del backend cuando el code dice
 * que es para ella (los 400 de la confirmación, el bloqueo temporal, el personal...), con el
 * respaldo de la app si no sirve; cualquier otro error (sin red, 5xx, 400 sin code) pasa por
 * mensajeParaClienta con el respaldo de la pantalla.
 */
export function mensajeDeCuenta(error: unknown, respaldo: string): string {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code && propio(RESPALDO_POR_CODE, code)) {
    const delServidor = textoDelServidor(error);
    if (delServidor) {
      return delServidor;
    }
    const clave = RESPALDO_POR_CODE[code];
    if (clave) {
      return obtenerTexto(clave);
    }
  }
  return mensajeParaClienta(error, { respaldo });
}
