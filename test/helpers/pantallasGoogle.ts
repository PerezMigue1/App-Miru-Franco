/// <reference types="jest" />

import { createHash } from 'node:crypto';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { RUTAS_DE_FONDO } from './datosClienta';
import {
  abrirSesionSimulada,
  bytesFijos,
  CODIGO_GOOGLE,
  navegadorRegresa,
  REGRESO_GOOGLE,
  regresoConCodigo,
  rutaCanje,
  SESION_GOOGLE,
} from './google';
import { prepararPruebasDePantalla, type App } from './pantallas';
import { API, llamadasA, servidorConRutas, type Llamada, type Manejador } from './servidorSimulado';
import { sesionGuardada } from './sesionGuardada';

/**
 * Piezas comunes de las pruebas de integración del inicio con Google (GP-05.3) con las pantallas
 * reales: el servidor con el canje, el botón de Google, el par PKCE que deben ver el navegador y el
 * canje, y las revisiones de "entró con sesión" y "sigue sin sesión".
 */

export const BOTON_GOOGLE = 'Continuar con Google';
export const BOTON_GOOGLE_ABRIENDO = 'Abriendo Google…';
export const ERROR_GOOGLE = 'No pudimos iniciar sesión con Google. Inténtalo de nuevo.';
export const RUTA_CANJE = '/api/auth/exchange-code';
const INVITACION_INICIO = 'Crea tu cuenta para reservar citas y comprar';

/**
 * Par PKCE que sale de los bytes fijos de cryptoSimulado: el verifier que debe llegar al canje y
 * el challenge (SHA-256 del verifier) que debe llevar la URL de Google.
 */
const VERIFIER = Buffer.from(bytesFijos(32)).toString('base64url');
export const PKCE_ESPERADO = {
  verifier: VERIFIER,
  challenge: createHash('sha256').update(VERIFIER).digest('base64url'),
};

/** Servidor simulado con las rutas de fondo y el canje exitoso; las de la prueba van encima. */
export function simularServidorGoogle(rutas: Record<string, Manejador> = {}): Llamada[] {
  return servidorConRutas({ ...RUTAS_DE_FONDO, ...rutaCanje() })(rutas);
}

/**
 * prepararPruebasDePantalla más el reinicio del navegador simulado antes de cada prueba (sus
 * llamadas se acumulan entre pruebas del archivo). Va dentro del describe.
 */
export function prepararPruebasGoogle(): () => void {
  beforeEach(() => {
    abrirSesionSimulada().mockClear();
  });
  return prepararPruebasDePantalla();
}

/** Toca "Continuar con Google" en el formulario visible. */
export async function tocarGoogle(): Promise<void> {
  await fireEvent.press(screen.getByRole('button', { name: BOTON_GOOGLE }));
}

/** La clienta quedó en Inicio con sesión: foto en la cabecera y sin invitación ni Acceso. */
export async function esperarInicioConSesion(app: App): Promise<void> {
  await waitFor(() => expect(app.getPathname()).toBe('/inicio'));
  expect(await screen.findByRole('button', { name: 'Abrir perfil' })).toBeOnTheScreen();
  expect(screen.queryByText(INVITACION_INICIO)).not.toBeOnTheScreen();
  expect(screen.queryByText('Inicia sesión')).not.toBeOnTheScreen();
}

/**
 * El navegador regresa con el código, la clienta toca "Continuar con Google" y entra: llega a
 * Inicio con la sesión de SESION_GOOGLE guardada. Revisa la URL que se abrió, el canje (code,
 * code_verifier y canal "movil", sin Bearer) y que /me salió con el token recién emitido.
 */
export async function entrarConGoogle(app: App, llamadas: Llamada[]): Promise<void> {
  const abrirSesion = navegadorRegresa(regresoConCodigo());
  const vecesAntes = abrirSesion.mock.calls.length;
  await tocarGoogle();
  await esperarInicioConSesion(app);

  expect(abrirSesion).toHaveBeenCalledTimes(vecesAntes + 1);
  expect(abrirSesion).toHaveBeenLastCalledWith(
    `${API}/api/auth/google?origen=app&code_challenge=${PKCE_ESPERADO.challenge}`,
    REGRESO_GOOGLE,
  );
  const canjes = llamadasA(llamadas, 'POST', RUTA_CANJE);
  expect(canjes.length).toBeGreaterThan(0);
  const canje = canjes[canjes.length - 1];
  expect(canje.cuerpo).toEqual(
    expect.objectContaining({ code: CODIGO_GOOGLE, code_verifier: PKCE_ESPERADO.verifier, canal: 'movil' }),
  );
  expect(canje.cabeceras.Authorization).toBeUndefined();
  const me = llamadasA(llamadas, 'GET', '/api/auth/me');
  expect(me.some((l) => l.cabeceras.Authorization === `Bearer ${SESION_GOOGLE.token}`)).toBe(true);

  expect(sesionGuardada()).toMatchObject({
    token: SESION_GOOGLE.token,
    refreshToken: SESION_GOOGLE.refreshToken,
    usuario: { nombre: 'Clienta Ficticia' },
  });
}

/**
 * Tras cerrar el navegador o un regreso fallido: sigue en la ruta indicada, sin sesión guardada,
 * sin canje y con el botón de Google listo otra vez.
 */
export async function sigueSinSesion(app: App, ruta: string, llamadas: Llamada[]): Promise<void> {
  expect(await screen.findByRole('button', { name: BOTON_GOOGLE })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: BOTON_GOOGLE_ABRIENDO })).not.toBeOnTheScreen();
  expect(app.getPathname()).toBe(ruta);
  expect(sesionGuardada()).toBeNull();
  expect(llamadasA(llamadas, 'POST', RUTA_CANJE)).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Abrir perfil' })).not.toBeOnTheScreen();
}
