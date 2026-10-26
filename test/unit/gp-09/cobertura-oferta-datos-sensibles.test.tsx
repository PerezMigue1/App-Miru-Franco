/// <reference types="jest" />

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TestInstance } from 'test-renderer';

import { OfertaDatosSensibles } from '@/features/auth/components/OfertaDatosSensibles';
import { reiniciarOfertaDatosSensibles } from '@/features/auth/viewmodels/useOfertaDatosSensibles';
import { obtenerTexto } from '@/shared/api/textosSitio';

import {
  HASH_SENSIBLES,
  PARRAFO_1,
  RUTA_SENSIBLES,
  RUTA_TEXTO_SENSIBLES,
  respuestaAutorizada,
  respuestaEstadoSensibles,
  respuestaTextoSensibles,
} from '../../helpers/datosSensibles';
import { leerSecureStore } from '../../helpers/secureStore';
import { llamadasA } from '../../helpers/servidorSimulado';
import { authSimulada, diferida, reiniciarSimulaciones, servidorVm, type ManejadorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, cobertura de la oferta de autorizar las alergias al iniciar sesión: la sesión que se cierra
 * mientras se lee la marca del teléfono o mientras llega el estado de la autorización (la oferta no se
 * gasta y vuelve a salir al entrar otra vez), y Atrás en la hoja del texto mientras se envía
 * "Autorizo". useAuth y expo-crypto simulados con la fase lista; hojas y viewmodels reales; fetch simulado en
 * http://api.test con datos ficticios.
 */

jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('@/features/auth/viewmodels/useDocumentosPendientes', () => ({
  ...jest.requireActual('@/features/auth/viewmodels/useDocumentosPendientes'),
  useFaseReaceptacion: () => 'listo',
}));

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const TITULO = obtenerTexto('datosSensibles.app.ofertaTitulo');
const LEER = obtenerTexto('datosSensibles.app.ofertaLeer');
const CASILLA = obtenerTexto('datosSensibles.app.casilla');
const AUTORIZO = obtenerTexto('datosSensibles.app.autorizo');
const CLIENTA = { id: 'clienta-cob-oferta-1', nombre: 'Clienta Oferta', email: 'oferta-cob@ejemplo.test', rol: 'cliente' };
const PREFIJO_MARCA = 'oferta_salud_';

const secureStore = jest.requireMock<{ getItemAsync: jest.Mock<Promise<string | null>, [string]> }>('expo-secure-store');

function Arbol() {
  return (
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <OfertaDatosSensibles habilitada />
    </SafeAreaProvider>
  );
}

function servidor(extra: Record<string, ManejadorVm> = {}) {
  return servidorVm({
    [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(false, true),
    [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
    [`POST ${RUTA_SENSIBLES}`]: () => respuestaAutorizada(),
    ...extra,
  });
}

function conSesion(): void {
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA;
}

function sinSesion(): void {
  authSimulada.estado = 'anonimo';
  authSimulada.usuario = null;
}

const marcas = () => Object.keys(leerSecureStore()).filter((clave) => clave.startsWith(PREFIJO_MARCA));

/** El Modal a la vista (su onRequestClose es el Atrás de Android). */
function modalVisible(): TestInstance {
  const visibles = screen.container.queryAll(
    (nodo) => typeof nodo.props.onRequestClose === 'function' && nodo.props.visible === true,
  );
  expect(visibles).toHaveLength(1);
  return visibles[0];
}

async function asentar(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  reiniciarSimulaciones();
  reiniciarOfertaDatosSensibles();
  conSesion();
});

afterEach(async () => {
  await cleanup();
});

describe('la sesión se cierra a mitad de la consulta de la oferta', () => {
  it('mientras se lee la marca del teléfono: no consulta, no la gasta y al volver a entrar sale', async () => {
    const original = secureStore.getItemAsync.getMockImplementation();
    let soltarMarca: (valor: string | null) => void = () => undefined;
    const marca = new Promise<string | null>((resolver) => {
      soltarMarca = resolver;
    });
    secureStore.getItemAsync.mockImplementation((clave: string) =>
      clave.startsWith(PREFIJO_MARCA) ? marca : (original?.(clave) ?? Promise.resolve(null)),
    );
    try {
      const llamadas = servidor();
      const vista = await render(<Arbol />);
      sinSesion();
      await vista.rerender(<Arbol />);

      await act(async () => {
        soltarMarca(null);
      });
      await asentar();
      expect(llamadasA(llamadas, 'GET', RUTA_SENSIBLES)).toHaveLength(0);
      expect(screen.queryByText(TITULO)).not.toBeOnTheScreen();

      conSesion();
      await vista.rerender(<Arbol />);
      expect(await screen.findByText(TITULO)).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'GET', RUTA_SENSIBLES)).toHaveLength(1);
    } finally {
      if (original) {
        secureStore.getItemAsync.mockImplementation(original);
      }
    }
  });

  it('mientras llega el estado de la autorización: no la ofrece ni deja la marca, y al volver a entrar sale', async () => {
    const estado = diferida();
    let vez = 0;
    const llamadas = servidor({
      [`GET ${RUTA_SENSIBLES}`]: () => {
        vez += 1;
        return vez === 1 ? estado.promesa : respuestaEstadoSensibles(false, true);
      },
    });
    const vista = await render(<Arbol />);
    await waitFor(() => expect(llamadasA(llamadas, 'GET', RUTA_SENSIBLES)).toHaveLength(1));
    sinSesion();
    await vista.rerender(<Arbol />);

    await act(async () => {
      estado.soltar(respuestaEstadoSensibles(false, true));
    });
    await asentar();
    expect(screen.queryByText(TITULO)).not.toBeOnTheScreen();
    expect(marcas()).toEqual([]);

    conSesion();
    await vista.rerender(<Arbol />);
    expect(await screen.findByText(TITULO)).toBeOnTheScreen();
    expect(llamadasA(llamadas, 'GET', RUTA_SENSIBLES)).toHaveLength(2);
    await waitFor(() => expect(marcas()).toHaveLength(1));
  });
});

describe('la hoja del texto mientras se envía "Autorizo"', () => {
  it('Atrás no la cierra ni termina la oferta; decide la respuesta del backend', async () => {
    const envio = diferida();
    const llamadas = servidor({ [`POST ${RUTA_SENSIBLES}`]: () => envio.promesa });
    await render(<Arbol />);
    await fireEvent.press(await screen.findByRole('button', { name: LEER }));
    await fireEvent.press(await screen.findByRole('checkbox', { name: CASILLA }));
    await fireEvent.press(screen.getByRole('button', { name: AUTORIZO }));
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(1);

    await fireEvent(modalVisible(), 'requestClose');
    expect(screen.getByText(PARRAFO_1)).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: CASILLA })).toBeChecked();

    await act(async () => {
      envio.soltar(respuestaAutorizada());
    });
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: CASILLA })).not.toBeOnTheScreen());
    expect(screen.queryByText(TITULO)).not.toBeOnTheScreen();
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES).map((l) => l.cuerpo)).toEqual([
      { version: '1.0', hash: HASH_SENSIBLES, rutaOrigen: '/inicio' },
    ]);
  });
});
