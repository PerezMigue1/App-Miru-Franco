import { ApiError, apiGet, apiPost } from '@/shared/api/apiClient';
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

/** La cita trae especialista { id, nombre, rol } y servicio { id, nombre, duracionMinutos, precio } anidados. */
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
  };
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
 * 400 de crearCita porque la especialista ya tiene una cita en ese horario. El backend no manda
 * code: responde "El especialista ya tiene una cita en ese horario (cita #N)".
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
