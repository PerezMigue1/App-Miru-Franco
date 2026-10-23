import { apiPost } from './apiClient';
import type { DocumentoLegalVigente, SlugDocumentoLegal } from './documentosLegales';

/**
 * Registro trazable de consentimientos (POST /api/consentimientos, con la sesión de la clienta):
 * cada casilla marcada se guarda con el documento, la versión y el hash que la clienta tuvo a la
 * vista; el backend agrega la fecha, la IP y el navegador. Nada se edita ni se borra: revocar es otra
 * fila. Este módulo solo arma y envía: qué casilla pide cada pantalla lo decide quien lo usa.
 * Los errores llegan como ApiError o ErrorDeRed de apiClient, sin tocarlos.
 */

/** Tipos de consentimiento (TIPOS_CONSENTIMIENTO del backend). */
export type TipoConsentimiento =
  | 'terminos'
  | 'aviso_privacidad'
  | 'promociones'
  | 'datos_salud'
  | 'terminos_venta'
  | 'reembolsos'
  | 'anticipos'
  | 'fotos_resultado'
  | 'cookies';

export type AccionConsentimiento = 'aceptado' | 'revocado';

/**
 * Un consentimiento. Los tipos que son un documento (terminos, aviso_privacidad, cookies, reembolsos
 * y anticipos) piden documentoSlug, version y hash publicados; los demás (fotos_resultado,
 * promociones...) se mandan sin documento.
 */
export interface ItemConsentimiento {
  tipo: TipoConsentimiento;
  documentoSlug?: SlugDocumentoLegal;
  version?: string;
  hash?: string;
  accion: AccionConsentimiento;
}

export interface EntradaConsentimientos {
  /** De 1 a 10 consentimientos. */
  items: ItemConsentimiento[];
  /** Pantalla o formulario donde se marcó: letras, números, guion y guion bajo, hasta 80. */
  formulario: string;
  /** Ruta de la app donde se marcó (hasta 300); se omite si viene vacía. */
  rutaOrigen?: string;
}

/** Lo que responde el backend de cada consentimiento guardado (sin IP ni navegador). */
export interface ConsentimientoRegistrado {
  id: string;
  tipo: string;
  accion: string;
  documentoSlug: string | null;
  documentoVersion: string | null;
  creadoEn: string;
}

/** Tipo de consentimiento de cada documento legal (TIPO_POR_DOCUMENTO de la web). */
export const TIPO_DE_DOCUMENTO: Readonly<Record<SlugDocumentoLegal, TipoConsentimiento>> = Object.freeze({
  terminos: 'terminos',
  'aviso-privacidad': 'aviso_privacidad',
  cookies: 'cookies',
  reembolsos: 'reembolsos',
  anticipos: 'anticipos',
});

/** Casilla de un documento legal aceptada, con la versión y el hash que la clienta tuvo a la vista. */
export function aceptacionDeDocumento(documento: DocumentoLegalVigente): ItemConsentimiento {
  return {
    tipo: TIPO_DE_DOCUMENTO[documento.slug],
    documentoSlug: documento.slug,
    version: documento.version,
    hash: documento.hash,
    accion: 'aceptado',
  };
}

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const textoONull = (valor: unknown): string | null => (typeof valor === 'string' && valor ? valor : null);

/** Solo los campos que acepta el backend, sin los que vienen vacíos. */
function itemLimpio({ tipo, documentoSlug, version, hash, accion }: ItemConsentimiento): ItemConsentimiento {
  return {
    tipo,
    ...(documentoSlug ? { documentoSlug } : {}),
    ...(version ? { version } : {}),
    ...(hash ? { hash } : {}),
    accion,
  };
}

function registrado(crudo: Objeto): ConsentimientoRegistrado {
  return {
    id: String(crudo.id ?? ''),
    tipo: textoONull(crudo.tipo) ?? '',
    accion: textoONull(crudo.accion) ?? '',
    documentoSlug: textoONull(crudo.documentoSlug),
    documentoVersion: textoONull(crudo.documentoVersion),
    creadoEn: textoONull(crudo.creadoEn) ?? '',
  };
}

/**
 * Guarda los consentimientos: POST /api/consentimientos con { items, formulario, rutaOrigen? }.
 * Responde 201 { success, data: [...] }; devuelve lo guardado. Un 400 (por ejemplo, una versión que
 * no está publicada o cuyo hash no coincide) llega como ApiError.
 */
export async function registrarConsentimientos({
  items,
  formulario,
  rutaOrigen,
}: EntradaConsentimientos): Promise<ConsentimientoRegistrado[]> {
  const ruta = rutaOrigen?.trim();
  const respuesta = await apiPost<unknown>('/api/consentimientos', {
    items: items.map(itemLimpio),
    formulario,
    ...(ruta ? { rutaOrigen: ruta } : {}),
  });
  const datos = esObjeto(respuesta) && Array.isArray(respuesta.data) ? respuesta.data : [];
  return datos.filter(esObjeto).map(registrado);
}
