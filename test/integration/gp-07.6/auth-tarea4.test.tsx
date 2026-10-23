/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { abrirAcceso, abrirApp, cerrarIntroSiAparece, LIMITE_MS, type App } from '../../helpers/pantallas';
import { entrarConGoogle, prepararPruebasGoogle, simularServidorGoogle } from '../../helpers/pantallasGoogle';
import { CLIENTA, PERFIL_COMPLETO, respuestaPerfil, simularServidorPerfil } from '../../helpers/perfilClienta';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';

jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.6 Tarea 4 con las pantallas reales (renderRouter sobre src/app), servidor, navegador y
 * expo-crypto simulados, datos ficticios:
 * - Al entrar con una sesión guardada sale UN solo GET /api/auth/me (useAuth y la foto de la
 *   cabecera comparten la respuesta).
 * - Recuperar contraseña muestra siempre la nota para las cuentas de Google, responda lo que
 *   responda el servidor (que no dice si el correo existe), y deja entrar con Google ahí mismo.
 */

const NOTA_GOOGLE = RESPALDO_TEXTOS['auth.recuperar.notaGoogle'];
const MENSAJE_NEUTRO = 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña';
const RUTA_RECUPERAR = '/api/auth/solicitar-enlace-recuperacion';
const FOTO = 'https://res.cloudinary.com/nube-ficticia/image/upload/v1/avatares/clienta-tarea4.jpg';

/** Desde Acceso abre Recuperar contraseña. */
async function abrirRecuperar(app: App): Promise<void> {
  await fireEvent.press(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }));
  await waitFor(() => expect(app.getPathname()).toBe('/recuperar'));
  expect(await screen.findByText('Recupera tu contraseña')).toBeOnTheScreen();
}

describe('GP-07.6 Tarea 4: perfil al entrar y recuperar contraseña', () => {
  const esperarConsolaLimpia = prepararPruebasGoogle();

  it(
    'al entrar con la sesión guardada sale un solo GET /api/auth/me y la cabecera muestra la foto',
    async () => {
      await sembrarSesion(CLIENTA);
      const llamadas = simularServidorPerfil({
        'GET /api/auth/me': () => respuestaPerfil({ ...PERFIL_COMPLETO, foto: FOTO }),
      });
      await abrirApp('/inicio');
      await cerrarIntroSiAparece();

      const boton = await screen.findByRole('button', { name: 'Abrir perfil' });
      await waitFor(() =>
        expect(boton.queryAll((nodo) => JSON.stringify(nodo.props.source ?? null).includes(FOTO)).length).toBeGreaterThan(0),
      );
      expect(llamadasA(llamadas, 'GET', '/api/auth/me')).toHaveLength(1);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, () => Response]>([
    ['200', () => respuesta({ success: true, message: 'Enlace enviado' })],
    ['404 (el correo no tiene cuenta)', () => respuesta({ statusCode: 404, message: 'User not found' }, 404)],
    ['400 (cuenta de Google)', () => respuesta({ statusCode: 400, message: 'Cuenta de Google sin contraseña' }, 400)],
  ])(
    'recuperar con respuesta %s: la nota de Google se ve antes y después de enviar, igual',
    async (_caso, responder) => {
      const llamadas = simularServidorGoogle({ [`POST ${RUTA_RECUPERAR}`]: responder });
      const app = await abrirAcceso();
      await abrirRecuperar(app);

      expect(screen.getByText(NOTA_GOOGLE)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled();

      await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'clienta@ejemplo.test');
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByText(MENSAJE_NEUTRO)).toBeOnTheScreen();
      expect(screen.getByText(NOTA_GOOGLE)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled();
      expect(screen.queryByText('User not found')).not.toBeOnTheScreen();
      expect(screen.queryByText('Cuenta de Google sin contraseña')).not.toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', RUTA_RECUPERAR)).toHaveLength(1);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'desde recuperar contraseña la clienta entra con Google y llega a Inicio con sesión',
    async () => {
      const llamadas = simularServidorGoogle();
      const app = await abrirAcceso();
      await abrirRecuperar(app);

      await entrarConGoogle(app, llamadas);
      expect(llamadasA(llamadas, 'POST', RUTA_RECUPERAR)).toHaveLength(0);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
