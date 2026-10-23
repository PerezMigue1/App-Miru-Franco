/// <reference types="jest" />

import { CLIENTA_CITAS, cuerpoError, respuestaError, type CuerpoError } from './citasFicticias';
import { RUTAS_DE_FONDO } from './datosClienta';
import { respuesta, servidorConRutas, type Manejador } from './servidorSimulado';

/**
 * Datos ficticios de GP-06.4 (tienda) con la forma real del backend (src/productos y
 * src/ecommerce de backend-miru): productos con presentaciones, ítems del carrito, pedidos con sus
 * artículos, estado del pago en línea, preferencia de Mercado Pago, errores y rutas para
 * servidorConRutas. Los reutilizan las pruebas de los models, de los viewmodels (renderHook) y de
 * integración (renderRouter). Solo datos ficticios; la API de las pruebas es http://api.test.
 *
 * Fechas: el reloj y los ayudantes de fecha (AHORA, usarRelojFijo, isoMexico, enHoraLocal) vienen de
 * citasFicticias, igual que los errores (cuerpoError, respuestaError, errorDe, simularSinRed).
 */

// ── Productos y presentaciones ───────────────────────────────────────────────────────────────

/** Fecha de alta fija de las filas ficticias (no depende del reloj de la prueba). */
export const ALTA_ISO = '2026-09-01T16:00:00.000Z';

/** URL https ficticia de Cloudinary para la foto de un producto. */
export function imagenProducto(nombre: string): string {
  return `https://res.cloudinary.com/ficticio/image/upload/productos/${nombre}.jpg`;
}

/**
 * Fila de producto_presentaciones como la manda Prisma: los Decimal (precio y precioOriginal)
 * llegan como texto ("380", "382.5") y precioOriginal puede ser null.
 */
export interface PresentacionCruda {
  id: number;
  tamanio: string;
  imagenes: string[];
  precio: string;
  precioOriginal: string | null;
  stock: number;
  disponible: boolean;
  fechaCaducidad: string | null;
  creadoEn: string;
  actualizadoEn: string;
  productoId: number;
}

/** Fila de productos sin sus presentaciones (como la incluye el carrito). */
export interface ProductoSinPresentaciones {
  id: number;
  nombre: string;
  marca: string;
  descripcion: string | null;
  descripcionLarga: string | null;
  descuento: number | null;
  categoria: string | null;
  nuevo: boolean;
  crueltyFree: boolean;
  caracteristicas: string[];
  /** Texto con forma de arreglo de Postgres ('{"a","b"}') o texto normal. */
  ingredientes: string | null;
  modoUso: string | null;
  resultado: string | null;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

/** Producto de GET /api/productos y GET /api/productos/:id (include: { presentaciones: true }). */
export interface ProductoCrudo extends ProductoSinPresentaciones {
  presentaciones: PresentacionCruda[];
}

/** Presentación válida y comprable (id 3001 del producto 300, $380, 10 piezas) con los cambios. */
export function presentacionCruda(cambios: Partial<PresentacionCruda> = {}): PresentacionCruda {
  return {
    id: 3001,
    tamanio: '250ml',
    imagenes: [imagenProducto('presentacion-ficticia')],
    precio: '380',
    precioOriginal: null,
    stock: 10,
    disponible: true,
    fechaCaducidad: null,
    creadoEn: ALTA_ISO,
    actualizadoEn: ALTA_ISO,
    productoId: 300,
    ...cambios,
  };
}

/**
 * Producto activo y válido (id 300) con los cambios. Si no se pasan presentaciones, lleva una
 * presentacionCruda con el productoId del producto.
 */
export function productoCrudo(cambios: Partial<ProductoCrudo> = {}): ProductoCrudo {
  const id = cambios.id ?? 300;
  return {
    id,
    nombre: 'Producto ficticio',
    marca: 'Marca Ficticia',
    descripcion: 'Descripción corta ficticia',
    descripcionLarga: 'Descripción larga ficticia del producto.',
    descuento: null,
    categoria: 'Cabello',
    nuevo: false,
    crueltyFree: false,
    caracteristicas: [],
    ingredientes: null,
    modoUso: null,
    resultado: null,
    activo: true,
    creadoEn: ALTA_ISO,
    actualizadoEn: ALTA_ISO,
    presentaciones: [presentacionCruda({ productoId: id })],
    ...cambios,
  };
}

/** Shampoo (301): dos presentaciones con precio distinto ($380 y $620) e ingredientes de Postgres. */
export const SHAMPOO = productoCrudo({
  id: 301,
  nombre: 'Shampoo hidratante',
  marca: 'Botánica Ficticia',
  categoria: 'Cabello',
  caracteristicas: ['Sin sulfatos', 'Uso diario'],
  ingredientes: '{"Aceite de argán","Keratina"}',
  modoUso: '{"Aplicar sobre cabello húmedo."}',
  resultado: 'Cabello suave y brillante',
  presentaciones: [
    presentacionCruda({ id: 3011, productoId: 301, tamanio: '250ml', precio: '380', stock: 10, imagenes: [imagenProducto('shampoo-250')] }),
    presentacionCruda({ id: 3012, productoId: 301, tamanio: '500ml', precio: '620', stock: 4, imagenes: [imagenProducto('shampoo-500')] }),
  ],
});

/** Acondicionador (302): nuevo, 25 % de descuento, precio con centavos y precioOriginal mayor. */
export const ACONDICIONADOR = productoCrudo({
  id: 302,
  nombre: 'Acondicionador reparación',
  marca: 'Botánica Ficticia',
  categoria: 'Cabello',
  descuento: 25,
  nuevo: true,
  presentaciones: [
    presentacionCruda({ id: 3021, productoId: 302, tamanio: '300ml', precio: '382.5', precioOriginal: '510', stock: 6, imagenes: [imagenProducto('acondicionador')] }),
  ],
});

/** Mascarilla (303): agotada (stock 0 aunque esté disponible). */
export const MASCARILLA_AGOTADA = productoCrudo({
  id: 303,
  nombre: 'Mascarilla nutritiva',
  marca: 'Óleo Ficticio',
  categoria: 'Tratamientos',
  presentaciones: [
    presentacionCruda({ id: 3031, productoId: 303, tamanio: '200g', precio: '450', stock: 0, imagenes: [imagenProducto('mascarilla')] }),
  ],
});

/** Sérum (304): sin precio ("0"), así que no se puede comprar aunque tenga piezas. */
export const SERUM_SIN_PRECIO = productoCrudo({
  id: 304,
  nombre: 'Sérum de puntas',
  marca: 'Óleo Ficticio',
  categoria: 'Tratamientos',
  presentaciones: [presentacionCruda({ id: 3041, productoId: 304, tamanio: '30ml', precio: '0', stock: 5, imagenes: [] })],
});

/** Esmalte (305): $1,200, cruelty free, dos presentaciones con el mismo precio. */
export const ESMALTE = productoCrudo({
  id: 305,
  nombre: 'Esmalte en gel',
  marca: 'Uñas Ficticias',
  categoria: 'Uñas',
  crueltyFree: true,
  presentaciones: [
    presentacionCruda({ id: 3051, productoId: 305, tamanio: '15ml', precio: '1200', stock: 3, imagenes: [imagenProducto('esmalte')] }),
    presentacionCruda({ id: 3052, productoId: 305, tamanio: 'Kit', precio: '1200', stock: 2, imagenes: [] }),
  ],
});

/** Crema (306): categoría y nombre con acento al inicio. */
export const CREMA_FACIAL = productoCrudo({
  id: 306,
  nombre: 'Ácido hialurónico facial',
  marca: 'Piel Ficticia',
  categoria: 'Facial',
  presentaciones: [
    presentacionCruda({ id: 3061, productoId: 306, tamanio: '50ml', precio: '299.9', stock: 8, imagenes: [imagenProducto('crema')] }),
  ],
});

/** Producto desactivado (307, borrado lógico): el backend no lo lista y su detalle responde 404. */
export const PRODUCTO_INACTIVO = productoCrudo({
  id: 307,
  nombre: 'Tinte descontinuado',
  activo: false,
  presentaciones: [presentacionCruda({ id: 3071, productoId: 307 })],
});

/**
 * Catálogo de la tienda en el orden del backend (id asc): incluye el agotado y el sin precio entre
 * los demás, y el inactivo (que rutasCatalogoTienda no lista, igual que el backend).
 */
export const CATALOGO_TIENDA_CRUDO: ProductoCrudo[] = [
  SHAMPOO,
  ACONDICIONADOR,
  MASCARILLA_AGOTADA,
  SERUM_SIN_PRECIO,
  ESMALTE,
  CREMA_FACIAL,
  PRODUCTO_INACTIVO,
];

/** Lo que lista GET /api/productos a la clienta: solo los activos. */
export function productosActivos(lista: ProductoCrudo[] = CATALOGO_TIENDA_CRUDO): ProductoCrudo[] {
  return lista.filter((producto) => producto.activo);
}

/** Cuerpo de las listas del backend de la tienda: { success, count, data }. */
export function cuerpoListaTienda(lista: unknown[]): { success: true; count: number; data: unknown[] } {
  return { success: true, count: lista.length, data: lista };
}

/** Cuerpo de un solo registro: { success, data }. */
export function cuerpoDatoTienda(data: unknown): { success: true; data: unknown } {
  return { success: true, data };
}

/** El producto como lo incluye el carrito (include: { producto: true }): sin presentaciones. */
export function sinPresentaciones(producto: ProductoCrudo): ProductoSinPresentaciones {
  const fila: Partial<ProductoCrudo> = { ...producto };
  delete fila.presentaciones;
  return fila as ProductoSinPresentaciones;
}

// ── Carrito ──────────────────────────────────────────────────────────────────────────────────

/**
 * Fila de carrito_items con su producto y su presentación completos, como la manda GET /api/carrito
 * (include: { producto: true, presentacion: true }). precioReferencia es Decimal: texto o null.
 */
export interface ItemCarritoCrudo {
  id: number;
  cantidad: number;
  precioReferencia: string | null;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
  usuarioId: string;
  productoId: number;
  presentacionId: number;
  producto: ProductoSinPresentaciones;
  presentacion: PresentacionCruda;
}

/**
 * Id del ítem del carrito de una presentación. El backend tiene un ítem por clienta y presentación
 * (upsert), así que el id se deriva de la presentación y las rutas PUT y DELETE se pueden armar antes.
 */
export function idItemCarrito(presentacionId: number): number {
  return 80_000 + presentacionId;
}

/**
 * Ítem del carrito de la clienta de sesión (CLIENTA_CITAS) con `cantidad` piezas de la presentación
 * (por omisión, la primera del producto).
 */
export function itemCarritoCrudo(
  producto: ProductoCrudo,
  cantidad = 1,
  cambios: Partial<ItemCarritoCrudo> = {},
): ItemCarritoCrudo {
  const presentacion = cambios.presentacion ?? producto.presentaciones[0];
  return {
    id: idItemCarrito(presentacion.id),
    cantidad,
    precioReferencia: null,
    activo: true,
    creadoEn: ALTA_ISO,
    actualizadoEn: ALTA_ISO,
    usuarioId: CLIENTA_CITAS.id,
    productoId: producto.id,
    presentacionId: presentacion.id,
    producto: sinPresentaciones(producto),
    presentacion,
    ...cambios,
  };
}

/** Carrito de ejemplo: 2 shampoos de 250ml y 1 acondicionador (el más reciente primero). */
export const CARRITO_CRUDO: ItemCarritoCrudo[] = [
  itemCarritoCrudo(ACONDICIONADOR, 1),
  itemCarritoCrudo(SHAMPOO, 2),
];

// ── Pedidos y artículos ──────────────────────────────────────────────────────────────────────

// Importaciones de esta sección (se pueden juntar con las de arriba al cerrar el archivo).
import type { ItemPedido, LineaPedido, Pedido } from '@/features/tienda/models/pedidoModel';

import { AHORA_ISO, MINUTO_MS } from './citasFicticias';

/** Id del pedido ficticio: en línea con Mercado Pago y pendiente de pago. */
export const ID_PEDIDO = 701;
/** Cuándo se creó el pedido ficticio: AHORA (lunes 19 de octubre, 10:00 en México). */
export const CREADO_EN_PEDIDO_ISO = AHORA_ISO;

/** Los dos métodos de pago de la clienta en la app (los dos se recogen en el salón). */
export const METODO_EN_LINEA = 'mercado_pago';
export const METODO_EN_SALON = 'pago_en_salon';

/** Estados del pedido en el backend (EstadoPedido de Prisma). */
export const ESTADOS_PEDIDO = [
  'borrador',
  'pendiente_pago',
  'pagado',
  'preparando',
  'listo_recoger',
  'enviado',
  'entregado',
  'cancelado',
] as const;

/** El instante ISO `minutos` después de `iso`. */
export function isoMasMinutos(iso: string, minutos: number): string {
  return new Date(Date.parse(iso) + minutos * MINUTO_MS).toISOString();
}

/** Importe como lo manda Prisma (Decimal a texto): 1142.5 da "1142.5" y 760 da "760". */
export function importeTexto(pesos: number): string {
  return String(Math.round(pesos * 100) / 100);
}

/** Reglas con que se creó el pedido (instantaneaReglasPedido del backend con sus valores por omisión). */
export const REGLAS_PEDIDO = {
  plazoPagoLineaHoras: 24,
  diasPrepararApartado: 3,
  diaRecordatorioRecoger: 3,
  diasCancelarNoRecogido: 7,
  diasResguardoPagado: 15,
  diasCambioProducto: 7,
  diasHabilesRevocacion: 5,
  diasInhabiles: [] as string[],
};

/**
 * Fila de pedido_items con su producto y su presentación (include: { producto: true, presentacion:
 * true }). precioUnitario y subtotal son Decimal: llegan como texto ("380", "760").
 */
export interface ItemPedidoCrudo {
  id: number;
  pedidoId: number;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  nombreProducto: string | null;
  tamanio: string | null;
  productoId: number;
  presentacionId: number;
  producto: ProductoSinPresentaciones;
  presentacion: PresentacionCruda;
}

/** Pedido de GET /api/pedidos?propios=true y GET o POST /api/pedidos (includeDefault del backend). */
export interface PedidoCrudo {
  id: number;
  usuarioId: string;
  estado: string;
  subtotal: string;
  costoEnvio: string;
  impuestos: string;
  descuento: string;
  total: string;
  moneda: string;
  direccionTextoCompleta: string | null;
  notasCliente: string | null;
  metodoPago: string | null;
  reglas: unknown;
  referenciaPago: string | null;
  pagadoEn: string | null;
  creadoEn: string;
  actualizadoEn: string;
  direccionEnvioId: string | null;
  direccionEnvio: unknown;
  usuario: { id: string; nombre: string; email: string };
  items: ItemPedidoCrudo[];
}

/** Id del artículo del pedido de una presentación (uno por presentación en los pedidos ficticios). */
export function idArticuloPedido(presentacionId: number): number {
  return 90_000 + presentacionId;
}

/**
 * Artículo del pedido con `cantidad` piezas de la presentación (por omisión, la primera del
 * producto): precio y subtotal salen de la presentación, como los calcula el backend al crear.
 */
export function itemPedidoCrudo(
  producto: ProductoCrudo,
  cantidad = 1,
  cambios: Partial<ItemPedidoCrudo> = {},
): ItemPedidoCrudo {
  const presentacion = cambios.presentacion ?? producto.presentaciones[0];
  return {
    id: idArticuloPedido(presentacion.id),
    pedidoId: ID_PEDIDO,
    cantidad,
    precioUnitario: presentacion.precio,
    subtotal: importeTexto(Number(presentacion.precio) * cantidad),
    nombreProducto: producto.nombre,
    tamanio: presentacion.tamanio,
    productoId: producto.id,
    presentacionId: presentacion.id,
    producto: sinPresentaciones(producto),
    presentacion,
    ...cambios,
  };
}

/** Los artículos del carrito de ejemplo: 2 shampoos de 250ml ($760) y 1 acondicionador ($382.50). */
export const ARTICULOS_PEDIDO: ItemPedidoCrudo[] = [itemPedidoCrudo(SHAMPOO, 2), itemPedidoCrudo(ACONDICIONADOR, 1)];

/** Total del pedido ficticio como texto: $1,142.50. */
export const TOTAL_PEDIDO = '1142.5';

/** Líneas que manda la app para crear el pedido con ARTICULOS_PEDIDO (en el mismo orden). */
export const LINEAS_PEDIDO: LineaPedido[] = [
  { productoId: 301, presentacionId: 3011, cantidad: 2 },
  { productoId: 302, presentacionId: 3021, cantidad: 1 },
];

/**
 * Pedido crudo de la clienta de sesión: en línea, pendiente de pago, creado en AHORA, con
 * ARTICULOS_PEDIDO (o los `items` indicados). Subtotal y total salen de los artículos.
 */
export function pedidoCrudo(cambios: Partial<PedidoCrudo> = {}): PedidoCrudo {
  const id = cambios.id ?? ID_PEDIDO;
  const items = (cambios.items ?? ARTICULOS_PEDIDO).map((item) => ({ ...item, pedidoId: id }));
  const suma = importeTexto(items.reduce((total, item) => total + Number(item.subtotal), 0));
  const creadoEn = cambios.creadoEn ?? CREADO_EN_PEDIDO_ISO;
  return {
    id,
    usuarioId: CLIENTA_CITAS.id,
    estado: 'pendiente_pago',
    subtotal: suma,
    costoEnvio: '0',
    impuestos: '0',
    descuento: '0',
    total: suma,
    moneda: 'MXN',
    direccionTextoCompleta: null,
    notasCliente: null,
    metodoPago: METODO_EN_LINEA,
    reglas: REGLAS_PEDIDO,
    referenciaPago: null,
    pagadoEn: null,
    creadoEn,
    actualizadoEn: creadoEn,
    direccionEnvioId: null,
    direccionEnvio: null,
    usuario: { id: CLIENTA_CITAS.id, nombre: CLIENTA_CITAS.nombre, email: CLIENTA_CITAS.email },
    ...cambios,
    items,
  };
}

/** Apartado (id 702): pago al recoger en el salón, pendiente de pago. */
export function pedidoApartado(cambios: Partial<PedidoCrudo> = {}): PedidoCrudo {
  return pedidoCrudo({ id: 702, metodoPago: METODO_EN_SALON, ...cambios });
}

/** Pedido en línea ya pagado (id 703): pagadoEn 20 minutos después de crearse. */
export function pedidoPagado(cambios: Partial<PedidoCrudo> = {}): PedidoCrudo {
  const creadoEn = cambios.creadoEn ?? CREADO_EN_PEDIDO_ISO;
  return pedidoCrudo({
    id: 703,
    estado: 'pagado',
    pagadoEn: isoMasMinutos(creadoEn, 20),
    referenciaPago: 'pago-ficticio-1',
    ...cambios,
  });
}

/** Pedido en línea pagado que ya avanzó a `estado` (preparando, listo_recoger, entregado o cancelado). */
export function pedidoEnEstado(estado: string, cambios: Partial<PedidoCrudo> = {}): PedidoCrudo {
  return pedidoPagado({ estado, ...cambios });
}

/** Pedido viejo registrado en la web: pagado en efectivo (en mayúsculas) y entregado (id 708). */
export function pedidoDeLaWeb(cambios: Partial<PedidoCrudo> = {}): PedidoCrudo {
  return pedidoEnEstado('entregado', { id: 708, metodoPago: 'EFECTIVO', referenciaPago: null, ...cambios });
}

/** Instante ISO `dias` días antes de AHORA. */
function haceDias(dias: number): string {
  return isoMasMinutos(AHORA_ISO, -dias * 24 * 60);
}

/**
 * Pedidos de la clienta del más reciente al más viejo, como los ordena el backend: el en línea por
 * pagar (701), el apartado (702), uno pagado (703), uno en preparación (704), un apartado listo para
 * recoger (705), uno entregado (706), uno cancelado (707) y uno de la web en efectivo (708).
 */
export const MIS_PEDIDOS_CRUDOS: PedidoCrudo[] = [
  pedidoCrudo(),
  pedidoApartado({ creadoEn: haceDias(1) }),
  pedidoPagado({ creadoEn: haceDias(2) }),
  pedidoEnEstado('preparando', { id: 704, creadoEn: haceDias(3) }),
  pedidoApartado({ id: 705, estado: 'listo_recoger', creadoEn: haceDias(4) }),
  pedidoEnEstado('entregado', { id: 706, creadoEn: haceDias(10) }),
  pedidoEnEstado('cancelado', { id: 707, creadoEn: haceDias(12) }),
  pedidoDeLaWeb({ creadoEn: haceDias(40) }),
];

/** Cuerpo de un pedido: { success: true, data }. */
export function cuerpoPedido(pedido: unknown = pedidoCrudo()): { success: true; data: unknown } {
  return cuerpoDatoTienda(pedido);
}

/** Cuerpo de GET /api/pedidos?propios=true: { success, count, page, limit, totalPages, data }. */
export function cuerpoMisPedidos(lista: unknown[] = MIS_PEDIDOS_CRUDOS): unknown {
  return { success: true, count: lista.length, page: 1, limit: 100, totalPages: 1, data: lista };
}

/** Reembolso de la cancelación de un pedido pagado: monto en pesos como número (Number(total)). */
export interface ReembolsoCrudo {
  estado: string;
  monto: number;
}

/** Reembolso del pedido ficticio (por omisión, ya pedido a Mercado Pago por $1,142.50). */
export function reembolsoCrudo(estado = 'reembolsado', monto = Number(TOTAL_PEDIDO)): ReembolsoCrudo {
  return { estado, monto };
}

/** Cuerpo de PUT /api/pedidos/:id?propios=true al cancelar: el pedido cancelado y, si estaba pagado, el reembolso. */
export function cuerpoCancelarPedido(pedido: PedidoCrudo = pedidoPagado(), reembolso?: ReembolsoCrudo): unknown {
  return { success: true, data: { ...pedido, estado: 'cancelado' }, ...(reembolso ? { reembolso } : {}) };
}

/** Artículos de pedidoCrudo() tal como los entrega el modelo (escritos a mano). */
export const ARTICULOS_PEDIDO_NORMALIZADOS: ItemPedido[] = [
  {
    id: 93011,
    productoId: 301,
    presentacionId: 3011,
    nombre: 'Shampoo hidratante',
    tamanio: '250ml',
    cantidad: 2,
    precioUnitarioCentavos: 38_000,
    subtotalCentavos: 76_000,
    imagen: imagenProducto('shampoo-250'),
  },
  {
    id: 93021,
    productoId: 302,
    presentacionId: 3021,
    nombre: 'Acondicionador reparación',
    tamanio: '300ml',
    cantidad: 1,
    precioUnitarioCentavos: 38_250,
    subtotalCentavos: 38_250,
    imagen: imagenProducto('acondicionador'),
  },
];

/** REGLAS_PEDIDO como las entrega el modelo (GP-07.5): solo los enteros, sin los días inhábiles. */
export const REGLAS_PEDIDO_NORMALIZADAS = {
  plazoPagoLineaHoras: REGLAS_PEDIDO.plazoPagoLineaHoras,
  diasPrepararApartado: REGLAS_PEDIDO.diasPrepararApartado,
  diaRecordatorioRecoger: REGLAS_PEDIDO.diaRecordatorioRecoger,
  diasCancelarNoRecogido: REGLAS_PEDIDO.diasCancelarNoRecogido,
  diasResguardoPagado: REGLAS_PEDIDO.diasResguardoPagado,
  diasCambioProducto: REGLAS_PEDIDO.diasCambioProducto,
  diasHabilesRevocacion: REGLAS_PEDIDO.diasHabilesRevocacion,
};

/** pedidoCrudo() tal como lo entrega el modelo (escrito a mano), con los cambios indicados. */
export function pedidoNormalizado(cambios: Partial<Pedido> = {}): Pedido {
  return {
    id: ID_PEDIDO,
    estado: 'pendiente_pago',
    metodoPago: METODO_EN_LINEA,
    subtotalCentavos: 114_250,
    totalCentavos: 114_250,
    creadoEn: CREADO_EN_PEDIDO_ISO,
    pagadoEn: null,
    items: ARTICULOS_PEDIDO_NORMALIZADOS,
    piezas: 3,
    // GP-07.5: el modelo normaliza las reglas guardadas (sin los días inhábiles) y los datos de la
    // revocación del detalle, que pedidoCrudo() no trae.
    reglas: REGLAS_PEDIDO_NORMALIZADAS,
    revocableHasta: null,
    puedeRevocar: false,
    montoRevocableCentavos: null,
    ...cambios,
  };
}


/**
 * El pedido que crearía el backend con el cuerpo de POST /api/pedidos: estado y método del cuerpo,
 * y un artículo por línea con el producto del catálogo que tiene esa presentación (si no la
 * encuentra, la primera del shampoo), creado en `ahora`.
 */
export function pedidoDesdeCuerpo(cuerpo: unknown, ahora: Date = new Date()): PedidoCrudo {
  const datos = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>;
  const lineas = (Array.isArray(datos.items) ? datos.items : []) as Partial<LineaPedido>[];
  const items = lineas.map((linea) => {
    const producto =
      CATALOGO_TIENDA_CRUDO.find((p) => p.presentaciones.some((pr) => pr.id === linea.presentacionId)) ?? SHAMPOO;
    const presentacion = producto.presentaciones.find((pr) => pr.id === linea.presentacionId) ?? producto.presentaciones[0];
    return itemPedidoCrudo(producto, Number(linea.cantidad) || 1, { presentacion });
  });
  return pedidoCrudo({
    estado: typeof datos.estado === 'string' ? datos.estado : 'borrador',
    metodoPago: typeof datos.metodoPago === 'string' ? datos.metodoPago : null,
    creadoEn: ahora.toISOString(),
    items,
  });
}

/** Mensajes reales del backend al crear y al cancelar un pedido (pedidos.service.ts). */
export const MENSAJES_PEDIDOS = {
  stockInsuficiente: 'Stock insuficiente o presentación no disponible (producto Shampoo hidratante)',
  presentacionNoEncontrada: 'Presentación 3011 no encontrada',
  productoNoALaVenta: 'Este producto ya no está a la venta (Shampoo hidratante)',
  sinPrecioValido: 'Este producto no tiene precio válido (Sérum de puntas)',
  eligeComoPagar: 'Elige cómo pagar el pedido: en línea o al recoger en el salón.',
  pagoEnLineaNoDisponible: 'El pago en línea no está disponible por ahora. Elige pagar al recoger en el salón.',
  pagoAlRecogerNoDisponible: 'El pago al recoger no está disponible por ahora. Elige pagar en línea.',
  pedidoNoEncontrado: 'Pedido no encontrado',
  soloPersonalCambiaEstado:
    'Solo el personal del salón cambia el estado del pedido. Puedes cancelarlo mientras no esté en preparación.',
  pedidoCambio: 'El pedido cambió mientras lo editabas. Recarga para ver su estado.',
  devolucionEnProceso: 'Este pedido tiene una devolución en proceso: para cancelarlo comunícate con el salón.',
} as const;

/** Cuerpos de error del backend al crear (POST) y al cancelar (PUT) un pedido. */
export const ERRORES_PEDIDOS = {
  /** 400 de POST: sin piezas suficientes o presentación no disponible. */
  stockInsuficiente: cuerpoError(400, MENSAJES_PEDIDOS.stockInsuficiente),
  /** 404 de POST: la presentación ya no existe. */
  presentacionNoEncontrada: cuerpoError(404, MENSAJES_PEDIDOS.presentacionNoEncontrada),
  productoNoALaVenta: cuerpoError(400, MENSAJES_PEDIDOS.productoNoALaVenta),
  sinPrecioValido: cuerpoError(400, MENSAJES_PEDIDOS.sinPrecioValido),
  eligeComoPagar: cuerpoError(400, MENSAJES_PEDIDOS.eligeComoPagar),
  pagoEnLineaNoDisponible: cuerpoError(400, MENSAJES_PEDIDOS.pagoEnLineaNoDisponible),
  pagoAlRecogerNoDisponible: cuerpoError(400, MENSAJES_PEDIDOS.pagoAlRecogerNoDisponible),
  /** 404 de GET o PUT: el pedido no existe o es de otra clienta. */
  pedidoNoEncontrado: cuerpoError(404, MENSAJES_PEDIDOS.pedidoNoEncontrado),
  /** 403 de PUT: el pedido ya se está preparando. */
  soloPersonalCambiaEstado: cuerpoError(403, MENSAJES_PEDIDOS.soloPersonalCambiaEstado),
  /** 409 de PUT: otra petición cambió el estado primero. */
  pedidoCambio: cuerpoError(409, MENSAJES_PEDIDOS.pedidoCambio),
  /** 409 de PUT: el pedido tiene una devolución activa. */
  devolucionEnProceso: cuerpoError(409, MENSAJES_PEDIDOS.devolucionEnProceso),
} satisfies Record<string, CuerpoError>;

export const RUTA_CREAR_PEDIDO = 'POST /api/pedidos?propios=true';
export const RUTA_MIS_PEDIDOS = 'GET /api/pedidos?propios=true&limit=100&sort=creadoEn:desc';

/** "GET /api/pedidos/:id?propios=true". */
export function rutaPedido(id: string | number = ID_PEDIDO): string {
  return `GET /api/pedidos/${encodeURIComponent(String(id))}?propios=true`;
}

/** "PUT /api/pedidos/:id?propios=true" (cancelar con { estado: 'cancelado' }). */
export function rutaCancelarPedido(id: string | number = ID_PEDIDO): string {
  return `PUT /api/pedidos/${encodeURIComponent(String(id))}?propios=true`;
}

// ── Pago en línea de pedidos ─────────────────────────────────────────────────────────────────

/** initPoint ficticio del checkout de Mercado Pago México (www.mercadopago.com.mx). */
export const INIT_POINT_PEDIDO = 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=ficticio-1';

/** Cuerpo de POST /api/pagos-en-linea/mercadopago/preferencia: { initPoint } sin envoltura. */
export function preferenciaPedidoCruda(initPoint: unknown = INIT_POINT_PEDIDO): { initPoint: unknown } {
  return { initPoint };
}

/** Deep link con el que el backend regresa a la app tras pagar (escrito a mano para compararlo). */
export function deepLinkPedido(pedidoId: string | number = ID_PEDIDO): string {
  return `appmirufranco://pedido/${pedidoId}?retorno=mp`;
}

/** Estados de GET /api/pagos-en-linea/mercadopago/estado/:pedidoId (EstadoPagoEnLinea del backend). */
export const ESTADOS_PAGO_PEDIDO = ['aprobado', 'pendiente', 'rechazado', 'revision', 'sin_pago', 'cancelado'] as const;

/** Respuesta cruda del estado del pago (sin envoltura). */
export interface EstadoPagoPedidoCrudo {
  estado: string;
  pedidoEstado: string;
}

/**
 * Estado del pago con el estado del pedido que le corresponde: aprobado trae el pedido pagado,
 * cancelado lo trae cancelado y los demás, pendiente de pago.
 */
export function estadoPagoPedidoCrudo(estado: string, pedidoEstado?: string): EstadoPagoPedidoCrudo {
  const porEstado: Record<string, string> = { aprobado: 'pagado', cancelado: 'cancelado' };
  return { estado, pedidoEstado: pedidoEstado ?? porEstado[estado] ?? 'pendiente_pago' };
}

/** Estados del pedido que el backend ya da por pagados al consultar el pago. */
const PEDIDO_YA_PAGADO = ['pagado', 'preparando', 'listo_recoger', 'entregado'];

/**
 * Estado del pago como lo calcula el backend sin pagos en Mercado Pago: ya pagado da aprobado,
 * cancelado da cancelado y lo demás sin_pago.
 */
export function estadoPagoDe(pedido: PedidoCrudo): EstadoPagoPedidoCrudo {
  if (PEDIDO_YA_PAGADO.includes(pedido.estado)) {
    return estadoPagoPedidoCrudo('aprobado', pedido.estado);
  }
  return estadoPagoPedidoCrudo(pedido.estado === 'cancelado' ? 'cancelado' : 'sin_pago', pedido.estado);
}

/** Mensajes reales del backend al pedir la preferencia de un pedido (pagos-en-linea.service.ts). */
export const MENSAJES_PAGO_PEDIDO = {
  pedidoNoEncontrado: 'Pedido no encontrado',
  sinPermiso: 'No tienes permiso para pagar este pedido',
  enSalon: 'Este pedido se paga al recogerlo en el salón',
  noPendiente: 'Este pedido ya no está pendiente de pago',
  vencido: 'Este pedido venció: vuelve a hacer tu compra',
  total: 'El total del pedido no coincide con sus productos. Contáctanos para revisarlo.',
  noDisponible: 'El pago en línea no está disponible por ahora.',
} as const;

/** Cuerpos de error del backend al pedir la preferencia (403 y 503 no llevan nombre HTTP). */
export const ERRORES_PAGO_PEDIDO = {
  pedidoNoEncontrado: cuerpoError(404, MENSAJES_PAGO_PEDIDO.pedidoNoEncontrado),
  sinPermiso: cuerpoError(403, MENSAJES_PAGO_PEDIDO.sinPermiso),
  /** 400: el pedido es un apartado (pago al recoger). */
  enSalon: cuerpoError(400, MENSAJES_PAGO_PEDIDO.enSalon),
  noPendiente: cuerpoError(409, MENSAJES_PAGO_PEDIDO.noPendiente),
  /** 409: pasó el plazo de pago en línea (creadoEn + plazoPagoLineaHoras). */
  vencido: cuerpoError(409, MENSAJES_PAGO_PEDIDO.vencido),
  total: cuerpoError(409, MENSAJES_PAGO_PEDIDO.total),
  /** 503: Mercado Pago sin configurar o sin URL de regreso. */
  noDisponible: cuerpoError(503, MENSAJES_PAGO_PEDIDO.noDisponible),
} satisfies Record<string, CuerpoError>;

export const RUTA_PREFERENCIA_PEDIDO = 'POST /api/pagos-en-linea/mercadopago/preferencia?origen=app';

/** "GET /api/pagos-en-linea/mercadopago/estado/:pedidoId". */
export function rutaEstadoPagoPedido(pedidoId: string | number = ID_PEDIDO): string {
  return `GET /api/pagos-en-linea/mercadopago/estado/${encodeURIComponent(String(pedidoId))}`;
}

/** "GET /api/devoluciones/pedido/:pedidoId?propios=true" (GP-07.5). */
export function rutaDevolucionesPedido(pedidoId: string | number = ID_PEDIDO): string {
  return `GET /api/devoluciones/pedido/${encodeURIComponent(String(pedidoId))}?propios=true`;
}

/** "GET /api/pagos/pedido/:pedidoId?propios=true" (GP-07.5). */
export function rutaPagosPedido(pedidoId: string | number = ID_PEDIDO): string {
  return `GET /api/pagos/pedido/${encodeURIComponent(String(pedidoId))}?propios=true`;
}

/** Estados del pedido que ya tienen un pago aprobado (el de Mercado Pago o el del salón). */
const PEDIDO_CON_PAGO = ['pagado', 'preparando', 'listo_recoger', 'entregado'];

/**
 * Pagos del pedido como los lista el backend (GP-07.5): uno aprobado por el total si el pedido ya se
 * pagó; ninguno si no. Sin payload ni referencias.
 */
export function pagosDe(pedido: PedidoCrudo): unknown[] {
  if (!PEDIDO_CON_PAGO.includes(pedido.estado) || !pedido.pagadoEn) {
    return [];
  }
  return [
    {
      id: 80_000 + pedido.id,
      pedidoId: pedido.id,
      intentoNumero: 1,
      monto: pedido.total,
      moneda: 'MXN',
      metodo: pedido.metodoPago ?? 'efectivo',
      estado: 'aprobado',
      pagadoEn: pedido.pagadoEn,
      reembolsadoEn: null,
      creadoEn: pedido.pagadoEn,
    },
  ];
}

/**
 * Rutas de pedidos y pago en línea para servidorConRutas: la lista de `pedidos` (por omisión
 * MIS_PEDIDOS_CRUDOS), crear (pedidoDesdeCuerpo con lo que mande la app, id ID_PEDIDO), la
 * preferencia (INIT_POINT_PEDIDO) y, por pedido, su detalle, cancelar (lo devuelve cancelado; con
 * reembolso si estaba pagado: reembolsado en línea, en_revision con otro método) y el estado del pago.
 */
export function rutasPedidos(pedidos: PedidoCrudo[] = MIS_PEDIDOS_CRUDOS): Record<string, Manejador> {
  const rutas: Record<string, Manejador> = {
    [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos(pedidos)),
    [RUTA_CREAR_PEDIDO]: (cuerpo) => respuesta(cuerpoPedido(pedidoDesdeCuerpo(cuerpo)), 201),
    [RUTA_PREFERENCIA_PEDIDO]: () => respuesta(preferenciaPedidoCruda(), 201),
  };
  for (const pedido of pedidos) {
    const reembolso =
      pedido.estado === 'pagado'
        ? reembolsoCrudo(pedido.metodoPago === METODO_EN_LINEA ? 'reembolsado' : 'en_revision', Number(pedido.total))
        : undefined;
    rutas[rutaPedido(pedido.id)] = () => respuesta(cuerpoPedido(pedido));
    rutas[rutaCancelarPedido(pedido.id)] = () => respuesta(cuerpoCancelarPedido(pedido, reembolso));
    rutas[rutaEstadoPagoPedido(pedido.id)] = () => respuesta(estadoPagoDe(pedido));
    // GP-07.5: el detalle también lee sus devoluciones (ninguna) y sus pagos.
    rutas[rutaDevolucionesPedido(pedido.id)] = () => respuesta(cuerpoListaTienda([]));
    rutas[rutaPagosPedido(pedido.id)] = () => respuesta(cuerpoListaTienda(pagosDe(pedido)));
  }
  return rutas;
}

// ── Rutas y servidor simulado de la tienda ───────────────────────────────────────────────────

export const RUTA_CATALOGO_TIENDA = 'GET /api/productos';
export const RUTA_CARRITO = 'GET /api/carrito';
export const RUTA_AGREGAR_CARRITO = 'POST /api/carrito';

/** "GET /api/productos/:id". */
export function rutaProducto(id: string | number): string {
  return `GET /api/productos/${encodeURIComponent(String(id))}`;
}

/** "PUT /api/carrito/:id" (id del ítem, no de la presentación). */
export function rutaCambiarCantidad(itemId: string | number): string {
  return `PUT /api/carrito/${encodeURIComponent(String(itemId))}`;
}

/** "DELETE /api/carrito/:id" (id del ítem, no de la presentación). */
export function rutaQuitarDelCarrito(itemId: string | number): string {
  return `DELETE /api/carrito/${encodeURIComponent(String(itemId))}`;
}

/** Mensajes reales del backend de productos y carrito (productos.service y carrito.service). */
export const MENSAJES_TIENDA = {
  productoNoEncontrado: 'Producto no encontrado',
  presentacionNoEncontrada: 'Presentación no encontrada',
  productoNoDisponible: 'Este producto ya no está disponible',
  presentacionNoDisponible: 'Presentación no disponible',
  stockInsuficiente: 'Stock insuficiente',
  itemNoEncontrado: 'Ítem de carrito no encontrado',
  itemEliminado: 'Ítem eliminado del carrito',
} as const;

/** Cuerpos de error del backend de la tienda. */
export const ERRORES_TIENDA = {
  /** 404 de GET /api/productos/:id: no existe o está desactivado. */
  productoNoEncontrado: cuerpoError(404, MENSAJES_TIENDA.productoNoEncontrado),
  /** 400 de POST /api/carrito. */
  presentacionNoEncontrada: cuerpoError(400, MENSAJES_TIENDA.presentacionNoEncontrada),
  /** 400 de POST y PUT del carrito con el producto desactivado. */
  productoNoDisponible: cuerpoError(400, MENSAJES_TIENDA.productoNoDisponible),
  /** 400 de POST /api/carrito con la presentación no disponible. */
  presentacionNoDisponible: cuerpoError(400, MENSAJES_TIENDA.presentacionNoDisponible),
  /** 403 de PUT /api/carrito/:id cuando la cantidad pasa de las existencias. */
  stockInsuficiente: { ...cuerpoError(403, MENSAJES_TIENDA.stockInsuficiente), error: 'Forbidden' },
  /** 404 de PUT y DELETE /api/carrito/:id. */
  itemNoEncontrado: cuerpoError(404, MENSAJES_TIENDA.itemNoEncontrado),
} satisfies Record<string, CuerpoError>;

/**
 * Rutas públicas del catálogo como el backend: la lista solo con los activos y el detalle de cada
 * producto por id (404 si está desactivado).
 */
export function rutasCatalogoTienda(lista: ProductoCrudo[] = CATALOGO_TIENDA_CRUDO): Record<string, Manejador> {
  const rutas: Record<string, Manejador> = {
    [RUTA_CATALOGO_TIENDA]: () => respuesta(cuerpoListaTienda(productosActivos(lista))),
  };
  for (const producto of lista) {
    rutas[rutaProducto(producto.id)] = () =>
      producto.activo
        ? respuesta(cuerpoDatoTienda(producto))
        : respuestaError(ERRORES_TIENDA.productoNoEncontrado);
  }
  return rutas;
}

/** Carrito con estado en memoria para una prueba. */
export interface CarritoSimulado {
  /** Manejadores de GET, POST, PUT y DELETE del carrito para servidorConRutas. */
  rutas: Record<string, Manejador>;
  /** Ítems guardados ahora, incluidos los de productos desactivados (que GET no lista). */
  items: () => ItemCarritoCrudo[];
}

interface CuerpoAgregar {
  presentacionId: number;
  cantidad: number;
  precioReferencia?: number | string;
}

/**
 * Carrito que se comporta como carrito.service del backend, con su propio estado (una llamada,
 * un carrito nuevo: nada se comparte entre pruebas). GET lista los ítems activos de productos
 * activos, el más reciente primero; POST es un upsert por presentación que reemplaza la cantidad y
 * no revisa existencias (400 si la presentación no existe, si el producto está desactivado o si no
 * está disponible); PUT { cantidad } responde 403 si pasa del stock de la presentación del ítem
 * y 404 si el ítem no existe; DELETE quita el ítem. Las rutas PUT y DELETE quedan listas para cada
 * presentación del catálogo y cada ítem inicial (idItemCarrito).
 */
export function carritoSimulado(
  opciones: { catalogo?: ProductoCrudo[]; items?: ItemCarritoCrudo[] } = {},
): CarritoSimulado {
  const catalogo = opciones.catalogo ?? CATALOGO_TIENDA_CRUDO;
  let items = (opciones.items ?? []).map((item) => ({ ...item }));

  const reemplazar = (nuevo: ItemCarritoCrudo) => {
    items = items.map((item) => (item.id === nuevo.id ? nuevo : item));
  };

  const agregar: Manejador = (cuerpo) => {
    const { presentacionId, cantidad, precioReferencia } = cuerpo as CuerpoAgregar;
    const producto = catalogo.find((p) => p.presentaciones.some((pr) => pr.id === presentacionId));
    const presentacion = producto?.presentaciones.find((pr) => pr.id === presentacionId);
    if (!producto || !presentacion) return respuestaError(ERRORES_TIENDA.presentacionNoEncontrada);
    if (!producto.activo) return respuestaError(ERRORES_TIENDA.productoNoDisponible);
    if (!presentacion.disponible) return respuestaError(ERRORES_TIENDA.presentacionNoDisponible);
    const referencia = precioReferencia === undefined ? {} : { precioReferencia: String(precioReferencia) };
    const previo = items.find((item) => item.presentacionId === presentacionId);
    const item = previo
      ? { ...previo, cantidad, activo: true, ...referencia }
      : itemCarritoCrudo(producto, cantidad, { presentacion, ...referencia });
    items = previo ? items : [item, ...items];
    reemplazar(item);
    return respuesta(cuerpoDatoTienda(item), 201);
  };

  const cambiar = (id: number): Manejador => (cuerpo) => {
    const item = items.find((i) => i.id === id);
    if (!item) return respuestaError(ERRORES_TIENDA.itemNoEncontrado);
    if (!item.producto.activo) return respuestaError(ERRORES_TIENDA.productoNoDisponible);
    const { cantidad } = cuerpo as { cantidad?: number };
    if (cantidad !== undefined && item.presentacion.stock < cantidad) {
      return respuestaError(ERRORES_TIENDA.stockInsuficiente);
    }
    const nuevo = cantidad === undefined ? item : { ...item, cantidad };
    reemplazar(nuevo);
    return respuesta(cuerpoDatoTienda(nuevo));
  };

  const quitar = (id: number): Manejador => () => {
    if (!items.some((item) => item.id === id)) return respuestaError(ERRORES_TIENDA.itemNoEncontrado);
    items = items.filter((item) => item.id !== id);
    return respuesta({ success: true, message: MENSAJES_TIENDA.itemEliminado });
  };

  const rutas: Record<string, Manejador> = {
    [RUTA_CARRITO]: () =>
      respuesta(cuerpoListaTienda(items.filter((item) => item.activo && item.producto.activo))),
    [RUTA_AGREGAR_CARRITO]: agregar,
  };
  const ids = new Set([
    ...catalogo.flatMap((producto) => producto.presentaciones.map((pr) => idItemCarrito(pr.id))),
    ...items.map((item) => item.id),
  ]);
  for (const id of ids) {
    rutas[rutaCambiarCantidad(id)] = cambiar(id);
    rutas[rutaQuitarDelCarrito(id)] = quitar(id);
  }
  return { rutas, items: () => items };
}

/**
 * Servidor simulado de la tienda: lo de fondo (datosClienta) y el catálogo de CATALOGO_TIENDA_CRUDO.
 * Las rutas de cada prueba van encima (por ejemplo, carritoSimulado().rutas); lo demás responde 404.
 * No guarda estado: el carrito con estado lo arma cada prueba.
 */
export const simularServidorTienda = servidorConRutas({ ...RUTAS_DE_FONDO, ...rutasCatalogoTienda() });

// ── Integración ──────────────────────────────────────────────────────────────────────────────

/**
 * Catálogo de `cantidad` productos activos y comprables (ids 401 en adelante), sin marca (la tarjeta
 * muestra la categoría), para las páginas.
 */
export function catalogoLargo(cantidad: number): ProductoCrudo[] {
  return Array.from({ length: cantidad }, (_, i) =>
    productoCrudo({ id: 401 + i, nombre: `Producto ficticio ${i + 1}`, marca: '', categoria: 'Cabello' }),
  );
}

/** Aceite (310): una sola presentación con tres fotos, para la galería del detalle. */
export const ACEITE_CON_GALERIA = productoCrudo({
  id: 310,
  nombre: 'Aceite de argán',
  marca: 'Botánica Ficticia',
  categoria: 'Cabello',
  presentaciones: [
    presentacionCruda({
      id: 3101,
      productoId: 310,
      tamanio: '',
      precio: '540',
      stock: 2,
      imagenes: ['frente', 'reverso', 'textura'].map((foto) => imagenProducto(`aceite-${foto}`)),
    }),
  ],
});

// ── Viewmodels ───────────────────────────────────────────────────────────────────────────────

/** Gel (309): categoría Facial y "piel grasa" en la descripción, para los filtros de piel del catálogo. */
export const GEL_PIEL_GRASA = productoCrudo({
  id: 309,
  nombre: 'Gel limpiador',
  marca: 'Piel Ficticia',
  descripcion: 'Limpieza diaria para piel grasa',
  categoria: 'Facial',
  presentaciones: [presentacionCruda({ id: 3091, productoId: 309, tamanio: '150ml', precio: '250' })],
});

/**
 * Producto (311) con la primera presentación agotada y la segunda con una sola pieza y sin fotos
 * propias (el detalle elige la segunda y muestra las fotos del producto).
 */
export const PRODUCTO_UNA_PIEZA = productoCrudo({
  id: 311,
  nombre: 'Tónico capilar',
  presentaciones: [
    presentacionCruda({ id: 3111, productoId: 311, stock: 0 }),
    presentacionCruda({ id: 3112, productoId: 311, tamanio: '100ml', stock: 1, imagenes: [] }),
  ],
});

/** Producto (312) con su única presentación marcada como no disponible aunque tenga piezas. */
export const PRODUCTO_NO_DISPONIBLE = productoCrudo({
  id: 312,
  nombre: 'Spray fijador',
  presentaciones: [presentacionCruda({ id: 3121, productoId: 312, disponible: false })],
});

/** Producto (313) sin presentaciones: no hay nada que elegir ni comprar. */
export const PRODUCTO_SIN_PRESENTACIONES = productoCrudo({ id: 313, nombre: 'Peine ficticio', presentaciones: [] });
