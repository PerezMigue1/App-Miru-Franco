import { File, Paths } from 'expo-file-system';
import type { Href } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';

import { apiGet, ApiError, crearErrorApi, ErrorDeRed, esUrlPermitida } from './apiClient';

/**
 * Documentos legales vigentes (GET /api/documentos-legales/:slug/vigente, sin sesión): título,
 * ruta en el sitio, versión, hash y fecha de vigencia. La app no interpreta el html del documento
 * (trae la página completa de la web): muestra en nativo título, versión y vigencia y abre el texto
 * completo en el sitio con expo-web-browser. El html nunca se guarda.
 *
 * Patrón Repository: las pantallas piden el documento aquí y no saben si llegó de la red, de la
 * memoria o del archivo guardado. Patrón Singleton: un solo estado en memoria para toda la app.
 * Patrón Observer: `suscribir` avisa cuando cambia el documento de algún slug.
 *
 * Nunca rechaza ni escribe en consola. Sin red ni archivo no inventa versión, hash ni fecha: solo
 * conoce de respaldo el título y la ruta de cada documento, para abrir la página igual.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────────────────────

/** Slugs de los documentos legales (SLUGS_DOCUMENTO del backend). */
export type SlugDocumentoLegal = 'terminos' | 'aviso-privacidad' | 'cookies' | 'reembolsos' | 'anticipos';

export interface DocumentoLegalVigente {
  slug: SlugDocumentoLegal;
  titulo: string;
  /** Ruta de la página en el sitio ("/politica-de-reembolsos#anticipos"). */
  ruta: string;
  /** "X.Y". */
  version: string;
  /** SHA-256 en hexadecimal (64 caracteres). */
  hash: string;
  /** 'YYYY-MM-DD'. */
  vigenteDesde: string;
  requiereAceptacion: boolean;
}

/** De dónde salió el documento que se devuelve. */
export type OrigenDocumento = 'red' | 'memoria' | 'archivo' | null;

export interface ResultadoDocumento {
  documento: DocumentoLegalVigente | null;
  origen: OrigenDocumento;
  /** Por qué no se pudo leer de la red, si falló. Nunca se muestra a la clienta. */
  error?: ApiError | ErrorDeRed;
}

/** Lo que hay en memoria de un slug. */
export interface EstadoDocumento {
  documento: DocumentoLegalVigente;
  /** 'red' si salió de una lectura de red; 'archivo' si se subió del archivo guardado. */
  origen: 'red' | 'archivo';
  /** Momento (ms) de la lectura de red que lo dio; null si vino del archivo. */
  leidoEn: number | null;
}

export interface OpcionesDocumento {
  /** Pide a la red aunque la memoria siga vigente (por ejemplo, al reintentar). */
  forzarRed?: boolean;
}

// ── Constantes ───────────────────────────────────────────────────────────────────────────────

/** Vigencia de la lectura de red en memoria. */
export const VIGENCIA_DOCUMENTO_MS = 5 * 60 * 1000;

export const SLUGS_DOCUMENTO_LEGAL: readonly SlugDocumentoLegal[] = Object.freeze([
  'terminos',
  'aviso-privacidad',
  'cookies',
  'reembolsos',
  'anticipos',
]);

/** Títulos de respaldo: TITULO_DOCUMENTO de documentos-legales.constants.ts del backend. */
export const TITULO_DOCUMENTO_LEGAL: Readonly<Record<SlugDocumentoLegal, string>> = Object.freeze({
  terminos: 'Términos y Condiciones',
  'aviso-privacidad': 'Aviso de Privacidad',
  cookies: 'Política de Cookies',
  reembolsos: 'Política de Reembolsos, Cambios y Cancelaciones',
  anticipos: 'Política de Anticipos',
});

/** Rutas de respaldo en el sitio: RUTA_DOCUMENTO de documentos-legales.constants.ts del backend. */
export const RUTA_DOCUMENTO_LEGAL: Readonly<Record<SlugDocumentoLegal, string>> = Object.freeze({
  terminos: '/terminos-y-condiciones',
  'aviso-privacidad': '/aviso-de-privacidad',
  cookies: '/politica-de-cookies',
  reembolsos: '/politica-de-reembolsos',
  anticipos: '/politica-de-reembolsos#anticipos',
});

const NOMBRE_ARCHIVO = 'documentos-legales.json';
const VERSION_ARCHIVO = 1;
/** Mismo formato de versión y hash que el backend (REGEX_VERSION_DOCUMENTO y REGEX_HASH_DOCUMENTO). */
const VERSION = /^\d{1,3}\.\d{1,3}$/;
const HASH = /^[0-9a-f]{64}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// ── Normalización ────────────────────────────────────────────────────────────────────────────

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

const textoRecortado = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

/** El texto es uno de los slugs conocidos. */
export function esSlugDocumentoLegal(valor: unknown): valor is SlugDocumentoLegal {
  return typeof valor === 'string' && (SLUGS_DOCUMENTO_LEGAL as readonly string[]).includes(valor);
}

/** 'YYYY-MM-DD' que es un día real del calendario (sin 31 de febrero ni mes 13). */
function esFechaDeCalendario(fecha: string): boolean {
  if (!FECHA.test(fecha)) {
    return false;
  }
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const local = new Date(anio, mes - 1, dia);
  return local.getFullYear() === anio && local.getMonth() === mes - 1 && local.getDate() === dia;
}

/** Ruta del sitio: empieza con "/" y no trae "//" (no puede apuntar a otro dominio). */
const esRutaDelSitio = (ruta: string): boolean => ruta.startsWith('/') && !ruta.includes('//') && !/\s/.test(ruta);

/**
 * El documento del servidor (o del archivo) validado para `slug`: versión "X.Y", hash SHA-256 en
 * hexadecimal, fecha 'YYYY-MM-DD' real y ruta del sitio. Si algo no valida, el documento no sirve
 * (null). Sin título usa el de respaldo. Solo guarda estos campos: nunca el html.
 */
export function normalizarDocumento(crudo: unknown, slug: SlugDocumentoLegal): DocumentoLegalVigente | null {
  if (!esObjeto(crudo) || crudo.slug !== slug) {
    return null;
  }
  const version = textoRecortado(crudo.version);
  const hash = textoRecortado(crudo.hash);
  const vigenteDesde = textoRecortado(crudo.vigenteDesde);
  const ruta = textoRecortado(crudo.ruta);
  if (!VERSION.test(version) || !HASH.test(hash) || !esFechaDeCalendario(vigenteDesde) || !esRutaDelSitio(ruta)) {
    return null;
  }
  return Object.freeze({
    slug,
    titulo: textoRecortado(crudo.titulo) || TITULO_DOCUMENTO_LEGAL[slug],
    ruta,
    version,
    hash,
    vigenteDesde,
    requiereAceptacion: crudo.requiereAceptacion !== false,
  });
}

/** "14 de octubre de 2026" con los componentes del 'YYYY-MM-DD' (sin zona horaria); '' si no es válida. */
export function fechaVigenciaLegible(fecha: string): string {
  if (!esFechaDeCalendario(fecha)) {
    return '';
  }
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

// ── Archivo en disco ─────────────────────────────────────────────────────────────────────────

/**
 * Un solo archivo JSON en Paths.document con los documentos de todos los slugs: { version,
 * documentos: { [slug]: { documento, leidoEn } } }. Se usa expo-file-system como en
 * configuracionPublica (no son secretos y SecureStore limita el tamaño). File y Paths solo se tocan
 * dentro de try/catch: si el disco falla, se sigue sin él.
 */
function archivo(): File {
  return new File(Paths.document, NOMBRE_ARCHIVO);
}

/** Lo guardado, ya validado por slug; {} si no hay, no se puede leer o está dañado. */
function leerGuardados(): Partial<Record<SlugDocumentoLegal, EstadoDocumento>> {
  try {
    const guardado = archivo();
    if (!guardado.exists) {
      return {};
    }
    const datos: unknown = JSON.parse(guardado.textSync());
    if (!esObjeto(datos) || datos.version !== VERSION_ARCHIVO || !esObjeto(datos.documentos)) {
      return {};
    }
    const documentos = datos.documentos;
    const guardados: Partial<Record<SlugDocumentoLegal, EstadoDocumento>> = {};
    for (const slug of SLUGS_DOCUMENTO_LEGAL) {
      const entrada = esObjeto(documentos[slug]) ? (documentos[slug] as Objeto) : {};
      const documento = normalizarDocumento(entrada.documento, slug);
      if (documento) {
        guardados[slug] = { documento, origen: 'archivo', leidoEn: null };
      }
    }
    return guardados;
  } catch {
    return {};
  }
}

/** Agrega o reemplaza el documento de un slug en el archivo. Si falla, la app sigue igual. */
function escribirGuardado(estadoNuevo: EstadoDocumento): void {
  try {
    const destino = archivo();
    const documentos: Record<string, { documento: DocumentoLegalVigente; leidoEn: number | null }> = {};
    for (const [slug, guardado] of Object.entries(leerGuardados())) {
      documentos[slug] = { documento: guardado.documento, leidoEn: guardado.leidoEn };
    }
    documentos[estadoNuevo.documento.slug] = { documento: estadoNuevo.documento, leidoEn: estadoNuevo.leidoEn };
    if (!destino.exists) {
      destino.create();
    }
    destino.write(JSON.stringify({ version: VERSION_ARCHIVO, documentos }));
  } catch {
    // Sin disco: la próxima vez sin red no habrá versión guardada.
  }
}

// ── Estado en memoria (Singleton) y suscriptores (Observer) ──────────────────────────────────

const memoria = new Map<SlugDocumentoLegal, EstadoDocumento>();
const enVuelo = new Map<SlugDocumentoLegal, Promise<ResultadoDocumento>>();
const oyentes = new Set<() => void>();

function avisar(): void {
  for (const oyente of [...oyentes]) {
    try {
      oyente();
    } catch {
      // Un oyente que falla no impide avisar a los demás.
    }
  }
}

function fijar(estadoNuevo: EstadoDocumento): void {
  memoria.set(estadoNuevo.documento.slug, Object.freeze(estadoNuevo));
  avisar();
}

const vigenteEnMemoria = (estado: EstadoDocumento | undefined, ahora: number): estado is EstadoDocumento =>
  estado !== undefined &&
  estado.origen === 'red' &&
  estado.leidoEn !== null &&
  ahora - estado.leidoEn < VIGENCIA_DOCUMENTO_MS;

async function pedirDocumento(slug: SlugDocumentoLegal): Promise<ResultadoDocumento> {
  try {
    const respuesta = await apiGet<unknown>(`/api/documentos-legales/${encodeURIComponent(slug)}/vigente`, {
      publica: true,
    });
    const documento = normalizarDocumento(esObjeto(respuesta) ? respuesta.data : undefined, slug);
    if (!documento) {
      // Un 200 que no es el documento (o con versión, hash o fecha mal formados) no pisa lo guardado.
      throw crearErrorApi({ tipo: 'red' });
    }
    const nuevo: EstadoDocumento = { documento, origen: 'red', leidoEn: Date.now() };
    escribirGuardado(nuevo);
    fijar(nuevo);
    return { documento, origen: 'red' };
  } catch (causa) {
    const error = causa instanceof ApiError || causa instanceof ErrorDeRed ? causa : crearErrorApi({ tipo: 'red' });
    if (error instanceof ApiError && error.status === 404) {
      // El slug no tiene versión publicada: no se muestra una versión que ya no es la vigente.
      if (memoria.delete(slug)) {
        avisar();
      }
      return { documento: null, origen: null, error };
    }
    return { ...respaldoSinRed(slug), error };
  }
}

/**
 * Sin red: lo que haya en memoria aunque ya no esté vigente (es lo último que se leyó y también está
 * en el archivo) o, si no hay nada, lo guardado en el archivo, que se sube a la memoria.
 */
function respaldoSinRed(slug: SlugDocumentoLegal): ResultadoDocumento {
  const enMemoria = memoria.get(slug);
  if (enMemoria) {
    return { documento: enMemoria.documento, origen: enMemoria.origen === 'red' ? 'memoria' : 'archivo' };
  }
  const guardado = leerGuardados()[slug];
  if (!guardado) {
    return { documento: null, origen: null };
  }
  fijar(guardado);
  return { documento: guardado.documento, origen: 'archivo' };
}

// ── API pública ──────────────────────────────────────────────────────────────────────────────

/**
 * El documento vigente de `slug` en este orden: memoria vigente (VIGENCIA_DOCUMENTO_MS desde la
 * lectura de red), red, archivo guardado y null. Si la red falla y en memoria quedó una lectura
 * vencida, se devuelve esa con origen 'memoria' y el error. Un 404 (sin versión publicada) da null sin usar lo
 * guardado. Dos llamadas a la vez comparten una sola petición. Nunca rechaza.
 */
export function obtenerDocumentoVigente(
  slug: SlugDocumentoLegal,
  { forzarRed = false }: OpcionesDocumento = {},
): Promise<ResultadoDocumento> {
  const enMemoria = memoria.get(slug);
  if (!forzarRed && vigenteEnMemoria(enMemoria, Date.now())) {
    return Promise.resolve({ documento: enMemoria.documento, origen: 'memoria' });
  }
  let peticion = enVuelo.get(slug);
  if (!peticion) {
    peticion = pedirDocumento(slug).finally(() => {
      enVuelo.delete(slug);
    });
    enVuelo.set(slug, peticion);
  }
  return peticion;
}

/** El documento de `slug` que hay en memoria (de la red o del archivo), al instante; null si no hay. */
export function documentoEnMemoria(slug: SlugDocumentoLegal): DocumentoLegalVigente | null {
  return memoria.get(slug)?.documento ?? null;
}

/** Estado en memoria de `slug` para useSyncExternalStore: el mismo objeto mientras no cambie. */
export function estadoDocumento(slug: SlugDocumentoLegal): EstadoDocumento | null {
  return memoria.get(slug) ?? null;
}

/** Registra un oyente que se llama cuando cambia el documento de algún slug. Devuelve cómo quitarlo. */
export function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/**
 * Página del documento en el sitio: EXPO_PUBLIC_WEB_URL (sin "/" final) más la ruta del documento
 * (o la de respaldo). null si no hay URL de la web o no es https (en desarrollo se permite http).
 */
export function urlDocumentoEnWeb(slug: SlugDocumentoLegal, documento?: DocumentoLegalVigente | null): string | null {
  const base = process.env.EXPO_PUBLIC_WEB_URL?.trim() ?? '';
  if (!base || !esUrlPermitida(base)) {
    return null;
  }
  let fin = base.length;
  while (fin > 0 && base[fin - 1] === '/') {
    fin--;
  }
  const ruta = documento?.slug === slug ? documento.ruta : RUTA_DOCUMENTO_LEGAL[slug];
  return `${base.slice(0, fin)}${ruta}`;
}

/**
 * Abre el documento completo en el navegador de la app. true si se abrió; false si no hay URL de la
 * web o el navegador falló. Nunca rechaza.
 */
export async function abrirDocumentoEnWeb(
  slug: SlugDocumentoLegal,
  documento: DocumentoLegalVigente | null = documentoEnMemoria(slug),
): Promise<boolean> {
  const url = urlDocumentoEnWeb(slug, documento);
  if (!url) {
    return false;
  }
  try {
    await openBrowserAsync(url);
    return true;
  } catch {
    return false;
  }
}

/** Ruta del visor del documento en la app, para router.push. */
export function rutaVisorDocumento(slug: SlugDocumentoLegal): Href {
  return `/legal/${slug}` as Href;
}

/**
 * Solo para pruebas: olvida la memoria, los suscriptores y las peticiones en vuelo. Los módulos se
 * comparten entre las pruebas de un archivo, así que cada prueba empieza con esto.
 */
export function reiniciarDocumentosLegales(): void {
  memoria.clear();
  enVuelo.clear();
  oyentes.clear();
}
