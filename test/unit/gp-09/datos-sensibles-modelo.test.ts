/// <reference types="jest" />

import {
  autorizarDatosSensibles,
  esTextoCambiado,
  normalizarEstadoDatosSensibles,
  normalizarTextoDatosSensibles,
  obtenerEstadoDatosSensibles,
  obtenerTextoDatosSensibles,
  parrafosDe,
  retirarDatosSensibles,
} from '@/features/auth/models/datosSensibles';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';

import {
  HASH_SENSIBLES,
  PARRAFO_1,
  PARRAFO_2,
  RUTA_RETIRAR_SENSIBLES,
  RUTA_SENSIBLES,
  RUTA_TEXTO_SENSIBLES,
  TEXTO_SENSIBLES,
  respuestaAutorizada,
  respuestaEstadoSensibles,
  respuestaRetirada,
  respuestaTextoSensibles,
  textoCambio400,
} from '../../helpers/datosSensibles';
import { llamadasA, respuesta, servidorConRutas } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';

/**
 * GP-09, base de los bloques B y C: modelo de la autorización de datos sensibles (alergias). Texto
 * público con versión y hash, estado de la titular, autorizar con la versión y el hash leídos, y
 * retirar. fetch simulado en http://api.test con datos ficticios.
 */

const simular = servidorConRutas({});

beforeEach(async () => {
  await sembrarSesion({ id: 'clienta-salud-1', nombre: 'Clienta Salud', email: 'salud@ejemplo.test', rol: 'cliente' });
});

describe('normalizarTextoDatosSensibles', () => {
  it('se queda con la versión, el hash y el texto tal cual', () => {
    expect(normalizarTextoDatosSensibles({ version: ' 1.0 ', hash: HASH_SENSIBLES, texto: TEXTO_SENSIBLES })).toEqual({
      version: '1.0',
      hash: HASH_SENSIBLES,
      texto: TEXTO_SENSIBLES,
    });
  });

  it.each([
    ['sin versión', { version: '' }],
    ['versión con espacios', { version: '1 0' }],
    ['hash corto', { hash: 'abc' }],
    ['texto vacío', { texto: '   ' }],
    ['texto que no es texto', { texto: 12 }],
  ])('no sirve %s', (_caso, cambios) => {
    expect(normalizarTextoDatosSensibles({ version: '1.0', hash: HASH_SENSIBLES, texto: TEXTO_SENSIBLES, ...cambios })).toBeNull();
  });

  it('no sirve lo que no es un objeto', () => {
    expect(normalizarTextoDatosSensibles(null)).toBeNull();
  });
});

describe('normalizarEstadoDatosSensibles', () => {
  it('solo cuenta como autorizado un true exacto', () => {
    expect(normalizarEstadoDatosSensibles({ autorizado: true, pendiente: true, desde: '2026-10-20T15:00:00.000Z' })).toEqual({
      autorizado: true,
      pendiente: false,
      desde: '2026-10-20T15:00:00.000Z',
    });
    expect(normalizarEstadoDatosSensibles({ autorizado: 'true', pendiente: true, desde: 'x' })).toEqual({
      autorizado: false,
      pendiente: true,
      desde: null,
    });
  });

  it('sin datos no inventa nada', () => {
    expect(normalizarEstadoDatosSensibles({})).toEqual({ autorizado: false, pendiente: false, desde: null });
    expect(normalizarEstadoDatosSensibles({ autorizado: true })).toEqual({ autorizado: true, pendiente: false, desde: null });
    expect(normalizarEstadoDatosSensibles([])).toBeNull();
  });
});

describe('parrafosDe', () => {
  it('separa por línea en blanco y quita los vacíos', () => {
    expect(parrafosDe(`${PARRAFO_1}\r\n\r\n${PARRAFO_2}\n\n  \n\n`)).toEqual([PARRAFO_1, PARRAFO_2]);
  });
});

describe('llamadas', () => {
  it('pide el texto sin sesión', async () => {
    const llamadas = simular({ [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles() });

    expect(await obtenerTextoDatosSensibles()).toEqual({ version: '1.0', hash: HASH_SENSIBLES, texto: TEXTO_SENSIBLES });
    expect(llamadasA(llamadas, 'GET', RUTA_TEXTO_SENSIBLES)[0].cabeceras.Authorization).toBeUndefined();
  });

  it('un texto ilegible es un error del servidor', async () => {
    simular({ [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles({ hash: 'x' }) });

    await expect(obtenerTextoDatosSensibles()).rejects.toBeInstanceOf(ApiError);
  });

  it('pide el estado con la sesión', async () => {
    const llamadas = simular({ [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(false, true) });

    expect(await obtenerEstadoDatosSensibles()).toEqual({ autorizado: false, pendiente: true, desde: null });
    expect(llamadasA(llamadas, 'GET', RUTA_SENSIBLES)[0].cabeceras.Authorization).toMatch(/^Bearer /);
  });

  it('un estado ilegible es un error del servidor', async () => {
    simular({ [`GET ${RUTA_SENSIBLES}`]: () => respuesta({ success: true, data: 'si' }) });

    await expect(obtenerEstadoDatosSensibles()).rejects.toBeInstanceOf(ApiError);
  });

  it('autoriza con la versión, el hash y la ruta de origen', async () => {
    const llamadas = simular({ [`POST ${RUTA_SENSIBLES}`]: () => respuestaAutorizada() });

    await autorizarDatosSensibles({ version: '1.0', hash: HASH_SENSIBLES }, '/mis-datos');

    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)[0].cuerpo).toEqual({
      version: '1.0',
      hash: HASH_SENSIBLES,
      rutaOrigen: '/mis-datos',
    });
  });

  it('el 400 del texto cambiado se reconoce por su code TEXTO_DATOS_SENSIBLES_NO_VIGENTE (Ronda 9)', async () => {
    simular({ [`POST ${RUTA_SENSIBLES}`]: () => textoCambio400() });

    const error = await autorizarDatosSensibles({ version: '0.9', hash: HASH_SENSIBLES }, '/inicio').catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 400, code: 'TEXTO_DATOS_SENSIBLES_NO_VIGENTE' });
    expect(esTextoCambiado(error)).toBe(true);
    expect(esTextoCambiado(new ApiError(429, 'x'))).toBe(false);
    expect(esTextoCambiado(new ErrorDeRed())).toBe(false);
  });

  it('un 400 sin code (backend anterior) también es el texto cambiado; uno con otro code no', () => {
    expect(esTextoCambiado(new ApiError(400, 'x'))).toBe(true);
    expect(esTextoCambiado(new ApiError(400, 'x', 'CONSENTIMIENTO_SALUD_REQUERIDO'))).toBe(false);
  });

  it('retira con la ruta de origen', async () => {
    const llamadas = simular({ [`POST ${RUTA_RETIRAR_SENSIBLES}`]: () => respuestaRetirada() });

    await retirarDatosSensibles('/mis-datos');

    expect(llamadasA(llamadas, 'POST', RUTA_RETIRAR_SENSIBLES)[0].cuerpo).toEqual({ rutaOrigen: '/mis-datos' });
  });
});
