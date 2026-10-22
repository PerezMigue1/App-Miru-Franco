import { esObjeto, listaDe, texto, urlHttps, type Crudo } from '@/features/inicio/models/inicioService';
import { apiGet } from '@/shared/api/apiClient';

/**
 * Contenido público administrable del salón (Admin > Contenido y Admin > Galería en el backend):
 * promociones, preguntas frecuentes, equipo y galería. Patrón Repository: las cuatro lecturas son
 * públicas (sin sesión) y responden { success: true, data: [...] }; cada respuesta pasa por su
 * normalizador, que descarta lo que no trae los campos obligatorios, recorta los textos y solo deja
 * URLs https, como la web (miru-franco-web/src/app/services/contenido.ts).
 */

export const RUTA_PROMOCIONES = '/api/contenido/promociones';
export const RUTA_PREGUNTAS_FRECUENTES = '/api/contenido/preguntas-frecuentes';
export const RUTA_EQUIPO = '/api/contenido/equipo';
export const RUTA_GALERIA = '/api/galeria';

/** Texto alternativo de una foto sin alt ni servicio. */
export const ALT_FOTO_SIN_SERVICIO = 'Foto de un trabajo del salón';

/** Promoción activa y vigente, en el orden que eligió el personal. */
export interface Promocion {
  id: number;
  titulo: string;
  descripcion: string;
  /** Imagen https, o null. */
  imagenUrl: string | null;
  /** Ruta interna del sitio ("/cliente/servicios-citas") o URL https, o null. */
  enlace: string | null;
  /** Día 'AAAA-MM-DD', o null (sin fecha). */
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  /** Se muestra como banner. */
  destacada: boolean;
}

export interface PreguntaFrecuente {
  id: number;
  pregunta: string;
  respuesta: string;
}

/** Integrante del equipo: solo lo que se publica (sin contacto ni datos laborales). */
export interface IntegranteEquipo {
  nombre: string;
  puesto: string;
  /** Foto https, o null. */
  foto: string | null;
  bio: string | null;
}

/** Servicio al que pertenece una foto de la galería. */
export interface ServicioDeFoto {
  id: number;
  nombre: string;
  categoria: string;
}

export interface FotoGaleriaSalon {
  id: number;
  url: string;
  /** Texto alternativo para accessibilityLabel; nunca vacío. */
  alt: string;
  /** null si la foto no está ligada a un servicio activo. */
  servicio: ServicioDeFoto | null;
}

const FECHA_DIA = /^\d{4}-\d{2}-\d{2}$/;

function idNumerico(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

/** Texto recortado y no vacío, o null (un número no cuenta como texto). */
function textoRecortado(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

function fechaDia(valor: unknown): string | null {
  const dia = textoRecortado(valor);
  return dia && FECHA_DIA.test(dia) ? dia : null;
}

/** Enlace de una promoción: ruta interna ("/...", sin "//") o URL https; lo demás es null. */
function enlaceSeguro(valor: unknown): string | null {
  const enlace = textoRecortado(valor);
  if (enlace?.startsWith('/') && !enlace.startsWith('//')) {
    return enlace;
  }
  return urlHttps(enlace) ?? null;
}

/**
 * Lista de una respuesta (arreglo suelto o { data }) convertida elemento por elemento; lo que la
 * conversión rechaza (null) se descarta. Una respuesta no válida da [].
 */
function normalizarLista<T>(respuesta: unknown, convertir: (crudo: Crudo) => T | null): T[] {
  return listaDe(respuesta, ['data'])
    .map(convertir)
    .filter((elemento): elemento is T => elemento !== null);
}

function promocion(crudo: Crudo): Promocion | null {
  const id = idNumerico(crudo.id);
  const titulo = textoRecortado(crudo.titulo);
  const descripcion = textoRecortado(crudo.descripcion);
  if (id === null || !titulo || !descripcion) {
    return null;
  }
  return {
    id,
    titulo,
    descripcion,
    imagenUrl: urlHttps(crudo.imagenUrl) ?? null,
    enlace: enlaceSeguro(crudo.enlace),
    vigenteDesde: fechaDia(crudo.vigenteDesde),
    vigenteHasta: fechaDia(crudo.vigenteHasta),
    destacada: crudo.destacada === true,
  };
}

function pregunta(crudo: Crudo): PreguntaFrecuente | null {
  const id = idNumerico(crudo.id);
  const textoPregunta = textoRecortado(crudo.pregunta);
  const respuesta = textoRecortado(crudo.respuesta);
  if (id === null || !textoPregunta || !respuesta) {
    return null;
  }
  return { id, pregunta: textoPregunta, respuesta };
}

function integrante(crudo: Crudo): IntegranteEquipo | null {
  const nombre = textoRecortado(crudo.nombre);
  const puesto = textoRecortado(crudo.puesto);
  // El servidor ya filtra; si llegara alguien oculto o no disponible, no se publica.
  if (!nombre || !puesto || crudo.visible === false || crudo.disponible === false) {
    return null;
  }
  return { nombre, puesto, foto: urlHttps(crudo.foto) ?? null, bio: textoRecortado(crudo.bio) };
}

function servicioDeFoto(valor: unknown): ServicioDeFoto | null {
  if (!esObjeto(valor)) {
    return null;
  }
  const id = idNumerico(valor.id);
  const nombre = textoRecortado(valor.nombre);
  return id === null || !nombre ? null : { id, nombre, categoria: texto(valor.categoria) };
}

/** Foto con la posición que pidió el servidor (Infinity si no la trae: queda al final). */
interface FotoConOrden {
  foto: FotoGaleriaSalon;
  orden: number;
}

function fotoConOrden(crudo: Crudo): FotoConOrden | null {
  const id = idNumerico(crudo.id);
  const url = urlHttps(crudo.url);
  if (id === null || !url || crudo.visible === false) {
    return null;
  }
  const servicio = servicioDeFoto(crudo.servicio);
  const alt = textoRecortado(crudo.alt) ?? (servicio ? `Foto de ${servicio.nombre}` : ALT_FOTO_SIN_SERVICIO);
  return { foto: { id, url, alt, servicio }, orden: idNumerico(crudo.orden) ?? Number.POSITIVE_INFINITY };
}

/** GET /api/contenido/promociones. */
export function normalizarPromociones(respuesta: unknown): Promocion[] {
  return normalizarLista(respuesta, promocion);
}

/** GET /api/contenido/preguntas-frecuentes. */
export function normalizarPreguntas(respuesta: unknown): PreguntaFrecuente[] {
  return normalizarLista(respuesta, pregunta);
}

/** GET /api/contenido/equipo. */
export function normalizarEquipo(respuesta: unknown): IntegranteEquipo[] {
  return normalizarLista(respuesta, integrante);
}

/**
 * GET /api/galeria: solo fotos visibles con URL https. Se respeta el orden del arreglo (el servidor
 * ya ordena); si alguna trae `orden` numérico, se ordena por él de forma estable.
 */
export function normalizarGaleria(respuesta: unknown): FotoGaleriaSalon[] {
  return normalizarLista(respuesta, fotoConOrden)
    .sort((a, b) => (a.orden === b.orden ? 0 : a.orden - b.orden))
    .map(({ foto }) => foto);
}

/** Lectura pública de una lista: rechaza con el error de apiClient (ApiError o ErrorDeRed). */
function leerLista<T>(ruta: string, normalizar: (respuesta: unknown) => T[]): Promise<T[]> {
  return apiGet<unknown>(ruta, { publica: true }).then(normalizar);
}

export function obtenerPromociones(): Promise<Promocion[]> {
  return leerLista(RUTA_PROMOCIONES, normalizarPromociones);
}

export function obtenerPreguntasFrecuentes(): Promise<PreguntaFrecuente[]> {
  return leerLista(RUTA_PREGUNTAS_FRECUENTES, normalizarPreguntas);
}

export function obtenerEquipo(): Promise<IntegranteEquipo[]> {
  return leerLista(RUTA_EQUIPO, normalizarEquipo);
}

export function obtenerGaleria(): Promise<FotoGaleriaSalon[]> {
  return leerLista(RUTA_GALERIA, normalizarGaleria);
}
