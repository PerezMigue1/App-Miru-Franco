/// <reference types="jest" />

import { ApiError, apiGet, apiPost, renovarSesion, renovarTrasRechazo } from '@/shared/api/apiClient';
import {
  CODIGO_BLOQUEO_TEMPORAL,
  mensajeParaClienta,
  mensajeSinContexto,
  segundosDeLimite,
  tipoDeError,
} from '@/shared/api/mensajesError';

import { limite429, MENSAJE_BLOQUEO, respuestaCon, servidorEnOrden, vecesA } from '../../helpers/limitesRed';
import {
  cerrarPruebaSesion,
  espiarExpiracion,
  guardarEnAlmacen,
  QUINCE_MINUTOS_MS,
  RUTA_RENOVAR_CLASICA,
  RUTA_RENOVAR_MOVIL,
  sesionFicticia,
  textoSesion,
} from '../../helpers/sesionLimites';

/**
 * GP-09, bloque A3: el 429 BLOQUEO_TEMPORAL (varias contraseñas incorrectas) nunca cierra la sesión
 * ni se trata como sesión vencida: ni en una petición protegida, ni cuando lo responde la renovación
 * (móvil, clásica o la del flujo en vivo). La sesión queda guardada, el manejador de sesión expirada
 * no se llama y la clienta lee el message del backend. fetch simulado en http://api.test.
 */

const RUTA = '/api/citas';
const bloqueo = () => limite429(300, CODIGO_BLOQUEO_TEMPORAL, MENSAJE_BLOQUEO);

afterEach(async () => {
  await cerrarPruebaSesion();
});

async function errorDe(promesa: Promise<unknown>): Promise<ApiError> {
  try {
    await promesa;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('Se esperaba que la petición fallara.');
}

/** La sesión sigue guardada tal cual (mismo token y mismo refreshToken). */
function sigueGuardada(sesion: { token: string; refreshToken?: string }): void {
  const guardada = JSON.parse(textoSesion() ?? 'null') as { token: string; refreshToken?: string } | null;
  expect(guardada).toMatchObject({ token: sesion.token, ...(sesion.refreshToken ? { refreshToken: sesion.refreshToken } : {}) });
}

describe('429 BLOQUEO_TEMPORAL en una petición protegida', () => {
  it('no cierra la sesión y la clienta lee el message del backend', async () => {
    const expiro = espiarExpiracion();
    const sesion = sesionFicticia();
    await guardarEnAlmacen(sesion);
    const llamadas = servidorEnOrden({ [`POST ${RUTA}`]: [bloqueo()] });

    const error = await errorDe(apiPost(RUTA, { a: 1 }));

    expect(error).toMatchObject({ status: 429, code: CODIGO_BLOQUEO_TEMPORAL, retryAfter: 300 });
    expect(tipoDeError(error)).toBe('demasiadasSolicitudes');
    expect(mensajeParaClienta(error, { respaldo: 'No pudimos reservar.' })).toBe(MENSAJE_BLOQUEO);
    expect(mensajeSinContexto(error)).toBe(MENSAJE_BLOQUEO);
    expect(segundosDeLimite(error)).toBe(300);
    expect(vecesA(llamadas, 'POST', RUTA_RENOVAR_MOVIL)).toBe(0);
    expect(expiro).not.toHaveBeenCalled();
    sigueGuardada(sesion);
  });

  it('una sesión clásica tampoco se cierra', async () => {
    const expiro = espiarExpiracion();
    const sesion = sesionFicticia({ clasica: true });
    await guardarEnAlmacen(sesion);
    servidorEnOrden({ [`GET ${RUTA}`]: [bloqueo()] });

    expect(await errorDe(apiGet(RUTA))).toMatchObject({ status: 429, code: CODIGO_BLOQUEO_TEMPORAL });
    expect(expiro).not.toHaveBeenCalled();
    sigueGuardada(sesion);
  });
});

describe('429 BLOQUEO_TEMPORAL durante la renovación', () => {
  it('móvil, tras un 401: la petición falla con el 429 y la sesión se conserva', async () => {
    const expiro = espiarExpiracion();
    const sesion = sesionFicticia();
    await guardarEnAlmacen(sesion);
    const llamadas = servidorEnOrden({
      [`GET ${RUTA}`]: [respuestaCon({ message: 'Unauthorized' }, 401)],
      [`POST ${RUTA_RENOVAR_MOVIL}`]: [bloqueo()],
    });

    const error = await errorDe(apiGet(RUTA));

    expect(error).toMatchObject({ status: 429, code: CODIGO_BLOQUEO_TEMPORAL });
    expect(mensajeParaClienta(error)).toBe(MENSAJE_BLOQUEO);
    expect(vecesA(llamadas, 'POST', RUTA_RENOVAR_MOVIL)).toBe(1);
    expect(expiro).not.toHaveBeenCalled();
    sigueGuardada(sesion);
  });

  it('móvil, con el acceso vencido antes de salir: falla con el 429 sin enviar la petición', async () => {
    const expiro = espiarExpiracion();
    const sesion = sesionFicticia({ emitidoEn: Date.now() - QUINCE_MINUTOS_MS - 1000 });
    await guardarEnAlmacen(sesion);
    const llamadas = servidorEnOrden({ [`POST ${RUTA_RENOVAR_MOVIL}`]: [bloqueo()] });

    expect(await errorDe(apiGet(RUTA))).toMatchObject({ status: 429, code: CODIGO_BLOQUEO_TEMPORAL });
    expect(vecesA(llamadas, 'GET', RUTA)).toBe(0);
    expect(expiro).not.toHaveBeenCalled();
    sigueGuardada(sesion);
  });

  it('móvil, con el acceso por vencer pero vigente: sale con el token actual y la sesión se conserva', async () => {
    const expiro = espiarExpiracion();
    const sesion = sesionFicticia({ emitidoEn: Date.now() - QUINCE_MINUTOS_MS + 30_000 });
    await guardarEnAlmacen(sesion);
    const llamadas = servidorEnOrden({
      [`POST ${RUTA_RENOVAR_MOVIL}`]: [bloqueo()],
      [`GET ${RUTA}`]: [respuestaCon({ data: [] })],
    });

    await expect(apiGet(RUTA)).resolves.toEqual({ data: [] });
    expect(llamadas.find((llamada) => llamada.ruta === RUTA)?.cabeceras.Authorization).toBe(`Bearer ${sesion.token}`);
    expect(expiro).not.toHaveBeenCalled();
    sigueGuardada(sesion);
  });

  it('renovarSesion responde "fallida", no "rechazada"', async () => {
    const expiro = espiarExpiracion();
    const sesion = sesionFicticia({ emitidoEn: Date.now() - QUINCE_MINUTOS_MS });
    await guardarEnAlmacen(sesion);
    servidorEnOrden({ [`POST ${RUTA_RENOVAR_MOVIL}`]: [bloqueo()] });

    await expect(renovarSesion()).resolves.toBe('fallida');
    expect(expiro).not.toHaveBeenCalled();
    sigueGuardada(sesion);
  });

  it('el flujo en vivo (renovarTrasRechazo) recibe "fallida" y la sesión se conserva', async () => {
    const expiro = espiarExpiracion();
    const sesion = sesionFicticia();
    await guardarEnAlmacen(sesion);
    servidorEnOrden({ [`POST ${RUTA_RENOVAR_MOVIL}`]: [bloqueo()] });

    await expect(renovarTrasRechazo(sesion.token)).resolves.toBe('fallida');
    expect(expiro).not.toHaveBeenCalled();
    sigueGuardada(sesion);
  });

  it('el refreshToken no se da por consumido: la siguiente renovación lo vuelve a enviar', async () => {
    const sesion = sesionFicticia({ emitidoEn: Date.now() - QUINCE_MINUTOS_MS });
    await guardarEnAlmacen(sesion);
    const llamadas = servidorEnOrden({
      [`POST ${RUTA_RENOVAR_MOVIL}`]: [bloqueo(), respuestaCon({ token: 'token-ficticio-despues', refreshToken: 'refresh-ficticio-despues' })],
    });

    await expect(renovarSesion()).resolves.toBe('fallida');
    await expect(renovarSesion()).resolves.toBe('renovada');

    const enviados = llamadas.filter((llamada) => llamada.ruta === RUTA_RENOVAR_MOVIL).map((llamada) => llamada.cuerpo);
    expect(enviados).toEqual([{ refreshToken: sesion.refreshToken }, { refreshToken: sesion.refreshToken }]);
  });

  it('clásica, tras un 401: la renovación con 429 no cierra la sesión', async () => {
    const expiro = espiarExpiracion();
    const sesion = sesionFicticia({ clasica: true });
    await guardarEnAlmacen(sesion);
    servidorEnOrden({
      [`GET ${RUTA}`]: [respuestaCon({ message: 'Unauthorized' }, 401)],
      [`POST ${RUTA_RENOVAR_CLASICA}`]: [bloqueo()],
    });

    expect(await errorDe(apiGet(RUTA))).toMatchObject({ status: 401 });
    expect(expiro).not.toHaveBeenCalled();
    sigueGuardada(sesion);
  });
});

describe('429 BLOQUEO_TEMPORAL en el inicio de sesión (público)', () => {
  it('no toca la sesión guardada ni avisa de sesión expirada', async () => {
    const expiro = espiarExpiracion();
    const sesion = sesionFicticia();
    await guardarEnAlmacen(sesion);
    servidorEnOrden({ 'POST /api/auth/login': [bloqueo()] });

    const error = await errorDe(apiPost('/api/auth/login', { email: 'clienta@ejemplo.test' }, { publica: true }));

    expect(mensajeParaClienta(error)).toBe(MENSAJE_BLOQUEO);
    expect(tipoDeError(error)).not.toBe('sesionTerminada');
    expect(expiro).not.toHaveBeenCalled();
    sigueGuardada(sesion);
  });
});
