import { ApiError, ErrorDeRed, esUrlPermitida } from '@/shared/api/apiClient';
import { CODIGO_BLOQUEO_TEMPORAL } from '@/shared/api/mensajesError';
import { soloDigitos, telefonoSinLada } from '@/shared/ui/digitos';

/** Tipos y reglas del dominio de autenticación (contratos del backend NestJS ya desplegado). */

/** Único rol que puede usar la app móvil. */
export const ROL_CLIENTE = 'cliente';

export interface UsuarioSesion {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

/** POST /api/auth/login → 200. */
export interface RespuestaLogin {
  success: boolean;
  message?: string;
  token: string;
  usuario: UsuarioSesion;
  /** Solo para el rol cliente con canal "movil": renueva el acceso en /api/auth/movil/renovar. */
  refreshToken?: string;
  /** Vencimiento del refreshToken: número o texto ISO, tal como llegue. */
  refreshExpiraEn?: number | string;
}

/** Renovación de sesiones sin refreshToken → 200 (en modo Bearer no trae renovarEnSegundos). */
export interface RespuestaRefresh {
  success: boolean;
  token: string;
}

/** GET /api/auth/me → 200. */
export interface RespuestaPerfil {
  data: UsuarioSesion;
}

export interface PreguntaSeguridad {
  id: string;
  pregunta: string;
}

/** GET /api/pregunta-seguridad → 200. */
export interface RespuestaPreguntas {
  success: boolean;
  data: PreguntaSeguridad[];
}

export type TipoCabello = 'liso' | 'ondulado' | 'rizado';

export const TIPOS_CABELLO: { valor: TipoCabello; etiqueta: string }[] = [
  // La web muestra "Lacio" y envía 'liso'.
  { valor: 'liso', etiqueta: 'Lacio' },
  { valor: 'ondulado', etiqueta: 'Ondulado' },
  { valor: 'rizado', etiqueta: 'Rizado' },
];

/** Perfil capilar del registro (como lo arma la web): los opcionales vacíos no se envían. */
export interface PerfilCapilar {
  tipoCabello: TipoCabello;
  colorNatural?: string;
  colorActual?: string;
  productosUsados?: string;
  /** Con "Sí" solo viaja junto con la autorización de datos sensibles (sin ella no se dice nada). */
  tieneAlergias?: boolean;
  /** Dato de salud: solo viaja en el registro y con la autorización; nunca se guarda en el teléfono ni en logs. */
  alergias?: string;
  tratamientosQuimicos: boolean;
  tratamientos?: string;
}

/** POST /api/usuarios/registro. */
export interface DatosRegistro {
  nombre: string;
  email: string;
  telefono: string;
  password: string;
  /** AAAA-MM-DD. */
  fechaNacimiento: string;
  preguntaSeguridad: { pregunta: string; respuesta: string };
  perfilCapilar: PerfilCapilar;
  aceptaAvisoPrivacidad: true;
  recibePromociones: boolean;
  /** Obligatorio (true) si perfilCapilar.alergias trae texto; el backend no lo guarda. */
  consienteDatosSensibles?: true;
  /**
   * Versión y hash del texto de la autorización de datos sensibles que la clienta leyó y autorizó
   * (Ronda 5). Sin ella el backend no guarda las alergias, así que la app ni siquiera las manda.
   */
  autorizacionDatosSensibles?: { version: string; hash: string };
}

/** POST /api/usuarios/registro → 201: la cuenta nueva, sin activar. */
export interface RespuestaRegistro extends RespuestaSimple {
  usuario?: {
    /** true: mandó alergias sin una autorización vigente y el backend no las guardó. */
    alergiasPendientesDeAutorizacion?: boolean;
  };
}

/** El registro creó la cuenta sin las alergias porque faltó la autorización de datos sensibles. */
export function alergiasPendientesDelRegistro(respuesta: RespuestaRegistro | null | undefined): boolean {
  return respuesta?.usuario?.alergiasPendientesDeAutorizacion === true;
}

/** POST /api/auth/verificar-correo → 200. */
export interface RespuestaVerificarCorreo {
  existe: boolean;
  message?: string;
}

/** Respuesta genérica { success, message } de registro, OTP, reenvío y recuperación. */
export interface RespuestaSimple {
  success?: boolean;
  message?: string;
}

/** Texto para la clienta cuando la cuenta no es de clienta (lo muestran login y Google). */
export const MENSAJE_ROL_NO_PERMITIDO = 'Esta app es para clientas. Usa el sitio web';

/** El inicio de sesión fue correcto, pero la cuenta no es de clienta. */
export class ErrorRolNoPermitido extends Error {
  constructor() {
    super(MENSAJE_ROL_NO_PERMITIDO);
    this.name = 'ErrorRolNoPermitido';
  }
}

// ── Clasificación de errores (los textos para la clienta salen de shared/api/mensajesError) ──

export function esErrorDeRed(error: unknown): boolean {
  return error instanceof ErrorDeRed;
}

export function estadoHttp(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}

/** Code estable del 403 del login con una cuenta sin activar (usuarios.service.ts del backend). */
export const CODIGO_CUENTA_NO_ACTIVADA = 'CUENTA_NO_ACTIVADA';

/**
 * 403 del login cuando la cuenta todavía no se activa con el código del correo: se reconoce solo por
 * su code (el texto del servidor puede cambiar y nunca decide nada). Otro 403 (cuenta bloqueada,
 * sin permiso) no abre la activación.
 */
export function esCuentaSinActivar(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.code === CODIGO_CUENTA_NO_ACTIVADA;
}

/** Code estable del 403 del login con una cuenta que desactivó su titular (CONTRATO_APP_CUENTA.md). */
export const CODIGO_CUENTA_DESACTIVADA = 'CUENTA_DESACTIVADA';

/** El regreso de Google trajo `?error=cuenta_desactivada`: la titular desactivó su cuenta. */
export class ErrorCuentaDesactivada extends Error {
  constructor() {
    super('La cuenta está desactivada.');
    this.name = 'ErrorCuentaDesactivada';
  }
}

/**
 * Cuenta que desactivó su titular: el 403 CUENTA_DESACTIVADA del login (solo llega después de
 * comprobar la contraseña correcta) o el regreso de Google con `error=cuenta_desactivada`. Se
 * reconoce solo por el code: CUENTA_NO_ACTIVADA y cualquier otro 403 no abren Reactivar.
 */
export function esCuentaDesactivada(error: unknown): boolean {
  if (error instanceof ErrorCuentaDesactivada) {
    return true;
  }
  return error instanceof ApiError && error.status === 403 && error.code === CODIGO_CUENTA_DESACTIVADA;
}

/**
 * 429 BLOQUEO_TEMPORAL del login (varias contraseñas incorrectas): el bloqueo es de esa cuenta, no
 * de la IP, así que con otro correo ya no aplica. Nunca es sesión vencida ni cuenta sin activar.
 */
export function esBloqueoTemporal(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429 && error.code === CODIGO_BLOQUEO_TEMPORAL;
}

/** Textos del 200 que no son para la clienta: nombres HTTP en inglés. */
const NOMBRES_HTTP_EXITO: ReadonlySet<string> = new Set(['ok', 'created', 'success', 'bad request', 'too many requests']);

/**
 * Mensaje neutro del 200 de POST /api/auth/reenviar-codigo (Ronda 7 del backend): responde lo mismo
 * exista o no la cuenta y esté o no activada, así que se muestra tal cual y nunca dice nada de la
 * cuenta. null si la respuesta no trae un texto para la clienta (la pantalla usa el suyo del catálogo).
 */
export function mensajeDelReenvio(respuesta: unknown): string | null {
  if (typeof respuesta !== 'object' || respuesta === null) {
    return null;
  }
  const { message: texto } = respuesta as { message?: unknown };
  const limpio = typeof texto === 'string' ? texto.trim() : '';
  // Vacío, técnico (una excepción) o un nombre HTTP en inglés: la pantalla usa su texto del catálogo.
  const tecnico = /exception/i.test(limpio) || NOMBRES_HTTP_EXITO.has(limpio.toLowerCase());
  return limpio && !tecnico ? limpio : null;
}

// ── Validaciones (sin expresiones regulares) ───────────────────────────────────────────────

const LARGO_TELEFONO = 10;
const LARGO_CODIGO = 6;
const LARGO_MINIMO_CLAVE = 8;
const LARGO_MINIMO_TEXTO = 2;
/** El backend solo compara datos personales de 3 caracteres o más. */
const LARGO_MINIMO_DATO = 3;
const EDAD_MINIMA = 18;
const ESPECIALES = '!@#$%^&*()_+-=[]{};\':"\\|,.<>/?';
/** KEYBOARD_SEQUENCES de password.validator.ts del backend: se rechaza la contraseña que contenga una. */
const PATRONES_TECLADO = [
  'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm',
  '123456', '12345678', '123456789', '1234567890',
  'abcdef', 'abcdefgh', 'qwertyui', 'asdfghjk',
];
/**
 * COMMON_PASSWORDS de password.validator.ts del backend. Como allá, basta con que la contraseña
 * contenga una, sin importar mayúsculas ("Hello#29x" también se rechaza).
 */
const CLAVES_COMUNES = [
  'password', 'password123', 'password1', '12345678', '123456789', '1234567890',
  'qwerty', 'qwerty123', 'abc123', 'admin', 'admin123', 'letmein', 'welcome',
  'monkey', 'dragon', 'master', 'sunshine', 'princess', 'football', 'baseball',
  'iloveyou', 'trustno1', 'superman', 'batman', 'jesus', 'michael', 'jordan',
  'shadow', 'mustang', 'harley', 'freedom', 'whatever', 'hello', 'charlie',
  'aa123456', 'donald', 'welcome123', 'monkey123',
];
const FRAGMENTOS_PELIGROSOS = [
  '<script', '</script>', '<iframe', '<img', 'onerror', 'onload', 'onclick', 'onmouseover',
  'javascript:', '<svg', '<style', '<link', '<meta', '<object', '<embed',
];

function esDigito(c: string): boolean {
  return c >= '0' && c <= '9';
}

// Como el backend (/[A-Z]/ y /[a-z]/), solo cuentan las letras sin acento: "É" o "ñ" no cumplen
// la regla de mayúscula o minúscula.
function esMayuscula(c: string): boolean {
  return c >= 'A' && c <= 'Z';
}

function esMinuscula(c: string): boolean {
  return c >= 'a' && c <= 'z';
}

function esLetraAscii(c: string): boolean {
  return esMayuscula(c) || esMinuscula(c);
}

/** Un solo @, texto a ambos lados, sin espacios y un punto con texto a ambos lados en el dominio. */
export function esCorreoValido(correo: string): boolean {
  const valor = correo.trim();
  if (valor.includes(' ')) {
    return false;
  }
  const partes = valor.split('@');
  if (partes.length !== 2) {
    return false;
  }
  const [usuario, dominio] = partes;
  if (!usuario || !dominio) {
    return false;
  }
  const punto = dominio.lastIndexOf('.');
  return punto > 0 && punto < dominio.length - 1;
}

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

export function problemaDeCorreo(correo: string): string | null {
  if (!correo.trim()) {
    return 'El correo electrónico es requerido';
  }
  return esCorreoValido(correo) ? null : 'El correo electrónico no es válido';
}

export function tieneFragmentosPeligrosos(texto: string): boolean {
  const minusculas = texto.toLowerCase();
  return FRAGMENTOS_PELIGROSOS.some((fragmento) => minusculas.includes(fragmento));
}

/**
 * Teléfono de México como lo exige el backend (/^\d{10}$/): solo dígitos y sin la lada 52 o 521
 * (telefonoSinLada). No recorta: "+52 771 268 1432" queda "7712681432" y no "5277126814"; si sobran
 * o faltan dígitos, esTelefonoValido lo marca y nunca se manda un número equivocado.
 */
export function normalizarTelefono(telefono: string): string {
  return telefonoSinLada(telefono);
}

export function esTelefonoValido(telefono: string): boolean {
  const digitos = soloDigitos(telefono);
  return digitos.length === LARGO_TELEFONO && digitos[0] !== '0';
}

export const AYUDA_TELEFONO = '10 dígitos de tu número en México. No incluyas +52, espacios ni guiones.';
export const ERROR_TELEFONO = 'Ingresa exactamente 10 dígitos (número mexicano, sin +52).';

export function esCodigoValido(codigo: string): boolean {
  return codigo.length === LARGO_CODIGO && soloDigitos(codigo) === codigo;
}

function tieneConsecutivos(texto: string): { letras: boolean; numeros: boolean; repetidos: boolean } {
  let letras = false;
  let numeros = false;
  let repetidos = false;
  for (let i = 0; i + 2 < texto.length; i++) {
    const a = texto[i];
    const b = texto[i + 1];
    const c = texto[i + 2];
    if (a === b && b === c) {
      repetidos = true;
    }
    const ca = a.toLowerCase().charCodeAt(0);
    const cb = b.toLowerCase().charCodeAt(0);
    const cc = c.toLowerCase().charCodeAt(0);
    if (esLetraAscii(a) && esLetraAscii(b) && esLetraAscii(c) && cb === ca + 1 && cc === cb + 1) {
      letras = true;
    }
    // Como el backend (012, 123... 789 y 890): solo los que suben; los que bajan (321) sí se permiten.
    if (esDigito(a) && esDigito(b) && esDigito(c)) {
      const sube = cb === ca + 1 && cc === cb + 1;
      if (sube || a + b + c === '890') {
        numeros = true;
      }
    }
  }
  return { letras, numeros, repetidos };
}

interface DatosPersonales {
  nombre?: string;
  email?: string;
  telefono?: string;
  /** AAAA-MM-DD. */
  fechaNacimiento?: string;
  respuesta?: string;
}

/**
 * Regla del backend (password.validator.ts): con todo en minúsculas, la contraseña no puede
 * contener el dato, y solo si el dato tiene 3 caracteres o más.
 */
function contieneDato(claveMinusculas: string, dato: string): boolean {
  const valor = dato.toLowerCase();
  return valor.length >= LARGO_MINIMO_DATO && claveMinusculas.includes(valor);
}

/**
 * Reglas de contraseña del backend: mínimo 8 caracteres con mayúscula, minúscula, número y
 * carácter especial, sin datos personales ni patrones simples. Los datos personales se comparan
 * tal como se envían: nombre completo, usuario del correo, teléfono, año y día de nacimiento
 * (AAAA y DD de AAAA-MM-DD) y respuesta de seguridad.
 * Devuelve el primer problema, o null si es válida.
 */
export function problemaDeClave(clave: string, datos: DatosPersonales = {}): string | null {
  const caracteres = clave.split('');
  const minusculas = clave.toLowerCase();
  const consecutivos = tieneConsecutivos(clave);
  const [anio = '', , dia = ''] = (datos.fechaNacimiento ?? '').split('-');
  const usuarioCorreo = normalizarCorreo(datos.email ?? '').split('@')[0] ?? '';
  const telefono = normalizarTelefono(datos.telefono ?? '');
  const reglas: [boolean, string][] = [
    [clave.length < LARGO_MINIMO_CLAVE, 'La contraseña debe tener al menos 8 caracteres'],
    [!caracteres.some(esMayuscula), 'Debe incluir al menos una letra mayúscula'],
    [!caracteres.some(esMinuscula), 'Debe incluir al menos una letra minúscula'],
    [!caracteres.some(esDigito), 'Debe incluir al menos un número'],
    [
      !caracteres.some((c) => ESPECIALES.includes(c)),
      'Debe incluir al menos un carácter especial (!@#$%^&*()_+-=[]{}|;:\'",.<>?/)',
    ],
    [contieneDato(minusculas, (datos.nombre ?? '').trim()), 'La contraseña no puede contener tu nombre'],
    [contieneDato(minusculas, usuarioCorreo), 'La contraseña no puede contener tu email'],
    [contieneDato(minusculas, telefono), 'La contraseña no puede contener tu teléfono'],
    [
      contieneDato(minusculas, anio) || contieneDato(minusculas, dia),
      'La contraseña no puede contener tu fecha de nacimiento',
    ],
    [
      contieneDato(minusculas, (datos.respuesta ?? '').trim()),
      'La contraseña no puede contener la respuesta de tu pregunta de seguridad',
    ],
    [
      PATRONES_TECLADO.some((patron) => minusculas.includes(patron)),
      'La contraseña no puede seguir patrones simples de teclado',
    ],
    [consecutivos.letras, 'La contraseña no puede contener letras consecutivas'],
    [consecutivos.numeros, 'La contraseña no puede contener números consecutivos'],
    [consecutivos.repetidos, 'La contraseña no puede tener el mismo carácter repetido 3 o más veces'],
    [clave.length > 0 && caracteres.every(esDigito), 'La contraseña no puede contener solo números'],
    [clave.length > 0 && caracteres.every(esLetraAscii), 'La contraseña no puede contener solo letras'],
    [
      CLAVES_COMUNES.some((comun) => minusculas.includes(comun)),
      'Esta contraseña es muy común, elige otra más segura',
    ],
  ];
  const fallida = reglas.find(([falla]) => falla);
  return fallida ? fallida[1] : null;
}

export interface RequisitoClave {
  id: 'largo' | 'mayuscula' | 'minuscula' | 'numero' | 'especial';
  etiqueta: string;
  cumplido: boolean;
}

/**
 * Los requisitos básicos de problemaDeClave, uno por uno, para mostrarlos mientras se escribe.
 * Usan las mismas comprobaciones: no son reglas nuevas.
 */
export function requisitosDeClave(clave: string): RequisitoClave[] {
  const caracteres = clave.split('');
  return [
    { id: 'largo', etiqueta: 'Al menos 8 caracteres', cumplido: clave.length >= LARGO_MINIMO_CLAVE },
    { id: 'mayuscula', etiqueta: 'Una letra mayúscula', cumplido: caracteres.some(esMayuscula) },
    { id: 'minuscula', etiqueta: 'Una letra minúscula', cumplido: caracteres.some(esMinuscula) },
    { id: 'numero', etiqueta: 'Un número', cumplido: caracteres.some(esDigito) },
    {
      id: 'especial',
      etiqueta: 'Un carácter especial',
      cumplido: caracteres.some((c) => ESPECIALES.includes(c)),
    },
  ];
}

export const AVISO_DATOS_PERSONALES_CLAVE =
  'No incluyas tu nombre, tu correo, tu teléfono, tu año de nacimiento ni tu respuesta de seguridad.';

/**
 * Página del sitio web (EXPO_PUBLIC_WEB_URL más la ruta), o null si no está configurado o no usa
 * https (en desarrollo se permite http).
 */
function urlDelSitio(ruta: string): string | null {
  const base = process.env.EXPO_PUBLIC_WEB_URL?.trim();
  if (!base || !esUrlPermitida(base)) {
    return null;
  }
  let fin = base.length;
  while (fin > 0 && base[fin - 1] === '/') {
    fin--;
  }
  return `${base.slice(0, fin)}${ruta}`;
}

/** Aviso de privacidad en el sitio web. */
export function urlAvisoPrivacidad(): string | null {
  return urlDelSitio('/aviso-de-privacidad');
}

/** Términos y condiciones en el sitio web. */
export function urlTerminos(): string | null {
  return urlDelSitio('/terminos-y-condiciones');
}

/** Recuperación de contraseña en el sitio web (para quien no recuerda la actual). */
export function urlOlvidoContrasena(): string | null {
  return urlDelSitio('/forgot-password');
}

export function problemaDeNombre(nombre: string): string | null {
  if (!nombre.trim()) {
    return 'El nombre completo es requerido';
  }
  if (tieneFragmentosPeligrosos(nombre)) {
    return 'El nombre no puede contener caracteres especiales peligrosos';
  }
  return nombre.trim().length >= LARGO_MINIMO_TEXTO ? null : 'El nombre debe tener al menos 2 caracteres';
}

export function problemaDeRespuesta(respuesta: string): string | null {
  if (!respuesta.trim()) {
    return 'La respuesta a la pregunta de seguridad es requerida';
  }
  if (tieneFragmentosPeligrosos(respuesta)) {
    return 'La respuesta no puede contener caracteres especiales peligrosos';
  }
  return respuesta.trim().length >= LARGO_MINIMO_TEXTO
    ? null
    : 'La respuesta debe tener al menos 2 caracteres';
}

// ── Perfil capilar (paso 2): reglas copiadas de la web (Register.tsx y consentimientoDatosSensibles) ──

/** Code estable del 400 cuando llegan alergias sin consienteDatosSensibles (consentimiento-datos-sensibles.ts). */
export const CODIGO_CONSENTIMIENTO_SALUD = 'CONSENTIMIENTO_SALUD_REQUERIDO';

/** El backend pidió el consentimiento de datos de salud: se reconoce solo por su code. */
export function esConsentimientoSaludRequerido(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && error.code === CODIGO_CONSENTIMIENTO_SALUD;
}

export const ERROR_CONSENTIMIENTO_SALUD =
  'Para guardar tus alergias, marca la autorización para usar tus datos de salud.';

export function problemaDeTieneAlergias(tieneAlergias: boolean | null): string | null {
  return tieneAlergias === null ? 'Debes indicar si tienes alergias a productos' : null;
}

export function problemaDeAlergias(tieneAlergias: boolean | null, alergias: string): string | null {
  if (tieneAlergias !== true) {
    return null;
  }
  if (!alergias.trim()) {
    return 'Especifica tus alergias';
  }
  return tieneFragmentosPeligrosos(alergias)
    ? 'Las alergias no pueden contener caracteres especiales peligrosos'
    : null;
}

/** Con texto de alergias, el backend exige consienteDatosSensibles: true. */
export function requiereConsentimiento(tieneAlergias: boolean | null, alergias: string): boolean {
  return tieneAlergias === true && alergias.trim() !== '';
}

export function problemaDeConsentimiento(
  tieneAlergias: boolean | null,
  alergias: string,
  consiente: boolean,
): string | null {
  return requiereConsentimiento(tieneAlergias, alergias) && !consiente ? ERROR_CONSENTIMIENTO_SALUD : null;
}

export function problemaDeTieneTratamientos(tratamientosQuimicos: boolean | null): string | null {
  return tratamientosQuimicos === null
    ? 'Debes indicar si has tenido tratamientos químicos previos'
    : null;
}

export function problemaDeTratamientos(
  tratamientosQuimicos: boolean | null,
  tratamientos: string,
): string | null {
  if (tratamientosQuimicos !== true) {
    return null;
  }
  if (!tratamientos.trim()) {
    return 'Especifica los tratamientos';
  }
  return tieneFragmentosPeligrosos(tratamientos)
    ? 'Los tratamientos no pueden contener caracteres especiales peligrosos'
    : null;
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * DD/MM/AAAA → AAAA-MM-DD si es una fecha real, no futura y de una persona mayor de edad
 * (la web exige 18 años). Devuelve el problema si no lo es.
 */
export function convertirFechaNacimiento(
  texto: string,
  hoy: Date = new Date(),
): { fecha: string } | { problema: string } {
  if (!texto) {
    return { problema: 'La fecha de nacimiento es requerida' };
  }
  const partes = texto.split('/');
  if (partes.length !== 3 || partes[0].length !== 2 || partes[1].length !== 2 || partes[2].length !== 4) {
    return { problema: 'Escribe la fecha como DD/MM/AAAA' };
  }
  const [dia, mes, anio] = partes.map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const real =
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
  if (!real) {
    return { problema: 'Escribe una fecha que exista' };
  }
  const iso = `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
  const hoyIso = `${hoy.getFullYear()}-${dosDigitos(hoy.getMonth() + 1)}-${dosDigitos(hoy.getDate())}`;
  if (iso > hoyIso) {
    return { problema: 'La fecha de nacimiento no puede ser futura' };
  }
  const anioLimite = hoy.getFullYear() - EDAD_MINIMA;
  const ultimoDelMes = new Date(Date.UTC(anioLimite, hoy.getMonth() + 1, 0)).getUTCDate();
  const limite = `${anioLimite}-${dosDigitos(hoy.getMonth() + 1)}-${dosDigitos(Math.min(hoy.getDate(), ultimoDelMes))}`;
  if (iso > limite) {
    return { problema: 'Debes ser mayor de 18 años' };
  }
  return { fecha: iso };
}
