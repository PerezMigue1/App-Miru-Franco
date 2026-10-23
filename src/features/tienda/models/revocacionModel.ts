import { ApiError, apiPost } from '@/shared/api/apiClient';
import { esObjeto, texto } from '@/features/inicio/models/inicioService';
import { obtenerConfiguracion, type ConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto, type ClaveTexto } from '@/shared/api/textosSitio';
import { tiendaCompra } from '@/shared/ui/tokens';

import { mensajeComunTienda } from './carritoModel';
import {
  diasRevocacion,
  fechaYHora,
  idParaRuta,
  idPedidoValido,
  obtenerPedido,
  pedidoDe,
  puedeCancelar,
  traePedido,
  yaRecogido,
  type Pedido,
} from './pedidoModel';
import { aCentavos, formatoPrecio } from './productoModel';

/**
 * Revocación de compra (art. 56 de la Ley Federal de Protección al Consumidor) desde el detalle del
 * pedido (GP-07.5, como revocacion.ts de la web). El plazo y el monto los calcula el backend
 * (revocableHasta, puedeRevocar y montoRevocable del detalle); aquí solo se decide si se ofrece, se
 * arman los textos con las reglas guardadas en el pedido y se clasifican sus errores. Sin React.
 */

/** Lo que pasó al revocar: reembolsada ya, por reembolsar por el salón, o falta entregar el producto. */
export type EstadoRevocacion = 'reembolsado' | 'en_revision' | 'pendiente_entrega';

export interface Revocacion {
  estado: EstadoRevocacion;
  montoCentavos: number;
}

export interface ResultadoRevocar {
  pedido: Pedido;
  revocacion: Revocacion;
}

const ESTADOS_REVOCACION: readonly EstadoRevocacion[] = ['reembolsado', 'en_revision', 'pendiente_entrega'];

/** El motivo que se manda: recortado, sin espacios de sobra y con el tope del backend; '' si no hay. */
export function motivoParaEnviar(motivo: string): string {
  return motivo.trim().replace(/\s+/g, ' ').slice(0, tiendaCompra.largoMotivoRevocacion).trim();
}

/** { estado, monto } de la respuesta; un estado desconocido cuenta como en revisión (lo más prudente). */
function revocacionDe(respuesta: unknown): Revocacion {
  const crudo = esObjeto(respuesta) && esObjeto(respuesta.revocacion) ? respuesta.revocacion : {};
  const estado = texto(crudo.estado) as EstadoRevocacion;
  return {
    estado: ESTADOS_REVOCACION.includes(estado) ? estado : 'en_revision',
    montoCentavos: aCentavos(crudo.monto),
  };
}

/**
 * Revoca la compra: POST /api/pedidos/:id/revocar { motivo? } (solo la dueña; lo ajeno es 404).
 * Responde { success, data: pedido, revocacion: { estado, monto, devolucionId } }. Si no trae el
 * pedido, lo vuelve a leer. Un id inválido rechaza con ApiError 404 sin llamar al servidor.
 */
export function revocarCompra(id: string | number, motivo = ''): Promise<ResultadoRevocar> {
  if (idPedidoValido(id) === 0) {
    return Promise.reject(new ApiError(404, 'Pedido no encontrado'));
  }
  const limpio = motivoParaEnviar(motivo);
  return apiPost<unknown>(`/api/pedidos/${idParaRuta(id)}/revocar`, limpio ? { motivo: limpio } : {}).then(
    async (respuesta) => ({
      pedido: traePedido(respuesta) ? pedidoDe(respuesta) : await obtenerPedido(id),
      revocacion: revocacionDe(respuesta),
    }),
  );
}

// ── Reglas ─────────────────────────────────────────────────────────────────────────────────

/**
 * El botón "Revocar compra" se ve mientras el backend diga que se puede (puedeRevocar === true) y la
 * hora actual no haya pasado revocableHasta.
 */
export function puedeVerRevocar(
  pedido: Pick<Pedido, 'puedeRevocar' | 'revocableHasta'>,
  ahora: number = Date.now(),
): boolean {
  if (pedido.puedeRevocar !== true || !pedido.revocableHasta) {
    return false;
  }
  const limite = new Date(pedido.revocableHasta).getTime();
  return Number.isFinite(limite) && ahora <= limite;
}

/**
 * Línea breve cuando se ven a la vez "Cancelar pedido" y "Revocar compra": las dos reembolsan, pero
 * la revocación es el derecho legal y sigue disponible después. null si no se ven las dos.
 */
export function textoCancelarORevocar(
  pedido: Pick<Pedido, 'estado' | 'puedeRevocar' | 'revocableHasta' | 'reglas'>,
  puedeCancelarAhora: boolean,
  ahora: number = Date.now(),
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string | null {
  if (!puedeCancelarAhora || !puedeCancelar(pedido) || !puedeVerRevocar(pedido, ahora)) {
    return null;
  }
  return obtenerTexto('pedidos.cancelarORevocar', { diasRevocacion: diasRevocacion(pedido, config) }, config);
}

/** Lo que se reintegraría al revocar: montoRevocable o, si no vino, el total. */
export function montoRevocable(pedido: Pick<Pedido, 'montoRevocableCentavos' | 'totalCentavos'>): number {
  return pedido.montoRevocableCentavos ?? pedido.totalCentavos;
}

/** Hasta cuándo puede revocar, en fecha y hora del teléfono; null sin una fecha válida. */
export function fechaLimiteRevocacion(pedido: Pick<Pedido, 'revocableHasta'>): string | null {
  if (!pedido.revocableHasta) {
    return null;
  }
  return fechaYHora(pedido.revocableHasta) || null;
}

/**
 * Párrafos de la hoja para revocar: el derecho (con los días hábiles guardados en el pedido) y
 * cuánto se reintegra (si ya se devolvió algo, lo que falta), qué pasa con su pedido (si ya lo
 * recogió, entregarlo en el salón; si no, se cancela y se reembolsa) y hasta cuándo puede hacerlo.
 */
export function textosHojaRevocar(
  pedido: Pick<Pedido, 'estado' | 'totalCentavos' | 'montoRevocableCentavos' | 'revocableHasta' | 'reglas'>,
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string[] {
  const saldo = montoRevocable(pedido);
  const reintegro = obtenerTexto(
    saldo < pedido.totalCentavos ? 'tienda.revocar.reintegroParcial' : 'tienda.revocar.reintegroTotal',
    { monto: formatoPrecio(saldo) },
    config,
  );
  const fechaLimite = fechaLimiteRevocacion(pedido);
  return [
    `${obtenerTexto('tienda.revocar.derecho', { diasRevocacion: diasRevocacion(pedido, config) }, config)} ${reintegro}`,
    obtenerTexto(yaRecogido(pedido) ? 'tienda.revocar.yaRecogido' : 'tienda.revocar.sinRecoger', {}, config),
    ...(fechaLimite ? [obtenerTexto('tienda.revocar.hasta', { fechaLimite }, config)] : []),
  ];
}

const RESULTADOS: Record<EstadoRevocacion, ClaveTexto> = {
  reembolsado: 'tienda.revocar.resultadoReembolsado',
  pendiente_entrega: 'tienda.revocar.resultadoPendienteEntrega',
  en_revision: 'tienda.revocar.resultadoEnRevision',
};

/** Mensaje del resultado según lo que respondió el servidor (textos de resultadoRevocacion de la web). */
export function textoResultadoRevocacion(
  revocacion: Revocacion,
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string {
  return obtenerTexto(RESULTADOS[revocacion.estado], { monto: formatoPrecio(revocacion.montoCentavos) }, config);
}

// ── Errores ────────────────────────────────────────────────────────────────────────────────

/**
 * Por qué el backend no revocó (pedidos.service.ts revocar): 409 ya revocada, cancelado, sin pago,
 * plazo terminado, devolución activa, ya reembolsado o el pedido cambió; 404 ajeno o inexistente;
 * 400 del motivo con caracteres no permitidos. Se distingue por el texto, que nunca se muestra.
 */
export type MotivoErrorRevocar =
  | 'yaRevocada'
  | 'cancelado'
  | 'sinPago'
  | 'plazoTerminado'
  | 'devolucionActiva'
  | 'yaReembolsado'
  | 'cambio'
  | 'noEncontrado'
  | 'motivoInvalido';

/** Textos de los 409 de revocar, en el orden en que se revisan (el primero que aparece gana). */
const CONFLICTOS: readonly [RegExp, MotivoErrorRevocar][] = [
  [/ya revocaste/, 'yaRevocada'],
  [/devoluci[oó]n activa/, 'devolucionActiva'],
  [/plazo/, 'plazoTerminado'],
  [/reembols/, 'yaReembolsado'],
  [/no est[aá] pagado/, 'sinPago'],
  [/cancelado/, 'cancelado'],
  [/cambi[oó]/, 'cambio'],
];

export function motivoErrorRevocar(error: unknown): MotivoErrorRevocar | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  if (error.status === 404) {
    return 'noEncontrado';
  }
  if (error.status === 400 && /motivo/i.test(error.message)) {
    return 'motivoInvalido';
  }
  if (error.status !== 409) {
    return null;
  }
  const mensaje = error.message.toLowerCase();
  // Un 409 que no se reconoce: el pedido cambió del lado del servidor (se vuelve a leer).
  return CONFLICTOS.find(([patron]) => patron.test(mensaje))?.[1] ?? 'cambio';
}

const MENSAJES_REVOCAR: Record<MotivoErrorRevocar, ClaveTexto> = {
  yaRevocada: 'tienda.revocar.yaRevocada',
  cancelado: 'tienda.revocar.cancelado',
  sinPago: 'tienda.revocar.sinPago',
  plazoTerminado: 'tienda.revocar.plazoTerminado',
  devolucionActiva: 'tienda.revocar.devolucionActiva',
  yaReembolsado: 'tienda.revocar.yaReembolsado',
  cambio: 'tienda.revocar.cambio',
  noEncontrado: 'tienda.pedido.noEncontrado',
  motivoInvalido: 'tienda.revocar.motivoInvalido',
};

/** Mensaje para la clienta al fallar revocarCompra. Nunca el texto técnico del servidor. */
export function mensajeRevocar(error: unknown, config: ConfiguracionPublica = obtenerConfiguracion()): string {
  const comun = mensajeComunTienda(error);
  if (comun) {
    return comun;
  }
  const motivo = motivoErrorRevocar(error);
  return obtenerTexto(motivo ? MENSAJES_REVOCAR[motivo] : 'tienda.revocar.generico', {}, config);
}
