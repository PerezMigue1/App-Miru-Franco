import { apiGet, apiPost, renovarSesion, type ResultadoRenovacion } from '@/shared/api/apiClient';

import type {
  DatosRegistro,
  PreguntaSeguridad,
  RespuestaLogin,
  RespuestaPerfil,
  RespuestaPreguntas,
  RespuestaSimple,
  UsuarioSesion,
} from './AuthModel';

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

/** POST /api/auth/login. Público: su 401 no dispara renovación. */
export function iniciarSesion(email: string, password: string): Promise<RespuestaLogin> {
  return apiPost<RespuestaLogin>('/api/auth/login', { email, password }, { publica: true });
}

/** POST /api/auth/refresh. Una sola renovación a la vez (la coordina apiClient). */
export function renovarToken(): Promise<ResultadoRenovacion> {
  return renovarSesion();
}

/** POST /api/auth/logout con el token indicado; su 401 no renueva ni cierra la sesión. */
export function cerrarSesionServidor(token: string): Promise<RespuestaSimple> {
  return apiPost<RespuestaSimple>('/api/auth/logout', { logoutAll: false }, { token });
}

/** GET /api/auth/me. */
export function obtenerPerfil(): Promise<RespuestaPerfil> {
  return apiGet<RespuestaPerfil>('/api/auth/me');
}

/** GET /api/pregunta-seguridad (público). */
export function obtenerPreguntasSeguridad(): Promise<PreguntaSeguridad[]> {
  return apiGet<RespuestaPreguntas>('/api/pregunta-seguridad', { publica: true }).then((respuesta) =>
    Array.isArray(respuesta?.data) ? respuesta.data : [],
  );
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
