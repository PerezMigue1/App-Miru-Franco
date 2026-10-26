/// <reference types="jest" />

import { respuesta } from './servidorSimulado';

/**
 * Datos ficticios de Perfil > Mi cuenta (GP-09): revisiones, respuestas de la baja y errores con la
 * forma del filtro global del backend (CONTRATO_APP_CUENTA.md). Nunca datos reales.
 */

export const RUTA_REVISION = '/api/auth/me/cuenta/revision';
export const RUTA_CODIGO_CUENTA = '/api/auth/me/cuenta/codigo';
export const RUTA_DESACTIVAR = '/api/auth/me/desactivar';
export const RUTA_ELIMINAR = '/api/auth/me';

export const CLAVE_FICTICIA = 'ClaveFicticia1!';
export const CODIGO_FICTICIO = '123456';
export const FOLIO_FICTICIO = 'ARCO-2026-000123';
export const MENSAJE_DESACTIVADA = 'Desactivamos tu cuenta y cerramos tus sesiones. Para volver, reactívala.';
export const MENSAJE_ELIMINADA = `Eliminamos tu cuenta. Te enviamos la confirmación con el folio ${FOLIO_FICTICIO} a tu correo.`;

export const SE_CANCELA_CITA = {
  tipo: 'cita_se_cancela',
  entidad: 'cita',
  id: 128,
  mensaje: 'Tu cita de Corte del 28 oct 2026, 11:00.',
  enlace: '/cliente/servicios-citas/mis-citas',
};
export const SE_CANCELA_PEDIDO = {
  tipo: 'pedido_se_cancela',
  entidad: 'pedido',
  id: 57,
  mensaje: 'Tu pedido #57 sin pagar.',
  enlace: '/cliente/tienda-online/mis-pedidos',
};
export const BLOQUEO_CITA = {
  tipo: 'cita_con_anticipo',
  entidad: 'cita',
  id: 130,
  mensaje: 'Tu cita de Tinte del 30 oct 2026 tiene un anticipo pagado.',
  enlace: '/cliente/servicios-citas/mis-citas',
};
export const BLOQUEO_PEDIDO = {
  tipo: 'pedido_en_proceso',
  entidad: 'pedido',
  id: 58,
  mensaje: 'Tu pedido #58 está listo para recoger.',
  enlace: '/cliente/tienda-online/mis-pedidos',
};
/** Bloqueo sin entidad ni texto: cuenta igual, pero no abre nada. */
export const BLOQUEO_SIN_DATOS = { tipo: 'pago_sin_confirmar', entidad: null, id: null, mensaje: '' };

interface OpcionesRevision {
  metodo?: 'password' | 'codigo';
  seResuelveSolo?: unknown[];
  bloqueos?: unknown[];
  puedeContinuar?: boolean;
}

/** 200 de GET /api/auth/me/cuenta/revision. */
export function respuestaRevision({
  metodo = 'password',
  seResuelveSolo = [],
  bloqueos = [],
  puedeContinuar,
}: OpcionesRevision = {}): Response {
  return respuesta({
    success: true,
    data: {
      metodoConfirmacion: metodo,
      seResuelveSolo,
      bloqueos,
      puedeContinuar: puedeContinuar ?? bloqueos.length === 0,
    },
  });
}

/** 200 de la baja: desactivar sin folio, eliminar con folio. */
export function respuestaBaja(message: string | null, folio: string | null = null): Response {
  return respuesta({
    success: true,
    ...(message ? { message } : {}),
    data: { ...(folio ? { folio } : {}), cancelaciones: [], correoEnviado: true },
  });
}

/** Nombre HTTP que el filtro global pone en `error`. */
const NOMBRES_HTTP: Record<number, string> = {
  400: 'Bad Request',
  403: 'Forbidden',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
};

/** Error del backend con la forma del filtro global. */
export function errorCuenta(
  status: number,
  code?: string,
  message = 'Mensaje ficticio del servidor.',
  extra: Record<string, unknown> = {},
): Response {
  return respuesta(
    { success: false, statusCode: status, error: NOMBRES_HTTP[status] ?? 'Error', message, ...(code ? { code } : {}), ...extra },
    status,
  );
}

/** Los 8 400 de la confirmación, con su mensaje ficticio para la clienta. */
export const ERRORES_PASSWORD: [string, string][] = [
  ['PASSWORD_REQUERIDA', 'Escribe tu contraseña actual para confirmar.'],
  ['PASSWORD_INCORRECTA', 'La contraseña no es correcta.'],
];
export const ERRORES_CODIGO: [string, string][] = [
  ['CODIGO_REQUERIDO', 'Escribe el código que te enviamos.'],
  ['SIN_CODIGO', 'No tienes un código vigente. Pide uno.'],
  ['CODIGO_INCORRECTO', 'El código no es correcto. Te quedan 4 intentos.'],
  ['CODIGO_VENCIDO', 'El código venció. Pide uno nuevo.'],
  ['INTENTOS_AGOTADOS', 'Ya usaste los 5 intentos. Pide un código nuevo.'],
  ['CODIGO_INVALIDO', 'El código ya se usó. Pide uno nuevo.'],
];
