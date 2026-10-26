/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';

import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { ESPERA_LIMITE_S } from '@/shared/api/mensajesError';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';

/**
 * GP-09, bloque A2: useEsperaLimite, el hook compartido de espera por límite. Recibe los segundos,
 * expone los restantes, si está activa y el texto del catálogo "Intenta de nuevo en N s", que baja
 * cada segundo. Limpia su temporizador al desmontar. Temporizadores falsos.
 */

const PLANTILLA = RESPALDO_TEXTOS['errores.esperaLimite'];
const textoCon = (segundos: number) => PLANTILLA.replace('{segundos}', String(segundos));

let crearIntervalo: jest.SpyInstance;
let limpiarIntervalo: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  crearIntervalo = jest.spyOn(globalThis, 'setInterval');
  limpiarIntervalo = jest.spyOn(globalThis, 'clearInterval');
});

afterEach(() => {
  crearIntervalo.mockRestore();
  limpiarIntervalo.mockRestore();
  jest.clearAllTimers();
  jest.useRealTimers();
});

/** Intervalos del hook que siguen vivos (creados y no limpiados). */
function intervalosVivos(): number {
  const limpiados = new Set(limpiarIntervalo.mock.calls.map(([id]: unknown[]) => id));
  return crearIntervalo.mock.results.filter(({ value }) => !limpiados.has(value)).length;
}

async function avanzar(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe('useEsperaLimite', () => {
  it('el texto del catálogo es "Intenta de nuevo en {segundos} s"', () => {
    expect(PLANTILLA).toBe('Intenta de nuevo en {segundos} s');
  });

  it('sin espera: inactiva, 0 segundos y sin texto', async () => {
    const { result } = await renderHook(() => useEsperaLimite());

    expect(result.current).toMatchObject({ activa: false, restantes: 0, texto: null });
  });

  it('baja cada segundo y al terminar regresa a inactiva sin temporizadores', async () => {
    const { result } = await renderHook(() => useEsperaLimite());

    await act(async () => {
      result.current.iniciar(3);
    });
    expect(result.current).toMatchObject({ activa: true, restantes: 3, texto: textoCon(3) });

    await avanzar(1000);
    expect(result.current).toMatchObject({ restantes: 2, texto: textoCon(2) });
    await avanzar(1000);
    expect(result.current).toMatchObject({ restantes: 1, texto: textoCon(1) });
    await avanzar(1000);

    expect(result.current).toMatchObject({ activa: false, restantes: 0, texto: null });
    expect(intervalosVivos()).toBe(0);
  });

  it('redondea hacia arriba e ignora segundos inválidos', async () => {
    const { result } = await renderHook(() => useEsperaLimite());

    await act(async () => {
      result.current.iniciar(0);
      result.current.iniciar(-4);
      result.current.iniciar(Number.NaN);
    });
    expect(result.current.activa).toBe(false);
    expect(intervalosVivos()).toBe(0);

    await act(async () => {
      result.current.iniciar(1.2);
    });
    expect(result.current.restantes).toBe(2);
  });

  it('una espera más corta no acorta la que corre; una más larga la alarga', async () => {
    const { result } = await renderHook(() => useEsperaLimite());

    await act(async () => {
      result.current.iniciar(10);
    });
    await act(async () => {
      result.current.iniciar(2);
    });
    expect(result.current.restantes).toBe(10);

    await act(async () => {
      result.current.iniciar(30);
    });
    expect(result.current.restantes).toBe(30);
    // Un solo intervalo, aunque se haya iniciado tres veces.
    expect(crearIntervalo).toHaveBeenCalledTimes(1);
    expect(intervalosVivos()).toBe(1);
  });

  it('esperarSiLimite arranca con el retryAfter de un 429', async () => {
    const { result } = await renderHook(() => useEsperaLimite());

    let arranco = false;
    await act(async () => {
      arranco = result.current.esperarSiLimite(new ApiError(429, 'Espera', undefined, undefined, 45));
    });

    expect(arranco).toBe(true);
    expect(result.current).toMatchObject({ activa: true, restantes: 45, texto: textoCon(45) });
  });

  it('un 429 sin retryAfter espera el tiempo por omisión', async () => {
    const { result } = await renderHook(() => useEsperaLimite());

    await act(async () => {
      result.current.esperarSiLimite(new ApiError(429, 'ThrottlerException: Too Many Requests'));
    });

    expect(result.current.restantes).toBe(ESPERA_LIMITE_S);
  });

  it.each<[string, unknown]>([
    ['un 503 (solo se muestra su texto)', new ApiError(503, 'Hay mucha demanda', undefined, undefined, 5)],
    ['un 400', new ApiError(400, 'x')],
    ['sin red', new ErrorDeRed()],
    ['undefined', undefined],
  ])('esperarSiLimite con %s no arranca nada', async (_caso, error) => {
    const { result } = await renderHook(() => useEsperaLimite());

    let arranco = true;
    await act(async () => {
      arranco = result.current.esperarSiLimite(error);
    });

    expect(arranco).toBe(false);
    expect(result.current.activa).toBe(false);
  });

  it('detener quita la espera y su temporizador', async () => {
    const { result } = await renderHook(() => useEsperaLimite());
    await act(async () => {
      result.current.iniciar(20);
    });

    await act(async () => {
      result.current.detener();
    });

    expect(result.current).toMatchObject({ activa: false, restantes: 0, texto: null });
    expect(intervalosVivos()).toBe(0);
  });

  it('al desmontar limpia su temporizador', async () => {
    const { result, unmount } = await renderHook(() => useEsperaLimite());
    await act(async () => {
      result.current.iniciar(20);
    });
    expect(intervalosVivos()).toBe(1);

    await unmount();

    expect(intervalosVivos()).toBe(0);
  });

  it('cuenta contra el reloj: un intervalo atrasado no alarga la espera', async () => {
    const { result } = await renderHook(() => useEsperaLimite());
    await act(async () => {
      result.current.iniciar(5);
    });

    // El reloj salta 4.5 s sin que corra el intervalo (por ejemplo, la app estuvo en pausa).
    jest.setSystemTime(Date.now() + 4500);
    await avanzar(1000);

    expect(result.current.activa).toBe(false);
  });
});
