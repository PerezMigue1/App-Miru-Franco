/// <reference types="jest" />

import { renderHook, waitFor } from '@testing-library/react-native';

import { MENSAJE_SESION_RESERVA } from '@/features/citas/models/consentimientosReserva';
import {
  guardarReservaPendiente,
  reiniciarReservaPendiente,
  servicioPorRetomar,
  tomarReservaPendiente,
  type ReservaPendiente,
} from '@/features/citas/models/reservaPendiente';
import { useRegresoReserva } from '@/features/citas/viewmodels/useRegresoReserva';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { avisarCierreSesion } from '@/shared/api/eventosSesion';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  AHORA,
  CLIENTA_CITAS,
  conError,
  DIA_CITA,
  disponibilidadesDe,
  ERRORES,
  HOY,
  RUTA_CREAR_CITA,
  rutasDisponibilidad,
  SERVICIO_CON_ANTICIPO,
  simularServidorReserva,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { rutasConsentimientos } from '../../helpers/reservaFicticia';
import {
  abrirReservaVm,
  ESPECIALISTA_RESERVA,
  hacerEnReserva,
  hastaConfirmarReserva,
} from '../../helpers/reservaViewModel';
import type { Manejador } from '../../helpers/servidorSimulado';
import { authSimulada, cerrarConTemporizadores, reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.6 Tarea 4, regreso a la reserva tras una sesión vencida, en caja blanca: el modelo en
 * memoria (reservaPendiente), useRegresoReserva (abre sola la reserva al volver a entrar la misma
 * clienta) y useReservarCitaViewModel (recupera también la forma de pago y avisa si el horario ya no
 * está libre). fetch simulado (http://api.test), expo-router y useAuth simulados, datos ficticios.
 */

const ALACIADO = SERVICIO_CON_ANTICIPO;
const UNO = ESPECIALISTA_RESERVA;
const NOTAS = 'Traigo foto de referencia';
const AVISO_OCUPADO = RESPALDO_TEXTOS['citas.reserva.regresoOcupado'];

function pendienteDe(cambios: Partial<ReservaPendiente> = {}): ReservaPendiente {
  return {
    usuarioId: CLIENTA_CITAS.id,
    servicioId: String(ALACIADO.id),
    especialistaId: UNO,
    fecha: DIA_CITA,
    inicio: '2026-10-20T03:00:00.000Z',
    notas: NOTAS,
    ...cambios,
  };
}

function servidor(rutas: Record<string, Manejador> = {}) {
  return simularServidorReserva({
    ...rutasConsentimientos(),
    ...rutasDisponibilidad([HOY, DIA_CITA].flatMap((fecha) => disponibilidadesDe(fecha, ALACIADO))),
    ...rutas,
  });
}

const hacer = hacerEnReserva;
const abrir = () => abrirReservaVm(ALACIADO.id);

/** Especialista UNO, el martes y su segundo horario, con notas y el anticipo en el salón. */
const hastaConfirmarEnSalon = (result: Parameters<typeof hastaConfirmarReserva>[0]) =>
  hastaConfirmarReserva(result, 'salon', NOTAS);

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

describe('reservaPendiente.servicioPorRetomar', () => {
  it('sin nada guardado: null', () => {
    expect(servicioPorRetomar(CLIENTA_CITAS.id)).toBeNull();
  });

  it('la misma clienta: el servicio, sin tomar lo guardado', () => {
    guardarReservaPendiente(pendienteDe());
    expect(servicioPorRetomar(CLIENTA_CITAS.id)).toBe(String(ALACIADO.id));
    expect(tomarReservaPendiente(CLIENTA_CITAS.id, String(ALACIADO.id))).toMatchObject({ notas: NOTAS });
  });

  it('otra clienta: null y lo guardado se olvida (tampoco lo recupera después la primera)', () => {
    guardarReservaPendiente(pendienteDe());
    expect(servicioPorRetomar('otra-clienta-ficticia')).toBeNull();
    expect(servicioPorRetomar(CLIENTA_CITAS.id)).toBeNull();
  });

  it.each(['salida', 'cambioContrasena'] as const)('cerrar sesión (%s) lo olvida; vencida no', (motivo) => {
    guardarReservaPendiente(pendienteDe());
    avisarCierreSesion('vencida');
    expect(servicioPorRetomar(CLIENTA_CITAS.id)).toBe(String(ALACIADO.id));
    avisarCierreSesion(motivo);
    expect(servicioPorRetomar(CLIENTA_CITAS.id)).toBeNull();
  });
});

describe('useRegresoReserva', () => {
  async function montarAnonima() {
    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    return renderHook(() => useRegresoReserva());
  }

  it('al volver a entrar la misma clienta abre la reserva de ese servicio, una vez', async () => {
    guardarReservaPendiente(pendienteDe());
    const { rerender } = await montarAnonima();
    authSimulada.estado = 'autenticado';
    authSimulada.usuario = CLIENTA_CITAS;
    await rerender({});
    expect(routerSimulado.navigate).toHaveBeenCalledTimes(1);
    expect(routerSimulado.navigate).toHaveBeenCalledWith(`/reservar/${ALACIADO.id}`);
    await rerender({});
    expect(routerSimulado.navigate).toHaveBeenCalledTimes(1);
  });

  it('si entra otra clienta no abre nada y lo guardado se olvida', async () => {
    guardarReservaPendiente(pendienteDe());
    const { rerender } = await montarAnonima();
    authSimulada.estado = 'autenticado';
    authSimulada.usuario = { ...CLIENTA_CITAS, id: 'otra-clienta-ficticia' };
    await rerender({});
    expect(routerSimulado.navigate).not.toHaveBeenCalled();
    expect(tomarReservaPendiente(CLIENTA_CITAS.id, String(ALACIADO.id))).toBeNull();
  });

  it('sin nada guardado no abre nada', async () => {
    const { rerender } = await montarAnonima();
    authSimulada.estado = 'autenticado';
    authSimulada.usuario = CLIENTA_CITAS;
    await rerender({});
    expect(routerSimulado.navigate).not.toHaveBeenCalled();
  });

  it('la sesión restaurada al abrir la app (de cargando a con sesión) no abre la reserva', async () => {
    guardarReservaPendiente(pendienteDe());
    authSimulada.estado = 'cargando';
    authSimulada.usuario = null;
    const { rerender } = await renderHook(() => useRegresoReserva());
    authSimulada.estado = 'autenticado';
    authSimulada.usuario = CLIENTA_CITAS;
    await rerender({});
    expect(routerSimulado.navigate).not.toHaveBeenCalled();
  });
});

describe('useReservarCitaViewModel: lo que se recupera al regresar', () => {
  it('401 al crear la cita con el anticipo en el salón: al volver recupera también esa forma de pago', async () => {
    servidor({ [RUTA_CREAR_CITA]: conError(ERRORES.sesionVencida) });
    const primera = await abrir();
    await hastaConfirmarEnSalon(primera.result);
    const elegido = primera.result.current.slot;
    await hacer(() => primera.result.current.confirmar());
    await waitFor(() => expect(primera.result.current.errorEnvio).toBe(MENSAJE_SESION_RESERVA));
    await primera.unmount();

    servidor();
    const segunda = await abrir();
    await waitFor(() => expect(segunda.result.current.paso).toBe(3));
    expect(segunda.result.current).toMatchObject({
      slot: elegido,
      notas: NOTAS,
      opcionPago: 'salon',
      recuperada: true,
      aceptaPolitica: false,
      avisoRegresoOcupado: null,
    });
  });

  it('el horario ya no está libre: queda en Día y hora con el aviso; elegir otro horario lo quita', async () => {
    servidor();
    guardarReservaPendiente(pendienteDe());
    const { result } = await abrir();
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    expect(result.current).toMatchObject({ paso: 2, fecha: DIA_CITA, slot: null, avisoRegresoOcupado: AVISO_OCUPADO });

    const otro = result.current.disponibilidad?.slots[0];
    if (!otro) throw new Error('Sin horarios el martes');
    await hacer(() => result.current.elegirHorario(otro));
    expect(result.current).toMatchObject({ paso: 3, avisoRegresoOcupado: null });
  });

  it('el día ya pasó: empieza por el primer día libre con el aviso; cambiar de día lo quita', async () => {
    servidor();
    guardarReservaPendiente(pendienteDe({ fecha: '2026-10-16', inicio: '2026-10-16T17:00:00.000Z' }));
    const { result } = await abrir();
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    expect(result.current).toMatchObject({ paso: 2, fecha: HOY, avisoRegresoOcupado: AVISO_OCUPADO });

    await hacer(() => result.current.elegirDia(DIA_CITA));
    expect(result.current.avisoRegresoOcupado).toBeNull();
  });

  it('cambiar de especialista también quita el aviso', async () => {
    servidor();
    guardarReservaPendiente(pendienteDe());
    const { result } = await abrir();
    await waitFor(() => expect(result.current.avisoRegresoOcupado).toBe(AVISO_OCUPADO));
    const uno = result.current.especialistas.find((e) => String(e.id) === UNO);
    if (!uno) throw new Error('Sin la especialista UNO');
    await hacer(() => result.current.elegirEspecialista(uno));
    expect(result.current.avisoRegresoOcupado).toBeNull();
  });
});
