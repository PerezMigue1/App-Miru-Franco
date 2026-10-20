import { ApiError, ErrorDeRed, apiGet, apiPatch, apiPost } from '@/shared/api/apiClient';
import { precioParaMostrar } from '@/features/inicio/models/FluidoModel';
import {
  esObjeto,
  idDe,
  listaDe,
  primeraImagen,
  texto,
  urlHttps,
  type Crudo,
} from '@/features/inicio/models/inicioService';
import type { Especialista as EspecialistaDeServicio } from './servicioModel';

/** Tono de una insignia (BadgeEstado); vive aquí para que el model no importe componentes. */
export type TonoBadge = 'aviso' | 'exito' | 'neutro' | 'peligro' | 'info';

/** Especialista para agendar: la del servicio más su puesto y especialidades (GET /api/citas/especialistas). */
export interface Especialista extends EspecialistaDeServicio {
  puesto?: string;
  especialidades: string[];
}

/** Horario libre de 30 en 30 minutos; inicio y fin en ISO tal como los manda el servidor. */
export interface Slot {
  inicio: string;
  fin: string;
  /** Hora de México ya formateada por el servidor. */
  horaLocal: string;
}

/** Disponibilidad de una especialista en un día para un servicio. */
export interface Disponibilidad {
  abierto: boolean;
  /** Por qué no hay horarios ("El salón no abre ese día"), o null. */
  motivo: string | null;
  slots: Slot[];
}

/** Pago del anticipo de una cita (en línea o en el salón), del más viejo al más reciente. */
export interface PagoCita {
  /** Texto crudo del backend: pendiente, aprobado, rechazado, cancelado, reembolsado, en_revision... */
  estado: string;
  /** Monto en número (0 si no es válido). */
  monto: number;
  /** efectivo, transferencia, tarjeta, mercadopago...; null si no viene. */
  metodo: string | null;
  /** Cuándo se aprobó (ISO), o null. */
  pagadoEn: string | null;
  /** Cuándo el salón retuvo el anticipo (ISO; ya no se reembolsa), o null. */
  retenidoEn: string | null;
}

/** Cita de la clienta ya normalizada. */
export interface Cita {
  id: string | number;
  servicioId: string | number;
  servicioNombre: string;
  especialistaId: string | number;
  especialistaNombre: string;
  /** ISO tal como lo manda el servidor. */
  fechaHoraInicio: string;
  fechaHoraFin: string;
  /** Texto crudo del backend: pendiente, confirmada, en_curso, completada, cancelada, reprogramada, no_asistio. */
  estado: string;
  /** Monto del anticipo en número (0 si la cita no lo pide). */
  anticipoRequerido: number;
  /** "$360" listo para mostrar, o null si no hay anticipo. */
  anticipoMonto: string | null;
  /** Plazo para pagar el anticipo (ISO), o null. */
  anticipoVenceEn: string | null;
  /** Cuándo se pagó el anticipo (ISO), o null. */
  anticipoPagadoEn: string | null;
  /** La clienta eligió pagar el anticipo en el salón (plazo: 15 minutos antes del inicio). */
  anticipoEnSalon: boolean;
  /** Notas de la clienta ('' si no hay). */
  notas: string;
  /** Motivo con el que se canceló la cita, o null. */
  motivoCancelacion: string | null;
  /** Duración del servicio en minutos (0 si no viene). */
  servicioDuracionMinutos: number;
  /** Precio del servicio listo para mostrar ("$450"), o null si no viene. */
  servicioPrecio: string | null;
  /** Pagos del anticipo ([] si no hay). */
  pagos: PagoCita[];
}

/** Cómo se paga el anticipo al agendar: en línea con Mercado Pago o en el salón. */
export type PagoAnticipo = 'linea' | 'salon';

/**
 * Estado del anticipo para la app. El backend tiene más estados; se agrupan así:
 * aprobado (y no_requiere) → 'aprobado'; pendiente y revision (ya pagó, falta confirmar) → 'pendiente';
 * sin_pago, rechazado, vencido, cancelada, reembolsado o desconocido → 'sin_pago'.
 */
export type EstadoAnticipo = 'aprobado' | 'pendiente' | 'sin_pago';

/** Motivo de un 409 al pedir la preferencia del anticipo. */
export type MotivoConflictoAnticipo = 'pagado' | 'vencido' | 'noVigente';

export interface DatosNuevaCita {
  /** Id de la clienta en sesión (el backend lo exige aunque usa el de la sesión). */
  clienteId: string;
  especialistaId: string | number;
  servicioId: string | number;
  /** ISO del slot elegido (Slot.inicio). */
  fechaHoraInicio: string;
  /** ISO del slot elegido (Slot.fin). */
  fechaHoraFin: string;
  notas?: string;
  /**
   * Cómo se pagará el anticipo. Sin valor no se manda y el backend usa 'linea'; lo ignora si la
   * cita no pide anticipo.
   */
  pagoAnticipo?: PagoAnticipo;
}

// ── Normalizadores ─────────────────────────────────────────────────────────────────────────

/** Las respuestas de citas vienen como { success, data }; la disponibilidad y el anticipo, sin envoltura. */
function cuerpoDe(respuesta: unknown): Crudo | undefined {
  if (!esObjeto(respuesta)) {
    return undefined;
  }
  return esObjeto(respuesta.data) ? respuesta.data : respuesta;
}

function textoONull(valor: unknown): string | null {
  return texto(valor) || null;
}

/** Monto decimal ("360.00", 360 o "$1,200") a número; 0 si no es válido. */
function montoDe(valor: unknown): number {
  const numero = Number(texto(valor).split('$').join('').split(',').join(''));
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

function listaDeTextos(valor: unknown): string[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  return valor.map((elemento) => (typeof elemento === 'string' ? elemento.trim() : '')).filter(Boolean);
}

function normalizarEspecialista(crudo: Crudo): Especialista | null {
  const id = idDe(crudo);
  const nombre = texto(crudo.nombre);
  if (id === '' || !nombre) {
    return null;
  }
  return {
    id,
    nombre,
    foto: primeraImagen(crudo.foto),
    puesto: texto(crudo.puesto) || undefined,
    especialidades: listaDeTextos(crudo.especialidades),
  };
}

function normalizarSlot(crudo: Crudo): Slot | null {
  const inicio = texto(crudo.inicio);
  const fin = texto(crudo.fin);
  if (!inicio || !fin) {
    return null;
  }
  return { inicio, fin, horaLocal: texto(crudo.horaLocal) };
}

/** Número positivo de minutos; 0 si no es válido. */
function minutosDe(valor: unknown): number {
  const numero = Number(texto(valor));
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero) : 0;
}

function normalizarPago(crudo: Crudo): PagoCita {
  return {
    estado: texto(crudo.estado),
    monto: montoDe(crudo.monto),
    metodo: textoONull(crudo.metodo),
    pagadoEn: textoONull(crudo.pagadoEn),
    retenidoEn: textoONull(crudo.retenidoEn),
  };
}

/**
 * La cita trae especialista { id, nombre, rol }, servicio { id, nombre, duracionMinutos, precio } y
 * pagos [{ id, estado, monto, metodo, proveedor, pagadoEn, retenidoEn }] anidados.
 */
function normalizarCita(crudo: Crudo): Cita {
  const servicio = esObjeto(crudo.servicio) ? crudo.servicio : undefined;
  const especialista = esObjeto(crudo.especialista) ? crudo.especialista : undefined;
  const servicioId = crudo.servicioId ?? servicio?.id;
  const especialistaId = crudo.especialistaId ?? especialista?.id;
  return {
    id: idDe(crudo),
    servicioId: typeof servicioId === 'number' || typeof servicioId === 'string' ? servicioId : '',
    servicioNombre: texto(servicio?.nombre),
    especialistaId:
      typeof especialistaId === 'number' || typeof especialistaId === 'string' ? especialistaId : '',
    especialistaNombre: texto(especialista?.nombre),
    fechaHoraInicio: texto(crudo.fechaHoraInicio),
    fechaHoraFin: texto(crudo.fechaHoraFin),
    estado: texto(crudo.estado),
    anticipoRequerido: montoDe(crudo.anticipoRequerido),
    anticipoMonto: precioParaMostrar(texto(crudo.anticipoRequerido)),
    anticipoVenceEn: textoONull(crudo.anticipoVenceEn),
    anticipoPagadoEn: textoONull(crudo.anticipoPagadoEn),
    anticipoEnSalon: crudo.anticipoEnSalon === true,
    notas: texto(crudo.notas),
    motivoCancelacion: textoONull(crudo.motivoCancelacion),
    servicioDuracionMinutos: minutosDe(servicio?.duracionMinutos),
    servicioPrecio: precioParaMostrar(texto(servicio?.precio)),
    pagos: Array.isArray(crudo.pagos) ? crudo.pagos.filter(esObjeto).map(normalizarPago) : [],
  };
}

/** La cita tiene id y un inicio que se puede leer como fecha. */
function citaValida(cita: Cita): boolean {
  return cita.id !== '' && Boolean(cita.fechaHoraInicio) && !Number.isNaN(new Date(cita.fechaHoraInicio).getTime());
}

function citaDe(respuesta: unknown): Cita {
  const crudo = esObjeto(respuesta) && esObjeto(respuesta.data) ? respuesta.data : undefined;
  if (!crudo) {
    throw new Error('Respuesta de cita sin datos.');
  }
  return normalizarCita(crudo);
}

// ── Llamadas a la API (todas con sesión) ───────────────────────────────────────────────────

/** Especialistas activas para agendar: GET /api/citas/especialistas. */
export function obtenerEspecialistas(): Promise<Especialista[]> {
  return apiGet<unknown>('/api/citas/especialistas').then((respuesta) =>
    listaDe(respuesta, ['data', 'especialistas'])
      .map(normalizarEspecialista)
      .filter((especialista): especialista is Especialista => especialista !== null),
  );
}

/** Horarios libres: GET /api/citas/disponibilidad. `fecha` en 'YYYY-MM-DD' local. */
export function obtenerDisponibilidad(params: {
  especialistaId: string | number;
  fecha: string;
  servicioId: string | number;
}): Promise<Disponibilidad> {
  const consulta =
    `especialistaId=${encodeURIComponent(String(params.especialistaId))}` +
    `&fecha=${encodeURIComponent(params.fecha)}` +
    `&servicioId=${encodeURIComponent(String(params.servicioId))}`;
  return apiGet<unknown>(`/api/citas/disponibilidad?${consulta}`).then((respuesta) => {
    const crudo = cuerpoDe(respuesta);
    const slots = Array.isArray(crudo?.slots)
      ? crudo.slots
          .filter(esObjeto)
          .map(normalizarSlot)
          .filter((slot): slot is Slot => slot !== null)
      : [];
    return {
      abierto: crudo?.abierto === true,
      motivo: textoONull(crudo?.motivo),
      slots,
    };
  });
}

/**
 * Agenda la cita: POST /api/citas?propios=true. Un 400 de horario ocupado (ver esHorarioOcupado)
 * obliga a recargar la disponibilidad; los 400 del anticipo se leen con mensajeAnticipoParaClienta.
 */
export function crearCita(datos: DatosNuevaCita): Promise<Cita> {
  const notas = datos.notas?.trim();
  const cuerpo = {
    clienteId: datos.clienteId,
    especialistaId: String(datos.especialistaId),
    servicioId: Number(datos.servicioId),
    fechaHoraInicio: datos.fechaHoraInicio,
    fechaHoraFin: datos.fechaHoraFin,
    ...(notas ? { notas } : {}),
    ...(datos.pagoAnticipo ? { pagoAnticipo: datos.pagoAnticipo } : {}),
  };
  return apiPost<unknown>('/api/citas?propios=true', cuerpo).then(citaDe);
}

/** Una cita de la clienta: GET /api/citas/:id?propios=true. Una ajena llega como 404. */
export function obtenerCita(id: string | number): Promise<Cita> {
  return apiGet<unknown>(`/api/citas/${encodeURIComponent(String(id))}?propios=true`).then(citaDe);
}

/**
 * Citas de la clienta: GET /api/citas?propios=true&orden=fechaHoraInicio&limit=100. Responde
 * { success, count, page, limit, totalPages, data } con las relaciones y los pagos de cada cita.
 * Se descartan las que no traen id o un inicio válido. Para separarlas usa separarMisCitas.
 */
export function listarMisCitas(): Promise<Cita[]> {
  return apiGet<unknown>('/api/citas?propios=true&orden=fechaHoraInicio&limit=100').then((respuesta) =>
    listaDe(respuesta, ['data', 'citas']).map(normalizarCita).filter(citaValida),
  );
}

/**
 * Mueve la cita al slot elegido: PATCH /api/citas/:id/reprogramar?propios=true. El backend responde
 * { success, data } con la cita ya en estado 'reprogramada', sus relaciones y sus pagos (el anticipo
 * se conserva; con pago en el salón sin pagar, el plazo pasa a 15 min antes del nuevo inicio). Si la
 * respuesta llegara sin data, se relee la cita con obtenerCita para no dar por fallido un cambio que sí
 * se guardó. Los errores se leen con mensajeReprogramacion (horario ocupado: esHorarioOcupado).
 */
export function reprogramarCita(id: string | number, slot: Slot): Promise<Cita> {
  return apiPatch<unknown>(`/api/citas/${encodeURIComponent(String(id))}/reprogramar?propios=true`, {
    fechaHoraInicio: slot.inicio,
    fechaHoraFin: slot.fin,
  }).then((respuesta) =>
    esObjeto(respuesta) && esObjeto(respuesta.data) ? normalizarCita(respuesta.data) : obtenerCita(id),
  );
}

/**
 * Cancela la cita: PATCH /api/citas/:id/cancelar?propios=true con { motivoCancelacion }. El backend
 * responde { success, data }, pero marca el anticipo como retenido después de armar esa respuesta: su
 * data no trae retenidoEn. Por eso no devuelve la cita; el VM la recarga con obtenerCita. Los errores
 * se leen con mensajeCancelacion.
 */
export function cancelarCita(id: string | number, motivo: string): Promise<void> {
  return apiPatch<unknown>(`/api/citas/${encodeURIComponent(String(id))}/cancelar?propios=true`, {
    motivoCancelacion: motivo.trim(),
  }).then(() => undefined);
}

/**
 * Regreso de Mercado Pago a la app al terminar de pagar: appmirufranco://anticipo/<id>?retorno=mp
 * (el backend lo arma con ?origen=app). Lo atiende openAuthSessionAsync, no Expo Router.
 */
export const REDIRECCION_ANTICIPO = 'appmirufranco://anticipo';

/** Marca del regreso desde Mercado Pago en la URL del deep link. */
export const RETORNO_MERCADO_PAGO = 'retorno=mp';

/**
 * URL de Mercado Pago para pagar el anticipo: POST /api/pagos-en-linea/citas/:id/preferencia?origen=app
 * (con origen=app, Mercado Pago regresa a REDIRECCION_ANTICIPO). Responde { initPoint } sin
 * envoltura. Los 409 se clasifican con motivoConflictoAnticipo.
 */
export function crearPreferenciaAnticipo(citaId: string | number): Promise<string> {
  return apiPost<unknown>(
    `/api/pagos-en-linea/citas/${encodeURIComponent(String(citaId))}/preferencia?origen=app`,
  ).then((respuesta) => {
    const url = urlHttps(cuerpoDe(respuesta)?.initPoint);
    if (!url) {
      throw new Error('Respuesta de anticipo sin initPoint.');
    }
    return url;
  });
}

/** Estado real del anticipo: GET /api/pagos-en-linea/citas/:id/estado (consulta a Mercado Pago). */
export function obtenerEstadoAnticipo(citaId: string | number): Promise<EstadoAnticipo> {
  return apiGet<unknown>(
    `/api/pagos-en-linea/citas/${encodeURIComponent(String(citaId))}/estado`,
  ).then((respuesta) => {
    const estado = texto(cuerpoDe(respuesta)?.estado);
    if (estado === 'aprobado' || estado === 'no_requiere') {
      return 'aprobado';
    }
    if (estado === 'pendiente' || estado === 'revision') {
      return 'pendiente';
    }
    return 'sin_pago';
  });
}

// ── Reglas de negocio ──────────────────────────────────────────────────────────────────────

/** La cita pide anticipo y todavía no se paga. */
export function pideAnticipo(cita: Cita): boolean {
  return cita.anticipoRequerido > 0 && !cita.anticipoPagadoEn;
}

/**
 * 400 de crearCita o de reprogramarCita porque la especialista ya tiene una cita en ese horario. El
 * backend no manda code: responde "El especialista ya tiene una cita en ese horario (cita #N)".
 */
export function esHorarioOcupado(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return false;
  }
  return error.message.toLowerCase().includes('en ese horario');
}

/**
 * 400 de crearCita por el anticipo, con mensajes del backend ya escritos para la clienta. Solo estos
 * se muestran tal cual; cualquier otro mensaje del servidor nunca llega a la pantalla.
 */
export const MENSAJES_ANTICIPO_PARA_CLIENTA: readonly string[] = [
  'Ya no da tiempo de pagar en el salón. Paga el anticipo en línea.',
  'Ya tienes una cita por pagar en el salón. Paga su anticipo o elige pagar en línea.',
  'Para esta cita, el anticipo se paga en línea.',
  'Ya no da tiempo de pagar el anticipo antes de tu cita.',
  'El pago del anticipo en línea no está disponible por ahora. Elige pagarlo en el salón.',
];

/** El mensaje del 400 de crearCita si es uno de MENSAJES_ANTICIPO_PARA_CLIENTA; null si no. */
export function mensajeAnticipoParaClienta(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return null;
  }
  const mensaje = error.message.trim();
  return MENSAJES_ANTICIPO_PARA_CLIENTA.includes(mensaje) ? mensaje : null;
}

/**
 * Motivo de un 409 de crearPreferenciaAnticipo (el backend no manda code): "ya está pagado",
 * "El plazo para pagar el anticipo terminó" o "Esta cita ya no está vigente". null si no es 409.
 */
export function motivoConflictoAnticipo(error: unknown): MotivoConflictoAnticipo | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }
  const mensaje = error.message.toLowerCase();
  if (mensaje.includes('plazo')) {
    return 'vencido';
  }
  if (mensaje.includes('pagado')) {
    return 'pagado';
  }
  if (mensaje.includes('vigente')) {
    return 'noVigente';
  }
  return null;
}

// ── Estado del anticipo y de la cita (Mis citas) ───────────────────────────────────────────

/**
 * Estado del anticipo de una cita, igual que en el portal de la web. Sale de los campos de la cita y
 * de sus pagos (los cambia el backend), nunca del regreso de Mercado Pago.
 */
export type EstadoAnticipoCita =
  | 'no_requiere'
  | 'retenido'
  | 'pagado'
  | 'en_revision'
  | 'reembolsado'
  | 'liberada'
  | 'pendiente'
  | 'vencido';

/** Texto y tono de una insignia (BadgeEstado). */
export interface EtiquetaEstado {
  texto: string;
  tono: TonoBadge;
}

function pagosAprobados(cita: Cita): PagoCita[] {
  return cita.pagos.filter((pago) => pago.estado === 'aprobado');
}

/**
 * motivoCancelacion con el que el backend cancela la cita cuyo anticipo no se pagó a tiempo
 * (MOTIVO_ANTICIPO_NO_PAGADO de la barrida de anticipos). No es texto para la clienta.
 */
const MOTIVO_ANTICIPO_NO_PAGADO = 'anticipo_no_pagado';

/**
 * Estado del anticipo, en este orden: sin anticipo → 'no_requiere'; un pago aprobado retenido →
 * 'retenido'; anticipoPagadoEn con un pago aprobado → 'pagado' ('retenido' si la cita es no_asistio);
 * un pago en revisión → 'en_revision'; un pago reembolsado → 'reembolsado'; anticipoPagadoEn sin pago
 * aprobado → 'pagado' ('retenido' si la cita es no_asistio), como la web; cita cancelada sin pago →
 * 'vencido' si la canceló el backend por no pagar a tiempo y 'liberada' si no; si no, 'pendiente' o
 * 'vencido' según anticipoVenceEn ('pendiente' sin plazo válido).
 */
export function estadoAnticipo(cita: Cita, ahora: Date = new Date()): EstadoAnticipoCita {
  if (cita.anticipoRequerido <= 0) {
    return 'no_requiere';
  }
  const aprobados = pagosAprobados(cita);
  if (aprobados.some((pago) => pago.retenidoEn)) {
    return 'retenido';
  }
  if (cita.anticipoPagadoEn && aprobados.length > 0) {
    return cita.estado === 'no_asistio' ? 'retenido' : 'pagado';
  }
  if (cita.pagos.some((pago) => pago.estado === 'en_revision')) {
    return 'en_revision';
  }
  if (cita.pagos.some((pago) => pago.estado === 'reembolsado')) {
    return 'reembolsado';
  }
  // Como en la web: la cita marcada como pagada cuenta como pagada aunque no traiga el pago aprobado.
  if (cita.anticipoPagadoEn) {
    return cita.estado === 'no_asistio' ? 'retenido' : 'pagado';
  }
  if (cita.estado === 'cancelada') {
    return cita.motivoCancelacion === MOTIVO_ANTICIPO_NO_PAGADO ? 'vencido' : 'liberada';
  }
  const vence = cita.anticipoVenceEn ? new Date(cita.anticipoVenceEn).getTime() : Number.NaN;
  if (Number.isNaN(vence)) {
    return 'pendiente';
  }
  return vence > ahora.getTime() ? 'pendiente' : 'vencido';
}

const ETIQUETAS_ANTICIPO: Record<EstadoAnticipoCita, EtiquetaEstado> = {
  no_requiere: { texto: 'Sin anticipo', tono: 'neutro' },
  retenido: { texto: 'Anticipo retenido', tono: 'neutro' },
  pagado: { texto: 'Anticipo pagado', tono: 'exito' },
  en_revision: { texto: 'Anticipo en revisión', tono: 'aviso' },
  reembolsado: { texto: 'Anticipo reembolsado', tono: 'neutro' },
  liberada: { texto: 'Anticipo liberado', tono: 'neutro' },
  pendiente: { texto: 'Anticipo pendiente', tono: 'aviso' },
  vencido: { texto: 'Anticipo vencido', tono: 'aviso' },
};

/**
 * Motivo de la cancelación para mostrar a la clienta: el del backend por anticipo no pagado se
 * explica con palabras; cualquier otro (el que escribió la clienta o el salón) va igual. null si no hay.
 */
export function motivoCancelacionParaClienta(cita: Cita): string | null {
  if (!cita.motivoCancelacion) {
    return null;
  }
  return cita.motivoCancelacion === MOTIVO_ANTICIPO_NO_PAGADO
    ? 'No recibimos tu anticipo a tiempo y el horario quedó libre.'
    : cita.motivoCancelacion;
}

/** Insignia del estado del anticipo. */
export function etiquetaEstadoAnticipo(estado: EstadoAnticipoCita): EtiquetaEstado {
  return ETIQUETAS_ANTICIPO[estado];
}

const ETIQUETAS_CITA: Record<string, EtiquetaEstado> = {
  pendiente: { texto: 'Pendiente', tono: 'aviso' },
  confirmada: { texto: 'Confirmada', tono: 'exito' },
  en_curso: { texto: 'En curso', tono: 'exito' },
  completada: { texto: 'Completada', tono: 'neutro' },
  cancelada: { texto: 'Cancelada', tono: 'neutro' },
  reprogramada: { texto: 'Reprogramada', tono: 'neutro' },
  no_asistio: { texto: 'No asististe', tono: 'neutro' },
};

const ETIQUETA_CITA_DESCONOCIDA: EtiquetaEstado = { texto: 'Sin estado', tono: 'neutro' };

/** Insignia del estado de la cita; un estado que no se conoce sale como 'Sin estado'. */
export function etiquetaEstadoCita(estado: string): EtiquetaEstado {
  return Object.prototype.hasOwnProperty.call(ETIQUETAS_CITA, estado)
    ? ETIQUETAS_CITA[estado]
    : ETIQUETA_CITA_DESCONOCIDA;
}

/**
 * Lo pagado del anticipo, para el aviso de cancelación: la suma de los pagos aprobados (en centavos
 * para no arrastrar decimales) o, si no hay pagos aprobados pero la cita lo marca pagado,
 * anticipoRequerido. 0 si no se ha pagado nada.
 */
export function montoPagadoAnticipo(cita: Cita): number {
  const centavos = pagosAprobados(cita).reduce((suma, pago) => suma + Math.round(pago.monto * 100), 0);
  if (centavos > 0) {
    return centavos / 100;
  }
  return cita.anticipoPagadoEn ? cita.anticipoRequerido : 0;
}

// ── Reglas de la lista de Mis citas ────────────────────────────────────────────────────────

/** Estados en los que la cita sigue en pie (ocupa su horario). */
export const ESTADOS_VIGENTES: readonly string[] = ['pendiente', 'confirmada', 'reprogramada', 'en_curso'];

/** Estados en los que la clienta todavía puede reprogramar o cancelar. */
const ESTADOS_CON_CAMBIOS: readonly string[] = ['pendiente', 'confirmada', 'reprogramada'];

/** La cita sigue en pie: pendiente, confirmada, reprogramada o en curso. */
export function esVigente(cita: Cita): boolean {
  return ESTADOS_VIGENTES.includes(cita.estado);
}

/**
 * La clienta puede reprogramarla o cancelarla: pendiente, confirmada o reprogramada y que todavía
 * no empieza (como la web). Una cita con inicio que no se puede leer no admite cambios.
 */
export function admiteCambios(cita: Cita, ahora: Date = new Date()): boolean {
  if (!ESTADOS_CON_CAMBIOS.includes(cita.estado)) {
    return false;
  }
  const inicio = new Date(cita.fechaHoraInicio).getTime();
  return Number.isFinite(inicio) && inicio > ahora.getTime();
}

/** Milisegundos del inicio; 0 si no se puede leer. */
function inicioEnMs(cita: Cita): number {
  const ms = new Date(cita.fechaHoraInicio).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Próximas: citas vigentes cuyo día local de inicio es hoy o después, de la más cercana a la más
 * lejana. Historial: todas las demás, de la más reciente a la más antigua. El día se compara con
 * fechaLocal (año, mes y día del teléfono), nunca en UTC.
 */
export function separarMisCitas(
  citas: Cita[],
  ahora: Date = new Date(),
): { proximas: Cita[]; historial: Cita[] } {
  const hoy = fechaLocal(ahora);
  const proximas: Cita[] = [];
  const historial: Cita[] = [];
  for (const cita of citas) {
    const inicio = new Date(cita.fechaHoraInicio);
    const desdeHoy = !Number.isNaN(inicio.getTime()) && fechaLocal(inicio) >= hoy;
    if (esVigente(cita) && desdeHoy) {
      proximas.push(cita);
    } else {
      historial.push(cita);
    }
  }
  proximas.sort((a, b) => inicioEnMs(a) - inicioEnMs(b));
  historial.sort((a, b) => inicioEnMs(b) - inicioEnMs(a));
  return { proximas, historial };
}

// ── Errores de reprogramar y cancelar ──────────────────────────────────────────────────────

const MENSAJE_SIN_CONEXION = 'Sin conexión. Revisa tu internet e intenta de nuevo.';
const MENSAJE_SESION_TERMINADA = 'Tu sesión terminó. Inicia sesión de nuevo.';
const MENSAJE_CITA_NO_ENCONTRADA = 'No encontramos esta cita.';
const MENSAJE_HORARIO_OCUPADO = 'Ese horario ya se ocupó. Elige otro.';
const MENSAJE_CITA_COBRADA = 'Esta cita ya se cobró en el salón y no se puede cambiar.';

/**
 * Lo común a reprogramar y cancelar: sin red, sesión terminada (401), 404, 409 de cita ya cobrada o
 * uno de MENSAJES_ANTICIPO_PARA_CLIENTA. null si no es ninguno; cada función decide el resto.
 */
function mensajeComunDeCita(error: unknown): string | null {
  if (error instanceof ErrorDeRed || (error instanceof ApiError && error.status === 0)) {
    return MENSAJE_SIN_CONEXION;
  }
  if (!(error instanceof ApiError)) {
    return null;
  }
  if (error.status === 401) {
    return MENSAJE_SESION_TERMINADA;
  }
  if (error.status === 404) {
    return MENSAJE_CITA_NO_ENCONTRADA;
  }
  // "La cita ya se cobró; no se puede editar ni reprogramar. Cancela la venta primero."
  if (error.status === 409 && error.message.toLowerCase().includes('cobr')) {
    return MENSAJE_CITA_COBRADA;
  }
  return mensajeAnticipoParaClienta(error);
}

/** 400 "No se puede reprogramar|cancelar una cita en estado '...'" (ya terminó o ya se canceló). */
function esCitaSinCambios(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 400 &&
    error.message.toLowerCase().includes('una cita en estado')
  );
}

/**
 * 400 de reprogramarCita porque el horario elegido ya empezó: "Elige un horario que todavía no haya
 * pasado". Igual que el horario ocupado, obliga a recargar la disponibilidad.
 */
export function esHorarioPasado(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 400 &&
    error.message.toLowerCase().includes('todavía no haya pasado')
  );
}

/**
 * 400 de reprogramarCita con menos aviso del que pide la regla horasAvisoCancelarReagendar (solo desde
 * el portal): "Para reagendar con menos de N horas de anticipación, comunícate con el salón.". El
 * mensaje lo arma la app con el número de horas si viene; null si es otro error.
 */
function mensajeAvisoReagendar(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return null;
  }
  const mensaje = error.message.toLowerCase();
  if (!mensaje.includes('para reagendar con menos de')) {
    return null;
  }
  const horas = Number(/menos de (\d+) hora/.exec(mensaje)?.[1] ?? 0);
  if (horas <= 0) {
    return 'Para reagendar con tan poco tiempo, comunícate con el salón.';
  }
  return `Para reagendar con menos de ${horas} ${horas === 1 ? 'hora' : 'horas'} de anticipación, comunícate con el salón.`;
}

/**
 * Mensaje para la clienta al fallar reprogramarCita. Del servidor solo se muestran los textos de
 * MENSAJES_ANTICIPO_PARA_CLIENTA (p. ej. "Ya no da tiempo de pagar el anticipo antes de tu cita.",
 * que llega si el nuevo horario no deja tiempo para pagar el anticipo pendiente); el horario que ya
 * pasó y el aviso mínimo para reagendar llevan mensajes propios, que no invitan a reintentar.
 */
export function mensajeReprogramacion(error: unknown): string {
  if (esHorarioOcupado(error)) {
    return MENSAJE_HORARIO_OCUPADO;
  }
  if (esHorarioPasado(error)) {
    return 'Ese horario ya pasó. Elige otro.';
  }
  const aviso = mensajeAvisoReagendar(error);
  if (aviso) {
    return aviso;
  }
  const comun = mensajeComunDeCita(error);
  if (comun) {
    return comun;
  }
  if (esCitaSinCambios(error)) {
    return 'Esta cita ya no se puede reprogramar.';
  }
  return 'No pudimos cambiar tu cita. Intenta de nuevo en un momento.';
}

/** Mensaje para la clienta al fallar cancelarCita. Nunca el texto técnico del servidor. */
export function mensajeCancelacion(error: unknown): string {
  const comun = mensajeComunDeCita(error);
  if (comun) {
    return comun;
  }
  if (esCitaSinCambios(error)) {
    return 'Esta cita ya no se puede cancelar.';
  }
  if (error instanceof ApiError && error.status === 400) {
    const mensaje = error.message.toLowerCase();
    // "El motivo contiene caracteres no permitidos" (filtro de inyección SQL del backend).
    if (mensaje.includes('caracteres no permitidos')) {
      return 'Tu motivo tiene caracteres que no podemos guardar. Escríbelo de otra forma.';
    }
    // Validación del DTO: "motivoCancelacion should not be empty".
    if (mensaje.includes('motivocancelacion')) {
      return 'Escribe el motivo de la cancelación.';
    }
  }
  return 'No pudimos cancelar tu cita. Intenta de nuevo en un momento.';
}

// ── Fechas locales (México, UTC-6) ─────────────────────────────────────────────────────────

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Mes de calendario con año y mes locales (0 = enero). */
export interface MesCalendario {
  anio: number;
  mes: number;
}

/** Día de una celda del calendario mensual. */
export interface DiaCalendario {
  /** 'YYYY-MM-DD' local. */
  fecha: string;
  /** 24. */
  dia: number;
}

/** Encabezados del calendario, de domingo a sábado: 'Dom', 'Lun', ... 'Sáb'. */
export const ENCABEZADOS_SEMANA = DIAS_CORTOS.map((dia) => dia.charAt(0).toUpperCase() + dia.slice(1));

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** Date o texto a Date. Un 'YYYY-MM-DD' suelto se arma en hora local (no en UTC). */
function aFecha(valor: string | Date): Date {
  if (valor instanceof Date) {
    return valor;
  }
  const partes = valor.trim().split('-');
  if (partes.length === 3 && partes[0].length === 4 && partes[1].length === 2 && partes[2].length === 2) {
    const [anio, mes, dia] = partes.map(Number);
    return new Date(anio, mes - 1, dia);
  }
  return new Date(valor);
}

/** 'YYYY-MM-DD' con el año, mes y día locales del teléfono (sin pasar a UTC). */
export function fechaLocal(fecha: Date): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/** Mes local de una fecha (por omisión, el de hoy). */
export function mesDe(fecha: Date = new Date()): MesCalendario {
  return { anio: fecha.getFullYear(), mes: fecha.getMonth() };
}

/** El mes `delta` meses antes o después; el cambio de año lo resuelve new Date. */
export function sumarMeses(mes: MesCalendario, delta: number): MesCalendario {
  return mesDe(new Date(mes.anio, mes.mes + delta, 1));
}

/** Negativo si `a` es anterior a `b`, 0 si es el mismo mes y positivo si es posterior. */
export function compararMeses(a: MesCalendario, b: MesCalendario): number {
  return (a.anio - b.anio) * 12 + (a.mes - b.mes);
}

/** 'Octubre 2026'. */
export function tituloMes(mes: MesCalendario): string {
  const nombre = MESES[mes.mes] ?? '';
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${mes.anio}`;
}

/**
 * Semanas del mes de domingo a sábado, siete celdas cada una. Las celdas antes del día 1 y después
 * del último día van en null.
 */
export function semanasDelMes(mes: MesCalendario): (DiaCalendario | null)[][] {
  const celdas: (DiaCalendario | null)[] = [];
  const inicio = new Date(mes.anio, mes.mes, 1).getDay();
  const diasDelMes = new Date(mes.anio, mes.mes + 1, 0).getDate();
  for (let i = 0; i < inicio; i++) {
    celdas.push(null);
  }
  for (let dia = 1; dia <= diasDelMes; dia++) {
    celdas.push({ fecha: fechaLocal(new Date(mes.anio, mes.mes, dia)), dia });
  }
  while (celdas.length % DIAS.length !== 0) {
    celdas.push(null);
  }
  const semanas: (DiaCalendario | null)[][] = [];
  for (let i = 0; i < celdas.length; i += DIAS.length) {
    semanas.push(celdas.slice(i, i + DIAS.length));
  }
  return semanas;
}

/** 'sábado 18 de octubre'; '' si la fecha no es válida. */
export function fechaLegible(valor: string | Date): string {
  const fecha = aFecha(valor);
  if (Number.isNaN(fecha.getTime())) {
    return '';
  }
  return `${DIAS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;
}

/** '6:30 p. m.' (12 horas, hora local); '' si la fecha no es válida. */
export function horaLegible(valor: string | Date): string {
  const fecha = aFecha(valor);
  if (Number.isNaN(fecha.getTime())) {
    return '';
  }
  const horas = fecha.getHours();
  const hora12 = horas % 12 === 0 ? 12 : horas % 12;
  return `${hora12}:${dosDigitos(fecha.getMinutes())} ${horas < 12 ? 'a. m.' : 'p. m.'}`;
}

/**
 * Hora límite del anticipo para armar frases, sin conteo en horas: 'antes de las 6:30 p. m.' si
 * vence hoy (año, mes y día locales) o 'antes del miércoles 28 de octubre, 11:15 a. m.' si vence
 * otro día. null si no hay plazo válido.
 */
export function limiteAnticipo(venceEn: string | null, ahora: Date = new Date()): string | null {
  if (!venceEn) {
    return null;
  }
  const fecha = new Date(venceEn);
  const hora = horaLegible(fecha);
  if (!hora) {
    return null;
  }
  if (fechaLocal(fecha) !== fechaLocal(ahora)) {
    return `antes del ${fechaLegible(fecha)}, ${hora}`;
  }
  // 'antes de la 1:15 a. m.' pero 'antes de las 11:15 a. m.'.
  return `antes de ${fecha.getHours() % 12 === 1 ? 'la' : 'las'} ${hora}`;
}

/**
 * Plazo del anticipo para la tarjeta de Mis citas: 'Paga antes de las 6:30 p. m.' si vence hoy o
 * 'Paga antes del sábado 18 de octubre, 11:15 a. m.' si vence otro día. null si no hay plazo válido.
 */
export function limitePagoCorto(venceEn: string | null, ahora: Date = new Date()): string | null {
  const limite = limiteAnticipo(venceEn, ahora);
  return limite ? `Paga ${limite}` : null;
}

/**
 * Aviso de la cita con anticipo en el salón y aún sin pagar: 'Paga tu anticipo en el salón antes
 * de las 11:15 a. m. (15 minutos antes de tu cita). También puedes pagarlo en línea.'
 */
export function avisoAnticipoEnSalon(venceEn: string | null, ahora: Date = new Date()): string {
  const limite = limiteAnticipo(venceEn, ahora);
  const plazo = limite
    ? `${limite} (15 minutos antes de tu cita)`
    : 'a más tardar 15 minutos antes de tu cita';
  return `Paga tu anticipo en el salón ${plazo}. También puedes pagarlo en línea.`;
}
