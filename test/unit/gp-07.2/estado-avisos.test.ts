/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';

import type { Aviso } from '@/features/notificaciones/models/avisoModel';
import * as repositorio from '@/features/notificaciones/models/avisoModel';
import {
  agregarAviso,
  alLlegarAviso,
  borrar,
  cargarAvisos,
  leerEstadoAvisos,
  limpiarAvisos,
  marcarLeido,
  marcarTodos,
  suscribir,
  useAvisos,
  useNoLeidos,
} from '@/features/notificaciones/viewmodels/avisosEstado';
import { crearErrorApi } from '@/shared/api/apiClient';

/**
 * GP-07.2: estado compartido de avisos (src/features/notificaciones/viewmodels/avisosEstado.ts),
 * patrón Observer con un solo estado de módulo. El repositorio (avisoModel) se simula: ninguna
 * prueba hace peticiones. Cada prueba empieza con limpiarAvisos().
 */

jest.mock('@/features/notificaciones/models/avisoModel', () => ({
  listarAvisos: jest.fn(),
  marcarAvisoLeido: jest.fn(),
  marcarTodosLeidos: jest.fn(),
  borrarAviso: jest.fn(),
  mensajeErrorAvisos: jest.fn(() => 'Mensaje amable ficticio'),
  // Real: decide con el status del ApiError, sin peticiones.
  esAvisoInexistente: jest.requireActual('@/features/notificaciones/models/avisoModel').esAvisoInexistente,
}));

const repo = repositorio as jest.Mocked<typeof repositorio>;
const ERROR_SERVIDOR = new Error('error técnico ficticio');

function aviso(id: string, leida = false): Aviso {
  return { id, tipo: 'general', titulo: `Aviso ${id}`, mensaje: 'Texto ficticio', fecha: null, leida, destino: null };
}

const A = aviso('aviso-a');
const B = aviso('aviso-b');
const C = aviso('aviso-c', true);

interface Diferida<T> {
  promesa: Promise<T>;
  resolver: (valor: T) => void;
  rechazar: (error: unknown) => void;
}

function diferida<T>(): Diferida<T> {
  let resolver: (valor: T) => void = () => undefined;
  let rechazar: (error: unknown) => void = () => undefined;
  const promesa = new Promise<T>((si, no) => {
    resolver = si;
    rechazar = no;
  });
  return { promesa, resolver, rechazar };
}

const ids = () => leerEstadoAvisos().avisos.map((actual) => actual.id);

/** Deja la lista cargada con esos avisos. */
async function cargarCon(lista: Aviso[]): Promise<void> {
  repo.listarAvisos.mockResolvedValueOnce(lista);
  await cargarAvisos();
}

const quitar: (() => void)[] = [];

beforeEach(() => {
  limpiarAvisos();
  repo.listarAvisos.mockReset();
  repo.marcarAvisoLeido.mockReset().mockResolvedValue(undefined);
  repo.marcarTodosLeidos.mockReset().mockResolvedValue(undefined);
  repo.borrarAviso.mockReset().mockResolvedValue(undefined);
  repo.mensajeErrorAvisos.mockClear();
});

afterEach(() => {
  quitar.splice(0).forEach((quitarOyente) => quitarOyente());
});

describe('suscriptores', () => {
  it('empieza vacío y avisa a cada oyente de cada cambio hasta que se quita', async () => {
    expect(leerEstadoAvisos()).toEqual({ avisos: [], noLeidos: 0, estado: 'inicial', error: null });
    const oyente = jest.fn();
    const quitarOyente = suscribir(oyente);

    agregarAviso(A);
    expect(oyente).toHaveBeenCalledTimes(1);
    quitarOyente();
    agregarAviso(B);
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('un oyente que falla no impide avisar a los demás', () => {
    const otro = jest.fn();
    quitar.push(
      suscribir(() => {
        throw new Error('oyente ficticio');
      }),
      suscribir(otro),
    );

    agregarAviso(A);

    expect(otro).toHaveBeenCalledTimes(1);
  });

  it('useAvisos y useNoLeidos se vuelven a pintar con cada cambio', async () => {
    const { result } = await renderHook(() => ({ estado: useAvisos(), noLeidos: useNoLeidos() }));
    expect(result.current.noLeidos).toBe(0);

    await act(async () => {
      agregarAviso(A);
      agregarAviso(C);
    });

    expect(result.current.estado.avisos).toEqual([C, A]);
    expect(result.current.noLeidos).toBe(1);
  });
});

describe('cargarAvisos', () => {
  it('pasa por cargando, reemplaza la lista y calcula los no leídos', async () => {
    agregarAviso(aviso('aviso-viejo'));
    const respuesta = diferida<Aviso[]>();
    repo.listarAvisos.mockReturnValueOnce(respuesta.promesa);

    const carga = cargarAvisos();
    expect(leerEstadoAvisos().estado).toBe('cargando');
    respuesta.resolver([A, B, C]);
    await carga;

    expect(leerEstadoAvisos()).toEqual({ avisos: [A, B, C], noLeidos: 2, estado: 'listo', error: null });
  });

  it('dos llamadas a la vez comparten una sola petición', async () => {
    repo.listarAvisos.mockResolvedValueOnce([A]);

    await Promise.all([cargarAvisos(), cargarAvisos()]);

    expect(repo.listarAvisos).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['la respuesta no lo trae', [B, C]],
    ['la respuesta ya lo trae', [A, B, C]],
  ])('un aviso que llega en vivo con la carga en vuelo se conserva (%s), sin duplicados', async (_caso, lista) => {
    const respuesta = diferida<Aviso[]>();
    repo.listarAvisos.mockReturnValueOnce(respuesta.promesa);

    const carga = cargarAvisos();
    agregarAviso(A);
    respuesta.resolver(lista);
    await carga;

    expect(ids()).toEqual(['aviso-a', 'aviso-b', 'aviso-c']);
    expect(leerEstadoAvisos().noLeidos).toBe(2);
  });

  it('si falla, no rechaza: guarda el mensaje amable y conserva la lista', async () => {
    await cargarCon([A]);
    repo.listarAvisos.mockRejectedValueOnce(ERROR_SERVIDOR);

    await expect(cargarAvisos()).resolves.toBeUndefined();

    expect(repo.mensajeErrorAvisos).toHaveBeenCalledWith(ERROR_SERVIDOR, 'cargar');
    expect(leerEstadoAvisos()).toEqual({ avisos: [A], noLeidos: 1, estado: 'error', error: 'Mensaje amable ficticio' });
  });
});

describe('agregarAviso', () => {
  it('entra al inicio sin pedir la lista, avisa del aviso nuevo y no repite ids', async () => {
    await cargarCon([B]);
    const nuevo = jest.fn();
    const quitarNuevo = alLlegarAviso(nuevo);

    agregarAviso(A);
    agregarAviso({ ...A, titulo: 'Repetido' });

    expect(ids()).toEqual(['aviso-a', 'aviso-b']);
    expect(leerEstadoAvisos().noLeidos).toBe(2);
    expect(nuevo.mock.calls).toEqual([[A]]);
    expect(repo.listarAvisos).toHaveBeenCalledTimes(1);

    quitarNuevo();
    agregarAviso(aviso('aviso-d'));
    expect(nuevo).toHaveBeenCalledTimes(1);
  });
});

describe('acciones optimistas', () => {
  it('marcarLeido baja el contador al instante y llama al repositorio', async () => {
    await cargarCon([A, B]);
    const servidor = diferida<void>();
    repo.marcarAvisoLeido.mockReturnValueOnce(servidor.promesa);

    const accion = marcarLeido('aviso-a');
    expect(leerEstadoAvisos().noLeidos).toBe(1);
    servidor.resolver();
    await accion;

    expect(repo.marcarAvisoLeido).toHaveBeenCalledWith('aviso-a');
    expect(leerEstadoAvisos().avisos[0].leida).toBe(true);
  });

  it('marcarLeido de un aviso ya leído o que no está no llama al servidor', async () => {
    await cargarCon([C]);

    await marcarLeido('aviso-c');
    await marcarLeido('aviso-inexistente');

    expect(repo.marcarAvisoLeido).not.toHaveBeenCalled();
  });

  it('marcarLeido revierte y relanza si el servidor falla', async () => {
    await cargarCon([A, B]);
    repo.marcarAvisoLeido.mockRejectedValueOnce(ERROR_SERVIDOR);

    await expect(marcarLeido('aviso-a')).rejects.toBe(ERROR_SERVIDOR);

    expect(leerEstadoAvisos().noLeidos).toBe(2);
  });

  it('marcarLeido quita el aviso si el servidor responde 404 (ya no existe) y relanza', async () => {
    await cargarCon([A, B]);
    const noExiste = crearErrorApi({ tipo: 'respuesta', status: 404, cuerpo: { message: 'Not Found' } });
    repo.marcarAvisoLeido.mockRejectedValueOnce(noExiste);

    await expect(marcarLeido('aviso-a')).rejects.toBe(noExiste);

    expect(ids()).toEqual(['aviso-b']);
    expect(leerEstadoAvisos().noLeidos).toBe(1);
  });

  it('marcarTodos marca todos y, si falla, regresa solo los que cambió', async () => {
    await cargarCon([A, B, C]);
    repo.marcarTodosLeidos.mockRejectedValueOnce(ERROR_SERVIDOR);

    const accion = marcarTodos();
    expect(leerEstadoAvisos().noLeidos).toBe(0);
    await expect(accion).rejects.toBe(ERROR_SERVIDOR);

    expect(leerEstadoAvisos().avisos.map((actual) => actual.leida)).toEqual([false, false, true]);
    expect(leerEstadoAvisos().noLeidos).toBe(2);
  });

  it('marcarTodos que sale bien deja el contador en cero', async () => {
    await cargarCon([A, B]);

    await marcarTodos();

    expect(repo.marcarTodosLeidos).toHaveBeenCalledTimes(1);
    expect(leerEstadoAvisos().noLeidos).toBe(0);
  });

  it('borrar lo quita al instante y, si falla, lo regresa a su lugar y relanza', async () => {
    await cargarCon([A, B, C]);
    const servidor = diferida<void>();
    repo.borrarAviso.mockReturnValueOnce(servidor.promesa);

    const accion = borrar('aviso-b');
    expect(ids()).toEqual(['aviso-a', 'aviso-c']);
    expect(leerEstadoAvisos().noLeidos).toBe(1);
    servidor.rechazar(ERROR_SERVIDOR);
    await expect(accion).rejects.toBe(ERROR_SERVIDOR);

    expect(ids()).toEqual(['aviso-a', 'aviso-b', 'aviso-c']);
  });

  it('borrar no regresa el aviso si el servidor responde 404 (ya no existe) y relanza', async () => {
    await cargarCon([A, B, C]);
    const noExiste = crearErrorApi({ tipo: 'respuesta', status: 404, cuerpo: { message: 'Not Found' } });
    repo.borrarAviso.mockRejectedValueOnce(noExiste);

    await expect(borrar('aviso-b')).rejects.toBe(noExiste);

    expect(ids()).toEqual(['aviso-a', 'aviso-c']);
    expect(leerEstadoAvisos().noLeidos).toBe(1);
  });

  it('borrar un aviso que no está en memoria solo llama al servidor', async () => {
    await cargarCon([A]);

    await borrar('aviso-inexistente');

    expect(repo.borrarAviso).toHaveBeenCalledWith('aviso-inexistente');
    expect(ids()).toEqual(['aviso-a']);
  });
});

describe('limpiarAvisos (cierre de sesión)', () => {
  it('vacía todo y descarta la lista que venía en camino de la sesión anterior', async () => {
    const vieja = diferida<Aviso[]>();
    const nueva = diferida<Aviso[]>();
    repo.listarAvisos.mockReturnValueOnce(vieja.promesa).mockReturnValueOnce(nueva.promesa);
    const oyente = jest.fn();
    quitar.push(suscribir(oyente));

    const cargaVieja = cargarAvisos();
    limpiarAvisos();
    expect(leerEstadoAvisos().estado).toBe('inicial');
    const cargaNueva = cargarAvisos();
    vieja.resolver([A]);
    await cargaVieja;

    expect(ids()).toEqual([]);
    // La carga nueva sigue en vuelo: otra llamada la comparte.
    expect(cargarAvisos()).toBe(cargaNueva);
    nueva.resolver([B]);
    await cargaNueva;
    expect(ids()).toEqual(['aviso-b']);
    expect(repo.listarAvisos).toHaveBeenCalledTimes(2);
    expect(oyente).toHaveBeenCalled();
  });

  it('un error de la sesión anterior no escribe ni revierte nada', async () => {
    const lista = diferida<Aviso[]>();
    repo.listarAvisos.mockReturnValueOnce(lista.promesa);
    const carga = cargarAvisos();
    limpiarAvisos();
    lista.rechazar(ERROR_SERVIDOR);
    await carga;
    expect(leerEstadoAvisos().estado).toBe('inicial');

    await cargarCon([A, B]);
    const servidor = diferida<void>();
    repo.marcarAvisoLeido.mockReturnValueOnce(servidor.promesa);
    repo.marcarTodosLeidos.mockReturnValueOnce(servidor.promesa);
    repo.borrarAviso.mockReturnValueOnce(servidor.promesa);
    const acciones = [marcarLeido('aviso-a'), marcarTodos(), borrar('aviso-b')];
    limpiarAvisos();
    servidor.rechazar(ERROR_SERVIDOR);

    for (const accion of acciones) {
      await expect(accion).rejects.toBe(ERROR_SERVIDOR);
    }
    expect(leerEstadoAvisos()).toEqual({ avisos: [], noLeidos: 0, estado: 'inicial', error: null });
  });
});
