import { apiGet } from '@/shared/api/apiClient';
import type { TonoBadge } from '@/features/citas/models/citaModel';
import { listaDe, texto, type Crudo } from '@/features/inicio/models/inicioService';
import { obtenerConfiguracion, type ConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto, type ClaveTexto } from '@/shared/api/textosSitio';

import { idParaRuta, idPedidoValido, type Pedido } from './pedidoModel';
import { aCentavos, formatoPrecio } from './productoModel';

/**
 * Devoluciones y pagos de un pedido para el detalle (GP-07.5): lo que la clienta pidió devolver (o
 * revocó) con su estado y la respuesta del salón, y el estado de los pagos del pedido para ver si un
 * reembolso ya salió o está en revisión. Pedir y retirar una solicitud vive en
 * solicitudDevolucionModel.ts. Nunca se guarda ni se muestra el payload, la referencia externa ni el
 * error técnico de un pago.
 */

/** Estados de una devolución en el backend (filas antiguas pueden traer otros). */
export type EstadoDevolucion = 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada';

/** Tipos de solicitud (TIPOS_DEVOLUCION de politica-devolucion.ts del backend). */
export type TipoDevolucion = 'cambio' | 'reembolso';

/** Causas de una solicitud (CAUSAS_DEVOLUCION del backend). */
export type CausaDevolucion =
  | 'sellado_sin_abrir'
  | 'defecto_fabrica'
  | 'producto_distinto'
  | 'sin_existencias'
  | 'cancelacion_antes_listo';

export const CAUSAS_DEVOLUCION: readonly CausaDevolucion[] = [
  'sellado_sin_abrir',
  'defecto_fabrica',
  'producto_distinto',
  'sin_existencias',
  'cancelacion_antes_listo',
];

/** Devoluciones.origen de una revocación de compra (art. 56 LFPC); las demás son 'solicitud'. */
export const ORIGEN_REVOCACION = 'revocacion_art56';

export interface Devolucion {
  id: number;
  /** Texto crudo del backend (ver EstadoDevolucion). */
  estado: string;
  tipo: TipoDevolucion | null;
  /** Causa conocida de la solicitud; null en revocaciones, filas viejas o una causa desconocida. */
  causa: CausaDevolucion | null;
  /** Artículo del pedido de la solicitud; null si es por el pedido completo. */
  pedidoItemId: number | null;
  /** Es una revocación de compra (origen revocacion_art56). */
  esRevocacion: boolean;
  /** Lo que escribió la clienta, sin la etiqueta que antepone el backend; null si no hay. */
  motivo: string | null;
  /** En centavos; null en los cambios o si no vino. */
  montoCentavos: number | null;
  metodoReembolso: 'efectivo' | 'metodo_original' | null;
  notaResolucion: string | null;
  resueltoEn: string | null;
  creadoEn: string;
}

/** Estados de un pago en el backend (EstadoPago). */
export type EstadoPagoRegistrado = 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado' | 'reembolsado' | 'en_revision';

/** Pago del pedido, solo con lo que la clienta necesita ver. */
export interface PagoPedido {
  id: number;
  estado: string;
  montoCentavos: number;
  reembolsadoEn: string | null;
}

// ── Normalizadores ─────────────────────────────────────────────────────────────────────────

const ETIQUETA_SOLICITUD = /^\[[^\]]*\]\s*/;

/**
 * Motivo para la clienta (motivoVisibleDevolucion de la web): en una revocación o en una solicitud
 * con tipo, el backend antepone una etiqueta entre corchetes ("[Revocación de compra · art. 56
 * LFPC]"): se quita y queda solo lo que ella escribió. null si no escribió nada.
 */
export function motivoVisible(motivo: unknown, conEtiqueta: boolean): string | null {
  const limpio = texto(motivo);
  const resto = conEtiqueta ? limpio.replace(ETIQUETA_SOLICITUD, '').trim() : limpio;
  return resto || null;
}

function tipoDe(valor: unknown): Devolucion['tipo'] {
  const tipo = texto(valor);
  return tipo === 'cambio' || tipo === 'reembolso' ? tipo : null;
}

function causaDe(valor: unknown): CausaDevolucion | null {
  const causa = texto(valor);
  return CAUSAS_DEVOLUCION.find((conocida) => conocida === causa) ?? null;
}

function metodoReembolsoDe(valor: unknown): Devolucion['metodoReembolso'] {
  const metodo = texto(valor);
  return metodo === 'efectivo' || metodo === 'metodo_original' ? metodo : null;
}

function montoOpcional(valor: unknown): number | null {
  const centavos = aCentavos(valor);
  return centavos > 0 ? centavos : null;
}

/** Una fila de devoluciones del backend; null si no trae un id válido. */
export function normalizarDevolucion(crudo: Crudo): Devolucion | null {
  const id = idPedidoValido(texto(crudo.id));
  if (id === 0) {
    return null;
  }
  const tipo = tipoDe(crudo.tipo);
  const esRevocacion = texto(crudo.origen) === ORIGEN_REVOCACION;
  const pedidoItemId = idPedidoValido(texto(crudo.pedidoItemId));
  return {
    id,
    estado: texto(crudo.estado) || 'pendiente',
    tipo,
    causa: causaDe(crudo.causa),
    pedidoItemId: pedidoItemId === 0 ? null : pedidoItemId,
    esRevocacion,
    motivo: motivoVisible(crudo.motivo, esRevocacion || tipo !== null),
    montoCentavos: montoOpcional(crudo.monto),
    metodoReembolso: metodoReembolsoDe(crudo.metodoReembolso),
    notaResolucion: texto(crudo.notaResolucion) || null,
    resueltoEn: texto(crudo.resueltoEn) || null,
    creadoEn: texto(crudo.creadoEn),
  };
}

function normalizarPago(crudo: Crudo): PagoPedido | null {
  const id = idPedidoValido(texto(crudo.id));
  if (id === 0) {
    return null;
  }
  return {
    id,
    estado: texto(crudo.estado) || 'pendiente',
    montoCentavos: aCentavos(crudo.monto),
    reembolsadoEn: texto(crudo.reembolsadoEn) || null,
  };
}

// ── Llamadas a la API (con sesión) ─────────────────────────────────────────────────────────

function sinIdValido(): Promise<never> {
  return Promise.reject(new Error('Pedido no válido.'));
}

/**
 * Devoluciones del pedido: GET /api/devoluciones/pedido/:pedidoId?propios=true → { success, count,
 * data[] } (la más reciente primero, con pedidoItem y pago incluidos, que aquí no se usan).
 */
export function listarDevolucionesPedido(pedidoId: number): Promise<Devolucion[]> {
  if (idPedidoValido(pedidoId) === 0) {
    return sinIdValido();
  }
  return apiGet<unknown>(`/api/devoluciones/pedido/${idParaRuta(pedidoId)}?propios=true`).then((respuesta) =>
    listaDe(respuesta, ['data'])
      .map(normalizarDevolucion)
      .filter((devolucion): devolucion is Devolucion => devolucion !== null),
  );
}

/**
 * Pagos del pedido: GET /api/pagos/pedido/:pedidoId?propios=true → { success, count, data[] } (el
 * más reciente primero). De cada pago solo se toma su estado, monto y fecha de reembolso.
 */
export function listarPagosPedido(pedidoId: number): Promise<PagoPedido[]> {
  if (idPedidoValido(pedidoId) === 0) {
    return sinIdValido();
  }
  return apiGet<unknown>(`/api/pagos/pedido/${idParaRuta(pedidoId)}?propios=true`).then((respuesta) =>
    listaDe(respuesta, ['data'])
      .map(normalizarPago)
      .filter((pago): pago is PagoPedido => pago !== null),
  );
}

// ── Textos ─────────────────────────────────────────────────────────────────────────────────

interface DefinicionInsignia {
  clave: ClaveTexto;
  tono: TonoBadge;
}

const INSIGNIAS_DEVOLUCION: Record<string, DefinicionInsignia> = {
  pendiente: { clave: 'tienda.devoluciones.estado.pendiente', tono: 'aviso' },
  aprobada: { clave: 'tienda.devoluciones.estado.aprobada', tono: 'exito' },
  rechazada: { clave: 'tienda.devoluciones.estado.rechazada', tono: 'peligro' },
  cancelada: { clave: 'tienda.devoluciones.estado.cancelada', tono: 'neutro' },
};

const propia = <T>(registro: Record<string, T>, clave: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(registro, clave) ? registro[clave] : undefined;

/** Insignia de una devolución (insigniaDevolucion de la web); un estado antiguo se muestra tal cual. */
export function insigniaDevolucion(
  estado: string,
  config: ConfiguracionPublica = obtenerConfiguracion(),
): { texto: string; tono: TonoBadge } {
  const definicion = propia(INSIGNIAS_DEVOLUCION, estado);
  return definicion
    ? { texto: obtenerTexto(definicion.clave, {}, config), tono: definicion.tono }
    : { texto: estado.replaceAll('_', ' '), tono: 'neutro' };
}

/** "Cambio", "Reembolso" o "Revocación (art. 56)"; null sin tipo. */
export function tipoDevolucion(devolucion: Pick<Devolucion, 'tipo' | 'esRevocacion'>, config = obtenerConfiguracion()): string | null {
  if (devolucion.esRevocacion) {
    return obtenerTexto('tienda.devoluciones.revocacion', {}, config);
  }
  if (devolucion.tipo === 'cambio') {
    return obtenerTexto('tienda.devoluciones.tipo.cambio', {}, config);
  }
  return devolucion.tipo === 'reembolso' ? obtenerTexto('tienda.devoluciones.tipo.reembolso', {}, config) : null;
}

/** Cómo se reembolsa una devolución aprobada (efectivo o el mismo medio); null si no aplica. */
export function textoMetodoReembolso(devolucion: Pick<Devolucion, 'metodoReembolso' | 'estado'>, config = obtenerConfiguracion()): string | null {
  if (devolucion.estado !== 'aprobada' || !devolucion.metodoReembolso) {
    return null;
  }
  return obtenerTexto(
    devolucion.metodoReembolso === 'efectivo' ? 'tienda.devoluciones.metodo.efectivo' : 'tienda.devoluciones.metodo.original',
    {},
    config,
  );
}

/** Pagos que la clienta necesita ver: aprobados, reembolsados o en revisión (los intentos fallidos no). */
const ESTADOS_PAGO_VISIBLES: readonly string[] = ['aprobado', 'reembolsado', 'en_revision'];

export function pagosVisibles(pagos: readonly PagoPedido[]): PagoPedido[] {
  return pagos.filter((pago) => ESTADOS_PAGO_VISIBLES.includes(pago.estado));
}

const ETIQUETAS_PAGO: Record<string, DefinicionInsignia> = {
  aprobado: { clave: 'tienda.devoluciones.pago.aprobado', tono: 'exito' },
  reembolsado: { clave: 'tienda.devoluciones.pago.reembolsado', tono: 'info' },
  en_revision: { clave: 'tienda.devoluciones.pago.enRevision', tono: 'aviso' },
};

/** Insignia del pago y qué pasa con el reembolso (reembolsado con su fecha; en revisión, el salón lo revisa). */
export function estadoPagoVisible(
  pago: PagoPedido,
  formatoFecha: (iso: string) => string,
  config: ConfiguracionPublica = obtenerConfiguracion(),
): { texto: string; tono: TonoBadge; detalle: string | null } {
  const definicion = propia(ETIQUETAS_PAGO, pago.estado) ?? ETIQUETAS_PAGO.aprobado;
  let detalle: string | null = null;
  if (pago.estado === 'reembolsado') {
    const fecha = pago.reembolsadoEn ? formatoFecha(pago.reembolsadoEn) : '';
    detalle = fecha
      ? obtenerTexto('tienda.devoluciones.pago.reembolsadoEl', { fecha }, config)
      : obtenerTexto('tienda.devoluciones.pago.reembolsadoSinFecha', {}, config);
  } else if (pago.estado === 'en_revision') {
    detalle = obtenerTexto('tienda.devoluciones.pago.revisando', {}, config);
  }
  return { texto: obtenerTexto(definicion.clave, {}, config), tono: definicion.tono, detalle };
}

/**
 * Encabezado de un pedido que la clienta recogió y después revocó (sigue "entregado" mientras
 * devuelve el producto): dice que se revocó y en qué va el reembolso (textoRevocacionEntregado de la
 * web). null si no aplica.
 */
export function textoRevocacionEntregado(
  pedido: Pick<Pedido, 'estado'>,
  devoluciones: readonly Pick<Devolucion, 'estado' | 'esRevocacion' | 'montoCentavos'>[],
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string | null {
  if (pedido.estado !== 'entregado') {
    return null;
  }
  const revocacion = devoluciones.find((devolucion) => devolucion.esRevocacion && devolucion.estado !== 'cancelada');
  if (!revocacion) {
    return null;
  }
  // El catálogo pega el monto sin espacio ("te reembolsamos{monto}"): va con su espacio delante.
  const monto = revocacion.montoCentavos === null ? '' : ` ${formatoPrecio(revocacion.montoCentavos)}`;
  switch (revocacion.estado) {
    case 'pendiente':
      return obtenerTexto('pedidos.revocacion.pendiente', { monto }, config);
    case 'aprobada':
      return obtenerTexto('pedidos.revocacion.aprobada', { monto }, config);
    case 'rechazada':
      return obtenerTexto('pedidos.revocacion.rechazada', {}, config);
    default:
      return null;
  }
}

/** Hay una revocación vigente (pendiente o aprobada) entre las devoluciones. */
export function tieneRevocacion(devoluciones: readonly Pick<Devolucion, 'estado' | 'esRevocacion'>[]): boolean {
  return devoluciones.some(
    (devolucion) => devolucion.esRevocacion && (devolucion.estado === 'pendiente' || devolucion.estado === 'aprobada'),
  );
}
