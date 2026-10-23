/// <reference types="jest" />

import { ApiError, apiGet, renovarSesion, renovarSesionSiVigente } from '@/shared/api/apiClient';

import { respuesta } from '../../helpers/servidorSimulado';
import {
  RUTA_RENOVAR_CLASICA,
  cerrarPruebaSesion,
  espiarExpiracion,
  guardarEnAlmacen,
  rutasDe,
  servidorSinRed,
  sesionFicticia,
  textoSesion,
} from '../../helpers/sesionLimites';
import { errorServidor, servidorVm, type ManejadorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-07.6, renovación sin refreshToken guardado (src/shared/api/apiClient.ts). Sin sesión no se
 * envía nada; una sesión clásica usa POST /api/auth/refresh con su Bearer. Si el token es de la app
 * móvil, el backend responde 400 USA_RENOVAR_MOVIL (auth.service.ts, refreshToken): esa sesión no
 * se puede renovar nunca por este camino, así que cuenta como rechazo y quien la usa la cierra con
 * su aviso, en lugar de reintentar sin fin. Sin red, la renovación no lanza. Solo fetch es simulado.
 */

const REFRESH = `POST ${RUTA_RENOVAR_CLASICA}`;
const RUTA_CARRITO = '/api/carrito';
const usaRenovarMovil: ManejadorVm = () =>
  errorServidor(400, 'La app renueva su sesión con POST /api/auth/movil/renovar.', 'USA_RENOVAR_MOVIL');

afterEach(async () => {
  await cerrarPruebaSesion();
});

describe('renovarSesion sin refreshToken guardado', () => {
  it('sin sesión guardada responde rechazada sin enviar nada', async () => {
    const llamadas = servidorVm({});
    await expect(renovarSesion()).resolves.toBe('rechazada');
    expect(llamadas).toHaveLength(0);
  });

  it('una sesión clásica pide /api/auth/refresh con su Bearer y guarda el token nuevo', async () => {
    const sesion = sesionFicticia({ clasica: true });
    await guardarEnAlmacen(sesion);
    const llamadas = servidorVm({ [REFRESH]: () => respuesta({ success: true, token: 'token-ficticio-nuevo' }) });
    await expect(renovarSesion()).resolves.toBe('renovada');
    expect(rutasDe(llamadas)).toEqual([REFRESH]);
    expect(llamadas[0].cabeceras.Authorization).toBe(`Bearer ${sesion.token}`);
    expect(llamadas[0].cuerpo).toBeUndefined();
    expect(JSON.parse(textoSesion() ?? '{}')).toMatchObject({ token: 'token-ficticio-nuevo' });
  });

  it('un 400 USA_RENOVAR_MOVIL es un rechazo: esa sesión ya no se puede renovar', async () => {
    await guardarEnAlmacen(sesionFicticia({ clasica: true }));
    servidorVm({ [REFRESH]: usaRenovarMovil });
    await expect(renovarSesion()).resolves.toBe('rechazada');
  });

  it.each([
    ['un 400 con otro code', () => errorServidor(400, 'Solicitud inválida', 'OTRO_CODIGO')],
    ['un 400 sin code', () => errorServidor(400, 'Solicitud inválida')],
    ['un 500', () => errorServidor(500, 'Error interno')],
  ])('%s es una falla que conserva la sesión', async (_caso, crear) => {
    const manejador = espiarExpiracion();
    const sesion = sesionFicticia({ clasica: true });
    await guardarEnAlmacen(sesion);
    servidorVm({ [REFRESH]: crear });
    await expect(renovarSesion()).resolves.toBe('fallida');
    expect(JSON.parse(textoSesion() ?? '{}')).toEqual(sesion);
    expect(manejador).not.toHaveBeenCalled();
  });

  it('sin red la renovación clásica no lanza: responde fallida y conserva la sesión', async () => {
    const sesion = sesionFicticia({ clasica: true });
    await guardarEnAlmacen(sesion);
    const llamadas = servidorSinRed();
    await expect(renovarSesion()).resolves.toBe('fallida');
    expect(rutasDe(llamadas)).toEqual([REFRESH]);
    expect(JSON.parse(textoSesion() ?? '{}')).toEqual(sesion);
  });
});

describe('400 USA_RENOVAR_MOVIL cierra la sesión sin dejarla a medias', () => {
  it('la renovación periódica cierra la sesión y avisa una vez', async () => {
    const manejador = espiarExpiracion();
    await guardarEnAlmacen(sesionFicticia({ clasica: true }));
    const llamadas = servidorVm({ [REFRESH]: usaRenovarMovil });
    await renovarSesionSiVigente();
    expect(rutasDe(llamadas)).toEqual([REFRESH]);
    expect(textoSesion()).toBeUndefined();
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it('una petición con 401 cierra la sesión, avisa una vez y no se repite', async () => {
    const manejador = espiarExpiracion();
    await guardarEnAlmacen(sesionFicticia({ clasica: true }));
    const llamadas = servidorVm({
      [`GET ${RUTA_CARRITO}`]: () => errorServidor(401, 'No autorizado'),
      [REFRESH]: usaRenovarMovil,
    });
    const error = await apiGet(RUTA_CARRITO).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(rutasDe(llamadas)).toEqual([`GET ${RUTA_CARRITO}`, REFRESH]);
    expect(textoSesion()).toBeUndefined();
    expect(manejador).toHaveBeenCalledTimes(1);
  });
});
