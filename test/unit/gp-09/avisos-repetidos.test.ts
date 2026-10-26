/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';

import type { Aviso } from '@/features/notificaciones/models/avisoModel';
import * as repositorio from '@/features/notificaciones/models/avisoModel';
import { crearConexionAvisos, INTERVALO_RESPALDO_MS, type ConexionAvisos } from '@/features/notificaciones/models/conexionAvisos';
import {
  agregarAviso,
  alLlegarAviso,
  borrar,
  cargarAvisos,
  leerEstadoAvisos,
  limpiarAvisos,
  marcarLeido,
} from '@/features/notificaciones/viewmodels/avisosEstado';
import { useAvisoEnPantalla } from '@/features/notificaciones/viewmodels/useAvisoEnPantalla';
import { crearErrorApi } from '@/shared/api/apiClient';

import { abrirFlujo, fallarRed, reiniciarFlujos, vaciar, type FlujoSimulado } from '../../helpers/streamSimulado';

/**
 * GP-09, Bloque C: un aviso recuperado puede repetirse (por el flujo, por la consulta de respaldo o
 * por ambos, también con una carga en vuelo). En la bandeja (avisosEstado) nunca queda dos veces y el
 * aviso en pantalla (alLlegarAviso y useAvisoEnPantalla) no vuelve a salir. La conexión es la real
 * con el expo/fetch simulado; el repositorio (avisoModel) se simula y nada sale a la red.
 */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/inicio',
}));
jest.mock('@/features/notificaciones/models/avisoModel', () => ({
  listarAvisos: jest.fn(),
  marcarAvisoLeido: jest.fn(),
  marcarTodosLeidos: jest.fn(),
  borrarAviso: jest.fn(),
  mensajeErrorAvisos: jest.fn(() => 'Mensaje amable ficticio'),
  esAvisoInexistente: jest.requireActual('@/features/notificaciones/models/avisoModel').esAvisoInexistente,
  normalizarAviso: (crudo: unknown) => {
    const fila = crudo as { id?: unknown; titulo?: unknown } | null;
    return fila && typeof fila.id === 'string'
      ? { id: fila.id, tipo: 'general', titulo: String(fila.titulo ?? 'Aviso'), mensaje: '', fecha: null, leida: false, destino: null }
      : null;
  },
}));

const repo = repositorio as jest.Mocked<typeof repositorio>;

function aviso(id: string, titulo = `Aviso ${id}`): Aviso {
  return { id, tipo: 'general', titulo, mensaje: '', fecha: null, leida: false, destino: null };
}

const X = aviso('aviso-recuperado');
const Y = aviso('aviso-otro');

interface Diferida<T> {
  promesa: Promise<T>;
  resolver: (valor: T) => void;
}

function diferida<T>(): Diferida<T> {
  let resolver: (valor: T) => void = () => undefined;
  const promesa = new Promise<T>((si) => {
    resolver = si;
  });
  return { promesa, resolver };
}

const ids = () => leerEstadoAvisos().avisos.map((actual) => actual.id);

let conexion: ConexionAvisos | null = null;
let nuevos: jest.Mock;
let quitarOyente: () => void;

/** La conexión real con el estado compartido, como la arma useAvisosEnVivo. */
async function conectar(): Promise<FlujoSimulado> {
  const abierto = abrirFlujo();
  conexion = crearConexionAvisos({
    alAviso: agregarAviso,
    consultar: cargarAvisos,
    obtenerToken: () => Promise.resolve('token-ficticio-repetidos'),
  });
  conexion.iniciar();
  return abierto;
}

async function llegaPorFlujo(flujo: FlujoSimulado, fila: Aviso): Promise<void> {
  flujo.enviarAviso({ id: fila.id, titulo: fila.titulo });
  await vaciar();
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  reiniciarFlujos();
  limpiarAvisos();
  repo.listarAvisos.mockReset().mockResolvedValue([]);
  repo.borrarAviso.mockReset().mockResolvedValue(undefined);
  repo.marcarAvisoLeido.mockReset().mockResolvedValue(undefined);
  mockPush.mockClear();
  nuevos = jest.fn();
  quitarOyente = alLlegarAviso(nuevos);
});

afterEach(async () => {
  quitarOyente();
  conexion?.detener();
  conexion = null;
  await vaciar();
  jest.useRealTimers();
});

describe('repetido por el flujo', () => {
  it('el mismo aviso dos veces entra una sola vez y sale en pantalla una sola vez', async () => {
    const flujo = await conectar();

    await llegaPorFlujo(flujo, X);
    await llegaPorFlujo(flujo, { ...X, titulo: 'Recuperado otra vez' });

    expect(ids()).toEqual([X.id]);
    expect(leerEstadoAvisos().avisos[0].titulo).toBe(X.titulo);
    expect(nuevos).toHaveBeenCalledTimes(1);
  });

  it('repetido tras reconectar (el servidor lo recupera en el flujo nuevo) tampoco se duplica', async () => {
    // Al reabrir, la consulta para ponerse al día ya lo trae.
    repo.listarAvisos.mockResolvedValue([X]);
    const primero = await conectar();
    await llegaPorFlujo(primero, X);
    const segundo = abrirFlujo();
    primero.cortar();
    await vaciar();
    await jest.advanceTimersByTimeAsync(1000);
    await llegaPorFlujo(await segundo, X);

    expect(repo.listarAvisos).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual([X.id]);
    expect(nuevos).toHaveBeenCalledTimes(1);
  });
});

describe('repetido por la consulta de respaldo', () => {
  it('ya traído por la lista, el flujo no lo vuelve a agregar ni lo muestra en pantalla', async () => {
    repo.listarAvisos.mockResolvedValueOnce([X, Y]);
    await cargarAvisos();
    const flujo = await conectar();

    await llegaPorFlujo(flujo, X);

    expect(ids()).toEqual([X.id, Y.id]);
    expect(nuevos).not.toHaveBeenCalled();
  });

  it('llegado por el flujo, la lista que lo trae otra vez no lo duplica', async () => {
    const flujo = await conectar();
    await llegaPorFlujo(flujo, X);

    repo.listarAvisos.mockResolvedValueOnce([X, Y]);
    await cargarAvisos();

    expect(ids()).toEqual([X.id, Y.id]);
    expect(nuevos).toHaveBeenCalledTimes(1);
  });

  it('una lista que trae el mismo aviso dos veces lo deja una sola vez', async () => {
    repo.listarAvisos.mockResolvedValueOnce([X, Y, { ...X, titulo: 'Copia' }]);

    await cargarAvisos();

    expect(ids()).toEqual([X.id, Y.id]);
    expect(leerEstadoAvisos().avisos[0].titulo).toBe(X.titulo);
    expect(leerEstadoAvisos().noLeidos).toBe(2);
  });

  it('con la consulta de respaldo de la conexión (sin flujo) y luego el flujo, queda una sola vez', async () => {
    repo.listarAvisos.mockResolvedValue([X]);
    for (let i = 0; i < 6; i++) {
      fallarRed();
    }
    const abierto = abrirFlujo();
    conexion = crearConexionAvisos({
      alAviso: agregarAviso,
      consultar: cargarAvisos,
      obtenerToken: () => Promise.resolve('token-ficticio-repetidos'),
    });
    conexion.iniciar();
    await vaciar();
    // Fallos a los 0, 1, 3, 7, 15 y 31 s; desde el tercero (3 s) consulta cada 30 s: a los 33 s.
    await jest.advanceTimersByTimeAsync(3000);
    await vaciar();
    await jest.advanceTimersByTimeAsync(INTERVALO_RESPALDO_MS);
    await vaciar();
    expect(repo.listarAvisos).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual([X.id]);

    // El reintento de los 61 s abre, consulta otra vez para ponerse al día y el flujo recupera X.
    await jest.advanceTimersByTimeAsync(INTERVALO_RESPALDO_MS);
    await vaciar();
    await llegaPorFlujo(await abierto, X);

    expect(repo.listarAvisos).toHaveBeenCalledTimes(2);
    expect(ids()).toEqual([X.id]);
    expect(nuevos).not.toHaveBeenCalled();
  });
});

describe('repetido con una carga en vuelo', () => {
  it.each([
    ['la respuesta lo trae', [X, Y]],
    ['la respuesta no lo trae', [Y]],
    ['la respuesta lo trae dos veces', [X, Y, X]],
  ])('llega dos veces por el flujo mientras se pide la lista (%s): queda una vez', async (_caso, lista) => {
    const flujo = await conectar();
    const respuesta = diferida<Aviso[]>();
    repo.listarAvisos.mockReturnValueOnce(respuesta.promesa);

    const carga = cargarAvisos();
    await llegaPorFlujo(flujo, X);
    await llegaPorFlujo(flujo, X);
    respuesta.resolver(lista);
    await carga;

    expect(ids()).toEqual([X.id, Y.id]);
    expect(nuevos).toHaveBeenCalledTimes(1);
  });

  it('llega por el flujo después de la respuesta de la carga que ya lo traía: no se duplica', async () => {
    const flujo = await conectar();
    const respuesta = diferida<Aviso[]>();
    repo.listarAvisos.mockReturnValueOnce(respuesta.promesa);

    const carga = cargarAvisos();
    respuesta.resolver([X]);
    await carga;
    await llegaPorFlujo(flujo, X);

    expect(ids()).toEqual([X.id]);
    expect(nuevos).not.toHaveBeenCalled();
  });
});

describe('repetido de un aviso que ya no está en la bandeja', () => {
  it('borrado por la clienta, el aviso recuperado no vuelve', async () => {
    const flujo = await conectar();
    await llegaPorFlujo(flujo, X);
    await borrar(X.id);
    expect(ids()).toEqual([]);

    await llegaPorFlujo(flujo, X);

    expect(ids()).toEqual([]);
    expect(nuevos).toHaveBeenCalledTimes(1);
  });

  it('quitado porque el servidor dijo que ya no existe (404), el recuperado no vuelve', async () => {
    agregarAviso(X);
    repo.marcarAvisoLeido.mockRejectedValueOnce(crearErrorApi({ tipo: 'respuesta', status: 404, cuerpo: null }));
    await expect(marcarLeido(X.id)).rejects.toBeDefined();
    expect(ids()).toEqual([]);

    agregarAviso(X);

    expect(ids()).toEqual([]);
    expect(nuevos).toHaveBeenCalledTimes(1);
  });

  it('al cerrar sesión se olvida: en la sesión siguiente el mismo id puede entrar', async () => {
    agregarAviso(X);
    limpiarAvisos();

    agregarAviso(X);

    expect(ids()).toEqual([X.id]);
    expect(nuevos).toHaveBeenCalledTimes(2);
  });
});

describe('aviso en pantalla', () => {
  it('un aviso recuperado que se repite no vuelve a salir en pantalla', async () => {
    const flujo = await conectar();
    const { result } = await renderHook(() => useAvisoEnPantalla());

    await act(async () => {
      await llegaPorFlujo(flujo, X);
    });
    expect(result.current.aviso?.id).toBe(X.id);

    // Se toca: se marca leído, se quita y abre la bandeja (no tiene destino).
    await act(async () => {
      result.current.abrir();
      await vaciar();
    });
    expect(result.current.aviso).toBeNull();
    expect(mockPush).toHaveBeenCalledTimes(1);

    await act(async () => {
      await llegaPorFlujo(flujo, X);
    });
    expect(result.current.aviso).toBeNull();
    expect(ids()).toEqual([X.id]);
  });

  it('repetido mientras se muestra, no reinicia su tiempo ni cambia el aviso', async () => {
    const flujo = await conectar();
    const { result } = await renderHook(() => useAvisoEnPantalla());
    await act(async () => {
      await llegaPorFlujo(flujo, X);
      await llegaPorFlujo(flujo, Y);
      await llegaPorFlujo(flujo, X);
    });

    expect(result.current.aviso?.id).toBe(Y.id);
    expect(nuevos.mock.calls.map(([nuevo]) => nuevo.id)).toEqual([X.id, Y.id]);
  });
});
