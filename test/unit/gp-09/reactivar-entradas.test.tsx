/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';

import { iniciarSesion } from '@/features/auth/models/authService';
import { ErrorCuentaDesactivada, ErrorRolNoPermitido } from '@/features/auth/models/AuthModel';
import { ErrorInicioGoogle } from '@/features/auth/models/googleAuth';
import { invalidarPerfil } from '@/features/auth/models/perfilCompartido';
import { useGoogleViewModel } from '@/features/auth/viewmodels/useGoogleViewModel';
import { useLoginViewModel } from '@/features/auth/viewmodels/useLoginViewModel';
import { useRetornoActivacion } from '@/features/auth/viewmodels/useRetornoActivacion';
import { ApiError } from '@/shared/api/apiClient';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { cuentaSinActivar } from '../../helpers/datosClienta';
import { respuestaCon, servidorEnOrden } from '../../helpers/limitesRed';
import { cuentaDesactivada, DESACTIVADA_SERVIDOR, TEXTO } from '../../helpers/reactivar';
import { cerrarPruebaSesion } from '../../helpers/sesionLimites';
import {
  authSimulada,
  navegacionSimulada,
  reiniciarSimulaciones,
  routerSimulado,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque C: las entradas a Reactivar. El 403 CUENTA_DESACTIVADA del login (solo por su code)
 * y el regreso de Google con la cuenta desactivada (ErrorCuentaDesactivada) muestran el aviso y
 * ofrecen "Reactivar mi cuenta"; el login lleva el correo y Google no. CUENTA_NO_ACTIVADA sigue
 * abriendo Activar, y otro 403 u otro error de Google nunca ofrecen reactivar. Al regresar con el
 * motivo 'reactivada', Acceso muestra el aviso del catálogo. Viewmodels con renderHook, fetch
 * simulado en http://api.test y datos ficticios.
 */

const mockIngresar = jest.fn();
const mockIngresarConGoogle = jest.fn();
let mockRuta = '/login';

jest.mock('expo-router', () => ({
  ...require('../../helpers/viewmodelsAuth').expoRouterSimulado(),
  usePathname: () => mockRuta,
}));
jest.mock('@/features/auth/viewmodels/useAuth', () => ({
  useAuth: () => ({
    ...require('../../helpers/viewmodelsAuth').authSimulada,
    ingresar: mockIngresar,
    ingresarConGoogle: mockIngresarConGoogle,
  }),
}));

const CORREO = 'clienta@ejemplo.test';
const CLAVE = 'ClaveFicticia1!';
const RUTA_LOGIN = '/api/auth/login';

beforeEach(() => {
  reiniciarSimulaciones();
  invalidarPerfil();
  mockRuta = '/login';
  mockIngresar.mockReset();
  mockIngresar.mockImplementation(async (email: string, clave: string) => {
    await iniciarSesion(email, clave);
  });
  mockIngresarConGoogle.mockReset();
});

afterEach(async () => {
  await cerrarPruebaSesion();
});

async function tocar(accion: () => void): Promise<void> {
  await act(async () => {
    accion();
  });
}

async function entrarCon(respuesta: Response, correo = CORREO) {
  servidorEnOrden({ [`POST ${RUTA_LOGIN}`]: [respuesta] });
  const vista = await renderHook(() => useLoginViewModel());
  await tocar(() => vista.result.current.setCorreo(correo));
  await tocar(() => vista.result.current.setClave(CLAVE));
  await tocar(() => vista.result.current.entrar());
  return vista;
}

describe('Login con una cuenta desactivada', () => {
  it('el 403 CUENTA_DESACTIVADA muestra el aviso del catálogo y Reactivar abre la pantalla con el correo', async () => {
    mockRuta = '/registro';
    const { result } = await entrarCon(cuentaDesactivada(), '  Clienta@Ejemplo.test ');

    expect(result.current.errorGeneral).toBe(TEXTO.desactivada);
    expect(result.current.errorGeneral).not.toBe(DESACTIVADA_SERVIDOR);
    expect(result.current.cuentaDesactivada).toBe(true);
    expect(routerSimulado.push).not.toHaveBeenCalled();

    await tocar(() => result.current.reactivar());
    expect(routerSimulado.push).toHaveBeenCalledWith({
      pathname: '/reactivar',
      params: { email: CORREO, volverA: '/registro' },
    });
  });

  it('un nuevo intento o el regreso a Acceso quitan la oferta de reactivar', async () => {
    const vista = await entrarCon(cuentaDesactivada());
    expect(vista.result.current.cuentaDesactivada).toBe(true);

    await tocar(() => vista.result.current.prepararAcceso(CORREO));
    expect(vista.result.current.cuentaDesactivada).toBe(false);
    expect(vista.result.current.errorGeneral).toBeNull();
    // Sin la cuenta desactivada, "Reactivar" no navega.
    await tocar(() => vista.result.current.reactivar());
    expect(routerSimulado.push).not.toHaveBeenCalled();
  });

  it('cambiar a otro correo quita la oferta; el mismo correo con otras mayúsculas la conserva', async () => {
    const vista = await entrarCon(cuentaDesactivada());
    await tocar(() => vista.result.current.setCorreo(' CLIENTA@ejemplo.test'));
    expect(vista.result.current.cuentaDesactivada).toBe(true);

    await tocar(() => vista.result.current.setCorreo('otra@ejemplo.test'));
    expect(vista.result.current.cuentaDesactivada).toBe(false);
    expect(vista.result.current.errorGeneral).toBeNull();
    await tocar(() => vista.result.current.reactivar());
    expect(routerSimulado.push).not.toHaveBeenCalled();
  });

  it('CUENTA_NO_ACTIVADA sigue abriendo Activar y no ofrece reactivar', async () => {
    const { result } = await entrarCon(cuentaSinActivar());
    expect(routerSimulado.push).toHaveBeenCalledWith({
      pathname: '/activar',
      params: { email: CORREO, volverA: '/login' },
    });
    expect(result.current.cuentaDesactivada).toBe(false);
  });

  it.each([
    ['sin code', respuestaCon({ statusCode: 403, message: 'Forbidden' }, 403)],
    ['con otro code', respuestaCon({ statusCode: 403, message: 'Sin permiso', code: 'OTRO_CODE' }, 403)],
    ['CUENTA_DESACTIVADA con otro status', respuestaCon({ statusCode: 401, message: 'No', code: 'CUENTA_DESACTIVADA' }, 401)],
  ])('un 403 %s sigue como hoy y nunca ofrece reactivar', async (_caso, respuesta) => {
    const { result } = await entrarCon(respuesta);
    expect(result.current.cuentaDesactivada).toBe(false);
    expect(result.current.errorGeneral).not.toBe(TEXTO.desactivada);
    expect(result.current.errorGeneral).toEqual(expect.any(String));
    expect(routerSimulado.push).not.toHaveBeenCalled();
  });
});

describe('Google con una cuenta desactivada', () => {
  it('ErrorCuentaDesactivada muestra el aviso y Reactivar abre la pantalla sin correo', async () => {
    mockRuta = '/recuperar';
    mockIngresarConGoogle.mockRejectedValueOnce(new ErrorCuentaDesactivada());
    const { result } = await renderHook(() => useGoogleViewModel());

    await tocar(() => result.current.entrar());
    expect(result.current.error).toBe(TEXTO.desactivada);
    expect(result.current.cuentaDesactivada).toBe(true);
    expect(result.current.abriendo).toBe(false);

    await tocar(() => result.current.reactivar());
    // Desde una pantalla que no es de acceso, Reactivar regresa a /login.
    expect(routerSimulado.push).toHaveBeenCalledWith({ pathname: '/reactivar', params: { volverA: '/login' } });

    await tocar(() => result.current.limpiarError());
    expect(result.current.error).toBeNull();
    expect(result.current.cuentaDesactivada).toBe(false);
  });

  it.each([
    ['el regreso con otro error', new ErrorInicioGoogle()],
    ['una cuenta del personal', new ErrorRolNoPermitido()],
    ['un 403 CUENTA_DESACTIVADA del canje', new ApiError(403, 'Desactivada', 'CUENTA_DESACTIVADA')],
  ])('%s sigue como hoy y no ofrece reactivar', async (_caso, fallo) => {
    mockIngresarConGoogle.mockRejectedValueOnce(fallo);
    const { result } = await renderHook(() => useGoogleViewModel());
    await tocar(() => result.current.entrar());
    expect(result.current.cuentaDesactivada).toBe(false);
    expect(result.current.error).not.toBe(TEXTO.desactivada);
    expect(result.current.error).toEqual(expect.any(String));
  });

  it('un intento nuevo quita la oferta y, con Google abierto, el enlace a Reactivar no navega', async () => {
    let soltar: () => void = () => undefined;
    mockIngresarConGoogle
      .mockRejectedValueOnce(new ErrorCuentaDesactivada())
      .mockImplementationOnce(() => new Promise<boolean>((resolver) => { soltar = () => resolver(false); }));
    mockRuta = '/registro';
    const { result } = await renderHook(() => useGoogleViewModel());
    await tocar(() => result.current.entrar());
    expect(result.current.cuentaDesactivada).toBe(true);

    await tocar(() => result.current.entrar());
    expect(result.current.abriendo).toBe(true);
    expect(result.current.cuentaDesactivada).toBe(false);
    await tocar(() => result.current.reactivar());
    expect(routerSimulado.push).not.toHaveBeenCalled();

    await act(async () => {
      soltar();
    });
    expect(result.current.abriendo).toBe(false);
    await tocar(() => result.current.reactivar());
    expect(routerSimulado.push).toHaveBeenCalledWith({ pathname: '/reactivar', params: { volverA: '/registro' } });
  });
});

describe('Regreso a Acceso tras reactivar', () => {
  it("con motivo 'reactivada' el aviso es el del catálogo y el correo vuelve escrito", async () => {
    navegacionSimulada.params = { correo: CORREO, vuelta: '1', motivo: 'reactivada' };
    const { result } = await renderHook(() => useRetornoActivacion());
    expect(result.current.aviso).toBe(RESPALDO_TEXTOS['cuenta.reactivar.listo']);
    expect(result.current.retorno).toEqual({ correo: CORREO, vez: '1' });
  });

  it('al volver de Reactivar, su aviso gana al de una baja que sigue en memoria', async () => {
    authSimulada.avisoBaja = { mensaje: 'Aviso ficticio de la baja.', folio: null };
    navegacionSimulada.params = { motivo: 'reactivada' };
    const { result } = await renderHook(() => useRetornoActivacion());
    expect(result.current.aviso).toBe(RESPALDO_TEXTOS['cuenta.reactivar.listo']);
  });

  it('el aviso de una baja en memoria gana a los demás motivos', async () => {
    authSimulada.avisoBaja = { mensaje: 'Aviso ficticio de la baja.', folio: null };
    navegacionSimulada.params = { motivo: 'contrasena', activada: '1' };
    const { result } = await renderHook(() => useRetornoActivacion());
    expect(result.current.aviso).toBe('Aviso ficticio de la baja.');
  });
});
