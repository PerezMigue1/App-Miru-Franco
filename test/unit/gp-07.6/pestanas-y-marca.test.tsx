/// <reference types="jest" />

import { act, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ClienteLayout from '@/app/(cliente)/_layout';
import { PanelMarca } from '@/features/auth/components/AuthContainer';
import { normalizarConfiguracion, refrescar, reiniciarConfiguracionPublica, RESPALDO_CONFIGURACION } from '@/shared/api/configuracionPublica';
import { Logotipo } from '@/shared/ui/Logotipo';
import { BotonPestana } from '@/shared/ui/PestanaFranja';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { respuestaCompleta, rutaConfiguracion } from '../../helpers/configuracionFicticia';
import { cerrarRouter, iniciarRouter } from '../../helpers/router';
import { servidorConRutas } from '../../helpers/servidorSimulado';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);
// La barra solo necesita el número de piezas: sin sesión ni carrito real.
jest.mock('@/features/tienda/viewmodels/usePiezasCarrito', () => ({ usePiezasCarrito: () => 2 }));
jest.mock('expo-router/build/testing-library/mocks', () => {
  require('react-native-gesture-handler/jestSetup');
  return {};
});

/**
 * GP-07.6, accesibilidad de la barra inferior y nombre del salón que anuncia TalkBack:
 * 1. Las cinco pestañas llevan su etiqueta accesible (antes Inicio y Perfil no la tenían) y el botón
 *    de cada pestaña conserva el rol 'tab' y el estado seleccionado que manda la barra en Android.
 * 2. El logotipo de la cabecera y el panel de marca de Acceso anuncian el nombre correcto, "Mirú
 *    Franco Salón Beauty", o el que mande la configuración; el dibujo sigue diciendo "Beauty Salón"
 *    en mayúsculas como la web (cliente.css: text-transform: uppercase).
 */

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const conArea = ({ children }: { children: ReactNode }) => <SafeAreaProvider initialMetrics={MEDIDAS}>{children}</SafeAreaProvider>;
const NOMBRE_CORRECTO = 'Mirú Franco Salón Beauty';
const simular = servidorConRutas({});

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
});

describe('barra inferior de la clienta', () => {
  afterEach(cerrarRouter);

  it.each(['Inicio', 'Servicios', 'Carrito, 2 piezas', 'Productos', 'Perfil'])(
    'la pestaña %s tiene su etiqueta accesible',
    async (etiqueta) => {
      const Vacia = () => null;
      await iniciarRouter(
        {
          '(cliente)/_layout': ClienteLayout,
          '(cliente)/inicio': Vacia,
          '(cliente)/citas': Vacia,
          '(cliente)/carrito': Vacia,
          '(cliente)/tienda': Vacia,
          '(cliente)/perfil': Vacia,
        },
        { initialUrl: '/inicio' },
      );
      expect(screen.getByLabelText(etiqueta)).toBeOnTheScreen();
    },
  );
});

describe('BotonPestana', () => {
  it('conserva el rol de pestaña, la etiqueta y el estado seleccionado que manda la barra', async () => {
    await render(
      <BotonPestana role="tab" aria-selected aria-label="Inicio" onPress={jest.fn()}>
        <Text>Inicio</Text>
      </BotonPestana>,
    );
    expect(screen.getByRole('tab', { name: 'Inicio', selected: true })).toBeOnTheScreen();
  });

  it('una pestaña no elegida se anuncia sin seleccionar', async () => {
    await render(
      <BotonPestana role="tab" aria-selected={false} aria-label="Perfil" onPress={jest.fn()}>
        <Text>Perfil</Text>
      </BotonPestana>,
    );
    expect(screen.getByRole('tab', { name: 'Perfil', selected: false })).toBeOnTheScreen();
  });
});

describe('nombre del salón que anuncia TalkBack', () => {
  it('el respaldo ya trae el nombre correcto', () => {
    expect(RESPALDO_CONFIGURACION.salon.nombre).toBe(NOMBRE_CORRECTO);
  });

  it.each<[string, () => ReactNode]>([
    ['el logotipo de la cabecera', () => <Logotipo />],
    ['el panel de marca de Acceso', () => <PanelMarca />],
  ])('%s anuncia el nombre correcto y dibuja BEAUTY SALÓN como la web', async (_caso, pieza) => {
    await render(<>{pieza()}</>, { wrapper: conArea });
    expect(screen.getByLabelText(NOMBRE_CORRECTO)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Mirú Franco Beauty Salón')).not.toBeOnTheScreen();
  });

  it('con el nombre de la configuración pública, lo usa', async () => {
    const respuesta = respuestaCompleta();
    (respuesta.salon as Record<string, unknown>).nombre = 'Salón Ficticio de Prueba';
    expect(normalizarConfiguracion(respuesta).salon.nombre).toBe('Salón Ficticio de Prueba');
    simular(rutaConfiguracion(respuesta));
    await act(async () => {
      await refrescar();
    });
    await render(<Logotipo />, { wrapper: conArea });
    expect(screen.getByLabelText('Salón Ficticio de Prueba')).toBeOnTheScreen();
  });

  it('con un nombre en blanco en la configuración, anuncia el del respaldo', async () => {
    const respuesta = respuestaCompleta();
    (respuesta.salon as Record<string, unknown>).nombre = '   ';
    simular(rutaConfiguracion(respuesta));
    await act(async () => {
      await refrescar();
    });
    await render(<Logotipo />, { wrapper: conArea });
    expect(screen.getByLabelText(NOMBRE_CORRECTO)).toBeOnTheScreen();
  });
});
