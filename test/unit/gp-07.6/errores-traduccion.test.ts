/// <reference types="jest" />

import { ApiError, apiGet, crearErrorApi, ErrorDeRed } from '@/shared/api/apiClient';
import { cargarConfiguracion, reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import {
  esSinRespuesta,
  MENSAJE_SIN_CONEXION,
  mensajeParaClienta,
  mensajeSinContexto,
  tipoDeError,
  type TipoError,
} from '@/shared/api/mensajesError';
import { RESPALDO_TEXTOS, type ClaveTexto } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { espiarConsola } from '../../helpers/consola';
import { GUION_LARGO } from '../../helpers/reglasCodigo';
import { respuesta, servidorConRutas } from '../../helpers/servidorSimulado';
import { rutaConTextos } from '../../helpers/textosFicticios';

/**
 * GP-07.6, traducción única de errores a texto para la clienta (src/shared/api/mensajesError.ts) y
 * la clasificación de apiClient que la alimenta (tiempo agotado y referencia de un 5xx). Ningún texto
 * del servidor (el message de un ApiError) llega al resultado. Solo fetch y expo-file-system van
 * simulados; la API es http://api.test.
 */

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

const simularServidor = servidorConRutas({});
const texto = (clave: ClaveTexto) => RESPALDO_TEXTOS[clave];
const RESPALDO = 'No pudimos hacer esto. Intenta de nuevo.';
/** Textos del servidor que nunca deben verse: técnicos, en inglés o con detalles internos. */
const TECNICO = 'PrismaClientKnownRequestError: Invalid `prisma.cita.update()` invocation';
const EN_INGLES = 'Internal Server Error: something went wrong';
const REFERENCIA = '1A2B3C4D';

const conReferencia = (base: string) => `${base} ${texto('errores.referencia').replace('{referencia}', REFERENCIA)}`;

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
});

afterEach(() => {
  jest.useRealTimers();
});

espiarConsola(() => Promise.resolve(), true);

describe('tipoDeError', () => {
  it.each<[string, unknown, TipoError]>([
    ['sin red', new ErrorDeRed(), 'sinConexion'],
    ['tiempo agotado', new ErrorDeRed('tiempoAgotado'), 'tiempoAgotado'],
    ['status 0', new ApiError(0, TECNICO), 'sinConexion'],
    ['400', new ApiError(400, TECNICO), 'solicitud'],
    ['401', new ApiError(401, TECNICO), 'sesionTerminada'],
    ['403', new ApiError(403, TECNICO), 'sinPermiso'],
    ['404', new ApiError(404, TECNICO), 'noEncontrado'],
    ['408', new ApiError(408, TECNICO), 'tiempoAgotado'],
    ['409', new ApiError(409, TECNICO), 'conflicto'],
    ['413', new ApiError(413, TECNICO), 'demasiadoGrande'],
    ['422', new ApiError(422, TECNICO), 'solicitud'],
    ['429 (ThrottlerException)', new ApiError(429, 'ThrottlerException: Too Many Requests'), 'demasiadasSolicitudes'],
    ['500', new ApiError(500, TECNICO), 'servidor'],
    ['502', new ApiError(502, TECNICO), 'servidor'],
    ['503', new ApiError(503, TECNICO), 'servidor'],
    ['504', new ApiError(504, TECNICO), 'tiempoAgotado'],
    ['un status que no es error', new ApiError(302, TECNICO), 'desconocido'],
    ['un Error genérico', new Error(TECNICO), 'desconocido'],
    ['un texto', TECNICO, 'desconocido'],
    ['undefined', undefined, 'desconocido'],
    ['null', null, 'desconocido'],
  ])('%s es %s', (_caso, error, tipo) => {
    expect(tipoDeError(error)).toBe(tipo);
  });

  it.each<[string, unknown, boolean]>([
    ['sin red', new ErrorDeRed(), true],
    ['tiempo agotado', new ErrorDeRed('tiempoAgotado'), true],
    ['504', new ApiError(504, TECNICO), true],
    ['500', new ApiError(500, TECNICO), false],
    ['un Error genérico', new Error(TECNICO), false],
  ])('esSinRespuesta con %s: %s', (_caso, error, esperado) => {
    expect(esSinRespuesta(error)).toBe(esperado);
  });
});

describe('mensajeParaClienta por code estable del backend', () => {
  it.each<[string, number, ClaveTexto]>([
    ['SESION_VENCIDA', 401, 'errores.sesionTerminada'],
    ['SESION_REVOCADA', 401, 'errores.sesionTerminada'],
    ['USA_RENOVAR_MOVIL', 400, 'errores.sesionTerminada'],
    ['RENOVACION_EN_CURSO', 409, 'errores.renovacionEnCurso'],
    ['CUENTA_NO_ACTIVADA', 403, 'errores.cuentaNoActivada'],
    ['CODIGO_INVALIDO', 400, 'errores.codigoInvalido'],
    ['CODIGO_VENCIDO', 400, 'errores.codigoVencido'],
    ['CODIGO_INCORRECTO', 400, 'errores.codigoIncorrecto'],
    ['INTENTOS_AGOTADOS', 400, 'errores.intentosAgotados'],
    ['DEMASIADOS_CODIGOS', 429, 'errores.demasiadosCodigos'],
    ['CODIGO_EN_CURSO', 409, 'errores.codigoEnCurso'],
    ['CORREO_NO_ENVIADO', 502, 'errores.correoNoEnviado'],
    ['CUENTA_SIN_PASSWORD', 409, 'errores.cuentaSinPassword'],
    ['CUENTA_NO_CONFIRMADA', 409, 'errores.cuentaNoConfirmada'],
    ['PASSWORD_ACTUAL_INCORRECTA', 400, 'errores.passwordActualIncorrecta'],
    ['PASSWORD_ACTUAL_REQUERIDA', 400, 'errores.passwordActualRequerida'],
    ['CUENTA_GOOGLE_SIN_PREGUNTA', 400, 'errores.cuentaGoogleSinPregunta'],
    ['CORREO_EN_USO', 409, 'errores.correoEnUso'],
    ['CORREO_IGUAL', 400, 'errores.correoIgual'],
    ['SIN_SOLICITUD', 400, 'errores.sinSolicitudCorreo'],
    ['CONSENTIMIENTO_SALUD_REQUERIDO', 400, 'errores.consentimientoSalud'],
    ['PROMOCIONES_SOLO_TITULAR', 400, 'errores.promocionesSoloTitular'],
    ['CANCELACION_ABIERTA', 409, 'errores.cancelacionAbierta'],
    ['OPERACIONES_EN_CURSO', 409, 'errores.operacionesEnCurso'],
    ['CUENTA_DE_PERSONAL', 409, 'errores.cuentaDePersonal'],
    ['INSUFFICIENT_ROLE', 403, 'errores.sinPermiso'],
    ['INSUFFICIENT_PERMISSIONS', 403, 'errores.sinPermiso'],
    ['NO_PERMISSIONS', 403, 'errores.sinPermiso'],
  ])('%s (%i) usa su texto propio, aunque haya respaldo', (code, status, clave) => {
    const error = new ApiError(status, TECNICO, code);

    expect(mensajeParaClienta(error)).toBe(texto(clave));
    expect(mensajeParaClienta(error, { respaldo: RESPALDO })).toBe(texto(clave));
  });

  it('el texto de la feature para un code gana al común', () => {
    const error = new ApiError(400, TECNICO, 'CODIGO_INVALIDO');

    expect(mensajeParaClienta(error, { porCode: { CODIGO_INVALIDO: 'Texto de la feature.' } })).toBe('Texto de la feature.');
  });

  it.each([
    ['un code que la app no conoce', 'CODIGO_NUEVO_DEL_BACKEND'],
    ['un code heredado de Object', 'toString'],
  ])('%s se decide por el tipo y el respaldo', (_caso, code) => {
    const error = new ApiError(400, TECNICO, code);

    expect(mensajeParaClienta(error)).toBe(texto('errores.solicitud'));
    expect(mensajeParaClienta(error, { respaldo: RESPALDO })).toBe(RESPALDO);
  });
});

describe('mensajeParaClienta por tipo de error', () => {
  it.each<[string, unknown, ClaveTexto]>([
    ['sin red', new ErrorDeRed(), 'errores.sinConexion'],
    ['tiempo agotado', new ErrorDeRed('tiempoAgotado'), 'errores.tiempoAgotado'],
    ['status 0', new ApiError(0, TECNICO), 'errores.sinConexion'],
    ['400', new ApiError(400, EN_INGLES), 'errores.solicitud'],
    ['401 sin code', new ApiError(401, 'Unauthorized'), 'errores.sesionTerminada'],
    ['403', new ApiError(403, 'Forbidden resource'), 'errores.sinPermiso'],
    ['404', new ApiError(404, 'Cannot GET /api/x'), 'errores.noEncontrado'],
    ['408', new ApiError(408, 'Request Timeout'), 'errores.tiempoAgotado'],
    ['409', new ApiError(409, EN_INGLES), 'errores.conflicto'],
    ['413', new ApiError(413, 'File too large'), 'errores.demasiadoGrande'],
    ['429 (ThrottlerException)', new ApiError(429, 'ThrottlerException: Too Many Requests'), 'errores.demasiadasSolicitudes'],
    ['500', new ApiError(500, TECNICO), 'errores.servidor'],
    ['502', new ApiError(502, EN_INGLES), 'errores.servidor'],
    ['503', new ApiError(503, 'Service Unavailable'), 'errores.servidor'],
    ['504', new ApiError(504, 'Gateway Timeout'), 'errores.tiempoAgotado'],
    ['un Error genérico', new Error(TECNICO), 'errores.desconocido'],
    ['un texto', TECNICO, 'errores.desconocido'],
    ['undefined', undefined, 'errores.desconocido'],
  ])('%s sin respaldo: el texto general del tipo y nunca el del servidor', (_caso, error, clave) => {
    const mensaje = mensajeParaClienta(error);

    expect(mensaje).toBe(texto(clave));
    expect(mensaje).not.toMatch(/Prisma|Internal|Unauthorized|Forbidden|Cannot|Timeout|Throttler|Too Many|Unavailable|large/);
  });

  it.each<[string, unknown, ClaveTexto]>([
    ['sin red', new ErrorDeRed(), 'errores.sinConexion'],
    ['tiempo agotado', new ErrorDeRed('tiempoAgotado'), 'errores.tiempoAgotado'],
    ['401 de sesión terminada', new ApiError(401, TECNICO), 'errores.sesionTerminada'],
    ['429', new ApiError(429, 'ThrottlerException: Too Many Requests'), 'errores.demasiadasSolicitudes'],
  ])('%s gana al respaldo de la pantalla', (_caso, error, clave) => {
    expect(mensajeParaClienta(error, { respaldo: RESPALDO })).toBe(texto(clave));
  });

  it.each<[string, unknown]>([
    ['400', new ApiError(400, EN_INGLES)],
    ['403', new ApiError(403, EN_INGLES)],
    ['404', new ApiError(404, EN_INGLES)],
    ['409', new ApiError(409, EN_INGLES)],
    ['413', new ApiError(413, EN_INGLES)],
    ['500 sin referencia', new ApiError(500, TECNICO)],
    ['un Error genérico', new Error(TECNICO)],
    ['undefined', undefined],
  ])('%s con respaldo: el respaldo de la pantalla', (_caso, error) => {
    expect(mensajeParaClienta(error, { respaldo: RESPALDO })).toBe(RESPALDO);
  });

  it.each<[string, number]>([
    ['500', 500],
    ['502', 502],
    ['503', 503],
  ])('un %s con referencia agrega la frase para compartirla con el salón', (_caso, status) => {
    const error = new ApiError(status, TECNICO, undefined, REFERENCIA);

    expect(mensajeParaClienta(error)).toBe(conReferencia(texto('errores.servidor')));
    expect(mensajeParaClienta(error, { respaldo: RESPALDO })).toBe(conReferencia(RESPALDO));
  });

  it('un 4xx nunca muestra referencia, aunque el error traiga una', () => {
    expect(mensajeParaClienta(new ApiError(400, TECNICO, undefined, REFERENCIA))).toBe(texto('errores.solicitud'));
  });

  it('el único texto de sin conexión es el del catálogo, con punto final', () => {
    expect(MENSAJE_SIN_CONEXION).toBe('Sin conexión. Revisa tu internet e intenta de nuevo.');
  });

  it('las claves errores.* tienen texto en español sin guion largo', () => {
    const errores = Object.entries(RESPALDO_TEXTOS).filter(([clave]) => clave.startsWith('errores.'));

    expect(errores.length).toBeGreaterThan(20);
    for (const [, plantilla] of errores) {
      expect(plantilla.trim()).not.toBe('');
      expect(plantilla.includes(GUION_LARGO)).toBe(false);
    }
  });

  it('el salón puede cambiar el texto desde el catálogo (Admin > Textos del sitio)', async () => {
    simularServidor(rutaConTextos({ 'errores.servidor': 'Texto ficticio del salón para fallas.' }));
    await cargarConfiguracion();

    expect(mensajeParaClienta(new ApiError(500, TECNICO))).toBe('Texto ficticio del salón para fallas.');
  });
});

describe('mensajeSinContexto', () => {
  it.each<[string, unknown, string]>([
    ['sin red', new ErrorDeRed(), texto('errores.sinConexion')],
    ['tiempo agotado', new ErrorDeRed('tiempoAgotado'), texto('errores.tiempoAgotado')],
    ['401', new ApiError(401, TECNICO), texto('errores.sesionTerminada')],
    ['429', new ApiError(429, 'ThrottlerException: Too Many Requests'), texto('errores.demasiadasSolicitudes')],
    ['un code conocido', new ApiError(409, TECNICO, 'RENOVACION_EN_CURSO'), texto('errores.renovacionEnCurso')],
  ])('%s: su texto', (_caso, error, esperado) => {
    expect(mensajeSinContexto(error)).toBe(esperado);
  });

  it('un code de la feature gana al común', () => {
    expect(mensajeSinContexto(new ApiError(409, TECNICO, 'RENOVACION_EN_CURSO'), { RENOVACION_EN_CURSO: 'Propio.' })).toBe(
      'Propio.',
    );
  });

  it.each<[string, unknown]>([
    ['400', new ApiError(400, TECNICO)],
    ['404', new ApiError(404, TECNICO)],
    ['500', new ApiError(500, TECNICO)],
    ['503', new ApiError(503, TECNICO)],
    ['un Error genérico', new Error(TECNICO)],
  ])('%s depende de la pantalla: null', (_caso, error) => {
    expect(mensajeSinContexto(error)).toBeNull();
  });
});

describe('apiClient: tiempo agotado y referencia', () => {
  it('el límite de 60 s da ErrorDeRed con motivo tiempoAgotado y su texto propio', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolver, rechazar) => {
          init?.signal?.addEventListener('abort', () => rechazar(new DOMException('Aborted', 'AbortError')));
        }),
    ) as unknown as typeof fetch;

    const pedido = apiGet('/api/servicios', { publica: true });
    const resultado = expect(pedido).rejects.toMatchObject({ name: 'ErrorDeRed', motivo: 'tiempoAgotado' });
    await jest.advanceTimersByTimeAsync(60000);
    await resultado;

    const error = await pedido.catch((e: unknown) => e);
    expect(mensajeParaClienta(error)).toBe(texto('errores.tiempoAgotado'));
  });

  it('sin red da ErrorDeRed con motivo sinRed', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;

    await expect(apiGet('/api/servicios', { publica: true })).rejects.toMatchObject({ name: 'ErrorDeRed', motivo: 'sinRed' });
  });

  it.each<[string, unknown, string | undefined]>([
    ['una referencia válida', { message: TECNICO, referencia: REFERENCIA }, REFERENCIA],
    ['una referencia con otro formato', { message: TECNICO, referencia: 'texto <b>libre</b>' }, undefined],
    ['una referencia que no es texto', { message: TECNICO, referencia: 42 }, undefined],
    ['un cuerpo sin referencia', { message: TECNICO }, undefined],
  ])('un 500 con %s', async (_caso, cuerpo, referencia) => {
    simularServidor({ 'GET /api/servicios': () => respuesta(cuerpo, 500) });

    const error = await apiGet('/api/servicios', { publica: true }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).referencia).toBe(referencia);
    expect(mensajeParaClienta(error)).not.toContain(TECNICO);
  });

  it('un 4xx nunca guarda la referencia del cuerpo', () => {
    const error = crearErrorApi({ tipo: 'respuesta', status: 400, cuerpo: { message: TECNICO, referencia: REFERENCIA } });

    expect(error.referencia).toBeUndefined();
  });

  it.each([
    ['sin motivo', crearErrorApi({ tipo: 'red' }), 'sinRed'],
    ['tiempo agotado', crearErrorApi({ tipo: 'red', motivo: 'tiempoAgotado' }), 'tiempoAgotado'],
  ])('crearErrorApi red %s', (_caso, error, motivo) => {
    expect(error).toBeInstanceOf(ErrorDeRed);
    expect(error.motivo).toBe(motivo);
  });
});
