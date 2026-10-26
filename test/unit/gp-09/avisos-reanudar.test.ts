/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import * as repositorio from '@/features/notificaciones/models/avisoModel';
import { limpiarAvisos } from '@/features/notificaciones/viewmodels/avisosEstado';
import { reanudarAvisos, useAvisosEnVivo } from '@/features/notificaciones/viewmodels/useAvisosEnVivo';
import { useReanudarAvisos } from '@/features/notificaciones/viewmodels/useReanudarAvisos';

import { sembrarSesion } from '../../helpers/sesionGuardada';
import {
  abrirFlujo,
  flujosVivos,
  llamadasFlujo,
  reiniciarFlujos,
  vaciar,
  type FlujoSimulado,
} from '../../helpers/streamSimulado';

/**
 * GP-09, Bloque C: reanudar los avisos en vivo tras el 'cierre' del servidor cuando la clienta
 * vuelve a usar la app (useAvisosEnVivo, reanudarAvisos y useReanudarAvisos). Usa la conexión real
 * con el expo/fetch simulado y una sesión ficticia; AppState se espía para disparar los cambios a mano
 * y usePathname de expo-router se simula para cambiar de pantalla. avisoModel se simula: la lista
 * llega vacía. Nunca debe haber dos flujos vivos.
 */

let mockRuta = '/inicio';
jest.mock('expo-router', () => ({ usePathname: () => mockRuta }));
jest.mock('@/features/notificaciones/models/avisoModel', () => ({
  listarAvisos: jest.fn(() => Promise.resolve([])),
  mensajeErrorAvisos: jest.fn(() => 'Mensaje amable ficticio'),
  normalizarAviso: (crudo: unknown) => {
    const fila = crudo as { id?: unknown } | null;
    return fila && typeof fila.id === 'string'
      ? { id: fila.id, tipo: 'general', titulo: 'Aviso', mensaje: '', fecha: null, leida: false, destino: null }
      : null;
  },
}));

const repo = repositorio as jest.Mocked<typeof repositorio>;
const USUARIO = { id: 'clienta-ficticia-reanudar', nombre: 'Clienta Ficticia', email: 'clienta@ejemplo.test', rol: 'cliente' };
const MINUTO = 60_000;

type OyenteAppState = (estado: AppStateStatus) => void;

let espiaAppState: jest.SpyInstance;
let estadoOriginal: AppStateStatus;
const desmontar: (() => Promise<void> | void)[] = [];

function oyenteAppState(): OyenteAppState {
  const llamada = espiaAppState.mock.calls.filter(([evento]) => evento === 'change').at(-1);
  if (!llamada) {
    throw new Error('El hook no registró un oyente de AppState.');
  }
  return llamada[1] as OyenteAppState;
}

async function enAct(accion: () => void): Promise<void> {
  await act(async () => {
    accion();
    await vaciar();
  });
}

/** Monta los avisos en vivo (como la raíz) y el hook de reanudar; devuelve cómo cambiar de pantalla. */
async function montar(conSesion = true, enVivo = true) {
  const vivo = await renderHook(({ sesion, avisos }: { sesion: boolean; avisos: boolean }) => useAvisosEnVivo(sesion, avisos), {
    initialProps: { sesion: conSesion, avisos: enVivo },
  });
  const pantalla = await renderHook(() => useReanudarAvisos());
  desmontar.push(pantalla.unmount, vivo.unmount);
  await act(() => vaciar());
  const irA = async (ruta: string) => {
    mockRuta = ruta;
    await pantalla.rerender({});
    await act(() => vaciar());
  };
  return { vivo, alTocar: pantalla.result.current, irA };
}

/** Con la conexión abierta, el servidor manda 'cierre': queda en pausa. */
async function cerrarPorInactividad(flujo: FlujoSimulado): Promise<void> {
  await enAct(() => flujo.enviarCierre());
  expect(flujosVivos()).toBe(0);
}

async function avanzar(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
    await vaciar();
  });
}

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  mockRuta = '/inicio';
  reiniciarFlujos();
  limpiarAvisos();
  repo.listarAvisos.mockClear();
  await sembrarSesion(USUARIO);
  estadoOriginal = AppState.currentState;
  AppState.currentState = 'active';
  espiaAppState = jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
});

afterEach(async () => {
  await act(async () => {
    for (const quitar of desmontar.splice(0)) {
      await quitar();
    }
  });
  await vaciar();
  espiaAppState.mockRestore();
  AppState.currentState = estadoOriginal;
  jest.useRealTimers();
});

describe('antes de montar los avisos en vivo', () => {
  // Va primero: la conexión es un Singleton del módulo y todavía no existe.
  it('reanudar no hace nada', async () => {
    await enAct(() => reanudarAvisos());
    expect(llamadasFlujo()).toHaveLength(0);
  });
});

describe('reanudar tras el cierre del servidor', () => {
  it('en pausa no reconecta sola ni consulta la lista aunque pasen muchos minutos', async () => {
    const abierto = abrirFlujo();
    await montar();
    await cerrarPorInactividad(await abierto);

    await avanzar(40 * MINUTO);

    expect(llamadasFlujo()).toHaveLength(1);
    expect(repo.listarAvisos).toHaveBeenCalledTimes(1);
  });

  it('un toque la reanuda una sola vez aunque lleguen muchos seguidos, y pone al día la lista', async () => {
    const abierto = abrirFlujo();
    const { alTocar } = await montar();
    await cerrarPorInactividad(await abierto);
    abrirFlujo();

    await enAct(() => {
      for (let i = 0; i < 20; i++) {
        alTocar();
      }
    });

    expect(alTocar).toBe(reanudarAvisos);
    expect(llamadasFlujo()).toHaveLength(2);
    expect(flujosVivos()).toBe(1);
    expect(repo.listarAvisos).toHaveBeenCalledTimes(2);
  });

  it('un cambio de pantalla la reanuda', async () => {
    const abierto = abrirFlujo();
    const { irA } = await montar();
    await cerrarPorInactividad(await abierto);
    abrirFlujo();

    await irA('/mis-citas');

    expect(llamadasFlujo()).toHaveLength(2);
    expect(flujosVivos()).toBe(1);
  });

  it('el regreso a primer plano la reanuda', async () => {
    const abierto = abrirFlujo();
    await montar();
    await cerrarPorInactividad(await abierto);

    await enAct(() => oyenteAppState()('background'));
    abrirFlujo();
    await enAct(() => oyenteAppState()('active'));

    expect(llamadasFlujo()).toHaveLength(2);
    expect(flujosVivos()).toBe(1);
  });

  it('toque, cambio de pantalla y primer plano juntos abren un solo flujo', async () => {
    const abierto = abrirFlujo();
    const { alTocar, irA } = await montar();
    await cerrarPorInactividad(await abierto);
    abrirFlujo();

    mockRuta = '/perfil';
    await enAct(() => {
      alTocar();
      oyenteAppState()('active');
      alTocar();
    });
    await irA('/perfil');
    await enAct(() => alTocar());

    expect(llamadasFlujo()).toHaveLength(2);
    expect(flujosVivos()).toBe(1);
  });

  it('con la app en segundo plano un toque o una pantalla no abren nada; al volver abre una sola', async () => {
    const abierto = abrirFlujo();
    const { alTocar, irA } = await montar();
    await cerrarPorInactividad(await abierto);

    await enAct(() => oyenteAppState()('background'));
    await enAct(() => alTocar());
    await irA('/carrito');
    expect(llamadasFlujo()).toHaveLength(1);

    abrirFlujo();
    await enAct(() => {
      oyenteAppState()('active');
      alTocar();
      alTocar();
    });
    expect(llamadasFlujo()).toHaveLength(2);
    expect(flujosVivos()).toBe(1);
  });

  it('con una conexión sana un toque o una pantalla no la reinician', async () => {
    const abierto = abrirFlujo();
    const { alTocar, irA } = await montar();
    await abierto;

    await enAct(() => alTocar());
    await irA('/notificaciones');

    expect(llamadasFlujo()).toHaveLength(1);
    expect(flujosVivos()).toBe(1);
    expect(repo.listarAvisos).toHaveBeenCalledTimes(1);
  });

  it('sin sesión un toque no abre nada', async () => {
    const { alTocar, irA } = await montar(false);

    await enAct(() => alTocar());
    await irA('/mis-citas');

    expect(llamadasFlujo()).toHaveLength(0);
    expect(repo.listarAvisos).not.toHaveBeenCalled();
  });

  it('al perder la sesión estando en pausa, un toque ya no abre nada', async () => {
    const abierto = abrirFlujo();
    const { vivo, alTocar } = await montar();
    await cerrarPorInactividad(await abierto);

    await vivo.rerender({ sesion: false, avisos: true });
    await act(() => vaciar());
    await enAct(() => alTocar());

    expect(llamadasFlujo()).toHaveLength(1);
  });

  it('con "Avisos en la app" apagado un toque no abre nada, ni tras apagarlos estando en pausa', async () => {
    const abierto = abrirFlujo();
    const { vivo, alTocar } = await montar();
    await cerrarPorInactividad(await abierto);

    await vivo.rerender({ sesion: true, avisos: false });
    await act(() => vaciar());
    await enAct(() => alTocar());
    expect(llamadasFlujo()).toHaveLength(1);

    const otra = await montar(true, false);
    await enAct(() => otra.alTocar());
    expect(llamadasFlujo()).toHaveLength(1);
  });
});
