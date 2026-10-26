/// <reference types="jest" />

import { act, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TestInstance } from 'test-renderer';

import { ESPERA_LENTA_MS, registrarPeticion, reiniciarEstadoConexion } from '@/shared/api/estadoConexion';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';
import { FranjaConexion } from '@/shared/ui/FranjaConexion';
import { espacio, temaClaro, temaOscuro } from '@/shared/ui/tokens';

// Esquema del teléfono controlable: el tema oscuro sigue a la preferencia del sistema.
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

const esquema = jest.requireMock<{ default: jest.Mock<'light' | 'dark', []> }>(
  'react-native/Libraries/Utilities/useColorScheme',
).default;

/**
 * GP-09, bloque A5: la franja "Conectando con el salón…". Sale solo mientras una petición lleva más
 * de 3 s sin respuesta y se quita cuando ya no queda ninguna así. Va bajo la barra de estado, no
 * recibe toques, usa los colores del tema (claro y oscuro), se anuncia con una región viva educada y,
 * con movimiento reducido, no anima. Temporizadores falsos.
 */

const TEXTO = RESPALDO_TEXTOS['red.conectando'];
const BARRA_ESTADO = 24;
const MEDIDAS = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: BARRA_ESTADO, left: 0, right: 0, bottom: 0 },
};

function ConAreaSegura({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={MEDIDAS}>{children}</SafeAreaProvider>;
}

let terminar: (() => void) | null = null;

async function ponerLenta(): Promise<void> {
  await act(async () => {
    terminar = registrarPeticion();
    await jest.advanceTimersByTimeAsync(ESPERA_LENTA_MS);
  });
}

async function quitarLenta(): Promise<void> {
  await act(async () => {
    terminar?.();
    terminar = null;
  });
}

/** El contenedor con la región viva: la pastilla. */
function pastilla(): TestInstance {
  return screen.getByLabelText(TEXTO);
}

/** La capa de afuera (la que no recibe toques). */
function capa(): TestInstance {
  const nodos = screen.container.queryAll((nodo) => typeof nodo.type === 'string' && nodo.props.pointerEvents === 'none');
  expect(nodos).toHaveLength(1);
  return nodos[0];
}

beforeEach(() => {
  jest.useFakeTimers();
  reiniciarEstadoConexion();
  esquema.mockReturnValue('light');
});

afterEach(() => {
  terminar?.();
  terminar = null;
  jest.clearAllTimers();
  jest.useRealTimers();
  reiniciarEstadoConexion();
  jest.restoreAllMocks();
});

describe('FranjaConexion', () => {
  it('el texto del catálogo es "Conectando con el salón…"', () => {
    expect(TEXTO).toBe('Conectando con el salón…');
  });

  it('no se ve mientras las peticiones responden a tiempo', async () => {
    await render(<FranjaConexion />, { wrapper: ConAreaSegura });

    expect(screen.queryByText(TEXTO)).toBeNull();
  });

  it('aparece a los 3 s sin respuesta y se va cuando llega', async () => {
    await render(<FranjaConexion />, { wrapper: ConAreaSegura });

    await ponerLenta();
    expect(screen.getByText(TEXTO)).toBeOnTheScreen();

    await quitarLenta();
    expect(screen.queryByText(TEXTO)).toBeNull();
  });

  it('nunca dice "Sin conexión"', async () => {
    await render(<FranjaConexion />, { wrapper: ConAreaSegura });
    await ponerLenta();

    expect(screen.queryByText(/sin conexi/i)).toBeNull();
  });

  it('va bajo la barra de estado, superpuesta y sin recibir toques', async () => {
    await render(<FranjaConexion />, { wrapper: ConAreaSegura });
    await ponerLenta();

    const estilo = StyleSheet.flatten(capa().props.style) as { position: string; top: number };
    expect(estilo.position).toBe('absolute');
    expect(estilo.top).toBe(BARRA_ESTADO + espacio.xs);
  });

  it('accesible: etiqueta con el mismo texto y región viva educada', async () => {
    await render(<FranjaConexion />, { wrapper: ConAreaSegura });
    await ponerLenta();

    // La región viva está en la capa, montada siempre, para que Android anuncie la aparición.
    expect(capa().props.accessibilityLiveRegion).toBe('polite');
    expect(pastilla().props.accessible).toBe(true);
  });

  it.each<['light' | 'dark', typeof temaClaro]>([
    ['light', temaClaro],
    ['dark', temaOscuro],
  ])('con el tema %s usa sus colores', async (modo, tema) => {
    esquema.mockReturnValue(modo);
    await render(<FranjaConexion />, { wrapper: ConAreaSegura });
    await ponerLenta();

    const fondo = StyleSheet.flatten(pastilla().props.style) as { backgroundColor: string; borderColor: string };
    expect(fondo.backgroundColor).toBe(tema.superficieModal);
    expect(fondo.borderColor).toBe(tema.hairlineFuerte);
    const texto = StyleSheet.flatten(screen.getByText(TEXTO).props.style) as { color: string };
    expect(texto.color).toBe(tema.texto);
  });

  it('entra y sale con un fundido', async () => {
    await render(<FranjaConexion />, { wrapper: ConAreaSegura });
    await ponerLenta();

    expect(pastilla().props.entering).toBeDefined();
    expect(pastilla().props.exiting).toBeDefined();
  });

  it('con movimiento reducido no anima', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<FranjaConexion />, { wrapper: ConAreaSegura });
    await act(async () => {
      await Promise.resolve();
    });
    await ponerLenta();

    expect(pastilla().props.entering).toBeUndefined();
    expect(pastilla().props.exiting).toBeUndefined();
  });
});
