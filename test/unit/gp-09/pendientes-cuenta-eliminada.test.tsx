/// <reference types="jest" />

import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import { AuthProvider, useAuth } from '@/features/auth/viewmodels/useAuth';
import {
  borrarPreferenciaAvisos,
  guardarPreferenciaAvisos,
  leerPreferenciaAvisos,
} from '@/features/notificaciones/models/preferenciaAvisos';
import {
  avisosApagados,
  prepararPreferenciaAvisos,
  reiniciarPreferenciaAvisos,
} from '@/features/notificaciones/viewmodels/preferenciaAvisosEstado';
import { alCerrarSesion, avisarCierreSesion } from '@/shared/api/eventosSesion';

import { USUARIO } from '../../helpers/datosClienta';
import { clavePreferenciaAvisos, leerSecureStore } from '../../helpers/secureStore';
import { sembrarSesion, sesionGuardada } from '../../helpers/sesionGuardada';
import { respuesta } from '../../helpers/servidorSimulado';
import { reiniciarSimulaciones, servidorVm } from '../../helpers/viewmodelsAuth';

jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());
jest.mock('expo-device', () => ({ modelName: null }));
jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());

/**
 * GP-09, pendientes del prompt 3 (bloque E4): al eliminar la cuenta se borra del SecureStore la
 * preferencia "Avisos en la app" de esa clienta; al desactivarla se conserva (al volver a entrar sigue
 * como la dejó). El camino es un cierre de sesión 'cuentaEliminada' de shared/api/eventosSesion.ts con
 * el id, al que se suscribe notificaciones: shared no importa de ninguna feature. useAuth real con el
 * SecureStore simulado; fetch simulado en http://api.test y datos ficticios.
 */

const ID = String(USUARIO.id);
const OTRA = 'otra-clienta-ficticia';
const AVISO = { mensaje: 'Aviso ficticio de la baja.', folio: null };

beforeEach(() => {
  reiniciarSimulaciones();
  reiniciarPreferenciaAvisos();
});

afterEach(async () => {
  await cleanup();
});

async function montarConSesion() {
  await sembrarSesion({ ...USUARIO, id: ID });
  servidorVm({ 'GET /api/auth/me': () => respuesta({ data: USUARIO }) });
  const vista = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(vista.result.current.estado).toBe('autenticado'));
  return vista;
}

describe('cerrarTrasBajaDeCuenta y la preferencia "Avisos en la app"', () => {
  it('eliminada: borra la preferencia de la clienta (y solo la suya) y avisa cuentaEliminada con su id', async () => {
    await guardarPreferenciaAvisos(ID, false);
    await guardarPreferenciaAvisos(OTRA, false);
    const cierres: unknown[] = [];
    const dejar = alCerrarSesion((motivo, detalle) => cierres.push([motivo, detalle]));
    const { result } = await montarConSesion();

    await act(async () => {
      await result.current.cerrarTrasBajaDeCuenta(AVISO, 'eliminada');
    });

    await waitFor(() => expect(leerSecureStore()[clavePreferenciaAvisos(ID)]).toBeUndefined());
    expect(leerSecureStore()[clavePreferenciaAvisos(OTRA)]).toBe('0');
    expect(cierres).toEqual([['cuentaEliminada', { usuarioId: ID }]]);
    expect(sesionGuardada()).toBeNull();
    expect(result.current.estado).toBe('anonimo');
    dejar();
  });

  it.each<[string, 'desactivada' | undefined]>([
    ['desactivada', 'desactivada'],
    ['sin decir cuál (por omisión, desactivada)', undefined],
  ])('%s: conserva la preferencia y avisa salida', async (_caso, baja) => {
    await guardarPreferenciaAvisos(ID, false);
    const motivos: string[] = [];
    const dejar = alCerrarSesion((motivo) => motivos.push(motivo));
    const { result } = await montarConSesion();

    await act(async () => {
      await result.current.cerrarTrasBajaDeCuenta(AVISO, baja);
    });

    expect(motivos).toEqual(['salida']);
    expect(leerSecureStore()[clavePreferenciaAvisos(ID)]).toBe('0');
    await expect(leerPreferenciaAvisos(ID)).resolves.toBe(false);
    dejar();
  });
});

describe('notificaciones ante el cierre cuentaEliminada', () => {
  it('olvida la preferencia en memoria si era la clienta en sesión', async () => {
    await guardarPreferenciaAvisos(ID, false);
    prepararPreferenciaAvisos(ID);
    await waitFor(() => expect(avisosApagados()).toBe(true));

    avisarCierreSesion('cuentaEliminada', { usuarioId: ID });

    expect(avisosApagados()).toBe(false);
    await waitFor(() => expect(leerSecureStore()[clavePreferenciaAvisos(ID)]).toBeUndefined());
  });

  it('con otra clienta en memoria la conserva en memoria y borra solo la de la cuenta eliminada', async () => {
    await guardarPreferenciaAvisos(ID, false);
    await guardarPreferenciaAvisos(OTRA, false);
    prepararPreferenciaAvisos(OTRA);
    await waitFor(() => expect(avisosApagados()).toBe(true));

    avisarCierreSesion('cuentaEliminada', { usuarioId: ID });

    expect(avisosApagados()).toBe(true);
    await waitFor(() => expect(leerSecureStore()[clavePreferenciaAvisos(ID)]).toBeUndefined());
    expect(leerSecureStore()[clavePreferenciaAvisos(OTRA)]).toBe('0');
  });

  it.each<[string, () => void]>([
    ['salida', () => avisarCierreSesion('salida')],
    ['vencida', () => avisarCierreSesion('vencida')],
    ['cambioContrasena', () => avisarCierreSesion('cambioContrasena')],
    ['cuentaEliminada sin id', () => avisarCierreSesion('cuentaEliminada')],
  ])('%s no borra nada', async (_caso, cerrar) => {
    await guardarPreferenciaAvisos(ID, false);
    cerrar();
    await act(async () => {
      await guardarPreferenciaAvisos(OTRA, true);
    });
    expect(leerSecureStore()[clavePreferenciaAvisos(ID)]).toBe('0');
  });
});

describe('borrarPreferenciaAvisos', () => {
  it('un guardado en camino no vuelve a escribir la clave después de borrarla', async () => {
    const guardado = guardarPreferenciaAvisos(ID, false);
    const borrado = borrarPreferenciaAvisos(ID);
    await Promise.all([guardado, borrado]);
    expect(leerSecureStore()[clavePreferenciaAvisos(ID)]).toBeUndefined();
  });

  it('si SecureStore falla no rechaza', async () => {
    jest.spyOn(SecureStore, 'deleteItemAsync').mockRejectedValueOnce(new Error('Keystore ficticio'));
    await expect(borrarPreferenciaAvisos(ID)).resolves.toBeUndefined();
  });
});
