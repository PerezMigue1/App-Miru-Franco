/// <reference types="jest" />

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import type { TestInstance } from 'test-renderer';

import { cerrarRouter, iniciarRouter } from './router';
import { leerSecureStore } from './secureStore';

/** Límite amplio: sin caché de Jest, renderRouter transforma todas las rutas de src/app (ver GP-02). */
export const LIMITE_MS = 180_000;

/**
 * Registra el beforeEach y el afterEach de las pruebas con pantallas reales; va dentro del describe.
 * Espía console.error y console.warn y, al terminar, desmonta y corre lo pendiente con los
 * temporizadores falsos, vuelve a los reales y quita los espías. Devuelve la revisión de que no salió
 * ningún error ni aviso de React o de la app.
 */
export function prepararPruebasDePantalla(): () => void {
  let espiaError: jest.SpyInstance;
  let espiaAviso: jest.SpyInstance;

  beforeEach(() => {
    espiaError = jest.spyOn(console, 'error');
    espiaAviso = jest.spyOn(console, 'warn');
  });

  afterEach(async () => {
    await cerrarRouter();
    espiaError.mockRestore();
    espiaAviso.mockRestore();
  });

  return () => {
    expect(espiaError).not.toHaveBeenCalled();
    expect(espiaAviso).not.toHaveBeenCalled();
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

/** La intro sale una vez por proceso de JS: si sigue a la vista, se le manda la medida y termina. */
export async function cerrarIntroSiAparece(): Promise<void> {
  const intro = capasIntro();
  if (intro.length === 1) {
    await fireEvent.layout(intro[0], { x: 0, y: 0, width: 390, height: 844 });
  }
  await waitFor(() => expect(capasIntro()).toHaveLength(0));
}

/** Último botón con ese nombre: el de la hoja (su Modal va después del Stack en el árbol). */
export function ultimoBoton(nombre: string): TestInstance {
  const botones = screen.getAllByRole('button', { name: nombre });
  return botones[botones.length - 1];
}

export interface App {
  getPathname: () => string;
}

/** Abre la app real en la ruta indicada. */
export async function abrirApp(ruta: string): Promise<App> {
  const app = iniciarRouter('src/app', { initialUrl: ruta });
  await app;
  return { getPathname: () => app.getPathname() };
}

/**
 * Abre la app sin sesión en '/', cierra la intro de la grieta si aparece y, desde la hoja de
 * bienvenida, toca el botón indicado hasta llegar a la ruta esperada.
 */
export async function abrirDesdeBienvenida(boton: string, rutaEsperada: string): Promise<App> {
  expect(leerSecureStore()).toEqual({});
  const app = await abrirApp('/');
  expect(await screen.findByText('Crea tu cuenta para reservar citas y comprar')).toBeOnTheScreen();

  // La intro sale una sola vez por proceso de JS: solo la primera prueba del archivo la ve.
  expect(capasIntro().length).toBeLessThanOrEqual(1);
  await cerrarIntroSiAparece();

  expect(await screen.findByText('Te damos la bienvenida a Mirú Franco')).toBeOnTheScreen();
  await fireEvent.press(ultimoBoton(boton));
  await waitFor(() => expect(app.getPathname()).toBe(rutaEsperada));
  return app;
}

/** Desde la hoja de bienvenida toca "Iniciar sesión": queda en Acceso, encima de la pestaña Inicio. */
export async function abrirAcceso(): Promise<App> {
  const app = await abrirDesdeBienvenida('Iniciar sesión', '/login');
  expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
  return app;
}

/** Escribe correo y contraseña en el formulario de Acceso y toca "Entrar". */
export async function entrarCon(correo: string, clave: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), correo);
  await fireEvent.changeText(screen.getByLabelText('Contraseña'), clave);
  await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
}
