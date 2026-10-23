import type { EtiquetaEstado, TonoBadge } from '@/features/citas/models/citaModel';
import { transferenciaEnSalon } from '@/features/citas/viewmodels/formaPagoReserva';
import type { ConfiguracionPublica, DatosTransferencia } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { metodosEntreParentesis } from '../models/compraLegal';
import {
  estadoPagoVisible,
  insigniaDevolucion,
  pagosVisibles,
  textoMetodoReembolso,
  textoRevocacionEntregado,
  tipoDevolucion,
  type Devolucion,
  type PagoPedido,
} from '../models/devolucionesModel';
import {
  esPagoEnLinea,
  esPagoEnSalon,
  etiquetaEstadoPedido,
  etiquetaMetodoPago,
  fechaPedido,
  fechaYHora,
  limitePagoPedido,
  pidePagoEnLinea,
  puedeCancelar,
  textoCancelarPedido,
  textoQueSigue,
  type Pedido,
  type ReembolsoCancelacion,
} from '../models/pedidoModel';
import { formatoPrecio } from '../models/productoModel';
import { puedeVerRevocar, textoCancelarORevocar, textosHojaRevocar } from '../models/revocacionModel';
import { puedeRetirar } from '../models/solicitudDevolucionModel';
import type { EstadoPagoConocido } from './useVerificacionPago';

/**
 * Lo que pinta el detalle del pedido (GP-07.5), armado sin React a partir del pedido, lo que sabe el
 * registro de la verificación del pago, sus devoluciones y pagos y la configuración pública: textos
 * del catálogo con las reglas guardadas en el pedido, qué acciones se ofrecen y la sección de
 * devoluciones y reembolsos. Lo usan useDetallePedidoViewModel y useMisPedidosViewModel.
 */

/**
 * El pago en línea está en proceso: Mercado Pago lo procesa o lo revisa, o se está verificando
 * después de volver de Mercado Pago. Mientras tanto no se pide pagar otra vez ni se ofrece cancelar.
 */
export function pagoEnProcesoDe(conocido: EstadoPagoConocido | null): boolean {
  if (!conocido) {
    return false;
  }
  return conocido.estado === 'pendiente' || conocido.estado === 'revision' || (conocido.verificando && conocido.porConfirmar);
}

/** Aviso en la pantalla del detalle: tras cancelar, revocar o cuando el servidor no lo permitió. */
export interface AvisoPedido {
  tipo: 'exito' | 'aviso' | 'info';
  texto: string;
  /** Pide comunicarse con el salón: se muestra el enlace para llamar (si hay teléfono). */
  llamarSalon?: boolean;
}

/** Aviso tras cancelar con lo que respondió el backend sobre la devolución del pago. */
export function avisoCancelado(reembolso: ReembolsoCancelacion | null, config: ConfiguracionPublica): AvisoPedido {
  if (reembolso?.estado === 'reembolsado') {
    // Sin monto válido no se escribe "$0": se dice la devolución sin cifra.
    const monto = reembolso.montoCentavos > 0 ? ` de ${formatoPrecio(reembolso.montoCentavos)}` : '';
    return { tipo: 'exito', texto: obtenerTexto('tienda.pedido.cancelado.reembolsado', { monto }, config) };
  }
  if (reembolso?.estado === 'en_revision') {
    return { tipo: 'aviso', texto: obtenerTexto('tienda.pedido.cancelado.enRevision', {}, config) };
  }
  return { tipo: 'exito', texto: obtenerTexto('tienda.pedido.cancelado', {}, config) };
}

export type AccionPago = 'completar' | 'revisar' | null;

export interface PresentacionDetalle {
  etiqueta: EtiquetaEstado;
  /** 'sábado 11 de octubre, 6:30 p. m.' o ''. */
  fecha: string;
  /** Qué sigue (o, si lo recogió y revocó, en qué va la revocación); null sin nada que decir. */
  queSigue: string | null;
  /** 'Paga antes del ...' mientras se puede pagar en línea y no hay un pago en proceso. */
  plazo: string | null;
  /** Completar el pago (abre Mercado Pago) o solo revisarlo (con un pago en proceso). */
  accionPago: AccionPago;
  /** Apartado listo para pagar en el salón con la transferencia activa: los datos de la cuenta. */
  transferencia: DatosTransferencia | null;
  formaPago: string;
  /** Hay algo que recoger en el salón. */
  recoger: boolean;
  puedeCancelar: boolean;
  textoCancelar: string;
  puedeRevocar: boolean;
  /** Con las dos acciones a la vista, la diferencia entre cancelar y revocar. */
  cancelarORevocar: string | null;
  /** Párrafos de la hoja para revocar. */
  textosRevocar: string[];
}

/** Estados en los que ya no hay nada que recoger en el salón. */
const SIN_RECOGER: readonly string[] = ['cancelado', 'entregado', 'enviado'];

export interface EntradaDetalle {
  pedido: Pedido;
  pagoEnProceso: boolean;
  /**
   * Hay una consulta del pago en curso (registro de la verificación): con el pedido en línea pendiente
   * no se ofrece cancelar hasta saber si ya pagó (la respuesta puede traerlo pagado).
   */
  verificandoPago?: boolean;
  devoluciones: readonly Devolucion[];
  ahora: number;
  config: ConfiguracionPublica;
}

/** Todo lo que el detalle muestra del pedido, con sus reglas guardadas (o las vigentes si no trae). */
export function presentarDetalle({
  pedido,
  pagoEnProceso,
  verificandoPago = false,
  devoluciones,
  ahora,
  config,
}: EntradaDetalle): PresentacionDetalle {
  const enProcesoEnLinea = pagoEnProceso && esPagoEnLinea(pedido);
  const consultandoPendiente = verificandoPago && esPagoEnLinea(pedido) && pedido.estado === 'pendiente_pago';
  const pagar = pidePagoEnLinea(pedido, ahora, config);
  const limite = pagar && !enProcesoEnLinea ? limitePagoPedido(pedido, config) : null;
  const apartadoListo = pedido.estado === 'listo_recoger' && esPagoEnSalon(pedido);
  // Con el pago en proceso no se ofrece cancelar: el dinero podría estar en camino (doble cobro o
  // reembolso a ciegas). Se espera a que el registro tenga una respuesta clara.
  const cancelable = puedeCancelar(pedido) && !enProcesoEnLinea && !consultandoPendiente;
  let accionPago: AccionPago = null;
  if (pagar) {
    accionPago = enProcesoEnLinea ? 'revisar' : 'completar';
  }
  return {
    etiqueta: etiquetaEstadoPedido(pedido, enProcesoEnLinea, config),
    fecha: fechaPedido(pedido),
    queSigue:
      textoRevocacionEntregado(pedido, devoluciones, config) ??
      textoQueSigue(pedido, ahora, { pagoEnProceso: enProcesoEnLinea, config, metodosSalon: metodosEntreParentesis(config) }),
    plazo: limite ? obtenerTexto('tienda.pago.plazo', { limite }, config) : null,
    accionPago,
    transferencia: apartadoListo ? transferenciaEnSalon(config) : null,
    formaPago: etiquetaMetodoPago(pedido.metodoPago, config),
    recoger: !SIN_RECOGER.includes(pedido.estado),
    puedeCancelar: cancelable,
    textoCancelar: textoCancelarPedido(pedido, config),
    puedeRevocar: puedeVerRevocar(pedido, ahora),
    cancelarORevocar: textoCancelarORevocar(pedido, cancelable, ahora, config),
    textosRevocar: textosHojaRevocar(pedido, config),
  };
}

// ── Devoluciones y reembolsos ────────────────────────────────────────────────────────────────

export interface DevolucionVisible {
  id: number;
  insignia: { texto: string; tono: TonoBadge };
  /** "Cambio", "Reembolso" o "Revocación (art. 56)"; null sin tipo. */
  tipo: string | null;
  /** "Monto: $450"; null en los cambios. */
  monto: string | null;
  motivo: string | null;
  /** Cómo se reembolsa una devolución aprobada; null si no aplica. */
  metodo: string | null;
  /** "Solicitada el ..." o "Resuelta el ..."; null sin fecha válida. */
  fecha: string | null;
  nota: string | null;
  /** Una solicitud pendiente (no una revocación) que la clienta puede retirar. */
  puedeRetirar: boolean;
}

export interface PagoVisible {
  id: number;
  insignia: { texto: string; tono: TonoBadge };
  monto: string;
  /** Reembolsado con su fecha, o en revisión; null si no hay nada más que decir. */
  detalle: string | null;
}

/** Fecha de la devolución: la de su resolución si ya se resolvió; si no, la de la solicitud. */
function fechaDevolucion(devolucion: Devolucion, config: ConfiguracionPublica): string | null {
  const resuelta = devolucion.resueltoEn ? fechaYHora(devolucion.resueltoEn) : '';
  if (resuelta) {
    return obtenerTexto('tienda.devoluciones.resuelta', { fecha: resuelta }, config);
  }
  const creada = fechaYHora(devolucion.creadoEn);
  return creada ? obtenerTexto('tienda.devoluciones.solicitada', { fecha: creada }, config) : null;
}

export function presentarDevoluciones(devoluciones: readonly Devolucion[], config: ConfiguracionPublica): DevolucionVisible[] {
  return devoluciones.map((devolucion) => ({
    id: devolucion.id,
    insignia: insigniaDevolucion(devolucion.estado, config),
    tipo: tipoDevolucion(devolucion, config),
    monto:
      devolucion.montoCentavos === null
        ? null
        : obtenerTexto('tienda.devoluciones.monto', { monto: formatoPrecio(devolucion.montoCentavos) }, config),
    motivo: devolucion.motivo,
    metodo: textoMetodoReembolso(devolucion, config),
    fecha: fechaDevolucion(devolucion, config),
    nota: devolucion.notaResolucion,
    puedeRetirar: puedeRetirar(devolucion),
  }));
}

export function presentarPagos(pagos: readonly PagoPedido[], config: ConfiguracionPublica): PagoVisible[] {
  return pagosVisibles(pagos).map((pago) => {
    const { texto, tono, detalle } = estadoPagoVisible(pago, fechaYHora, config);
    return { id: pago.id, insignia: { texto, tono }, monto: formatoPrecio(pago.montoCentavos), detalle };
  });
}
