/// <reference types="jest" />

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TestInstance } from 'test-renderer';

import { reiniciarReaceptacion, useFaseReaceptacion } from '@/features/auth/viewmodels/useDocumentosPendientes';
import { DocumentosPendientesView } from '@/features/auth/views/DocumentosPendientesView';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { ESPERA_LENTA_MS, reiniciarEstadoConexion } from '@/shared/api/estadoConexion';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  RUTA_PENDIENTES,
  pendienteCrudo,
  respuestaConsentimientoGuardado,
  respuestaPendientes,
} from '../../helpers/documentosPendientes';
import { limite429, saturacion503, servidorEnOrden, vecesA, type Respondedor } from '../../helpers/limitesRed';
import type { Llamada } from '../../helpers/servidorSimulado';
import { authSimulada, cerrarConTemporizadores, reiniciarSimulaciones } from '../../helpers/viewmodelsAuth';

/**
 * GP-09: carga a pantalla completa mientras se consultan los documentos pendientes. Con sesión y la
 * pantalla habilitada, el Modal de los pendientes cubre la app con la carga (sin botones, Atrás no la
 * cierra) hasta saber si hay alguno; si llega uno, el mismo Modal cambia a la pantalla obligatoria.
 * Sin pendientes, sin red, con 429, 503 o tiempo agotado se quita y la app sigue. Lleva dentro la
 * franja "Conectando con el salón…". La fase nunca se queda en 'consultando'. fetch simulado en
 * http://api.test con datos ficticios y useAuth simulado.
 */

jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const CLIENTA = { id: 'clienta-carga-1', nombre: 'Clienta Carga', email: 'carga@ejemplo.test', rol: 'cliente' };
const OTRA = { id: 'clienta-carga-2', nombre: 'Otra Clienta', email: 'otra@ejemplo.test', rol: 'cliente' };
const CARGANDO = obtenerTexto('legal.pendientes.cargando');
const CERRAR = obtenerTexto('legal.pendientes.cerrarSesion');
const CONECTANDO = RESPALDO_TEXTOS['red.conectando'];
const CLAVE = `GET ${RUTA_PENDIENTES}`;

/** Muestra la fase para revisar que nunca se queda en 'consultando'. */
function Fase() {
  return <Text testID="fase">{useFaseReaceptacion()}</Text>;
}

function Arbol({ habilitada }: { habilitada: boolean }) {
  return (
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <DocumentosPendientesView habilitada={habilitada} />
      <Fase />
    </SafeAreaProvider>
  );
}

async function pintar(habilitada = true) {
  return render(<Arbol habilitada={habilitada} />);
}

const fase = (): string => String(screen.getByTestId('fase').props.children);

/** El Modal de los pendientes (el único nodo con onRequestClose). */
function modal(): TestInstance {
  const nodos = screen.container.queryAll((nodo) => typeof nodo.props.onRequestClose === 'function');
  expect(nodos.length).toBeGreaterThan(0);
  return nodos[0];
}

/** fetch de pendientes que responde cuando la prueba quiere. */
function pendientesDiferidos(): { llamadas: Llamada[]; soltar: (respuesta: Response) => Promise<void> } {
  let resolver: ((respuesta: Response) => void) | null = null;
  const promesa = new Promise<Response>((r) => {
    resolver = r;
  });
  const llamadas = servidorEnOrden({ [CLAVE]: [() => promesa] });
  return {
    llamadas,
    soltar: async (respuesta) => {
      await act(async () => {
        resolver?.(respuesta);
        await jest.advanceTimersByTimeAsync(0);
      });
    },
  };
}

/** Deja correr el reloj falso (y las promesas que esperan) dentro de act. */
async function avanzar(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  reiniciarSimulaciones();
  reiniciarReaceptacion();
  reiniciarDocumentosLegales();
  reiniciarEstadoConexion();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA;
});

afterEach(async () => {
  await cerrarConTemporizadores();
  reiniciarEstadoConexion();
  jest.restoreAllMocks();
});

describe('carga de los documentos pendientes', () => {
  it('cubre la app mientras la consulta está en curso, sin botones, y Atrás no la cierra', async () => {
    const { soltar } = pendientesDiferidos();
    await pintar();
    await avanzar(0);

    const carga = screen.getByLabelText(CARGANDO);
    expect(carga).toBeOnTheScreen();
    expect(carga.props.accessibilityState).toEqual({ busy: true });
    expect(modal().props.visible).toBe(true);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(fase()).toBe('consultando');

    await act(async () => {
      modal().props.onRequestClose();
    });
    expect(screen.getByLabelText(CARGANDO)).toBeOnTheScreen();

    await soltar(respuestaPendientes([]));
    expect(fase()).toBe('listo');
  });

  it('con pendientes el mismo Modal pasa a la pantalla obligatoria sin cerrarse', async () => {
    const { soltar } = pendientesDiferidos();
    await pintar();
    await avanzar(0);
    const antes = modal();
    expect(screen.getByLabelText(CARGANDO)).toBeOnTheScreen();

    await soltar(respuestaPendientes([pendienteCrudo({ tipo: 'nuevo', documentoSlug: 'documento-nuevo' })]));
    await avanzar(0);

    expect(screen.getByRole('button', { name: CERRAR })).toBeOnTheScreen();
    expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();
    expect(modal()).toBe(antes);
    expect(modal().props.visible).toBe(true);
    expect(fase()).toBe('pendientes');
  });

  it.each<[string, Respondedor, 'listo' | 'fallido']>([
    ['sin pendientes', respuestaPendientes([]), 'listo'],
    ['sin red', 'sinRed', 'fallido'],
    ['un 429', limite429(30), 'fallido'],
    ['un 503', saturacion503(null), 'fallido'],
  ])('%s, la carga se quita y la app sigue', async (_caso, salida, esperada) => {
    const llamadas = servidorEnOrden({ [CLAVE]: [salida] });
    await pintar();
    await avanzar(0);

    // El 503 de una lectura se reintenta una vez tras su espera (2 s sin Retry-After): la carga sigue.
    await avanzar(10_000);

    expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: CERRAR })).not.toBeOnTheScreen();
    expect(fase()).toBe(esperada);
    expect(vecesA(llamadas, 'GET', RUTA_PENDIENTES)).toBeGreaterThan(0);
  });

  it('durante la espera del reintento de un 503 la carga sigue a la vista', async () => {
    servidorEnOrden({ [CLAVE]: [saturacion503(null)] });
    await pintar();
    await avanzar(1_000);
    expect(screen.getByLabelText(CARGANDO)).toBeOnTheScreen();

    await avanzar(2_000);
    expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();
    expect(fase()).toBe('fallido');
  });

  it('si apiClient agota su tiempo, la carga no dura más que la petición y deja pasar', async () => {
    const llamadas = servidorEnOrden({ [CLAVE]: ['pendiente'] });
    await pintar();
    await avanzar(0);
    expect(screen.getByLabelText(CARGANDO)).toBeOnTheScreen();

    await avanzar(59_000);
    expect(screen.getByLabelText(CARGANDO)).toBeOnTheScreen();
    await avanzar(1_000);

    expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();
    expect(fase()).toBe('fallido');
    expect(vecesA(llamadas, 'GET', RUTA_PENDIENTES)).toBe(1);
  });

  it('dentro de la carga sale "Conectando con el salón…" cuando la petición pasa de 3 s', async () => {
    const { soltar } = pendientesDiferidos();
    await pintar();
    await avanzar(ESPERA_LENTA_MS - 1);
    expect(screen.queryByLabelText(CONECTANDO)).not.toBeOnTheScreen();

    await avanzar(1);
    // Solo se pintó el Modal: la franja que se ve es la de la carga, no la de la raíz.
    expect(screen.getByLabelText(CONECTANDO)).toBeOnTheScreen();
    expect(screen.getByLabelText(CARGANDO)).toBeOnTheScreen();

    await soltar(respuestaPendientes([]));
    expect(screen.queryByLabelText(CONECTANDO)).not.toBeOnTheScreen();
    expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();
  });

  it('sin sesión no hay carga ni consulta', async () => {
    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    const llamadas = servidorEnOrden({ [CLAVE]: ['pendiente'] });
    await pintar();
    await avanzar(0);

    expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();
    expect(vecesA(llamadas, 'GET', RUTA_PENDIENTES)).toBe(0);
    expect(fase()).toBe('inactivo');
  });

  it('sin habilitar (la intro sigue a la vista) no hay carga; al habilitar, sale', async () => {
    const { soltar } = pendientesDiferidos();
    const vista = await pintar(false);
    await avanzar(0);

    expect(fase()).toBe('consultando');
    expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();

    await vista.rerender(<Arbol habilitada />);
    expect(screen.getByLabelText(CARGANDO)).toBeOnTheScreen();

    await soltar(respuestaPendientes([]));
    expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();
  });

  it('con movimiento reducido aparece y se va sin fundido; sin él, con fundido', async () => {
    servidorEnOrden({ [CLAVE]: ['pendiente'] });
    const vista = await pintar();
    await avanzar(0);
    expect(modal().props.animationType).toBe('fade');
    await vista.unmount();

    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await pintar();
    await avanzar(0);
    expect(screen.getByLabelText(CARGANDO)).toBeOnTheScreen();
    expect(modal().props.animationType).toBe('none');
  });
});

describe('la fase nunca se queda en consultando', () => {
  it('si la sesión se cierra a mitad de la consulta, la carga se va y la respuesta tardía no escribe', async () => {
    const { soltar } = pendientesDiferidos();
    const vista = await pintar();
    await avanzar(0);
    expect(fase()).toBe('consultando');

    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    await vista.rerender(<Arbol habilitada />);
    expect(fase()).toBe('inactivo');
    expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();

    await soltar(respuestaPendientes([pendienteCrudo()]));
    expect(fase()).toBe('inactivo');
    expect(screen.queryByRole('button', { name: CERRAR })).not.toBeOnTheScreen();
  });

  it('si entra otra clienta a mitad de la consulta, cuenta solo la consulta de la nueva', async () => {
    let soltarPrimera: ((respuesta: Response) => void) | null = null;
    const primera = new Promise<Response>((r) => {
      soltarPrimera = r;
    });
    servidorEnOrden({ [CLAVE]: [() => primera, respuestaPendientes([])] });
    const vista = await pintar();
    await avanzar(0);

    authSimulada.usuario = OTRA;
    await vista.rerender(<Arbol habilitada />);
    await avanzar(0);
    expect(fase()).toBe('listo');

    await act(async () => {
      soltarPrimera?.(respuestaPendientes([pendienteCrudo()]));
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(fase()).toBe('listo');
    expect(screen.queryByRole('button', { name: CERRAR })).not.toBeOnTheScreen();
  });

  it('al desmontarse a mitad de la consulta, la fase vuelve a inactivo', async () => {
    const { soltar } = pendientesDiferidos();
    const vista = await pintar();
    await avanzar(0);
    expect(fase()).toBe('consultando');

    // Solo se quita la vista; la sonda de la fase sigue montada.
    await vista.rerender(
      <SafeAreaProvider initialMetrics={MEDIDAS}>
        <Fase />
      </SafeAreaProvider>,
    );
    expect(fase()).toBe('inactivo');

    await soltar(respuestaPendientes([pendienteCrudo()]));
    expect(fase()).toBe('inactivo');
  });

  it('el reintento al volver a primer plano no cubre la app, y si encuentra pendientes los pide', async () => {
    const oyentes: Array<(estado: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_evento, oyente) => {
      oyentes.push(oyente as (estado: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    let soltarReintento: ((respuesta: Response) => void) | null = null;
    const reintento = new Promise<Response>((r) => {
      soltarReintento = r;
    });
    servidorEnOrden({ [CLAVE]: ['sinRed', () => reintento] });
    await pintar();
    await avanzar(0);
    expect(fase()).toBe('fallido');

    await act(async () => {
      for (const oyente of oyentes) {
        oyente('active');
      }
    });
    expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();
    expect(fase()).toBe('fallido');

    await act(async () => {
      soltarReintento?.(respuestaPendientes([pendienteCrudo({ tipo: 'nuevo', documentoSlug: 'documento-nuevo' })]));
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('button', { name: CERRAR })).toBeOnTheScreen();
    expect(fase()).toBe('pendientes');
  });

  it('tras aceptar el último, la confirmación con el backend se ve como carga en el mismo Modal', async () => {
    let soltarConfirmacion: ((respuesta: Response) => void) | null = null;
    const confirmacion = new Promise<Response>((r) => {
      soltarConfirmacion = r;
    });
    servidorEnOrden({
      [CLAVE]: [respuestaPendientes([pendienteCrudo({ tipo: 'nuevo', documentoSlug: 'documento-nuevo' })]), () => confirmacion],
      'POST /api/consentimientos': [respuestaConsentimientoGuardado()],
    });
    await pintar();
    await avanzar(0);
    const antes = modal();

    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByRole('button', { name: obtenerTexto('legal.pendientes.aceptar') }));
    await avanzar(0);

    expect(screen.getByLabelText(CARGANDO)).toBeOnTheScreen();
    expect(modal()).toBe(antes);
    expect(modal().props.visible).toBe(true);

    await act(async () => {
      soltarConfirmacion?.(respuestaPendientes([]));
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();
    expect(fase()).toBe('listo');
  });
});
