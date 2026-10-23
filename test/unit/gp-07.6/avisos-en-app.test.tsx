/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AppState, type AppStateStatus } from 'react-native';

import * as repositorio from '@/features/notificaciones/models/avisoModel';
import { guardarPreferenciaAvisos, leerPreferenciaAvisos } from '@/features/notificaciones/models/preferenciaAvisos';
import { agregarAviso, leerEstadoAvisos, limpiarAvisos } from '@/features/notificaciones/viewmodels/avisosEstado';
import {
  avisosApagados,
  cambiarAvisosEnApp,
  prepararPreferenciaAvisos,
  reiniciarPreferenciaAvisos,
  useAvisosEnApp,
  useInterruptorAvisos,
} from '@/features/notificaciones/viewmodels/preferenciaAvisosEstado';
import { useAvisoEnPantalla } from '@/features/notificaciones/viewmodels/useAvisoEnPantalla';
import { useAvisosEnVivo } from '@/features/notificaciones/viewmodels/useAvisosEnVivo';
import { useNotificaciones } from '@/features/notificaciones/viewmodels/useNotificaciones';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { clavePreferenciaAvisos, leerSecureStore } from '../../helpers/secureStore';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { abrirFlujo, flujosVivos, llamadasFlujo, reiniciarFlujos, vaciar } from '../../helpers/streamSimulado';
import { authSimulada, reiniciarSimulaciones } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => ({
  ...require('../../helpers/viewmodelsAuth').expoRouterSimulado(),
  usePathname: () => '/inicio',
}));
jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
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

/**
 * GP-07.6 Tarea 4, interruptor "Avisos en la app" (bloque F20 de Perfil), en caja blanca: la
 * preferencia por clienta en el SecureStore simulado (models/preferenciaAvisos), su estado en memoria
 * (viewmodels/preferenciaAvisosEstado) y lo que cambia en la conexión en vivo (useAvisosEnVivo con el
 * expo/fetch simulado), el aviso en pantalla y la bandeja. avisoModel se simula (lista vacía).
 * Datos ficticios; nada sale a la red.
 */

const repo = repositorio as jest.Mocked<typeof repositorio>;
const CLIENTA = { id: 'clienta-ficticia-avisos', nombre: 'Clienta Ficticia', email: 'clienta@ejemplo.test', rol: 'cliente' };
const CLAVE = clavePreferenciaAvisos(CLIENTA.id);
const avisoFicticio = (id: string) => ({ id, tipo: 'general', titulo: 'Aviso', mensaje: '', fecha: null, leida: false, destino: null });

let espiaAppState: jest.SpyInstance;
let estadoOriginal: AppStateStatus;

beforeEach(async () => {
  reiniciarSimulaciones();
  reiniciarPreferenciaAvisos();
  reiniciarFlujos();
  limpiarAvisos();
  repo.listarAvisos.mockClear();
  await sembrarSesion(CLIENTA);
  estadoOriginal = AppState.currentState;
  AppState.currentState = 'active';
  espiaAppState = jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
});

afterEach(async () => {
  await vaciar();
  espiaAppState.mockRestore();
  AppState.currentState = estadoOriginal;
  jest.useRealTimers();
});

/** Claves de preferencias de avisos guardadas en el SecureStore simulado (la sesión sembrada no cuenta). */
const clavesDeAvisos = (): string[] =>
  Object.keys(leerSecureStore()).filter((clave) => clave.startsWith('preferencia_avisos_'));

/** La preferencia de CLIENTA ya leída (encendidos salvo que el teléfono diga otra cosa). */
async function prepararClienta(): Promise<void> {
  await act(async () => {
    prepararPreferenciaAvisos(CLIENTA.id);
    await vaciar();
  });
}

describe('preferenciaAvisos (modelo, SecureStore)', () => {
  it('sin nada guardado quedan encendidos', async () => {
    await expect(leerPreferenciaAvisos(CLIENTA.id)).resolves.toBe(true);
  });

  it('se guarda por clienta con el resumen de su id en la clave y otra clienta no la hereda', async () => {
    await guardarPreferenciaAvisos(CLIENTA.id, false);
    expect(leerSecureStore()[CLAVE]).toBe('0');
    await expect(leerPreferenciaAvisos(CLIENTA.id)).resolves.toBe(false);
    await expect(leerPreferenciaAvisos('otra-clienta-ficticia')).resolves.toBe(true);

    await guardarPreferenciaAvisos(CLIENTA.id, true);
    expect(leerSecureStore()[CLAVE]).toBe('1');
  });

  it.each([
    ['un id común', CLIENTA.id],
    ['un id con caracteres que SecureStore no acepta', 'clienta@ficticia #7'],
  ])('%s: la clave no lleva el id y solo usa caracteres que SecureStore acepta', async (_caso, id) => {
    await guardarPreferenciaAvisos(id, false);
    const claves = clavesDeAvisos();
    expect(claves).toEqual([clavePreferenciaAvisos(id)]);
    expect(claves[0]).toMatch(/^preferencia_avisos_[0-9a-f]{32}$/);
    expect(claves[0]).not.toContain(id);
    await expect(leerPreferenciaAvisos(id)).resolves.toBe(false);
  });

  it('si el resumen no es válido no guarda nada (las clientas no comparten clave) y quedan encendidos', async () => {
    const digest = jest.requireMock<{ digestStringAsync: jest.Mock }>('expo-crypto').digestStringAsync;
    digest.mockResolvedValueOnce('').mockResolvedValueOnce('');
    await guardarPreferenciaAvisos(CLIENTA.id, false);
    expect(clavesDeAvisos()).toEqual([]);
    await expect(leerPreferenciaAvisos(CLIENTA.id)).resolves.toBe(true);
  });

  it('si SecureStore falla: al leer quedan encendidos y al guardar no rechaza', async () => {
    jest.spyOn(SecureStore, 'getItemAsync').mockRejectedValueOnce(new Error('Keystore ficticio'));
    jest.spyOn(SecureStore, 'setItemAsync').mockRejectedValueOnce(new Error('Keystore ficticio'));
    await expect(leerPreferenciaAvisos(CLIENTA.id)).resolves.toBe(true);
    await expect(guardarPreferenciaAvisos(CLIENTA.id, false)).resolves.toBeUndefined();
  });
});

describe('preferenciaAvisosEstado', () => {
  it('la fila de Perfil espera la lectura (deshabilitada) y luego muestra lo guardado con sus textos', async () => {
    await guardarPreferenciaAvisos(CLIENTA.id, false);
    const { result } = await renderHook(() => useInterruptorAvisos());
    expect(result.current.cargando).toBe(true);

    await prepararClienta();
    expect(result.current).toMatchObject({
      cargando: false,
      encendido: false,
      titulo: RESPALDO_TEXTOS['perfil.avisos.titulo'],
      descripcion: RESPALDO_TEXTOS['perfil.avisos.apagados'],
    });
    expect(avisosApagados()).toBe(true);

    await act(async () => {
      result.current.cambiar(true);
      await vaciar();
    });
    expect(result.current).toMatchObject({ encendido: true, descripcion: RESPALDO_TEXTOS['perfil.avisos.encendidos'] });
    expect(leerSecureStore()[CLAVE]).toBe('1');
  });

  it('lo que elige la clienta gana a una lectura que seguía en camino', async () => {
    await guardarPreferenciaAvisos(CLIENTA.id, true);
    await act(async () => {
      prepararPreferenciaAvisos(CLIENTA.id);
      cambiarAvisosEnApp(false);
      await vaciar();
    });
    expect(avisosApagados()).toBe(true);
    expect(leerSecureStore()[CLAVE]).toBe('0');
  });

  it('sin clienta, cambiar no hace nada; al salir ya no cuenta como apagado', async () => {
    cambiarAvisosEnApp(false);
    expect(leerSecureStore()[CLAVE]).toBeUndefined();

    await guardarPreferenciaAvisos(CLIENTA.id, false);
    await prepararClienta();
    expect(avisosApagados()).toBe(true);
    prepararPreferenciaAvisos(null);
    expect(avisosApagados()).toBe(false);
  });

  it('useAvisosEnApp: false mientras se lee o sin sesión; true con la preferencia encendida', async () => {
    let soltar: (valor: string | null) => void = () => undefined;
    jest.spyOn(SecureStore, 'getItemAsync').mockImplementationOnce(
      () =>
        new Promise<string | null>((resolver) => {
          soltar = resolver;
        }),
    );
    const vista = await renderHook(({ id }: { id: string | null }) => useAvisosEnApp(id), {
      initialProps: { id: null as string | null },
    });
    expect(vista.result.current).toBe(false);
    await vista.rerender({ id: CLIENTA.id });
    expect(vista.result.current).toBe(false);
    await act(async () => {
      soltar('1');
      await vaciar();
    });
    expect(vista.result.current).toBe(true);
    await act(async () => {
      cambiarAvisosEnApp(false);
    });
    expect(vista.result.current).toBe(false);
  });
});

describe('useAvisosEnVivo con "Avisos en la app"', () => {
  async function montar(enVivo: boolean) {
    const vista = await renderHook(({ vivo }: { vivo: boolean }) => useAvisosEnVivo(true, vivo), {
      initialProps: { vivo: enVivo },
    });
    await act(() => vaciar());
    return vista;
  }

  it('apagado no abre el flujo ni la consulta de respaldo ni pide la lista', async () => {
    const vista = await montar(false);
    expect(llamadasFlujo()).toHaveLength(0);
    expect(repo.listarAvisos).not.toHaveBeenCalled();
    expect(espiaAppState).not.toHaveBeenCalled();
    await act(async () => {
      await vista.unmount();
    });
  });

  it('al encender conecta una sola vez y al apagar corta una sola vez, sin vaciar la bandeja', async () => {
    const vista = await montar(false);
    const primero = abrirFlujo();
    await vista.rerender({ vivo: true });
    await act(() => vaciar());
    expect(llamadasFlujo()).toHaveLength(1);
    expect(flujosVivos()).toBe(1);
    expect(repo.listarAvisos).toHaveBeenCalledTimes(1);
    (await primero).enviarAviso({ id: 'aviso-ficticio-vivo' });
    await act(() => vaciar());

    await vista.rerender({ vivo: false });
    await act(() => vaciar());
    expect(flujosVivos()).toBe(0);
    expect(llamadasFlujo()).toHaveLength(1);
    expect(leerEstadoAvisos().avisos.map((aviso) => aviso.id)).toEqual(['aviso-ficticio-vivo']);

    abrirFlujo();
    await vista.rerender({ vivo: true });
    await act(() => vaciar());
    expect(llamadasFlujo()).toHaveLength(2);
    expect(flujosVivos()).toBe(1);
    await act(async () => {
      await vista.unmount();
    });
    expect(flujosVivos()).toBe(0);
  });
});

describe('aviso en pantalla y bandeja con los avisos apagados', () => {
  it('apagados no se muestra el aviso que llega; al apagar se quita el que estaba', async () => {
    authSimulada.estado = 'autenticado';
    authSimulada.usuario = CLIENTA;
    await prepararClienta();
    const { result } = await renderHook(() => useAvisoEnPantalla());

    await act(async () => {
      agregarAviso(avisoFicticio('aviso-ficticio-1'));
    });
    expect(result.current.aviso?.id).toBe('aviso-ficticio-1');

    await act(async () => {
      cambiarAvisosEnApp(false);
    });
    expect(result.current.aviso).toBeNull();

    await act(async () => {
      agregarAviso(avisoFicticio('aviso-ficticio-2'));
    });
    expect(result.current.aviso).toBeNull();
  });

  it('apagados, la bandeja pide la lista cada vez que se abre; encendidos, solo la primera', async () => {
    authSimulada.estado = 'autenticado';
    authSimulada.usuario = CLIENTA;
    await prepararClienta();

    const abrir = async () => {
      const vista = await renderHook(() => useNotificaciones());
      await act(() => vaciar());
      await vista.unmount();
    };
    await abrir();
    await abrir();
    expect(repo.listarAvisos).toHaveBeenCalledTimes(1);

    await act(async () => {
      cambiarAvisosEnApp(false);
    });
    await abrir();
    await abrir();
    expect(repo.listarAvisos).toHaveBeenCalledTimes(3);
  });
});
