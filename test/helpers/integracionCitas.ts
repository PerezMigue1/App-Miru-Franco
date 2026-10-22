/// <reference types="jest" />

import { precioParaMostrar } from '@/features/inicio/models/FluidoModel';

import {
  AHORA,
  CITA_CON_ANTICIPO,
  citaDesdeCuerpo,
  cuerpoCita,
  HORA_MS,
  ID_CITA,
  masMinutos,
  rutaCita,
  RUTA_CREAR_CITA,
  type CitaCruda,
} from './citasFicticias';
import { rutaVigente } from './documentosFicticios';
import { abrirConCitas, esperarDetalle, type Rutas } from './pantallasMisCitas';
import { diaLegible, horaEnTelefono, type PantallaReserva } from './pantallasReserva';
import {
  REGLAS_FICTICIAS,
  rutaConfiguracionReserva,
  type ConfiguracionReservaFicticia,
  type ReglasCitasFicticias,
} from './reservaFicticia';
import { respuesta, type Llamada, type Manejador } from './servidorSimulado';

/**
 * Andamiaje de las pruebas de integración de GP-07.4 (test/integration/gp-07.4) con las pantallas
 * reales: el backend simulado que guarda en la cita las reglas vigentes al crearla (como
 * instantaneaReglasCita del backend), el orden de las peticiones que importan, el detalle de una cita
 * con la configuración ficticia y los textos que dependen de la hora del teléfono. Todo es inventado.
 */

/** "MÉTODO /ruta" de la Política de anticipos vigente. */
export const RUTA_DOCUMENTO_ANTICIPOS = `GET ${rutaVigente('anticipos')}`;

/** "MÉTODO /ruta" de cada petición que está en `rutas`, en el orden en que llegaron. */
export function secuencia(llamadas: Llamada[], ...rutas: string[]): string[] {
  return llamadas.map((l) => `${l.metodo} ${l.ruta}`).filter((ruta) => rutas.includes(ruta));
}

/** Cuerpo de la única petición a "MÉTODO /ruta" (falla si llegó más de una o ninguna). */
export function cuerpoUnico(llamadas: Llamada[], ruta: string): unknown {
  const encontradas = llamadas.filter((l) => `${l.metodo} ${l.ruta}` === ruta);
  expect(encontradas).toHaveLength(1);
  return encontradas[0].cuerpo;
}

/** "$360" de un monto del API ("360.00"). */
export const monto = (valor: string | number) => precioParaMostrar(String(valor)) ?? '';

// ── Backend que guarda las reglas en la cita ─────────────────────────────────────────────────

/** Las reglas que el backend guarda en la cita al crearla, a partir de las reglas de citas vigentes. */
export function instantaneaReglas(citas: ReglasCitasFicticias = {}): Record<string, unknown> {
  const reglas = { ...REGLAS_FICTICIAS, ...citas };
  return {
    plazoAnticipoHoras: reglas.plazoAnticipoHoras,
    minutosAntesPagoSalon: reglas.minutosAntesPagoSalon,
    horasAvisoCancelarReagendar: reglas.horasAvisoCancelarReagendar,
    diasHabilesExcepcionAnticipo: reglas.diasHabilesExcepcionAnticipo,
    diasHabilesCancelarConReembolso: reglas.diasHabilesCancelarConReembolso,
    pierdeAnticipoSiNoAsiste: reglas.noAsistio.pierdeAnticipo,
    diasInhabiles: [],
  };
}

export interface OpcionesCreacion {
  /** Reglas de citas vigentes de la prueba (las mismas de su configuración). */
  citas?: ReglasCitasFicticias;
  /** false si la configuración tiene los anticipos apagados: el backend no pide anticipo. */
  anticiposActivos?: boolean;
}

/**
 * POST /api/citas?propios=true y GET /api/citas/501 con memoria, como el backend: la cita creada con
 * lo que mandó la app, las reglas vigentes guardadas y el plazo del anticipo calculado con ellas (en
 * el salón, los minutos antes del inicio; en línea, el menor entre las horas del plazo y esos
 * minutos). Con los anticipos apagados la cita no pide anticipo. Antes de crearla, GET devuelve
 * CITA_CON_ANTICIPO.
 */
export function creacionConReglas({ citas = {}, anticiposActivos = true }: OpcionesCreacion = {}): Record<string, Manejador> {
  const reglas = { ...REGLAS_FICTICIAS, ...citas };
  let guardada: CitaCruda = CITA_CON_ANTICIPO;
  const crear: Manejador = (cuerpo) => {
    const base: CitaCruda = { ...citaDesdeCuerpo(cuerpo), id: ID_CITA, reglas: instantaneaReglas(citas) };
    if (!anticiposActivos || base.anticipoRequerido === null) {
      guardada = { ...base, anticipoRequerido: null, anticipoVenceEn: null, anticipoEnSalon: false };
    } else {
      const limiteSalon = masMinutos(base.fechaHoraInicio, -reglas.minutosAntesPagoSalon).getTime();
      const vence = base.anticipoEnSalon
        ? limiteSalon
        : Math.min(new Date().getTime() + reglas.plazoAnticipoHoras * HORA_MS, limiteSalon);
      guardada = { ...base, anticipoVenceEn: new Date(vence).toISOString() };
    }
    return respuesta(cuerpoCita(guardada), 201);
  };
  return { [RUTA_CREAR_CITA]: crear, [rutaCita()]: () => respuesta(cuerpoCita(guardada)) };
}

// ── Detalle de una cita ya agendada ──────────────────────────────────────────────────────────

/**
 * Abre el detalle de la cita con la configuración ficticia (opciones) y el servidor con memoria de
 * Mis citas, más las rutas de la prueba (o una función que recibe las rutas con memoria), y espera
 * que cargue.
 */
export async function abrirDetalleCon(
  cita: CitaCruda,
  rutas: Rutas | ((memoria: Rutas) => Rutas) = {},
  configuracion?: ConfiguracionReservaFicticia,
): Promise<PantallaReserva> {
  const abierta = await abrirConCitas(`/cita/${cita.id}`, {
    citas: [cita],
    rutas: (memoria) => ({
      ...rutaConfiguracionReserva(configuracion),
      ...(typeof rutas === 'function' ? rutas(memoria) : rutas),
    }),
  });
  await esperarDetalle(abierta.app, cita.id);
  return abierta;
}

// ── Textos con la hora del teléfono ──────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' con el año, mes y día locales del instante. */
export function diaEnTelefono(iso: string | Date): string {
  const fecha = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/**
 * "antes del martes 20 de octubre, 10:35 a. m." de un plazo que vence otro día que AHORA, con la
 * hora local del teléfono.
 */
export function limiteOtroDia(iso: string): string {
  const dia = diaEnTelefono(iso);
  if (dia === diaEnTelefono(AHORA)) {
    throw new Error('limiteOtroDia solo arma plazos que vencen otro día que AHORA.');
  }
  return `antes del ${diaLegible(dia)}, ${horaEnTelefono(iso)}`;
}

/** 'Martes 20 de octubre, 11:00 a. m.' con el día y la hora locales del teléfono. */
export function fechaHoraEnTelefono(iso: string): string {
  const dia = diaLegible(diaEnTelefono(iso));
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${horaEnTelefono(iso)}`;
}
