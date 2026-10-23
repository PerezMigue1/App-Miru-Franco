/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { fireEvent, screen } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { sesionCabecera } from '@/features/auth/viewmodels/sesionCabecera';
import { AuthProvider } from '@/features/auth/viewmodels/useAuth';
import { SesionRequeridaProvider } from '@/features/auth/viewmodels/useRequiereSesion';
import { useInicioViewModel } from '@/features/inicio/viewmodels/useInicioViewModel';
import InicioView from '@/features/inicio/views/InicioView';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';
import { SesionCabeceraProvider } from '@/shared/ui/AccionesCabecera';
import { AparienciaProvider } from '@/shared/ui/apariencia';

import { sinRedEnRuta } from '../../helpers/citasFicticias';
import { cerrarRouter, iniciarRouter } from '../../helpers/router';
import { CATALOGOS_VACIOS, llamadasA, respuesta, servidorConRutas, type Llamada, type Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-router/build/testing-library/mocks', () => {
  require('react-native-gesture-handler/jestSetup');
  return {};
});

/**
 * GP-07.6, Inicio: si el catálogo de productos falla y los servicios no, el carrusel de productos
 * muestra su propio error con Reintentar (como el de servicios), con el texto por tipo de error y sin
 * el mensaje técnico. Reintentar vuelve a pedir solo /api/productos. Si fallan los dos, se queda el
 * error general de siempre (su Reintentar ya pide los dos catálogos).
 */

const SERVICIOS = {
  success: true,
  data: [{ id: 1, nombre: 'Corte ficticio', precio: '350', duracionMinutos: 60, activo: true }],
};
const PRODUCTOS = {
  success: true,
  count: 1,
  data: [
    {
      id: 7,
      nombre: 'Shampoo ficticio',
      marca: 'Marca ficticia',
      presentaciones: [{ id: 1, tamanio: '500ml', precio: '380', stock: 3, disponible: true }],
    },
  ],
};
const MENSAJE_TECNICO = 'Fallo interno ficticio';
const servicios: Manejador = () => respuesta(SERVICIOS);
const productos: Manejador = () => respuesta(PRODUCTOS);
const falla500: Manejador = () => respuesta({ message: MENSAJE_TECNICO }, 500);
const TITULO_PRODUCTOS = RESPALDO_TEXTOS['inicio.productos.errorTitulo'];
const TITULO_GENERAL = RESPALDO_TEXTOS['inicio.servicios.errorTitulo'];

const simular = servidorConRutas(CATALOGOS_VACIOS);

/** Manejador que responde con el que se le dé: el servidor simulado copia sus rutas al crearse. */
function conmutable(inicial: Manejador): { manejador: Manejador; cambiar: (otro: Manejador) => void } {
  let actual = inicial;
  return {
    manejador: (cuerpo) => actual(cuerpo),
    cambiar: (otro) => {
      actual = otro;
    },
  };
}
const veces = (llamadas: Llamada[], ruta: string) => llamadasA(llamadas, 'GET', ruta).length;

describe('useInicioViewModel: error del catálogo de productos', () => {
  it('falla el catálogo y no los servicios: error propio y Reintentar solo pide productos', async () => {
    const catalogo = conmutable(falla500);
    const llamadas = simular({ 'GET /api/servicios': servicios, 'GET /api/productos': catalogo.manejador });
    const { result } = await renderHook(() => useInicioViewModel());
    await waitFor(() => expect(result.current.estadoProductos).toBe('error'));
    expect(result.current.estado).toBe('listo');
    expect(result.current.mensajeErrorProductos).toBe(RESPALDO_TEXTOS['errores.servidor']);
    expect(result.current.mensajeErrorProductos).not.toContain(MENSAJE_TECNICO);

    catalogo.cambiar(productos);
    await act(async () => {
      result.current.recargarProductos();
    });
    await waitFor(() => expect(result.current.estadoProductos).toBe('listo'));
    expect(result.current.mensajeErrorProductos).toBeNull();
    expect(result.current.productosDestacados.map((p) => p.nombre)).toEqual(['Shampoo ficticio']);
    expect(veces(llamadas, '/api/servicios')).toBe(1);
    expect(veces(llamadas, '/api/productos')).toBe(2);
  });

  it('sin red: el texto de sin conexión', async () => {
    simular({
      'GET /api/servicios': servicios,
      'GET /api/productos': sinRedEnRuta,
    });
    const { result } = await renderHook(() => useInicioViewModel());
    await waitFor(() => expect(result.current.estadoProductos).toBe('error'));
    expect(result.current.mensajeErrorProductos).toBe(RESPALDO_TEXTOS['errores.sinConexion']);
  });
});

// ── Pantalla ─────────────────────────────────────────────────────────────────────────────────

function Proveedores({ children }: { children: ReactNode }) {
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

function Layout() {
  return (
    <Proveedores>
      <Stack screenOptions={{ headerShown: false }} />
    </Proveedores>
  );
}

const styles = StyleSheet.create({ raiz: { flex: 1 } });

describe('InicioView: carrusel de productos con error', () => {
  afterEach(cerrarRouter);

  it(
    'muestra el error de productos con Reintentar y, al tocarlo, pinta los productos',
    async () => {
      const catalogo = conmutable(falla500);
      const llamadas = simular({ 'GET /api/servicios': servicios, 'GET /api/productos': catalogo.manejador });
      await iniciarRouter({ _layout: Layout, inicio: InicioView }, { initialUrl: '/inicio' });

      expect(await screen.findByText(TITULO_PRODUCTOS)).toBeOnTheScreen();
      expect(screen.getByText(RESPALDO_TEXTOS['errores.servidor'])).toBeOnTheScreen();
      expect(screen.queryByText(MENSAJE_TECNICO)).not.toBeOnTheScreen();
      expect(screen.queryByText(TITULO_GENERAL)).not.toBeOnTheScreen();
      expect(await screen.findByText('Corte ficticio')).toBeOnTheScreen();

      catalogo.cambiar(productos);
      await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByText('Shampoo ficticio')).toBeOnTheScreen();
      expect(screen.queryByText(TITULO_PRODUCTOS)).not.toBeOnTheScreen();
      expect(veces(llamadas, '/api/servicios')).toBe(1);
    },
    180_000,
  );

  it(
    'si fallan los dos catálogos queda un solo error, el general',
    async () => {
      simular({ 'GET /api/servicios': falla500, 'GET /api/productos': falla500 });
      await iniciarRouter({ _layout: Layout, inicio: InicioView }, { initialUrl: '/inicio' });

      expect(await screen.findByText(TITULO_GENERAL)).toBeOnTheScreen();
      expect(screen.queryByText(TITULO_PRODUCTOS)).not.toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);
    },
    180_000,
  );
});
