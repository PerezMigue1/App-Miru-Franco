/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, screen } from 'expo-router/testing-library';

import {
  abrirSesionSimulada,
  navegadorRegresa,
  navegadorSeCierra,
  REGRESO_CON_ERROR,
} from '../../helpers/google';
import { abrirAcceso, abrirDesdeBienvenida, LIMITE_MS, type App } from '../../helpers/pantallas';
import {
  BOTON_GOOGLE_ABRIENDO,
  entrarConGoogle,
  ERROR_GOOGLE,
  prepararPruebasGoogle,
  sigueSinSesion,
  simularServidorGoogle,
  tocarGoogle,
} from '../../helpers/pantallasGoogle';

jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-05.3: inicio de sesión con Google con las pantallas reales (renderRouter sobre src/app). El
 * navegador (expo-web-browser), expo-crypto y el servidor están simulados: nada sale a la red ni abre
 * un navegador. Desde Acceso y desde Crear cuenta, "Continuar con Google" abre Google con PKCE, el
 * regreso con código se canjea con el verifier por el canal móvil y la clienta llega a Inicio con
 * sesión. Cerrar el navegador no muestra error; un regreso con error sí, en español.
 */

/** Pantallas desde las que se toca Google: botón de la hoja de bienvenida, ruta y título. */
const ENTRADAS: [string, string, string][] = [
  ['Iniciar sesión', '/login', 'Inicia sesión'],
  ['Crear cuenta', '/registro', 'Crea tu cuenta'],
];

/** Abre la app sin sesión y, desde la hoja de bienvenida, llega a la pantalla indicada. */
async function abrirPantalla(boton: string, ruta: string, titulo: string): Promise<App> {
  const app = await abrirDesdeBienvenida(boton, ruta);
  expect(await screen.findByText(titulo)).toBeOnTheScreen();
  return app;
}

describe('Inicio de sesión con Google (GP-05.3)', () => {
  const esperarConsolaLimpia = prepararPruebasGoogle();

  it.each(ENTRADAS)(
    'desde la hoja con "%s" (%s), Google regresa con código y la clienta llega a Inicio con sesión',
    async (boton, ruta, titulo) => {
      const llamadas = simularServidorGoogle();
      const app = await abrirPantalla(boton, ruta, titulo);

      await entrarConGoogle(app, llamadas);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si la clienta cierra el navegador, sigue en Acceso sin mensaje, sin canje y sin sesión',
    async () => {
      const llamadas = simularServidorGoogle();
      const app = await abrirAcceso();
      // El navegador se queda abierto hasta que la prueba lo cierra.
      let cerrarNavegador: (resultado: { type: string }) => void = () => undefined;
      abrirSesionSimulada().mockImplementationOnce(
        () => new Promise((resolver) => {
          cerrarNavegador = resolver;
        }),
      );

      await tocarGoogle();
      expect(await screen.findByRole('button', { name: BOTON_GOOGLE_ABRIENDO })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();

      await act(async () => {
        cerrarNavegador({ type: 'cancel' });
      });

      await sigueSinSesion(app, '/login', llamadas);
      expect(screen.queryByText(ERROR_GOOGLE)).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
      expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'un regreso con error muestra el mensaje en español y no guarda ninguna sesión',
    async () => {
      const llamadas = simularServidorGoogle();
      const app = await abrirAcceso();
      navegadorRegresa(REGRESO_CON_ERROR);

      await tocarGoogle();

      expect(await screen.findByText(ERROR_GOOGLE)).toBeOnTheScreen();
      await sigueSinSesion(app, '/login', llamadas);
      // El código de error del regreso nunca llega a la pantalla.
      expect(screen.queryByText(/acceso_denegado/)).not.toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  /**
   * Cuenta de Google nueva. Hoy el backend no crea la cuenta en el callback de origen app: redirige
   * el navegador a la página web /auth/completar-registro (términos, aviso y consentimientos). Al
   * aceptar, la web responde sin sesión ("Tu cuenta quedó creada. Vuelve a la app y entra con
   * Google.") y su enlace abre appmirufranco://, que no es el regreso de Google: para la app el
   * navegador se cierra sin código ('dismiss'). Ya registrada, la clienta vuelve a tocar Google y
   * esta vez el backend regresa con código.
   */
  it(
    'una cuenta nueva que completa el registro en la web vuelve sin código y entra al segundo intento',
    async () => {
      const llamadas = simularServidorGoogle();
      const app = await abrirPantalla('Crear cuenta', '/registro', 'Crea tu cuenta');

      // Primer intento: la clienta acepta en la web y regresa sin código.
      navegadorSeCierra('dismiss');
      await tocarGoogle();

      await sigueSinSesion(app, '/registro', llamadas);
      expect(screen.queryByText(ERROR_GOOGLE)).not.toBeOnTheScreen();

      // Segundo intento, con la cuenta ya creada: entra con sesión.
      await entrarConGoogle(app, llamadas);
      expect(abrirSesionSimulada()).toHaveBeenCalledTimes(2);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
