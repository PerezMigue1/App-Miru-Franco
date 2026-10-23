/// <reference types="jest" />

import { ApiError, apiGet, crearErrorApi } from '@/shared/api/apiClient';
import { mensajeParaClienta } from '@/shared/api/mensajesError';

import {
  QUINCE_MINUTOS_MS,
  RUTA_RENOVAR_MOVIL,
  cerrarPruebaSesion,
  espiarExpiracion,
  guardarEnAlmacen,
  rutasDe,
  sesionFicticia,
  textoSesion,
} from '../../helpers/sesionLimites';
import { TEXTO_SESION_TERMINADA } from '../../helpers/textosError';
import { errorServidor, servidorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-07.6, revisión final (sesión). El backend responde 409 RENOVACION_EN_CURSO a
 * POST /api/auth/movil/renovar cuando el refreshToken ya se usó (sesiones-moviles.service.ts): la
 * app lo da por consumido y cierra la sesión. La petición que esperaba esa renovación falla con 401
 * y la clienta debe leer que su sesión terminó, no "intenta de nuevo en unos segundos".
 */

const RUTA_CARRITO = '/api/carrito';
const RENOVAR = `POST ${RUTA_RENOVAR_MOVIL}`;

afterEach(async () => {
  await cerrarPruebaSesion();
});

describe('409 RENOVACION_EN_CURSO al renovar', () => {
  it('la petición protegida falla como sesión terminada y la sesión se cierra', async () => {
    const manejador = espiarExpiracion();
    await guardarEnAlmacen(sesionFicticia({ emitidoEn: Date.now() - QUINCE_MINUTOS_MS }));
    const llamadas = servidorVm({
      [RENOVAR]: () => errorServidor(409, 'Renovación en curso', 'RENOVACION_EN_CURSO'),
    });
    const error = await apiGet(RUTA_CARRITO).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'SESION_VENCIDA' });
    expect(mensajeParaClienta(error)).toBe(TEXTO_SESION_TERMINADA);
    expect(rutasDe(llamadas)).toEqual([RENOVAR]);
    expect(textoSesion()).toBeUndefined();
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['SESION_VENCIDA', 'SESION_VENCIDA'],
    ['SESION_REVOCADA', 'SESION_REVOCADA'],
    ['USA_RENOVAR_MOVIL', 'USA_RENOVAR_MOVIL'],
    ['RENOVACION_EN_CURSO', 'SESION_VENCIDA'],
    ['OTRO_CODIGO', 'SESION_VENCIDA'],
  ])('un rechazo con %s queda con el code %s y el texto de sesión terminada', (code, esperado) => {
    const error = crearErrorApi({ tipo: 'sesionTerminada', code });
    expect(error.code).toBe(esperado);
    expect(mensajeParaClienta(error)).toBe(TEXTO_SESION_TERMINADA);
  });
});
