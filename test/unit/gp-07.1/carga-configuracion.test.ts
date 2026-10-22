/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';

import {
  cargarConLimite,
  RESPALDO_CONFIGURACION,
  TIEMPO_MAXIMO_CARGA_MS,
  type ConfiguracionPublica,
} from '@/shared/api/configuracionPublica';
import { useCargaConfiguracion } from '@/shared/api/useConfiguracionPublica';

import { espiarConsola } from '../../helpers/consola';

/**
 * GP-07.1: hook useCargaConfiguracion (src/shared/api/useConfiguracionPublica.ts), lo que la raíz
 * espera antes de ocultar la pantalla de carga. cargarConLimite va simulado para decidir cuándo y
 * cómo termina; el repositorio real se prueba en repositorio-configuracion.test.ts y el arranque
 * completo en test/integration/gp-07.1.
 */

jest.mock('@/shared/api/configuracionPublica', () => ({
  ...jest.requireActual<object>('@/shared/api/configuracionPublica'),
  cargarConLimite: jest.fn(),
}));

const cargarSimulado = cargarConLimite as jest.MockedFunction<typeof cargarConLimite>;

interface Pendiente {
  resolver: (configuracion: ConfiguracionPublica) => void;
  rechazar: (error: Error) => void;
}

/** cargarConLimite queda pendiente hasta que la prueba lo termine. */
function cargaPendiente(): Pendiente {
  const pendiente: Pendiente = { resolver: () => undefined, rechazar: () => undefined };
  cargarSimulado.mockImplementation(
    () =>
      new Promise<ConfiguracionPublica>((resolve, reject) => {
        pendiente.resolver = resolve;
        pendiente.rechazar = reject;
      }),
  );
  return pendiente;
}

beforeEach(() => {
  cargarSimulado.mockReset();
});

espiarConsola(() => Promise.resolve(), true);

describe('useCargaConfiguracion', () => {
  it('empieza en false, pide la carga una sola vez con el tiempo máximo y queda lista al resolver', async () => {
    const carga = cargaPendiente();
    const { result, rerender } = await renderHook(() => useCargaConfiguracion());

    expect(result.current).toBe(false);
    expect(cargarSimulado).toHaveBeenCalledTimes(1);
    expect(cargarSimulado).toHaveBeenCalledWith(TIEMPO_MAXIMO_CARGA_MS);

    await rerender({});
    expect(cargarSimulado).toHaveBeenCalledTimes(1);

    await act(async () => {
      carga.resolver(RESPALDO_CONFIGURACION);
    });
    expect(result.current).toBe(true);
  });

  it('queda lista aunque la carga rechace: la app nunca se queda en la pantalla de carga', async () => {
    const carga = cargaPendiente();
    const { result } = await renderHook(() => useCargaConfiguracion(50));

    expect(cargarSimulado).toHaveBeenCalledWith(50);
    await act(async () => {
      carga.rechazar(new Error('falla inesperada'));
    });
    expect(result.current).toBe(true);
  });

  it('si la raíz se desmonta antes de que termine la carga no cambia nada al llegar', async () => {
    const carga = cargaPendiente();
    const { result, unmount } = await renderHook(() => useCargaConfiguracion());

    await unmount();
    await act(async () => {
      carga.resolver(RESPALDO_CONFIGURACION);
    });

    expect(result.current).toBe(false);
    expect(cargarSimulado).toHaveBeenCalledTimes(1);
  });
});
