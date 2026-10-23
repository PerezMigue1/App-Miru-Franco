import { ApiError, apiDelete, apiGet, apiPost, apiPut } from '@/shared/api/apiClient';
import { esObjeto, listaDe, primeraImagen, texto, type Crudo } from '@/features/inicio/models/inicioService';
import { alCerrarSesion } from '@/shared/api/eventosSesion';
import { mensajeSinContexto } from '@/shared/api/mensajesError';
import { generacionActual } from '@/shared/api/tokenStorage';

import { aCentavos, obtenerProducto } from './productoModel';

/**
 * Ítem del carrito del servidor. GET /api/carrito trae { id, cantidad, precioReferencia, activo,
 * productoId, presentacionId, producto: {fila completa}, presentacion: {fila completa} } y ningún
 * total: los totales se calculan aquí.
 */
export interface ItemCarrito {
  /** Id del ítem del carrito (no de la presentación): es el de PUT y DELETE /api/carrito/:id. */
  id: number;
  productoId: number;
  presentacionId: number;
  cantidad: number;
  nombre: string;
  marca: string;
  /** "500ml"; vacío si no viene. */
  tamanio: string;
  imagen?: string;
  /** Precio actual de la presentación en centavos (el pedido usa el del servidor). */
  precioCentavos: number;
  /** Existencias actuales de la presentación. */
  stock: number;
  disponible: boolean;
}

/** Línea para agregar al carrito desde el detalle del producto. */
export interface LineaCarrito {
  productoId: number;
  presentacionId: number;
  /** Piezas que se quieren sumar a las que ya hay en el carrito. */
  cantidad: number;
  /** Existencias de la presentación: el total nunca pasa de aquí. */
  stock: number;
}

/** Resultado de agregar: cuántas se sumaron, cuántas quedaron en el carrito y si se topó a las existencias. */
export interface ResultadoAgregar {
  /** Piezas que de verdad se sumaron (0 si ya estaban todas las existencias en el carrito). */
  agregadas: number;
  cantidadEnCarrito: number;
  topado: boolean;
}

// ── Normalizadores ─────────────────────────────────────────────────────────────────────────

function enteroPositivo(valor: unknown): number {
  const numero = Number(texto(valor));
  return Number.isInteger(numero) && numero > 0 ? numero : 0;
}

function normalizarItem(crudo: Crudo): ItemCarrito | null {
  const producto = esObjeto(crudo.producto) ? crudo.producto : undefined;
  const presentacion = esObjeto(crudo.presentacion) ? crudo.presentacion : undefined;
  const id = enteroPositivo(crudo.id);
  const productoId = enteroPositivo(crudo.productoId ?? producto?.id);
  const presentacionId = enteroPositivo(crudo.presentacionId ?? presentacion?.id);
  if (id === 0 || productoId === 0 || presentacionId === 0 || crudo.activo === false) {
    return null;
  }
  return {
    id,
    productoId,
    presentacionId,
    cantidad: Math.max(1, enteroPositivo(crudo.cantidad)),
    nombre: texto(producto?.nombre),
    marca: texto(producto?.marca),
    tamanio: texto(presentacion?.tamanio),
    imagen: primeraImagen(presentacion?.imagenes, producto?.imagenes),
    precioCentavos: aCentavos(presentacion?.precio) || aCentavos(crudo.precioReferencia),
    stock: Math.max(0, Math.floor(Number(presentacion?.stock) || 0)),
    disponible: presentacion?.disponible === true,
  };
}

// ── Llamadas a la API (con sesión) ─────────────────────────────────────────────────────────

/** Carrito de la clienta: GET /api/carrito → { success, count, data[] } (más reciente primero). */
export function obtenerCarrito(): Promise<ItemCarrito[]> {
  return apiGet<unknown>('/api/carrito').then((respuesta) =>
    listaDe(respuesta, ['data', 'items'])
      .map(normalizarItem)
      .filter((item): item is ItemCarrito => item !== null),
  );
}

/**
 * Agrega piezas al carrito. POST /api/carrito reemplaza la cantidad de esa presentación (es un
 * upsert) y no revisa existencias, así que primero se lee el carrito, se suma lo que ya había y
 * el total se topa a `stock`. Si ya estaba todo el stock en el carrito no se envía nada.
 */
export async function agregarAlCarrito(linea: LineaCarrito): Promise<ResultadoAgregar> {
  const actual = await obtenerCarrito();
  const enCarrito = actual.find((item) => item.presentacionId === linea.presentacionId)?.cantidad ?? 0;
  const deseado = enCarrito + Math.max(1, Math.floor(linea.cantidad));
  const total = Math.min(deseado, linea.stock);
  if (total <= enCarrito) {
    return { agregadas: 0, cantidadEnCarrito: enCarrito, topado: true };
  }
  await apiPost<unknown>('/api/carrito', {
    productoId: linea.productoId,
    presentacionId: linea.presentacionId,
    cantidad: total,
  });
  return { agregadas: total - enCarrito, cantidadEnCarrito: total, topado: total < deseado };
}

/**
 * Cambia la cantidad de un ítem: PUT /api/carrito/:id { cantidad }. Sin existencias responde 403
 * "Stock insuficiente" (ver esSinExistencias).
 */
export function actualizarCantidad(itemId: number, cantidad: number): Promise<void> {
  return apiPut<unknown>(`/api/carrito/${encodeURIComponent(String(itemId))}`, {
    cantidad: Math.max(1, Math.floor(cantidad)),
  }).then(() => undefined);
}

/**
 * Quita un ítem: DELETE /api/carrito/:id → { success, message }. Lo quita también de la memoria del
 * carrito (lo quitó la clienta o la app: que ya no esté después no es un producto retirado).
 */
export function quitarDelCarrito(itemId: number): Promise<void> {
  memoriaDeSesion().vistos.delete(itemId);
  return apiDelete<unknown>(`/api/carrito/${encodeURIComponent(String(itemId))}`).then(() => undefined);
}

/**
 * Quita varios ítems (el backend no tiene "vaciar carrito"): al crear el pedido, el carrito no se
 * vacía solo. Nunca lanza: un ítem que no se pudo quitar se queda y la clienta lo ve en su carrito.
 */
export async function vaciarCarrito(itemIds: number[]): Promise<void> {
  await Promise.allSettled(itemIds.map(quitarDelCarrito));
}

// ── Artículos que se dejaron de vender (GP-07.5) ───────────────────────────────────────────

/**
 * Artículo que se quitó del carrito porque ya no se vende: su producto se desactivó (GET
 * /api/carrito ya no lo lista) o su presentación quedó no disponible. Solo nombre y tamaño.
 */
export interface ArticuloRetirado {
  itemId: number;
  nombre: string;
  tamanio: string;
  motivo: 'producto' | 'presentacion';
}

export interface CarritoRevisado {
  /** Lo que sí se puede comprar (sin los retirados). */
  items: ItemCarrito[];
  /** Lo que se quitó en esta revisión. */
  retirados: ArticuloRetirado[];
}

interface ArticuloVisto {
  productoId: number;
  nombre: string;
  tamanio: string;
}

interface MemoriaCarrito {
  generacion: number;
  /** Última lista vista en esta sesión, por id del ítem. */
  vistos: Map<number, ArticuloVisto>;
  /** Retirados que todavía no se le avisan a la clienta en el carrito. */
  porAvisar: ArticuloRetirado[];
}

/**
 * Memoria del carrito (Singleton de módulo por sesión): la última lista vista, para notar lo que el
 * servidor dejó de listar sin que la clienta lo quitara, y los avisos pendientes. Solo guarda el
 * nombre y el tamaño de cada artículo; si cambia la sesión (generacionActual), empieza de cero.
 */
let memoria: MemoriaCarrito = { generacion: generacionActual(), vistos: new Map(), porAvisar: [] };

function memoriaDeSesion(): MemoriaCarrito {
  const generacion = generacionActual();
  if (memoria.generacion !== generacion) {
    memoria = { generacion, vistos: new Map(), porAvisar: [] };
  }
  return memoria;
}

/**
 * El producto ya no está en la tienda (GET /api/productos/:id responde 404 si se desactivó): true;
 * sigue a la venta: false; sin respuesta clara: null (no se afirma nada y se revisa en la siguiente
 * lectura).
 */
async function productoRetirado(productoId: number): Promise<boolean | null> {
  try {
    await obtenerProducto(productoId);
    return false;
  } catch (error) {
    return error instanceof ApiError && error.status === 404 ? true : null;
  }
}

/**
 * Lee el carrito y quita lo que se dejó de vender ANTES de pagar. GET /api/carrito omite los
 * artículos de productos desactivados, así que se compara con la última lista vista en la sesión:
 * lo que desapareció sin que la clienta lo quitara y cuyo producto ya no está en la tienda se da por
 * retirado (si sigue a la venta, se quitó en otro lado y no se avisa). Una presentación con
 * disponible en false también se retira. Cada retirado se borra con DELETE (nunca lanza: si falla,
 * el aviso igual se da) y queda por avisar (tomarAvisosCarrito). Lanza solo si falla la lectura.
 */
export async function obtenerCarritoRevisado(): Promise<CarritoRevisado> {
  const lista = await obtenerCarrito();
  const sesion = memoriaDeSesion();
  const enLista = new Set(lista.map((item) => item.id));
  const retirados: ArticuloRetirado[] = lista
    .filter((item) => !item.disponible)
    .map((item) => ({ itemId: item.id, nombre: item.nombre, tamanio: item.tamanio, motivo: 'presentacion' }));
  const desaparecidos = [...sesion.vistos].filter(([id]) => !enLista.has(id));
  const revisiones = await Promise.all(desaparecidos.map(([, visto]) => productoRetirado(visto.productoId)));
  if (sesion.generacion !== generacionActual()) {
    // La sesión cambió mientras se revisaba: nada de esto es de la clienta de ahora.
    return { items: [], retirados: [] };
  }
  const porRevisar = new Map<number, ArticuloVisto>();
  desaparecidos.forEach(([id, visto], indice) => {
    if (revisiones[indice] === true) {
      retirados.push({ itemId: id, nombre: visto.nombre, tamanio: visto.tamanio, motivo: 'producto' });
    } else if (revisiones[indice] === null) {
      porRevisar.set(id, visto);
    }
  });
  const items = lista.filter((item) => item.disponible);
  sesion.vistos = new Map([
    ...porRevisar,
    ...items.map((item): [number, ArticuloVisto] => [
      item.id,
      { productoId: item.productoId, nombre: item.nombre, tamanio: item.tamanio },
    ]),
  ]);
  if (retirados.length > 0) {
    sesion.porAvisar.push(...retirados);
    await vaciarCarrito(retirados.map((retirado) => retirado.itemId));
  }
  return { items, retirados };
}

/** Los retirados que faltaba avisar (se entregan una sola vez). */
export function tomarAvisosCarrito(): ArticuloRetirado[] {
  const sesion = memoriaDeSesion();
  const avisos = sesion.porAvisar;
  sesion.porAvisar = [];
  return avisos;
}

/**
 * Olvida la última lista vista y los avisos pendientes. La usan las pruebas y el cierre de sesión:
 * los nombres de los artículos de la clienta que salió no se quedan en memoria.
 */
export function reiniciarMemoriaCarrito(): void {
  memoria = { generacion: generacionActual(), vistos: new Map(), porAvisar: [] };
}

alCerrarSesion(() => {
  reiniciarMemoriaCarrito();
});

// ── Totales ────────────────────────────────────────────────────────────────────────────────

/** Total del carrito en centavos (precio actual × cantidad). Sin envío: se recoge en el salón. */
export function totalCarrito(items: ItemCarrito[]): number {
  return items.reduce((suma, item) => suma + item.precioCentavos * item.cantidad, 0);
}

/** Piezas en el carrito (suma de cantidades), para el acceso desde la Tienda. */
export function piezasCarrito(items: ItemCarrito[]): number {
  return items.reduce((suma, item) => suma + item.cantidad, 0);
}

/** El ítem ya no se puede comprar o pide más de lo que hay: hay que ajustarlo antes de pagar. */
export function itemConProblema(item: ItemCarrito): boolean {
  return !item.disponible || item.stock <= 0 || item.precioCentavos <= 0 || item.cantidad > item.stock;
}

// ── Errores ────────────────────────────────────────────────────────────────────────────────

/**
 * Lo común a toda la tienda: lo que no depende de la pantalla (sin red, tiempo agotado, sesión
 * terminada, límite de solicitudes o un code conocido; mensajeSinContexto). null si no es nada de eso.
 */
export function mensajeComunTienda(error: unknown): string | null {
  return mensajeSinContexto(error);
}

/** PUT del carrito sin existencias (403 "Stock insuficiente") o POST de pedido sin stock (400). */
export function esSinExistencias(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 403 || error.status === 400) &&
    error.message.toLowerCase().includes('stock')
  );
}

/** Los dos 400 de carrito.service por la presentación, en minúsculas (se comparan completos). */
const MENSAJES_PRESENTACION: readonly string[] = ['presentación no encontrada', 'presentación no disponible'];

/** Mensaje para la clienta al fallar una acción del carrito. Nunca el texto técnico del servidor. */
export function mensajeErrorCarrito(error: unknown): string {
  const comun = mensajeComunTienda(error);
  if (comun) {
    return comun;
  }
  if (esSinExistencias(error)) {
    return 'Ya no hay suficientes piezas de este producto.';
  }
  if (error instanceof ApiError) {
    const mensaje = error.message.toLowerCase();
    // 400 "Este producto ya no está disponible": el producto se desactivó (POST y PUT).
    if (error.status === 400 && mensaje.includes('producto ya no est')) {
      return 'Este producto ya no está disponible.';
    }
    // Solo los dos 400 exactos de carrito.service ("Presentación no encontrada" y "Presentación no
    // disponible"): otro 400 que mencione la presentación no se confunde con este caso.
    if (error.status === 400 && MENSAJES_PRESENTACION.includes(mensaje.trim())) {
      return 'Esta presentación ya no está disponible.';
    }
    if (error.status === 404) {
      return 'Este producto ya no está en tu carrito.';
    }
  }
  return 'No pudimos actualizar tu carrito. Intenta de nuevo en un momento.';
}
