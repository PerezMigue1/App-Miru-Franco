/// <reference types="jest" />

import {
  ApiError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  esperarRenovacionEnCurso,
  esperaTrasSaturacion,
} from '@/shared/api/apiClient';
import { mensajeParaClienta, mensajeSinContexto } from '@/shared/api/mensajesError';
import { borrarSesion, generacionActual } from '@/shared/api/tokenStorage';

import { MENSAJE_SATURACION, respuestaCon, saturacion503, servidorEnOrden, vecesA } from '../../helpers/limitesRed';
import { guardarEnAlmacen, QUINCE_MINUTOS_MS, sesionFicticia } from '../../helpers/sesionLimites';

/**
 * GP-09, bloque A4: un 503 por saturación. En una lectura (GET) se repite una sola vez tras su
 * retryAfter (tope de 10 s; 2 s si no viene), respetando la generación de la sesión y el vuelo único
 * de renovación. En una escritura nunca se repite. En los dos casos la clienta lee el message del
 * backend. Temporizadores falsos; fetch simulado en http://api.test.
 */

const RUTA = '/api/servicios';
const RUTA_RENOVAR = '/api/auth/movil/renovar';
const OK = respuestaCon({ success: true, data: [] });

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(async () => {
  await esperarRenovacionEnCurso();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('esperaTrasSaturacion', () => {
  it.each<[number | undefined, number]>([
    [undefined, 2000],
    [1, 1000],
    [3, 3000],
    [10, 10_000],
    [45, 10_000],
  ])('retryAfter %p espera %i ms', (retryAfter, ms) => {
    expect(esperaTrasSaturacion(retryAfter)).toBe(ms);
  });
});

describe('503 en una lectura: un solo reintento', () => {
  it('espera el retryAfter antes de repetir y entrega la respuesta del reintento', async () => {
    const llamadas = servidorEnOrden({ [`GET ${RUTA}`]: [saturacion503(3), OK] });

    const pedido = apiGet(RUTA, { publica: true });
    await jest.advanceTimersByTimeAsync(2999);
    expect(vecesA(llamadas, 'GET', RUTA)).toBe(1);

    await jest.advanceTimersByTimeAsync(1);
    await expect(pedido).resolves.toEqual({ success: true, data: [] });
    expect(vecesA(llamadas, 'GET', RUTA)).toBe(2);
  });

  it('sin retryAfter espera 2 s', async () => {
    const llamadas = servidorEnOrden({ [`GET ${RUTA}`]: [saturacion503(null), OK] });

    const pedido = apiGet(RUTA, { publica: true });
    await jest.advanceTimersByTimeAsync(1999);
    expect(vecesA(llamadas, 'GET', RUTA)).toBe(1);
    await jest.advanceTimersByTimeAsync(1);

    await expect(pedido).resolves.toEqual({ success: true, data: [] });
  });

  it('un retryAfter de 60 s se queda en el tope de 10 s', async () => {
    const llamadas = servidorEnOrden({ [`GET ${RUTA}`]: [saturacion503(60), OK] });

    const pedido = apiGet(RUTA, { publica: true });
    await jest.advanceTimersByTimeAsync(9999);
    expect(vecesA(llamadas, 'GET', RUTA)).toBe(1);
    await jest.advanceTimersByTimeAsync(1);

    await expect(pedido).resolves.toEqual({ success: true, data: [] });
    expect(vecesA(llamadas, 'GET', RUTA)).toBe(2);
  });

  it('si el reintento también es 503, falla con ese error y no hay un tercer intento', async () => {
    const llamadas = servidorEnOrden({ [`GET ${RUTA}`]: [saturacion503(1)] });

    const pedido = apiGet(RUTA, { publica: true }).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(30_000);
    const error = await pedido;

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, retryAfter: 1 });
    expect(vecesA(llamadas, 'GET', RUTA)).toBe(2);
  });

  it('otro error de servidor (500) no se repite', async () => {
    const llamadas = servidorEnOrden({ [`GET ${RUTA}`]: [respuestaCon({ message: 'Error' }, 500), OK] });

    const pedido = apiGet(RUTA, { publica: true }).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await pedido).toMatchObject({ status: 500 });
    expect(vecesA(llamadas, 'GET', RUTA)).toBe(1);
  });

  it('un error de red no se repite por esta vía', async () => {
    const llamadas = servidorEnOrden({ [`GET ${RUTA}`]: ['sinRed', OK] });

    const pedido = apiGet(RUTA, { publica: true }).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await pedido).toMatchObject({ name: 'ErrorDeRed', motivo: 'sinRed' });
    expect(vecesA(llamadas, 'GET', RUTA)).toBe(1);
  });

  it('con un token explícito también se repite una vez', async () => {
    const llamadas = servidorEnOrden({ 'GET /api/auth/me': [saturacion503(1), respuestaCon({ id: 1 })] });

    const pedido = apiGet('/api/auth/me', { token: 'token-ficticio-explicito' });
    await jest.advanceTimersByTimeAsync(1000);

    await expect(pedido).resolves.toEqual({ id: 1 });
    expect(vecesA(llamadas, 'GET', '/api/auth/me')).toBe(2);
  });
});

describe('503 en una escritura: nunca se repite', () => {
  it.each<[string, () => Promise<unknown>, string]>([
    ['POST', () => apiPost('/api/pedidos', { a: 1 }, { publica: true }), 'POST'],
    ['PUT', () => apiPut('/api/pedidos', { a: 1 }, { publica: true }), 'PUT'],
    ['PATCH', () => apiPatch('/api/pedidos', { a: 1 }, { publica: true }), 'PATCH'],
    ['DELETE', () => apiDelete('/api/pedidos', { publica: true }), 'DELETE'],
  ])('%s: una sola llamada y el error del 503', async (_caso, llamar, metodo) => {
    const llamadas = servidorEnOrden({ [`${metodo} /api/pedidos`]: [saturacion503(1), OK] });

    const pedido = llamar().catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(30_000);
    const error = await pedido;

    expect(error).toMatchObject({ status: 503 });
    expect(vecesA(llamadas, metodo, '/api/pedidos')).toBe(1);
    expect(mensajeParaClienta(error)).toBe(MENSAJE_SATURACION);
  });
});

describe('503 con sesión', () => {
  it('si la sesión cambió durante la espera no se repite: la petición era de la sesión anterior', async () => {
    await guardarEnAlmacen(sesionFicticia({ clasica: true }));
    const llamadas = servidorEnOrden({ 'GET /api/citas': [saturacion503(3), OK] });

    const pedido = apiGet('/api/citas').catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(0);
    const generacion = generacionActual();
    await borrarSesion();
    expect(generacionActual()).not.toBe(generacion);
    await jest.advanceTimersByTimeAsync(3000);

    expect(await pedido).toMatchObject({ status: 503 });
    expect(vecesA(llamadas, 'GET', '/api/citas')).toBe(1);
  });

  it('con la misma sesión se repite con el token guardado', async () => {
    const sesion = sesionFicticia({ clasica: true });
    await guardarEnAlmacen(sesion);
    const llamadas = servidorEnOrden({ 'GET /api/citas': [saturacion503(2), respuestaCon({ data: [1] })] });

    const pedido = apiGet('/api/citas');
    await jest.advanceTimersByTimeAsync(2000);

    await expect(pedido).resolves.toEqual({ data: [1] });
    const enviadas = llamadas.filter((llamada) => llamada.ruta === '/api/citas');
    expect(enviadas.map((llamada) => llamada.cabeceras.Authorization)).toEqual([
      `Bearer ${sesion.token}`,
      `Bearer ${sesion.token}`,
    ]);
  });

  it('dos lecturas que se repiten cuando el acceso ya está por vencer comparten una sola renovación', async () => {
    // Al salir, al acceso le falta 1.5 s para entrar al margen de renovación (60 s): las dos lecturas
    // salen con el token actual. Tras la espera de 3 s ya está por vencer y los dos reintentos piden
    // renovar a la vez: sale una sola renovación y ambos usan el acceso nuevo.
    const sesion = sesionFicticia({ emitidoEn: Date.now() - QUINCE_MINUTOS_MS + 60_000 + 1500 });
    await guardarEnAlmacen(sesion);
    const llamadas = servidorEnOrden({
      'GET /api/citas': [saturacion503(3), respuestaCon({ data: ['cita'] })],
      'GET /api/pedidos': [saturacion503(3), respuestaCon({ data: ['pedido'] })],
      [`POST ${RUTA_RENOVAR}`]: [respuestaCon({ token: 'token-ficticio-renovado', refreshToken: 'refresh-ficticio-renovado' })],
    });

    const citas = apiGet('/api/citas');
    const pedidos = apiGet('/api/pedidos');
    await jest.advanceTimersByTimeAsync(3000);

    await expect(Promise.all([citas, pedidos])).resolves.toEqual([{ data: ['cita'] }, { data: ['pedido'] }]);
    expect(vecesA(llamadas, 'POST', RUTA_RENOVAR)).toBe(1);
    const lecturas = llamadas.filter((llamada) => llamada.ruta !== RUTA_RENOVAR);
    expect(lecturas.map((llamada) => llamada.cabeceras.Authorization)).toEqual([
      `Bearer ${sesion.token}`,
      `Bearer ${sesion.token}`,
      'Bearer token-ficticio-renovado',
      'Bearer token-ficticio-renovado',
    ]);
  });
});

describe('el message del 503 de saturación llega a la clienta', () => {
  it('mensajeParaClienta y mensajeSinContexto muestran el message del backend', async () => {
    servidorEnOrden({ [`GET ${RUTA}`]: [saturacion503(1)] });

    const pedido = apiGet(RUTA, { publica: true }).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(1000);
    const error = await pedido;

    expect(mensajeParaClienta(error, { respaldo: 'No pudimos cargar los servicios.' })).toBe(MENSAJE_SATURACION);
    expect(mensajeSinContexto(error)).toBe(MENSAJE_SATURACION);
  });

  it('un 503 sin Retry-After (no es de saturación) sigue con el texto de la app', async () => {
    servidorEnOrden({ 'POST /api/x': [respuestaCon({ message: 'Mercado Pago no está configurado' }, 503)] });

    const error = await apiPost('/api/x', undefined, { publica: true }).catch((e: unknown) => e);

    expect(mensajeParaClienta(error, { respaldo: 'No pudimos abrir el pago.' })).toBe('No pudimos abrir el pago.');
    expect(mensajeSinContexto(error)).toBeNull();
  });
});
