import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';

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
}

/** POST /api/auth/refresh → 200 (en modo Bearer no trae renovarEnSegundos). */
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
  { valor: 'liso', etiqueta: 'Liso' },
  { valor: 'ondulado', etiqueta: 'Ondulado' },
  { valor: 'rizado', etiqueta: 'Rizado' },
];

/** POST /api/usuarios/registro. */
export interface DatosRegistro {
  nombre: string;
  email: string;
  telefono: string;
  password: string;
  /** AAAA-MM-DD. */
  fechaNacimiento: string;
  preguntaSeguridad: { pregunta: string; respuesta: string };
  perfilCapilar: { tipoCabello: TipoCabello };
  aceptaAvisoPrivacidad: true;
}

/** Respuesta genérica { success, message } de registro, OTP, reenvío y recuperación. */
export interface RespuestaSimple {
  success?: boolean;
  message?: string;
}

/** El inicio de sesión fue correcto, pero la cuenta no es de clienta. */
export class ErrorRolNoPermitido extends Error {
  constructor() {
    super('Esta app es para clientas. Usa el sitio web');
    this.name = 'ErrorRolNoPermitido';
  }
}

// ── Mensajes de error ──────────────────────────────────────────────────────────────────────

export const MENSAJE_SIN_CONEXION = 'Sin conexión. Revisa tu internet e intenta de nuevo';
export const MENSAJE_DEMASIADOS_INTENTOS = 'Demasiados intentos, espera un minuto';

export function esErrorDeRed(error: unknown): boolean {
  return error instanceof ErrorDeRed;
}

export function estadoHttp(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}

/** 403 del login cuando la cuenta todavía no se activa con el código del correo. */
export function esCuentaSinActivar(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 403) {
    return false;
  }
  const mensaje = error.message.toLowerCase();
  return mensaje.includes('no está activada') || mensaje.includes('activar tu cuenta');
}

/** Mensaje del servidor si lo hay; si no, el genérico indicado. */
export function mensajeDelServidor(error: unknown, generico: string): string {
  return error instanceof ApiError && error.message ? error.message : generico;
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
const PATRONES_TECLADO = ['qwerty', 'asdfgh', 'zxcvbn', '123456', '654321'];
const CLAVES_COMUNES = [
  'password', 'password123', '12345678', '123456789', '1234567890',
  'qwerty', 'qwerty123', 'abc123', 'monkey', '1234567',
  'letmein', 'trustno1', 'dragon', 'baseball', 'iloveyou',
  'master', 'sunshine', 'ashley', 'bailey', 'passw0rd',
  'shadow', '123123', '654321', 'superman', 'qazwsx',
  'michael', 'football', 'welcome', 'jesus', 'ninja',
  'mustang', 'password1', '123qwe', 'admin', 'root',
];
const FRAGMENTOS_PELIGROSOS = [
  '<script', '</script>', '<iframe', '<img', 'onerror', 'onload', 'onclick', 'onmouseover',
  'javascript:', '<svg', '<style', '<link', '<meta', '<object', '<embed',
];

function esDigito(c: string): boolean {
  return c >= '0' && c <= '9';
}

function esMayuscula(c: string): boolean {
  return c !== c.toLowerCase() && c === c.toUpperCase();
}

function esMinuscula(c: string): boolean {
  return c !== c.toUpperCase() && c === c.toLowerCase();
}

function esLetraAscii(c: string): boolean {
  const minuscula = c.toLowerCase();
  return minuscula >= 'a' && minuscula <= 'z';
}

export function soloDigitos(texto: string): string {
  return texto
    .split('')
    .filter(esDigito)
    .join('');
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

/** Teléfono de México (web: 10 dígitos, el primero distinto de 0, sin +52). */
export function normalizarTelefono(telefono: string): string {
  return soloDigitos(telefono).slice(0, LARGO_TELEFONO);
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
    if (esDigito(a) && esDigito(b) && esDigito(c)) {
      const sube = cb === ca + 1 && cc === cb + 1;
      const baja = cb === ca - 1 && cc === cb - 1;
      if (sube || baja) {
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
    [CLAVES_COMUNES.includes(minusculas), 'Esta contraseña es muy común, elige otra más segura'],
  ];
  const fallida = reglas.find(([falla]) => falla);
  return fallida ? fallida[1] : null;
}

/** Enlace al aviso de privacidad en el sitio web (EXPO_PUBLIC_WEB_URL), o null si no está configurado. */
export function urlAvisoPrivacidad(): string | null {
  const base = process.env.EXPO_PUBLIC_WEB_URL;
  if (!base) {
    return null;
  }
  let fin = base.length;
  while (fin > 0 && base[fin - 1] === '/') {
    fin--;
  }
  return `${base.slice(0, fin)}/aviso-de-privacidad`;
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
