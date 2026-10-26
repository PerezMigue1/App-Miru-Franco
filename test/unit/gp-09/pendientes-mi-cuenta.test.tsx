/// <reference types="jest" />

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import {
  useMiCuentaViewModel,
  VIGENCIA_CODIGO_RESPALDO_MIN,
  type MiCuentaViewModel,
} from '@/features/auth/viewmodels/useMiCuentaViewModel';
import MiCuentaView from '@/features/auth/views/MiCuentaView';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { ConAreaSegura } from '../../helpers/areaSegura';
import { limite429, MENSAJE_LIMITE } from '../../helpers/limitesRed';
import { RUTA_CODIGO_CUENTA, RUTA_REVISION, respuestaRevision } from '../../helpers/miCuenta';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import { authSimulada, enSecuencia, reiniciarSimulaciones, servidorVm, type ManejadorVm } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());

/**
 * GP-09, pendientes del prompt 3 (bloque E2) en Perfil > Mi cuenta: "Revisar de nuevo" respeta la
 * espera de un 429 de la revisión (deshabilitado, con "Intenta de nuevo en N s" y el message del
 * backend) y el aviso de código enviado de la app usa vigenciaMinutos de POST
 * /api/auth/me/cuenta/codigo, con 10 minutos de respaldo. fetch simulado en http://api.test, datos
 * ficticios y reloj falso.
 */

const CLIENTA = { id: 'clienta-pendientes-1', nombre: 'Clienta Pendientes', email: 'pendientes@ejemplo.test', rol: 'cliente' };
const ESPERA = RESPALDO_TEXTOS['errores.esperaLimite'];
const esperaDe = (segundos: number) => ESPERA.replace('{segundos}', String(segundos));
const REVISAR = obtenerTexto('cuenta.app.revisarDeNuevo');
const FILA_DESACTIVAR = `${obtenerTexto('cuenta.desactivar.titulo')}, ${obtenerTexto('cuenta.desactivar.explicacion')}`;

type Resultado = { current: MiCuentaViewModel };

beforeEach(() => {
  jest.useFakeTimers();
  reiniciarSimulaciones();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA;
});

afterEach(async () => {
  await cleanup();
  jest.useRealTimers();
});

const avanzar = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

async function elegir(result: Resultado, accion: 'desactivar' | 'eliminar' = 'desactivar'): Promise<void> {
  await act(async () => {
    result.current.opciones.find((o) => o.accion === accion)?.elegir();
  });
  await waitFor(() => expect(result.current.revision.estado).not.toBe('cargando'));
}

describe('Revisar de nuevo con un 429 de la revisión', () => {
  it('queda deshabilitado con la espera y el message; no pide otra revisión hasta que pasa', async () => {
    const llamadas = servidorVm({
      [`GET ${RUTA_REVISION}`]: enSecuencia(() => limite429(30), () => respuestaRevision()),
    });
    const { result } = await renderHook(() => useMiCuentaViewModel());
    await elegir(result);

    expect(result.current.revision).toMatchObject({
      estado: 'error',
      error: MENSAJE_LIMITE,
      revisarEnEspera: true,
      textoRevisarDeNuevo: esperaDe(30),
    });
    await act(async () => {
      result.current.revision.revisarDeNuevo();
    });
    expect(llamadasA(llamadas, 'GET', RUTA_REVISION)).toHaveLength(1);

    await avanzar(30_000);
    expect(result.current.revision).toMatchObject({ revisarEnEspera: false, textoRevisarDeNuevo: REVISAR });
    await act(async () => {
      result.current.revision.revisarDeNuevo();
    });
    await waitFor(() => expect(result.current.revision.estado).toBe('lista'));
    expect(llamadasA(llamadas, 'GET', RUTA_REVISION)).toHaveLength(2);
  });

  it('otro error deja "Revisar de nuevo" disponible', async () => {
    servidorVm({ [`GET ${RUTA_REVISION}`]: () => respuesta({ statusCode: 500, message: 'Error ficticio' }, 500) });
    const { result } = await renderHook(() => useMiCuentaViewModel());
    await elegir(result);
    expect(result.current.revision).toMatchObject({ estado: 'error', revisarEnEspera: false, textoRevisarDeNuevo: REVISAR });
  });

  it('en la vista, el botón muestra la espera, está deshabilitado y al terminar vuelve a "Revisar de nuevo"', async () => {
    servidorVm({ [`GET ${RUTA_REVISION}`]: enSecuencia(() => limite429(5), () => respuestaRevision()) });
    await render(<MiCuentaView />, { wrapper: ConAreaSegura });
    await fireEvent.press(screen.getByRole('button', { name: FILA_DESACTIVAR }));
    expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: esperaDe(5) })).toBeDisabled();
    await avanzar(5_000);
    expect(screen.getByRole('button', { name: REVISAR })).toBeEnabled();
  });
});

describe('vigencia del código de Mi cuenta', () => {
  function servidorCodigo(envio: ManejadorVm) {
    return servidorVm({
      [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ metodo: 'codigo' }),
      [`POST ${RUTA_CODIGO_CUENTA}`]: envio,
    });
  }

  async function pedirCodigo(): Promise<Resultado> {
    const { result } = await renderHook(() => useMiCuentaViewModel());
    await elegir(result, 'eliminar');
    await act(async () => {
      result.current.revision.continuar();
    });
    await act(async () => {
      result.current.confirmacion.enviarCodigo();
    });
    await waitFor(() => expect(result.current.confirmacion.avisoCodigo).not.toBeNull());
    return result;
  }

  it('sin message, el aviso de la app usa vigenciaMinutos de la respuesta', async () => {
    servidorCodigo(() => respuesta({ success: true, vigenciaMinutos: 15 }));
    const result = await pedirCodigo();
    expect(result.current.confirmacion.avisoCodigo).toBe('Te enviamos un código a tu correo. Vence en 15 minutos.');
  });

  it.each<[string, unknown]>([
    ['no viene', undefined],
    ['no es un entero positivo', 0],
  ])('si vigenciaMinutos %s, usa los 10 minutos de respaldo', async (_caso, vigencia) => {
    servidorCodigo(() => respuesta({ success: true, ...(vigencia === undefined ? {} : { vigenciaMinutos: vigencia }) }));
    const result = await pedirCodigo();
    expect(VIGENCIA_CODIGO_RESPALDO_MIN).toBe(10);
    expect(result.current.confirmacion.avisoCodigo).toBe(
      obtenerTexto('cuenta.app.codigoEnviado', { minutos: VIGENCIA_CODIGO_RESPALDO_MIN }),
    );
    expect(result.current.confirmacion.avisoCodigo).toContain('Vence en 10 minutos.');
  });

  it('el texto propio cuenta.app.codigoEnviado lleva la variable {minutos} y no un 10 fijo', () => {
    expect(RESPALDO_TEXTOS['cuenta.app.codigoEnviado']).toContain('{minutos}');
    expect(RESPALDO_TEXTOS['cuenta.app.codigoEnviado']).not.toMatch(/\b10\b/);
  });
});
