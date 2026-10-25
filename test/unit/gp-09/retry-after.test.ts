/// <reference types="jest" />

import { ApiError, apiPost, crearErrorApi, leerRetryAfter } from '@/shared/api/apiClient';

import { limite429, respuestaCon, servidorEnOrden } from '../../helpers/limitesRed';

/**
 * GP-09, bloque A1: ApiError.retryAfter en segundos (entero de 1 o más). Sale de `retryAfter` del
 * cuerpo y, si no viene o no sirve, del encabezado Retry-After (segundos o fecha HTTP). Los valores
 * inválidos se ignoran. fetch simulado en http://api.test; nada sale a la red.
 */

const AHORA = Date.UTC(2026, 9, 25, 18, 0, 0);

async function errorDe(promesa: Promise<unknown>): Promise<ApiError> {
  try {
    await promesa;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('Se esperaba que la petición fallara.');
}

describe('leerRetryAfter: el cuerpo primero', () => {
  it.each<[string, unknown, number]>([
    ['un número entero', { retryAfter: 30 }, 30],
    ['un texto de dígitos', { retryAfter: ' 45 ' }, 45],
    ['decimales: redondea hacia arriba', { retryAfter: 2.2 }, 3],
    ['menos de un segundo: queda en 1', { retryAfter: 0.4 }, 1],
  ])('%s', (_caso, cuerpo, esperado) => {
    expect(leerRetryAfter(cuerpo, null, AHORA)).toBe(esperado);
  });

  it('el cuerpo gana al encabezado', () => {
    expect(leerRetryAfter({ retryAfter: 5 }, '90', AHORA)).toBe(5);
  });

  it.each<[string, unknown]>([
    ['cero', { retryAfter: 0 }],
    ['negativo', { retryAfter: -10 }],
    ['NaN', { retryAfter: Number.NaN }],
    ['infinito', { retryAfter: Number.POSITIVE_INFINITY }],
    ['un texto que no son dígitos', { retryAfter: '10s' }],
    ['un texto con signo', { retryAfter: '-5' }],
    ['un booleano', { retryAfter: true }],
    ['null', { retryAfter: null }],
    ['sin el campo', { message: 'x' }],
    ['un cuerpo de texto', 'Too Many Requests'],
    ['un cuerpo vacío', null],
  ])('cuerpo inválido (%s): usa el encabezado', (_caso, cuerpo) => {
    expect(leerRetryAfter(cuerpo, '12', AHORA)).toBe(12);
    expect(leerRetryAfter(cuerpo, null, AHORA)).toBeUndefined();
  });
});

describe('leerRetryAfter: el encabezado Retry-After', () => {
  it('en segundos', () => {
    expect(leerRetryAfter(null, '120', AHORA)).toBe(120);
    expect(leerRetryAfter(null, ' 7 ', AHORA)).toBe(7);
  });

  it('como fecha HTTP futura: los segundos que faltan, redondeados hacia arriba', () => {
    expect(leerRetryAfter(null, 'Sun, 25 Oct 2026 18:00:30 GMT', AHORA)).toBe(30);
    expect(leerRetryAfter(null, 'Sun, 25 Oct 2026 18:01:00 GMT', AHORA + 500)).toBe(60);
  });

  it.each<[string, string | null | undefined]>([
    ['cero', '0'],
    ['negativo', '-5'],
    ['decimales', '1.5'],
    ['vacío', ''],
    ['solo espacios', '   '],
    ['texto que no es fecha', 'pronto'],
    ['una fecha que ya pasó', 'Sun, 25 Oct 2026 17:59:00 GMT'],
    ['la misma fecha de ahora', 'Sun, 25 Oct 2026 18:00:00 GMT'],
    ['null', null],
    ['undefined', undefined],
  ])('inválido (%s): se ignora', (_caso, encabezado) => {
    expect(leerRetryAfter(null, encabezado, AHORA)).toBeUndefined();
  });

  it('sin `ahora` usa el reloj del teléfono', () => {
    const enUnMinuto = new Date(Date.now() + 60_000).toUTCString();
    expect(leerRetryAfter(null, enUnMinuto)).toBeGreaterThanOrEqual(59);
  });
});

describe('crearErrorApi: retryAfter solo en un 429 o un 503', () => {
  it('429 y 503 lo llevan; los demás no, aunque lo manden', () => {
    expect(crearErrorApi({ tipo: 'respuesta', status: 429, cuerpo: { retryAfter: 10 } }).retryAfter).toBe(10);
    expect(crearErrorApi({ tipo: 'respuesta', status: 503, cuerpo: null, retryAfter: '4' }).retryAfter).toBe(4);
    expect(crearErrorApi({ tipo: 'respuesta', status: 400, cuerpo: { retryAfter: 10 } }).retryAfter).toBeUndefined();
    expect(crearErrorApi({ tipo: 'respuesta', status: 500, cuerpo: null, retryAfter: '4' }).retryAfter).toBeUndefined();
  });

  it('un 429 sin datos de espera queda sin retryAfter', () => {
    expect(crearErrorApi({ tipo: 'respuesta', status: 429, cuerpo: { message: 'x' } }).retryAfter).toBeUndefined();
  });

  it('el constructor de ApiError lo guarda tal cual (y es opcional)', () => {
    expect(new ApiError(429, 'x', 'C', undefined, 15).retryAfter).toBe(15);
    expect(new ApiError(429, 'x').retryAfter).toBeUndefined();
  });
});

describe('apiClient lee retryAfter de la respuesta real', () => {
  it('429 con cuerpo y encabezado: el del cuerpo', async () => {
    servidorEnOrden({ 'POST /api/auth/login': [limite429(42)] });

    const error = await errorDe(apiPost('/api/auth/login', { email: 'a@ejemplo.test' }, { publica: true }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, retryAfter: 42 });
  });

  it('429 solo con el encabezado Retry-After', async () => {
    servidorEnOrden({ 'POST /api/x': [respuestaCon({ message: 'Espera' }, 429, { 'Retry-After': '17' })] });

    expect(await errorDe(apiPost('/api/x', undefined, { publica: true }))).toMatchObject({ status: 429, retryAfter: 17 });
  });

  it('429 con el encabezado como fecha HTTP', async () => {
    const enDiezSegundos = new Date(Date.now() + 10_000).toUTCString();
    servidorEnOrden({ 'POST /api/x': [respuestaCon({ message: 'Espera' }, 429, { 'Retry-After': enDiezSegundos })] });

    const error = await errorDe(apiPost('/api/x', undefined, { publica: true }));

    expect(error.retryAfter).toBeGreaterThanOrEqual(9);
    expect(error.retryAfter).toBeLessThanOrEqual(10);
  });

  it('429 con datos inválidos: sin retryAfter', async () => {
    servidorEnOrden({ 'POST /api/x': [respuestaCon({ retryAfter: 'ya' }, 429, { 'Retry-After': 'luego' })] });

    expect((await errorDe(apiPost('/api/x', undefined, { publica: true }))).retryAfter).toBeUndefined();
  });

  it('una respuesta sin encabezados no rompe la lectura', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve('{"retryAfter":8}') } as unknown as Response),
    ) as unknown as typeof fetch;

    expect(await errorDe(apiPost('/api/x', undefined, { publica: true }))).toMatchObject({ status: 429, retryAfter: 8 });
  });
});
