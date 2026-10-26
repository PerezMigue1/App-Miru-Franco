import { ApiError, apiDelete, apiGet, apiPatch, apiPut } from '@/shared/api/apiClient';
import { esObjeto, listaDe, texto } from '@/features/inicio/models/inicioService';
import { idDeCompra, rutaComprobante, tipoComprobante } from '@/shared/api/comprobantesDeCompra';
import { mensajeSinContexto } from '@/shared/api/mensajesError';

/**
 * Aviso interno de la clienta ya normalizado. El backend lo llama Notificacion: GET
 * /api/notificaciones → { success, count, data[] } ordenada por creadoEn, del más reciente al más viejo.
 */
export interface Aviso {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  /** ISO de creadoEn, o null si no vino o no es fecha válida. */
  fecha: string | null;
  leida: boolean;
  /**
   * Ruta de la app ('/cita/12', '/pedido/7', '/mis-citas', '/mis-pedidos', '/perfil' o
   * '/comprobante?tipo=pedido&id=7') o null si no abre nada.
   */
  destino: string | null;
}

/** Acción que falló, para elegir el mensaje de mensajeErrorAvisos. */
export type AccionAvisos = 'cargar' | 'marcar' | 'marcarTodas' | 'borrar';

// ── Destino del aviso ──────────────────────────────────────────────────────────────────────

/**
 * Secciones de la web de la clienta que tienen pantalla en la app. La sección sola abre `lista`; la
 * sección seguida de /:id abre `detalle`/:id. Mi perfil no tiene detalle:
 * '/cliente/mi-perfil#privacidad-solicitudes' llega aquí sin el hash.
 */
const SECCIONES_CLIENTE: ReadonlyMap<string, { lista: string; detalle?: string }> = new Map([
  ['/cliente/servicios-citas/mis-citas', { lista: '/mis-citas', detalle: '/cita' }],
  ['/cliente/tienda-online/mis-pedidos', { lista: '/mis-pedidos', detalle: '/pedido' }],
  ['/cliente/mi-perfil', { lista: '/perfil' }],
]);

/** Avisos del personal: '/operacion/...' y '/admin/...' (y esas rutas solas). */
const RUTA_PERSONAL = /^\/(?:operacion|admin)(?:\/|$)/;

/** entidadTipo con detalle en la app; 'venta_local', 'solicitud_arco', 'comprobante' y los demás no abren nada. */
const DETALLE_POR_ENTIDAD: ReadonlyMap<string, string> = new Map([
  ['cita', '/cita'],
  ['pedido', '/pedido'],
]);

/** Id entero positivo de solo dígitos ("12", 12 o "007"), sin ceros a la izquierda; null si no lo es. */
function idPositivo(valor: unknown): string | null {
  const id = texto(valor);
  if (!/^\d+$/.test(id)) {
    return null;
  }
  const numero = Number(id);
  return Number.isSafeInteger(numero) && numero > 0 ? String(numero) : null;
}

/**
 * Ruta de la web para comparar: sin espacios, sin el origen de una URL absoluta (http(s)://host),
 * sin query ni hash, sin diagonales al final y en minúsculas. '' si no es texto.
 */
function rutaWeb(urlAccion: unknown): string {
  const url = typeof urlAccion === 'string' ? urlAccion.trim() : '';
  const sinOrigen = url.replace(/^https?:\/\/[^/?#]*/i, '');
  return sinOrigen.split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
}

/**
 * Página de la web con el comprobante de una compra (aviso 'comprobante', GP-09): el backend manda
 * '/cliente/comprobante?tipo=pedido|cita|venta&id=<id de la compra>' y la app abre su propia pantalla
 * del comprobante con el mismo tipo e id. Su entidadId es el id del comprobante, no el de la compra,
 * así que el destino solo sale de esta ruta.
 */
const RUTA_COMPROBANTE = '/cliente/comprobante';

/** Valores de la query de una urlAccion (sin el hash), con las claves en minúsculas. */
function parametrosDe(urlAccion: unknown): Map<string, string> {
  const url = typeof urlAccion === 'string' ? urlAccion.trim() : '';
  const inicio = url.indexOf('?');
  const parametros = new Map<string, string>();
  if (inicio === -1) {
    return parametros;
  }
  for (const par of url.slice(inicio + 1).split('#')[0].split('&')) {
    const igual = par.indexOf('=');
    const clave = (igual === -1 ? par : par.slice(0, igual)).toLowerCase();
    try {
      parametros.set(clave, decodeURIComponent(igual === -1 ? '' : par.slice(igual + 1)));
    } catch {
      // Un valor mal codificado no sirve: se ignora.
    }
  }
  return parametros;
}

/**
 * Pantalla del comprobante de la página de la web ('/comprobante?tipo=venta&id=5'), para un pedido,
 * una cita o una venta; null si el tipo no es uno de esos o el id no es un entero positivo de dígitos.
 */
function destinoDeComprobante(urlAccion: unknown): string | null {
  const parametros = parametrosDe(urlAccion);
  const tipo = tipoComprobante(parametros.get('tipo'));
  const id = idDeCompra(parametros.get('id'));
  return tipo && id !== null ? rutaComprobante(tipo, id) : null;
}

/** Traduce la ruta de la web a la de la app; null si no es de la clienta o el id no sirve. */
function destinoDeRuta(ruta: string): string | null {
  const seccion = SECCIONES_CLIENTE.get(ruta);
  if (seccion) {
    return seccion.lista;
  }
  // Detalle: lo que va antes de la última diagonal es la sección y lo de después, el id.
  const corte = ruta.lastIndexOf('/');
  const detalle = SECCIONES_CLIENTE.get(ruta.slice(0, corte))?.detalle;
  const id = idPositivo(ruta.slice(corte + 1));
  return detalle && id ? `${detalle}/${id}` : null;
}

/**
 * Pantalla de la app que abre el aviso. Primero traduce urlAccion (rutas de la web de la clienta,
 * relativas o absolutas, y la página de comprobante, que abre la pantalla del comprobante con su tipo
 * e id); si no se traduce, usa
 * entidadTipo 'cita' o 'pedido' con un entidadId de dígitos. null si nada aplica.
 */
export function destinoDeAviso(datos: { urlAccion?: unknown; entidadTipo?: unknown; entidadId?: unknown }): string | null {
  const ruta = rutaWeb(datos.urlAccion);
  // Un aviso con ruta del personal no es para la clienta (el backend lo mandó a otro rol o por
  // error): nunca abre nada, aunque su entidad sea una cita o un pedido que la app sí sabe abrir.
  if (RUTA_PERSONAL.test(ruta)) {
    return null;
  }
  const deRuta = ruta === RUTA_COMPROBANTE ? destinoDeComprobante(datos.urlAccion) : destinoDeRuta(ruta);
  if (deRuta) {
    return deRuta;
  }
  const detalle = DETALLE_POR_ENTIDAD.get(texto(datos.entidadTipo).toLowerCase());
  const id = idPositivo(datos.entidadId);
  return detalle && id ? `${detalle}/${id}` : null;
}

// ── Normalizadores ─────────────────────────────────────────────────────────────────────────

/** Texto ISO que Date.parse entiende, tal como lo manda el servidor; null si no lo es. */
function fechaIso(valor: unknown): string | null {
  const fecha = typeof valor === 'string' ? valor.trim() : '';
  return fecha && !Number.isNaN(Date.parse(fecha)) ? fecha : null;
}

/**
 * Notificacion de Prisma en camelCase (acepta también entidad_tipo, entidad_id, url_accion y
 * creado_en). null si no es objeto, si no trae id (uuid en texto) o si no trae título ni mensaje;
 * con mensaje y sin título, el título es 'Aviso'.
 */
export function normalizarAviso(crudo: unknown): Aviso | null {
  if (!esObjeto(crudo)) {
    return null;
  }
  const id = typeof crudo.id === 'string' ? crudo.id.trim() : '';
  const titulo = texto(crudo.titulo);
  const mensaje = texto(crudo.mensaje);
  if (!id || (!titulo && !mensaje)) {
    return null;
  }
  return {
    id,
    tipo: texto(crudo.tipo),
    titulo: titulo || 'Aviso',
    mensaje,
    fecha: fechaIso(crudo.creadoEn ?? crudo.creado_en),
    leida: crudo.leida === true,
    destino: destinoDeAviso({
      urlAccion: crudo.urlAccion ?? crudo.url_accion,
      entidadTipo: crudo.entidadTipo ?? crudo.entidad_tipo,
      entidadId: crudo.entidadId ?? crudo.entidad_id,
    }),
  };
}

/** Lista de avisos de { data: [...] } o de un arreglo; descarta los inválidos y conserva el orden. */
export function normalizarAvisos(crudo: unknown): Aviso[] {
  return listaDe(crudo, ['data'])
    .map(normalizarAviso)
    .filter((aviso): aviso is Aviso => aviso !== null);
}

function rutaAviso(id: string): string {
  return `/api/notificaciones/${encodeURIComponent(id)}`;
}

// ── Llamadas a la API (todas con sesión) ───────────────────────────────────────────────────

/** Avisos de la clienta, del más reciente al más viejo: GET /api/notificaciones. */
export function listarAvisos(): Promise<Aviso[]> {
  return apiGet<unknown>('/api/notificaciones').then(normalizarAvisos);
}

/**
 * Marca un aviso como leído: PUT /api/notificaciones/:id { leida: true } → { success, data }. El id
 * es un uuid (ParseUUIDPipe: uno inválido da 400); uno ajeno da 403 y uno borrado, 404.
 */
export function marcarAvisoLeido(id: string): Promise<void> {
  return apiPut<unknown>(rutaAviso(id), { leida: true }).then(() => undefined);
}

/** Marca todos los avisos como leídos: PATCH /api/notificaciones/leidas → { success, count }. */
export function marcarTodosLeidos(): Promise<void> {
  return apiPatch<unknown>('/api/notificaciones/leidas').then(() => undefined);
}

/** Borra un aviso: DELETE /api/notificaciones/:id → { success, message }. */
export function borrarAviso(id: string): Promise<void> {
  return apiDelete<unknown>(rutaAviso(id)).then(() => undefined);
}

// ── Errores ────────────────────────────────────────────────────────────────────────────────

const MENSAJES_ERROR_AVISOS: Record<AccionAvisos, string> = {
  cargar: 'No pudimos cargar tus avisos. Intenta de nuevo.',
  marcar: 'No pudimos marcar el aviso como leído. Intenta de nuevo.',
  marcarTodas: 'No pudimos marcar tus avisos como leídos. Intenta de nuevo.',
  borrar: 'No pudimos borrar el aviso. Intenta de nuevo.',
};

/** El servidor respondió 404: el aviso ya no existe (por ejemplo, se borró desde otra sesión). */
export function esAvisoInexistente(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * Mensaje para la clienta al fallar una acción de avisos. Nunca el texto técnico del servidor: sin
 * red y sesión terminada (401) usan los mensajes comunes; un 404 al marcar o borrar uno, que ya no
 * existe; lo demás, el mensaje de la acción.
 */
export function mensajeErrorAvisos(error: unknown, accion: AccionAvisos): string {
  const comun = mensajeSinContexto(error);
  if (comun) {
    return comun;
  }
  if (esAvisoInexistente(error) && (accion === 'marcar' || accion === 'borrar')) {
    return 'Ese aviso ya no existe.';
  }
  return MENSAJES_ERROR_AVISOS[accion];
}
