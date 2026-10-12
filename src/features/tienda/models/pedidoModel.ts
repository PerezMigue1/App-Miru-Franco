import { ApiError, apiGet, apiPost, apiPut } from '@/shared/api/apiClient';
import type { EtiquetaEstado } from '@/features/citas/models/citaModel';
import { fechaLegible, horaLegible } from '@/features/citas/models/citaModel';
import { esObjeto, listaDe, primeraImagen, texto, urlHttps, type Crudo } from '@/features/inicio/models/inicioService';

import { mensajeComunTienda } from './carritoModel';
import { aCentavos } from './productoModel';

/** Cómo paga la clienta su pedido. Los dos se recogen en el salón: no hay envío a domicilio. */
export type MetodoPago = 'mercado_pago' | 'pago_en_salon';

/**
 * Estados del pedido en el backend. En línea: pendiente_pago → pagado → preparando → listo_recoger
 * → entregado. Al recoger (apartado): pendiente_pago → preparando → listo_recoger → entregado.
 * 'borrador' y 'enviado' solo existen en pedidos viejos o de la web.
 */
export type EstadoPedido =
  | 'borrador'
  | 'pendiente_pago'
  | 'pagado'
  | 'preparando'
  | 'listo_recoger'
  | 'enviado'
  | 'entregado'
  | 'cancelado';

/**
 * Artículo del pedido: { id, cantidad, precioUnitario: "199", subtotal: "398", nombreProducto,
 * tamanio, productoId, presentacionId, producto: {fila}, presentacion: {fila con imagenes} }.
 */
export interface ItemPedido {
  id: number;
  productoId: number;
  presentacionId: number;
  nombre: string;
  /** "500ml"; vacío si no viene. */
  tamanio: string;
  cantidad: number;
  precioUnitarioCentavos: number;
  subtotalCentavos: number;
  imagen?: string;
}

/**
 * Pedido de la clienta (GET /api/pedidos/:id?propios=true → { success, data }). Los importes llegan
 * como texto; no hay campo de plazo: el de pago en línea es creadoEn + 24 h (limitePagoPedido).
 */
export interface Pedido {
  id: number;
  /** Texto crudo del backend (ver EstadoPedido); un estado nuevo se muestra como "Sin estado". */
  estado: string;
  /** 'mercado_pago', 'pago_en_salon' u otro texto de pedidos de la web ('' si no viene). */
  metodoPago: string;
  subtotalCentavos: number;
  totalCentavos: number;
  /** ISO tal como lo manda el servidor. */
  creadoEn: string;
  pagadoEn: string | null;
  items: ItemPedido[];
  /** Suma de las cantidades de sus artículos. */
  piezas: number;
}

/** Línea del pedido nuevo (POST /api/pedidos): sale del carrito. */
export interface LineaPedido {
  productoId: number;
  presentacionId: number;
  cantidad: number;
}

/**
 * Estado del pago en línea (GET /api/pagos-en-linea/mercadopago/estado/:pedidoId):
 * aprobado (también si el pedido ya va en preparando, listo o entregado), pendiente (Mercado Pago lo
 * procesa), rechazado, revision (pagó pero falta revisarlo), sin_pago y cancelado (el pedido).
 */
export type EstadoPagoPedido = 'aprobado' | 'pendiente' | 'rechazado' | 'revision' | 'sin_pago' | 'cancelado';

export interface ResultadoEstadoPago {
  estado: EstadoPagoPedido;
  /** Estado del pedido tal como lo ve el servidor ('' si no viene). */
  pedidoEstado: string;
}

/** Motivo de un error al pedir la preferencia de Mercado Pago (el backend no manda code). */
export type MotivoConflictoPedido = 'noPendiente' | 'vencido' | 'total' | 'enSalon' | 'noDisponible';

/**
 * Regreso de Mercado Pago a la app: el backend (con ?origen=app) redirige a
 * appmirufranco://pedido/<id>?retorno=mp. Lo atiende openAuthSessionAsync, no Expo Router.
 */
export const REDIRECCION_PEDIDO = 'appmirufranco://pedido';

/**
 * initPoint aceptado: solo el checkout de Mercado Pago México (www, o sandbox si algún día se usa
 * sandbox_init_point). La diagonal justo después del host impide trucos con "@" o subdominios.
 */
const INIT_POINT_MERCADO_PAGO = /^https:\/\/(www|sandbox)\.mercadopago\.com\.mx\//;

/** Margen para el reloj del teléfono al buscar un pedido recién creado tras un error de red. */
const MARGEN_PEDIDO_RECIENTE_MS = 5 * 60 * 1000;

/** Un pedido en línea sin pagar se cancela a las 24 h de crearse (VIGENCIA_PEDIDO_EN_LINEA_MS). */
export const VIGENCIA_PAGO_EN_LINEA_MS = 24 * 60 * 60 * 1000;

/**
 * Datos del salón para recoger: el backend no los expone a la clienta. Son los mismos de la web
 * (utils/contactoSalon.ts y components/tienda/DatosRecogerEnSalon.tsx).
 */
export const SALON_RECOGER = {
  nombre: 'Mirú Franco Beauty Salón',
  direccion: 'Huejutla de Reyes, Hidalgo',
  telefono: '+52 771 268 1432',
  telefonoMarcable: 'tel:+527712681432',
  horario: ['Lunes a viernes de 9:30 a 19:30 h.', 'Sábados de 9:30 a 19:00 h.', 'Domingos cerrado.'],
  aviso:
    'Suele estar listo en 24 a 48 horas hábiles. Te avisamos en la app y por correo cuando puedas pasar por él.',
} as const;

// ── Normalizadores ─────────────────────────────────────────────────────────────────────────

function enteroPositivo(valor: unknown): number {
  const numero = Number(texto(valor));
  return Number.isInteger(numero) && numero > 0 ? numero : 0;
}

function normalizarItem(crudo: Crudo): ItemPedido | null {
  const producto = esObjeto(crudo.producto) ? crudo.producto : undefined;
  const presentacion = esObjeto(crudo.presentacion) ? crudo.presentacion : undefined;
  const id = enteroPositivo(crudo.id);
  if (id === 0) {
    return null;
  }
  const cantidad = Math.max(1, enteroPositivo(crudo.cantidad));
  const precioUnitarioCentavos = aCentavos(crudo.precioUnitario);
  return {
    id,
    productoId: enteroPositivo(crudo.productoId ?? producto?.id),
    presentacionId: enteroPositivo(crudo.presentacionId ?? presentacion?.id),
    nombre: texto(crudo.nombreProducto) || texto(producto?.nombre),
    tamanio: texto(crudo.tamanio) || texto(presentacion?.tamanio),
    cantidad,
    precioUnitarioCentavos,
    subtotalCentavos: aCentavos(crudo.subtotal) || precioUnitarioCentavos * cantidad,
    imagen: primeraImagen(presentacion?.imagenes, producto?.imagenes),
  };
}

function normalizarPedido(crudo: Crudo): Pedido | null {
  const id = enteroPositivo(crudo.id);
  if (id === 0) {
    return null;
  }
  const items = Array.isArray(crudo.items)
    ? crudo.items
        .filter(esObjeto)
        .map(normalizarItem)
        .filter((item): item is ItemPedido => item !== null)
    : [];
  const subtotalCentavos = aCentavos(crudo.subtotal);
  return {
    id,
    estado: texto(crudo.estado),
    metodoPago: texto(crudo.metodoPago).toLowerCase(),
    subtotalCentavos,
    totalCentavos: aCentavos(crudo.total) || subtotalCentavos,
    creadoEn: texto(crudo.creadoEn),
    pagadoEn: texto(crudo.pagadoEn) || null,
    items,
    piezas: items.reduce((suma, item) => suma + item.cantidad, 0),
  };
}

function pedidoDe(respuesta: unknown): Pedido {
  const crudo = esObjeto(respuesta) && esObjeto(respuesta.data) ? respuesta.data : undefined;
  const pedido = crudo ? normalizarPedido(crudo) : null;
  if (!pedido) {
    throw new Error('Respuesta de pedido sin datos.');
  }
  return pedido;
}

function idParaRuta(id: string | number): string {
  return encodeURIComponent(String(id).trim());
}

// ── Llamadas a la API (todas con sesión) ───────────────────────────────────────────────────

/**
 * Crea el pedido: POST /api/pedidos?propios=true. Se manda estado 'pendiente_pago' (sin él queda
 * en 'borrador' y no se puede pagar ni vence). El backend toma los precios de su base, descuenta
 * las existencias y responde { success, data }. NO vacía el carrito (ver vaciarCarrito). Sin stock
 * responde 400 "Stock insuficiente…" (esSinExistencias).
 */
export function crearPedido(lineas: LineaPedido[], metodoPago: MetodoPago): Promise<Pedido> {
  return apiPost<unknown>('/api/pedidos?propios=true', {
    estado: 'pendiente_pago',
    moneda: 'MXN',
    metodoPago,
    items: lineas.map((linea) => ({
      productoId: linea.productoId,
      presentacionId: linea.presentacionId,
      cantidad: linea.cantidad,
    })),
  }).then(pedidoDe);
}

/**
 * Pedidos de la clienta, del más reciente al más viejo: GET /api/pedidos?propios=true. Responde
 * { success, count, page, limit, totalPages, data[] } con los artículos de cada pedido.
 */
export function listarMisPedidos(): Promise<Pedido[]> {
  return apiGet<unknown>('/api/pedidos?propios=true&limit=100&sort=creadoEn:desc').then((respuesta) =>
    listaDe(respuesta, ['data', 'pedidos'])
      .map(normalizarPedido)
      .filter((pedido): pedido is Pedido => pedido !== null),
  );
}

/** Las líneas del pedido son exactamente las enviadas (misma presentación y cantidad, sin orden). */
function mismasLineas(pedido: Pedido, lineas: LineaPedido[]): boolean {
  const clave = (presentacionId: number, cantidad: number) => `${presentacionId}x${cantidad}`;
  const delPedido = pedido.items.map((item) => clave(item.presentacionId, item.cantidad)).sort();
  const enviadas = lineas.map((linea) => clave(linea.presentacionId, linea.cantidad)).sort();
  return delPedido.length === enviadas.length && delPedido.every((valor, i) => valor === enviadas[i]);
}

/**
 * Tras un error de red al crear el pedido, el servidor pudo haberlo creado y perder la respuesta
 * (el backend no tiene clave de idempotencia). Busca un pedido pendiente de pago, con el mismo
 * método y exactamente las mismas líneas, creado desde `desdeMs` (con margen para el reloj del
 * teléfono). Nunca lanza: null si no hay o no se pudo consultar.
 */
export async function buscarPedidoRecienCreado(
  lineas: LineaPedido[],
  metodoPago: MetodoPago,
  desdeMs: number,
): Promise<Pedido | null> {
  try {
    const pedidos = await listarMisPedidos();
    return (
      pedidos.find((pedido) => {
        const creado = new Date(pedido.creadoEn).getTime();
        return (
          pedido.estado === 'pendiente_pago' &&
          pedido.metodoPago === metodoPago &&
          !Number.isNaN(creado) &&
          creado >= desdeMs - MARGEN_PEDIDO_RECIENTE_MS &&
          mismasLineas(pedido, lineas)
        );
      }) ?? null
    );
  } catch {
    return null;
  }
}

/** Un pedido de la clienta: GET /api/pedidos/:id?propios=true. Uno ajeno llega como 404. */
export function obtenerPedido(id: string | number): Promise<Pedido> {
  if (enteroPositivo(id) === 0) {
    return Promise.reject(new ApiError(404, 'Pedido no encontrado'));
  }
  return apiGet<unknown>(`/api/pedidos/${idParaRuta(id)}?propios=true`).then(pedidoDe);
}

/**
 * Cancela el pedido: PUT /api/pedidos/:id?propios=true { estado: 'cancelado' } (sin motivo: el
 * backend no lo acepta). Solo en pendiente_pago o pagado; las existencias regresan a la tienda.
 * Responde { success, data } con el pedido ya cancelado. Errores: mensajeCancelarPedido.
 */
export function cancelarPedido(id: string | number): Promise<Pedido> {
  return apiPut<unknown>(`/api/pedidos/${idParaRuta(id)}?propios=true`, { estado: 'cancelado' }).then(
    (respuesta) =>
      esObjeto(respuesta) && esObjeto(respuesta.data) ? pedidoDe(respuesta) : obtenerPedido(id),
  );
}

/**
 * URL de Mercado Pago para pagar el pedido: POST /api/pagos-en-linea/mercadopago/preferencia?origen=app
 * { pedidoId }. Responde { initPoint } sin envoltura; con origen=app, Mercado Pago regresa a
 * REDIRECCION_PEDIDO. Los errores se clasifican con motivoConflictoPedido.
 */
export function crearPreferenciaPedido(pedidoId: string | number): Promise<string> {
  return apiPost<unknown>('/api/pagos-en-linea/mercadopago/preferencia?origen=app', {
    pedidoId: enteroPositivo(pedidoId),
  }).then((respuesta) => {
    const url = esObjeto(respuesta) ? urlHttps(respuesta.initPoint) : undefined;
    // Defensa en profundidad: nunca se abre en la sesión del navegador una página que no sea Mercado Pago.
    if (!url || !INIT_POINT_MERCADO_PAGO.test(url)) {
      throw new Error('Respuesta de preferencia sin initPoint.');
    }
    return url;
  });
}

const ESTADOS_PAGO: readonly EstadoPagoPedido[] = [
  'aprobado',
  'pendiente',
  'rechazado',
  'revision',
  'sin_pago',
  'cancelado',
];

/**
 * Estado real del pago: GET /api/pagos-en-linea/mercadopago/estado/:pedidoId → { estado,
 * pedidoEstado } sin envoltura. Si Mercado Pago ya aprobó y el webhook no ha llegado, el backend lo
 * aplica en esta misma consulta. Un estado desconocido cuenta como 'sin_pago'.
 */
export function obtenerEstadoPagoPedido(pedidoId: string | number): Promise<ResultadoEstadoPago> {
  return apiGet<unknown>(`/api/pagos-en-linea/mercadopago/estado/${idParaRuta(pedidoId)}`).then(
    (respuesta) => {
      const crudo = esObjeto(respuesta) ? respuesta : {};
      const estado = texto(crudo.estado) as EstadoPagoPedido;
      return {
        estado: ESTADOS_PAGO.includes(estado) ? estado : 'sin_pago',
        pedidoEstado: texto(crudo.pedidoEstado),
      };
    },
  );
}

// ── Reglas del pedido ──────────────────────────────────────────────────────────────────────

/** Estados en los que la clienta puede cancelar: mientras el salón no empieza a prepararlo. */
const ESTADOS_CANCELABLES: readonly string[] = ['pendiente_pago', 'pagado'];

export function esPagoEnLinea(pedido: Pick<Pedido, 'metodoPago'>): boolean {
  return pedido.metodoPago === 'mercado_pago';
}

export function esPagoEnSalon(pedido: Pick<Pedido, 'metodoPago'>): boolean {
  return pedido.metodoPago === 'pago_en_salon';
}

/** La clienta puede cancelarlo: pendiente_pago o pagado. */
export function puedeCancelar(pedido: Pick<Pedido, 'estado'>): boolean {
  return ESTADOS_CANCELABLES.includes(pedido.estado);
}

/** Momento (ms) en que vence el pago en línea: creadoEn + 24 h. null si no hay fecha válida. */
export function vencimientoPagoMs(pedido: Pick<Pedido, 'creadoEn'>): number | null {
  const creado = new Date(pedido.creadoEn).getTime();
  return Number.isNaN(creado) ? null : creado + VIGENCIA_PAGO_EN_LINEA_MS;
}

/**
 * Plazo del pago en línea con fecha y hora locales: 'sábado 18 de octubre, 6:30 p. m.'. null si
 * el pedido no es en línea pendiente de pago o no hay fecha válida.
 */
export function limitePagoPedido(pedido: Pick<Pedido, 'creadoEn' | 'estado' | 'metodoPago'>): string | null {
  if (!esPagoEnLinea(pedido) || pedido.estado !== 'pendiente_pago') {
    return null;
  }
  const vence = vencimientoPagoMs(pedido);
  if (vence === null) {
    return null;
  }
  const fecha = new Date(vence);
  return `${fechaLegible(fecha)}, ${horaLegible(fecha)}`;
}

/** Pedido en línea pendiente de pago y todavía dentro de sus 24 horas: se puede (re)intentar pagar. */
export function pidePagoEnLinea(
  pedido: Pick<Pedido, 'creadoEn' | 'estado' | 'metodoPago'>,
  ahora: number = Date.now(),
): boolean {
  const vence = vencimientoPagoMs(pedido);
  return esPagoEnLinea(pedido) && pedido.estado === 'pendiente_pago' && vence !== null && vence > ahora;
}

const ETIQUETAS_PEDIDO: Record<string, EtiquetaEstado> = {
  borrador: { texto: 'Borrador', tono: 'aviso' },
  pendiente_pago: { texto: 'Pendiente de pago', tono: 'aviso' },
  pagado: { texto: 'Pagado', tono: 'exito' },
  preparando: { texto: 'En preparación', tono: 'neutro' },
  listo_recoger: { texto: 'Listo para recoger', tono: 'exito' },
  enviado: { texto: 'Enviado', tono: 'neutro' },
  entregado: { texto: 'Entregado en el salón', tono: 'neutro' },
  cancelado: { texto: 'Cancelado', tono: 'neutro' },
};

const ETIQUETA_APARTADO: EtiquetaEstado = { texto: 'Apartado, pagas al recoger', tono: 'aviso' };
const ETIQUETA_DESCONOCIDA: EtiquetaEstado = { texto: 'Sin estado', tono: 'neutro' };

/** Insignia del estado (textos de la web); el apartado pendiente dice que se paga al recoger. */
export function etiquetaEstadoPedido(pedido: Pick<Pedido, 'estado' | 'metodoPago'>): EtiquetaEstado {
  if (pedido.estado === 'pendiente_pago' && esPagoEnSalon(pedido)) {
    return ETIQUETA_APARTADO;
  }
  return Object.prototype.hasOwnProperty.call(ETIQUETAS_PEDIDO, pedido.estado)
    ? ETIQUETAS_PEDIDO[pedido.estado]
    : ETIQUETA_DESCONOCIDA;
}

const METODOS_PAGO: Record<string, string> = {
  mercado_pago: 'En línea con Mercado Pago',
  pago_en_salon: 'Pago al recoger en el salón',
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta_terminal: 'Tarjeta en terminal',
};

/** Forma de pago legible (textos de la web); vacío: 'Sin especificar'. */
export function etiquetaMetodoPago(metodoPago: string): string {
  if (!metodoPago) {
    return 'Sin especificar';
  }
  return Object.prototype.hasOwnProperty.call(METODOS_PAGO, metodoPago)
    ? METODOS_PAGO[metodoPago]
    : metodoPago.split('_').join(' ');
}

/** Forma de pago corta para la lista de pedidos; los métodos viejos de la web usan etiquetaMetodoPago. */
export function formaPagoCorta(metodoPago: string): string {
  if (metodoPago === 'mercado_pago') {
    return 'Pago en línea';
  }
  if (metodoPago === 'pago_en_salon') {
    return 'Pago en el salón';
  }
  return etiquetaMetodoPago(metodoPago);
}

/**
 * Qué sigue para la clienta según el estado (textos de la web, mis-pedidos/[id]). null en
 * cancelado, enviado o un estado desconocido.
 */
export function textoQueSigue(
  pedido: Pick<Pedido, 'estado' | 'metodoPago' | 'creadoEn'>,
  ahora: number = Date.now(),
): string | null {
  switch (pedido.estado) {
    case 'pendiente_pago':
      if (esPagoEnSalon(pedido)) {
        return 'Tu pedido está apartado. Lo preparamos y te avisamos cuando puedas pasar a pagarlo y recogerlo.';
      }
      if (esPagoEnLinea(pedido)) {
        // Vencido pero aún sin cancelar (el backend lo cancela en su siguiente revisión).
        const vence = vencimientoPagoMs(pedido);
        if (vence !== null && vence <= ahora) {
          return 'El plazo de 24 horas para pagar terminó. Este pedido se cancelará y los productos vuelven a la tienda.';
        }
        return 'Falta completar tu pago en Mercado Pago. Tienes 24 horas desde que hiciste el pedido.';
      }
      return 'Estamos confirmando tu pago. Después lo preparamos y te avisamos.';
    case 'pagado':
      return 'Pago recibido. Lo preparamos y te avisamos cuando esté listo para recoger.';
    case 'preparando':
      return 'Estamos preparando tu pedido. Te avisamos en la app y por correo cuando esté listo.';
    case 'listo_recoger':
      return esPagoEnSalon(pedido)
        ? 'Tu pedido está listo. Pasa por él al salón y págalo en el mostrador.'
        : 'Tu pedido está listo. Pasa por él al salón.';
    case 'entregado':
      return 'Recogiste tu pedido en el salón.';
    default:
      return null;
  }
}

/**
 * Texto de la confirmación para cancelar. Un pedido pagado no se reembolsa solo (el backend no lo
 * hace): se le dice a la clienta a quién escribir, sin prometer nada más.
 */
export function textoCancelarPedido(pedido: Pick<Pedido, 'estado'>): string {
  const base = 'Se cancela tu pedido y los productos vuelven a la tienda. Esta acción no se puede deshacer.';
  return pedido.estado === 'pagado'
    ? `${base} Como ya lo pagaste, escríbenos a contacto@mirufranco.com para la devolución de tu pago.`
    : base;
}

/** Fecha y hora locales del pedido: 'sábado 11 de octubre, 6:30 p. m.' ('' si no es válida). */
export function fechaPedido(pedido: Pick<Pedido, 'creadoEn'>): string {
  const fecha = fechaLegible(pedido.creadoEn);
  const hora = horaLegible(pedido.creadoEn);
  return fecha && hora ? `${fecha}, ${hora}` : fecha;
}

// ── Errores ────────────────────────────────────────────────────────────────────────────────

/** 404 de pedido (no existe o es de otra clienta). */
export function esPedidoNoEncontrado(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** Mensaje para la clienta al fallar crearPedido. Nunca el texto técnico del servidor. */
export function mensajeCrearPedido(error: unknown): string {
  const comun = mensajeComunTienda(error);
  if (comun) {
    return comun;
  }
  if (error instanceof ApiError) {
    const mensaje = error.message.toLowerCase();
    // 400 "Stock insuficiente o presentación no disponible (producto X)" o "Stock insuficiente".
    if (error.status === 400 && mensaje.includes('stock')) {
      return 'Uno de tus productos ya no tiene piezas suficientes. Revisa tu carrito.';
    }
    // 404 "Presentación N no encontrada".
    if (error.status === 404) {
      return 'Uno de tus productos ya no está en la tienda. Revisa tu carrito.';
    }
  }
  return 'No pudimos crear tu pedido. Intenta de nuevo en un momento.';
}

/**
 * Motivo de un error de crearPreferenciaPedido: 409 "Este pedido ya no está pendiente de pago",
 * 409 "Este pedido venció: vuelve a hacer tu compra", 409 "El total del pedido no coincide…",
 * 400 "Este pedido se paga al recogerlo en el salón" y 503. null si no es ninguno.
 */
export function motivoConflictoPedido(error: unknown): MotivoConflictoPedido | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  const mensaje = error.message.toLowerCase();
  if (error.status === 503) {
    return 'noDisponible';
  }
  if (error.status === 400 && mensaje.includes('recoger')) {
    return 'enSalon';
  }
  if (error.status !== 409) {
    return null;
  }
  if (mensaje.includes('venci')) {
    return 'vencido';
  }
  if (mensaje.includes('total')) {
    return 'total';
  }
  if (mensaje.includes('pendiente')) {
    return 'noPendiente';
  }
  return null;
}

const MENSAJES_CONFLICTO: Record<MotivoConflictoPedido, string> = {
  noPendiente: 'Este pedido ya no está pendiente de pago.',
  vencido: 'El plazo de 24 horas para pagar terminó y el pedido se canceló. Puedes volver a hacer tu compra.',
  total: 'El total de tu pedido no coincide con sus productos. Escríbenos a contacto@mirufranco.com para revisarlo.',
  enSalon: 'Este pedido se paga al recogerlo en el salón.',
  noDisponible: 'El pago en línea no está disponible por ahora. Intenta más tarde.',
};

/** Mensaje para la clienta al fallar crearPreferenciaPedido. */
export function mensajePreferenciaPedido(error: unknown): string {
  const comun = mensajeComunTienda(error);
  if (comun) {
    return comun;
  }
  const motivo = motivoConflictoPedido(error);
  if (motivo) {
    return MENSAJES_CONFLICTO[motivo];
  }
  if (esPedidoNoEncontrado(error)) {
    return 'No encontramos este pedido.';
  }
  return 'No pudimos abrir el pago. Intenta de nuevo.';
}

/** Mensaje para la clienta al fallar cancelarPedido. */
export function mensajeCancelarPedido(error: unknown): string {
  const comun = mensajeComunTienda(error);
  if (comun) {
    return comun;
  }
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'No encontramos este pedido.';
    }
    // 403 "Solo el personal del salón cambia el estado del pedido. Puedes cancelarlo mientras no esté en preparación."
    if (error.status === 403) {
      return 'Este pedido ya se está preparando y no se puede cancelar.';
    }
    // 409 "El pedido cambió mientras lo editabas. Recarga para ver su estado."
    if (error.status === 409) {
      return 'Tu pedido cambió. Lo actualizamos para que veas su estado.';
    }
  }
  return 'No pudimos cancelar tu pedido. Intenta de nuevo en un momento.';
}
