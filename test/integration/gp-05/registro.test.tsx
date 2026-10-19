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
const PREGUNTA = '¿Cuál es el nombre de tu primera mascota?';

/** GET /api/pregunta-seguridad: { success, data[] }. */
const PREGUNTAS = {
  success: true,
  data: [
    { id: '1', pregunta: PREGUNTA },
    { id: '2', pregunta: '¿En qué ciudad naciste?' },
  ],
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

/** Lo que piden las pantallas de fondo y el selector de preguntas. */
const RUTAS_BASE: Record<string, Manejador> = {
  'GET /api/servicios': () => respuesta({ success: true, data: [] }),
  'GET /api/productos': () => respuesta({ success: true, count: 0, data: [] }),
  'GET /api/pregunta-seguridad': () => respuesta(PREGUNTAS),
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
 * bienvenida, toca "Crear cuenta": queda en Registro, encima de la pestaña Inicio.
 */
async function abrirRegistro(): Promise<App> {
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
  await fireEvent.press(botonDeHoja('Crear cuenta'));
  await waitFor(() => expect(app.getPathname()).toBe('/registro'));
  expect(await screen.findByText('Crea tu cuenta')).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: 'Registro' })).toBeSelected();
  expect(screen.getByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
  return { getPathname: () => app.getPathname() };
}

/** Paso 1, "Tu cuenta": todos los campos con datos ficticios válidos. */
async function llenarPaso1(): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText('Nombre completo'), '  Clienta Ficticia ');
  await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'Clienta@Ejemplo.test');
  // Pegado con espacios: el campo lo deja en 10 dígitos.
  await fireEvent.changeText(screen.getByLabelText('Teléfono'), '771 123 4567');
  // El campo de fecha agrega las diagonales: queda 15/03/1990.
  await fireEvent.changeText(screen.getByLabelText('Fecha de nacimiento'), '15031990');
  expect(screen.getByLabelText('Fecha de nacimiento')).toHaveProp('value', '15/03/1990');

  // La pregunta se elige en una hoja que carga la lista del servidor al abrirse.
  await fireEvent.press(screen.getByText('Elige una pregunta'));
  await fireEvent.press(await screen.findByRole('radio', { name: PREGUNTA }));
  await waitFor(() => expect(screen.queryByText('¿En qué ciudad naciste?')).not.toBeOnTheScreen());
  expect(screen.getByText(PREGUNTA)).toBeOnTheScreen();

  await fireEvent.changeText(screen.getByLabelText('Respuesta de seguridad'), ' Firulais ');
  await fireEvent.changeText(screen.getByLabelText('Contraseña'), CLAVE);
  await fireEvent.changeText(screen.getByLabelText('Confirmar contraseña'), CLAVE);
}

/** Paso 2, "Tu cabello": tipo, un color opcional, sin alergias, con tratamientos y el aviso. */
async function llenarPaso2(): Promise<void> {
  await fireEvent.press(screen.getByRole('radio', { name: 'Tipo de cabello: Lacio' }));
  await fireEvent.changeText(screen.getByLabelText('Color natural (opcional)'), '  Castaño oscuro ');
  await fireEvent.press(screen.getByRole('radio', { name: '¿Tienes alergias a productos?: No' }));
  await fireEvent.press(screen.getByRole('radio', { name: '¿Tratamientos químicos previos?: Sí' }));
  await fireEvent.changeText(
    await screen.findByLabelText('Especifica los tratamientos'),
    'Tinte hace seis meses',
  );
  await fireEvent.press(screen.getByRole('checkbox', { name: /^Acepto el/ }));
  expect(screen.getByRole('checkbox', { name: /^Acepto el/ })).toBeChecked();
}

/** Cuerpo que la app arma hoy para POST /api/usuarios/registro con los datos de arriba. */
const CUERPO_ESPERADO = {
  nombre: 'Clienta Ficticia',
  email: CORREO,
  telefono: '7711234567',
  password: CLAVE,
  fechaNacimiento: '1990-03-15',
  preguntaSeguridad: { pregunta: PREGUNTA, respuesta: 'Firulais' },
  perfilCapilar: {
    tipoCabello: 'liso',
    colorNatural: 'Castaño oscuro',
    tieneAlergias: false,
    tratamientosQuimicos: true,
    tratamientos: 'Tinte hace seis meses',
  },
  aceptaAvisoPrivacidad: true,
  recibePromociones: false,
};

describe('Registro de una clienta en dos pasos (GP-05)', () => {
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
    'completa los dos pasos, envía el cuerpo esperado al backend y pasa a Activar',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/verificar-correo': () => respuesta({ existe: false }),
        'POST /api/usuarios/registro': () =>
          respuesta({ success: true, message: 'Usuario registrado. Revisa tu correo.' }, 201),
      });
      const app = await abrirRegistro();

      await llenarPaso1();
      // El correo se verifica solo, ya normalizado.
      expect(await screen.findByText('Correo disponible')).toBeOnTheScreen();
      const verificaciones = llamadasA(llamadas, 'POST', '/api/auth/verificar-correo');
      expect(verificaciones.length).toBeGreaterThan(0);
      for (const verificacion of verificaciones) {
        expect(verificacion.cuerpo).toEqual({ correo: CORREO });
      }

      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText('Cuéntanos sobre tu cabello')).toBeOnTheScreen();
      expect(screen.getByLabelText('Paso 2 de 2: Tu cabello')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/usuarios/registro')).toHaveLength(0);

      // "Atrás" regresa al paso 1 sin perder lo escrito; "Continuar" vuelve al paso 2.
      await fireEvent.press(screen.getByRole('button', { name: 'Atrás' }));
      expect(await screen.findByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
      expect(screen.getByLabelText('Nombre completo')).toHaveProp('value', '  Clienta Ficticia ');
      expect(screen.getByLabelText('Teléfono')).toHaveProp('value', '7711234567');
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText('Cuéntanos sobre tu cabello')).toBeOnTheScreen();

      await llenarPaso2();
      await fireEvent.press(screen.getByRole('button', { name: 'Finalizar registro' }));

      await waitFor(() => expect(app.getPathname()).toBe('/activar'));
      const registros = llamadasA(llamadas, 'POST', '/api/usuarios/registro');
      expect(registros).toHaveLength(1);
      expect(registros[0].cuerpo).toEqual(CUERPO_ESPERADO);
      expect(registros[0].cabeceras.Authorization).toBeUndefined();

      // Activar con el correo del registro y la espera de reenvío ya corriendo.
      expect(await screen.findByText('Activa tu cuenta')).toBeOnTheScreen();
      expect(
        screen.getByText(`Escribe el código de 6 dígitos que enviamos a ${CORREO}.`),
      ).toBeOnTheScreen();
      expect(screen.getByText(/^Podrás pedir otro código en \d+ s$/)).toBeOnTheScreen();
      expect(screen.queryByRole('link', { name: 'Reenviar código' })).not.toBeOnTheScreen();
      // Registrarse no inicia sesión.
      expect(leerSecureStore().auth_sesion).toBeUndefined();

      // "Volver a iniciar sesión" regresa a la misma pantalla en Acceso, con el correo escrito y el
      // registro vacío.
      await fireEvent.press(screen.getByRole('link', { name: 'Volver a iniciar sesión' }));
      await waitFor(() => expect(app.getPathname()).toBe('/registro'));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Acceso' })).toBeSelected();
      expect(screen.getByLabelText('Correo electrónico')).toHaveProp('value', CORREO);
      await fireEvent.press(screen.getByRole('tab', { name: 'Registro' }));
      expect(await screen.findByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
      expect(screen.getByLabelText('Nombre completo')).toHaveProp('value', '');

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );

  it(
    'el paso 1 no avanza con campos vacíos ni con un correo que ya tiene cuenta',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/verificar-correo': () => respuesta({ existe: true }),
      });
      await abrirRegistro();

      // Vacío: cada campo dice qué falta y no se llama al servidor.
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText('Revisa los campos marcados.')).toBeOnTheScreen();
      expect(screen.getByText('El nombre completo es requerido')).toBeOnTheScreen();
      expect(screen.getByText('El correo electrónico es requerido')).toBeOnTheScreen();
      expect(screen.getByText('El teléfono es requerido')).toBeOnTheScreen();
      expect(screen.getByText('La fecha de nacimiento es requerida')).toBeOnTheScreen();
      expect(screen.getByText('Debes seleccionar una pregunta de seguridad')).toBeOnTheScreen();
      expect(
        screen.getByText('La respuesta a la pregunta de seguridad es requerida'),
      ).toBeOnTheScreen();
      expect(screen.getByText('Confirma tu contraseña')).toBeOnTheScreen();
      expect(screen.getByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/verificar-correo')).toHaveLength(0);

      // Con todo lleno pero un correo registrado, "Continuar" no pasa al paso 2.
      await llenarPaso1();
      expect(await screen.findByText('Este correo ya está registrado')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled(),
      );
      expect(screen.queryByText('Cuéntanos sobre tu cabello')).not.toBeOnTheScreen();
      expect(screen.getByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/usuarios/registro')).toHaveLength(0);

      // "Iniciar sesión" del aviso lleva a Acceso con ese correo escrito.
      await fireEvent.press(screen.getByRole('link', { name: 'Iniciar sesión' }));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Acceso' })).toBeSelected();
      expect(screen.getByLabelText('Correo electrónico')).toHaveProp('value', 'Clienta@Ejemplo.test');

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );

  it(
    'si el backend responde 409 al registrar, vuelve al paso 1 con el correo marcado y sin ir a Activar',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/verificar-correo': () => respuesta({ existe: false }),
        'POST /api/usuarios/registro': () =>
          respuesta({ statusCode: 409, message: 'Conflict: email already exists' }, 409),
      });
      const app = await abrirRegistro();

      await llenarPaso1();
      expect(await screen.findByText('Correo disponible')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText('Cuéntanos sobre tu cabello')).toBeOnTheScreen();
      await llenarPaso2();
      await fireEvent.press(screen.getByRole('button', { name: 'Finalizar registro' }));

      expect(await screen.findByText('Este correo ya está registrado')).toBeOnTheScreen();
      expect(screen.getByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
      expect(screen.getByText('Revisa los campos marcados.')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/usuarios/registro')).toHaveLength(1);
      expect(app.getPathname()).toBe('/registro');
      // El texto técnico del servidor nunca llega a la pantalla.
      expect(screen.queryByText('Conflict: email already exists')).not.toBeOnTheScreen();

      expect(espiaError).not.toHaveBeenCalled();
      expect(espiaAviso).not.toHaveBeenCalled();
    },
    LIMITE_MS,
  );
});
