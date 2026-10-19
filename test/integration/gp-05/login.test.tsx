/// <reference types="jest" />

import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import type { TestInstance } from 'test-renderer';

import { cerrarRouter, iniciarRouter } from '../../helpers/router';
import { leerSecureStore } from '../../helpers/secureStore';

/**
 * expo-router/testing-library carga build/testing-library/mocks.js, que vuelve a registrar el mock de
 * react-native-reanimated con el mock básico de la librería y reemplaza al de test/setup.ts (la app
 * no carga sin cubicBezier, steps, linear y useReducedMotion). Se sustituye ese archivo por lo mismo
 * que hace, salvo lo de Reanimated (ver GP-02).
 */
jest.mock('expo-router/build/testing-library/mocks', () => {
  require('react-native-gesture-handler/jestSetup');
  return {};
});

jest.mock('expo-linking', () => ({
  ...jest.requireActual<object>('expo-linking'),
  createURL: (ruta: string) => `appmirufranco://${ruta}`,
  resolveScheme: () => 'appmirufranco',
  addEventListener: () => ({ remove: () => undefined }),
}));

const API = 'http://api.test';

/** Límite amplio: sin caché de Jest, renderRouter transforma todas las rutas de src/app (ver GP-02). */
const LIMITE_MS = 180_000;

const CORREO = 'clienta@ejemplo.test';
const CLAVE = 'ClaveFicticia1!';

/** Clienta ficticia que devuelve el servidor simulado. */
const USUARIO = { id: 41, nombre: 'Clienta Ficticia', email: CORREO, rol: 'cliente' };

/** Respuesta mínima con lo que lee apiClient (ok, status y text()), más json() y headers. */
function respuesta(cuerpo: unknown, status = 200): Response {
  const textoCuerpo = JSON.stringify(cuerpo);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: () => Promise.resolve(textoCuerpo),
    json: () => Promise.resolve(JSON.parse(textoCuerpo) as unknown),
  } as unknown as Response;
}

function urlDe(entrada: unknown): string {
  if (typeof entrada === 'string') {
    return entrada;
  }
  if (entrada instanceof URL) {
    return entrada.href;
  }
  return (entrada as { url: string }).url;
}

type Manejador = (cuerpo: unknown) => Response;

/** Lo que piden las pantallas de fondo (catálogos públicos, carrito y perfil con sesión). */
const RUTAS_BASE: Record<string, Manejador> = {
  'GET /api/servicios': () => respuesta({ success: true, data: [] }),
  'GET /api/productos': () => respuesta({ success: true, count: 0, data: [] }),
  'GET /api/carrito': () => respuesta({ success: true, count: 0, data: [] }),
  'GET /api/auth/me': () => respuesta({ data: USUARIO }),
};

interface Llamada {
  metodo: string;
  url: string;
  cuerpo: unknown;
  cabeceras: Record<string, string>;
}

/**
 * Servidor simulado: responde por "MÉTODO /ruta" y 404 a todo lo demás. Nunca sale a la red. Devuelve
 * la lista de llamadas para revisar qué se envió.
 */
function simularServidor(rutas: Record<string, Manejador>): Llamada[] {
  const llamadas: Llamada[] = [];
  const todas = { ...RUTAS_BASE, ...rutas };
  globalThis.fetch = jest.fn((entrada: unknown, init?: RequestInit) => {
    const url = urlDe(entrada);
    const metodo = init?.method ?? 'GET';
    const cuerpo = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    llamadas.push({
      metodo,
      url,
      cuerpo,
      cabeceras: (init?.headers ?? {}) as Record<string, string>,
    });
    const ruta = url.startsWith(API) ? url.slice(API.length) : url;
    const manejador = todas[`${metodo} ${ruta}`];
    return Promise.resolve(manejador ? manejador(cuerpo) : respuesta({ message: 'No encontrado' }, 404));
  }) as unknown as typeof fetch;
  return llamadas;
}

function llamadasA(llamadas: Llamada[], metodo: string, ruta: string): Llamada[] {
  return llamadas.filter((l) => l.metodo === metodo && l.url === `${API}${ruta}`);
}

/** Capa de la intro de la grieta (IntroGrieta): oculta a TalkBack y con onLayout (ver GP-02). */
function capasIntro(): TestInstance[] {
  return screen.container.queryAll(
    (nodo) =>
      typeof nodo.type === 'string' &&
      nodo.props.accessibilityElementsHidden === true &&
      nodo.props.importantForAccessibility === 'no-hide-descendants' &&
      typeof nodo.props.onLayout === 'function',
  );
}

/** Último botón con ese nombre: el de la hoja de bienvenida (su Modal va después del Stack). */
function botonDeHoja(nombre: string): TestInstance {
  const botones = screen.getAllByRole('button', { name: nombre });
  return botones[botones.length - 1];
}

interface App {
  getPathname: () => string;
}

/**
 * Abre la app sin sesión en '/', cierra la intro de la grieta si aparece y, desde la hoja de
 * bienvenida, toca "Iniciar sesión": queda en Acceso, encima de la pestaña Inicio.
 */
async function abrirAcceso(): Promise<App> {
  expect(leerSecureStore()).toEqual({});
  const app = iniciarRouter('src/app', { initialUrl: '/' });
  await app;
  expect(await screen.findByText('Crea tu cuenta para reservar citas y comprar')).toBeOnTheScreen();

  // La intro sale una sola vez por proceso de JS: solo la primera prueba del archivo la ve.
  const intro = capasIntro();
  expect(intro.length).toBeLessThanOrEqual(1);
  if (intro.length === 1) {
    await fireEvent.layout(intro[0], { x: 0, y: 0, width: 390, height: 844 });
  }
  await waitFor(() => expect(capasIntro()).toHaveLength(0));

  expect(await screen.findByText('Te damos la bienvenida a Mirú Franco')).toBeOnTheScreen();
  await fireEvent.press(botonDeHoja('Iniciar sesión'));
  await waitFor(() => expect(app.getPathname()).toBe('/login'));
  expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
  return { getPathname: () => app.getPathname() };
}

/** Escribe correo y contraseña en el formulario de Acceso y toca "Entrar". */
async function entrarCon(correo: string, clave: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), correo);
  await fireEvent.changeText(screen.getByLabelText('Contraseña'), clave);
  await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
}

describe('Inicio de sesión con correo y contraseña (GP-05)', () => {
  let espiaError: jest.SpyInstance;
  let espiaAviso: jest.SpyInstance;

  beforeEach(() => {
    espiaError = jest.spyOn(console, 'error');
    espiaAviso = jest.spyOn(console, 'warn');
  });

  afterEach(async () => {
    // Desmonta y corre lo pendiente con los temporizadores falsos y luego vuelve a los reales.
    await cerrarRouter();
    espiaError.mockRestore();
    espiaAviso.mockRestore();
  });

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

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
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

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );

  it(
    'una cuenta sin activar lleva a Activar con el correo escrito y sin sesión',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/login': () =>
          respuesta(
            {
              statusCode: 403,
              message: 'Tu cuenta no está activada. Revisa tu correo para activar tu cuenta.',
            },
            403,
          ),
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

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );
});
