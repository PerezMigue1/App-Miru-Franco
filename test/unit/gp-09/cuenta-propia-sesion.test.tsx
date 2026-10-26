/// <reference types="jest" />

import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react-native';

import { ErrorCuentaDesactivada } from '@/features/auth/models/AuthModel';
import { ErrorInicioGoogle } from '@/features/auth/models/googleAuth';
import { AuthProvider, useAuth } from '@/features/auth/viewmodels/useAuth';
import { textoAvisoBaja, useRetornoActivacion } from '@/features/auth/viewmodels/useRetornoActivacion';
import { alCerrarSesion } from '@/shared/api/eventosSesion';

import { USUARIO } from '../../helpers/datosClienta';
import { REGRESO_CON_ERROR, REGRESO_GOOGLE, navegadorRegresa } from '../../helpers/google';
import { sembrarSesion, sesionGuardada } from '../../helpers/sesionGuardada';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import { navegacionSimulada, reiniciarSimulaciones, servidorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, prompt 2, bloque A: la sesión ante la cuenta propia. useAuth real: el regreso de Google con
 * error=cuenta_desactivada lanza ErrorCuentaDesactivada (otro error sigue siendo ErrorInicioGoogle)
 * y cerrarTrasBajaDeCuenta borra la sesión de SecureStore sin /logout, corta los avisos (cierre de
 * sesión 'salida') y deja el aviso para Acceso, que useRetornoActivacion muestra con el folio.
 * fetch, expo-crypto, expo-web-browser y expo-router simulados; datos ficticios.
 */

jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());
jest.mock('expo-device', () => ({ modelName: null }));
jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());

const FOLIO = 'ARCO-2026-000123';
const MENSAJE_DESACTIVADA = 'Desactivamos tu cuenta y cerramos tus sesiones.';
const MENSAJE_ELIMINADA = `Eliminamos tu cuenta. Te enviamos la confirmación con el folio ${FOLIO} a tu correo.`;

beforeEach(() => {
  reiniciarSimulaciones();
});

afterEach(async () => {
  await cleanup();
});

function servidor() {
  return servidorVm({
    'GET /api/auth/me': () => respuesta({ data: USUARIO }),
    'POST /api/auth/logout': () => respuesta({ success: true }),
  });
}

async function montar(estado: 'anonimo' | 'autenticado') {
  const vista = await renderHook(() => ({ auth: useAuth(), retorno: useRetornoActivacion() }), { wrapper: AuthProvider });
  await waitFor(() => expect(vista.result.current.auth.estado).toBe(estado));
  return vista;
}

describe('Google con error=cuenta_desactivada', () => {
  it('lanza ErrorCuentaDesactivada y no crea sesión', async () => {
    const llamadas = servidor();
    const { result } = await montar('anonimo');
    navegadorRegresa(`${REGRESO_GOOGLE}?error=cuenta_desactivada`);

    let error: unknown = null;
    await act(async () => {
      await result.current.auth.ingresarConGoogle().catch((e: unknown) => {
        error = e;
      });
    });

    expect(error).toBeInstanceOf(ErrorCuentaDesactivada);
    expect(llamadasA(llamadas, 'POST', '/api/auth/exchange-code')).toHaveLength(0);
    expect(sesionGuardada()).toBeNull();
  });

  it('otro error sigue siendo ErrorInicioGoogle', async () => {
    servidor();
    const { result } = await montar('anonimo');
    navegadorRegresa(REGRESO_CON_ERROR);

    let error: unknown = null;
    await act(async () => {
      await result.current.auth.ingresarConGoogle().catch((e: unknown) => {
        error = e;
      });
    });

    expect(error).toBeInstanceOf(ErrorInicioGoogle);
    expect(error).not.toBeInstanceOf(ErrorCuentaDesactivada);
  });
});

describe('cerrarTrasBajaDeCuenta', () => {
  beforeEach(() => {
    sonda.auth = null;
    sonda.aviso = null;
  });

  it('borra token y refreshToken, no llama a /logout, avisa el cierre y deja el aviso para Acceso', async () => {
    await sembrarSesion({ ...USUARIO, id: String(USUARIO.id) });
    const llamadas = servidor();
    const motivos: string[] = [];
    const dejar = alCerrarSesion((motivo) => motivos.push(motivo));
    const { result } = await montar('autenticado');
    expect(sesionGuardada()).not.toBeNull();

    await act(async () => {
      await result.current.auth.cerrarTrasBajaDeCuenta({ mensaje: MENSAJE_DESACTIVADA, folio: null });
    });

    expect(sesionGuardada()).toBeNull();
    expect(result.current.auth.estado).toBe('anonimo');
    expect(result.current.auth.sesionVencida).toBe(false);
    expect(motivos).toEqual(['salida']);
    expect(llamadasA(llamadas, 'POST', '/api/auth/logout')).toHaveLength(0);
    expect(result.current.auth.avisoBaja).toEqual({ mensaje: MENSAJE_DESACTIVADA, folio: null });
    expect(result.current.retorno.aviso).toBe(MENSAJE_DESACTIVADA);
    dejar();
  });

  it('el aviso se descarta al salir de Acceso', async () => {
    servidor();
    const vista = await render(<Arbol conAcceso />);
    await waitFor(() => expect(sonda.auth?.estado).toBe('anonimo'));
    await act(async () => {
      await sonda.auth?.cerrarTrasBajaDeCuenta({ mensaje: MENSAJE_ELIMINADA, folio: FOLIO });
    });
    expect(sonda.auth?.avisoBaja).toEqual({ mensaje: MENSAJE_ELIMINADA, folio: FOLIO });
    expect(sonda.aviso).toBe(MENSAJE_ELIMINADA);

    await vista.rerender(<Arbol conAcceso={false} />);

    await waitFor(() => expect(sonda.auth?.avisoBaja).toBeNull());
  });
});

/** Lo último que vieron la sonda de useAuth y la pantalla de Acceso simulada. */
const sonda: { auth: ReturnType<typeof useAuth> | null; aviso: string | null } = { auth: null, aviso: null };

function Sonda() {
  sonda.auth = useAuth();
  return null;
}

function AccesoFalso() {
  sonda.aviso = useRetornoActivacion().aviso;
  return null;
}

/** AuthProvider con la sonda y, si conAcceso, la pantalla de Acceso montada. */
function Arbol({ conAcceso }: { conAcceso: boolean }) {
  return (
    <AuthProvider>
      <Sonda />
      {conAcceso ? <AccesoFalso /> : null}
    </AuthProvider>
  );
}

describe('useRetornoActivacion con el aviso de la baja', () => {
  it('el aviso de la baja gana a los parámetros y lleva el folio', async () => {
    navegacionSimulada.params = { motivo: 'contrasena' };
    servidor();
    const vista = await montar('anonimo');
    expect(vista.result.current.retorno.aviso).toBe('Tu contraseña cambió. Inicia sesión de nuevo.');

    await act(async () => {
      await vista.result.current.auth.cerrarTrasBajaDeCuenta({ mensaje: 'Eliminamos tu cuenta.', folio: FOLIO });
    });

    expect(vista.result.current.retorno.aviso).toBe(`Eliminamos tu cuenta. Folio: ${FOLIO}`);
  });

  it('iniciar sesión otra vez quita el aviso de la baja', async () => {
    const llamadas = servidorVm({
      'POST /api/auth/login': () =>
        respuesta({ success: true, token: 'token-ficticio', refreshToken: 'refresh-ficticio', usuario: USUARIO }),
      'GET /api/auth/me': () => respuesta({ data: USUARIO }),
    });
    const vista = await montar('anonimo');
    await act(async () => {
      await vista.result.current.auth.cerrarTrasBajaDeCuenta({ mensaje: MENSAJE_DESACTIVADA, folio: null });
    });
    expect(vista.result.current.auth.avisoBaja).not.toBeNull();

    await act(async () => {
      await vista.result.current.auth.ingresar(USUARIO.email, 'ClaveFicticia1!');
    });

    expect(llamadasA(llamadas, 'POST', '/api/auth/login')).toHaveLength(1);
    expect(vista.result.current.auth.avisoBaja).toBeNull();
    expect(vista.result.current.retorno.aviso).toBeNull();
  });
});

describe('textoAvisoBaja', () => {
  const folio = (valor: string) => `Folio: ${valor}`;

  it('sin folio es el message tal cual', () => {
    expect(textoAvisoBaja({ mensaje: MENSAJE_DESACTIVADA, folio: null }, folio)).toBe(MENSAJE_DESACTIVADA);
  });

  it('si el message ya trae el folio no lo repite', () => {
    expect(textoAvisoBaja({ mensaje: MENSAJE_ELIMINADA, folio: FOLIO }, folio)).toBe(MENSAJE_ELIMINADA);
  });

  it('si el message no trae el folio lo agrega', () => {
    expect(textoAvisoBaja({ mensaje: 'Eliminamos tu cuenta.', folio: FOLIO }, folio)).toBe(`Eliminamos tu cuenta. Folio: ${FOLIO}`);
  });
});
