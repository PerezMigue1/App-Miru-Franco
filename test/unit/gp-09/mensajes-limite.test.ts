/// <reference types="jest" />

import { ApiError, ErrorDeRed, mensajeGenerico } from '@/shared/api/apiClient';
import {
  CODIGO_BLOQUEO_TEMPORAL,
  ESPERA_LIMITE_S,
  mensajeDelLimite,
  mensajeParaClienta,
  mensajeSinContexto,
  segundosDeLimite,
  textoDelServidor,
  tipoDeError,
} from '@/shared/api/mensajesError';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { MENSAJE_BLOQUEO, MENSAJE_LIMITE, MENSAJE_SATURACION } from '../../helpers/limitesRed';

/**
 * GP-09, bloque A: mensajesError con los límites. El message de un 429 o un 503 que dice cuánto
 * esperar (o el 429 BLOQUEO_TEMPORAL) ya viene en español para la clienta y se muestra tal cual; un
 * texto técnico o sin message cae al texto de la app. Solo el 429 deja la acción en espera.
 */

const TECNICO = 'ThrottlerException: Too Many Requests';
const conEspera = (status: number, message: string, retryAfter = 20, code?: string) =>
  new ApiError(status, message, code, undefined, retryAfter);

describe('textoDelServidor', () => {
  it('devuelve el message recortado', () => {
    expect(textoDelServidor(new ApiError(409, '  Ya no hay suficientes piezas de Fluido (250 ml)  '))).toBe(
      'Ya no hay suficientes piezas de Fluido (250 ml)',
    );
  });

  it.each<[string, unknown]>([
    ['vacío', new ApiError(429, '   ')],
    ['el genérico de apiClient', new ApiError(503, mensajeGenerico(503))],
    ['técnico (ThrottlerException)', new ApiError(429, TECNICO)],
    ['un nombre HTTP', new ApiError(429, 'Too Many Requests')],
    ['otro nombre HTTP', new ApiError(503, 'Service Unavailable')],
    ['un nombre HTTP de conflicto', new ApiError(409, 'Conflict')],
    ['un ErrorDeRed', new ErrorDeRed()],
    ['un Error común', new Error('x')],
    ['undefined', undefined],
  ])('null si es %s', (_caso, error) => {
    expect(textoDelServidor(error)).toBeNull();
  });
});

describe('mensajeDelLimite', () => {
  it.each<[string, unknown, string]>([
    ['429 con retryAfter', conEspera(429, MENSAJE_LIMITE), MENSAJE_LIMITE],
    ['503 con retryAfter', conEspera(503, MENSAJE_SATURACION), MENSAJE_SATURACION],
    ['429 BLOQUEO_TEMPORAL sin retryAfter', new ApiError(429, MENSAJE_BLOQUEO, CODIGO_BLOQUEO_TEMPORAL), MENSAJE_BLOQUEO],
  ])('%s: el message del backend', (_caso, error, esperado) => {
    expect(mensajeDelLimite(error)).toBe(esperado);
  });

  it.each<[string, unknown]>([
    ['429 sin retryAfter ni code (ThrottlerException de antes)', new ApiError(429, TECNICO)],
    ['429 con retryAfter pero texto técnico', conEspera(429, TECNICO)],
    ['503 sin retryAfter (no es de saturación)', new ApiError(503, 'Mercado Pago no respondió')],
    ['400 con retryAfter', conEspera(400, 'x')],
    ['409', new ApiError(409, 'Ya no hay piezas')],
    ['sin red', new ErrorDeRed()],
  ])('%s: null', (_caso, error) => {
    expect(mensajeDelLimite(error)).toBeNull();
  });
});

describe('mensajeParaClienta y mensajeSinContexto con un límite', () => {
  it('el message del límite gana al code de la feature y al respaldo', () => {
    const error = conEspera(429, MENSAJE_LIMITE, 30, 'DEMASIADOS_CODIGOS');

    expect(mensajeParaClienta(error, { respaldo: 'No pudimos.', porCode: { DEMASIADOS_CODIGOS: 'Propio' } })).toBe(MENSAJE_LIMITE);
    expect(mensajeSinContexto(error, { DEMASIADOS_CODIGOS: 'Propio' })).toBe(MENSAJE_LIMITE);
  });

  it('un 503 de saturación con referencia agrega la frase para compartirla', () => {
    const error = new ApiError(503, MENSAJE_SATURACION, undefined, 'ABCDEF12', 5);

    expect(mensajeParaClienta(error)).toBe(`${MENSAJE_SATURACION} Si se repite, comparte con el salón esta referencia: ABCDEF12.`);
  });

  it('un 429 técnico sigue con el texto de la app (nunca el técnico)', () => {
    const error = new ApiError(429, TECNICO);

    expect(mensajeParaClienta(error)).toBe(RESPALDO_TEXTOS['errores.demasiadasSolicitudes']);
    expect(mensajeSinContexto(error)).toBe(RESPALDO_TEXTOS['errores.demasiadasSolicitudes']);
  });

  it('BLOQUEO_TEMPORAL nunca es sesión terminada', () => {
    const error = new ApiError(429, MENSAJE_BLOQUEO, CODIGO_BLOQUEO_TEMPORAL, undefined, 300);

    expect(tipoDeError(error)).toBe('demasiadasSolicitudes');
    expect(mensajeParaClienta(error)).not.toBe(RESPALDO_TEXTOS['errores.sesionTerminada']);
  });
});

describe('segundosDeLimite', () => {
  it.each<[string, unknown, number | null]>([
    ['429 con retryAfter', conEspera(429, MENSAJE_LIMITE, 42), 42],
    ['429 sin retryAfter', new ApiError(429, TECNICO), ESPERA_LIMITE_S],
    ['503 (solo texto, sin espera)', conEspera(503, MENSAJE_SATURACION, 5), null],
    ['400', new ApiError(400, 'x'), null],
    ['sin red', new ErrorDeRed(), null],
    ['undefined', undefined, null],
  ])('%s', (_caso, error, esperado) => {
    expect(segundosDeLimite(error)).toBe(esperado);
  });
});

describe('textos nuevos del catálogo (GP-09)', () => {
  it('existen, sin guiones largos', () => {
    const nuevos = [RESPALDO_TEXTOS['red.conectando'], RESPALDO_TEXTOS['errores.esperaLimite']];

    expect(nuevos).toEqual(['Conectando con el salón…', 'Intenta de nuevo en {segundos} s']);
    expect(nuevos.join(' ')).not.toContain(String.fromCodePoint(0x2014));
  });
});
