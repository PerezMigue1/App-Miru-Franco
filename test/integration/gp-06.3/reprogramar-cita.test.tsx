/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';

import {
  conError,
  DIA_CITA,
  DIA_DOMINGO,
  disponibilidadCerrada,
  disponibilidadComoServidor,
  disponibilidadCruda,
  ERRORES,
  ERRORES_MIS_CITAS,
  ID_CITA,
  INICIO_CITA_ISO,
  isoMexico,
  llamadasDeRuta,
  masMinutos,
  MENSAJES_BACKEND,
  MOTIVO_SALON_CERRADO,
  rutaCita,
  rutaDisponibilidad,
  rutaReprogramar,
  SERVICIO_CON_ANTICIPO,
  TEXTOS_MIS_CITAS,
  type DisponibilidadCruda,
} from '../../helpers/citasFicticias';
import {
  rutaCalendario,
  SALON_ABRE_DIARIO,
  TEXTO_CERRADO,
  type OpcionesCalendario,
} from '../../helpers/calendarioFicticio';
import { LIMITE_MS, ultimoBoton, type App } from '../../helpers/pantallas';
import {
  abrirConCitas,
  citaTrasUnError,
  esperarDetalle,
  revisarInsignias,
  type OpcionesMisCitas,
} from '../../helpers/pantallasMisCitas';
import {
  botonDia,
  diaConMayuscula,
  elegirDia,
  esperarRuta,
  horaDelServidor,
  horaEnTelefono,
  horarioEnTelefono,
  prepararPruebasReserva,
  revisarDatos,
  sinTextos,
  tocar,
  tocarYEsperar,
  vecesEn,
  type PantallaReserva,
} from '../../helpers/pantallasReserva';
import { enSecuencia, errorDelServidor } from '../../helpers/pantallasServicios';
import { ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-06.3: reprogramar una cita con las pantallas reales y el servidor simulado con memoria. La cita
 * 501 es el alaciado del martes a las 11:00 de México con ESPECIALISTA_UNO; su detalle la devuelve
 * como quedó tras el PATCH. Lo que ve la clienta al abrir la reprogramación, el resumen del cambio,
 * lo que recibe el servidor y el detalle actualizado, el horario que se ocupó (400, no 409), los
 * días sin horarios y las citas que ya no se pueden reprogramar. Los mensajes de aviso mínimo y de
 * horario pasado ya están en test/unit/gp-06.3/correcciones-mis-citas.test.tsx.
 */

/** Miércoles: otro día con horarios para el alaciado. */
const MIERCOLES = '2026-10-21';
const RUTA_REPROGRAMAR = rutaReprogramar();
const RUTA_HORARIOS_MIERCOLES = rutaDisponibilidad(ESPECIALISTA_UNO.usuarioId, MIERCOLES, SERVICIO_CON_ANTICIPO.id);

/** Disponibilidad del alaciado con ESPECIALISTA_UNO ese día, como la calcula el servidor. */
function horariosDel(fecha: string, ocupadas: { inicio: string; fin: string }[] = []): DisponibilidadCruda {
  return disponibilidadComoServidor({
    fecha,
    especialistaId: ESPECIALISTA_UNO.usuarioId,
    servicioId: SERVICIO_CON_ANTICIPO.id,
    ocupadas,
  });
}

function conHorarios(disponibilidad: DisponibilidadCruda): Manejador {
  return () => respuesta(disponibilidad);
}

/** Slot del alaciado (150 min) que empieza a esa hora de México. */
function slotDel(fecha: string, hora: string): { fechaHoraInicio: string; fechaHoraFin: string } {
  const inicio = isoMexico(fecha, hora);
  return { fechaHoraInicio: inicio, fechaHoraFin: masMinutos(inicio, SERVICIO_CON_ANTICIPO.duracionMinutos).toISOString() };
}

/** Del detalle de la cita 501 toca "Reprogramar" y espera la pantalla con los horarios del martes. */
async function abrirDesdeDetalle(rutas?: OpcionesMisCitas['rutas']): Promise<PantallaReserva> {
  const abierta = await abrirConCitas(`/cita/${ID_CITA}`, { rutas });
  await esperarDetalle(abierta.app, ID_CITA);
  await tocarYEsperar(abierta.app, 'Reprogramar', `/cita/${ID_CITA}/reprogramar`);
  expect(await screen.findByRole('header', { name: 'Reprogramar cita' })).toBeOnTheScreen();
  expect(await screen.findByRole('button', { name: horaDelServidor(DIA_CITA, '09:30') })).toBeOnTheScreen();
  return abierta;
}

/** Elige el día y la hora (de México), revisa el resumen "Tu cambio" y confirma. */
async function cambiarA(fecha: string, hora: string): Promise<void> {
  await tocar(horaDelServidor(fecha, hora));
  expect(await screen.findByRole('header', { name: 'Tu cambio' })).toBeOnTheScreen();
  const de = `${diaConMayuscula(DIA_CITA)}, ${horaEnTelefono(INICIO_CITA_ISO)}`;
  const a = `${diaConMayuscula(fecha)}, ${horaDelServidor(fecha, hora)}`;
  expect(screen.getByLabelText(`Cambio de tu cita. De: ${de}. A: ${a}.`)).toBeOnTheScreen();
  await tocar('Confirmar cambio');
}

/** De regreso en el detalle, la cita ya está en el nuevo horario y reprogramada. */
async function revisarDetalleEn(app: App, fecha: string, hora: string): Promise<void> {
  await esperarRuta(app, `/cita/${ID_CITA}`);
  const { fechaHoraInicio, fechaHoraFin } = slotDel(fecha, hora);
  await waitFor(() => revisarInsignias('Reprogramada', 'Anticipo pendiente'));
  revisarDatos({ Fecha: diaConMayuscula(fecha), Hora: horarioEnTelefono(fechaHoraInicio, fechaHoraFin) });
  expect(screen.queryByRole('header', { name: 'Reprogramar cita' })).not.toBeOnTheScreen();
}

/**
 * Abre la reprogramación de la cita 501 (con la configuración indicada, si la hay) y, con los
 * horarios del martes ya a la vista, elige ese día.
 */
async function elegirDiaCon(fecha: string, horarios?: Manejador, configuracion?: OpcionesCalendario): Promise<void> {
  const ruta = rutaDisponibilidad(ESPECIALISTA_UNO.usuarioId, fecha, SERVICIO_CON_ANTICIPO.id);
  await abrirConCitas(`/cita/${ID_CITA}/reprogramar`, {
    rutas: { ...(configuracion ? rutaCalendario(configuracion) : {}), ...(horarios ? { [ruta]: horarios } : {}) },
  });
  expect(await screen.findByRole('button', { name: horaDelServidor(DIA_CITA, '09:30') })).toBeOnTheScreen();
  await elegirDia(fecha);
}

/** Ningún horario a la vista y "Confirmar cambio" deshabilitado. */
function sinHorarios(): void {
  expect(screen.queryByRole('button', { name: /m\.$/ })).not.toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Confirmar cambio' })).toBeDisabled();
}

describe('Reprogramar una cita con las pantallas reales (GP-06.3)', () => {
  // La configuración que siembra una prueba se queda en memoria: cada prueba empieza con el respaldo.
  beforeEach(reiniciarConfiguracionPublica);
  const esperarConsolaLimpia = prepararPruebasReserva();

  it(
    'del detalle a "Reprogramar cita": servicio, especialista, el día de la cita elegido y sus horarios sin el actual',
    async () => {
      const abierta = await abrirDesdeDetalle();

      expect(screen.getByText('Alaciado keratínico')).toBeOnTheScreen();
      expect(screen.getByLabelText(`Especialista: ${ESPECIALISTA_UNO.nombre}`)).toBeOnTheScreen();
      expect(screen.getByText('El servicio y la especialista se quedan igual.')).toBeOnTheScreen();
      expect(botonDia(DIA_CITA)).toBeSelected();
      for (const hora of ['10:00', '10:30', '11:30', '17:00']) {
        expect(screen.getByRole('button', { name: horaDelServidor(DIA_CITA, hora) })).not.toBeSelected();
      }
      sinTextos(horaDelServidor(DIA_CITA, '11:00'));
      expect(screen.getByRole('button', { name: 'Confirmar cambio' })).toBeDisabled();
      expect(screen.queryByRole('header', { name: 'Tu cambio' })).not.toBeOnTheScreen();

      // Volver sin elegir regresa al detalle sin cambiar nada.
      await tocar('Volver');
      await esperarDetalle(abierta.app, ID_CITA);
      revisarInsignias('Pendiente');
      expect(vecesEn(abierta, RUTA_REPROGRAMAR)).toBe(0);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'elige otro día y otra hora: ve "Tu cambio", confirma con el horario elegido y el detalle muestra la nueva fecha',
    async () => {
      const abierta = await abrirDesdeDetalle({ [RUTA_HORARIOS_MIERCOLES]: conHorarios(horariosDel(MIERCOLES)) });
      await elegirDia(MIERCOLES);
      expect(botonDia(MIERCOLES)).toBeSelected();
      // El miércoles a las 11:00 sí se ofrece: solo se quita el horario exacto de la cita.
      expect(await screen.findByRole('button', { name: horaDelServidor(MIERCOLES, '11:00') })).toBeOnTheScreen();

      await cambiarA(MIERCOLES, '12:30');
      await revisarDetalleEn(abierta.app, MIERCOLES, '12:30');
      expect(llamadasDeRuta(abierta.llamadas, RUTA_REPROGRAMAR).map((l) => l.cuerpo)).toEqual([slotDel(MIERCOLES, '12:30')]);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'horario ocupado (400 del backend): lo dice, recarga los horarios sin ese y confirma otro',
    async () => {
      const ocupado = slotDel(MIERCOLES, '12:30');
      const abierta = await abrirDesdeDetalle((memoria) => ({
        [RUTA_REPROGRAMAR]: enSecuencia(conError(ERRORES.horarioOcupado), memoria[RUTA_REPROGRAMAR]),
        [RUTA_HORARIOS_MIERCOLES]: enSecuencia(
          conHorarios(horariosDel(MIERCOLES)),
          conHorarios(horariosDel(MIERCOLES, [{ inicio: ocupado.fechaHoraInicio, fin: ocupado.fechaHoraFin }])),
        ),
      }));
      await elegirDia(MIERCOLES);
      await cambiarA(MIERCOLES, '12:30');

      expect(await screen.findByText(TEXTOS_MIS_CITAS.horarioOcupado)).toBeOnTheScreen();
      await waitFor(() => expect(vecesEn(abierta, RUTA_HORARIOS_MIERCOLES)).toBe(2));
      expect(await screen.findByRole('button', { name: horaDelServidor(MIERCOLES, '17:00') })).toBeOnTheScreen();
      sinTextos(horaDelServidor(MIERCOLES, '12:30'), MENSAJES_BACKEND.horarioOcupado, /cita #/);
      expect(screen.getByRole('button', { name: 'Confirmar cambio' })).toBeDisabled();

      await cambiarA(MIERCOLES, '17:00');
      await revisarDetalleEn(abierta.app, MIERCOLES, '17:00');
      expect(llamadasDeRuta(abierta.llamadas, RUTA_REPROGRAMAR).map((l) => l.cuerpo)).toEqual([
        ocupado,
        slotDel(MIERCOLES, '17:00'),
      ]);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, number, Manejador | null, string, string, string, string]>([
    [
      'una cita completada',
      503,
      null,
      'Esta cita ya no se puede reprogramar',
      'Volver a tu cita',
      '/cita/503',
      'Completada',
    ],
    [
      'una cita que no existe (404)',
      ID_CITA,
      conError(ERRORES_MIS_CITAS.citaNoEncontrada),
      'No encontramos esta cita',
      'Volver',
      `/cita/${ID_CITA}`,
      'Ver mis citas',
    ],
  ])(
    'abierta directo, %s lo dice sin calendario y su botón lleva al detalle',
    async (_caso, id, cita, titulo, boton, destino, enDetalle) => {
      const abierta = await abrirConCitas(`/cita/${id}/reprogramar`, { rutas: cita ? { [rutaCita(id)]: cita } : {} });
      expect(await screen.findByRole('header', { name: titulo })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Confirmar cambio' })).not.toBeOnTheScreen();
      sinTextos(ERRORES_MIS_CITAS.citaNoEncontrada.message as string);

      // El botón del estado es el último "Volver": el primero es el de la cabecera.
      await fireEvent.press(ultimoBoton(boton));
      await esperarRuta(abierta.app, destino);
      expect(await screen.findByRole('header', { name: 'Tu cita' })).toBeOnTheScreen();
      expect(await screen.findByText(enDetalle)).toBeOnTheScreen();
      expect(vecesEn(abierta, rutaReprogramar(id))).toBe(0);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si la cita no carga (500), Reintentar muestra el calendario',
    async () => {
      await abrirConCitas(`/cita/${ID_CITA}/reprogramar`, {
        rutas: { [rutaCita()]: citaTrasUnError() },
      });
      expect(await screen.findByRole('header', { name: 'No pudimos cargar tu cita' })).toBeOnTheScreen();
      sinTextos('Error interno ficticio');

      await tocar('Reintentar');
      expect(await screen.findByRole('header', { name: 'Elige el nuevo día y hora' })).toBeOnTheScreen();
      expect(botonDia(DIA_CITA)).toBeSelected();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  // GP-07.3: con la configuración del respaldo el domingo ya no se puede elegir (lo prueban
  // test/unit/gp-07.3/calendario-*); para seguir probando el motivo que manda el backend de un día
  // cerrado, esa fila siembra una configuración con el salón abierto los siete días.
  it.each<[string, string, Manejador | undefined, string, string, OpcionesCalendario | undefined]>([
    [
      'el domingo, con el salón cerrado',
      DIA_DOMINGO,
      undefined,
      MOTIVO_SALON_CERRADO,
      'Elige otro día.',
      SALON_ABRE_DIARIO,
    ],
    [
      'un día cerrado sin motivo',
      MIERCOLES,
      conHorarios(disponibilidadCerrada({ ...horariosDel(MIERCOLES), abierto: false, motivo: null, slots: [] })),
      TEXTO_CERRADO,
      'Elige otro día.',
      undefined,
    ],
    [
      'un día sin horarios libres',
      MIERCOLES,
      conHorarios(disponibilidadCruda({ ...horariosDel(MIERCOLES), slots: [] })),
      'No hay horarios libres este día',
      'Prueba con otro día.',
      undefined,
    ],
  ])(
    '%s lo dice, sugiere otro día y no ofrece horarios',
    async (_caso, fecha, horarios, mensaje, sugerencia, configuracion) => {
      await elegirDiaCon(fecha, horarios, configuracion);
      expect(await screen.findByText(mensaje)).toBeOnTheScreen();
      expect(screen.getByText(sugerencia)).toBeOnTheScreen();
      sinHorarios();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si los horarios del día fallan (500) lo dice sin el texto técnico y Reintentar los trae',
    async () => {
      await elegirDiaCon(MIERCOLES, enSecuencia(errorDelServidor, conHorarios(horariosDel(MIERCOLES))));
      expect(await screen.findByText('No pudimos cargar los horarios de este día.')).toBeOnTheScreen();
      sinHorarios();
      sinTextos('Error interno ficticio');

      await tocar('Reintentar');
      expect(await screen.findByRole('button', { name: horaDelServidor(MIERCOLES, '12:30') })).toBeOnTheScreen();
      sinTextos('No pudimos cargar los horarios de este día.');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
