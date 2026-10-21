/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import {
  estadoConfiguracion,
  refrescar,
  reiniciarConfiguracionPublica,
  RESPALDO_CONFIGURACION,
  VIGENCIA_CONFIGURACION_MS,
} from '@/shared/api/configuracionPublica';
import { useConfiguracionPublica } from '@/shared/api/useConfiguracionPublica';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { CONFIGURACION_COMPLETA, rutaConfiguracion, RUTA_CONFIGURACION } from '../../helpers/configuracionFicticia';
import { espiarConsola } from '../../helpers/consola';
import { servidorConRutas, type Llamada } from '../../helpers/servidorSimulado';

/**
 * GP-07.1: hook useConfiguracionPublica (src/shared/api/useConfiguracionPublica.ts). Se vuelve a
 * pintar cuando el repositorio recibe una versión nueva y, al volver la app a primer plano, refresca
 * solo si la caché venció. AppState se espía para disparar el cambio a mano; fetch y
 * expo-file-system van simulados.
 */

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

const simularServidor = servidorConRutas({});
const AHORA = new Date('2026-10-21T10:00:00-06:00').getTime();

type OyenteAppState = (estado: AppStateStatus) => void;

let espiaAppState: jest.SpyInstance;
let quitarOyente: jest.Mock;
let estadoOriginal: AppStateStatus;

/** El último oyente de 'change' que registró el hook. */
function oyenteAppState(): OyenteAppState {
  const llamada = espiaAppState.mock.calls.filter(([evento]) => evento === 'change').at(-1);
  if (!llamada) {
    throw new Error('El hook no registró un oyente de AppState.');
  }
  return llamada[1] as OyenteAppState;
}

/** Avisa al hook de una serie de cambios de AppState. */
async function cambiarAppState(...estados: AppStateStatus[]): Promise<void> {
  for (const estado of estados) {
    await act(async () => {
      oyenteAppState()(estado);
    });
  }
}

const peticiones = (llamadas: Llamada[]) => llamadas.filter((l) => l.ruta === RUTA_CONFIGURACION);

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
  estadoOriginal = AppState.currentState;
  AppState.currentState = 'active';
  quitarOyente = jest.fn();
  espiaAppState = jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: quitarOyente }));
});

afterEach(() => {
  espiaAppState.mockRestore();
  AppState.currentState = estadoOriginal;
  jest.useRealTimers();
});

espiarConsola(() => Promise.resolve(), true);

describe('useConfiguracionPublica', () => {
  it('empieza con lo que hay en memoria y se vuelve a pintar cuando llega la red', async () => {
    simularServidor(rutaConfiguracion());
    const { result, unmount } = await renderHook(() => useConfiguracionPublica());

    expect(result.current.configuracion).toBe(RESPALDO_CONFIGURACION);
    expect(result.current.origen).toBe('respaldo');

    await act(async () => {
      await result.current.refrescar();
    });

    expect(result.current.configuracion).toEqual(CONFIGURACION_COMPLETA);
    expect(result.current.origen).toBe('red');
    expect(result.current.refrescar).toBe(refrescar);
    await unmount();
  });

  it('al volver a primer plano con la caché vencida, refresca una vez', async () => {
    const llamadas = simularServidor(rutaConfiguracion());
    const { result, unmount } = await renderHook(() => useConfiguracionPublica());

    await cambiarAppState('background', 'active');

    expect(peticiones(llamadas)).toHaveLength(1);
    expect(result.current.origen).toBe('red');
    await unmount();
  });

  it('al volver a primer plano con la caché vigente, no pide nada; cuando vence, sí', async () => {
    jest.useFakeTimers({ now: AHORA });
    const llamadas = simularServidor(rutaConfiguracion());
    await refrescar();
    const { unmount } = await renderHook(() => useConfiguracionPublica());

    await cambiarAppState('background', 'active');
    expect(peticiones(llamadas)).toHaveLength(1);

    jest.setSystemTime(AHORA + VIGENCIA_CONFIGURACION_MS);
    await cambiarAppState('inactive', 'active');
    expect(peticiones(llamadas)).toHaveLength(2);
    expect(estadoConfiguracion().leidoEn).toBe(AHORA + VIGENCIA_CONFIGURACION_MS);
    await unmount();
  });

  it('un aviso de "active" sin haber salido antes no cuenta como volver', async () => {
    const llamadas = simularServidor(rutaConfiguracion());
    const { unmount } = await renderHook(() => useConfiguracionPublica());

    await cambiarAppState('active', 'background');

    expect(peticiones(llamadas)).toHaveLength(0);
    await unmount();
  });

  it('si la app abre en segundo plano, el primer "active" ya cuenta como volver', async () => {
    AppState.currentState = 'background';
    const llamadas = simularServidor(rutaConfiguracion());
    const { unmount } = await renderHook(() => useConfiguracionPublica());

    await cambiarAppState('active');

    expect(peticiones(llamadas)).toHaveLength(1);
    await unmount();
  });

  it('al desmontar quita su oyente de AppState', async () => {
    const { unmount } = await renderHook(() => useConfiguracionPublica());
    expect(espiaAppState).toHaveBeenCalledWith('change', expect.any(Function));
    expect(quitarOyente).not.toHaveBeenCalled();

    await unmount();

    expect(quitarOyente).toHaveBeenCalledTimes(1);
  });
});
