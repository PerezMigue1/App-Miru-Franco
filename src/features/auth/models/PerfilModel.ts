import { telefonoSinLada } from '@/shared/ui/digitos';

import { normalizarTelefono, type TipoCabello } from './AuthModel';

/** Perfil completo de la clienta (GET /api/auth/me). Las alergias son datos de salud: solo en memoria. */
export interface PerfilCuenta {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  /** AAAA-MM-DD, o vacío. */
  fechaNacimiento: string;
  tipoCabello: TipoCabello | null;
  colorNatural: string;
  colorActual: string;
  productosUsados: string;
  alergias: string;
  /** null: /me no trae la respuesta (la clienta aún no la ha dado). */
  tratamientosQuimicos: boolean | null;
  tratamientos: string;
  recibePromociones: boolean;
  foto: string | null;
  /** false: la cuenta entra con Google y no tiene contraseña. */
  tienePassword: boolean;
}

/** Cuerpo de PATCH /api/auth/me: solo lo que cambió; null vacía un dato opcional. */
export interface CambiosPerfil {
  nombre?: string;
  telefono?: string | null;
  fechaNacimiento?: string | null;
  tipoCabello?: TipoCabello;
  colorNatural?: string | null;
  colorActual?: string | null;
  productosUsados?: string | null;
  alergias?: string | null;
  /** Con false, el backend guarda tratamientos en null. */
  tratamientosQuimicos?: boolean;
  /** Solo con tratamientosQuimicos en true (hasta 1000 caracteres). */
  tratamientos?: string;
  recibePromociones?: boolean;
  /** Obligatorio (true) si se envían alergias con texto; el backend no lo guarda. */
  consienteDatosSensibles?: true;
}

/** Valores del formulario de Editar perfil, tal como se escriben (fecha DD/MM/AAAA). */
export interface FormularioPerfil {
  nombre: string;
  telefono: string;
  nacimiento: string;
  tipoCabello: TipoCabello | null;
  colorNatural: string;
  colorActual: string;
  productosUsados: string;
  alergias: string;
  tratamientosQuimicos: boolean | null;
  tratamientos: string;
  recibePromociones: boolean;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : null;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function tipoCabelloDe(valor: unknown): TipoCabello | null {
  const t = texto(valor).trim().toLowerCase();
  if (t === 'lacio' || t === 'liso') {
    return 'liso';
  }
  return t === 'ondulado' || t === 'rizado' ? t : null;
}

function siNoDe(valor: unknown): boolean | null {
  return typeof valor === 'boolean' ? valor : null;
}

/** Busca un dato capilar plano (como lo lee la web) o dentro de perfilCapilar. */
function capilar(usuario: Record<string, unknown>, campo: string): unknown {
  const anidado = objeto(usuario.perfilCapilar);
  return usuario[campo] ?? anidado?.[campo];
}

/**
 * Perfil a partir de la respuesta de /me ({ data }, { user } o { usuario }). Lee los datos
 * capilares planos o dentro de perfilCapilar; si no vienen, quedan vacíos.
 */
export function normalizarPerfil(respuesta: unknown): PerfilCuenta | null {
  const raiz = objeto(respuesta);
  const usuario = objeto(raiz?.data) ?? objeto(raiz?.user) ?? objeto(raiz?.usuario) ?? raiz;
  if (!usuario) {
    return null;
  }
  const id = usuario.id ?? usuario._id;
  const email = texto(usuario.email);
  if ((typeof id !== 'string' && typeof id !== 'number') || !email) {
    return null;
  }
  const foto = texto(usuario.foto).trim();
  return {
    id: String(id),
    nombre: texto(usuario.nombre),
    email,
    telefono: texto(usuario.telefono),
    fechaNacimiento: texto(usuario.fechaNacimiento).slice(0, 10),
    tipoCabello: tipoCabelloDe(capilar(usuario, 'tipoCabello')),
    colorNatural: texto(capilar(usuario, 'colorNatural')),
    colorActual: texto(capilar(usuario, 'colorActual')),
    productosUsados: texto(capilar(usuario, 'productosUsados')),
    alergias: texto(capilar(usuario, 'alergias')),
    tratamientosQuimicos: siNoDe(capilar(usuario, 'tratamientosQuimicos')),
    tratamientos: texto(capilar(usuario, 'tratamientos')),
    recibePromociones: usuario.recibePromociones === true,
    foto: foto || null,
    // Sin el dato, se asume que tiene contraseña (no se bloquea el cambio).
    tienePassword: usuario.tienePassword !== false,
  };
}

/** AAAA-MM-DD → DD/MM/AAAA para el campo de fecha. */
export function fechaParaFormulario(iso: string): string {
  const [anio, mes, dia] = iso.split('-');
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : '';
}

/** Teléfono guardado tal como lo compara y lo muestra el formulario: sin lada, 10 dígitos. */
function telefonoNormalizado(telefono: string): string | null {
  return telefono.trim() ? normalizarTelefono(telefonoSinLada(telefono)) : null;
}

export function formularioDesdePerfil(perfil: PerfilCuenta): FormularioPerfil {
  return {
    nombre: perfil.nombre,
    telefono: telefonoNormalizado(perfil.telefono) ?? '',
    nacimiento: fechaParaFormulario(perfil.fechaNacimiento),
    tipoCabello: perfil.tipoCabello,
    colorNatural: perfil.colorNatural,
    colorActual: perfil.colorActual,
    productosUsados: perfil.productosUsados,
    alergias: perfil.alergias,
    tratamientosQuimicos: perfil.tratamientosQuimicos,
    tratamientos: perfil.tratamientos,
    recibePromociones: perfil.recibePromociones,
  };
}

function opcional(valor: string): string | null {
  const recortado = valor.trim();
  return recortado || null;
}

/**
 * Tratamientos químicos que cambiaron. "No" se envía sin texto; al pasar a Sí va con el texto recortado;
 * si sigue en Sí, solo el texto cuando cambió. Sin respuesta en /me y sin tocar, no se envía nada.
 */
export function cambiosDeTratamientos(
  perfil: PerfilCuenta,
  formulario: FormularioPerfil,
): Pick<CambiosPerfil, 'tratamientosQuimicos' | 'tratamientos'> {
  const { tratamientosQuimicos } = formulario;
  if (tratamientosQuimicos === null) {
    return {};
  }
  const cambio = tratamientosQuimicos !== perfil.tratamientosQuimicos;
  if (!tratamientosQuimicos) {
    return cambio ? { tratamientosQuimicos: false } : {};
  }
  const tratamientos = formulario.tratamientos.trim();
  if (cambio) {
    return { tratamientosQuimicos: true, tratamientos };
  }
  return tratamientos === perfil.tratamientos.trim() ? {} : { tratamientos };
}

/**
 * Solo lo que cambió respecto al perfil cargado. Teléfono sin lada y a 10 dígitos, fecha en
 * AAAA-MM-DD (ya validada), opcionales vacíos como null, tratamientos como en
 * cambiosDeTratamientos y el consentimiento solo si se envían alergias con texto.
 */
export function cambiosDelPerfil(
  perfil: PerfilCuenta,
  formulario: FormularioPerfil,
  fechaIso: string | null,
): CambiosPerfil {
  const cambios: CambiosPerfil = {};
  const nombre = formulario.nombre.trim();
  if (nombre !== perfil.nombre.trim()) {
    cambios.nombre = nombre;
  }
  const telefono = telefonoNormalizado(formulario.telefono);
  if (telefono !== telefonoNormalizado(perfil.telefono)) {
    cambios.telefono = telefono;
  }
  if (fechaIso !== opcional(perfil.fechaNacimiento)) {
    cambios.fechaNacimiento = fechaIso;
  }
  if (formulario.tipoCabello && formulario.tipoCabello !== perfil.tipoCabello) {
    cambios.tipoCabello = formulario.tipoCabello;
  }
  const textos = ['colorNatural', 'colorActual', 'productosUsados', 'alergias'] as const;
  for (const campo of textos) {
    const nuevo = opcional(formulario[campo]);
    if (nuevo !== opcional(perfil[campo])) {
      cambios[campo] = nuevo;
    }
  }
  Object.assign(cambios, cambiosDeTratamientos(perfil, formulario));
  if (formulario.recibePromociones !== perfil.recibePromociones) {
    cambios.recibePromociones = formulario.recibePromociones;
  }
  if (cambios.alergias) {
    cambios.consienteDatosSensibles = true;
  }
  return cambios;
}

/** Las alergias cambiaron y traen texto: hace falta el consentimiento de datos de salud. */
export function requiereConsentimientoPerfil(perfil: PerfilCuenta, alergias: string): boolean {
  const nuevo = opcional(alergias);
  return nuevo !== null && nuevo !== opcional(perfil.alergias);
}

// ── Foto (CP-08 y CP-13) ─────────────────────────────────────────────────────────────────────

/** Lado máximo de la foto y tope de peso antes de subirla. */
export const LADO_MAXIMO_FOTO = 1024;
export const PESO_MAXIMO_FOTO = 5 * 1024 * 1024;
/** Calidad del JPEG: buena para un avatar y muy por debajo de 5 MB a 1024 px. */
export const CALIDAD_FOTO = 0.85;

export const MENSAJE_FOTO_PESADA = 'La foto pesa más de 5 MB aun después de reducirla. Elige otra.';
export const MENSAJE_SUBIDA_NO_DISPONIBLE = 'La subida de fotos no está disponible por ahora. Intenta más tarde.';
export const MENSAJE_ESPERA_UN_MOMENTO = 'Espera un momento antes de volver a intentarlo.';
export const MENSAJE_FOTO_NO_GUARDADA = 'No pudimos guardar la foto. Intenta con otra imagen.';
export const MENSAJE_FOTO_FALLIDA = 'No pudimos subir la foto. Intenta de nuevo.';
export const MENSAJE_QUITAR_FALLIDO = 'No pudimos quitar la foto. Intenta de nuevo.';

/** Firma de POST /api/auth/me/foto/firma, validada antes de usarla. */
export interface FirmaFoto {
  uploadUrl: string;
  /** api_key, signature y cada campo de params, como texto y tal como vinieron. */
  campos: Record<string, string>;
}

function empiezaCon(url: string, prefijo: string): boolean {
  return url.trim().toLowerCase().startsWith(prefijo);
}

/** Campos que params nunca debe traer: los pone la app o el contrato los prohíbe. */
const CAMPOS_RESERVADOS = new Set(['file', 'api_key', 'signature', 'cloud_name', 'resource_type']);

/**
 * La firma solo se usa si la subida va por https a la API de Cloudinary y trae todos los campos.
 * params se envía tal cual (texto, número o booleano); otro tipo invalida la firma.
 */
export function firmaDeRespuesta(respuesta: unknown): FirmaFoto | null {
  const datos = objeto(objeto(respuesta)?.data);
  const uploadUrl = texto(datos?.uploadUrl);
  const apiKey = datos?.apiKey;
  const signature = texto(datos?.signature);
  const params = objeto(datos?.params);
  if (!empiezaCon(uploadUrl, 'https://api.cloudinary.com/') || !signature || !params) {
    return null;
  }
  if (typeof apiKey !== 'string' && typeof apiKey !== 'number') {
    return null;
  }
  const campos: Record<string, string> = { api_key: String(apiKey), signature };
  for (const [nombre, valor] of Object.entries(params)) {
    if (CAMPOS_RESERVADOS.has(nombre)) {
      return null;
    }
    if (typeof valor !== 'string' && typeof valor !== 'number' && typeof valor !== 'boolean') {
      return null;
    }
    campos[nombre] = String(valor);
  }
  return { uploadUrl: uploadUrl.trim(), campos };
}

/** Solo fotos de Cloudinary por https (al guardarlas y al mostrarlas). */
export function esFotoCloudinary(url: string): boolean {
  return empiezaCon(url, 'https://res.cloudinary.com/');
}

/** secure_url de Cloudinary: solo https y del host res.cloudinary.com. */
export function urlDeFotoSubida(respuesta: unknown): string | null {
  const url = texto(objeto(respuesta)?.secure_url).trim();
  return esFotoCloudinary(url) ? url : null;
}
