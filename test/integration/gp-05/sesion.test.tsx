/// <reference types="jest" />

import * as SecureStore from 'expo-secure-store';
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

/**
 * GP-05: sesión de la clienta con las pantallas reales (renderRouter sobre src/app) y solo el
 * servidor simulado. Abrir la app con una sesión guardada la restaura; un 401 con renovación
 * exitosa repite la petición; un 401 con la renovación rechazada cierra la sesión y la app vuelve a
 * Inicio sin sesión; "Cerrar sesión" en Perfil borra el token y lo revoca en el servidor.
 */

const API = 'http://api.test';
const RUTA_RENOVAR = '/api/auth/movil/renovar';
const CLAVE_SESION = 'auth_sesion';
const AVISO_SESION_TERMINADA = 'Tu sesión terminó. Inicia sesión de nuevo.';
const INVITACION_INICIO = 'Crea tu cuenta para reservar citas y comprar';

/** Límite amplio: sin caché de Jest, renderRouter transforma todas las rutas de src/app (ver GP-02). */
const LIMITE_MS = 180_000;

function base64Url(texto: string): string {
  return btoa(texto).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** JWT armado a mano con datos falsos: 15 minutos de vida (exp menos iat). */
function jwtFicticio(nombre: string): string {
  const cabecera = base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const datos = base64Url(JSON.stringify({ sub: nombre, iat: 1_000, exp: 1_000 + 15 * 60 }));
  return `${cabecera}.${datos}.firma-ficticia`;
}

const USUARIO = {
  id: 'clienta-ficticia-1',
  nombre: 'Clienta Guardada',
  email: 'clienta@ejemplo.test',
  rol: 'cliente',
};

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

const SERVICIOS = {
  success: true,
  data: [{ id: 1, nombre: 'Corte y peinado', precio: '350', duracionMinutos: 60, activo: true }],
};

const PRODUCTOS = {
  success: true,
  count: 1,
  data: [
    {
      id: 7,
      nombre: 'Shampoo de prueba',
      marca: 'Marca de prueba',
      presentaciones: [{ id: 1, tamanio: '500ml', precio: '380', stock: 3, disponible: true }],
    },
  ],
};

function urlDe(entrada: unknown): string {
  if (typeof entrada === 'string') {
    return entrada;
  }
  if (entrada instanceof URL) {
    return entrada.href;
  }
  return (entrada as { url: string }).url;
}

interface Llamada {
  ruta: string;
  metodo: string;
  auth: string | undefined;
  cuerpo: unknown;
}

interface ServidorSimulado {
  fetch: jest.Mock;
  llamadas: () => Llamada[];
  llamadasA: (ruta: string) => Llamada[];
}

interface OpcionesServidor {
  /** Acceso que el servidor acepta en las rutas protegidas; cualquier otro recibe 401. */
  tokenValido: string;
  /** Resultado de POST /api/auth/movil/renovar. */
  renovar?: { token: string; refreshToken: string } | 'rechazo';
  /** Nombre que devuelve GET /api/auth/me. */
  nombre?: string;
}

/**
 * fetch simulado: catálogos públicos, renovación móvil, logout y las rutas protegidas que pide la app
 * con sesión (/api/auth/me y /api/carrito). Nunca sale a la red.
 */
function simularServidor(opciones: OpcionesServidor): ServidorSimulado {
  let tokenValido = opciones.tokenValido;
  const fetchSimulado = jest.fn((entrada: unknown, init: RequestInit = {}) => {
    const url = urlDe(entrada);
    const ruta = url.startsWith(API) ? url.slice(API.length) : url;
    const metodo = init.method ?? 'GET';
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
    if (ruta === '/api/servicios') {
      return Promise.resolve(respuesta(SERVICIOS));
    }
    if (ruta === '/api/productos') {
      return Promise.resolve(respuesta(PRODUCTOS));
    }
    if (ruta === RUTA_RENOVAR && metodo === 'POST') {
      const renovar = opciones.renovar ?? 'rechazo';
      if (renovar === 'rechazo') {
        return Promise.resolve(respuesta({ message: 'Sesión revocada', code: 'SESION_REVOCADA' }, 401));
      }
      tokenValido = renovar.token;
      return Promise.resolve(respuesta(renovar));
    }
    if (ruta === '/api/auth/logout') {
      return Promise.resolve(respuesta({ success: true }));
    }
    if (auth !== `Bearer ${tokenValido}`) {
      return Promise.resolve(respuesta({ message: 'Token vencido' }, 401));
    }
    if (ruta === '/api/auth/me') {
      return Promise.resolve(respuesta({ data: { ...USUARIO, nombre: opciones.nombre ?? USUARIO.nombre } }));
    }
    if (ruta === '/api/carrito') {
      return Promise.resolve(respuesta({ success: true, count: 0, data: [] }));
    }
    return Promise.resolve(respuesta({ message: 'No encontrado' }, 404));
  });
  globalThis.fetch = fetchSimulado as unknown as typeof fetch;

  const llamadas = (): Llamada[] =>
    (fetchSimulado.mock.calls as unknown as [unknown, RequestInit | undefined][]).map(([entrada, init]) => {
      const url = urlDe(entrada);
      return {
        ruta: url.startsWith(API) ? url.slice(API.length) : url,
        metodo: init?.method ?? 'GET',
        auth: (init?.headers as Record<string, string> | undefined)?.Authorization,
        cuerpo: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      };
    });
  return {
    fetch: fetchSimulado,
    llamadas,
    llamadasA: (ruta) => llamadas().filter((llamada) => llamada.ruta === ruta),
  };
}

interface SesionSembrada {
  token: string;
  refreshToken: string;
}

/**
 * Siembra en SecureStore una sesión móvil vigente, como la que deja un inicio de sesión anterior,
 * y marca la bienvenida como vista (la clienta ya abrió la app antes).
 */
let sembradas = 0;

async function sembrarSesion(): Promise<SesionSembrada> {
  // apiClient recuerda en memoria el último refreshToken consumido (y los módulos se comparten entre
  // las pruebas de este archivo): cada prueba siembra uno distinto.
  sembradas += 1;
  const sesion = {
    token: jwtFicticio(`clienta-ficticia-1-${sembradas}`),
    refreshToken: `refresh-ficticio-guardado-${sembradas}`,
    emitidoEn: Date.now(),
    usuario: USUARIO,
  };
  await SecureStore.setItemAsync(CLAVE_SESION, JSON.stringify(sesion));
  await SecureStore.setItemAsync('bienvenida_vista', '1');
  return { token: sesion.token, refreshToken: sesion.refreshToken };
}

function sesionGuardada(): { token: string; refreshToken?: string; usuario: { nombre: string } } | null {
  const texto = leerSecureStore()[CLAVE_SESION];
  return texto === undefined ? null : (JSON.parse(texto) as { token: string; refreshToken?: string; usuario: { nombre: string } });
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

/** La intro sale una vez por proceso de JS: si sigue a la vista, se le manda la medida y termina. */
async function cerrarIntroSiAparece(): Promise<void> {
  const intro = capasIntro();
  if (intro.length === 1) {
    await fireEvent.layout(intro[0], { x: 0, y: 0, width: 390, height: 844 });
  }
  await waitFor(() => expect(capasIntro()).toHaveLength(0));
}

interface App {
  getPathname: () => string;
}

/** Abre la app real en la ruta indicada y cierra la intro. */
async function abrirApp(ruta: string): Promise<App> {
  const app = iniciarRouter('src/app', { initialUrl: ruta });
  await app;
  return { getPathname: () => app.getPathname() };
}

/** Último botón con ese nombre: el de la hoja (su Modal va después del Stack en el árbol). */
function ultimoBoton(nombre: string): TestInstance {
  const botones = screen.getAllByRole('button', { name: nombre });
  return botones[botones.length - 1];
}

describe('Sesión con las pantallas reales (GP-05)', () => {
  let espiaError: jest.SpyInstance;
  let espiaAviso: jest.SpyInstance;

  beforeEach(() => {
    // Ningún aviso de React ni de la app debe salir durante estas pruebas.
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
    'abrir la app con una sesión guardada la restaura y la valida con /api/auth/me',
    async () => {
      const sesion = await sembrarSesion();
      const servidor = simularServidor({ tokenValido: sesion.token, nombre: 'Clienta Restaurada' });

      const app = await abrirApp('/');
      await cerrarIntroSiAparece();

      // Con sesión, la cabecera muestra la foto (o las iniciales) en lugar de "Iniciar sesión".
      expect(await screen.findByRole('button', { name: 'Abrir perfil' })).toBeOnTheScreen();
      expect(app.getPathname()).toBe('/inicio');
      expect(screen.queryByText(INVITACION_INICIO)).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeOnTheScreen();
      expect(screen.queryByText(AVISO_SESION_TERMINADA)).not.toBeOnTheScreen();

      // /me salió con el acceso guardado y el nombre nuevo quedó en la sesión guardada.
      await waitFor(() => expect(sesionGuardada()?.usuario.nombre).toBe('Clienta Restaurada'));
      const me = servidor.llamadasA('/api/auth/me');
      expect(me.length).toBeGreaterThan(0);
      for (const llamada of me) {
        expect(llamada.auth).toBe(`Bearer ${sesion.token}`);
      }
      expect(servidor.llamadasA(RUTA_RENOVAR)).toHaveLength(0);
      expect(sesionGuardada()).toMatchObject({ token: sesion.token, refreshToken: sesion.refreshToken });

      // Perfil muestra los datos de la cuenta y la opción de cerrar sesión.
      await fireEvent.press(screen.getByRole('button', { name: 'Abrir perfil' }));
      await waitFor(() => expect(app.getPathname()).toBe('/perfil'));
      expect(await screen.findByText('Clienta Restaurada')).toBeOnTheScreen();
      expect(screen.getByText('clienta@ejemplo.test')).toBeOnTheScreen();
      expect(screen.getByText('Cerrar sesión')).toBeOnTheScreen();

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );

  it(
    'un 401 con renovación exitosa guarda los tokens nuevos y repite la petición',
    async () => {
      const sesion = await sembrarSesion();
      const nuevo = { token: jwtFicticio('clienta-ficticia-1-renovada'), refreshToken: 'refresh-ficticio-rotado' };
      // El servidor ya no acepta el acceso guardado: solo el que entrega la renovación.
      const servidor = simularServidor({ tokenValido: 'acceso-que-aun-no-existe', renovar: nuevo, nombre: 'Clienta Renovada' });

      const app = await abrirApp('/perfil');
      await cerrarIntroSiAparece();

      // Perfil pinta los datos de /me: la petición rechazada se repitió con el acceso nuevo.
      expect(await screen.findByText('Clienta Renovada')).toBeOnTheScreen();
      expect(app.getPathname()).toBe('/perfil');
      expect(screen.getByText('Cerrar sesión')).toBeOnTheScreen();
      expect(screen.queryByText(AVISO_SESION_TERMINADA)).not.toBeOnTheScreen();

      // Una sola renovación con el refreshToken guardado, aunque varias peticiones recibieron 401.
      const renovaciones = servidor.llamadasA(RUTA_RENOVAR);
      expect(renovaciones).toHaveLength(1);
      expect(renovaciones[0]).toMatchObject({
        metodo: 'POST',
        auth: undefined,
        cuerpo: { refreshToken: sesion.refreshToken },
      });
      const me = servidor.llamadasA('/api/auth/me');
      expect(me.some((llamada) => llamada.auth === `Bearer ${sesion.token}`)).toBe(true);
      expect(me.some((llamada) => llamada.auth === `Bearer ${nuevo.token}`)).toBe(true);

      // Los tokens rotados quedaron guardados juntos.
      expect(sesionGuardada()).toMatchObject({ token: nuevo.token, refreshToken: nuevo.refreshToken });

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );

  it(
    'un 401 con la renovación rechazada cierra la sesión y la app vuelve a Inicio sin sesión',
    async () => {
      const sesion = await sembrarSesion();
      const servidor = simularServidor({ tokenValido: 'acceso-que-aun-no-existe', renovar: 'rechazo' });

      const app = await abrirApp('/perfil');
      await cerrarIntroSiAparece();

      // La app regresa a Inicio con el aviso y sin sesión.
      await waitFor(() => expect(app.getPathname()).toBe('/inicio'));
      expect(await screen.findByText(AVISO_SESION_TERMINADA)).toBeOnTheScreen();
      expect(await screen.findByText(INVITACION_INICIO)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Abrir perfil' })).not.toBeOnTheScreen();

      // La sesión rechazada se borró del teléfono; las preferencias se conservan.
      expect(sesionGuardada()).toBeNull();
      expect(leerSecureStore().bienvenida_vista).toBe('1');

      // Una sola renovación, rechazada, con el refreshToken guardado.
      expect(servidor.llamadasA(RUTA_RENOVAR)).toHaveLength(1);
      expect(servidor.llamadasA(RUTA_RENOVAR)[0].cuerpo).toEqual({ refreshToken: sesion.refreshToken });

      // El aviso se puede cerrar.
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar aviso' }));
      await waitFor(() => expect(screen.queryByText(AVISO_SESION_TERMINADA)).not.toBeOnTheScreen());

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );

  it(
    'cerrar sesión desde Perfil borra el token, lo revoca en el servidor y deja la app en Inicio',
    async () => {
      const sesion = await sembrarSesion();
      const servidor = simularServidor({ tokenValido: sesion.token, nombre: 'Clienta Guardada' });

      const app = await abrirApp('/perfil');
      await cerrarIntroSiAparece();
      expect(await screen.findByText('Clienta Guardada')).toBeOnTheScreen();

      // La fila pide confirmación antes de cerrar.
      await fireEvent.press(
        screen.getByRole('button', { name: 'Cerrar sesión, Sal de tu cuenta en este teléfono.' }),
      );
      expect(await screen.findByText('¿Cerrar sesión?')).toBeOnTheScreen();
      expect(sesionGuardada()).not.toBeNull();

      await fireEvent.press(ultimoBoton('Cerrar sesión'));

      await waitFor(() => expect(app.getPathname()).toBe('/inicio'));
      expect(await screen.findByText(INVITACION_INICIO)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeOnTheScreen();
      // Cerrar sesión no es una sesión vencida: no hay aviso.
      expect(screen.queryByText(AVISO_SESION_TERMINADA)).not.toBeOnTheScreen();

      // El token ya no está en el teléfono.
      expect(sesionGuardada()).toBeNull();
      expect(Object.keys(leerSecureStore())).not.toContain(CLAVE_SESION);

      // Se revocó en el servidor con el acceso y el refreshToken que estaban guardados.
      await waitFor(() => expect(servidor.llamadasA('/api/auth/logout')).toHaveLength(1));
      expect(servidor.llamadasA('/api/auth/logout')[0]).toMatchObject({
        metodo: 'POST',
        auth: `Bearer ${sesion.token}`,
        cuerpo: { logoutAll: false, refreshToken: sesion.refreshToken },
      });
      expect(servidor.llamadasA(RUTA_RENOVAR)).toHaveLength(0);

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );
});
