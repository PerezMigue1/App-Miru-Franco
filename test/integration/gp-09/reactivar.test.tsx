/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { CLAVE, CORREO, cuentaSinActivar } from '../../helpers/datosClienta';
import { navegadorRegresa, REGRESO_CON_ERROR, REGRESO_GOOGLE } from '../../helpers/google';
import { limite429, MENSAJE_LIMITE } from '../../helpers/limitesRed';
import { abrirAcceso, entrarCon, LIMITE_MS } from '../../helpers/pantallas';
import {
  ERROR_GOOGLE,
  prepararPruebasGoogle,
  simularServidorGoogle,
  tocarGoogle,
} from '../../helpers/pantallasGoogle';
import {
  CODIGO_INVALIDO_SERVIDOR,
  codigoInvalido,
  cuentaDesactivada,
  NEUTRO_SOLICITAR,
  reactivacionLista,
  RUTA_CONFIRMAR,
  RUTA_SOLICITAR,
  solicitudNeutra,
  TEXTO,
  textoEsperaLimite,
  textoOtroCodigoEn,
  textoPaso,
} from '../../helpers/reactivar';
import { sesionGuardada } from '../../helpers/sesionGuardada';
import { llamadasA, respuesta, type Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-09, bloque C, con las pantallas reales (renderRouter sobre src/app y el AuthProvider real):
 * el 403 CUENTA_DESACTIVADA del login y el regreso de Google con error=cuenta_desactivada ofrecen
 * "Reactivar mi cuenta"; Reactivar pide el código con { email }, muestra la respuesta neutra, rechaza
 * el código inválido con su mensaje, deja pedir otro código a los 60 s, respeta el 429 y, al
 * reactivar, regresa a Acceso con el correo escrito y el aviso, sin crear ninguna sesión. Servidor,
 * navegador y expo-crypto simulados (http://api.test), datos ficticios y temporizadores falsos.
 */

const CODIGO = '123456';

/** Respuestas en orden: cada llamada toma la siguiente y la última se repite. */
function enOrden(...respuestas: (() => Response)[]): Manejador {
  let vez = 0;
  return () => {
    const actual = respuestas[Math.min(vez, respuestas.length - 1)];
    vez += 1;
    return actual();
  };
}

async function avanzarSegundos(segundos: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(segundos * 1000);
  });
}

/** Ninguna sesión guardada en SecureStore (ni token ni refreshToken). */
function sinSesion(): void {
  expect(sesionGuardada()).toBeNull();
}

/** Ya en Reactivar: el título, la explicación y el paso 1 con su título accesible. */
async function esperarReactivar(app: { getPathname: () => string }): Promise<void> {
  await waitFor(() => expect(app.getPathname()).toBe('/reactivar'));
  expect(await screen.findByRole('header', { name: TEXTO.titulo })).toBeOnTheScreen();
  expect(screen.getByText(TEXTO.explicacion)).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: textoPaso(1) })).toBeOnTheScreen();
}

describe('Reactivar mi cuenta (GP-09)', () => {
  const esperarConsolaLimpia = prepararPruebasGoogle();

  it(
    'desde el login: reactiva con el código y regresa a Acceso con el correo y el aviso, sin sesión',
    async () => {
      const llamadas = simularServidorGoogle({
        'POST /api/auth/login': cuentaDesactivada,
        [`POST ${RUTA_SOLICITAR}`]: solicitudNeutra,
        [`POST ${RUTA_CONFIRMAR}`]: enOrden(() => codigoInvalido(), reactivacionLista),
      });
      const app = await abrirAcceso();
      // Antes de intentar, el enlace discreto para las cuentas de Google está a la vista.
      expect(screen.getByRole('link', { name: TEXTO.enlace })).toBeOnTheScreen();

      await entrarCon(CORREO, CLAVE);
      expect(await screen.findByText(TEXTO.desactivada)).toBeOnTheScreen();
      expect(app.getPathname()).toBe('/login');
      // Con el botón a la vista, el enlace sobra.
      expect(screen.queryByRole('link', { name: TEXTO.enlace })).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: TEXTO.boton }));

      await esperarReactivar(app);
      expect(screen.getByLabelText(TEXTO.etiquetaCorreo)).toHaveProp('value', CORREO);

      // Paso 1: pide el código; la respuesta es la neutra y nunca dice si la cuenta existe.
      await fireEvent.press(screen.getByRole('button', { name: TEXTO.pedirCodigo }));
      expect(await screen.findByText(NEUTRO_SOLICITAR)).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: textoPaso(2) })).toBeOnTheScreen();
      const envios = llamadasA(llamadas, 'POST', RUTA_SOLICITAR);
      expect(envios).toHaveLength(1);
      expect(envios[0].cuerpo).toEqual({ email: CORREO });
      expect(envios[0].cabeceras.Authorization).toBeUndefined();

      // Otro código solo a los 60 s.
      expect(screen.getByText(textoOtroCodigoEn(60))).toBeOnTheScreen();
      expect(screen.queryByRole('link', { name: TEXTO.otroCodigo })).not.toBeOnTheScreen();

      // Un código inválido: el mensaje neutro del servidor junto al campo.
      await fireEvent.changeText(screen.getByLabelText(TEXTO.etiquetaCodigo), '654321');
      await fireEvent.press(screen.getByRole('button', { name: TEXTO.reactivar }));
      expect(await screen.findByText(CODIGO_INVALIDO_SERVIDOR)).toBeOnTheScreen();
      expect(app.getPathname()).toBe('/reactivar');

      // El código correcto reactiva y regresa a Acceso.
      await fireEvent.changeText(screen.getByLabelText(TEXTO.etiquetaCodigo), CODIGO);
      await fireEvent.press(screen.getByRole('button', { name: TEXTO.reactivar }));
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      const confirmaciones = llamadasA(llamadas, 'POST', RUTA_CONFIRMAR);
      expect(confirmaciones).toHaveLength(2);
      expect(confirmaciones[1].cuerpo).toEqual({ email: CORREO, codigo: CODIGO });
      expect(confirmaciones[1].cabeceras.Authorization).toBeUndefined();
      expect(await screen.findByText(TEXTO.listo)).toBeOnTheScreen();
      expect(screen.getByLabelText('Correo electrónico')).toHaveProp('value', CORREO);
      expect(screen.getByLabelText('Contraseña')).toHaveProp('value', '');
      expect(screen.queryByRole('button', { name: TEXTO.boton })).not.toBeOnTheScreen();
      // Confirmar no inicia sesión: no hay sesión guardada y la clienta entra como siempre.
      sinSesion();
      expect(llamadasA(llamadas, 'POST', '/api/auth/login')).toHaveLength(1);
      expect(screen.queryByRole('button', { name: 'Abrir perfil' })).not.toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'desde Google: el regreso con cuenta_desactivada ofrece Reactivar sin correo y "Volver" regresa a Acceso',
    async () => {
      const llamadas = simularServidorGoogle({
        [`POST ${RUTA_SOLICITAR}`]: solicitudNeutra,
      });
      const app = await abrirAcceso();
      navegadorRegresa(`${REGRESO_GOOGLE}?error=cuenta_desactivada`);

      await tocarGoogle();
      expect(await screen.findByText(TEXTO.desactivada)).toBeOnTheScreen();
      expect(screen.queryByText(ERROR_GOOGLE)).not.toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/exchange-code')).toHaveLength(0);
      sinSesion();

      await fireEvent.press(screen.getByRole('button', { name: TEXTO.boton }));
      await esperarReactivar(app);
      expect(screen.getByLabelText(TEXTO.etiquetaCorreo)).toHaveProp('value', '');

      // Sin correo válido no se llama al servidor.
      await fireEvent.press(screen.getByRole('button', { name: TEXTO.pedirCodigo }));
      expect(await screen.findByText('El correo electrónico es requerido')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', RUTA_SOLICITAR)).toHaveLength(0);

      // "Cambiar el correo" vuelve al paso 1 con el correo escrito.
      await fireEvent.changeText(screen.getByLabelText(TEXTO.etiquetaCorreo), 'Google.Ficticia@Ejemplo.test');
      await fireEvent.press(screen.getByRole('button', { name: TEXTO.pedirCodigo }));
      expect(await screen.findByText(NEUTRO_SOLICITAR)).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', RUTA_SOLICITAR)[0].cuerpo).toEqual({ email: 'google.ficticia@ejemplo.test' });
      await fireEvent.press(screen.getByRole('link', { name: TEXTO.cambiarCorreo }));
      expect(await screen.findByRole('header', { name: textoPaso(1) })).toBeOnTheScreen();
      expect(screen.getByLabelText(TEXTO.etiquetaCorreo)).toHaveProp('value', 'Google.Ficticia@Ejemplo.test');

      await fireEvent.press(screen.getByRole('link', { name: TEXTO.volver }));
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      expect(screen.queryByText(TEXTO.listo)).not.toBeOnTheScreen();
      sinSesion();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'el enlace "¿Desactivaste tu cuenta?" abre Reactivar; un 429 deja el envío en espera y otro código llega a los 60 s',
    async () => {
      const llamadas = simularServidorGoogle({
        [`POST ${RUTA_SOLICITAR}`]: enOrden(() => limite429(2), solicitudNeutra),
      });
      const app = await abrirAcceso();

      await fireEvent.press(screen.getByRole('link', { name: TEXTO.enlace }));
      await esperarReactivar(app);
      await fireEvent.changeText(screen.getByLabelText(TEXTO.etiquetaCorreo), CORREO);

      // 429: su message y el botón deshabilitado con la cuenta regresiva.
      await fireEvent.press(screen.getByRole('button', { name: TEXTO.pedirCodigo }));
      expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
      // El error vive en una región en vivo cortés (polite): TalkBack lo anuncia sin interrumpir.
      let region = screen.getByText(MENSAJE_LIMITE).parent;
      while (region && region.props.accessibilityLiveRegion === undefined) {
        region = region.parent;
      }
      expect(region?.props.accessibilityLiveRegion).toBe('polite');
      expect(screen.getByRole('button', { name: textoEsperaLimite(2) })).toBeDisabled();
      await avanzarSegundos(1);
      expect(screen.getByRole('button', { name: textoEsperaLimite(1) })).toBeDisabled();
      await avanzarSegundos(1);
      await fireEvent.press(screen.getByRole('button', { name: TEXTO.pedirCodigo }));
      expect(await screen.findByText(NEUTRO_SOLICITAR)).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', RUTA_SOLICITAR)).toHaveLength(2);

      // Otro código: primero la cuenta regresiva y, a los 60 s, el enlace.
      expect(screen.getByText(textoOtroCodigoEn(60))).toBeOnTheScreen();
      await avanzarSegundos(59);
      expect(screen.getByText(textoOtroCodigoEn(1))).toBeOnTheScreen();
      await avanzarSegundos(1);
      await fireEvent.press(await screen.findByRole('link', { name: TEXTO.otroCodigo }));
      await waitFor(() => expect(llamadasA(llamadas, 'POST', RUTA_SOLICITAR)).toHaveLength(3));
      expect(llamadasA(llamadas, 'POST', RUTA_SOLICITAR)[2].cuerpo).toEqual({ email: CORREO });
      expect(await screen.findByText(textoOtroCodigoEn(60))).toBeOnTheScreen();
      sinSesion();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'CUENTA_NO_ACTIVADA sigue en Activar, y otro 403 u otro error de Google no ofrecen Reactivar',
    async () => {
      const llamadas = simularServidorGoogle({
        'POST /api/auth/login': enOrden(
          () => respuesta({ statusCode: 403, message: 'Forbidden' }, 403),
          () => respuesta({ statusCode: 403, message: 'Sin permiso', code: 'OTRO_CODE' }, 403),
          cuentaSinActivar,
        ),
      });
      const app = await abrirAcceso();

      // 403 sin code y con otro code: sigue en Acceso con su mensaje, sin Reactivar.
      await entrarCon(CORREO, CLAVE);
      expect(await screen.findByText(/bloque/i)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: TEXTO.boton })).not.toBeOnTheScreen();
      expect(screen.queryByText(TEXTO.desactivada)).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
      await waitFor(() => expect(llamadasA(llamadas, 'POST', '/api/auth/login')).toHaveLength(2));
      expect(await screen.findByRole('button', { name: 'Entrar' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: TEXTO.boton })).not.toBeOnTheScreen();
      expect(app.getPathname()).toBe('/login');

      // Otro error de Google: el mensaje de siempre, sin Reactivar.
      navegadorRegresa(REGRESO_CON_ERROR);
      await tocarGoogle();
      expect(await screen.findByText(ERROR_GOOGLE)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: TEXTO.boton })).not.toBeOnTheScreen();

      // CUENTA_NO_ACTIVADA: Activar, como hoy.
      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
      await waitFor(() => expect(app.getPathname()).toBe('/activar'));
      expect(await screen.findByText('Activa tu cuenta')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: TEXTO.boton })).not.toBeOnTheScreen();
      sinSesion();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
