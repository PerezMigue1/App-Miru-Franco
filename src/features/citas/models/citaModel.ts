import { ApiError, apiGet, apiPatch, apiPost, ErrorDeRed } from '@/shared/api/apiClient';
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
import type { ConfiguracionPublica, DiaSemana } from '@/shared/api/configuracionPublica';
import { esSinRespuesta, mensajeParaClienta, mensajeSinContexto } from '@/shared/api/mensajesError';
import { obtenerTexto, obtenerTextoConReglas } from '@/shared/api/textosSitio';
import {
  aFecha,
  fechaHoraLegible,
  fechaLargaLegible,
  fechaLegible,
  fechaLocal,
  horaLegible,
  NOMBRES_DIAS,
  NOMBRES_MESES,
} from '@/shared/ui/fechasLegibles';
import type { EtiquetaEstado, TonoBadge } from '@/shared/ui/tonoBadge';
import { reglasDeCita, type ReglasCita } from './reglasCitaModel';
import { especialistaOculta, type Especialista as EspecialistaDeServicio } from './servicioModel';

/**
 * El tono y la etiqueta (texto y tono) de una insignia (BadgeEstado). Viven en
 * src/shared/ui/tonoBadge.ts y se vuelven a exportar aquí para lo que ya los tomaba de citaModel.
 */
export type { EtiquetaEstado, TonoBadge };

/** Fechas locales de src/shared/ui/fechasLegibles.ts, vueltas a exportar para las features que ya las usaban de aquí. */
export { fechaHoraLegible, fechaLargaLegible, fechaLegible, fechaLocal, horaLegible };

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
  /** La clienta eligió pagar el anticipo en el salón (plazo: minutosAntesPagoSalon de sus reglas antes del inicio). */
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
  /**
   * Reglas guardadas en la cita al crearla (plazos, aviso, política del anticipo), ya completas con
   * reglasDeCita: sin objeto o con campos inválidos, los valores por omisión (no los vigentes).
   */
  reglas: ReglasCita;
  /** true si el backend mandó el objeto `reglas` (citas anteriores no lo traen). */
  reglasGuardadas: boolean;
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
  const numero = Number(texto(valor).replaceAll('$', '').replaceAll(',', ''));
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

/** Id de una relación (especialista o servicio): el número tal cual, el texto sin espacios; '' si no viene. */
function idDeRelacion(valor: unknown): string | number {
  if (typeof valor === 'number') {
    return valor;
  }
  return typeof valor === 'string' ? valor.trim() : '';
}

function listaDeTextos(valor: unknown): string[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  return valor.map((elemento) => (typeof elemento === 'string' ? elemento.trim() : '')).filter(Boolean);
}

/** Especialista de la agenda; las que vienen ocultas (visible, disponible o activo en false) se descartan. */
function normalizarEspecialista(crudo: Crudo): Especialista | null {
  const id = idDe(crudo);
  const nombre = texto(crudo.nombre);
  if (id === '' || !nombre || especialistaOculta(crudo)) {
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
 * pagos [{ id, estado, monto, metodo, proveedor, pagadoEn, retenidoEn }] anidados. Pura: la usan las
 * llamadas de abajo y las pruebas de las reglas de una cita.
 */
export function normalizarCita(crudo: Crudo): Cita {
  const servicio = esObjeto(crudo.servicio) ? crudo.servicio : undefined;
  const especialista = esObjeto(crudo.especialista) ? crudo.especialista : undefined;
  return {
    id: idDe(crudo),
    servicioId: idDeRelacion(crudo.servicioId ?? servicio?.id),
    servicioNombre: texto(servicio?.nombre),
    // Recortado: con espacios, la consulta de disponibilidad buscaría a otra especialista.
    especialistaId: idDeRelacion(crudo.especialistaId ?? especialista?.id),
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
    reglas: reglasDeCita(crudo.reglas),
    reglasGuardadas: esObjeto(crudo.reglas),
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
    `especialistaId=${encodeURIComponent(String(params.especialistaId).trim())}` +
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

/** Filtro opcional de listarMisCitas: una especialista y un rango de inicio (ISO, inclusivo). */
export interface FiltroMisCitas {
  especialistaId: string | number;
  desde: string;
  hasta: string;
}

/**
 * Citas de la clienta: GET /api/citas?propios=true&orden=fechaHoraInicio&limit=100. Responde
 * { success, count, page, limit, totalPages, data } con las relaciones y los pagos de cada cita.
 * Se descartan las que no traen id o un inicio válido. Para separarlas usa separarMisCitas. Con
 * filtro, solo las de esa especialista con inicio entre desde y hasta (especialistaId, desde y hasta
 * de ListCitasDto; el backend respeta la hora de un ISO completo).
 */
export function listarMisCitas(filtro?: FiltroMisCitas): Promise<Cita[]> {
  const extra = filtro
    ? `&especialistaId=${encodeURIComponent(String(filtro.especialistaId).trim())}` +
      `&desde=${encodeURIComponent(filtro.desde)}&hasta=${encodeURIComponent(filtro.hasta)}`
    : '';
  return apiGet<unknown>(`/api/citas?propios=true&orden=fechaHoraInicio&limit=100${extra}`).then((respuesta) =>
    listaDe(respuesta, ['data', 'citas']).map(normalizarCita).filter(citaValida),
  );
}

/**
 * Lanzado por crearCitaVerificada cuando no se sabe si la cita quedó registrada: la clienta revisa
 * Mis citas antes de intentar de nuevo (citas.reserva.sinConfirmar). La causa es el error original.
 */
export class ReservaSinConfirmar extends Error {
  readonly causa: unknown;

  constructor(causa: unknown) {
    super('No se pudo confirmar si la cita quedó registrada.');
    this.name = 'ReservaSinConfirmar';
    this.causa = causa;
  }
}

/** Qué se encontró al buscar la cita recién creada. */
export type BusquedaCitaReciente =
  | { estado: 'encontrada'; cita: Cita }
  | { estado: 'ninguna' }
  | { estado: 'sinVerificar' };

/** Mismo instante (no mismo texto): '...T17:00:00Z' y '...T17:00:00.000Z' son la misma hora. */
function mismoInstante(a: string, b: string): boolean {
  const ms = new Date(a).getTime();
  return Number.isFinite(ms) && ms === new Date(b).getTime();
}

/**
 * Busca entre las citas de la clienta una vigente con la misma especialista, el mismo servicio y el
 * mismo inicio que la enviada (la consulta se acota a esa especialista y ese instante, así el límite
 * de 100 no la deja fuera). Una sola es la recién creada; ninguna, no se creó; varias o sin poder
 * consultar, no se sabe. Nunca lanza.
 */
export async function buscarCitaRecienCreada(
  datos: Pick<DatosNuevaCita, 'especialistaId' | 'servicioId' | 'fechaHoraInicio'>,
): Promise<BusquedaCitaReciente> {
  let citas: Cita[];
  try {
    citas = await listarMisCitas({
      especialistaId: datos.especialistaId,
      desde: datos.fechaHoraInicio,
      hasta: datos.fechaHoraInicio,
    });
  } catch {
    return { estado: 'sinVerificar' };
  }
  const candidatas = citas.filter(
    (cita) =>
      esVigente(cita) &&
      String(cita.especialistaId) === String(datos.especialistaId).trim() &&
      String(cita.servicioId) === String(datos.servicioId) &&
      mismoInstante(cita.fechaHoraInicio, datos.fechaHoraInicio),
  );
  if (candidatas.length === 1) {
    return { estado: 'encontrada', cita: candidatas[0] };
  }
  return candidatas.length === 0 ? { estado: 'ninguna' } : { estado: 'sinVerificar' };
}

/**
 * crearCita sin dejar una cita huérfana. El backend no tiene clave de idempotencia: sin respuesta
 * (sin red o tiempo agotado), con un 5xx (el proxy pudo cortar la respuesta después de guardar) o con
 * una respuesta que no se pudo leer, la cita pudo quedar creada, y al reintentar el horario saldría
 * ocupado por ella misma (pendiente de anticipo o por pagar en el salón, que cuenta para el tope).
 * Antes de dejar reintentar se busca (buscarCitaRecienCreada): si está, se sigue con ella como con un
 * éxito; si con certeza no se creó, se lanza el error original (se puede reintentar); si no se sabe,
 * se lanza ReservaSinConfirmar. Cualquier otro error se lanza tal cual.
 */
export async function crearCitaVerificada(datos: DatosNuevaCita): Promise<Cita> {
  try {
    return await crearCita(datos);
  } catch (error) {
    const ilegible = !(error instanceof ApiError) && !(error instanceof ErrorDeRed);
    const sinRespuesta = ilegible || esSinRespuesta(error) || (error instanceof ApiError && error.status >= 500);
    if (!sinRespuesta) {
      throw error;
    }
    const busqueda = await buscarCitaRecienCreada(datos);
    if (busqueda.estado === 'encontrada') {
      return busqueda.cita;
    }
    // Una respuesta ilegible es una respuesta correcta del servidor: la cita sí se creó.
    if (busqueda.estado === 'sinVerificar' || ilegible) {
      throw new ReservaSinConfirmar(error);
    }
    throw error;
  }
}

/**
 * Mueve la cita al slot elegido: PATCH /api/citas/:id/reprogramar?propios=true. El backend responde
 * { success, data } con la cita ya en estado 'reprogramada', sus relaciones y sus pagos (el anticipo
 * se conserva; con pago en el salón sin pagar, el plazo pasa a los minutosAntesPagoSalon de sus reglas
 * antes del nuevo inicio; en línea sin pagar, conserva su plazo). Si la
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

/** GET /api/pagos-en-linea/citas/:id/estado (consulta a Mercado Pago), sin envoltura. */
function leerEstadoAnticipo(citaId: string | number): Promise<Crudo | undefined> {
  return apiGet<unknown>(`/api/pagos-en-linea/citas/${encodeURIComponent(String(citaId))}/estado`).then(cuerpoDe);
}

/** El estado de la respuesta de GET /api/pagos-en-linea/citas/:id/estado, agrupado para la app. */
function estadoAnticipoDe(cuerpo: Crudo | undefined): EstadoAnticipo {
  const estado = texto(cuerpo?.estado);
  if (estado === 'aprobado' || estado === 'no_requiere') {
    return 'aprobado';
  }
  if (estado === 'pendiente' || estado === 'revision') {
    return 'pendiente';
  }
  return 'sin_pago';
}

/** Estado real del anticipo: GET /api/pagos-en-linea/citas/:id/estado (consulta a Mercado Pago). */
export function obtenerEstadoAnticipo(citaId: string | number): Promise<EstadoAnticipo> {
  return leerEstadoAnticipo(citaId).then(estadoAnticipoDe);
}

/**
 * Qué pasa con el anticipo pagado si la clienta cancela hoy (Política de anticipos): campo
 * `cancelacion` del estado del anticipo. El backend lo calcula con los días hábiles y las reglas
 * guardadas en la cita; solo viene con el anticipo pagado, sin retener y la cita vigente.
 */
export interface PoliticaCancelacion {
  reembolsable: boolean;
  /** Fin del plazo para cancelar con reembolso (ISO), o null si la cita está muy cerca del pago. */
  reembolsableHasta: string | null;
  diasHabilesHastaCita: number;
}

/**
 * La política de cancelación del anticipo: GET /api/pagos-en-linea/citas/:id/estado (`cancelacion`).
 * null si no viene. Los errores llegan como ApiError o ErrorDeRed; quien la usa decide qué mostrar.
 */
export function obtenerPoliticaCancelacion(citaId: string | number): Promise<PoliticaCancelacion | null> {
  return leerEstadoAnticipo(citaId).then(politicaCancelacionDe);
}

/** El campo `cancelacion` de la respuesta del estado del anticipo, o null si no viene. */
function politicaCancelacionDe(cuerpo: Crudo | undefined): PoliticaCancelacion | null {
  const politica = cuerpo?.cancelacion;
  if (!esObjeto(politica)) {
    return null;
  }
  const dias = Number(politica.diasHabilesHastaCita);
  return {
    reembolsable: politica.reembolsable === true,
    reembolsableHasta: textoONull(politica.reembolsableHasta),
    diasHabilesHastaCita: Number.isFinite(dias) ? dias : 0,
  };
}

/**
 * Estado del anticipo y su política de cancelación en una sola consulta (GET
 * /api/pagos-en-linea/citas/:id/estado), para la hoja de cancelar de una cita cuyo anticipo aún no
 * se ve pagado: el pago pudo aprobarse o seguir en proceso en Mercado Pago. Los errores llegan como
 * ApiError o ErrorDeRed.
 */
export function obtenerAnticipoAlCancelar(
  citaId: string | number,
): Promise<{ estado: EstadoAnticipo; politica: PoliticaCancelacion | null }> {
  return leerEstadoAnticipo(citaId).then((cuerpo) => ({
    estado: estadoAnticipoDe(cuerpo),
    politica: politicaCancelacionDe(cuerpo),
  }));
}

/**
 * La clienta cambia a pago en el salón el anticipo que apartó en línea: PATCH
 * /api/citas/:id/anticipo-en-salon, sin cuerpo (la web lo llama sin ?propios). Responde
 * { success, citaId, anticipoEnSalon, anticipoVenceEn }; devuelve el plazo nuevo (o null). Los
 * errores se leen con mensajeAnticipoEnSalon.
 */
export function cambiarAnticipoASalon(citaId: string | number): Promise<{ anticipoVenceEn: string | null }> {
  return apiPatch<unknown>(`/api/citas/${encodeURIComponent(String(citaId))}/anticipo-en-salon`).then(
    (respuesta) => ({ anticipoVenceEn: textoONull(cuerpoDe(respuesta)?.anticipoVenceEn) }),
  );
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
 * Textos propios para los 400 de crearCita por el anticipo (el backend no manda code). El 400 se
 * reconoce cuando su mensaje es igual a uno de estos (o es la variante de
 * MENSAJE_VARIAS_CITAS_POR_PAGAR_EN_SALON) y entonces se muestra el texto de esta lista, nunca el
 * del servidor. "El anticipo se paga en línea." llega cuando el salón apagó la regla
 * permitirAnticipoEnSalon.
 */
export const MENSAJES_ANTICIPO_PARA_CLIENTA: readonly string[] = [
  'Ya no da tiempo de pagar en el salón. Paga el anticipo en línea.',
  'Ya tienes una cita por pagar en el salón. Paga su anticipo o elige pagar en línea.',
  'Para esta cita, el anticipo se paga en línea.',
  'Ya no da tiempo de pagar el anticipo antes de tu cita.',
  'El pago del anticipo en línea no está disponible por ahora. Elige pagarlo en el salón.',
  'El anticipo se paga en línea.',
];

/**
 * 400 de crearCita cuando la regla maxCitasPorPagarEnSalon vale N distinto de 1: el backend pone el
 * número en el texto, así que no cabe en la lista. Anclada para que solo pase ese texto con dígitos;
 * con N = 1 el backend manda el texto en singular, que sí está en la lista.
 */
const MENSAJE_VARIAS_CITAS_POR_PAGAR_EN_SALON =
  /^Ya tienes (\d+) citas por pagar en el salón\. Paga su anticipo o elige pagar en línea\.$/;

/** Una forma de reconocer un mensaje del servidor y el texto propio que le toca. */
interface TextosPropios {
  /** Textos que se reconocen tal cual (el que se muestra es el de esta lista). */
  iguales: readonly string[];
  /** Variante con un número N (distinto de 1) en el primer grupo y su texto propio con ese número. */
  conNumero?: { patron: RegExp; armar: (numero: string) => string };
}

/**
 * El texto propio de la app que corresponde al mensaje del servidor (recortado): el igual de la
 * lista o la variante armada con su número. null si no es ninguno. Nunca devuelve el del servidor.
 */
function textoPropio(mensajeServidor: string, propios: TextosPropios): string | null {
  const mensaje = mensajeServidor.trim();
  const igual = propios.iguales.find((texto) => texto === mensaje);
  if (igual !== undefined) {
    return igual;
  }
  const variante = propios.conNumero;
  const numero = variante?.patron.exec(mensaje)?.[1];
  return variante && numero !== undefined ? variante.armar(numero) : null;
}

const PROPIOS_ANTICIPO: TextosPropios = {
  iguales: MENSAJES_ANTICIPO_PARA_CLIENTA,
  conNumero: {
    patron: MENSAJE_VARIAS_CITAS_POR_PAGAR_EN_SALON,
    armar: (n) => `Ya tienes ${n} citas por pagar en el salón. Paga su anticipo o elige pagar en línea.`,
  },
};

/**
 * El texto propio para un 400 de crearCita que es uno de MENSAJES_ANTICIPO_PARA_CLIENTA o la
 * variante con N citas por pagar en el salón; null si no.
 */
export function mensajeAnticipoParaClienta(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return null;
  }
  return textoPropio(error.message, PROPIOS_ANTICIPO);
}

/**
 * Respuestas de PATCH /api/citas/:id/anticipo-en-salon ya escritas para la clienta: los 409 (ya no
 * se puede cambiar, ya se pagó en línea, pago en línea en proceso), los 400 de la regla y el 503 de
 * Mercado Pago. Solo estos (y la variante con N citas por pagar en el salón) se muestran tal cual.
 */
export const MENSAJES_ANTICIPO_EN_SALON: Readonly<Record<number, readonly string[]>> = {
  400: [
    'El anticipo se paga en línea.',
    'Ya no da tiempo de pagar en el salón. Paga el anticipo en línea.',
    'Para esta cita, el anticipo se paga en línea.',
    'Ya tienes una cita por pagar en el salón. Paga su anticipo o paga esta en línea.',
  ],
  409: [
    'El anticipo de esta cita ya no se puede cambiar a pago en el salón.',
    'Tu anticipo ya se pagó en línea: no tienes que pagarlo en el salón.',
    'Tienes un pago en línea en proceso para este anticipo. Espera su confirmación antes de cambiar a pago en el salón.',
  ],
  503: ['No pudimos confirmar con Mercado Pago si ya pagaste el anticipo. Intenta de nuevo en unos minutos.'],
};

/** 400 de anticipo-en-salon con N citas por pagar en el salón (N distinto de 1). */
const MENSAJE_VARIAS_CITAS_EN_SALON =
  /^Ya tienes (\d+) citas por pagar en el salón\. Paga su anticipo o paga esta en línea\.$/;

/** Solo los 400 de anticipo-en-salon tienen la variante con N citas. */
const VARIAS_CITAS_EN_SALON: TextosPropios['conNumero'] = {
  patron: MENSAJE_VARIAS_CITAS_EN_SALON,
  armar: (n) => `Ya tienes ${n} citas por pagar en el salón. Paga su anticipo o paga esta en línea.`,
};

/**
 * Mensaje para la clienta al fallar cambiarAnticipoASalon: el texto propio de
 * MENSAJES_ANTICIPO_EN_SALON que corresponde al del servidor para su status (o la variante con N
 * citas); si no, uno propio por tipo de error. Nunca el texto del servidor.
 */
export function mensajeAnticipoEnSalon(error: unknown): string {
  if (error instanceof ApiError) {
    const propio = textoPropio(error.message, {
      iguales: MENSAJES_ANTICIPO_EN_SALON[error.status] ?? [],
      conNumero: error.status === 400 ? VARIAS_CITAS_EN_SALON : undefined,
    });
    if (propio) {
      return propio;
    }
  }
  return mensajeComunDeCita(error) ?? mensajeParaClienta(error, { respaldo: obtenerTexto('citas.anticipoSalon.noSePudo') });
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
 * 'vencido' si la canceló el backend por no pagar a tiempo y 'liberada' si no; si no, 'pendiente'.
 * El plazo vencido lo decide el backend (estado y motivo), nunca el reloj del teléfono: una cita
 * vigente cuyo anticipoVenceEn ya pasó sigue 'pendiente' hasta que la barrida la cancele.
 */
export function estadoAnticipo(cita: Cita): EstadoAnticipoCita {
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
    return esCanceladaPorAnticipo(cita) ? 'vencido' : 'liberada';
  }
  return 'pendiente';
}

/** El backend canceló la cita porque el anticipo no se pagó a tiempo (barrida de anticipos). */
export function esCanceladaPorAnticipo(cita: Pick<Cita, 'estado' | 'motivoCancelacion'>): boolean {
  return cita.estado === 'cancelada' && cita.motivoCancelacion === MOTIVO_ANTICIPO_NO_PAGADO;
}

/**
 * El plazo del anticipo ya pasó según el reloj del teléfono. Solo sirve para no mostrar una hora
 * límite que ya pasó (el backend puede tener otra hora o el pago puede estar en camino): el estado lo
 * sigue decidiendo el backend. false sin plazo válido.
 */
export function plazoAnticipoPasado(venceEn: string | null, ahora: Date = new Date()): boolean {
  const vence = venceEn ? new Date(venceEn).getTime() : Number.NaN;
  return Number.isFinite(vence) && vence <= ahora.getTime();
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
  return cita.motivoCancelacion === MOTIVO_ANTICIPO_NO_PAGADO ? obtenerTexto('anticipos.liberada') : cita.motivoCancelacion;
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
 * anticipoRequerido. 0 si no se ha pagado nada o si el anticipo se reembolsó: al reembolsar, el pago
 * pasa a 'reembolsado' y la cita conserva anticipoPagadoEn, así que esa marca ya no cuenta.
 */
export function montoPagadoAnticipo(cita: Cita): number {
  const centavos = pagosAprobados(cita).reduce((suma, pago) => suma + Math.round(pago.monto * 100), 0);
  if (centavos > 0) {
    return centavos / 100;
  }
  if (!cita.anticipoPagadoEn || cita.pagos.some((pago) => pago.estado === 'reembolsado')) {
    return 0;
  }
  return cita.anticipoRequerido;
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

/**
 * Lo común a reprogramar y cancelar: lo que no depende de la pantalla (sin red, tiempo agotado,
 * sesión terminada, límite de solicitudes; mensajeSinContexto), 404, 409 de cita ya cobrada o uno
 * de MENSAJES_ANTICIPO_PARA_CLIENTA. null si no es ninguno; cada función decide el resto.
 */
function mensajeComunDeCita(error: unknown): string | null {
  const sinContexto = mensajeSinContexto(error);
  if (sinContexto) {
    return sinContexto;
  }
  if (!(error instanceof ApiError)) {
    return null;
  }
  if (error.status === 404) {
    return obtenerTexto('citas.errores.citaNoEncontrada');
  }
  // "La cita ya se cobró; no se puede editar ni reprogramar. Cancela la venta primero."
  if (error.status === 409 && error.message.toLowerCase().includes('cobr')) {
    return obtenerTexto('citas.errores.citaCobrada');
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
 * el portal): "Para reagendar con menos de N horas de anticipación, comunícate con el salón.".
 */
export function esAvisoReagendar(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 400 &&
    error.message.toLowerCase().includes('para reagendar con menos de')
  );
}

/**
 * El mensaje del aviso mínimo para reagendar con `horas` (las de la regla de la cita o las que trae
 * el servidor); sin horas válidas, el texto sin número. Del catálogo de textos.
 */
export function textoAvisoReagendar(horas: number): string {
  if (!(horas > 0)) {
    return obtenerTexto('citas.reprogramar.avisoSinHoras');
  }
  return obtenerTexto('citas.reprogramar.avisoMinimo', { horasAviso: `${horas} ${horas === 1 ? 'hora' : 'horas'}` });
}

/** El aviso de reagendar con el número de horas que trae el error del servidor; null si es otro error. */
function mensajeAvisoReagendar(error: unknown): string | null {
  if (!esAvisoReagendar(error)) {
    return null;
  }
  const mensaje = (error as ApiError).message.toLowerCase();
  return textoAvisoReagendar(Number(/menos de (\d+) hora/.exec(mensaje)?.[1] ?? 0));
}

/**
 * Mensaje para la clienta al fallar reprogramarCita. Solo textos propios: los de
 * MENSAJES_ANTICIPO_PARA_CLIENTA (p. ej. "Ya no da tiempo de pagar el anticipo antes de tu cita.",
 * que llega si el nuevo horario no deja tiempo para pagar el anticipo pendiente); el horario que ya
 * pasó y el aviso mínimo para reagendar llevan mensajes propios, que no invitan a reintentar.
 */
export function mensajeReprogramacion(error: unknown): string {
  if (esHorarioOcupado(error)) {
    return obtenerTexto('citas.errores.horarioOcupado');
  }
  if (esHorarioPasado(error)) {
    return obtenerTexto('citas.errores.horarioPasado');
  }
  const aviso = mensajeAvisoReagendar(error);
  if (aviso) {
    return aviso;
  }
  // Con el anticipo sin pagar, el nuevo horario no deja tiempo para pagarlo ("Ya no da tiempo de
  // pagar el anticipo antes de tu cita."): el texto ya está escrito para la clienta.
  const anticipo = mensajeAnticipoParaClienta(error);
  if (anticipo) {
    return anticipo;
  }
  const comun = mensajeComunDeCita(error);
  if (comun) {
    return comun;
  }
  if (esCitaSinCambios(error)) {
    return obtenerTexto('citas.errores.noSeReprograma');
  }
  return mensajeParaClienta(error, { respaldo: obtenerTexto('citas.errores.reprogramar') });
}

/** Mensaje para la clienta al fallar cancelarCita. Nunca el texto técnico del servidor. */
export function mensajeCancelacion(error: unknown): string {
  const comun = mensajeComunDeCita(error);
  if (comun) {
    return comun;
  }
  if (esCitaSinCambios(error)) {
    return obtenerTexto('citas.errores.noSeCancela');
  }
  if (error instanceof ApiError && error.status === 400) {
    const mensaje = error.message.toLowerCase();
    // "El motivo contiene caracteres no permitidos" (filtro de inyección SQL del backend).
    if (mensaje.includes('caracteres no permitidos')) {
      return obtenerTexto('citas.errores.motivoCaracteres');
    }
    // Validación del DTO: "motivoCancelacion should not be empty".
    if (mensaje.includes('motivocancelacion')) {
      return obtenerTexto('citas.errores.motivoVacio');
    }
  }
  return mensajeParaClienta(error, { respaldo: obtenerTexto('citas.errores.cancelar') });
}

// ── Calendario con fechas locales (México, UTC-6) ──────────────────────────────────────────
// aFecha, fechaLocal, fechaLegible y demás viven en src/shared/ui/fechasLegibles.ts.

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

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
  const nombre = NOMBRES_MESES[mes.mes] ?? '';
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
  while (celdas.length % NOMBRES_DIAS.length !== 0) {
    celdas.push(null);
  }
  const semanas: (DiaCalendario | null)[][] = [];
  for (let i = 0; i < celdas.length; i += NOMBRES_DIAS.length) {
    semanas.push(celdas.slice(i, i + NOMBRES_DIAS.length));
  }
  return semanas;
}

// ── Días sin citas (horario e inhábiles de la configuración pública) ───────────────────────

/** Por qué un día no tiene citas: el salón no abre ese día de la semana, o es un día inhábil. */
export type TipoBloqueo = 'cerrado' | 'inhabil';

/** Día del calendario que no se puede elegir. */
export interface DiaBloqueado {
  /** 'YYYY-MM-DD' local. */
  fecha: string;
  tipo: TipoBloqueo;
  /** Motivo del día inhábil tal como lo escribió el salón ('' si no trae o si es 'cerrado'). */
  motivo: string;
}

/** Lo que se necesita de la configuración pública para saber qué días no tienen citas. */
export interface CalendarioSalon {
  horario: ConfiguracionPublica['horario'];
  reglas: Pick<ConfiguracionPublica['reglas'], 'diasInhabiles'>;
}

/** Día de la semana de la configuración (sin acentos) por getDay(): 0 es domingo. */
const DIAS_CONFIGURACION: readonly DiaSemana[] = [
  'domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
];

/** El 'YYYY-MM-DD' es una fecha real del calendario (sin 31 de febrero ni meses 13). */
function esFechaDeCalendario(fecha: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fechaLocal(aFecha(fecha)) === fecha;
}

/**
 * Si el día ('YYYY-MM-DD' local) no tiene citas y por qué: inhábil si está en diasInhabiles (gana
 * aunque además caiga en un día cerrado, y lleva su motivo) o cerrado si su día de la semana está
 * cerrado en el horario. El día de la semana se arma en hora local, sin depender de la zona. null
 * si se puede elegir o si la fecha no es válida.
 */
export function bloqueoDelDia(fecha: string, calendario: CalendarioSalon): DiaBloqueado | null {
  if (!esFechaDeCalendario(fecha)) {
    return null;
  }
  const inhabil = calendario.reglas.diasInhabiles.find((dia) => dia.fecha === fecha);
  if (inhabil) {
    return { fecha, tipo: 'inhabil', motivo: inhabil.motivo.trim() };
  }
  const nombre = DIAS_CONFIGURACION[aFecha(fecha).getDay()];
  const horario = calendario.horario.dias.find((dia) => dia.dia === nombre);
  return horario?.cerrado ? { fecha, tipo: 'cerrado', motivo: '' } : null;
}

/** Los días bloqueados del mes, del primero al último. */
export function bloqueosDelMes(mes: MesCalendario, calendario: CalendarioSalon): DiaBloqueado[] {
  const diasDelMes = new Date(mes.anio, mes.mes + 1, 0).getDate();
  const bloqueos: DiaBloqueado[] = [];
  for (let dia = 1; dia <= diasDelMes; dia++) {
    const bloqueo = bloqueoDelDia(fechaLocal(new Date(mes.anio, mes.mes, dia)), calendario);
    if (bloqueo) {
      bloqueos.push(bloqueo);
    }
  }
  return bloqueos;
}

/** Lo más lejos que se busca un día libre (un año): con todo cerrado no se busca para siempre. */
export const DIAS_BUSQUEDA_LIBRE = 366;

/**
 * El primer día sin bloqueo desde `desde` ('YYYY-MM-DD' local, incluido), o null si no hay ninguno
 * en DIAS_BUSQUEDA_LIBRE días o si `desde` no es una fecha válida.
 */
export function primerDiaLibre(desde: string, calendario: CalendarioSalon): string | null {
  if (!esFechaDeCalendario(desde)) {
    return null;
  }
  const inicio = aFecha(desde);
  for (let i = 0; i < DIAS_BUSQUEDA_LIBRE; i++) {
    const fecha = fechaLocal(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
    if (!bloqueoDelDia(fecha, calendario)) {
      return fecha;
    }
  }
  return null;
}

/** Mes local de un 'YYYY-MM-DD' (sin pasar por UTC). */
export function mesDeFecha(fecha: string): MesCalendario {
  return mesDe(aFecha(fecha));
}

/**
 * Hora límite del anticipo para armar frases, sin conteo en horas: 'antes de las 6:30 p. m.' si
 * vence hoy (año, mes y día locales) o 'antes del miércoles 28 de octubre, 11:15 a. m.' si vence
 * otro día. null si no hay plazo válido o si ya pasó según el reloj del teléfono (no se muestra una
 * hora límite que ya pasó; el estado lo decide el backend).
 */
export function limiteAnticipo(venceEn: string | null, ahora: Date = new Date()): string | null {
  if (!venceEn || plazoAnticipoPasado(venceEn, ahora)) {
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
 * Plazo del anticipo en el salón: 'Paga tu anticipo en el salón antes de las 11:15 a. m. (15
 * minutos antes de tu cita).' o, sin plazo válido, 'a más tardar 15 minutos antes de tu cita'. Los
 * minutos son los de la regla de la cita (cita.reglas.minutosAntesPagoSalon); sin ellos, los
 * vigentes. El texto sale del catálogo con esos minutos aunque la regla vigente sea otra.
 */
export function plazoAnticipoEnSalon(
  venceEn: string | null,
  ahora: Date = new Date(),
  minutosAntesPagoSalon?: number,
  config?: ConfiguracionPublica,
): string {
  const limite = limiteAnticipo(venceEn, ahora);
  const clave = limite ? 'citas.anticipoSalon.plazo' : 'citas.anticipoSalon.plazoSinLimite';
  const contexto = limite ? { limite } : {};
  return minutosAntesPagoSalon === undefined
    ? obtenerTexto(clave, contexto, config)
    : obtenerTextoConReglas(clave, { minutosAntesPagoSalon: String(minutosAntesPagoSalon) }, contexto, config);
}

/**
 * Aviso de la cita con anticipo en el salón y aún sin pagar: plazoAnticipoEnSalon más 'También
 * puedes pagarlo en línea.', con los minutos de la regla de la cita.
 */
export function avisoAnticipoEnSalon(
  venceEn: string | null,
  ahora: Date = new Date(),
  minutosAntesPagoSalon?: number,
  config?: ConfiguracionPublica,
): string {
  const plazo = plazoAnticipoEnSalon(venceEn, ahora, minutosAntesPagoSalon, config);
  return `${plazo} ${obtenerTexto('citas.anticipoSalon.tambienEnLinea', {}, config)}`;
}
