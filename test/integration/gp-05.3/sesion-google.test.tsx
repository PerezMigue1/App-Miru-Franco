/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { screen, waitFor } from 'expo-router/testing-library';

import { CLAVE, CORREO, USUARIO } from '../../helpers/datosClienta';
import { abrirSesionSimulada, SESION_GOOGLE } from '../../helpers/google';
import {
  abrirAcceso,
  abrirApp,
  cerrarIntroSiAparece,
  entrarCon,
  LIMITE_MS,
  type App,
} from '../../helpers/pantallas';
import {
  BOTON_GOOGLE,
  entrarConGoogle,
  esperarInicioConSesion,
  prepararPruebasGoogle,
  RUTA_CANJE,
  simularServidorGoogle,
} from '../../helpers/pantallasGoogle';
import { cerrarRouter } from '../../helpers/router';
import { jwtFicticio, sesionGuardada } from '../../helpers/sesionGuardada';
import { llamadasA, respuesta, type Llamada } from '../../helpers/servidorSimulado';

jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-05.3: la sesión que deja el inicio con Google, con las pantallas reales. Al cerrar y volver a
 * abrir la app se conserva; tras más de 15 minutos sin usarla (el acceso dura 15 minutos) se renueva
 * en silencio con el refreshToken que emitió el canje y se guarda el par rotado. El inicio con correo
 * sigue igual. Cerrar la app es desmontar el router: el SecureStore simulado se conserva.
 */

const RUTA_RENOVAR = '/api/auth/movil/renovar';
const MINUTO_MS = 60 * 1000;

/** Par que entrega la renovación móvil (token y refreshToken rotados). */
const ROTADA = {
  token: jwtFicticio('clienta-google-renovada'),
  refreshToken: 'refresh-ficticio-google-rotado',
  refreshExpiraEn: '2099-02-01T00:00:00.000Z',
};

/** Entra con Google desde Acceso y cierra la app; devuelve cuántas peticiones hubo hasta ahí. */
async function entrarConGoogleYCerrar(llamadas: Llamada[]): Promise<number> {
  const app = await abrirAcceso();
  await entrarConGoogle(app, llamadas);
  await cerrarRouter();
  return llamadas.length;
}

/**
 * Vuelve a abrir la app en '/': la clienta queda en Inicio con sesión, sin la hoja de bienvenida y
 * sin volver a pasar por Google. Devuelve las peticiones hechas desde que se reabrió.
 */
async function reabrirConSesion(llamadas: Llamada[], antes: number): Promise<Llamada[]> {
  const app: App = await abrirApp('/');
  await cerrarIntroSiAparece();
  await esperarInicioConSesion(app);
  expect(screen.queryByText('Te damos la bienvenida a Mirú Franco')).not.toBeOnTheScreen();
  await waitFor(() => expect(llamadasA(llamadas.slice(antes), 'GET', '/api/auth/me').length).toBeGreaterThan(0));
  const despues = llamadas.slice(antes);
  expect(llamadasA(despues, 'POST', RUTA_CANJE)).toHaveLength(0);
  expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1);
  return despues;
}

/** Todas las peticiones a /me salieron con ese acceso. */
function meConToken(llamadas: Llamada[], token: string): void {
  for (const llamada of llamadasA(llamadas, 'GET', '/api/auth/me')) {
    expect(llamada.cabeceras.Authorization).toBe(`Bearer ${token}`);
  }
}

describe('Sesión que deja el inicio con Google (GP-05.3)', () => {
  const esperarConsolaLimpia = prepararPruebasGoogle();

  it(
    'al cerrar y volver a abrir la app conserva la sesión de Google sin renovarla',
    async () => {
      const llamadas = simularServidorGoogle();
      const antes = await entrarConGoogleYCerrar(llamadas);

      const despues = await reabrirConSesion(llamadas, antes);

      // /me salió con el acceso guardado; con el acceso vigente no hubo renovación.
      meConToken(despues, SESION_GOOGLE.token);
      expect(llamadasA(despues, 'POST', RUTA_RENOVAR)).toHaveLength(0);
      expect(sesionGuardada()).toMatchObject({
        token: SESION_GOOGLE.token,
        refreshToken: SESION_GOOGLE.refreshToken,
      });

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'tras más de 15 minutos sin usarla, al reabrir renueva con el refreshToken de Google y sigue dentro',
    async () => {
      const llamadas = simularServidorGoogle({
        [`POST ${RUTA_RENOVAR}`]: () => respuesta({ success: true, ...ROTADA }),
      });
      const antes = await entrarConGoogleYCerrar(llamadas);

      // 16 minutos después: renderRouter conserva la hora del reloj falso al arrancar.
      jest.useFakeTimers({ now: Date.now() + 16 * MINUTO_MS });
      const despues = await reabrirConSesion(llamadas, antes);

      // Una sola renovación, pública y con el refreshToken que emitió el canje de Google.
      const renovaciones = llamadasA(despues, 'POST', RUTA_RENOVAR);
      expect(renovaciones).toHaveLength(1);
      expect(renovaciones[0].cuerpo).toEqual({ refreshToken: SESION_GOOGLE.refreshToken });
      expect(renovaciones[0].cabeceras.Authorization).toBeUndefined();

      // El par rotado quedó guardado y /me ya salió con el acceso nuevo.
      expect(sesionGuardada()).toMatchObject({ token: ROTADA.token, refreshToken: ROTADA.refreshToken });
      meConToken(despues, ROTADA.token);
      expect(screen.queryByText('Tu sesión terminó. Inicia sesión de nuevo.')).not.toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'el inicio con correo y contraseña sigue entrando a Inicio con sesión, sin pasar por Google',
    async () => {
      const llamadas = simularServidorGoogle({
        'POST /api/auth/login': () =>
          respuesta({ success: true, token: 'token-ficticio-correo', refreshToken: 'refresh-ficticio-correo', usuario: USUARIO }),
      });
      const app = await abrirAcceso();
      // Los dos caminos conviven en Acceso.
      expect(screen.getByRole('button', { name: BOTON_GOOGLE })).toBeOnTheScreen();

      await entrarCon(CORREO, CLAVE);
      await esperarInicioConSesion(app);

      expect(llamadasA(llamadas, 'POST', '/api/auth/login')[0].cuerpo).toMatchObject({ canal: 'movil' });
      expect(sesionGuardada()).toMatchObject({ token: 'token-ficticio-correo', refreshToken: 'refresh-ficticio-correo' });
      // Ni el navegador ni el canje intervinieron.
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      expect(llamadasA(llamadas, 'POST', RUTA_CANJE)).toHaveLength(0);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
