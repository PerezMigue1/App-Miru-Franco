/// <reference types="jest" />

import type { Cita, EstadoAnticipo, PagoCita, Slot } from '@/features/citas/models/citaModel';
import { reglasDeCita } from '@/features/citas/models/formaPagoModel';

import { RUTAS_DE_FONDO, USUARIO } from './datosClienta';
import {
  CATALOGO_CRUDO,
  ESPECIALISTA_DOS,
  ESPECIALISTA_UNO,
  imagenServicio,
  rutasServicios,
  type PersonaFicticia,
  type ServicioCrudo,
} from './serviciosFicticios';
import { llamadasA, respuesta, servidorConRutas, type Llamada, type Manejador } from './servidorSimulado';
import type { UsuarioSembrado } from './sesionGuardada';

/**
 * Datos ficticios de GP-06.2 (reservar cita con anticipo) con la forma real del backend
 * (src/citas/citas.service.ts y src/citas/anticipos/): especialistas de la agenda, disponibilidad
 * con sus slots, la cita creada con sus relaciones y pagos, el estado del anticipo, la preferencia
 * de Mercado Pago, los errores y las rutas para servidorConRutas. Los reutilizan las pruebas del
 * modelo, de los viewmodels (renderHook) y de integración (renderRouter).
 *
 * Fechas: el servidor manda instantes ISO en UTC y México está en UTC-6 todo el año. Para datos del
 * servidor se usa isoMexico; para lo que depende de la hora del teléfono (horaLegible,
 * limiteAnticipo) se usa enHoraLocal, que arma el Date con componentes locales y así no depende de
 * la zona con la que corre Jest.
 */

// ── Reloj y fechas ───────────────────────────────────────────────────────────────────────────

export const MINUTO_MS = 60_000;
export const HORA_MS = 60 * MINUTO_MS;

/** Lunes 19 de octubre de 2026, 10:00 en México (16:00 UTC): el mismo día local en UTC y en México. */
export const AHORA_ISO = '2026-10-19T16:00:00.000Z';
/** Instante fijo de las pruebas (no se modifica: cada prueba arma sus fechas a partir de él). */
export const AHORA = new Date(AHORA_ISO);

/** Hoy (lunes) en 'YYYY-MM-DD'. */
export const HOY = '2026-10-19';
/** Martes, día de la cita ficticia. */
export const DIA_CITA = '2026-10-20';
/** Sábado: el salón cierra a las 19:00. */
export const DIA_SABADO = '2026-10-24';
/** Domingo: el salón no abre. */
export const DIA_DOMINGO = '2026-10-25';

/**
 * Registra el beforeEach que fija el reloj en `ahora` con temporizadores falsos y el afterEach que
 * vuelve a los reales.
 */
export function usarRelojFijo(ahora: Date = AHORA): void {
  beforeEach(() => {
    jest.useFakeTimers({ now: ahora });
  });
  afterEach(() => {
    jest.useRealTimers();
  });
}

function partesDia(fecha: string): [number, number, number] {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return [anio, mes, dia];
}

function partesHora(hora: string): [number, number] {
  const [horas, minutos] = hora.split(':').map(Number);
  return [horas, minutos];
}

/** Horas que México va detrás de UTC (sin horario de verano desde 2022). */
export const DESFASE_MEXICO_HORAS = 6;

/** Instante ISO en UTC de una hora de México: isoMexico('2026-10-20', '11:00') da '2026-10-20T17:00:00.000Z'. */
export function isoMexico(fecha: string, hora: string): string {
  const [anio, mes, dia] = partesDia(fecha);
  const [horas, minutos] = partesHora(hora);
  return new Date(Date.UTC(anio, mes - 1, dia, horas + DESFASE_MEXICO_HORAS, minutos)).toISOString();
}

/** Date con año, mes, día y hora locales del teléfono (para esperar textos sin depender de la zona). */
export function enHoraLocal(fecha: string, hora = '00:00'): Date {
  const [anio, mes, dia] = partesDia(fecha);
  const [horas, minutos] = partesHora(hora);
  return new Date(anio, mes - 1, dia, horas, minutos);
}

/** El instante `minutos` después (o antes, si es negativo). */
export function masMinutos(fecha: Date | string, minutos: number): Date {
  return new Date(new Date(fecha).getTime() + minutos * MINUTO_MS);
}

/** Día de la semana de un 'YYYY-MM-DD' de calendario (0 = domingo), sin depender de la zona. */
export function diaDeLaSemana(fecha: string): number {
  const [anio, mes, dia] = partesDia(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

// ── Horario del salón y disponibilidad ───────────────────────────────────────────────────────

/** Horario del salón en hora de México por día de la semana (0 = domingo, cerrado). */
export const HORARIO_SALON: Readonly<Record<number, { abre: string; cierra: string } | null>> = {
  0: null,
  1: { abre: '09:30', cierra: '19:30' },
  2: { abre: '09:30', cierra: '19:30' },
  3: { abre: '09:30', cierra: '19:30' },
  4: { abre: '09:30', cierra: '19:30' },
  5: { abre: '09:30', cierra: '19:30' },
  6: { abre: '09:30', cierra: '19:00' },
};

/** Los slots salen cada 30 minutos. */
export const INTERVALO_SLOTS_MINUTOS = 30;

/** Motivo del backend para un día sin horario. */
export const MOTIVO_SALON_CERRADO = 'El salón no abre ese día';

/** Duración del alaciado (servicio con anticipo) en minutos. */
const SERVICIO_CON_ANTICIPO_DURACION = 150;

/** Slot crudo: { inicio, fin, horaLocal } con inicio y fin en ISO UTC (igual que Slot del modelo). */
export type SlotCrudo = Slot;

/** horaLocal como la arma el servidor (toLocaleTimeString es-MX, 2 dígitos): '09:30 a.m.', '05:30 p.m.'. */
export function horaLocalServidor(iso: string): string {
  const fecha = new Date(new Date(iso).getTime() - DESFASE_MEXICO_HORAS * HORA_MS);
  const horas = fecha.getUTCHours();
  const hora12 = horas % 12 === 0 ? 12 : horas % 12;
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(hora12)}:${dos(fecha.getUTCMinutes())} ${horas < 12 ? 'a.m.' : 'p.m.'}`;
}

/** Slot crudo que empieza a esa hora de México y dura `duracionMinutos`. */
export function slotCrudo(fecha: string, hora: string, duracionMinutos = SERVICIO_CON_ANTICIPO_DURACION): SlotCrudo {
  const inicio = isoMexico(fecha, hora);
  return {
    inicio,
    fin: masMinutos(inicio, duracionMinutos).toISOString(),
    horaLocal: horaLocalServidor(inicio),
  };
}

/** Respuesta cruda de GET /api/citas/disponibilidad (sin envoltura { data }). */
export interface DisponibilidadCruda {
  success: boolean;
  fecha: string;
  especialistaId: string;
  servicioId: number;
  duracionMinutos: number;
  abierto: boolean;
  motivo: string | null;
  slots: SlotCrudo[];
}

/** Horas de los slots de DISPONIBILIDAD_CRUDA (martes, alaciado de 150 min, con huecos ocupados). */
export const HORAS_DISPONIBLES = ['09:30', '10:00', '11:00', '12:30', '17:00'];

/**
 * Disponibilidad abierta: martes DIA_CITA, ESPECIALISTA_UNO, alaciado (servicio 2, 150 min) y los
 * slots de HORAS_DISPONIBLES, con los cambios indicados.
 */
export function disponibilidadCruda(cambios: Partial<DisponibilidadCruda> = {}): DisponibilidadCruda {
  const fecha = cambios.fecha ?? DIA_CITA;
  const duracionMinutos = cambios.duracionMinutos ?? SERVICIO_CON_ANTICIPO_DURACION;
  return {
    success: true,
    fecha,
    especialistaId: ESPECIALISTA_UNO.usuarioId,
    servicioId: 2,
    duracionMinutos,
    abierto: true,
    motivo: null,
    slots: HORAS_DISPONIBLES.map((hora) => slotCrudo(fecha, hora, duracionMinutos)),
    ...cambios,
  };
}

/** Día cerrado: { abierto: false, motivo: 'El salón no abre ese día', slots: [] } (por omisión, domingo). */
export function disponibilidadCerrada(cambios: Partial<DisponibilidadCruda> = {}): DisponibilidadCruda {
  return disponibilidadCruda({ fecha: DIA_DOMINGO, abierto: false, motivo: MOTIVO_SALON_CERRADO, slots: [], ...cambios });
}

/** Intervalo ocupado de la agenda (ISO UTC). */
export interface Ocupado {
  inicio: string;
  fin: string;
}

/**
 * Disponibilidad calculada como el servidor: slots cada 30 minutos dentro del horario del salón que
 * caben completos, sin los que empiezan en `ahora` o antes y sin los que se cruzan con `ocupadas`.
 * El domingo responde como día cerrado.
 */
export function disponibilidadComoServidor(opciones: {
  fecha: string;
  duracionMinutos?: number;
  ahora?: Date;
  ocupadas?: Ocupado[];
  especialistaId?: string;
  servicioId?: number;
}): DisponibilidadCruda {
  const { fecha, duracionMinutos = SERVICIO_CON_ANTICIPO_DURACION, ahora = AHORA, ocupadas = [] } = opciones;
  const base = {
    fecha,
    duracionMinutos,
    especialistaId: opciones.especialistaId ?? ESPECIALISTA_UNO.usuarioId,
    servicioId: opciones.servicioId ?? 2,
  };
  const horario = HORARIO_SALON[diaDeLaSemana(fecha)];
  if (!horario) {
    return disponibilidadCerrada(base);
  }
  const fin = new Date(isoMexico(fecha, horario.cierra)).getTime();
  const slots: SlotCrudo[] = [];
  for (
    let inicio = new Date(isoMexico(fecha, horario.abre)).getTime();
    inicio + duracionMinutos * MINUTO_MS <= fin;
    inicio += INTERVALO_SLOTS_MINUTOS * MINUTO_MS
  ) {
    const finSlot = inicio + duracionMinutos * MINUTO_MS;
    const seCruza = ocupadas.some(
      (o) => inicio < new Date(o.fin).getTime() && finSlot > new Date(o.inicio).getTime(),
    );
    if (inicio > ahora.getTime() && !seCruza) {
      const iso = new Date(inicio).toISOString();
      slots.push({ inicio: iso, fin: new Date(finSlot).toISOString(), horaLocal: horaLocalServidor(iso) });
    }
  }
  return disponibilidadCruda({ ...base, slots });
}

// ── Especialistas de la agenda ───────────────────────────────────────────────────────────────

/** Especialista cruda de GET /api/citas/especialistas (perfil de empleado con su usuario). */
export interface EspecialistaAgendaCruda {
  id: string;
  nombre: string;
  foto: string | null;
  puesto: string | null;
  especialidades: string[];
}

/** Especialista cruda de la agenda para una persona ficticia, con los cambios indicados. */
export function especialistaAgendaCruda(
  persona: PersonaFicticia,
  cambios: Partial<EspecialistaAgendaCruda> = {},
): EspecialistaAgendaCruda {
  return { id: persona.usuarioId, nombre: persona.nombre, foto: null, puesto: null, especialidades: [], ...cambios };
}

/** Foto https ficticia de ESPECIALISTA_UNO. */
export const FOTO_ESPECIALISTA = imagenServicio('especialista-uno');

/** Las dos especialistas de la agenda: la primera con foto, puesto y especialidades; la segunda sin nada. */
export const ESPECIALISTAS_AGENDA: EspecialistaAgendaCruda[] = [
  especialistaAgendaCruda(ESPECIALISTA_UNO, {
    foto: FOTO_ESPECIALISTA,
    puesto: 'Estilista',
    especialidades: ['Corte', 'Color'],
  }),
  especialistaAgendaCruda(ESPECIALISTA_DOS),
];

/** Cuerpo de GET /api/citas/especialistas: { success, count, data }. */
export function cuerpoEspecialistas(lista: unknown[] = ESPECIALISTAS_AGENDA): unknown {
  return { success: true, count: lista.length, data: lista };
}

// ── Clienta y servicios de la cita ───────────────────────────────────────────────────────────

/** La clienta de datosClienta con el id como texto, como lo guarda la sesión (clienteId de la cita). */
export const CLIENTA_CITAS: UsuarioSembrado = {
  id: String(USUARIO.id),
  nombre: USUARIO.nombre,
  email: USUARIO.email,
  rol: USUARIO.rol,
};

/** Alaciado keratínico (id 2): 150 min, $1,200 y anticipo de $360 que sí aplica. */
export const SERVICIO_CON_ANTICIPO: ServicioCrudo = CATALOGO_CRUDO[1];
/** Corte de dama (id 1): 45 min, $350 y sin anticipo (anticipoAplica false). */
export const SERVICIO_SIN_ANTICIPO: ServicioCrudo = CATALOGO_CRUDO[0];

// ── Cita cruda ───────────────────────────────────────────────────────────────────────────────

/** Id de la cita ficticia. */
export const ID_CITA = 501;

/** Martes 20 de octubre de 2026, 11:00 en México. */
export const INICIO_CITA_ISO = '2026-10-20T17:00:00.000Z';
/** Fin del alaciado (150 min). */
export const FIN_CITA_CON_ANTICIPO_ISO = '2026-10-20T19:30:00.000Z';
/** Fin del corte (45 min). */
export const FIN_CITA_SIN_ANTICIPO_ISO = '2026-10-20T17:45:00.000Z';
/** AHORA más 2 horas: plazo del anticipo de la cita ficticia (12:00 en México). */
export const VENCE_ANTICIPO_ISO = '2026-10-19T18:00:00.000Z';
/** Cuándo se pagó el anticipo en las citas pagadas. */
export const PAGADO_EN_ISO = '2026-10-19T16:20:00.000Z';

/** Plazo para pagar el anticipo en línea. */
export const PLAZO_ANTICIPO_HORAS = 2;
/** Con pago en el salón, el anticipo vence estos minutos antes del inicio. */
export const MINUTOS_PAGO_EN_SALON = 15;

/**
 * Plazo del anticipo como lo calcula el backend: en línea, el menor entre ahora más 2 horas y el
 * inicio menos 15 minutos; en el salón, el inicio menos 15 minutos.
 */
export function venceAnticipo(inicio: string, ahora: Date = AHORA, enSalon = false): string {
  const limiteSalon = masMinutos(inicio, -MINUTOS_PAGO_EN_SALON).getTime();
  if (enSalon) {
    return new Date(limiteSalon).toISOString();
  }
  return new Date(Math.min(ahora.getTime() + PLAZO_ANTICIPO_HORAS * HORA_MS, limiteSalon)).toISOString();
}

/** Pago crudo anidado en la cita (select de pagos de incluirRelaciones). */
export interface PagoCrudo {
  id: number;
  estado: string;
  monto: string;
  metodo: string;
  proveedor: string | null;
  pagadoEn: string | null;
  retenidoEn: string | null;
}

/** Pago de Mercado Pago pendiente por $360, con los cambios indicados. */
export function pagoCrudo(cambios: Partial<PagoCrudo> = {}): PagoCrudo {
  return {
    id: 801,
    estado: 'pendiente',
    monto: '360.00',
    metodo: 'mercadopago',
    proveedor: 'mercadopago',
    pagadoEn: null,
    retenidoEn: null,
    ...cambios,
  };
}

/** Cita cruda de POST /api/citas o GET /api/citas/:id con sus relaciones (incluirRelaciones). */
export interface CitaCruda {
  id: number;
  clienteId: string;
  especialistaId: string;
  servicioId: number;
  fechaHoraInicio: string;
  fechaHoraFin: string;
  estado: string;
  notas: string | null;
  motivoCancelacion: string | null;
  origen: string;
  anticipoRequerido: string | null;
  anticipoVenceEn: string | null;
  anticipoPagadoEn: string | null;
  anticipoEnSalon: boolean;
  creadoEn: string;
  actualizadoEn: string;
  cliente: { id: string; nombre: string; email: string; telefono: string | null };
  especialista: { id: string; nombre: string; rol: string };
  servicio: { id: number; nombre: string; duracionMinutos: number; precio: string };
  pagos: PagoCrudo[];
  /** Reglas guardadas al crear la cita (GP-07.4); las citas anteriores no las traen. */
  reglas?: unknown;
}

function especialistaDeCita(persona: PersonaFicticia): CitaCruda['especialista'] {
  return { id: persona.usuarioId, nombre: persona.nombre, rol: 'estilista' };
}

function servicioDeCita(servicio: ServicioCrudo): CitaCruda['servicio'] {
  return { id: servicio.id, nombre: servicio.nombre, duracionMinutos: servicio.duracionMinutos, precio: servicio.precio };
}

/** Cita cruda sin anticipo: corte de dama con ESPECIALISTA_UNO el martes a las 11:00, pendiente. */
export function citaCruda(cambios: Partial<CitaCruda> = {}): CitaCruda {
  return {
    id: ID_CITA,
    clienteId: CLIENTA_CITAS.id,
    especialistaId: ESPECIALISTA_UNO.usuarioId,
    servicioId: SERVICIO_SIN_ANTICIPO.id,
    fechaHoraInicio: INICIO_CITA_ISO,
    fechaHoraFin: FIN_CITA_SIN_ANTICIPO_ISO,
    estado: 'pendiente',
    notas: null,
    motivoCancelacion: null,
    origen: 'en_linea',
    anticipoRequerido: null,
    anticipoVenceEn: null,
    anticipoPagadoEn: null,
    anticipoEnSalon: false,
    creadoEn: AHORA_ISO,
    actualizadoEn: AHORA_ISO,
    cliente: { id: CLIENTA_CITAS.id, nombre: CLIENTA_CITAS.nombre, email: CLIENTA_CITAS.email, telefono: null },
    especialista: especialistaDeCita(ESPECIALISTA_UNO),
    servicio: servicioDeCita(SERVICIO_SIN_ANTICIPO),
    pagos: [],
    ...cambios,
  };
}

/** Cita cruda con anticipo en línea sin pagar: alaciado, $360 y plazo VENCE_ANTICIPO_ISO. */
export function citaConAnticipo(cambios: Partial<CitaCruda> = {}): CitaCruda {
  return citaCruda({
    servicioId: SERVICIO_CON_ANTICIPO.id,
    servicio: servicioDeCita(SERVICIO_CON_ANTICIPO),
    fechaHoraFin: FIN_CITA_CON_ANTICIPO_ISO,
    anticipoRequerido: '360.00',
    anticipoVenceEn: VENCE_ANTICIPO_ISO,
    ...cambios,
  });
}

/** Cita con el anticipo ya pagado: confirmada, con anticipoPagadoEn y un pago aprobado. */
export function citaAnticipoPagado(cambios: Partial<CitaCruda> = {}): CitaCruda {
  return citaConAnticipo({
    estado: 'confirmada',
    anticipoPagadoEn: PAGADO_EN_ISO,
    pagos: [pagoCrudo({ estado: 'aprobado', pagadoEn: PAGADO_EN_ISO })],
    ...cambios,
  });
}

export const CITA_SIN_ANTICIPO: CitaCruda = citaCruda();
export const CITA_CON_ANTICIPO: CitaCruda = citaConAnticipo();

/** Cuerpo de la cita: { success: true, data }. */
export function cuerpoCita(cita: unknown = CITA_CON_ANTICIPO): unknown {
  return { success: true, data: cita };
}

/**
 * La cita que crearía el backend con el cuerpo de POST /api/citas: toma especialista, servicio,
 * horario y notas del cuerpo, y pide anticipo solo si el servicio lo aplica (en el salón si
 * pagoAnticipo es 'salon'). Lo que no reconoce se queda como en CITA_CON_ANTICIPO.
 */
export function citaDesdeCuerpo(cuerpo: unknown, ahora: Date = new Date()): CitaCruda {
  const datos = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>;
  const servicio = CATALOGO_CRUDO.find((s) => s.id === datos.servicioId) ?? SERVICIO_CON_ANTICIPO;
  const persona =
    [ESPECIALISTA_UNO, ESPECIALISTA_DOS].find((p) => p.usuarioId === datos.especialistaId) ?? ESPECIALISTA_UNO;
  const inicio = typeof datos.fechaHoraInicio === 'string' ? datos.fechaHoraInicio : INICIO_CITA_ISO;
  const fin =
    typeof datos.fechaHoraFin === 'string'
      ? datos.fechaHoraFin
      : masMinutos(inicio, servicio.duracionMinutos).toISOString();
  const conAnticipo = servicio.anticipoAplica && servicio.anticipoMonto !== null;
  const enSalon = conAnticipo && datos.pagoAnticipo === 'salon';
  return citaCruda({
    especialistaId: persona.usuarioId,
    especialista: especialistaDeCita(persona),
    servicioId: servicio.id,
    servicio: servicioDeCita(servicio),
    fechaHoraInicio: inicio,
    fechaHoraFin: fin,
    notas: typeof datos.notas === 'string' ? datos.notas : null,
    anticipoRequerido: conAnticipo ? servicio.anticipoMonto : null,
    anticipoVenceEn: conAnticipo ? venceAnticipo(inicio, ahora, enSalon) : null,
    anticipoEnSalon: enSalon,
  });
}

// ── Cita normalizada ─────────────────────────────────────────────────────────────────────────

/** CITA_SIN_ANTICIPO tal como la entrega el modelo (escrita a mano). */
export const CITA_SIN_ANTICIPO_NORMALIZADA: Cita = {
  id: ID_CITA,
  servicioId: 1,
  servicioNombre: 'Corte de dama',
  especialistaId: ESPECIALISTA_UNO.usuarioId,
  especialistaNombre: ESPECIALISTA_UNO.nombre,
  fechaHoraInicio: INICIO_CITA_ISO,
  fechaHoraFin: FIN_CITA_SIN_ANTICIPO_ISO,
  estado: 'pendiente',
  anticipoRequerido: 0,
  anticipoMonto: null,
  anticipoVenceEn: null,
  anticipoPagadoEn: null,
  anticipoEnSalon: false,
  notas: '',
  motivoCancelacion: null,
  servicioDuracionMinutos: 45,
  servicioPrecio: '$350',
  pagos: [],
  // Las citas ficticias no traen `reglas`: quedan las de omisión.
  reglas: reglasDeCita(null),
  reglasGuardadas: false,
};

/** CITA_CON_ANTICIPO tal como la entrega el modelo (escrita a mano). */
export const CITA_CON_ANTICIPO_NORMALIZADA: Cita = {
  ...CITA_SIN_ANTICIPO_NORMALIZADA,
  servicioId: 2,
  servicioNombre: 'Alaciado keratínico',
  fechaHoraFin: FIN_CITA_CON_ANTICIPO_ISO,
  anticipoRequerido: 360,
  anticipoMonto: '$360',
  anticipoVenceEn: VENCE_ANTICIPO_ISO,
  servicioDuracionMinutos: 150,
  servicioPrecio: '$1,200',
};

/** Cita ya normalizada (por omisión, la de anticipo sin pagar) con los cambios indicados. */
export function citaNormalizada(cambios: Partial<Cita> = {}): Cita {
  return { ...CITA_CON_ANTICIPO_NORMALIZADA, ...cambios };
}

// ── Anticipo: estado y preferencia ───────────────────────────────────────────────────────────

/** Estados que devuelve GET /api/pagos-en-linea/citas/:id/estado. */
export type EstadoAnticipoBackend =
  | 'no_requiere'
  | 'aprobado'
  | 'revision'
  | 'reembolsado'
  | 'cancelada'
  | 'rechazado'
  | 'pendiente'
  | 'vencido'
  | 'sin_pago';

/**
 * Cómo agrupa la app cada estado del backend: aprobado y no_requiere ya no piden pago; pendiente
 * (Mercado Pago en proceso) y revision esperan confirmación; los demás se tratan como sin pago.
 */
export const ESTADO_APP_DEL_BACKEND: Readonly<Record<EstadoAnticipoBackend, EstadoAnticipo>> = {
  aprobado: 'aprobado',
  no_requiere: 'aprobado',
  pendiente: 'pendiente',
  revision: 'pendiente',
  rechazado: 'sin_pago',
  cancelada: 'sin_pago',
  vencido: 'sin_pago',
  reembolsado: 'sin_pago',
  sin_pago: 'sin_pago',
};

/** Todos los estados del backend, en el orden de ESTADO_APP_DEL_BACKEND. */
export const ESTADOS_ANTICIPO_BACKEND = Object.keys(ESTADO_APP_DEL_BACKEND) as EstadoAnticipoBackend[];

/** Respuesta cruda del estado del anticipo (sin envoltura). anticipoRequerido llega como número. */
export interface EstadoAnticipoCrudo {
  estado: string;
  citaEstado: string;
  anticipoRequerido: number | null;
  anticipoVenceEn: string | null;
  anticipoPagadoEn: string | null;
  anticipoEnSalon: boolean;
  cancelacion: unknown;
}

/**
 * Estado del anticipo coherente con la cita: aprobado trae la cita confirmada y pagada,
 * no_requiere no trae monto ni plazo y cancelada trae la cita cancelada.
 */
export function estadoAnticipoCrudo(
  estado: EstadoAnticipoBackend | string,
  cambios: Partial<EstadoAnticipoCrudo> = {},
): EstadoAnticipoCrudo {
  const pagado = estado === 'aprobado';
  const sinAnticipo = estado === 'no_requiere';
  let citaEstado = 'pendiente';
  if (pagado) {
    citaEstado = 'confirmada';
  } else if (estado === 'cancelada') {
    citaEstado = 'cancelada';
  }
  return {
    estado,
    citaEstado,
    anticipoRequerido: sinAnticipo ? null : 360,
    anticipoVenceEn: sinAnticipo ? null : VENCE_ANTICIPO_ISO,
    anticipoPagadoEn: pagado ? PAGADO_EN_ISO : null,
    anticipoEnSalon: false,
    cancelacion: null,
    ...cambios,
  };
}

/** initPoint https ficticio de Mercado Pago para la cita. */
export function initPointFicticio(citaId: string | number = ID_CITA): string {
  return `https://pago.test/checkout/cita-${citaId}`;
}

/** Cuerpo de POST /api/pagos-en-linea/citas/:id/preferencia: { initPoint } sin envoltura. */
export function preferenciaCruda(citaId: string | number = ID_CITA): { initPoint: string } {
  return { initPoint: initPointFicticio(citaId) };
}

/** Deep link con el que Mercado Pago regresa a la app (escrito a mano para compararlo). */
export function deepLinkAnticipo(citaId: string | number = ID_CITA): string {
  return `appmirufranco://anticipo/${citaId}?retorno=mp`;
}

// ── Errores del backend ──────────────────────────────────────────────────────────────────────

/** Cuerpo de error como lo arma NestJS. */
export interface CuerpoError {
  statusCode: number;
  message: string | string[];
  error?: string;
  code?: string;
}

const NOMBRES_HTTP: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};

/** Cuerpo de error con el nombre HTTP del status. */
export function cuerpoError(statusCode: number, message: string | string[], code?: string): CuerpoError {
  return {
    statusCode,
    message,
    ...(NOMBRES_HTTP[statusCode] ? { error: NOMBRES_HTTP[statusCode] } : {}),
    ...(code ? { code } : {}),
  };
}

/** Respuesta del servidor simulado con ese cuerpo de error y su status. */
export function respuestaError(cuerpo: CuerpoError): Response {
  return respuesta(cuerpo, cuerpo.statusCode);
}

/** Campo `error` en español que pone el filtro global del backend (ERROR_POR_ESTADO). */
const ERROR_DEL_FILTRO: Record<number, string> = {
  400: 'Solicitud inválida',
  401: 'No autenticado',
  409: 'Conflicto',
  503: 'Servicio no disponible',
};

/** Ruta de crear la cita como la escribe el filtro del backend en `path`. */
const PATH_CREAR_CITA = '/api/citas?propios=true';

/** Cuerpo de error completo del filtro global del backend (http-exception.filter.ts). */
export interface CuerpoErrorFiltro extends CuerpoError {
  success: false;
  timestamp: string;
  path: string;
}

/**
 * Cuerpo de error tal como lo arma el filtro global del backend:
 * { success: false, statusCode, timestamp, path, error, message[, code] }, con `error` en español.
 */
export function cuerpoErrorFiltro(
  statusCode: number,
  message: string | string[],
  path: string = PATH_CREAR_CITA,
  code?: string,
): CuerpoErrorFiltro {
  return {
    success: false,
    statusCode,
    timestamp: AHORA_ISO,
    path,
    ...(ERROR_DEL_FILTRO[statusCode] ? { error: ERROR_DEL_FILTRO[statusCode] } : {}),
    message,
    ...(code ? { code } : {}),
  };
}

/** Mensajes reales del backend de citas y anticipos. */
export const MENSAJES_BACKEND = {
  horarioOcupado: 'El especialista ya tiene una cita en ese horario (cita #77)',
  horarioPasado: 'Elige un horario que todavía no haya pasado',
  salonCerrado: MOTIVO_SALON_CERRADO,
  sinTiempoAnticipo: 'Ya no da tiempo de pagar el anticipo antes de tu cita.',
  sinTiempoSalon: 'Ya no da tiempo de pagar en el salón. Paga el anticipo en línea.',
  unaPorPagarEnSalon: 'Ya tienes una cita por pagar en el salón. Paga su anticipo o elige pagar en línea.',
  soloEnLinea: 'Para esta cita, el anticipo se paga en línea.',
  /** El salón apagó la regla permitirAnticipoEnSalon: el anticipo solo se paga en línea. */
  anticipoSalonNoPermitido: 'El anticipo se paga en línea.',
  /** 503 genérico del filtro del backend (base caída o pool de conexiones agotado). */
  servicioNoDisponible: 'El servicio no está disponible en este momento. Intenta de nuevo en unos segundos.',
  /** Render sin ANTICIPOS_DESDE o Mercado Pago sin configurar: solo queda pagar en el salón. */
  anticipoEnLineaNoDisponible: 'El pago del anticipo en línea no está disponible por ahora. Elige pagarlo en el salón.',
  noPideAnticipo: 'Esta cita no pide anticipo',
  anticipoPagado: 'El anticipo de esta cita ya está pagado',
  citaNoVigente: 'Esta cita ya no está vigente',
  plazoTerminado: 'El plazo para pagar el anticipo terminó: vuelve a agendar tu cita',
  citaNoEncontrada: 'Cita no encontrada',
  validacion: ['fechaHoraInicio must be a valid ISO 8601 date string'],
  interno: 'Internal server error',
  noAutorizado: 'Unauthorized',
  sesionVencida: 'Tu sesión venció. Inicia sesión de nuevo.',
} as const;

/** Cuerpos de error del backend para reservar y pagar el anticipo. */
export const ERRORES = {
  /** 400 de POST /api/citas: la especialista ya tiene cita (no es 409). Obliga a recargar la disponibilidad. */
  horarioOcupado: cuerpoError(400, MENSAJES_BACKEND.horarioOcupado),
  horarioPasado: cuerpoError(400, MENSAJES_BACKEND.horarioPasado),
  salonCerrado: cuerpoError(400, MENSAJES_BACKEND.salonCerrado),
  /** 400 de POST /api/citas por el anticipo (texto ya escrito para la clienta). */
  sinTiempoAnticipo: cuerpoError(400, MENSAJES_BACKEND.sinTiempoAnticipo),
  sinTiempoSalon: cuerpoError(400, MENSAJES_BACKEND.sinTiempoSalon),
  unaPorPagarEnSalon: cuerpoError(400, MENSAJES_BACKEND.unaPorPagarEnSalon),
  soloEnLinea: cuerpoError(400, MENSAJES_BACKEND.soloEnLinea),
  anticipoEnLineaNoDisponible: cuerpoError(400, MENSAJES_BACKEND.anticipoEnLineaNoDisponible),
  /** 400 de POST /api/citas con pagoAnticipo 'salon' y la regla permitirAnticipoEnSalon apagada. */
  anticipoSalonNoPermitido: cuerpoErrorFiltro(400, MENSAJES_BACKEND.anticipoSalonNoPermitido),
  /** 503 genérico del filtro (no es propio del anticipo). */
  servicioNoDisponible: cuerpoErrorFiltro(503, MENSAJES_BACKEND.servicioNoDisponible),
  /** 400 de la preferencia: la cita no pide anticipo. */
  noPideAnticipo: cuerpoError(400, MENSAJES_BACKEND.noPideAnticipo),
  /** 409 de la preferencia. */
  anticipoPagado: cuerpoError(409, MENSAJES_BACKEND.anticipoPagado),
  citaNoVigente: cuerpoError(409, MENSAJES_BACKEND.citaNoVigente),
  plazoTerminado: cuerpoError(409, MENSAJES_BACKEND.plazoTerminado),
  citaNoEncontrada: cuerpoError(404, MENSAJES_BACKEND.citaNoEncontrada),
  /** 422 con mensajes de validación en arreglo. */
  validacion: cuerpoError(422, [...MENSAJES_BACKEND.validacion]),
  interno: cuerpoError(500, MENSAJES_BACKEND.interno),
  /** 401 de una petición con el acceso rechazado. */
  noAutorizado: cuerpoError(401, MENSAJES_BACKEND.noAutorizado),
  /** 401 de POST /api/auth/movil/renovar: la sesión venció y se cierra. */
  sesionVencida: cuerpoError(401, MENSAJES_BACKEND.sesionVencida, 'SESION_VENCIDA'),
} satisfies Record<string, CuerpoError>;

/**
 * 400 de POST /api/citas cuando la regla maxCitasPorPagarEnSalon vale `n` distinto de 1 y la clienta
 * ya tiene esas citas por pagar en el salón (con n = 1 el backend manda MENSAJES_BACKEND.unaPorPagarEnSalon).
 */
export function mensajeVariasPorPagarEnSalon(n: number): string {
  return `Ya tienes ${n} citas por pagar en el salón. Paga su anticipo o elige pagar en línea.`;
}

/** Cuerpo del 400 de mensajeVariasPorPagarEnSalon(n), como lo arma el filtro del backend. */
export function errorVariasPorPagarEnSalon(n: number): CuerpoErrorFiltro {
  return cuerpoErrorFiltro(400, mensajeVariasPorPagarEnSalon(n));
}

/** El error con el que se rechaza la promesa (falla si se cumple), para revisarlo con instanceof. */
export async function errorDe(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba que la promesa fallara.');
}

/** Sin red: fetch rechaza como en el teléfono. */
export function simularSinRed(): void {
  globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
}

// ── Rutas ────────────────────────────────────────────────────────────────────────────────────

export const RUTA_ESPECIALISTAS = 'GET /api/citas/especialistas';
export const RUTA_CREAR_CITA = 'POST /api/citas?propios=true';
export const RUTA_RENOVAR_MOVIL = 'POST /api/auth/movil/renovar';

/** "GET /api/citas/disponibilidad?especialistaId=&fecha=&servicioId=" con cada valor codificado. */
export function rutaDisponibilidad(especialistaId: string | number, fecha: string, servicioId: string | number): string {
  return (
    'GET /api/citas/disponibilidad' +
    `?especialistaId=${encodeURIComponent(String(especialistaId))}` +
    `&fecha=${encodeURIComponent(fecha)}` +
    `&servicioId=${encodeURIComponent(String(servicioId))}`
  );
}

/** "GET /api/citas/:id?propios=true". */
export function rutaCita(id: string | number = ID_CITA): string {
  return `GET /api/citas/${encodeURIComponent(String(id))}?propios=true`;
}

/** "POST /api/pagos-en-linea/citas/:id/preferencia?origen=app". */
export function rutaPreferencia(id: string | number = ID_CITA): string {
  return `POST /api/pagos-en-linea/citas/${encodeURIComponent(String(id))}/preferencia?origen=app`;
}

/** "GET /api/pagos-en-linea/citas/:id/estado". */
export function rutaEstadoAnticipo(id: string | number = ID_CITA): string {
  return `GET /api/pagos-en-linea/citas/${encodeURIComponent(String(id))}/estado`;
}

/** Llamadas que recibió el servidor simulado en una ruta "MÉTODO /ruta". */
export function llamadasDeRuta(llamadas: Llamada[], ruta: string): Llamada[] {
  const espacio = ruta.indexOf(' ');
  return llamadasA(llamadas, ruta.slice(0, espacio), ruta.slice(espacio + 1));
}

/** Manejador que responde una vez con ese cuerpo de error. */
export function conError(cuerpo: CuerpoError): Manejador {
  return () => respuestaError(cuerpo);
}

/**
 * Rutas de la reserva para servidorConRutas: especialistas de la agenda, la disponibilidad de cada
 * elemento de `disponibilidades` en su propia ruta (por omisión, el martes abierto y el domingo
 * cerrado de las dos especialistas para el alaciado), la creación de la cita (citaDesdeCuerpo con lo
 * que mande la app), la cita por id, la preferencia y el estado del anticipo (`estado`, por omisión
 * 'sin_pago').
 */
export function rutasReserva(
  opciones: {
    disponibilidades?: DisponibilidadCruda[];
    cita?: CitaCruda;
    estado?: EstadoAnticipoBackend;
  } = {},
): Record<string, Manejador> {
  const cita = opciones.cita ?? CITA_CON_ANTICIPO;
  const disponibilidades = opciones.disponibilidades ?? [
    disponibilidadCruda(),
    disponibilidadCerrada(),
    disponibilidadCruda({ especialistaId: ESPECIALISTA_DOS.usuarioId }),
    disponibilidadCerrada({ especialistaId: ESPECIALISTA_DOS.usuarioId }),
  ];
  const rutas: Record<string, Manejador> = {
    [RUTA_ESPECIALISTAS]: () => respuesta(cuerpoEspecialistas()),
    [RUTA_CREAR_CITA]: (cuerpo) => respuesta(cuerpoCita({ ...citaDesdeCuerpo(cuerpo), id: cita.id }), 201),
    [rutaCita(cita.id)]: () => respuesta(cuerpoCita(cita)),
    [rutaPreferencia(cita.id)]: () => respuesta(preferenciaCruda(cita.id), 201),
    [rutaEstadoAnticipo(cita.id)]: () => respuesta(estadoAnticipoCrudo(opciones.estado ?? 'sin_pago')),
  };
  for (const disponibilidad of disponibilidades) {
    const ruta = rutaDisponibilidad(disponibilidad.especialistaId, disponibilidad.fecha, disponibilidad.servicioId);
    rutas[ruta] = () => respuesta(disponibilidad);
  }
  return rutas;
}

/**
 * Servidor simulado con todo lo de fondo (catálogos, carrito y /me de datosClienta), el catálogo
 * de servicios y rutasReserva(). Las rutas de cada prueba van encima; lo demás responde 404.
 */
export const simularServidorReserva = servidorConRutas({
  ...RUTAS_DE_FONDO,
  ...rutasServicios(),
  ...rutasReserva(),
});

// ── Pasos para los viewmodels (renderHook) ───────────────────────────────────────────────────

/**
 * Manejador que entrega una promesa (respuesta diferida o sin red): servidorConRutas la pasa con
 * Promise.resolve, que la adopta, así que fetch espera o rechaza igual que en el teléfono.
 */
export function conPromesa(salida: () => Promise<Response>): Manejador {
  return () => salida() as unknown as Response;
}

/** Manejador sin red: fetch rechaza solo en esa ruta. */
export const sinRedEnRuta: Manejador = conPromesa(() => Promise.reject(new TypeError('Network request failed')));

/** Cada disponibilidad en su ruta de GET /api/citas/disponibilidad. */
export function rutasDisponibilidad(lista: DisponibilidadCruda[]): Record<string, Manejador> {
  return Object.fromEntries(
    lista.map((d) => [rutaDisponibilidad(d.especialistaId, d.fecha, d.servicioId), () => respuesta(d)]),
  );
}

/**
 * Disponibilidad de las dos especialistas en `fecha` para el servicio, calculada como el servidor
 * (desde AHORA). Sirve para el día con que arranca el paso Día y hora (hoy).
 */
export function disponibilidadesDe(fecha: string, servicio: ServicioCrudo): DisponibilidadCruda[] {
  return [ESPECIALISTA_UNO, ESPECIALISTA_DOS].map((persona) =>
    disponibilidadComoServidor({
      fecha,
      duracionMinutos: servicio.duracionMinutos,
      especialistaId: persona.usuarioId,
      servicioId: servicio.id,
    }),
  );
}

// ── GP-06.3: Mis citas ───────────────────────────────────────────────────────────────────────

/** Domingo 18 de octubre: el día anterior a HOY. */
export const AYER = '2026-10-18';

/** Estados de la cita en el backend (CitaEstado). */
export const ESTADOS_CITA = [
  'pendiente',
  'confirmada',
  'reprogramada',
  'en_curso',
  'completada',
  'cancelada',
  'no_asistio',
] as const;

/** Cuándo el salón retuvo el anticipo pagado (ya no se reembolsa). */
export const RETENIDO_EN_ISO = '2026-10-19T16:30:00.000Z';

/** Motivo con el que cancela la clienta. */
export const MOTIVO_CANCELACION = 'Me surgió un viaje';

export const RUTA_MIS_CITAS = 'GET /api/citas?propios=true&orden=fechaHoraInicio&limit=100';

/** "PATCH /api/citas/:id/reprogramar?propios=true". */
export function rutaReprogramar(id: string | number = ID_CITA): string {
  return `PATCH /api/citas/${encodeURIComponent(String(id))}/reprogramar?propios=true`;
}

/** "PATCH /api/citas/:id/cancelar?propios=true". */
export function rutaCancelar(id: string | number = ID_CITA): string {
  return `PATCH /api/citas/${encodeURIComponent(String(id))}/cancelar?propios=true`;
}

/** Cita cruda reprogramada al slot (estado 'reprogramada'; el anticipo se conserva). */
export function citaReprogramada(slot: Slot, cambios: Partial<CitaCruda> = {}): CitaCruda {
  return citaConAnticipo({ estado: 'reprogramada', fechaHoraInicio: slot.inicio, fechaHoraFin: slot.fin, ...cambios });
}

/** Cita cruda cancelada por la clienta con MOTIVO_CANCELACION y el anticipo sin pagar. */
export function citaCancelada(cambios: Partial<CitaCruda> = {}): CitaCruda {
  return citaConAnticipo({ estado: 'cancelada', motivoCancelacion: MOTIVO_CANCELACION, ...cambios });
}

/**
 * Citas de la clienta para la lista, a mediodía de México (el mismo día en UTC y en México): la de
 * anticipo sin pagar del martes, una pagada del sábado, una completada y una cancelada pasadas.
 */
export const MIS_CITAS_CRUDAS: CitaCruda[] = [
  CITA_CON_ANTICIPO,
  citaAnticipoPagado({
    id: 502,
    fechaHoraInicio: isoMexico(DIA_SABADO, '12:00'),
    fechaHoraFin: isoMexico(DIA_SABADO, '14:30'),
  }),
  citaCruda({
    id: 503,
    estado: 'completada',
    fechaHoraInicio: isoMexico('2026-10-10', '12:00'),
    fechaHoraFin: isoMexico('2026-10-10', '12:45'),
  }),
  citaCancelada({
    id: 504,
    fechaHoraInicio: isoMexico('2026-10-12', '12:00'),
    fechaHoraFin: isoMexico('2026-10-12', '14:30'),
  }),
];

/** Cuerpo de GET /api/citas?propios=true: { success, count, page, limit, totalPages, data }. */
export function cuerpoMisCitas(lista: unknown[] = MIS_CITAS_CRUDAS): unknown {
  return { success: true, count: lista.length, page: 1, limit: 100, totalPages: 1, data: lista };
}

/** Pago ya normalizado (PagoCita): el pendiente de $360 de pagoCrudo, con los cambios indicados. */
export function pagoNormalizado(cambios: Partial<PagoCita> = {}): PagoCita {
  return { estado: 'pendiente', monto: 360, metodo: 'mercadopago', pagadoEn: null, retenidoEn: null, ...cambios };
}

/** Cita normalizada (la de anticipo sin pagar) con ese id, que empieza en `inicio` y dura 150 min. */
export function citaNormalizadaEn(id: string | number, inicio: Date | string, cambios: Partial<Cita> = {}): Cita {
  const fechaHoraInicio = new Date(inicio).toISOString();
  return citaNormalizada({
    id,
    fechaHoraInicio,
    fechaHoraFin: masMinutos(fechaHoraInicio, SERVICIO_CON_ANTICIPO_DURACION).toISOString(),
    ...cambios,
  });
}

/** Mensajes reales del backend al reprogramar y cancelar. */
export const MENSAJES_MIS_CITAS = {
  reprogramarCompletada: "No se puede reprogramar una cita en estado 'completada'",
  cancelarCancelada: "No se puede cancelar una cita en estado 'cancelada'",
  citaCobrada: 'La cita ya se cobró; no se puede editar ni reprogramar. Cancela la venta primero.',
  motivoNoPermitido: 'El motivo contiene caracteres no permitidos',
  motivoVacio: ['motivoCancelacion should not be empty'],
  citaNoEncontrada: `Cita ${ID_CITA} no encontrada`,
} as const;

/** Cuerpos de error del backend al reprogramar y cancelar (el horario ocupado es ERRORES.horarioOcupado). */
export const ERRORES_MIS_CITAS = {
  reprogramarCompletada: cuerpoError(400, MENSAJES_MIS_CITAS.reprogramarCompletada),
  cancelarCancelada: cuerpoError(400, MENSAJES_MIS_CITAS.cancelarCancelada),
  /** 409: la cita ya se cobró en el salón. */
  citaCobrada: cuerpoError(409, MENSAJES_MIS_CITAS.citaCobrada),
  /** 400 del filtro de caracteres del backend. */
  motivoNoPermitido: cuerpoError(400, MENSAJES_MIS_CITAS.motivoNoPermitido),
  /** 400 de validación del DTO con el mensaje en arreglo. */
  motivoVacio: cuerpoError(400, [...MENSAJES_MIS_CITAS.motivoVacio]),
  /** 404 de una cita ajena o que no existe. */
  citaNoEncontrada: cuerpoError(404, MENSAJES_MIS_CITAS.citaNoEncontrada),
} satisfies Record<string, CuerpoError>;

/** Textos que la app muestra a la clienta al fallar reprogramar o cancelar (escritos a mano). */
export const TEXTOS_MIS_CITAS = {
  sinConexion: 'Sin conexión. Revisa tu internet e intenta de nuevo.',
  sesionTerminada: 'Tu sesión terminó. Inicia sesión de nuevo.',
  citaNoEncontrada: 'No encontramos esta cita.',
  horarioOcupado: 'Ese horario ya se ocupó. Elige otro.',
  citaCobrada: 'Esta cita ya se cobró en el salón y no se puede cambiar.',
  reprogramarNoSePuede: 'Esta cita ya no se puede reprogramar.',
  reprogramarGenerico: 'No pudimos cambiar tu cita. Intenta de nuevo en un momento.',
  cancelarNoSePuede: 'Esta cita ya no se puede cancelar.',
  cancelarGenerico: 'No pudimos cancelar tu cita. Intenta de nuevo en un momento.',
  motivoCaracteres: 'Tu motivo tiene caracteres que no podemos guardar. Escríbelo de otra forma.',
  motivoVacio: 'Escribe el motivo de la cancelación.',
} as const;

/**
 * Rutas de Mis citas para servidorConRutas: la lista de `citas` (por omisión MIS_CITAS_CRUDAS) y,
 * para cada una, su detalle, reprogramar (la devuelve reprogramada al horario que mande la app) y
 * cancelar (la devuelve cancelada con el motivo recibido).
 */
export function rutasMisCitas(citas: CitaCruda[] = MIS_CITAS_CRUDAS): Record<string, Manejador> {
  const rutas: Record<string, Manejador> = {
    [RUTA_MIS_CITAS]: () => respuesta(cuerpoMisCitas(citas)),
  };
  for (const cita of citas) {
    rutas[rutaCita(cita.id)] = () => respuesta(cuerpoCita(cita));
    rutas[rutaReprogramar(cita.id)] = (cuerpo) => {
      const datos = (cuerpo ?? {}) as { fechaHoraInicio?: string; fechaHoraFin?: string };
      return respuesta(
        cuerpoCita({
          ...cita,
          estado: 'reprogramada',
          fechaHoraInicio: datos.fechaHoraInicio ?? cita.fechaHoraInicio,
          fechaHoraFin: datos.fechaHoraFin ?? cita.fechaHoraFin,
        }),
      );
    };
    rutas[rutaCancelar(cita.id)] = (cuerpo) => {
      const { motivoCancelacion = null } = (cuerpo ?? {}) as { motivoCancelacion?: string | null };
      return respuesta(cuerpoCita({ ...cita, estado: 'cancelada', motivoCancelacion }));
    };
  }
  return rutas;
}

/**
 * Servidor simulado con lo de fondo, el catálogo de servicios, rutasReserva() y rutasMisCitas().
 * Las rutas de cada prueba van encima; lo demás responde 404.
 */
export const simularServidorMisCitas = servidorConRutas({
  ...RUTAS_DE_FONDO,
  ...rutasServicios(),
  ...rutasReserva(),
  ...rutasMisCitas(),
});

// ── GP-06.5: anticipo en el salón ────────────────────────────────────────────────────────────

/** Plazo de la cita ficticia (martes a las 11:00 de México) pagando en el salón: 15 minutos antes, 10:45. */
export const VENCE_EN_SALON_ISO = '2026-10-20T16:45:00.000Z';

/** motivoCancelacion con el que la barrida de anticipos cancela la cita que no se pagó a tiempo. */
export const MOTIVO_ANTICIPO_NO_PAGADO = 'anticipo_no_pagado';

/**
 * Cita cruda con anticipo de $360 a pagar en el salón y sin pagar: anticipoEnSalon true y el plazo
 * como lo calcula el backend (inicio menos 15 minutos). Si los cambios traen otro inicio, el fin
 * (150 min) y el plazo se calculan con él.
 */
export function citaEnSalon(cambios: Partial<CitaCruda> = {}): CitaCruda {
  const inicio = cambios.fechaHoraInicio ?? INICIO_CITA_ISO;
  return citaConAnticipo({
    fechaHoraInicio: inicio,
    fechaHoraFin: masMinutos(inicio, SERVICIO_CON_ANTICIPO_DURACION).toISOString(),
    anticipoEnSalon: true,
    anticipoVenceEn: venceAnticipo(inicio, AHORA, true),
    ...cambios,
  });
}

/** Pago crudo del anticipo cobrado en el salón: aprobado, en efectivo y sin proveedor. */
export function pagoEnSalon(cambios: Partial<PagoCrudo> = {}): PagoCrudo {
  return pagoCrudo({ estado: 'aprobado', metodo: 'efectivo', proveedor: null, pagadoEn: PAGADO_EN_ISO, ...cambios });
}

/** Cita en el salón ya pagada en el salón: confirmada, con anticipoPagadoEn y el pago en efectivo. */
export function citaPagadaEnSalon(cambios: Partial<CitaCruda> = {}): CitaCruda {
  return citaEnSalon({ estado: 'confirmada', anticipoPagadoEn: PAGADO_EN_ISO, pagos: [pagoEnSalon()], ...cambios });
}

/** Cita en el salón que la barrida canceló porque no se pagó el anticipo a tiempo (no toca pagos). */
export function citaCanceladaPorAnticipo(cambios: Partial<CitaCruda> = {}): CitaCruda {
  return citaEnSalon({ estado: 'cancelada', motivoCancelacion: MOTIVO_ANTICIPO_NO_PAGADO, ...cambios });
}

/** citaEnSalon() tal como la entrega el modelo, con los cambios indicados. */
export function citaEnSalonNormalizada(cambios: Partial<Cita> = {}): Cita {
  return citaNormalizada({ anticipoEnSalon: true, anticipoVenceEn: VENCE_EN_SALON_ISO, ...cambios });
}

/** Aviso de la cita en el salón cuando no hay plazo válido (escrito a mano). */
export const AVISO_EN_SALON_SIN_PLAZO =
  'Paga tu anticipo en el salón a más tardar 15 minutos antes de tu cita. También puedes pagarlo en línea.';

/** Aviso de la cita en el salón con el límite ya armado ('antes de las 10:45 a. m.'), escrito a mano. */
export function avisoEnSalonEsperado(limite: string): string {
  return `Paga tu anticipo en el salón ${limite} (15 minutos antes de tu cita). También puedes pagarlo en línea.`;
}
