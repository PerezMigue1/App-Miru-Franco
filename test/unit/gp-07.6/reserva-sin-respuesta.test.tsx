/// <reference types="jest" />

import { buscarCitaRecienCreada } from '@/features/citas/models/citaModel';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  AHORA,
  citaDesdeCuerpo,
  CLIENTA_CITAS,
  cuerpoMisCitas,
  DIA_CITA,
  disponibilidadesDe,
  HOY,
  llamadasDeRuta,
  RUTA_CREAR_CITA,
  rutaBuscarCita,
  rutasDisponibilidad,
  SERVICIO_CON_ANTICIPO,
  SERVICIO_SIN_ANTICIPO,
  simularServidorReserva,
  sinRedEnRuta,
  type CitaCruda,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { rutasConsentimientos, RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';
import {
  abrirReservaVm,
  ESPECIALISTA_RESERVA,
  hacerEnReserva,
  hastaConfirmarReserva,
  type ResultadoReserva,
} from '../../helpers/reservaViewModel';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import { TEXTO_SIN_CONEXION } from '../../helpers/textosError';
import { authSimulada, cerrarConTemporizadores, reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.6, revisión final (dinero). POST /api/citas?propios=true no tiene clave de idempotencia: si la
 * respuesta se pierde (sin red, tiempo agotado o un 5xx), la cita pudo crearse. Reintentar daría
 * "horario ocupado" por ella misma y dejaría una cita huérfana pendiente de anticipo o por pagar en
 * el salón (que cuenta para el tope). Antes de dejar reintentar, la app busca la cita entre las de la
 * clienta (misma especialista, mismo servicio y mismo inicio, vigente). fetch simulado
 * (http://api.test), expo-router y useAuth simulados, datos ficticios.
 */

const ALACIADO = SERVICIO_CON_ANTICIPO;
const ID_CREADA = 777;
const SIN_CONFIRMAR = RESPALDO_TEXTOS['citas.reserva.sinConfirmar'];

const respuestaPerdida: [string, Manejador][] = [
  ['sin red', sinRedEnRuta],
  ['tiempo agotado (504)', () => respuesta({ message: 'Gateway Timeout' }, 504)],
  ['error del servidor (500)', () => respuesta({ message: 'Internal server error' }, 500)],
];

/**
 * Servidor de la reserva: consentimientos, disponibilidad, POST de la cita con `crear` y la búsqueda
 * del horario `inicio` con `buscar`. Anota el cuerpo que se mandó al crear.
 */
function servidor(inicio: string, crear: Manejador, buscar: (enviado: unknown) => Manejador) {
  let enviado: unknown = null;
  return simularServidorReserva({
    ...rutasConsentimientos(),
    ...rutasDisponibilidad([HOY, DIA_CITA].flatMap((fecha) => disponibilidadesDe(fecha, ALACIADO))),
    [RUTA_CREAR_CITA]: (cuerpo) => {
      enviado = cuerpo;
      return crear(cuerpo);
    },
    [rutaBuscarCita(ESPECIALISTA_RESERVA, inicio)]: (cuerpo) => buscar(enviado)(cuerpo),
  });
}

/** La búsqueda responde con la cita que el servidor sí guardó (con los cambios indicados). */
const conLaCita =
  (cambios: Partial<CitaCruda> = {}) =>
  (enviado: unknown): Manejador =>
  () =>
    respuesta(cuerpoMisCitas([{ ...citaDesdeCuerpo(enviado, AHORA), id: ID_CREADA, ...cambios }]));

/** Reserva lista para confirmar (opción indicada) con el servidor ya preparado. */
async function prepararReserva(opcion: 'linea' | 'salon', crear: Manejador, buscar: (enviado: unknown) => Manejador) {
  // Primer servidor para cargar el servicio y los horarios; el segundo, con la búsqueda del horario elegido.
  servidor('', crear, buscar);
  const { result } = await abrirReservaVm(ALACIADO.id);
  const inicio = await hastaConfirmarReserva(result, opcion);
  const llamadas = servidor(inicio, crear, buscar);
  return { result, llamadas, inicio };
}

const confirmar = (result: ResultadoReserva) => hacerEnReserva(() => result.current.confirmar());
const creaciones = (llamadas: Parameters<typeof llamadasDeRuta>[0]) => llamadasDeRuta(llamadas, RUTA_CREAR_CITA).length;

beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  reiniciarSimulaciones();
  reiniciarConfiguracionPublica();
  reiniciarDocumentosLegales();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA_CITAS;
});

espiarConsola(cerrarConTemporizadores, true);

describe('reservar cuando la respuesta de crear la cita se pierde', () => {
  it.each(respuestaPerdida)('%s y la cita sí quedó: sigue a la confirmación sin un segundo POST', async (_caso, crear) => {
    const { result, llamadas } = await prepararReserva('salon', crear, conLaCita());
    await confirmar(result);
    expect(routerSimulado.replace).toHaveBeenCalledWith(`/cita-confirmada/${ID_CREADA}`);
    expect(creaciones(llamadas)).toBe(1);
    expect(llamadasDeRuta(llamadas, RUTA_CONSENTIMIENTOS)).toHaveLength(1);
    expect(result.current.errorEnvio).toBeNull();
  });

  it('con el anticipo en línea, la cita encontrada abre el pago una sola vez (pagar=1)', async () => {
    const { result, llamadas } = await prepararReserva('linea', sinRedEnRuta, conLaCita());
    await confirmar(result);
    expect(routerSimulado.replace).toHaveBeenCalledWith(`/anticipo/${ID_CREADA}?pagar=1`);
    expect(creaciones(llamadas)).toBe(1);
  });

  it.each<[string, (enviado: unknown) => Manejador]>([
    ['no hay ninguna', () => () => respuesta(cuerpoMisCitas([]))],
    ['solo una cancelada', conLaCita({ estado: 'cancelada' })],
    ['solo una de otro servicio', conLaCita({ servicioId: SERVICIO_SIN_ANTICIPO.id })],
  ])('si la consulta dice que no se creó (%s), muestra el error y deja reintentar', async (_caso, buscar) => {
    const { result, llamadas } = await prepararReserva('salon', sinRedEnRuta, buscar);
    await confirmar(result);
    expect(routerSimulado.replace).not.toHaveBeenCalled();
    expect(result.current.errorEnvio).toBe(TEXTO_SIN_CONEXION);
    expect(result.current.revisarMisCitas).toBe(false);
    await confirmar(result);
    expect(creaciones(llamadas)).toBe(2);
  });

  it.each<[string, Manejador]>([
    ['sin red', sinRedEnRuta],
    ['con error', () => respuesta({ message: 'Internal server error' }, 500)],
  ])('si la consulta también falla (%s), pide revisar Mis citas y no reintenta', async (_caso, falla) => {
    const { result, llamadas } = await prepararReserva('salon', sinRedEnRuta, () => falla);
    await confirmar(result);
    expect(routerSimulado.replace).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      errorEnvio: SIN_CONFIRMAR,
      revisarMisCitas: true,
      textoVerMisCitas: RESPALDO_TEXTOS['citas.reserva.verMisCitas'],
      enviando: false,
    });
    await confirmar(result);
    expect(creaciones(llamadas)).toBe(1);
    await hacerEnReserva(() => result.current.verMisCitas());
    expect(routerSimulado.replace).toHaveBeenCalledWith('/mis-citas');
  });

  it('un 400 (por ejemplo, horario ocupado) no busca la cita', async () => {
    const ocupado = () => respuesta({ statusCode: 400, message: 'El especialista ya tiene una cita en ese horario (cita #9)' }, 400);
    const { result, llamadas, inicio } = await prepararReserva('salon', ocupado, conLaCita());
    await confirmar(result);
    expect(llamadasDeRuta(llamadas, rutaBuscarCita(ESPECIALISTA_RESERVA, inicio))).toHaveLength(0);
    expect(result.current.horarioOcupado).toBe(true);
  });
});

describe('buscarCitaRecienCreada (modelo)', () => {
  const INICIO = '2026-10-20T17:00:00.000Z';
  const datos = { especialistaId: ESPECIALISTA_RESERVA, servicioId: ALACIADO.id, fechaHoraInicio: INICIO };
  const cita = (cambios: Partial<CitaCruda>) => ({
    ...citaDesdeCuerpo({ ...datos, fechaHoraFin: '2026-10-20T19:30:00.000Z' }, AHORA),
    ...cambios,
  });
  const conLista = (lista: unknown[]) =>
    simularServidorReserva({ [rutaBuscarCita(ESPECIALISTA_RESERVA, INICIO)]: () => respuesta(cuerpoMisCitas(lista)) });

  it('compara el inicio como instante, no como texto', async () => {
    conLista([cita({ id: 1, fechaHoraInicio: '2026-10-20T17:00:00Z' })]);
    await expect(buscarCitaRecienCreada(datos)).resolves.toMatchObject({ estado: 'encontrada', cita: { id: 1 } });
  });

  it('dos candidatas iguales: no se sabe cuál es', async () => {
    conLista([cita({ id: 1 }), cita({ id: 2 })]);
    await expect(buscarCitaRecienCreada(datos)).resolves.toEqual({ estado: 'sinVerificar' });
  });

  it('otra hora de la misma especialista no cuenta', async () => {
    conLista([cita({ id: 1, fechaHoraInicio: '2026-10-20T17:30:00.000Z' })]);
    await expect(buscarCitaRecienCreada(datos)).resolves.toEqual({ estado: 'ninguna' });
  });
});
