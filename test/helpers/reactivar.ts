/// <reference types="jest" />

import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { respuesta } from './servidorSimulado';

/**
 * GP-09, bloque C: piezas comunes de las pruebas de "Reactivar mi cuenta" (rutas, respuestas
 * ficticias del backend y textos del catálogo). Todo en http://api.test con datos ficticios; nada sale
 * a la red.
 */

export const RUTA_SOLICITAR = '/api/auth/reactivar/solicitar';
export const RUTA_CONFIRMAR = '/api/auth/reactivar/confirmar';

/** Respuesta neutra del backend: la misma exista o no la cuenta (CONTRATO_APP_CUENTA.md). */
export const NEUTRO_SOLICITAR =
  'Si tu cuenta está desactivada, te enviamos un código. Revisa tu correo, también la carpeta de spam.';
/** Texto del 200 de confirmar. */
export const LISTO_SERVIDOR = 'Tu cuenta está activa otra vez. Ya puedes iniciar sesión.';
/** Mensaje neutro del 400 CODIGO_INVALIDO (ficticio, como lo escribe el backend). */
export const CODIGO_INVALIDO_SERVIDOR = 'El código no es válido o ya venció. Pide uno nuevo.';
/** Texto del 403 CUENTA_DESACTIVADA del login (ficticio). */
export const DESACTIVADA_SERVIDOR = 'Desactivaste tu cuenta. Si quieres volver, reactívala desde el inicio de sesión.';

/** Textos del catálogo (respaldo de la app) que se ven en las pantallas. */
export const TEXTO = {
  desactivada: RESPALDO_TEXTOS['cuenta.login.desactivada'],
  boton: RESPALDO_TEXTOS['cuenta.reactivar.boton'],
  enlace: RESPALDO_TEXTOS['cuenta.reactivar.enlaceGoogle'],
  explicacion: RESPALDO_TEXTOS['cuenta.reactivar.explicacion'],
  enviado: RESPALDO_TEXTOS['cuenta.reactivar.enviado'],
  listo: RESPALDO_TEXTOS['cuenta.reactivar.listo'],
  titulo: RESPALDO_TEXTOS['cuenta.app.reactivarTitulo'],
  etiquetaCorreo: RESPALDO_TEXTOS['cuenta.app.etiquetaCorreo'],
  etiquetaCodigo: RESPALDO_TEXTOS['cuenta.app.etiquetaCodigo'],
  pedirCodigo: RESPALDO_TEXTOS['cuenta.app.pedirCodigo'],
  pidiendoCodigo: RESPALDO_TEXTOS['cuenta.app.pidiendoCodigo'],
  otroCodigo: RESPALDO_TEXTOS['cuenta.app.otroCodigo'],
  reactivar: RESPALDO_TEXTOS['cuenta.app.reactivar'],
  reactivando: RESPALDO_TEXTOS['cuenta.app.reactivando'],
  cambiarCorreo: RESPALDO_TEXTOS['cuenta.app.cambiarCorreo'],
  volver: RESPALDO_TEXTOS['cuenta.app.volverAcceso'],
  errorReactivar: RESPALDO_TEXTOS['cuenta.app.errorReactivar'],
  errorCodigo: RESPALDO_TEXTOS['cuenta.app.errorCodigo'],
  codigoRequerido: RESPALDO_TEXTOS['cuenta.app.error.codigoRequerido'],
} as const;

/** "Paso 1 de 2: Correo electrónico" o "Paso 2 de 2: Código de 6 dígitos". */
export function textoPaso(numero: 1 | 2): string {
  const paso = numero === 1 ? TEXTO.etiquetaCorreo : TEXTO.etiquetaCodigo;
  return RESPALDO_TEXTOS['cuenta.app.paso']
    .replace('{numero}', String(numero))
    .replace('{total}', '2')
    .replace('{paso}', paso);
}

/** "Pide otro código en N s". */
export function textoOtroCodigoEn(segundos: number): string {
  return RESPALDO_TEXTOS['cuenta.app.otroCodigoEn'].replace('{segundos}', String(segundos));
}

/** "Intenta de nuevo en N s" (espera por límite). */
export function textoEsperaLimite(segundos: number): string {
  return RESPALDO_TEXTOS['errores.esperaLimite'].replace('{segundos}', String(segundos));
}

/** 403 del login de una cuenta que desactivó su titular (solo con la contraseña correcta). */
export function cuentaDesactivada(): Response {
  return respuesta({ success: false, statusCode: 403, error: 'Forbidden', message: DESACTIVADA_SERVIDOR, code: 'CUENTA_DESACTIVADA' }, 403);
}

/** 200 neutro de POST /api/auth/reactivar/solicitar. */
export function solicitudNeutra(): Response {
  return respuesta({ success: true, message: NEUTRO_SOLICITAR });
}

/** 200 de POST /api/auth/reactivar/confirmar. */
export function reactivacionLista(): Response {
  return respuesta({ success: true, message: LISTO_SERVIDOR });
}

/** 400 CODIGO_INVALIDO de confirmar, con el mensaje neutro del backend. */
export function codigoInvalido(message: string = CODIGO_INVALIDO_SERVIDOR): Response {
  return respuesta({ success: false, statusCode: 400, error: 'Bad Request', message, code: 'CODIGO_INVALIDO' }, 400);
}
