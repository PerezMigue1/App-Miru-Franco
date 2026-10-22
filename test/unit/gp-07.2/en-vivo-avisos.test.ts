/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import * as repositorio from '@/features/notificaciones/models/avisoModel';
import { leerEstadoAvisos, limpiarAvisos } from '@/features/notificaciones/viewmodels/avisosEstado';
import { useAvisosEnVivo } from '@/features/notificaciones/viewmodels/useAvisosEnVivo';

import { sembrarSesion } from '../../helpers/sesionGuardada';
import { abrirFlujo, flujosVivos, llamadasFlujo, reiniciarFlujos, vaciar } from '../../helpers/streamSimulado';

/**
 * GP-07.2: hook useAvisosEnVivo (src/features/notificaciones/viewmodels/useAvisosEnVivo.ts). Usa la
 * conexión real con el expo/fetch simulado y una sesión ficticia en el SecureStore simulado. AppState
 * se espía para disparar los cambios a mano. avisoModel se simula: la lista llega vacía y el
 * normalizador acepta cualquier objeto con id de texto.
 */

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
const USUARIO = { id: 'clienta-ficticia-vivo', nombre: 'Clienta Ficticia', email: 'clienta@ejemplo.test', rol: 'cliente' };

type OyenteAppState = (estado: AppStateStatus) => void;

let espiaAppState: jest.SpyInstance;
let quitarOyente: jest.Mock;
let estadoOriginal: AppStateStatus;
let desmontar: (() => Promise<void> | void) | null = null;

function oyenteAppState(): OyenteAppState {
  const llamada = espiaAppState.mock.calls.filter(([evento]) => evento === 'change').at(-1);
  if (!llamada) {
    throw new Error('El hook no registró un oyente de AppState.');
  }
  return llamada[1] as OyenteAppState;
}

async function cambiarAppState(estado: AppStateStatus): Promise<void> {
  await act(async () => {
    oyenteAppState()(estado);
    await vaciar();
  });
}

async function montar(conSesion: boolean) {
  const vista = await renderHook(({ sesion }: { sesion: boolean }) => useAvisosEnVivo(sesion), {
    initialProps: { sesion: conSesion },
  });
  desmontar = vista.unmount;
  await act(() => vaciar());
  return vista;
}

beforeEach(async () => {
  reiniciarFlujos();
  limpiarAvisos();
  repo.listarAvisos.mockClear();
  await sembrarSesion(USUARIO);
  estadoOriginal = AppState.currentState;
  AppState.currentState = 'active';
  quitarOyente = jest.fn();
  espiaAppState = jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: quitarOyente }));
});

afterEach(async () => {
  await act(async () => {
    await desmontar?.();
  });
  desmontar = null;
  await vaciar();
  espiaAppState.mockRestore();
  AppState.currentState = estadoOriginal;
});

describe('useAvisosEnVivo', () => {
  it('con sesión y en primer plano abre un flujo, pide la lista una vez y los avisos entran al estado', async () => {
    const abierto = abrirFlujo();
    await montar(true);
    const flujo = await abierto;

    flujo.enviarAviso({ id: 'aviso-ficticio-vivo' });
    await act(() => vaciar());

    expect(llamadasFlujo()).toHaveLength(1);
    expect(repo.listarAvisos).toHaveBeenCalledTimes(1);
    expect(leerEstadoAvisos().avisos.map((aviso) => aviso.id)).toEqual(['aviso-ficticio-vivo']);
  });

  it('en segundo plano o inactiva corta, y al volver reconecta y pide la lista otra vez', async () => {
    abrirFlujo();
    await montar(true);

    await cambiarAppState('background');
    expect(flujosVivos()).toBe(0);
    abrirFlujo();
    await cambiarAppState('active');
    expect(flujosVivos()).toBe(1);

    await cambiarAppState('inactive');
    expect(flujosVivos()).toBe(0);
    abrirFlujo();
    await cambiarAppState('active');

    expect(flujosVivos()).toBe(1);
    expect(llamadasFlujo()).toHaveLength(3);
    expect(repo.listarAvisos).toHaveBeenCalledTimes(3);
  });

  it('un active repetido u otro estado no abren otra conexión, no cortan ni piden otra lista', async () => {
    abrirFlujo();
    await montar(true);

    await cambiarAppState('active');
    await cambiarAppState('unknown');

    expect(llamadasFlujo()).toHaveLength(1);
    expect(flujosVivos()).toBe(1);
    expect(repo.listarAvisos).toHaveBeenCalledTimes(1);
  });

  it('si arranca en segundo plano espera a active para abrir', async () => {
    AppState.currentState = 'background';
    await montar(true);
    expect(llamadasFlujo()).toHaveLength(0);

    abrirFlujo();
    await cambiarAppState('active');

    expect(flujosVivos()).toBe(1);
    expect(repo.listarAvisos).toHaveBeenCalledTimes(1);
  });

  it('al perder la sesión corta, vacía los avisos y deja de escuchar AppState', async () => {
    const abierto = abrirFlujo();
    const vista = await montar(true);
    (await abierto).enviarAviso({ id: 'aviso-ficticio-vivo' });
    await act(() => vaciar());
    expect(leerEstadoAvisos().avisos).toHaveLength(1);

    await vista.rerender({ sesion: false });
    await act(() => vaciar());

    expect(flujosVivos()).toBe(0);
    expect(leerEstadoAvisos().avisos).toEqual([]);
    expect(quitarOyente).toHaveBeenCalledTimes(1);
  });

  it('sin sesión no abre nada ni pide la lista', async () => {
    await montar(false);

    expect(llamadasFlujo()).toHaveLength(0);
    expect(repo.listarAvisos).not.toHaveBeenCalled();
    expect(espiaAppState).not.toHaveBeenCalled();
  });

  it('al desmontar corta y quita el oyente de AppState', async () => {
    abrirFlujo();
    const vista = await montar(true);

    await act(async () => {
      await vista.unmount();
    });
    desmontar = null;
    await vaciar();

    expect(flujosVivos()).toBe(0);
    expect(quitarOyente).toHaveBeenCalledTimes(1);
  });
});
