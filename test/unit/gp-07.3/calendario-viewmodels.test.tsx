/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  useReprogramarCitaViewModel,
  type ReprogramarCitaViewModel,
} from '@/features/citas/viewmodels/useReprogramarCitaViewModel';
import { useReservarCitaViewModel, type ReservarCitaViewModel } from '@/features/citas/viewmodels/useReservarCitaViewModel';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import {
  fijarCalendario,
  LEYENDA_CALENDARIO,
  TEXTO_CERRADO,
  textoInhabil,
  DIAS_SEMANA,
  type OpcionesCalendario,
} from '../../helpers/calendarioFicticio';
import {
  CITA_CON_ANTICIPO,
  CLIENTA_CITAS,
  conPromesa,
  cuerpoCita,
  DIA_CITA,
  DIA_DOMINGO,
  disponibilidadCruda,
  disponibilidadesDe,
  HOY,
  llamadasDeRuta,
  rutaCita,
  rutaDisponibilidad,
  rutasDisponibilidad,
  SERVICIO_SIN_ANTICIPO,
  simularServidorMisCitas,
  simularServidorReserva,
  usarRelojFijo,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { respuesta, type Llamada, type Manejador } from '../../helpers/servidorSimulado';
import { authSimulada, cerrarConTemporizadores, diferida, reiniciarSimulaciones } from '../../helpers/viewmodelsAuth';

/**
 * GP-07.3: la reserva y reprogramar con los días sin citas de la configuración pública, con
 * renderHook. No dejan elegir un día cerrado o inhábil, la selección por omisión salta al siguiente
 * día libre (también de mes) y, si llega una configuración nueva que bloquea el día elegido, se
 * limpia (sin volver a cargar el servicio ni la cita). Solo se simulan fetch (http://api.test),
 * expo-router, useAuth y expo-file-system (en memoria); la configuración llega por refrescar() con
 * fijarCalendario. Reloj fijo en AHORA (lunes 19 de octubre de 2026).
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

const CORTE = SERVICIO_SIN_ANTICIPO;
const UNO = ESPECIALISTA_UNO.usuarioId;
const MIERCOLES = '2026-10-21';
const LUNES_SIGUIENTE = '2026-10-26';
const LUNES_DE_NOVIEMBRE = '2026-11-02';
const RUTA_SERVICIO = `GET /api/servicios/${CORTE.id}`;
/** Servicio de CITA_CON_ANTICIPO (alaciado), para reprogramar. */
const SERVICIO_CITA = CITA_CON_ANTICIPO.servicioId;

const DIAS_CON_HORARIOS = [HOY, DIA_CITA, MIERCOLES, LUNES_SIGUIENTE, LUNES_DE_NOVIEMBRE];

/** Lo que queda de octubre desde hoy, todo inhábil. */
const RESTO_DE_OCTUBRE = Array.from({ length: 13 }, (_, i) => ({ fecha: `2026-10-${19 + i}`, motivo: 'Ficticio' }));

type Ref<T> = { current: T };
const veces = (llamadas: Llamada[], ruta: string) => llamadasDeRuta(llamadas, ruta).length;
const hacer = (accion: () => void) =>
  act(async () => {
    accion();
  });
/** Llega una configuración nueva con la pantalla montada. */
const llegaConfiguracion = (opciones: OpcionesCalendario) =>
  act(async () => {
    await fijarCalendario(opciones);
  });
const vaciar = () =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(10);
  });

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
  reiniciarSimulaciones();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA_CITAS;
});

espiarConsola(cerrarConTemporizadores, true);
usarRelojFijo();

// ── Reserva ──────────────────────────────────────────────────────────────────────────────────

const horariosCorte = (fecha: string) => rutaDisponibilidad(UNO, fecha, CORTE.id);

async function abrirReserva(rutas: Record<string, Manejador> = {}) {
  const llamadas = simularServidorReserva({
    ...rutasDisponibilidad(DIAS_CON_HORARIOS.flatMap((fecha) => disponibilidadesDe(fecha, CORTE))),
    ...rutas,
  });
  const hook = await renderHook(() => useReservarCitaViewModel(String(CORTE.id)));
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  return { ...hook, llamadas };
}

async function elegirUno(result: Ref<ReservarCitaViewModel>): Promise<void> {
  const uno = result.current.especialistas.find((e) => e.id === UNO);
  if (!uno) throw new Error('Sin la especialista UNO');
  await hacer(() => result.current.elegirEspecialista(uno));
  await vaciar();
}

describe('useReservarCitaViewModel con los días sin citas (GP-07.3)', () => {
  it('con el respaldo arranca hoy; el domingo va bloqueado con su motivo y la leyenda, y elegirlo no hace nada', async () => {
    const { result, llamadas } = await abrirReserva();
    await elegirUno(result);
    expect(result.current.fecha).toBe(HOY);
    expect(result.current.bloqueos).toEqual({
      dias: { [DIA_DOMINGO]: TEXTO_CERRADO },
      leyenda: LEYENDA_CALENDARIO,
      inhabiles: [],
    });
    expect(result.current.motivoCerrado).toBe(TEXTO_CERRADO);

    await hacer(() => result.current.elegirDia(DIA_DOMINGO));
    expect(result.current.fecha).toBe(HOY);
    expect(veces(llamadas, horariosCorte(DIA_DOMINGO))).toBe(0);
  });

  it.each<[string, OpcionesCalendario, string, number]>([
    ['hoy es inhábil', { inhabiles: [{ fecha: HOY, motivo: 'Ficticio' }] }, DIA_CITA, 9],
    ['el salón no abre los lunes', { cerrados: ['lunes', 'domingo'] }, DIA_CITA, 9],
    ['lo que queda de octubre es inhábil (y el 1 de noviembre es domingo)', { inhabiles: RESTO_DE_OCTUBRE }, LUNES_DE_NOVIEMBRE, 10],
  ])('si %s, arranca en el siguiente día libre y en su mes', async (_caso, opciones, dia, mes) => {
    await fijarCalendario(opciones);
    const { result, llamadas } = await abrirReserva();
    await elegirUno(result);
    expect(result.current).toMatchObject({ fecha: dia, mesVisible: { anio: 2026, mes }, estadoHorarios: 'listo' });
    expect(veces(llamadas, horariosCorte(dia))).toBe(1);
    expect(veces(llamadas, horariosCorte(HOY))).toBe(0);
  });

  it('un día inhábil no se puede elegir y trae su motivo para el calendario', async () => {
    await fijarCalendario({ inhabiles: [{ fecha: MIERCOLES, motivo: 'Capacitación' }] });
    const { result, llamadas } = await abrirReserva();
    await elegirUno(result);
    await hacer(() => result.current.elegirDia(MIERCOLES));
    expect(result.current.fecha).toBe(HOY);
    expect(veces(llamadas, horariosCorte(MIERCOLES))).toBe(0);
    expect(result.current.bloqueos.dias[MIERCOLES]).toBe(textoInhabil('Capacitación'));
    expect(result.current.bloqueos.inhabiles).toEqual([{ fecha: MIERCOLES, motivo: 'Capacitación' }]);
  });

  it('con todos los días cerrados no hay día elegido ni se piden horarios', async () => {
    await fijarCalendario({ cerrados: [...DIAS_SEMANA] });
    const { result, llamadas } = await abrirReserva();
    await elegirUno(result);
    expect(result.current).toMatchObject({ paso: 2, fecha: null, estadoHorarios: 'inactivo', disponibilidad: null });
    expect(llamadas.filter((l) => l.ruta.startsWith('/api/citas/disponibilidad'))).toHaveLength(0);
  });

  it('si una configuración nueva bloquea el día elegido, lo limpia y regresa de Confirmar a Día y hora', async () => {
    const { result, llamadas } = await abrirReserva();
    await elegirUno(result);
    await hacer(() => result.current.elegirDia(DIA_CITA));
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    const slot = result.current.disponibilidad?.slots[0];
    if (!slot) throw new Error('Sin horarios');
    await hacer(() => result.current.elegirHorario(slot));
    expect(result.current.paso).toBe(3);

    await llegaConfiguracion({ inhabiles: [{ fecha: DIA_CITA, motivo: 'Ficticio' }] });
    expect(result.current).toMatchObject({
      paso: 2,
      direccion: -1,
      fecha: null,
      slot: null,
      estadoHorarios: 'inactivo',
      disponibilidad: null,
    });
    expect(result.current.bloqueos.dias[DIA_CITA]).toBe(textoInhabil('Ficticio'));
    expect(veces(llamadas, RUTA_SERVICIO)).toBe(1);

    // Volver a elegir a la especialista empieza otra vez por el primer día libre.
    await elegirUno(result);
    expect(result.current.fecha).toBe(HOY);
  });

  it('si la configuración nueva no toca el día elegido, todo sigue igual y no se recarga nada', async () => {
    const { result, llamadas } = await abrirReserva();
    await elegirUno(result);
    await hacer(() => result.current.elegirDia(DIA_CITA));
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));

    await llegaConfiguracion({ inhabiles: [{ fecha: MIERCOLES, motivo: 'Ficticio' }] });
    expect(result.current).toMatchObject({ paso: 2, fecha: DIA_CITA, estadoHorarios: 'listo' });
    expect(result.current.bloqueos.dias[MIERCOLES]).toBe(textoInhabil('Ficticio'));
    expect(veces(llamadas, horariosCorte(DIA_CITA))).toBe(1);
    expect(veces(llamadas, RUTA_SERVICIO)).toBe(1);
  });

  it('los horarios que llegan después de limpiar el día ya no se pintan', async () => {
    const pendiente = diferida();
    const { result } = await abrirReserva({ [horariosCorte(DIA_CITA)]: conPromesa(() => pendiente.promesa) });
    await elegirUno(result);
    await hacer(() => result.current.elegirDia(DIA_CITA));
    expect(result.current.estadoHorarios).toBe('cargando');

    await llegaConfiguracion({ inhabiles: [{ fecha: DIA_CITA, motivo: 'Ficticio' }] });
    await act(async () => {
      pendiente.soltar(respuesta(disponibilidadCruda({ fecha: DIA_CITA })));
    });
    await vaciar();
    expect(result.current).toMatchObject({ fecha: null, estadoHorarios: 'inactivo', disponibilidad: null });
  });
});

// ── Reprogramar ──────────────────────────────────────────────────────────────────────────────

const horariosCita = (fecha: string) => rutaDisponibilidad(UNO, fecha, SERVICIO_CITA);

async function abrirReprogramar() {
  const llamadas = simularServidorMisCitas({
    ...rutasDisponibilidad(DIAS_CON_HORARIOS.map((fecha) => disponibilidadCruda({ fecha }))),
    [rutaCita(CITA_CON_ANTICIPO.id)]: () => respuesta(cuerpoCita(CITA_CON_ANTICIPO)),
  });
  const hook = await renderHook(() => useReprogramarCitaViewModel(String(CITA_CON_ANTICIPO.id)));
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  await vaciar();
  return { ...hook, llamadas };
}

describe('useReprogramarCitaViewModel con los días sin citas (GP-07.3)', () => {
  it('con el respaldo arranca en el día de la cita; el domingo no se puede elegir', async () => {
    const { result, llamadas } = await abrirReprogramar();
    expect(result.current.fecha).toBe(DIA_CITA);
    expect(result.current.bloqueos.dias[DIA_DOMINGO]).toBe(TEXTO_CERRADO);
    expect(result.current.motivoCerrado).toBe(TEXTO_CERRADO);

    await hacer(() => result.current.elegirDia(DIA_DOMINGO));
    expect(result.current.fecha).toBe(DIA_CITA);
    expect(veces(llamadas, horariosCita(DIA_DOMINGO))).toBe(0);
  });

  it('si el día de la cita ya no tiene citas, arranca en el siguiente libre', async () => {
    await fijarCalendario({ inhabiles: [{ fecha: DIA_CITA, motivo: 'Ficticio' }] });
    const { result, llamadas } = await abrirReprogramar();
    expect(result.current).toMatchObject({ fecha: MIERCOLES, mesVisible: { anio: 2026, mes: 9 }, estadoHorarios: 'listo' });
    expect(veces(llamadas, horariosCita(MIERCOLES))).toBe(1);
    expect(veces(llamadas, horariosCita(DIA_CITA))).toBe(0);
  });

  it('con todos los días cerrados queda lista sin día ni horarios', async () => {
    await fijarCalendario({ cerrados: [...DIAS_SEMANA] });
    const { result, llamadas } = await abrirReprogramar();
    expect(result.current).toMatchObject({ estado: 'listo', fecha: null, estadoHorarios: 'inactivo', disponibilidad: null });
    expect(llamadas.filter((l) => l.ruta.startsWith('/api/citas/disponibilidad'))).toHaveLength(0);
  });

  it('si una configuración nueva bloquea el día elegido, lo limpia sin volver a pedir la cita', async () => {
    const { result, llamadas } = await abrirReprogramar();
    const slot = result.current.disponibilidad?.slots[0];
    if (!slot) throw new Error('Sin horarios');
    await hacer(() => result.current.elegirHorario(slot));
    expect(result.current.slot).toEqual(slot);

    await llegaConfiguracion({ cerrados: ['martes', 'domingo'] });
    expect(result.current).toMatchObject({ fecha: null, slot: null, estadoHorarios: 'inactivo', disponibilidad: null });
    expect(result.current.bloqueos.dias[DIA_CITA]).toBe(TEXTO_CERRADO);
    expect(veces(llamadas, rutaCita(CITA_CON_ANTICIPO.id))).toBe(1);

    await hacer(() => result.current.elegirDia(MIERCOLES));
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    expect(result.current.fecha).toBe(MIERCOLES);
  });
});
