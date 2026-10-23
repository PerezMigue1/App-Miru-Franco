/// <reference types="jest" />

import { renovarSesion } from '@/shared/api/apiClient';
import {
  borrarSesion,
  borrarSesionSi,
  cerrarSesionDeGeneracion,
  generacionActual,
  guardarSesion,
  guardarUsuario,
  leerSesion,
  type SesionGuardada,
} from '@/shared/api/tokenStorage';

import { respuesta } from '../../helpers/servidorSimulado';
import {
  QUINCE_MINUTOS_MS,
  RUTA_RENOVAR_CLASICA,
  RUTA_RENOVAR_MOVIL,
  cerrarPruebaSesion,
  espiarExpiracion,
  fallarSecureStore,
  guardarEnAlmacen,
  rutasDe,
  sesionFicticia,
  textoSesion,
} from '../../helpers/sesionLimites';
import { servidorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-07.6, sesión guardada en SecureStore (src/shared/api/tokenStorage.ts): los casos límite no
 * dejan la app a medias. Una entrada vacía o dañada se borra; si falla la escritura de una sesión
 * nueva no queda la anterior en su lugar; si la renovación ya rotó los tokens y no se pudieron
 * guardar, la sesión se cierra y se avisa; si falla un borrado la cola sigue; una sesión sin
 * refreshToken (o con uno inválido) es una sesión clásica. Con el SecureStore simulado de
 * test/setup.ts y fetch simulado.
 */

afterEach(async () => {
  await cerrarPruebaSesion();
});

const base = sesionFicticia({ clasica: true });

describe('entrada de la sesión vacía o dañada', () => {
  it.each([
    ['vacía', ''],
    ['con JSON inválido', '{no es json'],
    ['con null', 'null'],
    ['con un arreglo', '[]'],
    ['con un texto JSON', '"token"'],
    ['sin usuario', JSON.stringify({ token: base.token, emitidoEn: base.emitidoEn })],
    ['con token vacío', JSON.stringify({ ...base, token: '' })],
    ['con emitidoEn en texto', JSON.stringify({ ...base, emitidoEn: '123' })],
    ['con emitidoEn en cero', JSON.stringify({ ...base, emitidoEn: 0 })],
    ['con el usuario incompleto', JSON.stringify({ ...base, usuario: { id: 'x' } })],
  ])('%s: no hay sesión y la entrada se borra', async (_caso, valor) => {
    await guardarEnAlmacen(valor);
    await expect(leerSesion()).resolves.toBeNull();
    expect(textoSesion()).toBeUndefined();
  });

  it('si el borrado de la entrada dañada falla, responde sin sesión sin lanzar y la cola sigue', async () => {
    await guardarEnAlmacen('{no es json');
    fallarSecureStore('deleteItemAsync');
    await expect(leerSesion()).resolves.toBeNull();
    const nueva = sesionFicticia();
    await expect(guardarSesion(nueva, generacionActual())).resolves.toBe(true);
    await expect(leerSesion()).resolves.toEqual(nueva);
  });
});

describe('sesión sin refreshToken o con uno que no sirve', () => {
  it.each([
    ['sin el campo (sesión clásica)', undefined],
    ['vacío', ''],
    ['numérico', 123],
    ['null', null],
    ['objeto', {}],
  ])('refreshToken %s: la sesión es válida y se lee como clásica', async (_caso, refreshToken) => {
    await guardarEnAlmacen({ ...base, refreshToken });
    await expect(leerSesion()).resolves.toEqual(base);
    expect(textoSesion()).toBeDefined();
  });
});

/** Sesiones con el acceso vencido: renovarSesion envía y luego intenta guardar lo nuevo. */
const RENOVACIONES: [string, SesionGuardada, string, () => Response][] = [
  [
    'móvil (reemplazarTokens)',
    sesionFicticia({ emitidoEn: Date.now() - QUINCE_MINUTOS_MS }),
    `POST ${RUTA_RENOVAR_MOVIL}`,
    () => respuesta({ token: 'token-ficticio-rotado', refreshToken: 'refresh-ficticio-rotado' }),
  ],
  [
    'clásica (reemplazarToken)',
    sesionFicticia({ clasica: true }),
    `POST ${RUTA_RENOVAR_CLASICA}`,
    () => respuesta({ success: true, token: 'token-ficticio-refrescado' }),
  ],
];

describe('falla al escribir en SecureStore', () => {
  it('guardarSesion lanza y no deja la sesión anterior en lugar de la nueva', async () => {
    await guardarEnAlmacen(sesionFicticia());
    fallarSecureStore('setItemAsync');
    await expect(guardarSesion(sesionFicticia(), generacionActual())).rejects.toThrow('Keystore ocupado');
    expect(textoSesion()).toBeUndefined();
    await expect(leerSesion()).resolves.toBeNull();
  });

  it.each(RENOVACIONES)(
    'renovación %s: el servidor ya rotó el token y no se pudo guardar; la sesión se cierra y se avisa una vez',
    async (_caso, sesion, ruta, crear) => {
      const manejador = espiarExpiracion();
      await guardarEnAlmacen(sesion);
      const llamadas = servidorVm({ [ruta]: crear });
      fallarSecureStore('setItemAsync');
      await expect(renovarSesion()).resolves.toBe('rechazada');
      expect(textoSesion()).toBeUndefined();
      expect(manejador).toHaveBeenCalledTimes(1);
      expect(rutasDe(llamadas)).toEqual([ruta]);
    },
  );

  it('guardarUsuario lanza, la sesión queda como estaba y la cola sigue', async () => {
    const sesion = sesionFicticia();
    await guardarEnAlmacen(sesion);
    fallarSecureStore('setItemAsync');
    await expect(guardarUsuario({ ...sesion.usuario, nombre: 'Otro nombre' }, generacionActual())).rejects.toThrow();
    await expect(leerSesion()).resolves.toEqual(sesion);
  });
});

describe('falla al borrar en SecureStore', () => {
  it('borrarSesion lanza, pero la cola sigue y la siguiente sesión se guarda y se lee', async () => {
    await guardarEnAlmacen(sesionFicticia());
    fallarSecureStore('deleteItemAsync');
    await expect(borrarSesion()).rejects.toThrow('Keystore ocupado');
    const nueva = sesionFicticia();
    await expect(guardarSesion(nueva, generacionActual())).resolves.toBe(true);
    await expect(leerSesion()).resolves.toEqual(nueva);
  });

  it.each([
    ['borrarSesionSi', (sesion: SesionGuardada) => borrarSesionSi(sesion.token, generacionActual()), () => true],
    ['cerrarSesionDeGeneracion', () => cerrarSesionDeGeneracion(generacionActual()), (sesion: SesionGuardada) => sesion],
  ])(
    '%s: aunque el borrado falle dos veces cierra la generación, no lanza y la cola sigue',
    async (_caso, cerrar: (sesion: SesionGuardada) => Promise<unknown>, esperado: (sesion: SesionGuardada) => unknown) => {
      const sesion = sesionFicticia();
      await guardarEnAlmacen(sesion);
      const antes = generacionActual();
      fallarSecureStore('deleteItemAsync', 2);
      await expect(cerrar(sesion)).resolves.toEqual(esperado(sesion));
      expect(generacionActual()).toBe(antes + 1);
      const nueva = sesionFicticia();
      await expect(guardarSesion(nueva, generacionActual())).resolves.toBe(true);
      await expect(leerSesion()).resolves.toEqual(nueva);
    },
  );
});
