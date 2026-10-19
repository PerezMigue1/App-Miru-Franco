/// <reference types="jest" />

import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
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

function urlDe(entrada: unknown): string {
  if (typeof entrada === 'string') {
    return entrada;
  }
  if (entrada instanceof URL) {
    return entrada.href;
  }
  return (entrada as { url: string }).url;
}

/**
 * fetch simulado: los dos catálogos públicos (lo único que piden las pestañas sin sesión) y 404 para
 * todo lo demás. Nunca sale a la red.
 */
function simularFetch(): jest.Mock {
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
  return fetchSimulado;
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

/**
 * Consultas de la ruta actual. renderRouter devuelve la promesa del render con getPathname y
 * getSegments pegados; como es una promesa, una función async no puede devolverla tal cual (se
 * resolvería), así que se envuelven aquí.
 */
interface App {
  getPathname: () => string;
  getSegments: () => string[];
}

/**
 * Abre la app sin sesión en '/', cierra la intro de la grieta si aparece (mandando la medida de la
 * pantalla) y la hoja de bienvenida con "Explorar primero". Deja la app en la pestaña Inicio, lista
 * para navegar.
 */
async function abrirAppSinSesion(): Promise<App> {
  simularFetch();
  expect(leerSecureStore()).toEqual({});

  const app = iniciarRouter('src/app', { initialUrl: '/' });
  await app;
  expect(await screen.findByText('Crea tu cuenta para reservar citas y comprar')).toBeOnTheScreen();

  // La intro sale una sola vez por proceso de JS (introMostrada vive en el módulo y los módulos se
  // comparten entre las pruebas de este archivo): solo la primera prueba la ve y la cierra.
  const intro = capasIntro();
  expect(intro.length).toBeLessThanOrEqual(1);
  if (intro.length === 1) {
    await fireEvent.layout(intro[0], { x: 0, y: 0, width: 390, height: 844 });
  }
  await waitFor(() => expect(capasIntro()).toHaveLength(0));

  expect(await screen.findByText('Te damos la bienvenida a Mirú Franco')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Explorar primero' }));
  await waitFor(() =>
    expect(screen.queryByText('Te damos la bienvenida a Mirú Franco')).not.toBeOnTheScreen(),
  );

  expect(app.getPathname()).toBe('/inicio');
  return { getPathname: () => app.getPathname(), getSegments: () => app.getSegments() };
}

/**
 * Pestañas de src/app/(cliente)/_layout.tsx. Servicios, Carrito (sin piezas) y Productos fijan
 * tabBarAccessibilityLabel. Inicio y Perfil no: como el layout pasa tabBarLabel como función, la
 * barra de React Navigation (vendorizada en expo-router) tampoco les arma la suya, así que quedan sin
 * accessibilityLabel y su nombre accesible es el texto de la etiqueta. En iOS, la plataforma de
 * jest-expo, el rol de cada pestaña es button (en Android sería tab).
 */
const PESTANAS = [
  {
    titulo: 'Inicio',
    nombre: 'Inicio',
    etiqueta: undefined,
    ruta: '/inicio',
    segmentos: ['(cliente)', 'inicio'],
    textoPropio: 'Nuestro trabajo',
  },
  {
    titulo: 'Servicios',
    nombre: 'Servicios',
    etiqueta: 'Servicios',
    ruta: '/citas',
    segmentos: ['(cliente)', 'citas'],
    textoPropio: 'Explora nuestros servicios y agenda tu cita',
  },
  {
    titulo: 'Carrito',
    nombre: 'Carrito',
    etiqueta: 'Carrito',
    ruta: '/carrito',
    segmentos: ['(cliente)', 'carrito'],
    textoPropio: 'Tu carrito te espera',
  },
  {
    titulo: 'Productos',
    nombre: 'Productos',
    etiqueta: 'Productos',
    ruta: '/tienda',
    segmentos: ['(cliente)', 'tienda'],
    textoPropio: 'Explora nuestro catálogo de productos profesionales',
  },
  {
    titulo: 'Perfil',
    nombre: 'Perfil',
    etiqueta: undefined,
    ruta: '/perfil',
    segmentos: ['(cliente)', 'perfil'],
    textoPropio: 'Tu perfil en Mirú Franco',
  },
] as const;

type Pestana = (typeof PESTANAS)[number];

/** Toca una pestaña de la barra inferior y espera su ruta y un texto propio de su pantalla. */
async function irAPestana(app: App, pestana: Pestana): Promise<void> {
  await fireEvent.press(screen.getByRole('button', { name: pestana.nombre }));
  await waitFor(() => expect(app.getPathname()).toBe(pestana.ruta));
  expect(await screen.findByText(pestana.textoPropio)).toBeOnTheScreen();
}

/**
 * Acciones de la cabecera visible (AccionesCabecera): la campana y, sin sesión, "Iniciar sesión".
 * Las dos viven en el mismo contenedor a la derecha de la cabecera compacta. getByRole falla si hay
 * más de una campana visible: las pestañas y pantallas de abajo quedan ocultas a la accesibilidad.
 */
function cabeceraVisible(): { campana: TestInstance; iniciarSesion: TestInstance } {
  const campana = screen.getByRole('button', { name: 'Abrir notificaciones' });
  const acciones = campana.parent;
  if (!acciones) {
    throw new Error('La campana no tiene contenedor');
  }
  const iniciarSesion = within(acciones).getByRole('button', { name: 'Iniciar sesión' });
  return { campana, iniciarSesion };
}

/** Texto de la hoja de acceso (HojaAcceso) que abre useRequiereSesion sin sesión. */
const TITULO_HOJA_ACCESO = 'Inicia sesión para continuar';

/** Último botón con ese nombre: el de la hoja (su Modal va después del Stack en el árbol). */
function botonDeHoja(nombre: string): TestInstance {
  const botones = screen.getAllByRole('button', { name: nombre });
  return botones[botones.length - 1];
}

describe('Navegación entre pestañas, cabecera y Acceso sin sesión (GP-04)', () => {
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
    'las cinco pestañas reales existen con su etiqueta accesible y cada una abre su pantalla',
    async () => {
      const app = await abrirAppSinSesion();

      // Las cinco pestañas del layout, con su título visible y su etiqueta accesible real.
      for (const pestana of PESTANAS) {
        const boton = screen.getByRole('button', { name: pestana.nombre });
        expect(boton).toBeOnTheScreen();
        expect(boton.props.accessibilityLabel).toBe(pestana.etiqueta);
        expect(within(boton).getByText(pestana.titulo)).toBeOnTheScreen();
      }
      // Inicio es la activa al abrir.
      expect(screen.getByRole('button', { name: 'Inicio' })).toBeSelected();

      // Ida por todas y regreso a Inicio: cambia la ruta, la pantalla y la pestaña activa.
      for (const pestana of [...PESTANAS.slice(1), PESTANAS[0]]) {
        await irAPestana(app, pestana);
        expect(app.getSegments()).toEqual(pestana.segmentos);
        expect(screen.getByRole('button', { name: pestana.nombre })).toBeSelected();
        for (const otra of PESTANAS.filter((p) => p !== pestana)) {
          expect(screen.getByRole('button', { name: otra.nombre })).not.toBeSelected();
        }
      }

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );

  it(
    'sin sesión la campana pide sesión con la hoja de acceso; Notificaciones abre su invitación y se puede volver',
    async () => {
      const app = await abrirAppSinSesion();

      // Sin sesión, la campana no navega: useRequiereSesion abre la hoja de acceso.
      await fireEvent.press(cabeceraVisible().campana);
      expect(await screen.findByText(TITULO_HOJA_ACCESO)).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Con tu cuenta puedes reservar citas, comprar en la tienda y recibir tus avisos.',
        ),
      ).toBeOnTheScreen();
      expect(app.getPathname()).toBe('/inicio');

      // "Ahora no" cierra la hoja y la clienta sigue en Inicio.
      await fireEvent.press(screen.getByRole('button', { name: 'Ahora no' }));
      await waitFor(() => expect(screen.queryByText(TITULO_HOJA_ACCESO)).not.toBeOnTheScreen());
      expect(app.getPathname()).toBe('/inicio');

      // No hay otro enlace a Notificaciones en la app: se abre con la navegación imperativa de
      // expo-router, el mismo navigate('/notificaciones') que haría la campana con sesión.
      await act(async () => {
        router.navigate('/notificaciones');
      });
      await waitFor(() => expect(app.getPathname()).toBe('/notificaciones'));
      expect(app.getSegments()).toEqual(['notificaciones']);
      expect(await screen.findByText('Notificaciones')).toBeOnTheScreen();
      expect(screen.getByText('Avisos del sistema sobre pedidos y tu cuenta')).toBeOnTheScreen();
      expect(screen.getByText('Tus avisos en un solo lugar')).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Inicia sesión para recibir los recordatorios de tus citas y el estado de tus pedidos.',
        ),
      ).toBeOnTheScreen();

      // Volver regresa a Inicio (había pila debajo: router.back()).
      await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
      await waitFor(() => expect(app.getPathname()).toBe('/inicio'));
      expect(await screen.findByText('Nuestro trabajo')).toBeOnTheScreen();
      expect(screen.queryByText('Tus avisos en un solo lugar')).not.toBeOnTheScreen();

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );

  it(
    'la invitación a iniciar sesión abre Acceso, Registro y Recuperar contraseña',
    async () => {
      const app = await abrirAppSinSesion();

      // 1) Botón "Iniciar sesión" de la cabecera: abre Acceso (modal del grupo (auth)).
      await fireEvent.press(cabeceraVisible().iniciarSesion);
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      expect(app.getSegments()).toEqual(['(auth)', 'login']);
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      expect(
        screen.getByText('Consulta tus citas, tus pedidos y tus recordatorios.'),
      ).toBeOnTheScreen();

      // Desde Acceso, el enlace "¿Olvidaste tu contraseña?" abre Recuperar.
      await fireEvent.press(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }));
      await waitFor(() => expect(app.getPathname()).toBe('/recuperar'));
      expect(app.getSegments()).toEqual(['(auth)', 'recuperar']);
      expect(await screen.findByText('Recupera tu contraseña')).toBeOnTheScreen();

      // "Volver a iniciar sesión" regresa a Acceso.
      await fireEvent.press(screen.getByRole('link', { name: 'Volver a iniciar sesión' }));
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();

      // Dentro de Acceso, la pestaña "Registro" muestra el formulario de registro sin cambiar de ruta.
      await fireEvent.press(screen.getByRole('tab', { name: 'Registro' }));
      expect(await screen.findByText('Crea tu cuenta')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Registro' })).toBeSelected();
      expect(app.getPathname()).toBe('/login');

      // "Cerrar" saca a Acceso de la pila y deja a la clienta en Inicio.
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
      await waitFor(() => expect(app.getPathname()).toBe('/inicio'));
      expect(await screen.findByText('Nuestro trabajo')).toBeOnTheScreen();

      // 2) Hoja de acceso (campana sin sesión): "Crear cuenta" abre Registro.
      await fireEvent.press(cabeceraVisible().campana);
      expect(await screen.findByText(TITULO_HOJA_ACCESO)).toBeOnTheScreen();
      await fireEvent.press(botonDeHoja('Crear cuenta'));
      await waitFor(() => expect(app.getPathname()).toBe('/registro'));
      expect(app.getSegments()).toEqual(['(auth)', 'registro']);
      expect(await screen.findByText('Crea tu cuenta')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Registro' })).toBeSelected();
      await waitFor(() => expect(screen.queryByText(TITULO_HOJA_ACCESO)).not.toBeOnTheScreen());

      // Desde Registro, la pestaña "Acceso" lleva al enlace de recuperar contraseña.
      await fireEvent.press(screen.getByRole('tab', { name: 'Acceso' }));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }));
      await waitFor(() => expect(app.getPathname()).toBe('/recuperar'));
      expect(await screen.findByText('Recupera tu contraseña')).toBeOnTheScreen();

      // Recuperar vuelve a Registro (la pantalla de abajo) y Cerrar regresa a Inicio.
      await fireEvent.press(screen.getByRole('link', { name: 'Volver a iniciar sesión' }));
      await waitFor(() => expect(app.getPathname()).toBe('/registro'));
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
      await waitFor(() => expect(app.getPathname()).toBe('/inicio'));

      // 3) Hoja de acceso: "Iniciar sesión" abre Acceso.
      await fireEvent.press(cabeceraVisible().campana);
      expect(await screen.findByText(TITULO_HOJA_ACCESO)).toBeOnTheScreen();
      await fireEvent.press(botonDeHoja('Iniciar sesión'));
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
      await waitFor(() => expect(app.getPathname()).toBe('/inicio'));

      // 4) Invitación de Perfil (InvitacionSesion): "Crear cuenta" y "Iniciar sesión".
      await irAPestana(app, PESTANAS[4]);
      const invitacion = screen.getByText('Tu perfil en Mirú Franco').parent;
      if (!invitacion) {
        throw new Error('La invitación de Perfil no tiene contenedor');
      }
      await fireEvent.press(within(invitacion).getByRole('button', { name: 'Crear cuenta' }));
      await waitFor(() => expect(app.getPathname()).toBe('/registro'));
      expect(await screen.findByText('Crea tu cuenta')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
      await waitFor(() => expect(app.getPathname()).toBe('/perfil'));

      const invitacionDeNuevo = screen.getByText('Tu perfil en Mirú Franco').parent;
      if (!invitacionDeNuevo) {
        throw new Error('La invitación de Perfil no tiene contenedor');
      }
      await fireEvent.press(
        within(invitacionDeNuevo).getByRole('button', { name: 'Iniciar sesión' }),
      );
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
      await waitFor(() => expect(app.getPathname()).toBe('/perfil'));

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );

  it(
    'la cabecera conserva la campana y "Iniciar sesión" al cambiar de pestaña',
    async () => {
      const app = await abrirAppSinSesion();

      for (const pestana of [...PESTANAS.slice(1), PESTANAS[0]]) {
        await irAPestana(app, pestana);
        // Una sola cabecera visible, con la campana y "Iniciar sesión" juntas.
        const { campana, iniciarSesion } = cabeceraVisible();
        expect(campana).toBeOnTheScreen();
        expect(iniciarSesion).toBeOnTheScreen();
        expect(within(iniciarSesion).getByText('Iniciar sesión')).toBeOnTheScreen();
        // Sin sesión no hay foto de la clienta.
        expect(screen.queryByRole('button', { name: 'Abrir perfil' })).not.toBeOnTheScreen();
      }

      // La campana de una pestaña que no es Inicio también pide sesión.
      await irAPestana(app, PESTANAS[3]);
      await fireEvent.press(cabeceraVisible().campana);
      expect(await screen.findByText(TITULO_HOJA_ACCESO)).toBeOnTheScreen();
      expect(app.getPathname()).toBe('/tienda');

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );
});
