/// <reference types="jest" />

import { Stack } from 'expo-router';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { sesionCabecera } from '@/features/auth/viewmodels/sesionCabecera';
import { AuthProvider } from '@/features/auth/viewmodels/useAuth';
import { SesionRequeridaProvider } from '@/features/auth/viewmodels/useRequiereSesion';
import InicioView from '@/features/inicio/views/InicioView';
import { SesionCabeceraProvider } from '@/shared/ui/AccionesCabecera';
import { AparienciaProvider } from '@/shared/ui/apariencia';

import { cerrarRouter, iniciarRouter } from '../../helpers/router';
import { leerSecureStore } from '../../helpers/secureStore';

/**
 * GP-04, pantalla de Inicio con el servidor simulado: InicioView real dentro de un router en memoria
 * (un _layout de prueba con los proveedores reales y la ruta 'inicio'). Sin sesión: SecureStore llega
 * vacío. Solo fetch es simulado.
 */

/**
 * expo-router/testing-library carga build/testing-library/mocks.js, que vuelve a registrar el mock de
 * react-native-reanimated con el mock básico de la librería y tumba el de test/setup.ts (ver GP-02).
 * Se sustituye por lo mismo que hace, salvo lo de Reanimated.
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
const URL_SERVICIOS = `${API}/api/servicios`;
const URL_PRODUCTOS = `${API}/api/productos`;

/** Límite amplio: sin caché, Babel tarda en transformar lo que carga la pantalla. */
const LIMITE_MS = 180_000;

const TITULO_ERROR = 'No pudimos cargar el inicio';
const MENSAJE_SERVIDOR = 'Fallo interno del servidor';

/**
 * Árbol de proveedores de la app, en el mismo orden que src/app/_layout.tsx. Es el único lugar donde
 * se arma: si un proveedor nuevo entra en la raíz (por ejemplo, SesionCabeceraProvider), basta con
 * agregarlo aquí.
 */
function ProveedoresPrueba({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SesionCabeceraProvider sesion={sesionCabecera}>
        <AparienciaProvider>
          <GestureHandlerRootView style={styles.raiz}>
            <SesionRequeridaProvider>{children}</SesionRequeridaProvider>
          </GestureHandlerRootView>
        </AparienciaProvider>
      </SesionCabeceraProvider>
    </AuthProvider>
  );
}

function LayoutPrueba() {
  return (
    <ProveedoresPrueba>
      <Stack screenOptions={{ headerShown: false }} />
    </ProveedoresPrueba>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
});

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

const SERVICIOS_VACIOS = { success: true, data: [] };
const PRODUCTOS_VACIOS = { success: true, count: 0, data: [] };

type Salida = { cuerpo: unknown; status?: number } | { sinRed: true };

function urlDe(entrada: unknown): string {
  if (typeof entrada === 'string') {
    return entrada;
  }
  if (entrada instanceof URL) {
    return entrada.href;
  }
  return (entrada as { url: string }).url;
}

/** Instala un fetch simulado que responde por URL; cualquier otra URL es un 404. */
function servidor(rutas: Record<string, Salida>): jest.Mock {
  const simulado = jest.fn((entrada: unknown) => {
    const salida = rutas[urlDe(entrada)];
    if (!salida) {
      return Promise.resolve(respuesta({ message: 'No encontrado' }, 404));
    }
    if ('sinRed' in salida) {
      return Promise.reject(new TypeError('Network request failed'));
    }
    return Promise.resolve(respuesta(salida.cuerpo, salida.status ?? 200));
  });
  globalThis.fetch = simulado as unknown as typeof fetch;
  return simulado;
}

function urlsDe(simulado: jest.Mock): string[] {
  return simulado.mock.calls.map(([entrada]: unknown[]) => urlDe(entrada));
}

function vecesQuePidio(simulado: jest.Mock, url: string): number {
  return urlsDe(simulado).filter((pedida) => pedida === url).length;
}

/** Solo los catálogos públicos, por GET, sin token y siempre a la API de prueba. */
function revisarPeticionesPublicas(simulado: jest.Mock): void {
  const urls = urlsDe(simulado);
  expect(urls.length).toBeGreaterThan(0);
  expect(new Set(urls)).toEqual(new Set([URL_SERVICIOS, URL_PRODUCTOS]));
  for (const [, init] of simulado.mock.calls as unknown as [unknown, RequestInit][]) {
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  }
}

async function abrirInicio(): Promise<void> {
  const app = iniciarRouter({ _layout: LayoutPrueba, inicio: InicioView }, { initialUrl: '/inicio' });
  await app;
  expect(app.getPathname()).toBe('/inicio');
}

describe('Pantalla de Inicio con el servidor simulado (GP-04)', () => {
  beforeEach(() => {
    // Sin sesión guardada: SecureStore llega vacío (setup.ts lo vacía antes de cada prueba).
    expect(leerSecureStore()).toEqual({});
  });

  afterEach(cerrarRouter);

  it(
    'sin sesión pinta los servicios y productos del catálogo y la galería vacía',
    async () => {
      const simulado = servidor({
        [URL_SERVICIOS]: { cuerpo: SERVICIOS },
        [URL_PRODUCTOS]: { cuerpo: PRODUCTOS },
      });

      await abrirInicio();

      // Sin sesión: invitación a crear cuenta y "Iniciar sesión" en la cabecera (AccionesCabecera).
      expect(
        await screen.findByText('Crea tu cuenta para reservar citas y comprar'),
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Abrir notificaciones' })).toBeOnTheScreen();

      // Catálogos simulados en sus carruseles.
      expect(await screen.findByText('Corte y peinado')).toBeOnTheScreen();
      expect(await screen.findByText('Shampoo de prueba')).toBeOnTheScreen();
      expect(screen.getByRole('link', { name: 'Ver todos los servicios' })).toBeOnTheScreen();
      expect(screen.getByRole('link', { name: 'Ver todos los productos' })).toBeOnTheScreen();

      // El servicio no trae foto: la galería muestra su estado vacío, sin error.
      expect(screen.getByText('Nuestro trabajo')).toBeOnTheScreen();
      expect(await screen.findByText('Aún no hay fotos publicadas')).toBeOnTheScreen();
      expect(screen.queryByText(TITULO_ERROR)).not.toBeOnTheScreen();

      revisarPeticionesPublicas(simulado);
      expect(vecesQuePidio(simulado, URL_SERVICIOS)).toBe(1);
      expect(vecesQuePidio(simulado, URL_PRODUCTOS)).toBe(1);
    },
    LIMITE_MS,
  );

  it(
    'con los catálogos vacíos oculta los carruseles y muestra la galería vacía, sin error',
    async () => {
      const simulado = servidor({
        [URL_SERVICIOS]: { cuerpo: SERVICIOS_VACIOS },
        [URL_PRODUCTOS]: { cuerpo: PRODUCTOS_VACIOS },
      });

      await abrirInicio();

      expect(await screen.findByText('Aún no hay fotos publicadas')).toBeOnTheScreen();
      // Mientras cargan, los carruseles muestran su esqueleto; vacíos, la sección desaparece.
      await waitFor(() =>
        expect(screen.queryByRole('link', { name: 'Ver todos los productos' })).not.toBeOnTheScreen(),
      );
      expect(screen.queryByRole('link', { name: 'Ver todos los servicios' })).not.toBeOnTheScreen();
      expect(screen.queryByLabelText('Cargando productos')).not.toBeOnTheScreen();
      expect(screen.queryByLabelText('Cargando servicios')).not.toBeOnTheScreen();
      expect(screen.queryByText(TITULO_ERROR)).not.toBeOnTheScreen();
      // La invitación sin sesión sigue a la vista.
      expect(screen.getByText('Crea tu cuenta para reservar citas y comprar')).toBeOnTheScreen();

      revisarPeticionesPublicas(simulado);
    },
    LIMITE_MS,
  );

  it(
    'si falla la carga muestra el error sin el mensaje técnico, y Reintentar vuelve a pedir y pinta los datos',
    async () => {
      const simuladoFallo = servidor({
        [URL_SERVICIOS]: { cuerpo: { message: MENSAJE_SERVIDOR, code: 'ERROR_INTERNO' }, status: 500 },
        [URL_PRODUCTOS]: { sinRed: true },
      });

      await abrirInicio();

      expect(await screen.findByText(TITULO_ERROR)).toBeOnTheScreen();
      expect(
        screen.getByText('Revisa tu conexión a internet e inténtalo de nuevo.'),
      ).toBeOnTheScreen();
      const reintentar = screen.getByRole('button', { name: 'Reintentar' });
      expect(reintentar).toBeOnTheScreen();
      // Nunca el mensaje técnico del servidor, ni carruseles ni datos.
      expect(screen.queryByText(MENSAJE_SERVIDOR)).not.toBeOnTheScreen();
      await waitFor(() =>
        expect(screen.queryByRole('link', { name: 'Ver todos los productos' })).not.toBeOnTheScreen(),
      );
      expect(screen.queryByRole('link', { name: 'Ver todos los servicios' })).not.toBeOnTheScreen();
      expect(screen.queryByText('Corte y peinado')).not.toBeOnTheScreen();
      expect(vecesQuePidio(simuladoFallo, URL_SERVICIOS)).toBe(1);
      expect(vecesQuePidio(simuladoFallo, URL_PRODUCTOS)).toBe(1);

      // El servidor ya responde: Reintentar pide los dos catálogos otra vez.
      const simulado = servidor({
        [URL_SERVICIOS]: { cuerpo: SERVICIOS },
        [URL_PRODUCTOS]: { cuerpo: PRODUCTOS },
      });
      await fireEvent.press(reintentar);

      expect(await screen.findByText('Corte y peinado')).toBeOnTheScreen();
      expect(await screen.findByText('Shampoo de prueba')).toBeOnTheScreen();
      expect(await screen.findByText('Aún no hay fotos publicadas')).toBeOnTheScreen();
      expect(screen.queryByText(TITULO_ERROR)).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeOnTheScreen();

      revisarPeticionesPublicas(simulado);
      expect(vecesQuePidio(simulado, URL_SERVICIOS)).toBe(1);
      expect(vecesQuePidio(simulado, URL_PRODUCTOS)).toBe(1);
    },
    LIMITE_MS,
  );
});
