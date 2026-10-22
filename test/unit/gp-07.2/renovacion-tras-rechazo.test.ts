/// <reference types="jest" />

import * as SecureStore from 'expo-secure-store';

import { alExpirarSesion, esperarRenovacionEnCurso, renovarTrasRechazo } from '@/shared/api/apiClient';
import * as tokenStorage from '@/shared/api/tokenStorage';

import { CLAVE_SESION, jwtFicticio, sembrarSesion, sesionGuardada } from '../../helpers/sesionGuardada';
import { llamadasA, respuesta, servidorConRutas } from '../../helpers/servidorSimulado';

/**
 * GP-07.2: renovarTrasRechazo (src/shared/api/apiClient.ts), la renovación que usa el flujo en vivo
 * de avisos tras un 401 porque no pasa por request. Comparte el vuelo único de renovación. Sesión
 * en el SecureStore simulado y fetch simulado: nunca sale a la red.
 */

const RUTA_RENOVAR = '/api/auth/movil/renovar';
const RUTA_REFRESH = '/api/auth/refresh';
const USUARIO = { id: 'clienta-ficticia-avisos', nombre: 'Clienta Ficticia', email: 'clienta@ejemplo.test', rol: 'cliente' };
const simularServidor = servidorConRutas({});

let quitarManejador: (() => void) | null = null;

function espiarExpiracion(): jest.Mock {
  const manejador = jest.fn();
  quitarManejador = alExpirarSesion(manejador);
  return manejador;
}

/** Sesión guardada antes de la renovación móvil: sin refreshToken. */
async function sembrarSesionClasica(): Promise<string> {
  const token = jwtFicticio('clienta-clasica');
  await SecureStore.setItemAsync(CLAVE_SESION, JSON.stringify({ token, emitidoEn: Date.now(), usuario: USUARIO }));
  return token;
}

afterEach(async () => {
  await esperarRenovacionEnCurso();
  quitarManejador?.();
  quitarManejador = null;
});

describe('renovarTrasRechazo', () => {
  it('sesión móvil: renueva con el refreshToken (sin Bearer) y guarda el acceso nuevo', async () => {
    const manejador = espiarExpiracion();
    const { token, refreshToken } = await sembrarSesion(USUARIO);
    const llamadas = simularServidor({
      [`POST ${RUTA_RENOVAR}`]: () => respuesta({ token: 'token-ficticio-nuevo', refreshToken: 'refresh-ficticio-nuevo' }),
    });

    await expect(renovarTrasRechazo(token)).resolves.toBe('renovada');

    const [renovar] = llamadasA(llamadas, 'POST', RUTA_RENOVAR);
    expect(renovar.cuerpo).toEqual({ refreshToken });
    expect(renovar.cabeceras.Authorization).toBeUndefined();
    expect(sesionGuardada()).toMatchObject({ token: 'token-ficticio-nuevo', refreshToken: 'refresh-ficticio-nuevo' });
    expect(manejador).not.toHaveBeenCalled();
  });

  it('sesión móvil rechazada: la sesión queda borrada y el manejador avisado una vez', async () => {
    const manejador = espiarExpiracion();
    const { token } = await sembrarSesion(USUARIO);
    simularServidor({ [`POST ${RUTA_RENOVAR}`]: () => respuesta({ message: 'Sesión revocada' }, 401) });

    await expect(renovarTrasRechazo(token)).resolves.toBe('rechazada');

    expect(sesionGuardada()).toBeNull();
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it('sin red responde fallida y conserva la sesión', async () => {
    const manejador = espiarExpiracion();
    const { token } = await sembrarSesion(USUARIO);
    globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;

    await expect(renovarTrasRechazo(token)).resolves.toBe('fallida');

    expect(sesionGuardada()?.token).toBe(token);
    expect(manejador).not.toHaveBeenCalled();
  });

  it('si el token rechazado ya no es el guardado (otra renovación ganó), responde renovada sin enviar nada', async () => {
    await sembrarSesion(USUARIO);
    const llamadas = simularServidor({});

    await expect(renovarTrasRechazo('token-ficticio-anterior')).resolves.toBe('renovada');

    expect(llamadas).toEqual([]);
  });

  it('sesión clásica rechazada por /api/auth/refresh: se cierra aquí y se avisa una vez', async () => {
    const manejador = espiarExpiracion();
    const token = await sembrarSesionClasica();
    const llamadas = simularServidor({ [`POST ${RUTA_REFRESH}`]: () => respuesta({ message: 'No autorizado' }, 401) });

    await expect(renovarTrasRechazo(token)).resolves.toBe('rechazada');

    expect(llamadasA(llamadas, 'POST', RUTA_REFRESH)[0].cabeceras.Authorization).toBe(`Bearer ${token}`);
    expect(sesionGuardada()).toBeNull();
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it('si no se puede leer el token guardado, no lanza: decide la renovación', async () => {
    const { token } = await sembrarSesion(USUARIO);
    const lectura = jest.spyOn(tokenStorage, 'getToken').mockRejectedValueOnce(new Error('SecureStore ficticio'));
    const llamadas = simularServidor({
      [`POST ${RUTA_RENOVAR}`]: () => respuesta({ token: 'token-ficticio-nuevo-2', refreshToken: 'refresh-ficticio-nuevo-2' }),
    });

    try {
      await expect(renovarTrasRechazo(token)).resolves.toBe('renovada');
    } finally {
      lectura.mockRestore();
    }

    expect(llamadasA(llamadas, 'POST', RUTA_RENOVAR)).toHaveLength(1);
  });

  it('sin sesión guardada responde rechazada sin enviar nada ni avisar', async () => {
    const manejador = espiarExpiracion();
    const llamadas = simularServidor({});

    await expect(renovarTrasRechazo('token-ficticio-suelto')).resolves.toBe('rechazada');

    expect(llamadas).toEqual([]);
    expect(manejador).not.toHaveBeenCalled();
  });
});
