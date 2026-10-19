/// <reference types="jest" />

import {
  act,
  cleanup,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';
import type { TestInstance } from 'test-renderer';

import { leerSecureStore } from '../../helpers/secureStore';

/**
 * expo-router/testing-library carga build/testing-library/mocks.js, que vuelve a registrar el mock de
 * react-native-reanimated con el mock básico de la librería. Ese registro reemplaza al de
 * test/setup.ts, que agrega cubicBezier, steps, linear y useReducedMotion (los usa src/shared/ui), y
 * la app no carga. Se sustituye ese archivo por lo mismo que hace, salvo lo de Reanimated: el setup
 * de react-native-gesture-handler y el mock de expo-linking.
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

/**
 * Límite de la prueba. Con la caché de Jest caliente tarda unos 4 s, pero renderRouter carga (y Babel
 * transforma) todas las rutas de src/app durante el render: sin caché (primera corrida o --no-cache)
 * eso tarda cerca de un minuto en esta máquina.
 */
const LIMITE_MS = 180_000;

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

/** GET /api/servicios: { success, data[] } con un servicio activo sin foto. */
const SERVICIOS = {
  success: true,
  data: [{ id: 1, nombre: 'Corte y peinado', precio: '350', duracionMinutos: 60, activo: true }],
};

/** GET /api/productos: { success, count, data[] } con un producto con existencias. */
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

/**
 * Capa de la intro de la grieta (IntroGrieta): la vista oculta a TalkBack que mide la pantalla con
 * onLayout. No tiene texto ni rol, así que se busca por esas props en el árbol renderizado.
 */
function capasIntro(): TestInstance[] {
  return screen.container.queryAll(
    (nodo) =>
      typeof nodo.type === 'string' &&
      nodo.props.accessibilityElementsHidden === true &&
      nodo.props.importantForAccessibility === 'no-hide-descendants' &&
      typeof nodo.props.onLayout === 'function',
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

describe('Arranque de la app con las rutas reales (GP-02)', () => {
  let espiaError: jest.SpyInstance;
  let espiaAviso: jest.SpyInstance;

  beforeEach(() => {
    espiaError = jest.spyOn(console, 'error');
    espiaAviso = jest.spyOn(console, 'warn');
  });

  afterEach(async () => {
    // Se desmonta la app aquí, con los temporizadores falsos que activa renderRouter todavía puestos:
    // este afterEach corre antes que la limpieza automática de Testing Library. Si el desmontaje
    // ocurre ya con los reales, StatusBar de React Native llama al clearImmediate real con el
    // Immediate falso que guardó al montarse, y en Node 22 eso descuadra el contador interno de
    // setImmediate: ningún setImmediate vuelve a correr y Jest se queda esperando para siempre.
    await cleanup();
    // Lo que el desmontaje dejó programado corre ahora, todavía con los temporizadores falsos.
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    espiaError.mockRestore();
    espiaAviso.mockRestore();
    // renderRouter activa los temporizadores falsos; se devuelven los reales para la siguiente prueba.
    jest.useRealTimers();
  });

  it('abre en Inicio sin sesión, pinta los catálogos simulados y ofrece la bienvenida', async () => {
    const fetchSimulado = jest.fn((entrada: unknown) => {
      const url = urlDe(entrada);
      if (url === `${API}/api/servicios`) {
        return Promise.resolve(respuesta(SERVICIOS));
      }
      if (url === `${API}/api/productos`) {
        return Promise.resolve(respuesta(PRODUCTOS));
      }
      return Promise.resolve(respuesta({ message: 'No encontrado' }, 404));
    });
    globalThis.fetch = fetchSimulado as unknown as typeof fetch;

    // Sin sesión guardada: SecureStore llega vacío (setup.ts lo vacía antes de cada prueba).
    expect(leerSecureStore()).toEqual({});

    // renderRouter devuelve la promesa de render (RNTL 14) con getPathname y demás pegados.
    const arranque = renderRouter('src/app', { initialUrl: '/' });
    await arranque;

    // Inicio sin sesión: invitación a crear cuenta y botón de la cabecera.
    expect(
      await screen.findByText('Crea tu cuenta para reservar citas y comprar'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeOnTheScreen();
    expect(screen.getByText('Nuestro trabajo')).toBeOnTheScreen();

    // Catálogos simulados: un servicio y un producto, y la galería vacía (el servicio no trae foto).
    expect(await screen.findByText('Corte y peinado')).toBeOnTheScreen();
    expect(await screen.findByText('Shampoo de prueba')).toBeOnTheScreen();
    expect(await screen.findByText('Aún no hay fotos publicadas')).toBeOnTheScreen();
    expect(screen.queryByText('No pudimos cargar el inicio')).not.toBeOnTheScreen();

    // La intro de la grieta cubre la app al abrir y la hoja de bienvenida espera a que termine.
    const intro = capasIntro();
    expect(intro).toHaveLength(1);
    expect(screen.queryByText('Te damos la bienvenida a Mirú Franco')).not.toBeOnTheScreen();

    // En el teléfono la intro arranca cuando el sistema mide la pantalla; aquí se manda esa medida.
    // Con los mocks de Reanimated la animación termina al instante y la intro se desmonta.
    await fireEvent.layout(intro[0], { x: 0, y: 0, width: 390, height: 844 });
    await waitFor(() => expect(capasIntro()).toHaveLength(0));

    // Primera apertura sin sesión: aparece la hoja de bienvenida.
    expect(await screen.findByText('Te damos la bienvenida a Mirú Franco')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Explorar primero' })).toBeOnTheScreen();

    // La raíz redirige a la pestaña Inicio del grupo (cliente).
    expect(arranque.getPathname()).toBe('/inicio');
    expect(arranque.getSegments()).toEqual(['(cliente)', 'inicio']);

    // Solo se pidieron los dos catálogos públicos, sin token y siempre a la API de prueba.
    const urls = fetchSimulado.mock.calls.map(([entrada]) => urlDe(entrada));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith(`${API}/`)).toBe(true);
    }
    expect(new Set(urls)).toEqual(new Set([`${API}/api/servicios`, `${API}/api/productos`]));
    for (const [, init] of fetchSimulado.mock.calls as unknown as [unknown, RequestInit][]) {
      expect(init.method).toBe('GET');
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    }

    expect(espiaError).not.toHaveBeenCalled();
    expect(espiaAviso).not.toHaveBeenCalled();
  }, LIMITE_MS);
});
