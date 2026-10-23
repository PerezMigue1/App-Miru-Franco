/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { AuthProvider, useAuth } from '@/features/auth/viewmodels/useAuth';
import {
  estadoPagoConocido,
  reiniciarVerificacion,
  suscribir,
  verificarPago,
  type EventoVerificacion,
} from '@/features/tienda/models/verificacionPago';
import { alCerrarSesion } from '@/shared/api/eventosSesion';
import type { SesionGuardada } from '@/shared/api/tokenStorage';

import { respuesta, type Llamada } from '../../helpers/servidorSimulado';
import {
  CLIENTA_SESION,
  QUINCE_MINUTOS_MS,
  RUTA_LOGOUT,
  RUTA_PERFIL,
  RUTA_RENOVAR_MOVIL,
  cerrarPruebaSesion,
  fallarSecureStore,
  guardarEnAlmacen,
  rutasDe,
  servidorSinRed,
  sesionFicticia,
  textoSesion,
} from '../../helpers/sesionLimites';
import { ID_PEDIDO, estadoPagoPedidoCrudo, rutaEstadoPagoPedido } from '../../helpers/tiendaFicticia';
import { errorServidor, servidorVm, type ManejadorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-07.6, cierre de sesión con useAuth (AuthProvider real). Cerrar sesión borra lo local y revoca
 * en el servidor sin bloquear: con red se manda POST /api/auth/logout con el Bearer y el
 * refreshToken (el backend, auth.controller.ts y auth.service.ts logout, revoca además todos los
 * tokens de la cuenta); sin red el cierre local termina igual. Todo cierre avisa una sola vez por
 * alCerrarSesion con su motivo, y lo que la tienda sabía del pago se borra en ese momento. Solo
 * fetch es simulado.
 */

const LOGOUT = `POST ${RUTA_LOGOUT}`;
const PERFIL = `GET ${RUTA_PERFIL}`;
const RENOVAR = `POST ${RUTA_RENOVAR_MOVIL}`;
const perfil: ManejadorVm = () => respuesta({ data: CLIENTA_SESION });
const listo: ManejadorVm = () => respuesta({ success: true });

const espiaCierre = jest.fn();
let quitarEspiaCierre: () => void = () => undefined;

beforeEach(() => {
  reiniciarVerificacion();
  espiaCierre.mockClear();
  quitarEspiaCierre = alCerrarSesion(espiaCierre);
});

afterEach(async () => {
  quitarEspiaCierre();
  reiniciarVerificacion();
  await cerrarPruebaSesion();
});

function montar() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

type Resultado = Awaited<ReturnType<typeof montar>>['result'];

/** Guarda la sesión, monta AuthProvider y espera a que la clienta quede dentro. */
async function entrar(sesion: SesionGuardada, rutas: Record<string, ManejadorVm>): Promise<{ result: Resultado; llamadas: Llamada[] }> {
  await guardarEnAlmacen(sesion);
  const llamadas = servidorVm({ [PERFIL]: perfil, ...rutas });
  const { result } = await montar();
  await waitFor(() => expect(result.current.estado).toBe('autenticado'));
  await waitFor(() => expect(rutasDe(llamadas)).toContain(PERFIL));
  return { result, llamadas };
}

async function salir(result: Resultado): Promise<boolean | undefined> {
  let cerrada: boolean | undefined;
  await act(async () => {
    cerrada = await result.current.salir();
  });
  return cerrada;
}

/** Quedó anónima, sin aviso de sesión vencida y sin nada guardado. */
function esperarAnonima(result: Resultado): void {
  expect(result.current.estado).toBe('anonimo');
  expect(result.current.usuario).toBeNull();
  expect(result.current.sesionVencida).toBe(false);
  expect(textoSesion()).toBeUndefined();
}

describe('cerrar sesión con red', () => {
  const movil = sesionFicticia();
  const clasica = sesionFicticia({ clasica: true });

  it.each([
    ['móvil', movil, { logoutAll: false, refreshToken: movil.refreshToken }],
    ['clásica (sin refreshToken)', clasica, { logoutAll: false }],
  ])('sesión %s: borra lo local, queda anónima y revoca con POST /api/auth/logout', async (_caso, sesion, cuerpo) => {
    const { result, llamadas } = await entrar(sesion, { [LOGOUT]: listo });
    await expect(salir(result)).resolves.toBe(true);
    esperarAnonima(result);
    await waitFor(() => expect(rutasDe(llamadas)).toContain(LOGOUT));
    const logout = llamadas.filter((llamada) => `${llamada.metodo} ${llamada.ruta}` === LOGOUT);
    expect(logout).toHaveLength(1);
    expect(logout[0].cabeceras.Authorization).toBe(`Bearer ${sesion.token}`);
    expect(logout[0].cuerpo).toEqual(cuerpo);
  });
});

describe('cerrar sesión sin red', () => {
  it.each([
    // Al abrir pide /me (sin respuesta) y al salir intenta revocar.
    ['con el acceso vigente', 0, PERFIL, [LOGOUT]],
    // Al abrir intenta renovar; al salir no puede renovar en memoria para revocar, así que no
    // manda /logout con un acceso vencido.
    ['con el acceso vencido', QUINCE_MINUTOS_MS, RENOVAR, [RENOVAR]],
  ])('%s: el cierre local termina igual y la app queda anónima', async (_caso, antiguedad, alAbrir, intentos) => {
    await guardarEnAlmacen(sesionFicticia({ emitidoEn: Date.now() - antiguedad }));
    const llamadas = servidorSinRed();
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('autenticado'));
    await waitFor(() => expect(rutasDe(llamadas)).toEqual([alAbrir]));
    const antes = llamadas.length;

    await expect(salir(result)).resolves.toBe(true);

    esperarAnonima(result);
    await waitFor(() => expect(rutasDe(llamadas.slice(antes))).toEqual(intentos));
    expect(espiaCierre).toHaveBeenCalledTimes(1);
  });
});

/** Cómo se llega a cada cierre de sesión, con la sesión ya dentro (o rechazada al abrir). */
const CIERRES: [string, string, () => Promise<void>][] = [
  [
    'salir',
    'salida',
    async () => {
      const { result } = await entrar(sesionFicticia(), { [LOGOUT]: listo });
      await salir(result);
    },
  ],
  [
    'cambiar la contraseña',
    'cambioContrasena',
    async () => {
      const { result } = await entrar(sesionFicticia(), {});
      await act(async () => {
        await result.current.cerrarTrasCambioDeContrasena();
      });
    },
  ],
  [
    'la sesión vencida (el servidor la rechaza)',
    'vencida',
    async () => {
      await guardarEnAlmacen(sesionFicticia());
      servidorVm({ [PERFIL]: () => errorServidor(401, 'No autorizado'), [RENOVAR]: () => errorServidor(401, 'Sesión vencida') });
      const { result } = await montar();
      await waitFor(() => expect(result.current.sesionVencida).toBe(true));
    },
  ],
  [
    'una cuenta que no es de clienta',
    'salida',
    async () => {
      await guardarEnAlmacen(sesionFicticia({ usuario: { ...CLIENTA_SESION, rol: 'admin' } }));
      servidorVm({ [LOGOUT]: listo });
      const { result } = await montar();
      await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    },
  ],
];

describe('aviso de cierre de sesión', () => {
  it.each(CIERRES)('%s avisa una sola vez con el motivo %s', async (_caso, motivo, provocar) => {
    await provocar();
    await waitFor(() => expect(espiaCierre).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolver) => {
        setTimeout(resolver, 0);
      });
    });
    expect(espiaCierre).toHaveBeenCalledTimes(1);
    expect(espiaCierre).toHaveBeenCalledWith(motivo);
    expect(textoSesion()).toBeUndefined();
  });

  it('si salir no pudo borrar la sesión, sigue dentro y no avisa', async () => {
    const { result } = await entrar(sesionFicticia(), { [LOGOUT]: listo });
    fallarSecureStore('deleteItemAsync', 2);
    await expect(salir(result)).resolves.toBe(false);
    expect(result.current.estado).toBe('autenticado');
    expect(espiaCierre).not.toHaveBeenCalled();
  });
});

describe('verificación del pago al salir', () => {
  it('tras salir no queda nada de la verificación: los oyentes reciben conocido null', async () => {
    const { result } = await entrar(sesionFicticia(), {
      [LOGOUT]: listo,
      [rutaEstadoPagoPedido()]: () => respuesta(estadoPagoPedidoCrudo('pendiente')),
    });
    const eventos: EventoVerificacion[] = [];
    const dejar = suscribir((evento) => eventos.push(evento));
    await act(async () => {
      await verificarPago(ID_PEDIDO, { motivo: 'apertura' });
    });
    expect(estadoPagoConocido(ID_PEDIDO)).toMatchObject({ estado: 'pendiente' });

    await salir(result);

    expect(eventos.at(-1)).toEqual({ pedidoId: ID_PEDIDO, conocido: null, transicion: null });
    expect(estadoPagoConocido(ID_PEDIDO)).toBeNull();
    dejar();
  });
});
