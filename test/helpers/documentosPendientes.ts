/// <reference types="jest" />

import { respuesta } from './servidorSimulado';

/**
 * Documentos pendientes ficticios (GP-09) con la forma de ConsentimientosService.pendientes del
 * backend: { success, data: [{ tipo, documentoSlug, version, hash, vigenteDesde, versionAceptada }] }.
 * Versiones, fechas y hashes son inventados (el hash es una letra repetida 64 veces).
 */

export const RUTA_PENDIENTES = '/api/consentimientos/pendientes';
export const RUTA_CONSENTIMIENTOS = '/api/consentimientos';

export const HASH_AVISO = 'c'.repeat(64);
export const HASH_TERMINOS = 'd'.repeat(64);

/** Pendiente crudo del servidor: por omisión el Aviso de privacidad 2.1 (la clienta aceptó la 2.0). */
export function pendienteCrudo(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tipo: 'aviso_privacidad',
    documentoSlug: 'aviso-privacidad',
    version: '2.1',
    hash: HASH_AVISO,
    vigenteDesde: '2026-10-20',
    versionAceptada: '2.0',
    ...cambios,
  };
}

/** Términos 2.1 que la clienta nunca aceptó. */
export function pendienteTerminos(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return pendienteCrudo({
    tipo: 'terminos',
    documentoSlug: 'terminos',
    hash: HASH_TERMINOS,
    vigenteDesde: '2026-10-18',
    versionAceptada: null,
    ...cambios,
  });
}

/** 200 de GET /api/consentimientos/pendientes. */
export function respuestaPendientes(lista: unknown[]): Response {
  return respuesta({ success: true, data: lista });
}

/** 201 de POST /api/consentimientos con lo guardado. */
export function respuestaConsentimientoGuardado(): Response {
  return respuesta({ success: true, data: [{ id: '1', tipo: 'aviso_privacidad', accion: 'aceptado' }] }, 201);
}

/** 400 de POST /api/consentimientos: la versión ya no está publicada o su hash no coincide. */
export function versionNoPublicada400(): Response {
  return respuesta(
    {
      success: false,
      statusCode: 400,
      error: 'Bad Request',
      message: 'La versión 2.1 del documento "aviso-privacidad" no está publicada o su hash no coincide.',
    },
    400,
  );
}

/** Documento vigente crudo (GET /api/documentos-legales/:slug/vigente) de un slug cualquiera. */
export function vigenteCrudo(slug: string, titulo: string, ruta: string, cambios: Record<string, unknown> = {}) {
  return respuesta({
    success: true,
    data: {
      slug,
      titulo,
      ruta,
      version: '2.1',
      hash: HASH_AVISO,
      vigenteDesde: '2026-10-20',
      requiereAceptacion: true,
      html: '<main>Texto ficticio</main>',
      ...cambios,
    },
  });
}
