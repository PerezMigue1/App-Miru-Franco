import { ApiError, apiGet } from '@/shared/api/apiClient';
import { registrarConsentimientos } from '@/shared/api/consentimientos';
import {
  RUTA_DOCUMENTO_LEGAL,
  TITULO_DOCUMENTO_LEGAL,
  esFechaDeCalendario,
  esHashDocumento,
  esRutaDelSitio,
  esSlugDocumentoLegal,
  esVersionDocumento,
  obtenerDocumentoVigente,
} from '@/shared/api/documentosLegales';

/**
 * Documentos legales pendientes de la cuenta (GET /api/consentimientos/pendientes, con sesión): los
 * obligatorios cuya versión vigente la clienta no tiene aceptada (nunca la aceptó, aceptó una versión
 * anterior que pide volver a aceptar o la revocó). Cada uno se acepta con POST /api/consentimientos y
 * el tipo, el slug, la versión y el hash que dio el backend, igual que la re-aceptación de la web
 * (formulario "reaceptacion"). Nada aquí tiene nombres ni versiones fijos: sirve para cualquier
 * documento y versión que publique el salón.
 */

/** Formulario de la constancia: el mismo de la web (FORMULARIO_REACEPTACION). */
export const FORMULARIO_REACEPTACION = 'reaceptacion';
/** Pantalla de la app donde se acepta (rutaOrigen de la constancia). */
export const RUTA_REACEPTACION = '/documentos-pendientes';

export interface DocumentoPendiente {
  /** Tipo de consentimiento del backend (terminos, aviso_privacidad...). */
  tipo: string;
  /** Slug del documento (terminos, aviso-privacidad...). */
  slug: string;
  /** "X.Y" de la versión vigente. */
  version: string;
  /** SHA-256 del texto vigente. */
  hash: string;
  /** 'YYYY-MM-DD'. */
  vigenteDesde: string;
  /** Versión que aceptó antes, o null si nunca la aceptó (o la revocó). */
  versionAceptada: string | null;
  /** Título del documento; '' si no se pudo conocer (la pantalla pone el suyo). */
  titulo: string;
  /** Ruta del documento en el sitio, o null si no se pudo conocer. */
  ruta: string | null;
}

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

const textoRecortado = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

/** Tipo y slug como los del backend: minúsculas, dígitos, guion bajo o guion. */
const TIPO = /^[a-z][a-z0-9_]{0,39}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;

/**
 * Un pendiente del servidor, o null si no se puede aceptar tal como llegó (sin tipo o slug, o con una
 * versión, un hash o una fecha mal formados): mandarlo solo daría un 400, así que no se pide.
 */
export function normalizarPendiente(crudo: unknown): Omit<DocumentoPendiente, 'titulo' | 'ruta'> | null {
  if (!esObjeto(crudo)) {
    return null;
  }
  const tipo = textoRecortado(crudo.tipo);
  const slug = textoRecortado(crudo.documentoSlug);
  const version = textoRecortado(crudo.version);
  const hash = textoRecortado(crudo.hash);
  const vigenteDesde = textoRecortado(crudo.vigenteDesde);
  if (!TIPO.test(tipo) || !SLUG.test(slug) || !esVersionDocumento(version) || !esHashDocumento(hash)) {
    return null;
  }
  if (!esFechaDeCalendario(vigenteDesde)) {
    return null;
  }
  const aceptada = textoRecortado(crudo.versionAceptada);
  return { tipo, slug, version, hash, vigenteDesde, versionAceptada: esVersionDocumento(aceptada) ? aceptada : null };
}

/**
 * Título y ruta del documento vigente de un slug; vacíos si no se pudieron leer. Con forzarRed (tras
 * un 400 de versión cambiada) el repositorio vuelve a pedir el documento a la red. Nunca rechaza.
 */
async function datosDelDocumento(slug: string, forzarRed: boolean): Promise<{ titulo: string; ruta: string | null }> {
  if (esSlugDocumentoLegal(slug)) {
    // Los conocidos pasan por el repositorio de documentos (memoria, red o archivo guardado); sin él,
    // el título y la ruta de respaldo: la clienta siempre puede leer lo que se le pide aceptar.
    const { documento } = await obtenerDocumentoVigente(slug, { forzarRed });
    return documento
      ? { titulo: documento.titulo, ruta: documento.ruta }
      : { titulo: TITULO_DOCUMENTO_LEGAL[slug], ruta: RUTA_DOCUMENTO_LEGAL[slug] };
  }
  try {
    const respuesta = await apiGet<{ data?: unknown } | null>(
      `/api/documentos-legales/${encodeURIComponent(slug)}/vigente`,
      { publica: true },
    );
    const datos = esObjeto(respuesta?.data) ? respuesta.data : {};
    const ruta = textoRecortado(datos.ruta);
    return { titulo: textoRecortado(datos.titulo), ruta: esRutaDelSitio(ruta) ? ruta : null };
  } catch {
    return { titulo: '', ruta: null };
  }
}

/** Título y ruta de respaldo de un slug, sin red: los de la app si lo conoce; vacíos si no. */
function datosDeRespaldo(slug: string): { titulo: string; ruta: string | null } {
  return esSlugDocumentoLegal(slug)
    ? { titulo: TITULO_DOCUMENTO_LEGAL[slug], ruta: RUTA_DOCUMENTO_LEGAL[slug] }
    : { titulo: '', ruta: null };
}

/**
 * GET /api/consentimientos/pendientes, sin pedir nada más: cada pendiente sale con el título y la ruta
 * de respaldo (completarDatos los trae del documento vigente después). Así la espera de la clienta es
 * solo la de esta petición. Un slug repetido se queda una vez. Un error (sin red, 429, 503, tiempo
 * agotado...) llega tal cual como ApiError o ErrorDeRed: quien llama decide no bloquear.
 */
export async function leerPendientes(): Promise<DocumentoPendiente[]> {
  const respuesta = await apiGet<{ data?: unknown } | null>('/api/consentimientos/pendientes');
  if (!Array.isArray(respuesta?.data)) {
    throw new ApiError(500, 'La respuesta del servidor no trae los documentos pendientes.');
  }
  const vistos = new Set<string>();
  const pendientes = respuesta.data.map(normalizarPendiente).filter((pendiente) => {
    if (!pendiente || vistos.has(pendiente.slug)) {
      return false;
    }
    vistos.add(pendiente.slug);
    return true;
  }) as Array<Omit<DocumentoPendiente, 'titulo' | 'ruta'>>;
  return pendientes.map((pendiente) => ({ ...pendiente, ...datosDeRespaldo(pendiente.slug) }));
}

/**
 * El título y la ruta del documento vigente de cada pendiente (también de un slug que la app no
 * conoce). Lo que no se pueda leer se queda con su respaldo. Con forzarRed los documentos conocidos se
 * vuelven a pedir a la red aunque la memoria siga vigente. Nunca rechaza.
 */
export async function completarDatos(
  pendientes: DocumentoPendiente[],
  { forzarRed = false }: { forzarRed?: boolean } = {},
): Promise<DocumentoPendiente[]> {
  const datos = await Promise.all(pendientes.map((pendiente) => datosDelDocumento(pendiente.slug, forzarRed)));
  return pendientes.map((pendiente, i) => ({ ...pendiente, ...datos[i] }));
}

/** Acepta un pendiente con la versión y el hash que dio el backend (los que la clienta tuvo a la vista). */
export async function aceptarPendiente(pendiente: DocumentoPendiente): Promise<void> {
  await registrarConsentimientos({
    items: [
      {
        tipo: pendiente.tipo,
        documentoSlug: pendiente.slug,
        version: pendiente.version,
        hash: pendiente.hash,
        accion: 'aceptado',
      },
    ],
    formulario: FORMULARIO_REACEPTACION,
    rutaOrigen: RUTA_REACEPTACION,
  });
}

/**
 * El 400 de aceptar: la versión ya no está publicada o su hash no coincide (el salón publicó otra
 * mientras la clienta leía). Hay que volver a consultar los pendientes.
 */
export function esVersionCambiada(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400;
}
