/// <reference types="jest" />

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
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
const CODIGO = '123456';

const USUARIO = { id: 41, nombre: 'Clienta Ficticia', email: CORREO, rol: 'cliente' };

const MENSAJE_CODIGO_INCORRECTO =
  'El código es incorrecto o ha expirado. Solicita uno nuevo con «Reenviar código».';
const MENSAJE_NEUTRO =
  'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña';

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

/** 403 del login para una cuenta que todavía no se activa con el código del correo. */
function cuentaSinActivar(): Response {
  return respuesta(
    {
      statusCode: 403,
      message: 'Tu cuenta no está activada. Revisa tu correo para activar tu cuenta.',
    },
    403,
  );
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

/** Respuestas en orden: cada llamada toma la siguiente y la última se repite. */
function enOrden(...respuestas: (() => Response)[]): Manejador {
  let vez = 0;
  return () => {
    const actual = respuestas[Math.min(vez, respuestas.length - 1)];
    vez += 1;
    return actual();
  };
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

/** Desde Acceso, una cuenta sin activar abre Activar con su correo. */
async function llegarAActivar(app: App): Promise<void> {
  await entrarCon(CORREO, CLAVE);
  await waitFor(() => expect(app.getPathname()).toBe('/activar'));
  expect(await screen.findByText('Activa tu cuenta')).toBeOnTheScreen();
  expect(
    screen.getByText(`Escribe el código de 6 dígitos que enviamos a ${CORREO}.`),
  ).toBeOnTheScreen();
}

describe('Activar la cuenta y recuperar la contraseña (GP-05)', () => {
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
    'con el código correcto activa la cuenta, vuelve a Acceso con el aviso y la clienta ya puede entrar',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/login': enOrden(cuentaSinActivar, () =>
          respuesta({
            success: true,
            token: 'token-ficticio',
            refreshToken: 'refresh-ficticio',
            usuario: USUARIO,
          }),
        ),
        'POST /api/auth/verificar-otp': () =>
          respuesta({ success: true, message: 'Cuenta activada' }),
      });
      const app = await abrirAcceso();
      await llegarAActivar(app);

      // Sin los 6 dígitos no se llama al servidor.
      await fireEvent.press(screen.getByRole('button', { name: 'Verificar código' }));
      expect(await screen.findByText('El código debe tener 6 dígitos')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/verificar-otp')).toHaveLength(0);

      // Pegado con espacios: el campo deja solo los dígitos.
      await fireEvent.changeText(screen.getByLabelText('Código de verificación'), '123 456');
      expect(screen.getByLabelText('Código de verificación')).toHaveProp('value', CODIGO);
      expect(screen.queryByText('El código debe tener 6 dígitos')).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Verificar código' }));

      // Regresa a Acceso con el aviso de cuenta activada y el correo escrito.
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      const verificaciones = llamadasA(llamadas, 'POST', '/api/auth/verificar-otp');
      expect(verificaciones).toHaveLength(1);
      expect(verificaciones[0].cuerpo).toEqual({ email: CORREO, codigo: CODIGO });
      expect(verificaciones[0].cabeceras.Authorization).toBeUndefined();
      expect(await screen.findByText('Tu cuenta está activada. Inicia sesión.')).toBeOnTheScreen();
      expect(screen.getByLabelText('Correo electrónico')).toHaveProp('value', CORREO);
      expect(screen.getByLabelText('Contraseña')).toHaveProp('value', '');
      expect(leerSecureStore().auth_sesion).toBeUndefined();

      // Con la cuenta activa, la clienta entra y llega a Inicio con sesión.
      await fireEvent.changeText(screen.getByLabelText('Contraseña'), CLAVE);
      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
      await waitFor(() => expect(app.getPathname()).toBe('/inicio'));
      expect(llamadasA(llamadas, 'POST', '/api/auth/login')).toHaveLength(2);
      expect(await screen.findByRole('button', { name: 'Abrir perfil' })).toBeOnTheScreen();
      expect(leerSecureStore().auth_sesion).toBeDefined();

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );

  it(
    'con un código incorrecto muestra un mensaje para la clienta, sigue en Activar y permite pedir otro código',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/login': cuentaSinActivar,
        'POST /api/auth/verificar-otp': () =>
          respuesta({ statusCode: 400, message: 'Invalid or expired OTP' }, 400),
        'POST /api/auth/reenviar-codigo': () =>
          respuesta({ success: true, message: 'Código reenviado' }),
      });
      const app = await abrirAcceso();
      await llegarAActivar(app);

      await fireEvent.changeText(screen.getByLabelText('Código de verificación'), '654321');
      await fireEvent.press(screen.getByRole('button', { name: 'Verificar código' }));

      expect(await screen.findByText(MENSAJE_CODIGO_INCORRECTO)).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/verificar-otp')).toHaveLength(1);
      expect(llamadasA(llamadas, 'POST', '/api/auth/verificar-otp')[0].cuerpo).toEqual({
        email: CORREO,
        codigo: '654321',
      });
      // El texto técnico del servidor nunca llega a la pantalla y la clienta sigue en Activar.
      expect(screen.queryByText('Invalid or expired OTP')).not.toBeOnTheScreen();
      expect(app.getPathname()).toBe('/activar');
      expect(screen.getByRole('button', { name: 'Verificar código' })).toBeOnTheScreen();
      expect(leerSecureStore().auth_sesion).toBeUndefined();

      // "Reenviar código" pide otro al servidor, limpia el campo y arranca la espera.
      await fireEvent.press(screen.getByRole('link', { name: 'Reenviar código' }));
      expect(
        await screen.findByText('Te enviamos un código nuevo. Revisa tu correo.'),
      ).toBeOnTheScreen();
      const reenvios = llamadasA(llamadas, 'POST', '/api/auth/reenviar-codigo');
      expect(reenvios).toHaveLength(1);
      expect(reenvios[0].cuerpo).toEqual({ email: CORREO });
      expect(screen.queryByText(MENSAJE_CODIGO_INCORRECTO)).not.toBeOnTheScreen();
      expect(screen.getByLabelText('Código de verificación')).toHaveProp('value', '');
      expect(screen.getByText(/^Podrás pedir otro código en \d+ s$/)).toBeOnTheScreen();
      expect(screen.queryByRole('link', { name: 'Reenviar código' })).not.toBeOnTheScreen();

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );

  it(
    'recuperar contraseña de inicio a fin: valida el correo, pide el enlace y vuelve a Acceso',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/solicitar-enlace-recuperacion': () =>
          respuesta({ success: true, message: 'Enlace enviado' }),
      });
      const app = await abrirAcceso();

      await fireEvent.press(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }));
      await waitFor(() => expect(app.getPathname()).toBe('/recuperar'));
      expect(await screen.findByText('Recupera tu contraseña')).toBeOnTheScreen();

      // Vacío y mal escrito: lo dice el campo y no se llama al servidor.
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByText('El correo electrónico es requerido')).toBeOnTheScreen();
      await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'clienta@ejemplo');
      expect(screen.queryByText('El correo electrónico es requerido')).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByText('El correo electrónico no es válido')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/solicitar-enlace-recuperacion')).toHaveLength(0);

      // Correo válido: se envía normalizado y se muestra el mensaje neutro.
      await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), ' Clienta@Ejemplo.test ');
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByText(MENSAJE_NEUTRO)).toBeOnTheScreen();
      const solicitudes = llamadasA(llamadas, 'POST', '/api/auth/solicitar-enlace-recuperacion');
      expect(solicitudes).toHaveLength(1);
      expect(solicitudes[0].cuerpo).toEqual({ email: CORREO });
      expect(solicitudes[0].cabeceras.Authorization).toBeUndefined();
      expect(screen.queryByText('Enlace enviado')).not.toBeOnTheScreen();
      expect(app.getPathname()).toBe('/recuperar');

      // "Volver a iniciar sesión" regresa a Acceso.
      await fireEvent.press(screen.getByRole('link', { name: 'Volver a iniciar sesión' }));
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      expect(leerSecureStore().auth_sesion).toBeUndefined();

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );

  it(
    'recuperar no revela si el correo tiene cuenta y avisa cuando hay demasiados intentos',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/solicitar-enlace-recuperacion': enOrden(
          () => respuesta({ statusCode: 404, message: 'User not found' }, 404),
          () => respuesta({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }, 429),
        ),
      });
      const app = await abrirAcceso();
      await fireEvent.press(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }));
      await waitFor(() => expect(app.getPathname()).toBe('/recuperar'));
      expect(await screen.findByText('Recupera tu contraseña')).toBeOnTheScreen();

      // Un correo sin cuenta (404) recibe el mismo mensaje neutro.
      await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'nadie@ejemplo.test');
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByText(MENSAJE_NEUTRO)).toBeOnTheScreen();
      expect(screen.queryByText('User not found')).not.toBeOnTheScreen();

      // Con el límite del servidor (429) se pide esperar, sin el texto técnico.
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByText('Demasiados intentos, espera un minuto')).toBeOnTheScreen();
      expect(screen.queryByText(MENSAJE_NEUTRO)).not.toBeOnTheScreen();
      expect(
        screen.queryByText('ThrottlerException: Too Many Requests'),
      ).not.toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/solicitar-enlace-recuperacion')).toHaveLength(2);

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );
});
