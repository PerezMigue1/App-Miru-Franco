/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { OpcionAnticipo } from '@/features/citas/viewmodels/formaPagoReserva';
import { useReservarCitaViewModel, type ReservarCitaViewModel } from '@/features/citas/viewmodels/useReservarCitaViewModel';

import { DIA_CITA } from './citasFicticias';
import { ESPECIALISTA_UNO } from './serviciosFicticios';

/**
 * Piezas de las pruebas en caja blanca de useReservarCitaViewModel (GP-07.6): abrir la reserva de un
 * servicio y llegar a Confirmar con la especialista UNO, el martes y su segundo horario. Requiere los
 * mocks de expo-router y useAuth de viewmodelsAuth y un servidor simulado con la reserva.
 */

export type ResultadoReserva = { current: ReservarCitaViewModel };

/** Id de la especialista UNO como lo usa la reserva. */
export const ESPECIALISTA_RESERVA = String(ESPECIALISTA_UNO.usuarioId);

/** Corre una acción del viewmodel dentro de act. */
export const hacerEnReserva = (accion: () => void) =>
  act(async () => {
    accion();
  });

/** Abre la reserva del servicio y espera a que esté lista. */
export async function abrirReservaVm(servicioId: string | number) {
  const hook = await renderHook(() => useReservarCitaViewModel(String(servicioId)));
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  return hook;
}

/**
 * Especialista UNO, el martes y su segundo horario, con las notas y la forma de pago indicadas y la
 * casilla de la política marcada. Devuelve el inicio del horario elegido.
 */
export async function hastaConfirmarReserva(
  result: ResultadoReserva,
  opcion: OpcionAnticipo,
  notas = '',
): Promise<string> {
  const uno = result.current.especialistas.find((e) => String(e.id) === ESPECIALISTA_RESERVA);
  if (!uno) throw new Error('Sin la especialista UNO');
  await hacerEnReserva(() => result.current.elegirEspecialista(uno));
  await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
  await hacerEnReserva(() => result.current.elegirDia(DIA_CITA));
  await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
  const slot = result.current.disponibilidad?.slots[1];
  if (!slot) throw new Error('Sin horarios el martes');
  await hacerEnReserva(() => {
    result.current.elegirHorario(slot);
    result.current.setNotas(notas);
    result.current.elegirOpcion(opcion);
  });
  await hacerEnReserva(() => result.current.cambiarAceptaPolitica(true));
  return slot.inicio;
}
