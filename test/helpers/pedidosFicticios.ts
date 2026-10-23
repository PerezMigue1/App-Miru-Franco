/// <reference types="jest" />

import { cuerpoError, type CuerpoError } from './citasFicticias';
import { respuesta, type Manejador } from './servidorSimulado';
import {
  cuerpoListaTienda,
  isoMasMinutos,
  pedidoCrudo,
  pedidoPagado,
  rutaDevolucionesPedido,
  rutaPagosPedido,
  TOTAL_PEDIDO,
  type PedidoCrudo,
} from './tiendaFicticia';

/**
 * Datos ficticios de GP-07.5 para el detalle del pedido: la revocación de compra (art. 56 LFPC), las
 * devoluciones y los pagos de un pedido con la forma real del backend (pedidos.service.ts,
 * devoluciones.service.ts y pagos.service.ts de backend-miru). Solo datos inventados; la API de las
 * pruebas es http://api.test y nada sale a un servidor real ni a Mercado Pago.
 */

/** Lo que agrega el detalle del portal (?propios=true) para revocar. */
export interface CamposRevocacion {
  revocableHasta: string | null;
  puedeRevocar: boolean;
  montoRevocable: number;
}

export type PedidoDetalleCrudo = PedidoCrudo & Partial<CamposRevocacion>;

/** Fin del plazo para revocar del pedido pagado ficticio (fin del día en México, en UTC). */
export const REVOCABLE_HASTA_ISO = '2026-10-25T05:59:59.999Z';

/** Monto revocable completo del pedido ficticio, en pesos (Number(total)). */
export const MONTO_TOTAL = Number(TOTAL_PEDIDO);

/**
 * Pedido pagado en línea (id 703) que todavía se puede revocar: hasta REVOCABLE_HASTA_ISO, por todo
 * lo pagado. Con los cambios encima.
 */
export function pedidoRevocable(cambios: Partial<PedidoDetalleCrudo> = {}): PedidoDetalleCrudo {
  return {
    ...pedidoPagado(),
    revocableHasta: REVOCABLE_HASTA_ISO,
    puedeRevocar: true,
    montoRevocable: MONTO_TOTAL,
    ...cambios,
  };
}

/** Pedido entregado (id 706) que todavía se puede revocar (se entrega en el salón para el reembolso). */
export function pedidoEntregadoRevocable(cambios: Partial<PedidoDetalleCrudo> = {}): PedidoDetalleCrudo {
  return pedidoRevocable({ id: 706, estado: 'entregado', ...cambios });
}

/** Cuerpo de GET /api/pedidos/:id?propios=true con los datos de la revocación. */
export function cuerpoDetalle(pedido: PedidoDetalleCrudo): { success: true; data: PedidoDetalleCrudo } {
  return { success: true, data: pedido };
}

// ── Revocar ──────────────────────────────────────────────────────────────────────────────────

/** "POST /api/pedidos/:id/revocar". */
export function rutaRevocar(id: string | number = 703): string {
  return `POST /api/pedidos/${encodeURIComponent(String(id))}/revocar`;
}

export type EstadoRevocacionCrudo = 'reembolsado' | 'en_revision' | 'pendiente_entrega';

/**
 * Cuerpo de POST /api/pedidos/:id/revocar: el pedido después de revocar (cancelado si no lo había
 * recogido) y { estado, monto, devolucionId }.
 */
export function cuerpoRevocar(
  pedido: PedidoDetalleCrudo,
  estado: EstadoRevocacionCrudo | string,
  monto: number = MONTO_TOTAL,
): unknown {
  const recogido = pedido.estado === 'entregado';
  return {
    success: true,
    data: { ...pedido, estado: recogido ? 'entregado' : 'cancelado', puedeRevocar: false, montoRevocable: 0 },
    revocacion: { estado, monto, devolucionId: 5001 },
  };
}

/** Mensajes reales del backend al revocar (pedidos.service.ts revocar y revocacion.ts). */
export const MENSAJES_REVOCAR = {
  yaRevocada: 'Ya revocaste esta compra.',
  cancelado: 'Este pedido está cancelado: no hay compra que revocar.',
  sinPago: 'Tu pedido todavía no está pagado: no hay pago que reintegrar.',
  plazoTerminado:
    'El plazo para revocar tu compra terminó el sábado, 24 de octubre de 2026. Si tienes un problema con tu pedido, comunícate con el salón.',
  devolucionActiva:
    'Tienes una solicitud de devolución activa en este pedido: retírala o comunícate con el salón para revocar la compra.',
  yaReembolsado: 'El pago de este pedido ya se reembolsó.',
  reembolsadoCompleto: 'Este pedido ya se reembolsó por completo',
  cambio: 'El pedido cambió mientras lo revocabas. Recarga para ver su estado.',
  motivoInvalido: 'El motivo contiene caracteres no permitidos',
  noEncontrado: 'Pedido no encontrado',
} as const;

/** Cuerpos de error del backend al revocar. */
export const ERRORES_REVOCAR = {
  yaRevocada: cuerpoError(409, MENSAJES_REVOCAR.yaRevocada),
  cancelado: cuerpoError(409, MENSAJES_REVOCAR.cancelado),
  sinPago: cuerpoError(409, MENSAJES_REVOCAR.sinPago),
  plazoTerminado: cuerpoError(409, MENSAJES_REVOCAR.plazoTerminado),
  devolucionActiva: cuerpoError(409, MENSAJES_REVOCAR.devolucionActiva),
  yaReembolsado: cuerpoError(409, MENSAJES_REVOCAR.yaReembolsado),
  reembolsadoCompleto: cuerpoError(409, MENSAJES_REVOCAR.reembolsadoCompleto),
  cambio: cuerpoError(409, MENSAJES_REVOCAR.cambio),
  motivoInvalido: cuerpoError(400, MENSAJES_REVOCAR.motivoInvalido),
  noEncontrado: cuerpoError(404, MENSAJES_REVOCAR.noEncontrado),
} satisfies Record<string, CuerpoError>;

// ── Devoluciones y pagos ─────────────────────────────────────────────────────────────────────

/** Etiqueta que el backend antepone al motivo de una revocación (motivoRevocacion). */
export const PREFIJO_REVOCACION = '[Revocación de compra · art. 56 LFPC]';

/** Fila de devoluciones como la manda GET /api/devoluciones/pedido/:id (con pedidoItem y pago). */
export interface DevolucionCruda {
  id: number;
  pedidoId: number;
  pedidoItemId: number | null;
  pagoId: number | null;
  estado: string;
  tipo: string | null;
  causa: string | null;
  motivo: string | null;
  monto: string | null;
  metodoReembolso: string | null;
  origen: string;
  notaResolucion: string | null;
  resueltoEn: string | null;
  resueltoPorId: string | null;
  creadoEn: string;
  actualizadoEn: string;
  pedidoItem: unknown;
  pago: unknown;
}

/** Solicitud de reembolso pendiente del pedido 703 por $1,142.50 (con los cambios). */
export function devolucionCruda(cambios: Partial<DevolucionCruda> = {}): DevolucionCruda {
  const creadoEn = isoMasMinutos(pedidoPagado().creadoEn, 60);
  return {
    id: 5001,
    pedidoId: 703,
    pedidoItemId: null,
    pagoId: 80_703,
    estado: 'pendiente',
    tipo: 'reembolso',
    causa: 'defecto_fabrica',
    motivo: '[Reembolso · Defecto de fábrica] El frasco llegó roto',
    monto: '1142.50',
    metodoReembolso: null,
    origen: 'solicitud',
    notaResolucion: null,
    resueltoEn: null,
    resueltoPorId: null,
    creadoEn,
    actualizadoEn: creadoEn,
    pedidoItem: null,
    // El pago incluido trae datos que la app nunca muestra.
    pago: { id: 80_703, payload: { secreto: 'nunca-se-muestra' }, referenciaExterna: 'ref-ficticia', errorMensaje: 'error-tecnico' },
    ...cambios,
  };
}

/** Revocación de compra (origen revocacion_art56) con el motivo que escribió la clienta. */
export function revocacionCruda(cambios: Partial<DevolucionCruda> = {}): DevolucionCruda {
  return devolucionCruda({
    id: 5002,
    tipo: 'reembolso',
    causa: null,
    origen: 'revocacion_art56',
    motivo: `${PREFIJO_REVOCACION} Ya no lo necesito`,
    ...cambios,
  });
}

/** Fila de pagos como la manda GET /api/pagos/pedido/:id (con lo que la app no muestra). */
export interface PagoCrudo {
  id: number;
  pedidoId: number;
  intentoNumero: number;
  monto: string;
  moneda: string;
  metodo: string;
  proveedor: string | null;
  estado: string;
  referenciaExterna: string | null;
  errorMensaje: string | null;
  payload: unknown;
  pagadoEn: string | null;
  reembolsadoEn: string | null;
  creadoEn: string;
}

/** Pago aprobado de Mercado Pago del pedido 703 por $1,142.50 (con los cambios). */
export function pagoCrudo(cambios: Partial<PagoCrudo> = {}): PagoCrudo {
  const pagadoEn = pedidoPagado().pagadoEn ?? pedidoCrudo().creadoEn;
  return {
    id: 80_703,
    pedidoId: 703,
    intentoNumero: 1,
    monto: TOTAL_PEDIDO,
    moneda: 'MXN',
    metodo: 'mercado_pago',
    proveedor: 'mercadopago',
    estado: 'aprobado',
    referenciaExterna: 'ref-ficticia-no-se-muestra',
    errorMensaje: 'error-tecnico-no-se-muestra',
    payload: { secreto: 'nunca-se-muestra' },
    pagadoEn,
    reembolsadoEn: null,
    creadoEn: pagadoEn,
    ...cambios,
  };
}

// ── Pedir y retirar una solicitud ────────────────────────────────────────────────────────────

/** "POST /api/devoluciones?propios=true". */
export const RUTA_SOLICITAR_DEVOLUCION = 'POST /api/devoluciones?propios=true';

/** "POST /api/devoluciones/:id/cancelar". */
export function rutaRetirarDevolucion(id: number): string {
  return `POST /api/devoluciones/${id}/cancelar`;
}

/** Mensajes reales del backend al pedir y retirar (devoluciones.service.ts y politica-devolucion.ts). */
export const MENSAJES_DEVOLUCION = {
  causaNoAplica: 'La causa "Falta de existencias" no aplica para un cambio',
  noEntregado: 'El pedido todavía no se ha entregado',
  faltaArticulo: 'Elige el artículo del pedido',
  plazoCambio: 'El cambio solo procede dentro de los 7 días naturales siguientes a recogerlo',
  faltaSellado: 'Confirma que el producto está sellado y sin abrir',
  sinPago: 'El pedido no está pagado: no hay nada que reembolsar',
  existenciasEntregado: 'Un pedido entregado no se reembolsa por falta de existencias',
  noCancelado: 'El pedido no está cancelado',
  soloEnLinea: 'Solo aplica a pedidos pagados en línea',
  yaListo: 'El pedido ya estaba listo para recoger cuando se canceló',
  articuloAjeno: 'El ítem del pedido no pertenece al pedido indicado',
  yaActiva: 'Ya hay una solicitud activa para este artículo o pedido',
  pedidoNoEncontrado: 'Pedido no encontrado',
  yaNoPendiente: 'La solicitud ya no está pendiente',
  revocacion: 'Tu pedido ya se canceló por la revocación: el salón te reintegra tu pago.',
  devolucionNoEncontrada: 'Devolución no encontrada',
} as const;

/** Etiqueta "[Tipo · Causa]" que el backend antepone al motivo (motivoConPolitica). */
const ETIQUETAS_SOLICITUD: Record<string, string> = {
  cambio: 'Cambio',
  reembolso: 'Reembolso',
  sellado_sin_abrir: 'Producto sellado y sin abrir',
  defecto_fabrica: 'Defecto de fábrica',
  producto_distinto: 'Error del salón: producto distinto al pedido',
  sin_existencias: 'Falta de existencias',
  cancelacion_antes_listo: 'Cancelado antes de estar listo',
};

export interface ServidorDevoluciones {
  rutas: Record<string, Manejador>;
  /** Las devoluciones del pedido como están ahora en el servidor simulado. */
  lista: () => DevolucionCruda[];
}

/**
 * Devoluciones de un pedido con estado, como las guarda el backend: GET las lista (la más reciente
 * primero), POST crea una pendiente con lo que mandó la app (monto del artículo o del pedido en un
 * reembolso, sin monto en un cambio) y POST :id/cancelar retira una pendiente o responde 409.
 */
export function servidorDevoluciones(
  pedidoId: number,
  iniciales: DevolucionCruda[] = [],
  pagos: unknown[] = [pagoCrudo({ pedidoId })],
): ServidorDevoluciones {
  let lista = iniciales.map((devolucion) => ({ ...devolucion }));
  let siguienteId = 5100;
  const crear: Manejador = (cuerpo) => {
    const datos = cuerpo as { tipo: string; causa: string; pedidoItemId?: number; motivo?: string };
    const creadoEn = new Date(Date.now()).toISOString();
    const etiqueta = `[${ETIQUETAS_SOLICITUD[datos.tipo]} · ${ETIQUETAS_SOLICITUD[datos.causa]}]`;
    siguienteId += 1;
    const nueva = devolucionCruda({
      id: siguienteId,
      pedidoId,
      pedidoItemId: datos.pedidoItemId ?? null,
      pagoId: null,
      tipo: datos.tipo,
      causa: datos.causa,
      motivo: datos.motivo ? `${etiqueta} ${datos.motivo}` : etiqueta,
      monto: datos.tipo === 'cambio' ? null : TOTAL_PEDIDO,
      creadoEn,
      actualizadoEn: creadoEn,
      pago: null,
    });
    lista = [nueva, ...lista];
    return respuesta({ success: true, data: nueva }, 201);
  };
  const rutas: Record<string, Manejador> = {
    [rutaDevolucionesPedido(pedidoId)]: () => respuesta(cuerpoListaTienda(lista)),
    [rutaPagosPedido(pedidoId)]: () => respuesta(cuerpoListaTienda(pagos)),
    [RUTA_SOLICITAR_DEVOLUCION]: crear,
  };
  for (const devolucion of [...iniciales, ...Array.from({ length: 5 }, (_n, i) => ({ id: 5101 + i }))]) {
    rutas[rutaRetirarDevolucion(devolucion.id)] = () => {
      const actual = lista.find((fila) => fila.id === devolucion.id);
      if (actual?.estado !== 'pendiente') {
        return respuesta(cuerpoError(409, MENSAJES_DEVOLUCION.yaNoPendiente), 409);
      }
      lista = lista.map((fila) => (fila.id === devolucion.id ? { ...fila, estado: 'cancelada' } : fila));
      return respuesta({ success: true, message: 'Solicitud cancelada' });
    };
  }
  return { rutas, lista: () => lista };
}

/** GET de devoluciones y pagos del pedido con esas listas (por omisión, ninguna devolución y un pago). */
export function rutasDevoluciones(
  pedidoId: number = 703,
  devoluciones: unknown[] = [],
  pagos: unknown[] = [pagoCrudo()],
): Record<string, Manejador> {
  return {
    [rutaDevolucionesPedido(pedidoId)]: () => respuesta(cuerpoListaTienda(devoluciones)),
    [rutaPagosPedido(pedidoId)]: () => respuesta(cuerpoListaTienda(pagos)),
  };
}
