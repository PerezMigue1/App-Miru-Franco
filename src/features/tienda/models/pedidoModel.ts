import { ApiError, apiGet, apiPost, apiPut } from '@/shared/api/apiClient';
import type { EtiquetaEstado, TonoBadge } from '@/features/citas/models/citaModel';
import { fechaLegible, horaLegible } from '@/features/citas/models/citaModel';
import { esObjeto, listaDe, primeraImagen, texto, urlHttps, type Crudo } from '@/features/inicio/models/inicioService';
import { obtenerConfiguracion, type ConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { textoDelServidor } from '@/shared/api/mensajesError';
import { obtenerTexto, type ClaveTexto } from '@/shared/api/textosSitio';

import { esSinExistencias, mensajeComunTienda } from './carritoModel';
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
 * Reglas con que se creó el pedido (instantaneaReglasPedido del backend, columna `reglas`). Cada
 * campo es un entero de 0 en adelante o null si no vino o no es válido; todo null (o la columna
 * vacía de los pedidos viejos) se resuelve con las reglas vigentes de la configuración pública.
 */
export interface ReglasPedido {
  plazoPagoLineaHoras: number | null;
  diasPrepararApartado: number | null;
  diaRecordatorioRecoger: number | null;
  diasCancelarNoRecogido: number | null;
  diasResguardoPagado: number | null;
  diasCambioProducto: number | null;
  diasHabilesRevocacion: number | null;
}

/**
 * Pedido de la clienta (GET /api/pedidos/:id?propios=true → { success, data }). Los importes llegan
 * como texto. El plazo del pago en línea es creadoEn + reglas.plazoPagoLineaHoras (vencimientoPagoMs).
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
  /** Reglas guardadas al crearlo; null en pedidos viejos (sin la columna). */
  reglas: ReglasPedido | null;
  /** Solo en el detalle: hasta cuándo puede revocar su compra (ISO) o null. */
  revocableHasta: string | null;
  /** Solo en el detalle: el backend dice que hoy puede revocar. */
  puedeRevocar: boolean;
  /** Solo en el detalle: lo que se reintegraría al revocar, en centavos; null si no vino. */
  montoRevocableCentavos: number | null;
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
export type MotivoConflictoPedido = 'noPendiente' | 'vencido' | 'total' | 'enSalon' | 'noDisponible' | 'sinPiezas';

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

/**
 * Margen para el reloj del teléfono al buscar un pedido recién creado tras un error de red: un
 * minuto. Uno más viejo no es el que se acaba de mandar (GP-07.5: antes eran 5 minutos).
 */
const MARGEN_PEDIDO_RECIENTE_MS = 60 * 1000;

const HORA_MS = 60 * 60 * 1000;

// ── Normalizadores ─────────────────────────────────────────────────────────────────────────

function enteroPositivo(valor: unknown): number {
  const numero = Number(texto(valor));
  return Number.isInteger(numero) && numero > 0 ? numero : 0;
}

/** Entero de 0 en adelante tal como lo guarda el JSON de reglas; si no, null. */
function enteroDeRegla(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 ? valor : null;
}

const CAMPOS_REGLAS: readonly (keyof ReglasPedido)[] = [
  'plazoPagoLineaHoras',
  'diasPrepararApartado',
  'diaRecordatorioRecoger',
  'diasCancelarNoRecogido',
  'diasResguardoPagado',
  'diasCambioProducto',
  'diasHabilesRevocacion',
];

/** Reglas guardadas en el pedido: cada campo entero válido o null; null si la columna no es un objeto. */
export function normalizarReglasPedido(crudo: unknown): ReglasPedido | null {
  if (!esObjeto(crudo)) {
    return null;
  }
  const reglas = {} as ReglasPedido;
  for (const campo of CAMPOS_REGLAS) {
    reglas[campo] = enteroDeRegla(crudo[campo]);
  }
  return reglas;
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
    reglas: normalizarReglasPedido(crudo.reglas),
    revocableHasta: texto(crudo.revocableHasta) || null,
    puedeRevocar: crudo.puedeRevocar === true,
    montoRevocableCentavos:
      crudo.montoRevocable === undefined || crudo.montoRevocable === null ? null : aCentavos(crudo.montoRevocable),
  };
}

/** El pedido de { data }; lanza si no viene uno válido. */
export function pedidoDe(respuesta: unknown): Pedido {
  const crudo = esObjeto(respuesta) && esObjeto(respuesta.data) ? respuesta.data : undefined;
  const pedido = crudo ? normalizarPedido(crudo) : null;
  if (!pedido) {
    throw new Error('Respuesta de pedido sin datos.');
  }
  return pedido;
}

/** true si la respuesta trae { data } con un pedido. */
export function traePedido(respuesta: unknown): boolean {
  return esObjeto(respuesta) && esObjeto(respuesta.data);
}

export function idParaRuta(id: string | number): string {
  return encodeURIComponent(String(id).trim());
}

/** El id del pedido como entero positivo; 0 si no es válido. */
export function idPedidoValido(id: string | number): number {
  return enteroPositivo(id);
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
 * { success, count, page, limit, totalPages, data[] } con los artículos de cada pedido. No trae el
 * estado del pago en línea.
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
  const delPedido = pedido.items.map((item) => clave(item.presentacionId, item.cantidad)).sort((a, b) => a.localeCompare(b));
  const enviadas = lineas.map((linea) => clave(linea.presentacionId, linea.cantidad)).sort((a, b) => a.localeCompare(b));
  return delPedido.length === enviadas.length && delPedido.every((valor, i) => valor === enviadas[i]);
}

/**
 * Qué se encontró al buscar el pedido recién creado: uno solo (se sigue con él), ninguno (no se
 * creó: se puede reintentar), varios iguales o sin poder consultar (no se sabe cuál es: la clienta
 * revisa Mis pedidos antes de intentar de nuevo, para nunca duplicar un pedido).
 */
export type BusquedaPedidoReciente =
  | { estado: 'unico'; pedido: Pedido }
  | { estado: 'ninguno' }
  | { estado: 'ambiguo' }
  | { estado: 'sinVerificar' };

/**
 * Tras un error de red al crear el pedido, el servidor pudo haberlo creado y perder la respuesta
 * (el backend no tiene clave de idempotencia). Busca pedidos pendientes de pago, con el mismo
 * método y exactamente las mismas líneas, creados desde `desdeMs` (con un minuto de margen para el
 * reloj del teléfono). Solo un candidato cuenta como el recién creado. Nunca lanza.
 */
export async function buscarPedidoRecienCreado(
  lineas: LineaPedido[],
  metodoPago: MetodoPago,
  desdeMs: number,
): Promise<BusquedaPedidoReciente> {
  let pedidos: Pedido[];
  try {
    pedidos = await listarMisPedidos();
  } catch {
    return { estado: 'sinVerificar' };
  }
  const candidatos = pedidos.filter((pedido) => {
    const creado = new Date(pedido.creadoEn).getTime();
    return (
      pedido.estado === 'pendiente_pago' &&
      pedido.metodoPago === metodoPago &&
      !Number.isNaN(creado) &&
      creado >= desdeMs - MARGEN_PEDIDO_RECIENTE_MS &&
      mismasLineas(pedido, lineas)
    );
  });
  if (candidatos.length === 1) {
    return { estado: 'unico', pedido: candidatos[0] };
  }
  return candidatos.length === 0 ? { estado: 'ninguno' } : { estado: 'ambiguo' };
}

/** Un pedido de la clienta: GET /api/pedidos/:id?propios=true. Uno ajeno llega como 404. */
export function obtenerPedido(id: string | number): Promise<Pedido> {
  if (enteroPositivo(id) === 0) {
    return Promise.reject(new ApiError(404, 'Pedido no encontrado'));
  }
  return apiGet<unknown>(`/api/pedidos/${idParaRuta(id)}?propios=true`).then(pedidoDe);
}

/**
 * Reembolso de un pedido pagado que la clienta canceló: 'reembolsado' (ya se pidió la devolución a
 * Mercado Pago) o 'en_revision' (el salón la hará a mano). Monto en centavos.
 */
export interface ReembolsoCancelacion {
  estado: 'reembolsado' | 'en_revision';
  montoCentavos: number;
}

export interface ResultadoCancelarPedido {
  pedido: Pedido;
  /** Solo si el pedido estaba pagado; null en los demás casos o con un estado desconocido. */
  reembolso: ReembolsoCancelacion | null;
}

function reembolsoDe(respuesta: unknown): ReembolsoCancelacion | null {
  const crudo = esObjeto(respuesta) && esObjeto(respuesta.reembolso) ? respuesta.reembolso : undefined;
  if (!crudo) {
    return null;
  }
  const estado = texto(crudo.estado);
  if (estado !== 'reembolsado' && estado !== 'en_revision') {
    return null;
  }
  return { estado, montoCentavos: aCentavos(crudo.monto) };
}

/**
 * Cancela el pedido: PUT /api/pedidos/:id?propios=true { estado: 'cancelado' } (sin motivo: el
 * backend no lo acepta). Solo en pendiente_pago o pagado; las existencias regresan a la tienda.
 * Responde { success, data, reembolso? } con el pedido ya cancelado; `reembolso` ({ estado, monto }
 * en pesos) solo viene si estaba pagado. Errores: motivoErrorCancelar y mensajeCancelarPedido.
 */
export function cancelarPedido(id: string | number): Promise<ResultadoCancelarPedido> {
  return apiPut<unknown>(`/api/pedidos/${idParaRuta(id)}?propios=true`, { estado: 'cancelado' }).then(
    async (respuesta) =>
      traePedido(respuesta)
        ? { pedido: pedidoDe(respuesta), reembolso: reembolsoDe(respuesta) }
        : { pedido: await obtenerPedido(id), reembolso: null },
  );
}

/**
 * URL de Mercado Pago para pagar el pedido: POST /api/pagos-en-linea/mercadopago/preferencia?origen=app
 * { pedidoId }. Responde { initPoint } sin envoltura; con origen=app, Mercado Pago regresa a
 * REDIRECCION_PEDIDO. Un id inválido rechaza con ApiError 404 sin llamar al servidor (como
 * obtenerPedido). Los errores se clasifican con motivoConflictoPedido.
 */
export function crearPreferenciaPedido(pedidoId: string | number): Promise<string> {
  const id = enteroPositivo(pedidoId);
  if (id === 0) {
    return Promise.reject(new ApiError(404, 'Pedido no encontrado'));
  }
  return apiPost<unknown>('/api/pagos-en-linea/mercadopago/preferencia?origen=app', {
    pedidoId: id,
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

/** Estados con el producto ya en manos de la clienta: revocar pide entregarlo en el salón. */
const ESTADOS_RECOGIDOS: readonly string[] = ['entregado', 'enviado'];

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

/** La clienta ya tiene el producto (entregado o el heredado enviado). */
export function yaRecogido(pedido: Pick<Pedido, 'estado'>): boolean {
  return ESTADOS_RECOGIDOS.includes(pedido.estado);
}

type ConReglas = { reglas?: ReglasPedido | null };

/** Horas para pagar en línea: las guardadas en el pedido o, sin ellas, las vigentes. */
export function plazoPagoHoras(pedido: ConReglas, config: ConfiguracionPublica = obtenerConfiguracion()): number {
  return pedido.reglas?.plazoPagoLineaHoras ?? config.reglas.tienda.plazoPagoLineaHoras;
}

/** Días hábiles para revocar: los guardados en el pedido o, sin ellos, los vigentes. */
export function diasRevocacion(pedido: ConReglas, config: ConfiguracionPublica = obtenerConfiguracion()): number {
  return pedido.reglas?.diasHabilesRevocacion ?? config.reglas.revocacion.diasHabiles;
}

/**
 * Momento (ms) en que vence el pago en línea: creadoEn + las horas del plazo (plazoPagoHoras). null
 * si no hay fecha válida.
 */
export function vencimientoPagoMs(
  pedido: Pick<Pedido, 'creadoEn'> & ConReglas,
  config: ConfiguracionPublica = obtenerConfiguracion(),
): number | null {
  const creado = new Date(pedido.creadoEn).getTime();
  return Number.isNaN(creado) ? null : creado + plazoPagoHoras(pedido, config) * HORA_MS;
}

/** Fecha y hora locales: 'sábado 18 de octubre, 6:30 p. m.' ('' si no es válida). */
export function fechaYHora(valor: string | Date): string {
  const fecha = fechaLegible(valor);
  const hora = horaLegible(valor);
  return fecha && hora ? `${fecha}, ${hora}` : fecha;
}

/**
 * Plazo del pago en línea con fecha y hora locales: 'sábado 18 de octubre, 6:30 p. m.'. null si
 * el pedido no es en línea pendiente de pago o no hay fecha válida.
 */
export function limitePagoPedido(
  pedido: Pick<Pedido, 'creadoEn' | 'estado' | 'metodoPago'> & ConReglas,
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string | null {
  if (!esPagoEnLinea(pedido) || pedido.estado !== 'pendiente_pago') {
    return null;
  }
  const vence = vencimientoPagoMs(pedido, config);
  return vence === null ? null : fechaYHora(new Date(vence));
}

/** Pedido en línea pendiente de pago y todavía dentro de su plazo: se puede (re)intentar pagar. */
export function pidePagoEnLinea(
  pedido: Pick<Pedido, 'creadoEn' | 'estado' | 'metodoPago'> & ConReglas,
  ahora: number = Date.now(),
  config: ConfiguracionPublica = obtenerConfiguracion(),
): boolean {
  const vence = vencimientoPagoMs(pedido, config);
  return esPagoEnLinea(pedido) && pedido.estado === 'pendiente_pago' && vence !== null && vence > ahora;
}

// ── Textos del pedido (catálogo de textos del sitio) ───────────────────────────────────────

interface DefinicionEtiqueta {
  clave: ClaveTexto;
  tono: TonoBadge;
}

const ETIQUETAS_PEDIDO: Record<string, DefinicionEtiqueta> = {
  borrador: { clave: 'tienda.pedido.etiqueta.borrador', tono: 'aviso' },
  pendiente_pago: { clave: 'tienda.pedido.etiqueta.pendientePago', tono: 'aviso' },
  pagado: { clave: 'tienda.pedido.etiqueta.pagado', tono: 'exito' },
  preparando: { clave: 'tienda.pedido.etiqueta.preparando', tono: 'neutro' },
  listo_recoger: { clave: 'tienda.pedido.etiqueta.listoRecoger', tono: 'exito' },
  enviado: { clave: 'tienda.pedido.etiqueta.enviado', tono: 'neutro' },
  entregado: { clave: 'tienda.pedido.etiqueta.entregado', tono: 'neutro' },
  cancelado: { clave: 'tienda.pedido.etiqueta.cancelado', tono: 'neutro' },
};

const ETIQUETA_APARTADO: DefinicionEtiqueta = { clave: 'tienda.pedido.etiqueta.apartado', tono: 'aviso' };
const ETIQUETA_PAGO_EN_PROCESO: DefinicionEtiqueta = { clave: 'tienda.pedido.etiqueta.pagoEnProceso', tono: 'aviso' };
const ETIQUETA_DESCONOCIDA: DefinicionEtiqueta = { clave: 'tienda.pedido.etiqueta.sinEstado', tono: 'neutro' };

const propia = <T>(registro: Record<string, T>, clave: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(registro, clave) ? registro[clave] : undefined;

/**
 * Insignia del estado (textos del catálogo); el apartado pendiente dice que se paga al recoger. Con
 * `pagoEnProceso` (Mercado Pago procesa o revisa el pago), el pedido en línea pendiente dice
 * "Pago en proceso" en lugar de "Pendiente de pago".
 */
export function etiquetaEstadoPedido(
  pedido: Pick<Pedido, 'estado' | 'metodoPago'>,
  pagoEnProceso = false,
  config: ConfiguracionPublica = obtenerConfiguracion(),
): EtiquetaEstado {
  let definicion = propia(ETIQUETAS_PEDIDO, pedido.estado) ?? ETIQUETA_DESCONOCIDA;
  if (pedido.estado === 'pendiente_pago' && esPagoEnSalon(pedido)) {
    definicion = ETIQUETA_APARTADO;
  } else if (pagoEnProceso && pedido.estado === 'pendiente_pago' && esPagoEnLinea(pedido)) {
    definicion = ETIQUETA_PAGO_EN_PROCESO;
  }
  return { texto: obtenerTexto(definicion.clave, {}, config), tono: definicion.tono };
}

const METODOS_PAGO: Record<string, ClaveTexto> = {
  mercado_pago: 'tienda.pedido.metodo.mercadoPago',
  pago_en_salon: 'tienda.pedido.metodo.pagoEnSalon',
  efectivo: 'tienda.pedido.metodo.efectivo',
  transferencia: 'tienda.pedido.metodo.transferencia',
  tarjeta_terminal: 'tienda.pedido.metodo.tarjetaTerminal',
};

const METODOS_CORTOS: Record<string, ClaveTexto> = {
  mercado_pago: 'tienda.pedido.metodoCorto.mercadoPago',
  pago_en_salon: 'tienda.pedido.metodoCorto.pagoEnSalon',
};

/** Forma de pago legible (catálogo); vacío: 'Sin especificar'; uno desconocido, sin guiones bajos. */
export function etiquetaMetodoPago(metodoPago: string, config: ConfiguracionPublica = obtenerConfiguracion()): string {
  if (!metodoPago) {
    return obtenerTexto('tienda.pedido.metodo.sinEspecificar', {}, config);
  }
  const clave = propia(METODOS_PAGO, metodoPago);
  return clave ? obtenerTexto(clave, {}, config) : metodoPago.replaceAll('_', ' ');
}

/** Forma de pago corta para la lista de pedidos; los métodos viejos de la web usan etiquetaMetodoPago. */
export function formaPagoCorta(metodoPago: string, config: ConfiguracionPublica = obtenerConfiguracion()): string {
  const clave = propia(METODOS_CORTOS, metodoPago);
  return clave ? obtenerTexto(clave, {}, config) : etiquetaMetodoPago(metodoPago, config);
}

export interface OpcionesQueSigue {
  /** Mercado Pago procesa o revisa el pago en línea: no se pide completar el pago. */
  pagoEnProceso?: boolean;
  config?: ConfiguracionPublica;
  /** {metodosSalon} de pedidos.estado.listoPagar (lo arma compraLegal con los métodos activos). */
  metodosSalon?: string;
}

/** Qué sigue de un pedido pendiente de pago (apartado, en línea o de otro método). */
function queSiguePendiente(
  pedido: Pick<Pedido, 'estado' | 'metodoPago' | 'creadoEn'> & ConReglas,
  ahora: number,
  pagoEnProceso: boolean,
  config: ConfiguracionPublica,
): string {
  if (esPagoEnSalon(pedido)) {
    return obtenerTexto('pedidos.estado.apartado', {}, config);
  }
  if (!esPagoEnLinea(pedido)) {
    return obtenerTexto('pedidos.estado.confirmandoPago', {}, config);
  }
  if (pagoEnProceso) {
    return obtenerTexto('tienda.pedido.estado.pagoEnProceso', {}, config);
  }
  const plazoPago = plazoPagoHoras(pedido, config);
  // Vencido pero aún sin cancelar (el backend lo cancela en su siguiente revisión).
  const vence = vencimientoPagoMs(pedido, config);
  if (vence !== null && vence <= ahora) {
    return obtenerTexto('tienda.pedido.estado.plazoTerminado', { plazoPago }, config);
  }
  return obtenerTexto('pedidos.estado.faltaPago', { plazoPago }, config);
}

/**
 * Qué sigue para la clienta según el estado (pedidos.estado.* del catálogo, como textoRecoger de la
 * web), con el plazo de pago guardado en el pedido. Con el pago en línea en proceso no pide
 * completarlo. null en cancelado, enviado o un estado desconocido.
 */
export function textoQueSigue(
  pedido: Pick<Pedido, 'estado' | 'metodoPago' | 'creadoEn'> & ConReglas,
  ahora: number = Date.now(),
  opciones: OpcionesQueSigue = {},
): string | null {
  const { pagoEnProceso = false, config = obtenerConfiguracion(), metodosSalon = '' } = opciones;
  switch (pedido.estado) {
    case 'pendiente_pago':
      return queSiguePendiente(pedido, ahora, pagoEnProceso, config);
    case 'pagado':
      return obtenerTexto('pedidos.estado.pagado', {}, config);
    case 'preparando':
      return obtenerTexto('pedidos.estado.preparando', {}, config);
    case 'listo_recoger':
      return esPagoEnSalon(pedido)
        ? obtenerTexto('pedidos.estado.listoPagar', { metodosSalon }, config)
        : obtenerTexto('pedidos.estado.listo', {}, config);
    case 'entregado':
      return obtenerTexto('pedidos.estado.entregado', {}, config);
    default:
      return null;
  }
}

/**
 * Texto de la confirmación para cancelar. Un pedido pagado en línea se reembolsa completo con
 * Mercado Pago al cancelarlo (el backend lo pide en la misma cancelación).
 */
export function textoCancelarPedido(
  pedido: Pick<Pedido, 'estado' | 'metodoPago'>,
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string {
  const base = obtenerTexto('tienda.pedido.cancelar.texto', {}, config);
  return pedido.estado === 'pagado' && esPagoEnLinea(pedido)
    ? `${base} ${obtenerTexto('tienda.pedido.cancelar.reembolso', {}, config)}`
    : base;
}

/** Fecha y hora locales del pedido: 'sábado 11 de octubre, 6:30 p. m.' ('' si no es válida). */
export function fechaPedido(pedido: Pick<Pedido, 'creadoEn'>): string {
  return fechaYHora(pedido.creadoEn);
}

// ── Errores ────────────────────────────────────────────────────────────────────────────────

/** 404 de pedido (no existe o es de otra clienta). */
export function esPedidoNoEncontrado(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * 409 de piezas agotadas (GP-09, ronda 8 del backend): crear el pedido o pedir su preferencia de
 * pago responde "Ya no hay suficientes piezas de X (presentación)" y nunca se vende de más. El
 * backend no manda code: se reconoce porque el texto menciona las piezas, que no alcanzan o el
 * stock. Va antes que los demás 409, porque el nombre del producto podría decir "total" o "pendiente".
 */
export function esPiezasAgotadas(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && /suficientes|piezas|stock/.test(error.message.toLowerCase());
}

/** La frase del contrato del backend para las piezas agotadas: "Ya no hay suficientes piezas de X". */
const FRASE_PIEZAS_AGOTADAS = /^ya no hay (suficientes piezas|piezas suficientes)\b/;

/**
 * El texto de las piezas agotadas: el message del backend tal cual (ya viene en español para la
 * clienta y dice qué producto) solo si es la frase del contrato; si viene vacío, técnico u otro
 * texto, el de la app de esa clave.
 */
function textoPiezasAgotadas(error: unknown, respaldo: ClaveTexto, config: ConfiguracionPublica): string {
  const contrato = error instanceof ApiError && FRASE_PIEZAS_AGOTADAS.test(error.message.toLowerCase().trim());
  const delBackend = contrato ? textoDelServidor(error) : null;
  return delBackend ?? obtenerTexto(respaldo, {}, config);
}

/** Por qué el backend no creó el pedido (400 o 404 de validarItems y crear, 409 de piezas agotadas). */
type MotivoCrearPedido = 'sinExistencias' | 'retirado' | 'enLineaApagado' | 'enSalonApagado';

/**
 * Motivo de un error de crearPedido: 400 "Este producto ya no está a la venta (X)" o "Este
 * producto no tiene precio válido (X)" y 404 "Presentación N no encontrada" (retirado), 400 "Stock
 * insuficiente…" (sinExistencias) y los 400 de la forma de pago apagada. null si no es ninguno.
 */
function motivoCrearPedido(error: unknown): MotivoCrearPedido | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  if (error.status === 404) {
    return 'retirado';
  }
  if (esPiezasAgotadas(error)) {
    return 'sinExistencias';
  }
  if (error.status !== 400) {
    return null;
  }
  const mensaje = error.message.toLowerCase();
  // Antes que "stock": el nombre del producto (entre paréntesis) podría contener esa palabra.
  if (/a la venta|precio v[aá]lido/.test(mensaje)) {
    return 'retirado';
  }
  if (mensaje.includes('stock')) {
    return 'sinExistencias';
  }
  if (/pago en l[ií]nea no est[aá] disponible/.test(mensaje)) {
    return 'enLineaApagado';
  }
  if (/pago al recoger no est[aá] disponible/.test(mensaje)) {
    return 'enSalonApagado';
  }
  return null;
}

const MENSAJES_CREAR_PEDIDO: Record<MotivoCrearPedido, ClaveTexto> = {
  sinExistencias: 'tienda.pedido.crear.sinExistencias',
  retirado: 'tienda.pedido.crear.retirado',
  enLineaApagado: 'tienda.pedido.crear.enLineaApagado',
  enSalonApagado: 'tienda.pedido.crear.enSalonApagado',
};

/**
 * Mensaje para la clienta al fallar crearPedido. Nunca el texto técnico del servidor; el 409 de
 * piezas agotadas muestra el del backend, que ya es para la clienta (textoPiezasAgotadas).
 */
export function mensajeCrearPedido(error: unknown, config: ConfiguracionPublica = obtenerConfiguracion()): string {
  const comun = mensajeComunTienda(error);
  if (comun) {
    return comun;
  }
  if (esPiezasAgotadas(error)) {
    return textoPiezasAgotadas(error, 'tienda.pedido.crear.sinExistencias', config);
  }
  const motivo = motivoCrearPedido(error);
  return obtenerTexto(motivo ? MENSAJES_CREAR_PEDIDO[motivo] : 'tienda.pedido.crear.generico', {}, config);
}

/** No se sabe si el pedido se creó: revisar Mis pedidos antes de intentar de nuevo. */
export function mensajeRevisarMisPedidos(config: ConfiguracionPublica = obtenerConfiguracion()): string {
  return obtenerTexto('tienda.pedido.crear.revisarMisPedidos', {}, config);
}

/**
 * El error de crearPedido se arregla en el carrito: sin existencias (400 o 409) o un producto que ya no está
 * en la tienda (retirado, sin precio o sin la presentación). La forma de pago apagada no.
 */
export function pideRevisarCarrito(error: unknown): boolean {
  const motivo = motivoCrearPedido(error);
  return motivo === 'sinExistencias' || motivo === 'retirado' || esSinExistencias(error);
}

/**
 * Motivo de un error de crearPreferenciaPedido: 409 "Este pedido ya no está pendiente de pago",
 * 409 "Este pedido venció: vuelve a hacer tu compra", 409 "El total del pedido no coincide…",
 * 400 "Este pedido se paga al recogerlo en el salón", 503 y el 409 de piezas agotadas
 * (esPiezasAgotadas, revisado antes que los otros 409). null si no es ninguno.
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
  if (esPiezasAgotadas(error)) {
    return 'sinPiezas';
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

const MENSAJES_CONFLICTO: Record<MotivoConflictoPedido, ClaveTexto> = {
  noPendiente: 'tienda.pedido.pago.noPendiente',
  vencido: 'tienda.pedido.pago.vencido',
  total: 'tienda.pedido.pago.total',
  enSalon: 'tienda.pedido.pago.enSalon',
  noDisponible: 'tienda.pedido.pago.noDisponible',
  sinPiezas: 'tienda.pedido.pago.sinPiezas',
};

/**
 * Mensaje para la clienta al fallar crearPreferenciaPedido. El plazo vencido usa las horas guardadas
 * en el pedido (si se pasa) y el total que no coincide, el teléfono de la configuración. Las piezas
 * agotadas muestran el message del backend (textoPiezasAgotadas).
 */
export function mensajePreferenciaPedido(
  error: unknown,
  pedido: ConReglas = {},
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string {
  const comun = mensajeComunTienda(error);
  if (comun) {
    return comun;
  }
  const motivo = motivoConflictoPedido(error);
  if (motivo === 'sinPiezas') {
    return textoPiezasAgotadas(error, MENSAJES_CONFLICTO.sinPiezas, config);
  }
  if (motivo) {
    return obtenerTexto(
      MENSAJES_CONFLICTO[motivo],
      { plazoPago: plazoPagoHoras(pedido, config), telefono: config.salon.telefono || null },
      config,
    );
  }
  return obtenerTexto(esPedidoNoEncontrado(error) ? 'tienda.pedido.noEncontrado' : 'tienda.pedido.pago.generico', {}, config);
}

/**
 * Por qué no se pudo cancelar: 403 ya se prepara, 404 no existe, 409 con una devolución en proceso
 * ("Este pedido tiene una devolución en proceso: para cancelarlo comunícate con el salón.") o 409
 * porque cambió mientras se cancelaba. Se distingue por el texto del servidor, que nunca se muestra.
 */
export type MotivoErrorCancelar = 'preparando' | 'noEncontrado' | 'devolucionEnProceso' | 'cambio';

export function motivoErrorCancelar(error: unknown): MotivoErrorCancelar | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  switch (error.status) {
    case 403:
      return 'preparando';
    case 404:
      return 'noEncontrado';
    case 409:
      return error.message.toLowerCase().includes('devoluci') ? 'devolucionEnProceso' : 'cambio';
    default:
      return null;
  }
}

const MENSAJES_CANCELAR: Record<MotivoErrorCancelar, ClaveTexto> = {
  preparando: 'tienda.pedido.cancelar.preparando',
  noEncontrado: 'tienda.pedido.noEncontrado',
  devolucionEnProceso: 'tienda.pedido.cancelar.devolucionEnProceso',
  cambio: 'tienda.pedido.cancelar.cambio',
};

/** Mensaje para la clienta al fallar cancelarPedido. */
export function mensajeCancelarPedido(error: unknown, config: ConfiguracionPublica = obtenerConfiguracion()): string {
  const comun = mensajeComunTienda(error);
  if (comun) {
    return comun;
  }
  const motivo = motivoErrorCancelar(error);
  return obtenerTexto(motivo ? MENSAJES_CANCELAR[motivo] : 'tienda.pedido.cancelar.generico', {}, config);
}
