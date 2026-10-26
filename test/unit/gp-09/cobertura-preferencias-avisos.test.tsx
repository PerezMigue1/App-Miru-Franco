/// <reference types="jest" />

import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';

import {
  usePreferenciasAvisos,
  type PreferenciasAvisosViewModel,
} from '@/features/notificaciones/viewmodels/usePreferenciasAvisos';

import { limite429 } from '../../helpers/limitesRed';
import { error500 } from '../../helpers/misDatos';
import {
  RUTA_PREFERENCIAS,
  conCambio,
  preferenciaNoDisponible400,
  respuestaPreferencias,
} from '../../helpers/preferenciasAvisos';
import { llamadasA } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import {
  diferida,
  enSecuencia,
  reiniciarSimulaciones,
  servidorVm,
  sinRed,
  type ManejadorVm,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-09, cobertura de usePreferenciasAvisos con renderHook: lo que la pantalla no deja tocar (Guardar
 * sin cambios, un interruptor mientras se guarda, Reintentar durante la espera de un 429) no envía
 * nada, y las respuestas viejas o que llegan después de desmontar no escriben. expo-router simulado y
 * fetch simulado en http://api.test con datos ficticios.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());

const CLIENTA = { id: 'clienta-pref-3', nombre: 'Clienta Avisos', email: 'avisos3@ejemplo.test', rol: 'cliente' };

type Resultado = { current: PreferenciasAvisosViewModel };

beforeEach(async () => {
  reiniciarSimulaciones();
  await sembrarSesion(CLIENTA);
});

afterEach(async () => {
  await cleanup();
});

async function montar(rutas: Record<string, ManejadorVm>) {
  const llamadas = servidorVm({ [`GET ${RUTA_PREFERENCIAS}`]: () => respuestaPreferencias(), ...rutas });
  const vista = await renderHook(() => usePreferenciasAvisos());
  await waitFor(() => expect(vista.result.current.estado).toBe('lista'));
  return { ...vista, llamadas };
}

/** El interruptor de un tipo y canal. */
function interruptor(result: Resultado, clave: string) {
  const encontrado = result.current.grupos.flatMap((g) => g.interruptores).find((i) => i.clave === clave);
  if (!encontrado) {
    throw new Error(`sin interruptor ${clave}`);
  }
  return encontrado;
}

const hacer = (accion: () => void) =>
  act(async () => {
    accion();
  });

describe('usePreferenciasAvisos: lo que no envía nada', () => {
  it('Guardar sin cambios no manda nada', async () => {
    const { result, llamadas } = await montar({});
    await hacer(() => result.current.guardar());
    expect(llamadasA(llamadas, 'PATCH', RUTA_PREFERENCIAS)).toHaveLength(0);
  });

  it('un interruptor tocado mientras se guarda no cambia el borrador', async () => {
    const espera = diferida();
    const { result, llamadas } = await montar({ [`PATCH ${RUTA_PREFERENCIAS}`]: () => espera.promesa });
    await hacer(() => interruptor(result, 'cita_creada:in_app').cambiar(false));
    await hacer(() => result.current.guardar());
    expect(result.current.guardando).toBe(true);
    await hacer(() => interruptor(result, 'factura_emitida:in_app').cambiar(true));
    await hacer(() => result.current.guardar());
    expect(interruptor(result, 'factura_emitida:in_app').encendido).toBe(false);
    expect(llamadasA(llamadas, 'PATCH', RUTA_PREFERENCIAS)).toHaveLength(1);
    await act(async () => {
      espera.soltar(respuestaPreferencias(conCambio('cita_creada', 'in_app', false)));
    });
    expect(result.current.guardando).toBe(false);
  });

  it('Reintentar durante la espera de un 429 no vuelve a pedir', async () => {
    const llamadas = servidorVm({ [`GET ${RUTA_PREFERENCIAS}`]: () => limite429(40) });
    const { result } = await renderHook(() => usePreferenciasAvisos());
    await waitFor(() => expect(result.current.estado).toBe('errorCarga'));
    expect(result.current.reintentarDeshabilitado).toBe(true);
    await hacer(() => result.current.reintentar());
    expect(llamadasA(llamadas, 'GET', RUTA_PREFERENCIAS)).toHaveLength(1);
  });
});

describe('usePreferenciasAvisos: respuestas viejas o tardías', () => {
  it('el error de una carga vieja no tapa la que sí llegó', async () => {
    const primera = diferida();
    servidorVm({ [`GET ${RUTA_PREFERENCIAS}`]: enSecuencia(() => primera.promesa, () => respuestaPreferencias()) });
    const { result } = await renderHook(() => usePreferenciasAvisos());
    await hacer(() => result.current.reintentar());
    await waitFor(() => expect(result.current.estado).toBe('lista'));
    await act(async () => {
      primera.soltar(error500());
    });
    expect(result.current.estado).toBe('lista');
    expect(result.current.errorCarga).toBeNull();
  });

  it('la relectura tras PREFERENCIA_NO_DISPONIBLE no pisa una carga más nueva, y si falla se queda la lista', async () => {
    const relectura = diferida();
    const { result } = await montar({
      [`GET ${RUTA_PREFERENCIAS}`]: enSecuencia(
        () => respuestaPreferencias(),
        () => relectura.promesa,
        () => respuestaPreferencias(conCambio('cita_creada', 'in_app', false)),
      ),
      [`PATCH ${RUTA_PREFERENCIAS}`]: () => preferenciaNoDisponible400(),
    });
    await hacer(() => interruptor(result, 'factura_emitida:in_app').cambiar(true));
    await hacer(() => result.current.guardar());
    await waitFor(() => expect(result.current.errorGuardado).not.toBeNull());
    // Una carga nueva mientras la relectura sigue en camino: la relectura ya no cuenta.
    await hacer(() => result.current.reintentar());
    await waitFor(() => expect(interruptor(result, 'cita_creada:in_app').encendido).toBe(false));
    await act(async () => {
      relectura.soltar(respuestaPreferencias());
    });
    expect(interruptor(result, 'cita_creada:in_app').encendido).toBe(false);
  });

  it('un guardado más nuevo gana a la relectura vieja tras PREFERENCIA_NO_DISPONIBLE', async () => {
    const relectura = diferida();
    const { result } = await montar({
      [`GET ${RUTA_PREFERENCIAS}`]: enSecuencia(() => respuestaPreferencias(), () => relectura.promesa),
      [`PATCH ${RUTA_PREFERENCIAS}`]: enSecuencia(
        () => preferenciaNoDisponible400(),
        () => respuestaPreferencias(conCambio('factura_emitida', 'in_app', true)),
      ),
    });
    await hacer(() => interruptor(result, 'factura_emitida:in_app').cambiar(true));
    await hacer(() => result.current.guardar());
    await waitFor(() => expect(result.current.errorGuardado).not.toBeNull());
    // Con la relectura todavía en camino, la clienta guarda otra vez y el backend lo confirma.
    await hacer(() => result.current.guardar());
    await waitFor(() => expect(result.current.avisoGuardado).not.toBeNull());
    await act(async () => {
      relectura.soltar(respuestaPreferencias());
    });
    expect(interruptor(result, 'factura_emitida:in_app').encendido).toBe(true);
    expect(result.current.guardarDeshabilitado).toBe(true);
  });

  it('si la relectura falla, la pantalla se queda con la lista y lo elegido', async () => {
    const { result } = await montar({
      [`GET ${RUTA_PREFERENCIAS}`]: enSecuencia(() => respuestaPreferencias(), sinRed),
      [`PATCH ${RUTA_PREFERENCIAS}`]: () => preferenciaNoDisponible400(),
    });
    await hacer(() => interruptor(result, 'factura_emitida:in_app').cambiar(true));
    await hacer(() => result.current.guardar());
    await waitFor(() => expect(result.current.errorGuardado).not.toBeNull());
    expect(result.current.estado).toBe('lista');
    expect(interruptor(result, 'factura_emitida:in_app').encendido).toBe(true);
  });

  it.each<[string, () => Response]>([
    ['bien', () => respuestaPreferencias(conCambio('cita_creada', 'in_app', false))],
    ['con error', () => error500()],
  ])('lo que responde el PATCH (%s) después de desmontar no escribe nada', async (_caso, salida) => {
    const espera = diferida();
    const errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result, unmount } = await montar({ [`PATCH ${RUTA_PREFERENCIAS}`]: () => espera.promesa });
    await hacer(() => interruptor(result, 'cita_creada:in_app').cambiar(false));
    await hacer(() => result.current.guardar());
    await unmount();
    await act(async () => {
      espera.soltar(salida());
    });
    expect(errores).not.toHaveBeenCalled();
    errores.mockRestore();
  });
});
