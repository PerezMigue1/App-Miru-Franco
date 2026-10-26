/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, screen, waitFor, within } from 'expo-router/testing-library';
import type { TestInstance } from 'test-renderer';

import { reiniciarReaceptacion } from '@/features/auth/viewmodels/useDocumentosPendientes';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { ESPERA_LENTA_MS, reiniciarEstadoConexion } from '@/shared/api/estadoConexion';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { RUTA_PENDIENTES, pendienteCrudo, respuestaPendientes, vigenteCrudo } from '../../helpers/documentosPendientes';
import { LIMITE_MS, abrirApp, cerrarIntroSiAparece, prepararPruebasDePantalla } from '../../helpers/pantallas';
import { CLIENTA, simularServidorPerfil } from '../../helpers/perfilClienta';
import { llamadasA, type Manejador } from '../../helpers/servidorSimulado';
import { sembrarSesion, sesionGuardada } from '../../helpers/sesionGuardada';

/**
 * GP-09: carga de los documentos pendientes con las pantallas reales (renderRouter sobre src/app),
 * AuthProvider real y solo el servidor simulado en http://api.test. Al abrir la app con sesión, la
 * consulta de los pendientes cubre la app con la carga (en el Modal de los pendientes, encima de
 * Perfil y sin botones) hasta que llega la respuesta: con pendientes, el mismo Modal muestra la
 * pantalla obligatoria; sin pendientes, se quita y Perfil queda a la vista. Si tarda más de 3 s, la
 * franja "Conectando con el salón…" sale dentro de la carga.
 */

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

const CARGANDO = obtenerTexto('legal.pendientes.cargando');
const ACEPTAR = obtenerTexto('legal.pendientes.aceptar');
const CONECTANDO = RESPALDO_TEXTOS['red.conectando'];

const VIGENTE_AVISO: Record<string, Manejador> = {
  'GET /api/documentos-legales/aviso-privacidad/vigente': () =>
    vigenteCrudo('aviso-privacidad', 'Aviso de Privacidad', '/aviso-de-privacidad'),
};

/** Abre Perfil con sesión y con la consulta de pendientes sin respuesta hasta soltarla. */
async function abrirConPendientesDiferidos() {
  let resolver: ((respuesta: Response) => void) | null = null;
  const promesa = new Promise<Response>((r) => {
    resolver = r;
  });
  await sembrarSesion(CLIENTA);
  const llamadas = simularServidorPerfil({
    ...VIGENTE_AVISO,
    [`GET ${RUTA_PENDIENTES}`]: (() => promesa) as unknown as Manejador,
  });
  await abrirApp('/perfil');
  await cerrarIntroSiAparece();
  await waitFor(() => expect(llamadasA(llamadas, 'GET', RUTA_PENDIENTES).length).toBeGreaterThan(0));
  const soltar = async (respuesta: Response) => {
    await act(async () => {
      resolver?.(respuesta);
    });
  };
  return { llamadas, soltar };
}

/** El Modal de los documentos pendientes: el que tiene la carga adentro. */
function modalDeCarga(): TestInstance {
  const modales = screen.container.queryAll((nodo) => typeof nodo.props.onRequestClose === 'function');
  const conCarga = modales.filter((nodo) => within(nodo).queryByLabelText(CARGANDO) !== null);
  expect(conCarga).toHaveLength(1);
  return conCarga[0];
}

describe('Carga de los documentos pendientes en la app (GP-09)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  beforeEach(() => {
    reiniciarDocumentosLegales();
    reiniciarReaceptacion();
    reiniciarEstadoConexion();
  });

  it(
    'cubre Perfil mientras la consulta está en curso y luego muestra la pantalla obligatoria',
    async () => {
      const { soltar } = await abrirConPendientesDiferidos();

      const carga = await screen.findByLabelText(CARGANDO);
      expect(carga.props.accessibilityState).toEqual({ busy: true });
      const modal = modalDeCarga();
      expect(modal.props.visible).toBe(true);
      // Dentro de la carga no hay nada que tocar.
      expect(within(modal).queryAllByRole('button')).toHaveLength(0);

      await soltar(respuestaPendientes([pendienteCrudo()]));

      expect(await screen.findByRole('button', { name: ACEPTAR })).toBeOnTheScreen();
      expect(screen.getByText('Aviso de Privacidad')).toBeOnTheScreen();
      expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin pendientes la carga se quita y Perfil queda a la vista con la sesión',
    async () => {
      const { soltar } = await abrirConPendientesDiferidos();
      expect(await screen.findByLabelText(CARGANDO)).toBeOnTheScreen();

      await soltar(respuestaPendientes([]));

      await waitFor(() => expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen());
      expect(screen.getByText(CLIENTA.nombre)).toBeOnTheScreen();
      expect(screen.queryByRole('checkbox')).not.toBeOnTheScreen();
      expect(sesionGuardada()).not.toBeNull();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si la consulta pasa de 3 s, "Conectando con el salón…" sale dentro de la carga',
    async () => {
      jest.useFakeTimers();
      const { soltar } = await abrirConPendientesDiferidos();
      expect(await screen.findByLabelText(CARGANDO)).toBeOnTheScreen();
      expect(screen.queryByLabelText(CONECTANDO)).not.toBeOnTheScreen();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(ESPERA_LENTA_MS);
      });

      expect(within(modalDeCarga()).getByLabelText(CONECTANDO)).toBeOnTheScreen();

      await soltar(respuestaPendientes([]));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();
      expect(screen.queryByLabelText(CONECTANDO)).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
