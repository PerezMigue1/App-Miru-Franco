import { ApiError, apiPost } from '@/shared/api/apiClient';
import { esObjeto } from '@/features/inicio/models/inicioService';
import { obtenerConfiguracion, type ConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto, obtenerTextoConReglas, type ClaveTexto } from '@/shared/api/textosSitio';

import { mensajeComunTienda } from './carritoModel';
import {
  normalizarDevolucion,
  type CausaDevolucion,
  type Devolucion,
  type TipoDevolucion,
} from './devolucionesModel';
import { idParaRuta, idPedidoValido, type Pedido } from './pedidoModel';

/**
 * Pedir y retirar una solicitud de cambio o reembolso desde el detalle del pedido (GP-07.5), como la
 * página de devoluciones de la clienta en la web. La política la valida SIEMPRE el backend
 * (politica-devolucion.ts de backend-miru); aquí solo se ofrecen las opciones que pueden proceder con
 * el estado del pedido, para no pedir lo que el salón rechazaría:
 * - cambio: producto sellado y sin abrir o con defecto de fábrica, de un pedido entregado y dentro de
 *   los días para cambios guardados en el pedido;
 * - reembolso de un pedido entregado y pagado: defecto de fábrica o producto distinto al pedido;
 * - reembolso de un pedido cancelado que ya se pagó: falta de existencias o, si se pagó en línea,
 *   cancelación antes de estar listo.
 * La solicitud nace pendiente y el monto lo calcula el backend: nunca se manda estado ni monto.
 */

/** Estados en que una devolución ocupa el pedido o el artículo (ESTADOS_ACTIVOS del backend). */
const ESTADOS_ACTIVOS: readonly string[] = ['pendiente', 'aprobada'];

/** Lo más largo que se acepta en el detalle (el mismo tope del formulario de la web). */
export const LARGO_MOTIVO_DEVOLUCION = 500;

/** Margen para el reloj del teléfono al buscar una solicitud recién creada tras un error de red. */
const MARGEN_RELOJ_MS = 60 * 1000;

/** Un tipo de solicitud con las causas que pueden proceder para este pedido. */
export interface OpcionTipoDevolucion {
  tipo: TipoDevolucion;
  causas: CausaDevolucion[];
}

/** El cambio y los reembolsos por defecto o producto distinto son sobre un artículo (requiereArticulo de la web). */
export function requiereArticulo(tipo: TipoDevolucion, causa: CausaDevolucion): boolean {
  return tipo === 'cambio' || causa === 'defecto_fabrica' || causa === 'producto_distinto';
}

const activa = (devolucion: Pick<Devolucion, 'estado'>) => ESTADOS_ACTIVOS.includes(devolucion.estado);

/**
 * Hay una solicitud activa del pedido completo (o una revocación): el backend no acepta otra hasta que
 * se resuelva o se retire.
 */
function pedidoOcupado(devoluciones: readonly Pick<Devolucion, 'estado' | 'pedidoItemId'>[]): boolean {
  return devoluciones.some((devolucion) => activa(devolucion) && devolucion.pedidoItemId === null);
}

/** Tipos y causas que la política permite con el estado del pedido (sin ver sus solicitudes). */
function opcionesDePolitica(pedido: Pick<Pedido, 'estado' | 'pagadoEn' | 'metodoPago'>): OpcionTipoDevolucion[] {
  if (pedido.estado === 'entregado') {
    const opciones: OpcionTipoDevolucion[] = [{ tipo: 'cambio', causas: ['sellado_sin_abrir', 'defecto_fabrica'] }];
    if (pedido.pagadoEn) {
      opciones.push({ tipo: 'reembolso', causas: ['defecto_fabrica', 'producto_distinto'] });
    }
    return opciones;
  }
  if (pedido.estado === 'cancelado' && pedido.pagadoEn) {
    const causas: CausaDevolucion[] = ['sin_existencias'];
    if (pedido.metodoPago === 'mercado_pago') {
      causas.push('cancelacion_antes_listo');
    }
    return [{ tipo: 'reembolso', causas }];
  }
  return [];
}

type ConItems = Pick<Pedido, 'estado' | 'pagadoEn' | 'metodoPago'> & { items: readonly Pick<Pedido['items'][number], 'id'>[] };
type Activas = readonly Pick<Devolucion, 'estado' | 'pedidoItemId'>[];

/** Artículos del pedido sin una solicitud activa (los únicos que se ofrecen). */
export function articulosLibres(pedido: Pick<ConItems, 'items'>, devoluciones: Activas = []): number[] {
  const ocupados = new Set(
    devoluciones.filter((devolucion) => activa(devolucion) && devolucion.pedidoItemId !== null).map((d) => d.pedidoItemId),
  );
  return pedido.items.map((item) => item.id).filter((id) => !ocupados.has(id));
}

/**
 * Se puede pedir por el pedido completo: el backend lo rechaza si ya hay cualquier solicitud activa
 * del pedido (de un artículo o del pedido completo).
 */
export function admitePedidoCompleto(devoluciones: Activas = []): boolean {
  return !devoluciones.some(activa);
}

/**
 * Tipos y causas que pueden proceder: los de la política, sin las causas que piden un artículo si ya
 * no queda ninguno libre, ni las demás si no queda artículo libre ni se admite el pedido completo.
 * Vacío si no cabe ninguna solicitud (por ejemplo, con una solicitud activa del pedido completo).
 */
export function opcionesDevolucion(pedido: ConItems, devoluciones: Activas = []): OpcionTipoDevolucion[] {
  if (pedidoOcupado(devoluciones)) {
    return [];
  }
  const hayLibres = articulosLibres(pedido, devoluciones).length > 0;
  const completo = admitePedidoCompleto(devoluciones);
  return opcionesDePolitica(pedido)
    .map(({ tipo, causas }) => ({
      tipo,
      causas: causas.filter((causa) => hayLibres || (!requiereArticulo(tipo, causa) && completo)),
    }))
    .filter((opcion) => opcion.causas.length > 0);
}

/** Lo que la clienta eligió en la hoja. */
export interface SolicitudDevolucion {
  pedidoId: number;
  tipo: TipoDevolucion;
  causa: CausaDevolucion;
  /** null: el pedido completo. */
  pedidoItemId: number | null;
  /** Solo cuenta con la causa sellado_sin_abrir. */
  sellado: boolean;
  motivo: string;
}

/** Lo que falta antes de enviar: el artículo o confirmar que está sellado. null si está completa. */
export type FaltanteSolicitud = 'articulo' | 'sellado';

export function faltanteSolicitud(solicitud: Omit<SolicitudDevolucion, 'pedidoId' | 'motivo'>): FaltanteSolicitud | null {
  if (requiereArticulo(solicitud.tipo, solicitud.causa) && solicitud.pedidoItemId === null) {
    return 'articulo';
  }
  if (solicitud.causa === 'sellado_sin_abrir' && !solicitud.sellado) {
    return 'sellado';
  }
  return null;
}

/** Detalle recortado, con los espacios juntados y sin pasar del tope; '' si no escribió nada. */
export function motivoLimpio(motivo: string): string {
  return motivo.replace(/\s+/g, ' ').trim().slice(0, LARGO_MOTIVO_DEVOLUCION);
}

// ── Llamadas a la API (con sesión) ─────────────────────────────────────────────────────────

/**
 * Registra la solicitud: POST /api/devoluciones?propios=true con { pedidoId, tipo, causa,
 * pedidoItemId?, sellado?, motivo? } (solo los campos del DTO: con estado o monto responde 400).
 * Responde 201 { success, data } con la devolución pendiente. Un id de pedido inválido rechaza sin
 * llamar al servidor.
 */
export function solicitarDevolucion(solicitud: SolicitudDevolucion): Promise<Devolucion> {
  if (idPedidoValido(solicitud.pedidoId) === 0) {
    return Promise.reject(new ApiError(404, 'Pedido no encontrado'));
  }
  const detalle = motivoLimpio(solicitud.motivo);
  return apiPost<unknown>('/api/devoluciones?propios=true', {
    pedidoId: solicitud.pedidoId,
    tipo: solicitud.tipo,
    causa: solicitud.causa,
    ...(solicitud.pedidoItemId === null ? {} : { pedidoItemId: solicitud.pedidoItemId }),
    ...(solicitud.causa === 'sellado_sin_abrir' ? { sellado: solicitud.sellado } : {}),
    ...(detalle ? { motivo: detalle } : {}),
  }).then((respuesta) => {
    const devolucion = esObjeto(respuesta) && esObjeto(respuesta.data) ? normalizarDevolucion(respuesta.data) : null;
    if (!devolucion) {
      throw new Error('Respuesta de devolución sin datos.');
    }
    return devolucion;
  });
}

/**
 * La clienta retira su solicitud mientras siga pendiente: POST /api/devoluciones/:id/cancelar →
 * { success, message }. Un id inválido rechaza sin llamar al servidor.
 */
export function retirarDevolucion(id: number): Promise<void> {
  if (idPedidoValido(id) === 0) {
    return Promise.reject(new ApiError(404, 'Devolución no encontrada'));
  }
  return apiPost<unknown>(`/api/devoluciones/${idParaRuta(id)}/cancelar`, {}).then(() => undefined);
}

/**
 * Se puede retirar desde la app: una solicitud pendiente. Una revocación (art. 56 LFPC) no: retirarla
 * es renunciar a un derecho y a un reembolso, así que se hace con el salón (lo más seguro para el dinero).
 */
export function puedeRetirar(devolucion: Pick<Devolucion, 'estado' | 'esRevocacion'>): boolean {
  return devolucion.estado === 'pendiente' && !devolucion.esRevocacion;
}

/**
 * Tras un error de red al pedir, la solicitud pudo quedar guardada: la que coincide en tipo, causa y
 * artículo, pendiente y creada desde `desdeMs` (con un minuto de margen para el reloj del teléfono).
 */
export function solicitudRecienCreada(
  devoluciones: readonly Devolucion[],
  solicitud: Pick<SolicitudDevolucion, 'tipo' | 'causa' | 'pedidoItemId'>,
  desdeMs: number,
): Devolucion | null {
  return (
    devoluciones.find((devolucion) => {
      const creada = new Date(devolucion.creadoEn).getTime();
      return (
        devolucion.estado === 'pendiente' &&
        !devolucion.esRevocacion &&
        devolucion.tipo === solicitud.tipo &&
        devolucion.causa === solicitud.causa &&
        devolucion.pedidoItemId === solicitud.pedidoItemId &&
        !Number.isNaN(creada) &&
        creada >= desdeMs - MARGEN_RELOJ_MS
      );
    }) ?? null
  );
}

// ── Textos ─────────────────────────────────────────────────────────────────────────────────

const CLAVES_TIPO: Record<TipoDevolucion, { titulo: ClaveTexto; descripcion: ClaveTexto }> = {
  cambio: { titulo: 'tienda.devoluciones.solicitar.tipoCambio', descripcion: 'tienda.devoluciones.solicitar.tipoCambioTexto' },
  reembolso: {
    titulo: 'tienda.devoluciones.solicitar.tipoReembolso',
    descripcion: 'tienda.devoluciones.solicitar.tipoReembolsoTexto',
  },
};

const CLAVES_CAUSA: Record<CausaDevolucion, { titulo: ClaveTexto; descripcion: ClaveTexto }> = {
  sellado_sin_abrir: { titulo: 'tienda.devoluciones.causa.sellado', descripcion: 'tienda.devoluciones.causa.selladoTexto' },
  defecto_fabrica: { titulo: 'tienda.devoluciones.causa.defecto', descripcion: 'tienda.devoluciones.causa.defectoTexto' },
  producto_distinto: { titulo: 'tienda.devoluciones.causa.distinto', descripcion: 'tienda.devoluciones.causa.distintoTexto' },
  sin_existencias: { titulo: 'tienda.devoluciones.causa.existencias', descripcion: 'tienda.devoluciones.causa.existenciasTexto' },
  cancelacion_antes_listo: {
    titulo: 'tienda.devoluciones.causa.cancelacion',
    descripcion: 'tienda.devoluciones.causa.cancelacionTexto',
  },
};

/** Nombre y explicación de un tipo de solicitud, del catálogo. */
export function textoTipoSolicitud(tipo: TipoDevolucion, config: ConfiguracionPublica = obtenerConfiguracion()) {
  const claves = CLAVES_TIPO[tipo];
  return { titulo: obtenerTexto(claves.titulo, {}, config), descripcion: obtenerTexto(claves.descripcion, {}, config) };
}

/** Nombre y explicación de una causa, del catálogo. */
export function textoCausa(causa: CausaDevolucion, config: ConfiguracionPublica = obtenerConfiguracion()) {
  const claves = CLAVES_CAUSA[causa];
  return { titulo: obtenerTexto(claves.titulo, {}, config), descripcion: obtenerTexto(claves.descripcion, {}, config) };
}

/** Días para cambios: los guardados en el pedido o, sin ellos, los vigentes. */
export function diasCambio(pedido: Pick<Pedido, 'reglas'>, config: ConfiguracionPublica = obtenerConfiguracion()): number {
  return pedido.reglas?.diasCambioProducto ?? config.reglas.tienda.diasCambioProducto;
}

/** Resumen de la política con los días para cambios del pedido. */
export function textoPoliticaDevolucion(pedido: Pick<Pedido, 'reglas'>, config: ConfiguracionPublica = obtenerConfiguracion()): string {
  return obtenerTextoConReglas(
    'tienda.devoluciones.solicitar.politica',
    { diasCambioProducto: String(diasCambio(pedido, config)) },
    {},
    config,
  );
}

const FALTANTES: Record<FaltanteSolicitud, ClaveTexto> = {
  articulo: 'tienda.devoluciones.solicitar.faltaArticulo',
  sellado: 'tienda.devoluciones.solicitar.faltaSellado',
};

export function mensajeFaltante(faltante: FaltanteSolicitud, config: ConfiguracionPublica = obtenerConfiguracion()): string {
  return obtenerTexto(FALTANTES[faltante], {}, config);
}

// ── Errores ────────────────────────────────────────────────────────────────────────────────

/**
 * Por qué el backend no registró la solicitud (devoluciones.service.ts crear y
 * validarPoliticaDevolucion): 400 de la política o de un artículo ajeno, 409 con una solicitud
 * activa, 404 del pedido. Se distingue por el texto, que nunca se muestra.
 */
export type MotivoErrorSolicitud =
  | 'causaNoAplica'
  | 'noEntregado'
  | 'faltaArticulo'
  | 'plazoCambio'
  | 'faltaSellado'
  | 'sinPago'
  | 'existenciasEntregado'
  | 'noCancelado'
  | 'soloEnLinea'
  | 'yaListo'
  | 'articuloAjeno'
  | 'yaActiva'
  | 'noEncontrado';

/** Textos de los 400 de la política, en el orden en que se revisan (el primero que aparece gana). */
const POLITICA: readonly [RegExp, MotivoErrorSolicitud][] = [
  [/no aplica para/, 'causaNoAplica'],
  [/todav[ií]a no se ha entregado/, 'noEntregado'],
  [/elige el art[ií]culo/, 'faltaArticulo'],
  [/d[ií]as naturales/, 'plazoCambio'],
  [/sellado y sin abrir/, 'faltaSellado'],
  [/no est[aá] pagado/, 'sinPago'],
  [/falta de existencias/, 'existenciasEntregado'],
  [/no est[aá] cancelado/, 'noCancelado'],
  [/pagados en l[ií]nea/, 'soloEnLinea'],
  [/listo para recoger/, 'yaListo'],
  [/no pertenece/, 'articuloAjeno'],
];

export function motivoErrorSolicitud(error: unknown): MotivoErrorSolicitud | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  if (error.status === 404 || error.status === 403) {
    return 'noEncontrado';
  }
  if (error.status === 409) {
    return 'yaActiva';
  }
  if (error.status !== 400) {
    return null;
  }
  const mensaje = error.message.toLowerCase();
  return POLITICA.find(([patron]) => patron.test(mensaje))?.[1] ?? null;
}

const MENSAJES_SOLICITUD: Record<MotivoErrorSolicitud, ClaveTexto> = {
  causaNoAplica: 'tienda.devoluciones.error.causaNoAplica',
  noEntregado: 'tienda.devoluciones.error.noEntregado',
  faltaArticulo: 'tienda.devoluciones.solicitar.faltaArticulo',
  plazoCambio: 'tienda.devoluciones.error.plazoCambio',
  faltaSellado: 'tienda.devoluciones.solicitar.faltaSellado',
  sinPago: 'tienda.devoluciones.error.sinPago',
  existenciasEntregado: 'tienda.devoluciones.error.existenciasEntregado',
  noCancelado: 'tienda.devoluciones.error.noCancelado',
  soloEnLinea: 'tienda.devoluciones.error.soloEnLinea',
  yaListo: 'tienda.devoluciones.error.yaListo',
  articuloAjeno: 'tienda.devoluciones.error.articuloAjeno',
  yaActiva: 'tienda.devoluciones.error.yaActiva',
  noEncontrado: 'tienda.pedido.noEncontrado',
};

/** Estos piden comunicarse con el salón (se muestra el enlace para llamar). */
export const SOLICITUD_CON_SALON: readonly MotivoErrorSolicitud[] = ['plazoCambio', 'yaListo'];

/** Mensaje para la clienta al fallar solicitarDevolucion. Nunca el texto técnico del servidor. */
export function mensajeSolicitud(
  error: unknown,
  pedido: Pick<Pedido, 'reglas'>,
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string {
  const comun = mensajeComunTienda(error);
  if (comun) {
    return comun;
  }
  const motivo = motivoErrorSolicitud(error);
  if (motivo === 'plazoCambio') {
    return obtenerTextoConReglas(MENSAJES_SOLICITUD.plazoCambio, { diasCambioProducto: String(diasCambio(pedido, config)) }, {}, config);
  }
  return obtenerTexto(motivo ? MENSAJES_SOLICITUD[motivo] : 'tienda.devoluciones.error.generico', {}, config);
}

/** Por qué no se retiró: 404 ajena o inexistente, 409 ya no pendiente o de una revocación ya aplicada. */
export type MotivoErrorRetirar = 'noEncontrada' | 'yaNoPendiente' | 'revocacion';

export function motivoErrorRetirar(error: unknown): MotivoErrorRetirar | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  if (error.status === 404) {
    return 'noEncontrada';
  }
  if (error.status !== 409) {
    return null;
  }
  return /revocaci[oó]n/.test(error.message.toLowerCase()) ? 'revocacion' : 'yaNoPendiente';
}

const MENSAJES_RETIRAR: Record<MotivoErrorRetirar, ClaveTexto> = {
  noEncontrada: 'tienda.devoluciones.retirar.noEncontrada',
  yaNoPendiente: 'tienda.devoluciones.retirar.yaNoPendiente',
  revocacion: 'tienda.devoluciones.retirar.revocacion',
};

/** Mensaje para la clienta al fallar retirarDevolucion. Nunca el texto técnico del servidor. */
export function mensajeRetirar(error: unknown, config: ConfiguracionPublica = obtenerConfiguracion()): string {
  const comun = mensajeComunTienda(error);
  if (comun) {
    return comun;
  }
  const motivo = motivoErrorRetirar(error);
  return obtenerTexto(motivo ? MENSAJES_RETIRAR[motivo] : 'tienda.devoluciones.retirar.generico', {}, config);
}
