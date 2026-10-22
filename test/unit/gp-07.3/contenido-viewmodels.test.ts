/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useContenidoSalon, useListaContenido } from '@/features/salon/viewmodels/useListaContenido';

import {
  EQUIPO_ESPERADO,
  GALERIA_ESPERADA,
  PREGUNTAS_ESPERADAS,
  PROMOCIONES_ESPERADAS,
  RUTA_EQUIPO,
  RUTA_GALERIA,
  RUTA_PREGUNTAS,
  RUTA_PROMOCIONES,
  rutasContenido,
} from '../../helpers/contenidoFicticio';
import { espiarConsola } from '../../helpers/consola';
import { llamadasA, servidorConRutas } from '../../helpers/servidorSimulado';

/**
 * GP-07.3: viewmodels del contenido del salón (src/features/salon/viewmodels/useListaContenido.ts).
 * useListaContenido se prueba con una función de carga controlada a mano (cada llamada devuelve una
 * promesa que la prueba resuelve o rechaza); useContenidoSalon, con el fetch simulado y el
 * contenidoSalonModel real. Temporizadores reales.
 */

interface Pendiente {
  resolver: (lista: number[]) => void;
  rechazar: (error: Error) => void;
}

/** Función de carga cuyas llamadas quedan pendientes hasta que la prueba las suelta. */
function cargaControlada(): { cargar: jest.Mock<Promise<number[]>, []>; pendientes: Pendiente[] } {
  const pendientes: Pendiente[] = [];
  const cargar = jest.fn(
    () =>
      new Promise<number[]>((resolver, rechazar) => {
        pendientes.push({ resolver, rechazar });
      }),
  );
  return { cargar, pendientes };
}

const falla = () => new Error('Fallo ficticio');

espiarConsola(() => Promise.resolve(), true);

describe('useListaContenido', () => {
  it.each<[string, number[], string]>([
    ['con datos pasa a listo', [1, 2], 'listo'],
    ['sin datos pasa a vacío', [], 'vacio'],
  ])('empieza cargando y %s', async (_caso, lista, estado) => {
    const { cargar, pendientes } = cargaControlada();
    const { result } = await renderHook(() => useListaContenido(cargar));

    expect(result.current.estado).toBe('cargando');
    expect(result.current.datos).toEqual([]);

    await act(async () => pendientes[0].resolver(lista));

    expect(result.current.estado).toBe(estado);
    expect(result.current.datos).toEqual(lista);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('un fallo da error y reintentar vuelve a cargando y luego a listo', async () => {
    const { cargar, pendientes } = cargaControlada();
    const { result } = await renderHook(() => useListaContenido(cargar));

    await act(async () => pendientes[0].rechazar(falla()));
    expect(result.current.estado).toBe('error');
    expect(result.current.datos).toEqual([]);

    await act(async () => result.current.reintentar());
    expect(result.current.estado).toBe('cargando');

    await act(async () => pendientes[1].resolver([3]));
    expect(result.current.estado).toBe('listo');
    expect(result.current.datos).toEqual([3]);
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  it('recargar con datos no vuelve a cargando y su promesa resuelve al terminar', async () => {
    const { cargar, pendientes } = cargaControlada();
    const { result } = await renderHook(() => useListaContenido(cargar));
    await act(async () => pendientes[0].resolver([1]));

    let recarga: Promise<void> = Promise.resolve();
    await act(async () => {
      recarga = result.current.recargar();
    });
    expect(result.current.estado).toBe('listo');
    expect(result.current.datos).toEqual([1]);

    await act(async () => pendientes[1].resolver([1, 2]));
    await expect(recarga).resolves.toBeUndefined();
    expect(result.current.estado).toBe('listo');
    expect(result.current.datos).toEqual([1, 2]);
  });

  it('si recargar falla con datos en pantalla, se conservan y la promesa no rechaza', async () => {
    const { cargar, pendientes } = cargaControlada();
    const { result } = await renderHook(() => useListaContenido(cargar));
    await act(async () => pendientes[0].resolver([1]));

    let recarga: Promise<void> = Promise.resolve();
    await act(async () => {
      recarga = result.current.recargar();
    });
    await act(async () => pendientes[1].rechazar(falla()));

    await expect(recarga).resolves.toBeUndefined();
    expect(result.current.estado).toBe('listo');
    expect(result.current.datos).toEqual([1]);
  });

  it('recargar sin datos (tras un error) pasa por cargando y, si vuelve a fallar, da error', async () => {
    const { cargar, pendientes } = cargaControlada();
    const { result } = await renderHook(() => useListaContenido(cargar));
    await act(async () => pendientes[0].rechazar(falla()));

    await act(async () => {
      void result.current.recargar();
    });
    expect(result.current.estado).toBe('cargando');

    await act(async () => pendientes[1].rechazar(falla()));
    expect(result.current.estado).toBe('error');
  });

  it.each<[string, (vieja: Pendiente) => void]>([
    ['que resuelve', (vieja) => vieja.resolver([1])],
    ['que falla', (vieja) => vieja.rechazar(falla())],
  ])('ignora la respuesta de una solicitud vieja %s', async (_caso, soltarVieja) => {
    const { cargar, pendientes } = cargaControlada();
    const { result } = await renderHook(() => useListaContenido(cargar));

    await act(async () => result.current.reintentar());
    await act(async () => pendientes[1].resolver([2]));
    await act(async () => soltarVieja(pendientes[0]));

    expect(result.current.estado).toBe('listo');
    expect(result.current.datos).toEqual([2]);
  });

  it('al desmontar no escribe el estado ni vuelve a pedir', async () => {
    const { cargar, pendientes } = cargaControlada();
    const { result, unmount } = await renderHook(() => useListaContenido(cargar));

    await unmount();
    await act(async () => pendientes[0].resolver([1]));

    expect(result.current.estado).toBe('cargando');
    expect(result.current.datos).toEqual([]);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('si cambia la función de carga, vuelve a pedir con la nueva', async () => {
    const primera = cargaControlada();
    const segunda = cargaControlada();
    const { result, rerender } = await renderHook(
      ({ cargar }: { cargar: () => Promise<number[]> }) => useListaContenido(cargar),
      { initialProps: { cargar: primera.cargar } },
    );

    await rerender({ cargar: segunda.cargar });
    await act(async () => segunda.pendientes[0].resolver([9]));
    await act(async () => primera.pendientes[0].resolver([1]));

    expect(result.current.datos).toEqual([9]);
    expect(segunda.cargar).toHaveBeenCalledTimes(1);
  });
});

describe('useContenidoSalon', () => {
  const simularServidor = servidorConRutas({});
  const RUTAS = [RUTA_PROMOCIONES, RUTA_PREGUNTAS, RUTA_EQUIPO, RUTA_GALERIA];

  it('una lista que falla no tumba a las demás y recargarTodo vuelve a pedir las cuatro', async () => {
    simularServidor(rutasContenido({ galeria: 'error' }));
    const { result } = await renderHook(() => useContenidoSalon());

    await waitFor(() => expect(result.current.galeria.estado).toBe('error'));
    await waitFor(() => expect(result.current.equipo.estado).toBe('listo'));
    expect(result.current.promociones).toMatchObject({ estado: 'listo', datos: PROMOCIONES_ESPERADAS });
    expect(result.current.preguntas).toMatchObject({ estado: 'listo', datos: PREGUNTAS_ESPERADAS });
    expect(result.current.equipo.datos).toEqual(EQUIPO_ESPERADO);
    expect(result.current.galeria.datos).toEqual([]);

    const llamadas = simularServidor(rutasContenido());
    let recarga: Promise<void> = Promise.resolve();
    await act(async () => {
      recarga = result.current.recargarTodo();
    });
    // Las listas con datos no pasan por cargando durante la recarga.
    expect(result.current.promociones.estado).toBe('listo');
    await act(async () => {
      await recarga;
    });

    await expect(recarga).resolves.toBeUndefined();
    expect(result.current.galeria).toMatchObject({ estado: 'listo', datos: GALERIA_ESPERADA });
    expect(RUTAS.map((ruta) => llamadasA(llamadas, 'GET', ruta).length)).toEqual([1, 1, 1, 1]);
  });
});
