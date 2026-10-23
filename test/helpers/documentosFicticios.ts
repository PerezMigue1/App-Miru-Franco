/// <reference types="jest" />

import type { DocumentoLegalVigente, SlugDocumentoLegal } from '@/shared/api/documentosLegales';

import { leerArchivo, sembrarArchivo } from './archivosLocales';
import { respuesta, type Manejador } from './servidorSimulado';

/**
 * Documentos legales ficticios de GP-07.4 (GET /api/documentos-legales/:slug/vigente) con la forma
 * de DocumentosLegalesService.vigente del backend: { success, data: { slug, titulo, ruta, version,
 * hash, vigenteDesde, requiereAceptacion, html } }. Versiones, fechas y hashes son inventados (el
 * hash es "a" o "b" repetida 64 veces). Los usan las pruebas del repositorio, del visor y de las
 * casillas.
 */

/** Hash ficticio de la versión vigente y de una versión guardada antes (64 hexadecimales). */
export const HASH_VIGENTE = 'a'.repeat(64);
export const HASH_GUARDADO = 'b'.repeat(64);

/** Nombre del archivo en Paths.document. */
export const ARCHIVO_DOCUMENTOS = 'documentos-legales.json';

/** Página completa de la web que trae el documento; la app nunca la guarda. */
export const HTML_FICTICIO = '<main><nav>Índice ficticio</nav><details><summary>Sección</summary>Texto ficticio</details></main>';

/** Base de la web en las pruebas (la fijan test/setup.ts y jest.config.js). */
export const WEB = 'http://web.test';

const RUTAS: Record<SlugDocumentoLegal, string> = {
  terminos: '/terminos-y-condiciones',
  'aviso-privacidad': '/aviso-de-privacidad',
  cookies: '/politica-de-cookies',
  reembolsos: '/politica-de-reembolsos',
  anticipos: '/politica-de-reembolsos#anticipos',
};

/** Ruta del documento vigente de un slug. */
export const rutaVigente = (slug: string) => `/api/documentos-legales/${slug}/vigente`;

/** Documento crudo del servidor (data), por omisión la Política de anticipos 2.3 del 14 de octubre de 2026. */
export function documentoCrudo(
  slug: SlugDocumentoLegal = 'anticipos',
  cambios: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    slug,
    titulo: `Documento ficticio ${slug}`,
    ruta: RUTAS[slug],
    version: '2.3',
    hash: HASH_VIGENTE,
    vigenteDesde: '2026-10-14',
    requiereAceptacion: true,
    html: HTML_FICTICIO,
    ...cambios,
  };
}

/** Lo que la app se queda de documentoCrudo(slug, cambios). */
export function documentoNormalizado(
  slug: SlugDocumentoLegal = 'anticipos',
  cambios: Partial<DocumentoLegalVigente> = {},
): DocumentoLegalVigente {
  return {
    slug,
    titulo: `Documento ficticio ${slug}`,
    ruta: RUTAS[slug],
    version: '2.3',
    hash: HASH_VIGENTE,
    vigenteDesde: '2026-10-14',
    requiereAceptacion: true,
    ...cambios,
  };
}

/** Versión guardada antes en el archivo: 2.2 del 1 de septiembre de 2026, distinta de la vigente. */
export const documentoGuardado = (slug: SlugDocumentoLegal = 'anticipos') =>
  documentoNormalizado(slug, { version: '2.2', hash: HASH_GUARDADO, vigenteDesde: '2026-09-01' });

/** Ruta del servidor simulado que responde el documento (o el cuerpo y status indicados). */
export function rutaDocumento(
  slug: SlugDocumentoLegal = 'anticipos',
  cuerpo: unknown = { success: true, data: documentoCrudo(slug) },
  status = 200,
): Record<string, Manejador> {
  return { [`GET ${rutaVigente(slug)}`]: () => respuesta(cuerpo, status) };
}

/** 404 del backend cuando el slug no tiene versión publicada. */
export const rutaSinVersion = (slug: SlugDocumentoLegal = 'anticipos') =>
  rutaDocumento(slug, { statusCode: 404, message: `No hay una versión publicada del documento "${slug}".` }, 404);

/** Contenido del archivo como lo escribe el repositorio. */
export function contenidoArchivoDocumentos(
  documentos: Partial<Record<SlugDocumentoLegal, DocumentoLegalVigente>>,
  version: unknown = 1,
): string {
  const entradas = Object.entries(documentos).map(([slug, documento]) => [slug, { documento, leidoEn: 1_000 }]);
  return JSON.stringify({ version, documentos: Object.fromEntries(entradas) });
}

/** Deja en el disco simulado los documentos indicados (por omisión, la versión guardada de anticipos). */
export function sembrarDocumentosGuardados(
  documentos: Partial<Record<SlugDocumentoLegal, DocumentoLegalVigente>> = { anticipos: documentoGuardado() },
): void {
  sembrarArchivo(ARCHIVO_DOCUMENTOS, contenidoArchivoDocumentos(documentos));
}

/** Lo que quedó en el archivo, ya leído como JSON (undefined si no existe). */
export function archivoDocumentos(): { version: number; documentos: Record<string, { documento: unknown }> } | undefined {
  const contenido = leerArchivo(ARCHIVO_DOCUMENTOS);
  return contenido === undefined ? undefined : JSON.parse(contenido);
}

/** fetch que rechaza como sin red. */
export function sinRed(): void {
  globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
}

/** openBrowserAsync del mock de expo-web-browser registrado en la prueba (navegadorSimulado). */
export function abrirNavegadorSimulado(): jest.Mock {
  return jest.requireMock<{ openBrowserAsync: jest.Mock }>('expo-web-browser').openBrowserAsync;
}
