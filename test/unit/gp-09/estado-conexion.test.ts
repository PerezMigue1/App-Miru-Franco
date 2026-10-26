/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';

import { apiGet, apiPost } from '@/shared/api/apiClient';
import {
  conexionLenta,
  ESPERA_LENTA_MS,
  registrarPeticion,
  reiniciarEstadoConexion,
  suscribirConexion,
} from '@/shared/api/estadoConexion';
import { abrirFlujoEventos } from '@/shared/api/flujoEventos';
import { subirMultipart } from '@/shared/api/subirMultipart';
import { useConexionLenta } from '@/shared/api/useConexionLenta';

import { respuestaCon, servidorEnOrden } from '../../helpers/limitesRed';

/**
 * GP-09, bloque A5: estado de conexión observable (Observer). Avisa cuando cualquier petición de
 * apiClient lleva más de 3 s sin respuesta y deja de avisar cuando ya no queda ninguna así. El flujo
 * SSE (flujoEventos.ts) y la subida de fotos (subirMultipart.ts) no cuentan. Temporizadores falsos.
 */

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri })),
}));

beforeEach(() => {
  jest.useFakeTimers();
  reiniciarEstadoConexion();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  reiniciarEstadoConexion();
});

describe('registrarPeticion', () => {
  it('a los 3 s sin respuesta la conexión está lenta y avisa una vez', () => {
    const oyente = jest.fn();
    const quitar = suscribirConexion(oyente);
    const terminar = registrarPeticion();

    jest.advanceTimersByTime(ESPERA_LENTA_MS - 1);
    expect(conexionLenta()).toBe(false);
    expect(oyente).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(conexionLenta()).toBe(true);
    expect(oyente).toHaveBeenCalledTimes(1);

    terminar();
    expect(conexionLenta()).toBe(false);
    expect(oyente).toHaveBeenCalledTimes(2);
    quitar();
  });

  it('una petición que responde antes de 3 s nunca avisa y no deja temporizadores', () => {
    const oyente = jest.fn();
    const quitar = suscribirConexion(oyente);

    registrarPeticion()();
    jest.advanceTimersByTime(10_000);

    expect(conexionLenta()).toBe(false);
    expect(oyente).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    quitar();
  });

  it('con dos lentas sigue lenta hasta que termina la última; avisa solo al empezar y al terminar', () => {
    const oyente = jest.fn();
    const quitar = suscribirConexion(oyente);
    const primera = registrarPeticion();
    const segunda = registrarPeticion();
    jest.advanceTimersByTime(ESPERA_LENTA_MS);
    expect(oyente).toHaveBeenCalledTimes(1);

    primera();
    expect(conexionLenta()).toBe(true);
    expect(oyente).toHaveBeenCalledTimes(1);

    segunda();
    expect(conexionLenta()).toBe(false);
    expect(oyente).toHaveBeenCalledTimes(2);
    quitar();
  });

  it('terminar dos veces no descuenta de más', () => {
    const primera = registrarPeticion();
    const segunda = registrarPeticion();
    jest.advanceTimersByTime(ESPERA_LENTA_MS);

    primera();
    primera();

    expect(conexionLenta()).toBe(true);
    segunda();
    expect(conexionLenta()).toBe(false);
  });

  it('un oyente que falla no impide avisar a los demás; quitarlo deja de avisarle', () => {
    const fallido = jest.fn(() => {
      throw new Error('oyente roto');
    });
    const sano = jest.fn();
    const quitarFallido = suscribirConexion(fallido);
    const quitarSano = suscribirConexion(sano);
    const terminar = registrarPeticion();

    jest.advanceTimersByTime(ESPERA_LENTA_MS);
    expect(sano).toHaveBeenCalledTimes(1);

    quitarSano();
    terminar();
    expect(sano).toHaveBeenCalledTimes(1);
    expect(fallido).toHaveBeenCalledTimes(2);
    quitarFallido();
  });
});

describe('apiClient cuenta para la conexión lenta', () => {
  it('una lectura sin respuesta en 3 s la marca lenta y su respuesta la quita', async () => {
    const control: { responder?: (respuesta: Response) => void } = {};
    globalThis.fetch = jest.fn(
      () =>
        new Promise<Response>((resolver) => {
          control.responder = resolver;
        }),
    ) as unknown as typeof fetch;

    const pedido = apiGet('/api/servicios', { publica: true });
    await jest.advanceTimersByTimeAsync(ESPERA_LENTA_MS);
    expect(conexionLenta()).toBe(true);

    control.responder?.(respuestaCon({ data: [] }));
    await expect(pedido).resolves.toEqual({ data: [] });
    expect(conexionLenta()).toBe(false);
  });

  it('el límite de 60 s también la quita (con ErrorDeRed tiempoAgotado)', async () => {
    servidorEnOrden({ 'POST /api/pedidos': ['pendiente'] });

    const pedido = apiPost('/api/pedidos', {}, { publica: true }).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(ESPERA_LENTA_MS);
    expect(conexionLenta()).toBe(true);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(await pedido).toMatchObject({ name: 'ErrorDeRed', motivo: 'tiempoAgotado' });
    expect(conexionLenta()).toBe(false);
  });

  it('sin red también la quita', async () => {
    const control: { rechazar?: (error: Error) => void } = {};
    globalThis.fetch = jest.fn(
      () =>
        new Promise<Response>((_resolver, rechazo) => {
          control.rechazar = rechazo;
        }),
    ) as unknown as typeof fetch;

    const pedido = apiGet('/api/servicios', { publica: true }).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(ESPERA_LENTA_MS);
    expect(conexionLenta()).toBe(true);
    control.rechazar?.(new TypeError('Network request failed'));

    expect(await pedido).toMatchObject({ name: 'ErrorDeRed', motivo: 'sinRed' });
    expect(conexionLenta()).toBe(false);
  });
});

describe('lo que no cuenta', () => {
  it('el flujo SSE abierto (flujoEventos) no marca la conexión lenta', async () => {
    const controlador = new AbortController();
    const flujo = abrirFlujoEventos('/api/notificaciones/stream', 'token-ficticio', controlador.signal).catch(() => null);

    await jest.advanceTimersByTimeAsync(ESPERA_LENTA_MS * 10);
    expect(conexionLenta()).toBe(false);

    controlador.abort();
    await flujo;
  });

  it('la subida de una foto (subirMultipart) no marca la conexión lenta', async () => {
    const control: { responder?: (respuesta: Response) => void } = {};
    globalThis.fetch = jest.fn(
      () =>
        new Promise<Response>((resolver) => {
          control.responder = resolver;
        }),
    ) as unknown as typeof fetch;

    const subida = subirMultipart('https://subidas.ejemplo.test/subir', 'file:///foto.jpg', { firma: 'ficticia' });
    await jest.advanceTimersByTimeAsync(ESPERA_LENTA_MS * 5);
    expect(conexionLenta()).toBe(false);

    control.responder?.(respuestaCon({ secure_url: 'https://fotos.ejemplo.test/foto.jpg' }));
    await expect(subida).resolves.toEqual({ secure_url: 'https://fotos.ejemplo.test/foto.jpg' });
  });
});

describe('useConexionLenta', () => {
  it('sigue el estado y se vuelve a pintar al cambiar', async () => {
    const { result, unmount } = await renderHook(() => useConexionLenta());
    expect(result.current).toBe(false);

    let terminar: () => void = () => undefined;
    await act(async () => {
      terminar = registrarPeticion();
      await jest.advanceTimersByTimeAsync(ESPERA_LENTA_MS);
    });
    expect(result.current).toBe(true);

    await act(async () => {
      terminar();
    });
    expect(result.current).toBe(false);
    await unmount();
  });
});
