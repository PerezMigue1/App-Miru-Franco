import * as Device from 'expo-device';

import { accesoPorVencer, apiGet, apiPatch, apiPost, renovarSinGuardar } from '@/shared/api/apiClient';
import { subirMultipart } from '@/shared/api/subirMultipart';

import type {
  DatosRegistro,
  PreguntaSeguridad,
  RespuestaLogin,
  RespuestaPerfil,
  RespuestaPreguntas,
  RespuestaSimple,
  RespuestaVerificarCorreo,
  UsuarioSesion,
} from './AuthModel';
import type { CambiosPerfil, FirmaFoto } from './PerfilModel';

/** Normaliza el usuario del backend (el id puede llegar como número). */
export function normalizarUsuario(valor: unknown): UsuarioSesion | null {
  if (typeof valor !== 'object' || valor === null) {
    return null;
  }
  const { id, nombre, email, rol } = valor as Record<string, unknown>;
  const idTexto = typeof id === 'number' || typeof id === 'string' ? String(id) : '';
  if (!idTexto || typeof email !== 'string' || typeof rol !== 'string') {
    return null;
  }
  return { id: idTexto, nombre: typeof nombre === 'string' ? nombre : '', email, rol };
}

const LARGO_MAXIMO_DISPOSITIVO = 80;

/** Modelo del teléfono para que la clienta reconozca la sesión; undefined si no se conoce. */
export function nombreDispositivo(): string | undefined {
  const modelo = Device.modelName?.trim().slice(0, LARGO_MAXIMO_DISPOSITIVO);
  return modelo || undefined;
}

/**
 * POST /api/auth/login con canal "movil": para el rol cliente trae también un refreshToken.
 * Público: su 401 no dispara renovación.
 */
export function iniciarSesion(email: string, password: string): Promise<RespuestaLogin> {
  const dispositivo = nombreDispositivo();
  const cuerpo = dispositivo
    ? { email, password, canal: 'movil', dispositivo }
    : { email, password, canal: 'movil' };
  return apiPost<RespuestaLogin>('/api/auth/login', cuerpo, { publica: true });
}

/** Sesión que se revoca en el servidor (ya borrada o nunca guardada en el teléfono). */
export interface SesionARevocar {
  token: string;
  emitidoEn: number;
  refreshToken?: string;
}

/**
 * POST /api/auth/logout con el token indicado; su 401 no renueva ni cierra la sesión. Con
 * refreshToken revoca esa sesión móvil; como /logout rechaza un acceso vencido, si vence dentro del
 * margen antes se renueva solo en memoria (sin guardar nada).
 */
export async function cerrarSesionServidor(sesion: SesionARevocar): Promise<void> {
  if (!sesion.refreshToken) {
    await apiPost<RespuestaSimple>('/api/auth/logout', { logoutAll: false }, { token: sesion.token });
    return;
  }
  let { token, refreshToken } = sesion;
  if (accesoPorVencer(sesion)) {
    const nuevos = await renovarSinGuardar(refreshToken);
    if (!nuevos) {
      // El servidor ya no la reconoce o no respondió: no hay con qué revocarla.
      return;
    }
    ({ token, refreshToken } = nuevos);
  }
  await apiPost<RespuestaSimple>('/api/auth/logout', { logoutAll: false, refreshToken }, { token });
}

/** GET /api/auth/me. */
export function obtenerPerfil(): Promise<RespuestaPerfil> {
  return apiGet<RespuestaPerfil>('/api/auth/me');
}

/** GET /api/auth/me con el perfil completo (datos capilares y foto), sin normalizar. */
export function obtenerPerfilCompleto(): Promise<unknown> {
  return apiGet<unknown>('/api/auth/me');
}

/** PATCH /api/auth/me: solo los campos que cambiaron. */
export function actualizarPerfil(cambios: CambiosPerfil | { foto: string | null }): Promise<unknown> {
  return apiPatch<unknown>('/api/auth/me', cambios);
}

/** POST /api/auth/me/foto/firma (máximo 10 por minuto): firma de una hora para subir la foto. */
export function pedirFirmaFoto(): Promise<unknown> {
  return apiPost<unknown>('/api/auth/me/foto/firma');
}

/** Sube la foto a Cloudinary con la firma, sin token de la app. Devuelve la respuesta de Cloudinary. */
export function subirFoto(firma: FirmaFoto, archivoUri: string): Promise<unknown> {
  return subirMultipart(firma.uploadUrl, archivoUri, firma.campos);
}

/** Respuesta de POST /api/auth/me/password/codigo: nunca trae el código. */
export interface RespuestaCodigoContrasena extends RespuestaSimple {
  vigenciaMinutos?: number;
}

/**
 * POST /api/auth/me/password/codigo: verifica la contraseña actual y envía un código al correo.
 * Petición protegida normal: un 401 es una sesión vencida.
 */
export function pedirCodigoContrasena(actualPassword: string): Promise<RespuestaCodigoContrasena> {
  return apiPost<RespuestaCodigoContrasena>('/api/auth/me/password/codigo', { actualPassword });
}

/**
 * POST /api/auth/me/password: cambia la contraseña con el código. Al responder 200 el servidor
 * revoca todas las sesiones de la cuenta, incluida la de este teléfono.
 */
export function cambiarContrasenaConCodigo(
  actualPassword: string,
  nuevaPassword: string,
  codigo: string,
): Promise<RespuestaSimple> {
  return apiPost<RespuestaSimple>('/api/auth/me/password', { actualPassword, nuevaPassword, codigo });
}

/** GET /api/pregunta-seguridad (público). */
export function obtenerPreguntasSeguridad(): Promise<PreguntaSeguridad[]> {
  return apiGet<RespuestaPreguntas>('/api/pregunta-seguridad', { publica: true }).then((respuesta) =>
    Array.isArray(respuesta?.data) ? respuesta.data : [],
  );
}

/** POST /api/auth/verificar-correo (público): indica si el correo ya tiene cuenta. */
export function verificarCorreo(correo: string): Promise<RespuestaVerificarCorreo> {
  return apiPost<RespuestaVerificarCorreo>('/api/auth/verificar-correo', { correo }, { publica: true });
}

/** POST /api/usuarios/registro (público). Crea la cuenta sin activar y envía un código por correo. */
export function registrarUsuario(datos: DatosRegistro): Promise<RespuestaSimple> {
  return apiPost<RespuestaSimple>('/api/usuarios/registro', datos, { publica: true });
}

/** POST /api/auth/verificar-otp (público). */
export function verificarCodigo(email: string, codigo: string): Promise<RespuestaSimple> {
  return apiPost<RespuestaSimple>('/api/auth/verificar-otp', { email, codigo }, { publica: true });
}

/** POST /api/auth/reenviar-codigo (público, máximo 3 por minuto). */
export function reenviarCodigo(email: string): Promise<RespuestaSimple> {
  return apiPost<RespuestaSimple>('/api/auth/reenviar-codigo', { email }, { publica: true });
}

/** POST /api/auth/solicitar-enlace-recuperacion (público). */
export function solicitarEnlaceRecuperacion(email: string): Promise<RespuestaSimple> {
  return apiPost<RespuestaSimple>(
    '/api/auth/solicitar-enlace-recuperacion',
    { email },
    { publica: true },
  );
}
