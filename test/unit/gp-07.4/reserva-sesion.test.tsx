/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { MENSAJE_SESION_RESERVA } from '@/features/citas/models/consentimientosReserva';
import { guardarReservaPendiente, reiniciarReservaPendiente } from '@/features/citas/models/reservaPendiente';
import {
  AVISO_RESERVA_RECUPERADA,
  useReservarCitaViewModel,
  type ReservarCitaViewModel,
} from '@/features/citas/viewmodels/useReservarCitaViewModel';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';

import {
  AHORA,
  CLIENTA_CITAS,
  conError,
  DIA_CITA,
  disponibilidadesDe,
  ERRORES,
  HOY,
  llamadasDeRuta,
  RUTA_CREAR_CITA,
  rutasDisponibilidad,
  SERVICIO_CON_ANTICIPO,
  SERVICIO_SIN_ANTICIPO,
  simularServidorReserva,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { rutasConsentimientos, RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';
import { ESPECIALISTA_DOS, ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import type { Llamada, Manejador } from '../../helpers/servidorSimulado';
import { authSimulada, cerrarConTemporizadores, reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4, defecto de la sesión vencida a mitad de la reserva, con useReservarCitaViewModel en caja
 * blanca (renderHook): fetch simulado (http://api.test), expo-router y useAuth simulados; apiClient y
 * los modelos son los reales. Un 401 en cualquier paso deja el mensaje claro, no crea la cita y
 * guarda en memoria lo elegido; al volver a abrir la reserva del mismo servicio, la misma clienta
 * lo recupera una vez (las casillas, sin marcar).
 */

type Resultado = { current: ReservarCitaViewModel };

const ALACIADO = SERVICIO_CON_ANTICIPO;
const CORTE = SERVICIO_SIN_ANTICIPO;
const UNO = String(ESPECIALISTA_UNO.usuarioId);
const NOTAS = 'Traigo foto de referencia';
const OTRA_CLIENTA = { ...CLIENTA_CITAS, id: `${CLIENTA_CITAS.id}-otra` };

function servidor(rutas: Record<string, Manejador> = {}): Llamada[] {
  return simularServidorReserva({
    ...rutasConsentimientos(),
    ...rutasDisponibilidad(
      [HOY, DIA_CITA].flatMap((fecha) => [...disponibilidadesDe(fecha, ALACIADO), ...disponibilidadesDe(fecha, CORTE)]),
    ),
    ...rutas,
  });
}

const hacer = (accion: () => void) =>
  act(async () => {
    accion();
  });

async function abrir(servicioId: string | number = ALACIADO.id, especialistaInicial?: string) {
  const hook = await renderHook(() => useReservarCitaViewModel(String(servicioId), especialistaInicial));
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  return hook;
}

/** Especialista UNO, el martes y su segundo horario, con notas: queda en Confirmar. */
async function hastaConfirmar(result: Resultado): Promise<void> {
  const uno = result.current.especialistas.find((e) => String(e.id) === UNO);
  if (!uno) throw new Error('Sin la especialista UNO');
  await hacer(() => result.current.elegirEspecialista(uno));
  await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
  await hacer(() => result.current.elegirDia(DIA_CITA));
  await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
  const slot = result.current.disponibilidad?.slots[1];
  if (!slot) throw new Error('Sin horarios el martes');
  await hacer(() => {
    result.current.elegirHorario(slot);
    result.current.setNotas(NOTAS);
  });
}

/** Marca la política (y las fotos) y confirma. */
async function confirmar(result: Resultado): Promise<void> {
  await hacer(() => {
    result.current.cambiarAceptaPolitica(true);
    result.current.cambiarAutorizaFotos(true);
  });
  await hacer(() => result.current.confirmar());
}

beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  reiniciarSimulaciones();
  reiniciarReservaPendiente();
  reiniciarConfiguracionPublica();
  reiniciarDocumentosLegales();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA_CITAS;
});

espiarConsola(cerrarConTemporizadores, true);

describe('Sesión vencida a mitad de la reserva (GP-07.4)', () => {
  it('401 al registrar la política: mensaje claro, sin cita; al volver la misma clienta recupera especialista, día, horario y notas', async () => {
    const llamadas = servidor({ [RUTA_CONSENTIMIENTOS]: conError(ERRORES.sesionVencida) });
    const primera = await abrir();
    await hastaConfirmar(primera.result);
    const elegido = primera.result.current.slot;
    await confirmar(primera.result);

    await waitFor(() => expect(primera.result.current.errorEnvio).toBe(MENSAJE_SESION_RESERVA));
    expect(primera.result.current).toMatchObject({ enviando: false, paso: 3 });
    expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(0);
    await primera.unmount();

    // Vuelve a iniciar sesión (el servidor ya acepta) y abre la reserva del mismo servicio.
    servidor();
    const segunda = await abrir();
    await waitFor(() => expect(segunda.result.current.paso).toBe(3));
    expect(segunda.result.current).toMatchObject({
      fecha: DIA_CITA,
      slot: elegido,
      notas: NOTAS,
      recuperada: true,
      aceptaPolitica: false,
      autorizaFotos: false,
      errorEnvio: null,
    });
    expect(String(segunda.result.current.especialista?.id)).toBe(UNO);
    expect(AVISO_RESERVA_RECUPERADA).toMatch(/^Conservamos lo que elegiste/);

    // Se recupera una sola vez y, al confirmar, el aviso se va.
    await confirmar(segunda.result);
    await waitFor(() => expect(routerSimulado.replace).toHaveBeenCalledWith('/anticipo/501?pagar=1'));
    expect(segunda.result.current.recuperada).toBe(false);
    await segunda.unmount();
    const tercera = await abrir();
    expect(tercera.result.current).toMatchObject({ paso: 1, recuperada: false, notas: '' });
  });

  it('401 al crear una cita sin anticipo: otra clienta no recupera nada; la misma, sí', async () => {
    const llamadas = servidor({ [RUTA_CREAR_CITA]: conError(ERRORES.sesionVencida) });
    const primera = await abrir(CORTE.id);
    await hastaConfirmar(primera.result);
    await hacer(() => primera.result.current.confirmar());
    await waitFor(() => expect(primera.result.current.errorEnvio).toBe(MENSAJE_SESION_RESERVA));
    expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(1);
    await primera.unmount();

    authSimulada.usuario = OTRA_CLIENTA;
    const ajena = await abrir(CORTE.id);
    expect(ajena.result.current).toMatchObject({ paso: 1, notas: '', recuperada: false });
    await ajena.unmount();

    authSimulada.usuario = CLIENTA_CITAS;
    const propia = await abrir(CORTE.id);
    await waitFor(() => expect(propia.result.current.paso).toBe(3));
    expect(propia.result.current).toMatchObject({ notas: NOTAS, recuperada: true });
  });

  it('el horario ya no está libre: queda en Día y hora con ese día y sin horario elegido', async () => {
    servidor();
    guardarReservaPendiente({
      usuarioId: CLIENTA_CITAS.id,
      servicioId: String(ALACIADO.id),
      especialistaId: UNO,
      fecha: DIA_CITA,
      inicio: '2026-10-20T03:00:00.000Z',
      notas: NOTAS,
    });
    const { result } = await abrir();
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    expect(result.current).toMatchObject({ paso: 2, fecha: DIA_CITA, slot: null, notas: NOTAS, recuperada: true });
  });

  it('el día ya pasó: empieza por el primer día libre con la misma especialista', async () => {
    servidor();
    guardarReservaPendiente({
      usuarioId: CLIENTA_CITAS.id,
      servicioId: String(ALACIADO.id),
      especialistaId: UNO,
      fecha: '2026-10-16',
      inicio: '2026-10-16T17:00:00.000Z',
      notas: '',
    });
    const { result } = await abrir();
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    expect(result.current).toMatchObject({ paso: 2, fecha: HOY, slot: null, recuperada: true });
  });

  it('la especialista ya no está en el servicio: no recupera y usa la especialista de la ruta', async () => {
    servidor();
    guardarReservaPendiente({
      usuarioId: CLIENTA_CITAS.id,
      servicioId: String(ALACIADO.id),
      especialistaId: 'especialista-retirada',
      fecha: DIA_CITA,
      inicio: '2026-10-20T17:00:00.000Z',
      notas: NOTAS,
    });
    const { result } = await abrir(ALACIADO.id, String(ESPECIALISTA_DOS.usuarioId));
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    expect(result.current).toMatchObject({ paso: 2, recuperada: false, notas: '' });
    expect(result.current.especialista?.id).toBe(ESPECIALISTA_DOS.usuarioId);
  });
});

describe('Mientras se envía (GP-07.4)', () => {
  it('la opción, las casillas y un segundo confirmar no cambian nada', async () => {
    let soltar: () => void = () => undefined;
    const llegada = new Promise<void>((resolver) => {
      soltar = resolver;
    });
    const llamadas = servidor({
      [RUTA_CONSENTIMIENTOS]: (cuerpo) => llegada.then(() => rutasConsentimientos()[RUTA_CONSENTIMIENTOS](cuerpo)) as unknown as Response,
    });
    const { result } = await abrir();
    await hastaConfirmar(result);
    await confirmar(result);
    expect(result.current).toMatchObject({ enviando: true, opcionPago: 'linea', aceptaPolitica: true, autorizaFotos: true });

    await hacer(() => {
      result.current.elegirOpcion('salon');
      result.current.cambiarAceptaPolitica(false);
      result.current.cambiarAutorizaFotos(false);
      result.current.confirmar();
    });
    expect(result.current).toMatchObject({ opcionPago: 'linea', aceptaPolitica: true, autorizaFotos: true });

    await act(async () => {
      soltar();
    });
    await waitFor(() => expect(routerSimulado.replace).toHaveBeenCalledTimes(1));
    expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(1);
  });
});
