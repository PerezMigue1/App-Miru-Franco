/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { CLAVE, CORREO, cuentaSinActivar, RUTAS_DE_FONDO, USUARIO } from '../../helpers/datosClienta';
import { abrirAcceso, entrarCon, LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import { leerSecureStore } from '../../helpers/secureStore';
import { API, llamadasA, respuesta, servidorConRutas } from '../../helpers/servidorSimulado';

const simularServidor = servidorConRutas(RUTAS_DE_FONDO);

describe('Inicio de sesión con correo y contraseña (GP-05)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'con credenciales correctas entra, guarda la sesión en SecureStore y deja a la clienta en Inicio',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/login': () =>
          respuesta({
            success: true,
            token: 'token-ficticio',
            refreshToken: 'refresh-ficticio',
            refreshExpiraEn: '2026-11-18T12:00:00.000Z',
            usuario: USUARIO,
          }),
      });
      const app = await abrirAcceso();

      // El correo se envía recortado y en minúsculas, por el canal móvil y sin token.
      await entrarCon('  Clienta@Ejemplo.TEST ', CLAVE);

      await waitFor(() => expect(app.getPathname()).toBe('/inicio'));
      const login = llamadasA(llamadas, 'POST', '/api/auth/login');
      expect(login).toHaveLength(1);
      expect(login[0].cuerpo).toEqual(
        expect.objectContaining({ email: CORREO, password: CLAVE, canal: 'movil' }),
      );
      expect(login[0].cabeceras.Authorization).toBeUndefined();

      // Acceso salió de la pila: Inicio con sesión, sin invitación y con la foto en la cabecera.
      expect(await screen.findByRole('button', { name: 'Abrir perfil' })).toBeOnTheScreen();
      expect(screen.queryByText('Inicia sesión')).not.toBeOnTheScreen();
      expect(
        screen.queryByText('Crea tu cuenta para reservar citas y comprar'),
      ).not.toBeOnTheScreen();

      // Sesión guardada en una sola entrada de SecureStore, con el usuario normalizado.
      const guardado = leerSecureStore();
      expect(guardado.auth_sesion).toBeDefined();
      const sesion = JSON.parse(guardado.auth_sesion) as Record<string, unknown>;
      expect(sesion).toEqual(
        expect.objectContaining({
          token: 'token-ficticio',
          refreshToken: 'refresh-ficticio',
          refreshExpiraEn: Date.parse('2026-11-18T12:00:00.000Z'),
          usuario: { id: '41', nombre: 'Clienta Ficticia', email: CORREO, rol: 'cliente' },
        }),
      );
      expect(typeof sesion.emitidoEn).toBe('number');
      // Nunca se guarda la contraseña.
      expect(guardado.auth_sesion).not.toContain(CLAVE);

      // Las peticiones con sesión ya llevan el token.
      await waitFor(() => expect(llamadasA(llamadas, 'GET', '/api/carrito').length).toBeGreaterThan(0));
      for (const llamada of llamadasA(llamadas, 'GET', '/api/carrito')) {
        expect(llamada.cabeceras.Authorization).toBe('Bearer token-ficticio');
      }
      for (const llamada of llamadas) {
        expect(llamada.url.startsWith(`${API}/`)).toBe(true);
      }

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con credenciales incorrectas muestra un mensaje para la clienta y no guarda ninguna sesión',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/login': () =>
          respuesta({ statusCode: 401, message: 'Invalid credentials', code: 'CREDENCIALES' }, 401),
      });
      const app = await abrirAcceso();

      // Sin datos no se llama al servidor: cada campo dice qué falta.
      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
      expect(await screen.findByText('El correo electrónico es requerido')).toBeOnTheScreen();
      expect(screen.getByText('La contraseña es requerida')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/login')).toHaveLength(0);

      await entrarCon(CORREO, 'ClaveEquivocada9?');

      expect(await screen.findByText('Correo o contraseña incorrectos')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/login')).toHaveLength(1);
      // El texto técnico del servidor nunca llega a la pantalla.
      expect(screen.queryByText('Invalid credentials')).not.toBeOnTheScreen();
      // Sigue en Acceso, sin sesión: ni token en SecureStore ni foto en la cabecera.
      expect(app.getPathname()).toBe('/login');
      expect(leerSecureStore().auth_sesion).toBeUndefined();
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Abrir perfil' })).not.toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'una cuenta sin activar lleva a Activar con el correo escrito y sin sesión',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/login': cuentaSinActivar,
      });
      const app = await abrirAcceso();

      await entrarCon(CORREO, CLAVE);

      await waitFor(() => expect(app.getPathname()).toBe('/activar'));
      expect(llamadasA(llamadas, 'POST', '/api/auth/login')).toHaveLength(1);
      expect(await screen.findByText('Activa tu cuenta')).toBeOnTheScreen();
      expect(
        screen.getByText(`Escribe el código de 6 dígitos que enviamos a ${CORREO}.`),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText('Código de verificación')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Verificar código' })).toBeOnTheScreen();
      // Desde el login no se acaba de enviar un código: se puede pedir uno de inmediato.
      expect(screen.getByRole('link', { name: 'Reenviar código' })).toBeOnTheScreen();
      expect(screen.queryByText(/Podrás pedir otro código/)).not.toBeOnTheScreen();
      // No se mostró el aviso de error del login ni se guardó una sesión.
      expect(screen.queryByText('Correo o contraseña incorrectos')).not.toBeOnTheScreen();
      expect(leerSecureStore().auth_sesion).toBeUndefined();

      // "Volver a iniciar sesión" regresa a Acceso con el correo escrito.
      await fireEvent.press(screen.getByRole('link', { name: 'Volver a iniciar sesión' }));
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      expect(screen.getByLabelText('Correo electrónico')).toHaveProp('value', CORREO);
      expect(screen.getByLabelText('Contraseña')).toHaveProp('value', '');

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
