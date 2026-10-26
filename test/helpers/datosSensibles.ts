/// <reference types="jest" />

import { respuesta } from './servidorSimulado';

/**
 * Autorización de datos sensibles ficticia (GP-09) con la forma de DatosSensiblesService del
 * backend. El texto y el hash son inventados (el hash es una letra repetida 64 veces).
 */

export const RUTA_TEXTO_SENSIBLES = '/api/consentimientos/datos-sensibles/texto';
export const RUTA_SENSIBLES = '/api/consentimientos/datos-sensibles';
export const RUTA_RETIRAR_SENSIBLES = '/api/consentimientos/datos-sensibles/retirar';

export const HASH_SENSIBLES = 'e'.repeat(64);
export const PARRAFO_1 = 'Autorizo de forma expresa al salón ficticio a tratar mis alergias.';
export const PARRAFO_2 = 'Solo las verá el personal que me atiende.';
export const TEXTO_SENSIBLES = `${PARRAFO_1}\n\n${PARRAFO_2}`;

/** 200 de GET .../datos-sensibles/texto. */
export function respuestaTextoSensibles(cambios: Record<string, unknown> = {}): Response {
  return respuesta({ success: true, data: { version: '1.0', hash: HASH_SENSIBLES, texto: TEXTO_SENSIBLES, ...cambios } });
}

/** 200 de GET .../datos-sensibles (estado de la titular). */
export function respuestaEstadoSensibles(autorizado: boolean, pendiente = false): Response {
  return respuesta({
    success: true,
    data: {
      autorizado,
      pendiente,
      desde: autorizado ? '2026-10-20T15:00:00.000Z' : null,
      version: '1.0',
      hash: HASH_SENSIBLES,
    },
  });
}

/** 201 de POST .../datos-sensibles. */
export function respuestaAutorizada(): Response {
  return respuesta({ success: true, data: { id: '9', tipo: 'datos_sensibles', accion: 'aceptado' } }, 201);
}

/** 200 de POST .../retirar, con el message del backend (la app no lo muestra). */
export function respuestaRetirada(): Response {
  return respuesta({
    success: true,
    data: { id: '10', tipo: 'datos_sensibles', accion: 'revocado' },
    message: 'Retiraste tu autorización: tus alergias dejan de mostrarse desde ahora.',
  });
}

/** 400 del backend cuando el texto de la autorización cambió. */
export function textoCambio400(): Response {
  return respuesta(
    { success: false, statusCode: 400, error: 'Bad Request', message: 'El texto de la autorización cambió. Vuelve a leerlo y autoriza otra vez.' },
    400,
  );
}
