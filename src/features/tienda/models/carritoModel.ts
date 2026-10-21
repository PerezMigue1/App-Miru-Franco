import { MENSAJE_SIN_CONEXION, esErrorDeRed } from '@/features/auth/models/AuthModel';
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from '@/shared/api/apiClient';
import { esObjeto, listaDe, primeraImagen, texto, type Crudo } from '@/features/inicio/models/inicioService';

import { aCentavos } from './productoModel';

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

export const MENSAJE_SESION_TERMINADA = 'Tu sesión terminó. Inicia sesión de nuevo.';

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

/** Quita un ítem: DELETE /api/carrito/:id → { success, message }. */
export function quitarDelCarrito(itemId: number): Promise<void> {
  return apiDelete<unknown>(`/api/carrito/${encodeURIComponent(String(itemId))}`).then(() => undefined);
}

/**
 * Quita varios ítems (el backend no tiene "vaciar carrito"): al crear el pedido, el carrito no se
 * vacía solo. Nunca lanza: un ítem que no se pudo quitar se queda y la clienta lo ve en su carrito.
 */
export async function vaciarCarrito(itemIds: number[]): Promise<void> {
  await Promise.allSettled(itemIds.map(quitarDelCarrito));
}

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

/** Sin red o sesión terminada (401): lo común a toda la tienda. null si no es ninguno. */
export function mensajeComunTienda(error: unknown): string | null {
  if (esErrorDeRed(error) || (error instanceof ApiError && error.status === 0)) {
    return MENSAJE_SIN_CONEXION;
  }
  if (error instanceof ApiError && error.status === 401) {
    return MENSAJE_SESION_TERMINADA;
  }
  return null;
}

/** PUT del carrito sin existencias (403 "Stock insuficiente") o POST de pedido sin stock (400). */
export function esSinExistencias(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 403 || error.status === 400) &&
    error.message.toLowerCase().includes('stock')
  );
}

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
    // 400 "Presentación no encontrada" o "Presentación no disponible".
    if (error.status === 400 && mensaje.includes('presentaci')) {
      return 'Esta presentación ya no está disponible.';
    }
    if (error.status === 404) {
      return 'Este producto ya no está en tu carrito.';
    }
  }
  return 'No pudimos actualizar tu carrito. Intenta de nuevo en un momento.';
}
