/// <reference types="jest" />

import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import { ErrorRolNoPermitido } from '@/features/auth/models/AuthModel';
import { AuthProvider, useAuth } from '@/features/auth/viewmodels/useAuth';
import {
  ApiError,
  ErrorDeRed,
  accesoPorVencer,
  alExpirarSesion,
  apiGet,
  apiPost,
  esperarRenovacionEnCurso,
  renovarSesion,
  renovarSesionSiVigente,
  renovarSinGuardar,
} from '@/shared/api/apiClient';
import {
  generacionActual,
  guardarSesion,
  nuevaGeneracion,
  type SesionGuardada,
  type UsuarioGuardado,
} from '@/shared/api/tokenStorage';

import { leerSecureStore } from '../../helpers/secureStore';

/**
 * GP-05: sesión de la clienta (caja blanca).
 * 1) La renovación de src/shared/api/apiClient.ts que GP-03 dejó sin probar: renovarSesion,
 *    renovarSinGuardar, renovarSesionSiVigente, esperarRenovacionEnCurso, accesoPorVencer,
 *    alExpirarSesion y el manejo del 401 (con la renovación única compartida entre peticiones).
 * 2) useAuth (src/features/auth/viewmodels/useAuth.tsx): restaurar la sesión guardada, iniciar
 *    sesión con correo y contraseña, cerrar sesión y la sesión vencida.
 *
 * apiClient guarda estado de módulo (renovacionEnCurso, el manejador y el último refreshToken
 * consumido). No se reinicia el registro de módulos (eso separaría el SecureStore simulado que
 * limpia test/setup.ts del que usa el código): cada prueba usa tokens únicos, espera a que no quede
 * ninguna renovación en vuelo y quita su manejador en afterEach. Todo con fetch simulado.
 */

const API = 'http://api.test';
const RUTA_RENOVAR = '/api/auth/movil/renovar';
const MINUTO = 60 * 1000;
const MENSAJE_SESION_TERMINADA = 'Tu sesión terminó. Inicia sesión de nuevo.';

const USUARIO: UsuarioGuardado = {
  id: 'clienta-ficticia-1',
  nombre: 'Clienta Ficticia',
  email: 'clienta@ejemplo.test',
  rol: 'cliente',
};

const fetchSimulado = (): jest.Mock => globalThis.fetch as unknown as jest.Mock;

let contador = 0;
/** Texto único por prueba: un refreshToken ya consumido en otra prueba nunca se repite. */
function unico(prefijo: string): string {
  contador += 1;
  return `${prefijo}-${contador}`;
}

function base64Url(texto: string): string {
  return btoa(texto).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** JWT armado a mano con datos falsos (sin firma real). */
function jwtFicticio(payload: Record<string, unknown>): string {
  return `${base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${base64Url(JSON.stringify(payload))}.firma-ficticia`;
}

/** Respuesta mínima con lo que lee apiClient (ok, status y text()). */
function respuesta(cuerpo: unknown, status = 200): Response {
  const texto = cuerpo === null ? '' : JSON.stringify(cuerpo);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(texto),
  } as unknown as Response;
}

interface Llamada {
  url: string;
  ruta: string;
  metodo: string;
  auth: string | undefined;
  cuerpo: unknown;
}

function llamadas(): Llamada[] {
  return (fetchSimulado().mock.calls as [string, RequestInit][]).map(([url, init]) => {
    const cabeceras = (init.headers ?? {}) as Record<string, string>;
    return {
      url,
      ruta: url.startsWith(API) ? url.slice(API.length) : url,
      metodo: init.method ?? 'GET',
      auth: cabeceras.Authorization,
      cuerpo: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    };
  });
}

function llamadasA(ruta: string): Llamada[] {
  return llamadas().filter((llamada) => llamada.ruta === ruta);
}

type Manejador = (llamada: Llamada) => Response | Promise<Response>;

/** Servidor simulado: cada petición pasa por el manejador. Nunca sale a la red. */
function servidor(manejador: Manejador): void {
  fetchSimulado().mockImplementation((url: string, init: RequestInit) => {
    const cabeceras = (init.headers ?? {}) as Record<string, string>;
    return Promise.resolve(
      manejador({
        url,
        ruta: url.startsWith(API) ? url.slice(API.length) : url,
        metodo: init.method ?? 'GET',
        auth: cabeceras.Authorization,
        cuerpo: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      }),
    );
  });
}

interface Diferida<T> {
  promesa: Promise<T>;
  resolver: (valor: T) => void;
}

function diferida<T>(): Diferida<T> {
  let resolver: (valor: T) => void = () => undefined;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

/** Deja correr la cola de promesas y temporizadores reales pendientes. */
async function vueltas(n = 5): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
  }
}

/** Espera (con temporizadores reales) a que se cumpla la condición. */
async function hasta(condicion: () => boolean, maximo = 200): Promise<void> {
  for (let i = 0; i < maximo; i++) {
    if (condicion()) {
      return;
    }
    await vueltas(1);
  }
  throw new Error('La condición no se cumplió a tiempo.');
}

function sesionMovil(cambios: Partial<SesionGuardada> = {}): SesionGuardada {
  return {
    token: unico('token-ficticio'),
    emitidoEn: Date.now(),
    usuario: USUARIO,
    refreshToken: unico('refresh-ficticio'),
    ...cambios,
  };
}

/** Sesión sin refreshToken (guardada antes de la renovación móvil). */
function sesionClasica(cambios: Partial<SesionGuardada> = {}): SesionGuardada {
  return { token: unico('token-ficticio'), emitidoEn: Date.now(), usuario: USUARIO, ...cambios };
}

async function guardar(sesion: SesionGuardada): Promise<void> {
  await expect(guardarSesion(sesion, generacionActual())).resolves.toBe(true);
}

function sesionEnAlmacen(): SesionGuardada | null {
  const texto = leerSecureStore().auth_sesion;
  return texto === undefined ? null : (JSON.parse(texto) as SesionGuardada);
}

async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba que la promesa fallara.');
}

let quitarManejador: (() => void) | null = null;

/** Registra un manejador espía de sesión expirada; se quita en afterEach. */
function espiarExpiracion(): jest.Mock {
  const manejador = jest.fn();
  quitarManejador = alExpirarSesion(manejador);
  return manejador;
}

afterEach(async () => {
  // Ninguna renovación queda en vuelo para la siguiente prueba.
  await esperarRenovacionEnCurso();
  quitarManejador?.();
  quitarManejador = null;
});

describe('accesoPorVencer', () => {
  const emitidoEn = 1_000_000;

  it('con un JWT de 15 minutos vence a los 14 minutos (margen de 60 s), no antes', () => {
    const token = jwtFicticio({ sub: 'clienta-ficticia-1', iat: 100, exp: 100 + 15 * 60 });
    expect(accesoPorVencer({ token, emitidoEn }, emitidoEn)).toBe(false);
    expect(accesoPorVencer({ token, emitidoEn }, emitidoEn + 14 * MINUTO - 1)).toBe(false);
    expect(accesoPorVencer({ token, emitidoEn }, emitidoEn + 14 * MINUTO)).toBe(true);
    expect(accesoPorVencer({ token, emitidoEn }, emitidoEn + 20 * MINUTO)).toBe(true);
  });

  it('usa la vida del token (exp menos iat) y no el reloj del teléfono contra exp', () => {
    // exp muy en el pasado comparado con el reloj, pero la vida es de 5 minutos desde emitidoEn.
    const token = jwtFicticio({ iat: 10, exp: 10 + 5 * 60 });
    expect(accesoPorVencer({ token, emitidoEn }, emitidoEn + 4 * MINUTO - 1)).toBe(false);
    expect(accesoPorVencer({ token, emitidoEn }, emitidoEn + 4 * MINUTO)).toBe(true);
  });

  it.each([
    ['un token que no es JWT', 'token-ficticio-opaco'],
    ['un JWT sin iat', jwtFicticio({ exp: 999 })],
    ['un JWT con exp menor que iat', jwtFicticio({ iat: 500, exp: 100 })],
    ['un JWT con payload que no es JSON', `${base64Url('{"alg":"none"}')}.${base64Url('no es json')}.firma`],
    ['un JWT con payload que no es objeto', `${base64Url('{"alg":"none"}')}.${base64Url('42')}.firma`],
  ])('con %s usa la duración conocida de 15 minutos', (_caso, token) => {
    expect(accesoPorVencer({ token, emitidoEn }, emitidoEn + 14 * MINUTO - 1)).toBe(false);
    expect(accesoPorVencer({ token, emitidoEn }, emitidoEn + 14 * MINUTO)).toBe(true);
  });

  it('sin el segundo argumento compara contra Date.now()', () => {
    expect(accesoPorVencer({ token: 'token-ficticio', emitidoEn: Date.now() })).toBe(false);
    expect(accesoPorVencer({ token: 'token-ficticio', emitidoEn: Date.now() - 15 * MINUTO })).toBe(true);
  });
});

describe('alExpirarSesion', () => {
  it('avisa al manejador registrado cuando el servidor rechaza la renovación', async () => {
    const manejador = espiarExpiracion();
    await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO }));
    servidor(() => respuesta({ message: 'Sesión revocada', code: 'SESION_REVOCADA' }, 401));
    await expect(renovarSesion()).resolves.toBe('rechazada');
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it('la función que devuelve lo quita y ya no se le avisa', async () => {
    const manejador = jest.fn();
    const quitar = alExpirarSesion(manejador);
    quitar();
    await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO }));
    servidor(() => respuesta({ message: 'Sesión revocada' }, 401));
    await expect(renovarSesion()).resolves.toBe('rechazada');
    expect(manejador).not.toHaveBeenCalled();
    expect(sesionEnAlmacen()).toBeNull();
  });

  it('solo hay un manejador: el nuevo reemplaza al anterior y quitar el viejo no quita el nuevo', async () => {
    const viejo = jest.fn();
    const quitarViejo = alExpirarSesion(viejo);
    const nuevo = espiarExpiracion();
    quitarViejo();
    await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO }));
    servidor(() => respuesta({ message: 'Sesión revocada' }, 401));
    await renovarSesion();
    expect(viejo).not.toHaveBeenCalled();
    expect(nuevo).toHaveBeenCalledTimes(1);
  });
});

describe('renovarSesion: sesión móvil (con refreshToken)', () => {
  it('con el acceso vigente no envía nada y responde renovada', async () => {
    const sesion = sesionMovil();
    await guardar(sesion);
    await expect(renovarSesion()).resolves.toBe('renovada');
    expect(fetchSimulado()).not.toHaveBeenCalled();
    expect(sesionEnAlmacen()).toEqual(sesion);
  });

  it('con el acceso por vencer envía el refreshToken sin Bearer y guarda los tokens nuevos juntos', async () => {
    const sesion = sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO, refreshExpiraEn: 1_700_000_000_000 });
    await guardar(sesion);
    const nuevoToken = unico('token-ficticio-nuevo');
    const nuevoRefresh = unico('refresh-ficticio-nuevo');
    servidor(() =>
      respuesta({ token: nuevoToken, refreshToken: nuevoRefresh, refreshExpiraEn: '2026-11-18T12:00:00.000Z' }),
    );
    const antes = Date.now();

    await expect(renovarSesion()).resolves.toBe('renovada');

    expect(llamadas()).toEqual([
      {
        url: `${API}${RUTA_RENOVAR}`,
        ruta: RUTA_RENOVAR,
        metodo: 'POST',
        auth: undefined,
        cuerpo: { refreshToken: sesion.refreshToken },
      },
    ]);
    const guardada = sesionEnAlmacen();
    expect(guardada).toEqual({
      token: nuevoToken,
      refreshToken: nuevoRefresh,
      refreshExpiraEn: Date.parse('2026-11-18T12:00:00.000Z'),
      emitidoEn: expect.any(Number),
      usuario: USUARIO,
    });
    expect(guardada?.emitidoEn).toBeGreaterThanOrEqual(antes);
  });

  it('una respuesta sin refreshExpiraEn válido guarda los tokens sin vencimiento', async () => {
    await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO, refreshExpiraEn: 1_700_000_000_000 }));
    servidor(() => respuesta({ token: 'token-ficticio-b', refreshToken: unico('refresh-b'), refreshExpiraEn: 'no es fecha' }));
    await expect(renovarSesion()).resolves.toBe('renovada');
    expect(sesionEnAlmacen()).not.toHaveProperty('refreshExpiraEn');
  });

  it.each([
    [401, { message: 'Sesión vencida', code: 'SESION_VENCIDA' }],
    [409, { message: 'Reuso detectado', code: 'REFRESH_REUSADO' }],
  ])('un %i del servidor la rechaza: borra la sesión y avisa', async (status, cuerpo) => {
    const manejador = espiarExpiracion();
    await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO }));
    const generacion = generacionActual();
    servidor(() => respuesta(cuerpo, status));
    await expect(renovarSesion()).resolves.toBe('rechazada');
    expect(sesionEnAlmacen()).toBeNull();
    expect(manejador).toHaveBeenCalledTimes(1);
    // Cerrar la sesión rechazada abre una generación nueva.
    expect(generacionActual()).toBeGreaterThan(generacion);
  });

  it('un 200 sin tokens válidos deja la sesión sin forma de renovarse: la cierra', async () => {
    const manejador = espiarExpiracion();
    await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO }));
    servidor(() => respuesta({ token: 'token-ficticio-sin-refresh' }));
    await expect(renovarSesion()).resolves.toBe('rechazada');
    expect(sesionEnAlmacen()).toBeNull();
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['un 500', () => respuesta({ message: 'Error interno' }, 500)],
    ['un 429', () => respuesta({ message: 'Demasiadas solicitudes' }, 429)],
    ['un 404', () => respuesta(null, 404)],
  ])('%s es una falla: conserva la sesión y no avisa', async (_caso, crear) => {
    const manejador = espiarExpiracion();
    const sesion = sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO });
    await guardar(sesion);
    servidor(crear);
    await expect(renovarSesion()).resolves.toBe('fallida');
    expect(sesionEnAlmacen()).toEqual(sesion);
    expect(manejador).not.toHaveBeenCalled();
  });

  it('sin red es una falla que conserva la sesión', async () => {
    const sesion = sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO });
    await guardar(sesion);
    fetchSimulado().mockRejectedValue(new TypeError('Network request failed'));
    await expect(renovarSesion()).resolves.toBe('fallida');
    expect(sesionEnAlmacen()).toEqual(sesion);
  });

  it('sin sesión guardada responde rechazada sin enviar nada', async () => {
    await expect(renovarSesion()).resolves.toBe('rechazada');
    expect(fetchSimulado()).not.toHaveBeenCalled();
  });

  it('dos llamadas a la vez comparten una sola renovación', async () => {
    await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO }));
    servidor(() => respuesta({ token: unico('token-ficticio-nuevo'), refreshToken: unico('refresh-nuevo') }));
    const [a, b] = await Promise.all([renovarSesion(), renovarSesion()]);
    expect([a, b]).toEqual(['renovada', 'renovada']);
    expect(llamadasA(RUTA_RENOVAR)).toHaveLength(1);
  });

  it('si la sesión cambia mientras la renovación está en vuelo, se descarta sin escribir', async () => {
    const sesion = sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO });
    await guardar(sesion);
    const espera = diferida<Response>();
    servidor(() => espera.promesa);
    const resultado = renovarSesion();
    await hasta(() => llamadasA(RUTA_RENOVAR).length === 1);
    nuevaGeneracion();
    espera.resolver(respuesta({ token: 'token-ficticio-tardio', refreshToken: unico('refresh-tardio') }));
    await expect(resultado).resolves.toBe('descartada');
    expect(sesionEnAlmacen()).toEqual(sesion);
  });

  it('un refreshToken ya rotado por renovarSinGuardar no se vuelve a enviar: rechazada', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO });
    await guardar(sesion);
    servidor(() => respuesta({ token: 'token-ficticio-memoria', refreshToken: unico('refresh-memoria') }));
    await renovarSinGuardar(sesion.refreshToken ?? '');
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);

    await expect(renovarSesion()).resolves.toBe('rechazada');
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(sesionEnAlmacen()).toBeNull();
    expect(manejador).toHaveBeenCalledTimes(1);
  });
});

describe('renovarSesion: sesión sin refreshToken', () => {
  it('pide POST /api/auth/refresh con el Bearer actual y guarda el token nuevo', async () => {
    const sesion = sesionClasica();
    await guardar(sesion);
    servidor(() => respuesta({ success: true, token: 'token-ficticio-refrescado' }));
    await expect(renovarSesion()).resolves.toBe('renovada');
    expect(llamadas()).toEqual([
      expect.objectContaining({ ruta: '/api/auth/refresh', metodo: 'POST', auth: `Bearer ${sesion.token}` }),
    ]);
    expect(sesionEnAlmacen()).toEqual({ ...sesion, token: 'token-ficticio-refrescado', emitidoEn: expect.any(Number) });
  });

  it('un 401 responde rechazada y no borra nada por sí solo', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionClasica();
    await guardar(sesion);
    servidor(() => respuesta({ message: 'No autorizado' }, 401));
    await expect(renovarSesion()).resolves.toBe('rechazada');
    expect(sesionEnAlmacen()).toEqual(sesion);
    expect(manejador).not.toHaveBeenCalled();
  });

  it.each([
    ['un 500', () => respuesta({ message: 'Error interno' }, 500)],
    ['un 200 sin token', () => respuesta({ success: true })],
  ])('%s es una falla', async (_caso, crear) => {
    const sesion = sesionClasica();
    await guardar(sesion);
    servidor(crear);
    await expect(renovarSesion()).resolves.toBe('fallida');
    expect(sesionEnAlmacen()).toEqual(sesion);
  });

  it('sin red es una falla', async () => {
    await guardar(sesionClasica());
    fetchSimulado().mockRejectedValue(new TypeError('Network request failed'));
    await expect(renovarSesion()).resolves.toBe('fallida');
  });
});

describe('renovarSinGuardar', () => {
  it('devuelve el token y el refreshToken nuevos sin escribir nada en SecureStore', async () => {
    const sesion = sesionMovil();
    await guardar(sesion);
    const refresh = unico('refresh-ficticio');
    servidor(() => respuesta({ token: 'token-ficticio-memoria', refreshToken: 'refresh-ficticio-memoria', refreshExpiraEn: 1_800_000_000 }));
    await expect(renovarSinGuardar(refresh)).resolves.toEqual({
      token: 'token-ficticio-memoria',
      refreshToken: 'refresh-ficticio-memoria',
    });
    expect(llamadas()).toEqual([
      expect.objectContaining({ ruta: RUTA_RENOVAR, metodo: 'POST', auth: undefined, cuerpo: { refreshToken: refresh } }),
    ]);
    expect(sesionEnAlmacen()).toEqual(sesion);
  });

  it('un 401 devuelve null y ese refreshToken ya no se vuelve a enviar', async () => {
    const refresh = unico('refresh-ficticio');
    servidor(() => respuesta({ message: 'Vencida' }, 401));
    await expect(renovarSinGuardar(refresh)).resolves.toBeNull();
    await expect(renovarSinGuardar(refresh)).resolves.toBeNull();
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
  });

  it('un 500 devuelve null pero no consume el refreshToken: se puede reintentar', async () => {
    const refresh = unico('refresh-ficticio');
    servidor(() => respuesta({ message: 'Error interno' }, 500));
    await expect(renovarSinGuardar(refresh)).resolves.toBeNull();
    await expect(renovarSinGuardar(refresh)).resolves.toBeNull();
    expect(fetchSimulado()).toHaveBeenCalledTimes(2);
  });

  it('sin red devuelve null', async () => {
    fetchSimulado().mockRejectedValue(new TypeError('Network request failed'));
    await expect(renovarSinGuardar(unico('refresh-ficticio'))).resolves.toBeNull();
  });
});

describe('renovarSesionSiVigente', () => {
  it('sin sesión no hace nada', async () => {
    await renovarSesionSiVigente();
    expect(fetchSimulado()).not.toHaveBeenCalled();
  });

  it('con una sesión móvil no hace nada (se renueva al pedir)', async () => {
    await guardar(sesionMovil({ emitidoEn: Date.now() - 14 * MINUTO }));
    await renovarSesionSiVigente();
    expect(fetchSimulado()).not.toHaveBeenCalled();
  });

  it('con una sesión sin refreshToken de 15 minutos o más ya no la renueva', async () => {
    await guardar(sesionClasica({ emitidoEn: Date.now() - 15 * MINUTO }));
    await renovarSesionSiVigente();
    expect(fetchSimulado()).not.toHaveBeenCalled();
  });

  it('con una sesión sin refreshToken de menos de 15 minutos la renueva', async () => {
    const sesion = sesionClasica({ emitidoEn: Date.now() - 11 * MINUTO });
    await guardar(sesion);
    servidor(() => respuesta({ token: 'token-ficticio-periodico' }));
    await renovarSesionSiVigente();
    expect(llamadas()).toEqual([
      expect.objectContaining({ ruta: '/api/auth/refresh', auth: `Bearer ${sesion.token}` }),
    ]);
    expect(sesionEnAlmacen()?.token).toBe('token-ficticio-periodico');
  });

  it('si el servidor la rechaza, la sesión expira y se avisa', async () => {
    const manejador = espiarExpiracion();
    await guardar(sesionClasica({ emitidoEn: Date.now() - 11 * MINUTO }));
    servidor(() => respuesta({ message: 'No autorizado' }, 401));
    await renovarSesionSiVigente();
    expect(sesionEnAlmacen()).toBeNull();
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it('sin red se conserva la sesión', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionClasica({ emitidoEn: Date.now() - 11 * MINUTO });
    await guardar(sesion);
    fetchSimulado().mockRejectedValue(new TypeError('Network request failed'));
    await renovarSesionSiVigente();
    expect(sesionEnAlmacen()).toEqual(sesion);
    expect(manejador).not.toHaveBeenCalled();
  });
});

describe('esperarRenovacionEnCurso', () => {
  it('sin renovación en curso termina enseguida', async () => {
    await expect(esperarRenovacionEnCurso()).resolves.toBeUndefined();
  });

  it('espera a que termine la renovación en vuelo', async () => {
    await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO }));
    const espera = diferida<Response>();
    servidor(() => espera.promesa);
    const renovacion = renovarSesion();
    await hasta(() => fetchSimulado().mock.calls.length === 1);

    let termino = false;
    const esperando = esperarRenovacionEnCurso().then(() => {
      termino = true;
    });
    await vueltas();
    expect(termino).toBe(false);

    const nuevoToken = unico('token-ficticio-nuevo');
    espera.resolver(respuesta({ token: nuevoToken, refreshToken: unico('refresh-nuevo') }));
    await esperando;
    expect(termino).toBe(true);
    // Al terminar de esperar, los tokens nuevos ya están guardados.
    expect(sesionEnAlmacen()?.token).toBe(nuevoToken);
    await expect(renovacion).resolves.toBe('renovada');
  });
});

describe('petición protegida de una sesión móvil ante un 401', () => {
  /** Servidor con un acceso viejo (rechazado) y uno nuevo (aceptado) tras renovar. */
  function servidorConRenovacion(
    viejo: string,
    renovar: () => Response | Promise<Response>,
  ): void {
    servidor((llamada) => {
      if (llamada.ruta === RUTA_RENOVAR) {
        return renovar();
      }
      if (llamada.auth === `Bearer ${viejo}`) {
        return respuesta({ message: 'Token vencido' }, 401);
      }
      return respuesta({ ruta: llamada.ruta, auth: llamada.auth });
    });
  }

  it('renueva una vez, guarda los tokens y repite la petición con el acceso nuevo', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionMovil();
    await guardar(sesion);
    const nuevo = unico('token-ficticio-nuevo');
    const nuevoRefresh = unico('refresh-nuevo');
    servidorConRenovacion(sesion.token, () => respuesta({ token: nuevo, refreshToken: nuevoRefresh }));

    await expect(apiGet('/api/citas?propios=true')).resolves.toEqual({
      ruta: '/api/citas?propios=true',
      auth: `Bearer ${nuevo}`,
    });
    expect(llamadas().map((l) => [l.metodo, l.ruta, l.auth])).toEqual([
      ['GET', '/api/citas?propios=true', `Bearer ${sesion.token}`],
      ['POST', RUTA_RENOVAR, undefined],
      ['GET', '/api/citas?propios=true', `Bearer ${nuevo}`],
    ]);
    expect(sesionEnAlmacen()).toMatchObject({ token: nuevo, refreshToken: nuevoRefresh });
    expect(manejador).not.toHaveBeenCalled();
  });

  it('el reintento conserva el método y el cuerpo', async () => {
    const sesion = sesionMovil();
    await guardar(sesion);
    const nuevo = unico('token-ficticio-nuevo');
    servidorConRenovacion(sesion.token, () => respuesta({ token: nuevo, refreshToken: unico('refresh-nuevo') }));
    await apiPost('/api/carrito', { productoId: 7, presentacionId: 1, cantidad: 2 });
    const carrito = llamadasA('/api/carrito');
    expect(carrito).toHaveLength(2);
    for (const llamada of carrito) {
      expect(llamada.metodo).toBe('POST');
      expect(llamada.cuerpo).toEqual({ productoId: 7, presentacionId: 1, cantidad: 2 });
    }
  });

  it('si la renovación se rechaza, cierra la sesión, avisa y lanza el error de sesión terminada con su code', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionMovil();
    await guardar(sesion);
    servidorConRenovacion(sesion.token, () => respuesta({ message: 'Revocada', code: 'SESION_REVOCADA' }, 401));

    const error = await capturarError(apiGet('/api/auth/me'));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, message: MENSAJE_SESION_TERMINADA, code: 'SESION_REVOCADA' });
    expect(sesionEnAlmacen()).toBeNull();
    expect(manejador).toHaveBeenCalledTimes(1);
    // No hay reintento con el acceso rechazado.
    expect(llamadasA('/api/auth/me')).toHaveLength(1);
  });

  it('un rechazo sin code usa SESION_VENCIDA', async () => {
    espiarExpiracion();
    const sesion = sesionMovil();
    await guardar(sesion);
    servidorConRenovacion(sesion.token, () => respuesta({ message: 'Vencida' }, 401));
    const error = await capturarError(apiGet('/api/auth/me'));
    expect(error).toMatchObject({ status: 401, code: 'SESION_VENCIDA' });
  });

  it('si la renovación falla (500), propaga ese error y conserva la sesión', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionMovil();
    await guardar(sesion);
    servidorConRenovacion(sesion.token, () => respuesta({ message: 'Error interno' }, 500));
    const error = await capturarError(apiGet('/api/auth/me'));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500 });
    expect(sesionEnAlmacen()).toEqual(sesion);
    expect(manejador).not.toHaveBeenCalled();
  });

  it('si la renovación se queda sin red, lanza ErrorDeRed y conserva la sesión', async () => {
    const sesion = sesionMovil();
    await guardar(sesion);
    servidor((llamada) => {
      if (llamada.ruta === RUTA_RENOVAR) {
        throw new TypeError('Network request failed');
      }
      return respuesta({ message: 'Token vencido' }, 401);
    });
    await expect(apiGet('/api/auth/me')).rejects.toBeInstanceOf(ErrorDeRed);
    expect(sesionEnAlmacen()).toEqual(sesion);
  });

  it('si el acceso recién renovado también recibe 401, cierra la sesión y avisa', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionMovil();
    await guardar(sesion);
    servidor((llamada) =>
      llamada.ruta === RUTA_RENOVAR
        ? respuesta({ token: unico('token-ficticio-nuevo'), refreshToken: unico('refresh-nuevo') })
        : respuesta({ message: 'No autorizado' }, 401),
    );
    const error = await capturarError(apiGet('/api/auth/me'));
    expect(error).toMatchObject({ status: 401, message: MENSAJE_SESION_TERMINADA, code: 'SESION_VENCIDA' });
    expect(llamadasA('/api/auth/me')).toHaveLength(2);
    expect(llamadasA(RUTA_RENOVAR)).toHaveLength(1);
    expect(sesionEnAlmacen()).toBeNull();
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it('varias peticiones con 401 a la vez provocan un solo POST de renovación y todas se repiten', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionMovil();
    await guardar(sesion);
    const nuevo = unico('token-ficticio-nuevo');
    const nuevoRefresh = unico('refresh-nuevo');
    const espera = diferida<Response>();
    servidorConRenovacion(sesion.token, () => espera.promesa);

    const rutas = ['/api/auth/me', '/api/carrito', '/api/citas?propios=true'];
    const peticiones = rutas.map((ruta) => apiGet<{ ruta: string; auth: string }>(ruta));

    // Las tres salen con el acceso viejo y la renovación queda en vuelo.
    await hasta(
      () =>
        llamadas().filter((l) => l.auth === `Bearer ${sesion.token}`).length === 3 &&
        llamadasA(RUTA_RENOVAR).length === 1,
    );
    await vueltas();
    expect(llamadasA(RUTA_RENOVAR)).toHaveLength(1);

    espera.resolver(respuesta({ token: nuevo, refreshToken: nuevoRefresh }));
    const resultados = await Promise.all(peticiones);

    expect(resultados).toEqual(rutas.map((ruta) => ({ ruta, auth: `Bearer ${nuevo}` })));
    expect(llamadasA(RUTA_RENOVAR)).toHaveLength(1);
    expect(llamadas().filter((l) => l.auth === `Bearer ${nuevo}`)).toHaveLength(3);
    expect(sesionEnAlmacen()).toMatchObject({ token: nuevo, refreshToken: nuevoRefresh });
    expect(manejador).not.toHaveBeenCalled();
  });

  it('varias peticiones con 401 a la vez y la renovación rechazada: un POST, todas fallan y se avisa una vez', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionMovil();
    await guardar(sesion);
    const espera = diferida<Response>();
    servidorConRenovacion(sesion.token, () => espera.promesa);

    const rutas = ['/api/auth/me', '/api/carrito', '/api/citas?propios=true'];
    const peticiones = rutas.map((ruta) => capturarError(apiGet(ruta)));
    await hasta(
      () =>
        llamadas().filter((l) => l.auth === `Bearer ${sesion.token}`).length === 3 &&
        llamadasA(RUTA_RENOVAR).length === 1,
    );
    await vueltas();

    espera.resolver(respuesta({ message: 'Revocada', code: 'SESION_REVOCADA' }, 401));
    const errores = await Promise.all(peticiones);

    for (const error of errores) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 401, message: MENSAJE_SESION_TERMINADA, code: 'SESION_REVOCADA' });
    }
    expect(llamadasA(RUTA_RENOVAR)).toHaveLength(1);
    expect(llamadas()).toHaveLength(4);
    expect(sesionEnAlmacen()).toBeNull();
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it('un 401 sin sesión guardada solo se informa: no renueva', async () => {
    const manejador = espiarExpiracion();
    servidor(() => respuesta({ message: 'No autorizado', code: 'NO_AUTENTICADO' }, 401));
    const error = await capturarError(apiGet('/api/auth/me'));
    expect(error).toMatchObject({ status: 401, message: 'No autorizado', code: 'NO_AUTENTICADO' });
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(manejador).not.toHaveBeenCalled();
  });

  it('un 401 con token explícito no renueva ni cierra la sesión guardada', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionMovil();
    await guardar(sesion);
    servidor(() => respuesta({ message: 'No autorizado' }, 401));
    await expect(apiGet('/api/auth/me', { token: 'token-ficticio-explicito' })).rejects.toMatchObject({ status: 401 });
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(sesionEnAlmacen()).toEqual(sesion);
    expect(manejador).not.toHaveBeenCalled();
  });

  it('si la sesión cambió mientras la petición iba en vuelo, el 401 no renueva ni cierra nada', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionMovil();
    await guardar(sesion);
    const espera = diferida<Response>();
    servidor(() => espera.promesa);
    const peticion = capturarError(apiGet('/api/auth/me'));
    await hasta(() => fetchSimulado().mock.calls.length === 1);
    nuevaGeneracion();
    espera.resolver(respuesta({ message: 'No autorizado' }, 401));
    expect(await peticion).toMatchObject({ status: 401, message: 'No autorizado' });
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(sesionEnAlmacen()).toEqual(sesion);
    expect(manejador).not.toHaveBeenCalled();
  });
});

describe('petición protegida de una sesión móvil con el acceso por vencer', () => {
  it('renueva antes de salir y la petición lleva el acceso nuevo', async () => {
    const sesion = sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO });
    await guardar(sesion);
    const nuevo = unico('token-ficticio-nuevo');
    servidor((llamada) =>
      llamada.ruta === RUTA_RENOVAR
        ? respuesta({ token: nuevo, refreshToken: unico('refresh-nuevo') })
        : respuesta({ ok: true }),
    );
    await expect(apiGet('/api/carrito')).resolves.toEqual({ ok: true });
    expect(llamadas().map((l) => [l.ruta, l.auth])).toEqual([
      [RUTA_RENOVAR, undefined],
      ['/api/carrito', `Bearer ${nuevo}`],
    ]);
  });

  it('si la renovación previa se rechaza, no envía la petición y lanza sesión terminada', async () => {
    const manejador = espiarExpiracion();
    await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO }));
    servidor(() => respuesta({ message: 'Revocada', code: 'SESION_REVOCADA' }, 401));
    const error = await capturarError(apiGet('/api/carrito'));
    expect(error).toMatchObject({ status: 401, message: MENSAJE_SESION_TERMINADA, code: 'SESION_REVOCADA' });
    expect(llamadasA('/api/carrito')).toHaveLength(0);
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it('si la renovación previa falla con el acceso ya vencido, no envía la petición', async () => {
    const sesion = sesionMovil({ emitidoEn: Date.now() - 16 * MINUTO });
    await guardar(sesion);
    servidor(() => respuesta({ message: 'Error interno' }, 503));
    const error = await capturarError(apiGet('/api/carrito'));
    expect(error).toMatchObject({ status: 503 });
    expect(llamadasA('/api/carrito')).toHaveLength(0);
    expect(sesionEnAlmacen()).toEqual(sesion);
  });

  it('si la renovación previa falla sin red con el acceso vencido, lanza ErrorDeRed', async () => {
    await guardar(sesionMovil({ emitidoEn: Date.now() - 16 * MINUTO }));
    fetchSimulado().mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiGet('/api/carrito')).rejects.toBeInstanceOf(ErrorDeRed);
  });

  it('si la renovación previa falla con el acceso aún vigente, sale con el acceso actual', async () => {
    const sesion = sesionMovil({ emitidoEn: Date.now() - 14.5 * MINUTO });
    await guardar(sesion);
    servidor((llamada) =>
      llamada.ruta === RUTA_RENOVAR ? respuesta({ message: 'Error interno' }, 500) : respuesta({ ok: true }),
    );
    await expect(apiGet('/api/carrito')).resolves.toEqual({ ok: true });
    expect(llamadasA('/api/carrito')[0].auth).toBe(`Bearer ${sesion.token}`);
  });

  it('si la previa falló y la petición recibe 401, no renueva otra vez y propaga el error de la renovación', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionMovil({ emitidoEn: Date.now() - 14.5 * MINUTO });
    await guardar(sesion);
    servidor((llamada) =>
      llamada.ruta === RUTA_RENOVAR
        ? respuesta({ message: 'Error interno' }, 500)
        : respuesta({ message: 'No autorizado' }, 401),
    );
    const error = await capturarError(apiGet('/api/carrito'));
    expect(error).toMatchObject({ status: 500 });
    expect(llamadasA(RUTA_RENOVAR)).toHaveLength(1);
    expect(sesionEnAlmacen()).toEqual(sesion);
    expect(manejador).not.toHaveBeenCalled();
  });

  it('si la previa renovó y aun así la petición recibe 401, cierra la sesión y avisa', async () => {
    const manejador = espiarExpiracion();
    await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO }));
    servidor((llamada) =>
      llamada.ruta === RUTA_RENOVAR
        ? respuesta({ token: unico('token-ficticio-nuevo'), refreshToken: unico('refresh-nuevo') })
        : respuesta({ message: 'No autorizado' }, 401),
    );
    const error = await capturarError(apiGet('/api/carrito'));
    expect(error).toMatchObject({ status: 401, code: 'SESION_VENCIDA' });
    expect(llamadasA(RUTA_RENOVAR)).toHaveLength(1);
    expect(llamadasA('/api/carrito')).toHaveLength(1);
    expect(manejador).toHaveBeenCalledTimes(1);
  });
});

describe('petición protegida de una sesión sin refreshToken ante un 401', () => {
  it('con menos de 15 minutos renueva con /api/auth/refresh y repite una vez', async () => {
    const sesion = sesionClasica();
    await guardar(sesion);
    servidor((llamada) => {
      if (llamada.ruta === '/api/auth/refresh') {
        return respuesta({ token: 'token-ficticio-clasico-nuevo' });
      }
      return llamada.auth === `Bearer ${sesion.token}`
        ? respuesta({ message: 'Token vencido' }, 401)
        : respuesta({ ok: true });
    });
    await expect(apiGet('/api/auth/me')).resolves.toEqual({ ok: true });
    expect(llamadas().map((l) => [l.ruta, l.auth])).toEqual([
      ['/api/auth/me', `Bearer ${sesion.token}`],
      ['/api/auth/refresh', `Bearer ${sesion.token}`],
      ['/api/auth/me', 'Bearer token-ficticio-clasico-nuevo'],
    ]);
  });

  it('si el reintento también recibe 401, cierra la sesión y avisa', async () => {
    const manejador = espiarExpiracion();
    await guardar(sesionClasica());
    servidor((llamada) =>
      llamada.ruta === '/api/auth/refresh'
        ? respuesta({ token: 'token-ficticio-clasico-nuevo' })
        : respuesta({ message: 'No autorizado' }, 401),
    );
    await expect(apiGet('/api/auth/me')).rejects.toMatchObject({ status: 401, message: 'No autorizado' });
    expect(sesionEnAlmacen()).toBeNull();
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it('si /api/auth/refresh la rechaza, cierra la sesión y avisa', async () => {
    const manejador = espiarExpiracion();
    await guardar(sesionClasica());
    servidor(() => respuesta({ message: 'No autorizado' }, 401));
    await expect(apiGet('/api/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(sesionEnAlmacen()).toBeNull();
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it('si /api/auth/refresh falla, conserva la sesión e informa el 401', async () => {
    const manejador = espiarExpiracion();
    const sesion = sesionClasica();
    await guardar(sesion);
    servidor((llamada) =>
      llamada.ruta === '/api/auth/refresh'
        ? respuesta({ message: 'Error interno' }, 500)
        : respuesta({ message: 'No autorizado' }, 401),
    );
    await expect(apiGet('/api/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(sesionEnAlmacen()).toEqual(sesion);
    expect(manejador).not.toHaveBeenCalled();
  });

  it('con 15 minutos o más no renueva: cierra la sesión y avisa', async () => {
    const manejador = espiarExpiracion();
    await guardar(sesionClasica({ emitidoEn: Date.now() - 16 * MINUTO }));
    servidor(() => respuesta({ message: 'No autorizado' }, 401));
    await expect(apiGet('/api/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(llamadasA('/api/auth/refresh')).toHaveLength(0);
    expect(sesionEnAlmacen()).toBeNull();
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it('entre 10 y 15 minutos renueva antes de enviar la petición', async () => {
    const sesion = sesionClasica({ emitidoEn: Date.now() - 12 * MINUTO });
    await guardar(sesion);
    servidor((llamada) =>
      llamada.ruta === '/api/auth/refresh' ? respuesta({ token: 'token-ficticio-previo' }) : respuesta({ ok: true }),
    );
    await apiGet('/api/carrito');
    expect(llamadas().map((l) => [l.ruta, l.auth])).toEqual([
      ['/api/auth/refresh', `Bearer ${sesion.token}`],
      ['/api/carrito', 'Bearer token-ficticio-previo'],
    ]);
  });
});

// ── useAuth ──────────────────────────────────────────────────────────────────────────────────

/** Monta el AuthProvider real y devuelve el resultado de useAuth. */
function montar() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

/** Cuerpo de GET /api/auth/me. */
function perfil(cambios: Partial<UsuarioGuardado> = {}): { data: UsuarioGuardado } {
  return { data: { ...USUARIO, ...cambios } };
}

describe('useAuth: restaurar la sesión guardada', () => {
  it('sin sesión guardada queda anónimo y no pide nada al servidor', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    expect(result.current.usuario).toBeNull();
    expect(result.current.sesionVencida).toBe(false);
    expect(fetchSimulado()).not.toHaveBeenCalled();
  });

  it('una entrada dañada en SecureStore cuenta como sin sesión', async () => {
    await SecureStore.setItemAsync('auth_sesion', '{no es json');
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    expect(fetchSimulado()).not.toHaveBeenCalled();
  });

  it('con sesión vigente entra con el usuario guardado y lo actualiza con /api/auth/me', async () => {
    const sesion = sesionMovil();
    await guardar(sesion);
    servidor(() => respuesta(perfil({ nombre: 'Clienta Ficticia Actualizada' })));

    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('autenticado'));
    await waitFor(() => expect(result.current.usuario?.nombre).toBe('Clienta Ficticia Actualizada'));

    expect(llamadas()).toEqual([
      expect.objectContaining({ ruta: '/api/auth/me', metodo: 'GET', auth: `Bearer ${sesion.token}` }),
    ]);
    await waitFor(() => expect(sesionEnAlmacen()?.usuario.nombre).toBe('Clienta Ficticia Actualizada'));
    expect(sesionEnAlmacen()).toMatchObject({ token: sesion.token, refreshToken: sesion.refreshToken });
  });

  it('si /api/auth/me no responde, conserva la sesión guardada', async () => {
    const sesion = sesionMovil();
    await guardar(sesion);
    fetchSimulado().mockRejectedValue(new TypeError('Network request failed'));
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('autenticado'));
    await waitFor(() => expect(fetchSimulado()).toHaveBeenCalledTimes(1));
    await vueltas();
    expect(result.current.usuario).toEqual(USUARIO);
    expect(sesionEnAlmacen()).toEqual(sesion);
  });

  it('con el acceso por vencer renueva en silencio antes de entrar y pide /me con el acceso nuevo', async () => {
    const sesion = sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO });
    await guardar(sesion);
    const nuevo = unico('token-ficticio-nuevo');
    servidor((llamada) =>
      llamada.ruta === RUTA_RENOVAR
        ? respuesta({ token: nuevo, refreshToken: unico('refresh-nuevo') })
        : respuesta(perfil()),
    );
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('autenticado'));
    await waitFor(() => expect(llamadasA('/api/auth/me')).toHaveLength(1));
    expect(llamadas().map((l) => [l.ruta, l.auth])).toEqual([
      [RUTA_RENOVAR, undefined],
      ['/api/auth/me', `Bearer ${nuevo}`],
    ]);
    expect(sesionEnAlmacen()?.token).toBe(nuevo);
  });

  it('con el acceso por vencer y la renovación rechazada queda sin sesión y con el aviso', async () => {
    await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO }));
    servidor(() => respuesta({ message: 'Revocada', code: 'SESION_REVOCADA' }, 401));
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    expect(result.current.sesionVencida).toBe(true);
    expect(result.current.usuario).toBeNull();
    expect(sesionEnAlmacen()).toBeNull();
    expect(llamadasA('/api/auth/me')).toHaveLength(0);
  });

  it('con el acceso por vencer y la renovación fallida entra con la sesión guardada sin pedir /me', async () => {
    const sesion = sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO });
    await guardar(sesion);
    servidor(() => respuesta({ message: 'Error interno' }, 500));
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('autenticado'));
    expect(result.current.usuario).toEqual(USUARIO);
    expect(result.current.sesionVencida).toBe(false);
    await vueltas();
    expect(llamadasA('/api/auth/me')).toHaveLength(0);
    expect(sesionEnAlmacen()).toEqual(sesion);
  });

  it('una sesión guardada de alguien que no es clienta se cierra y se revoca en el servidor', async () => {
    const sesion = sesionMovil({ usuario: { ...USUARIO, rol: 'admin' } });
    await guardar(sesion);
    servidor(() => respuesta({ success: true }));
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    expect(result.current.sesionVencida).toBe(false);
    expect(sesionEnAlmacen()).toBeNull();
    await waitFor(() => expect(llamadasA('/api/auth/logout')).toHaveLength(1));
    expect(llamadasA('/api/auth/logout')[0]).toMatchObject({
      metodo: 'POST',
      auth: `Bearer ${sesion.token}`,
      cuerpo: { logoutAll: false, refreshToken: sesion.refreshToken },
    });
    expect(llamadasA('/api/auth/me')).toHaveLength(0);
  });

  it('si /me dice que la cuenta ya no es de clienta, cierra la sesión', async () => {
    const sesion = sesionMovil();
    await guardar(sesion);
    servidor((llamada) =>
      llamada.ruta === '/api/auth/me' ? respuesta(perfil({ rol: 'estilista' })) : respuesta({ success: true }),
    );
    const { result } = await montar();
    await waitFor(() => expect(llamadasA('/api/auth/logout')).toHaveLength(1));
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    expect(sesionEnAlmacen()).toBeNull();
  });
});

describe('useAuth: sesión vencida', () => {
  it('un 401 de /me con la renovación rechazada deja sin sesión, marca el aviso y se puede descartar', async () => {
    const sesion = sesionMovil();
    await guardar(sesion);
    servidor((llamada) =>
      llamada.ruta === RUTA_RENOVAR
        ? respuesta({ message: 'Revocada', code: 'SESION_REVOCADA' }, 401)
        : respuesta({ message: 'Token vencido' }, 401),
    );
    const { result } = await montar();
    await waitFor(() => expect(result.current.sesionVencida).toBe(true));
    expect(result.current.estado).toBe('anonimo');
    expect(result.current.usuario).toBeNull();
    expect(sesionEnAlmacen()).toBeNull();
    expect(llamadasA(RUTA_RENOVAR)).toHaveLength(1);

    await act(async () => {
      result.current.descartarAvisoSesion();
    });
    expect(result.current.sesionVencida).toBe(false);
  });

  it('iniciar sesión otra vez quita el aviso de sesión vencida', async () => {
    await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO }));
    const nuevo = unico('token-ficticio-login');
    servidor((llamada) => {
      if (llamada.ruta === RUTA_RENOVAR) {
        return respuesta({ message: 'Revocada' }, 401);
      }
      return respuesta({ success: true, token: nuevo, refreshToken: unico('refresh-login'), usuario: USUARIO });
    });
    const { result } = await montar();
    await waitFor(() => expect(result.current.sesionVencida).toBe(true));

    await act(async () => {
      await result.current.ingresar('clienta@ejemplo.test', 'ClaveFicticia1!');
    });
    expect(result.current.estado).toBe('autenticado');
    expect(result.current.sesionVencida).toBe(false);
  });

  it('al desmontar el AuthProvider deja de escuchar la expiración', async () => {
    const { result, unmount } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    await unmount();
    // Sin manejador registrado, un rechazo ya no intenta actualizar un componente desmontado.
    const espiaError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await guardar(sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO }));
      servidor(() => respuesta({ message: 'Revocada' }, 401));
      await expect(renovarSesion()).resolves.toBe('rechazada');
      expect(espiaError).not.toHaveBeenCalled();
    } finally {
      espiaError.mockRestore();
    }
  });
});

describe('useAuth: iniciar sesión con correo y contraseña', () => {
  it('envía el login con canal movil, guarda la sesión con su refreshToken y entra', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    const token = unico('token-ficticio-login');
    const refresh = unico('refresh-login');
    servidor(() =>
      respuesta({
        success: true,
        token,
        refreshToken: refresh,
        refreshExpiraEn: '2026-11-18T12:00:00.000Z',
        usuario: { id: 42, nombre: 'Clienta Ficticia', email: 'clienta@ejemplo.test', rol: 'cliente' },
      }),
    );
    const generacion = generacionActual();

    await act(async () => {
      await result.current.ingresar('clienta@ejemplo.test', 'ClaveFicticia1!');
    });

    expect(llamadas()).toEqual([
      expect.objectContaining({
        ruta: '/api/auth/login',
        metodo: 'POST',
        auth: undefined,
        cuerpo: expect.objectContaining({
          email: 'clienta@ejemplo.test',
          password: 'ClaveFicticia1!',
          canal: 'movil',
        }),
      }),
    ]);
    expect(result.current.estado).toBe('autenticado');
    // El id numérico del backend se normaliza a texto.
    expect(result.current.usuario).toEqual({ id: '42', nombre: 'Clienta Ficticia', email: 'clienta@ejemplo.test', rol: 'cliente' });
    expect(sesionEnAlmacen()).toEqual({
      token,
      refreshToken: refresh,
      refreshExpiraEn: Date.parse('2026-11-18T12:00:00.000Z'),
      emitidoEn: expect.any(Number),
      usuario: { id: '42', nombre: 'Clienta Ficticia', email: 'clienta@ejemplo.test', rol: 'cliente' },
    });
    // Iniciar sesión abre una generación nueva.
    expect(generacionActual()).toBeGreaterThan(generacion);
  });

  it('sin refreshToken guarda una sesión sin él (camino anterior)', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    servidor(() => respuesta({ success: true, token: 'token-ficticio-sin-refresh', usuario: USUARIO, refreshExpiraEn: 1_800_000_000 }));
    await act(async () => {
      await result.current.ingresar('clienta@ejemplo.test', 'ClaveFicticia1!');
    });
    const guardada = sesionEnAlmacen();
    expect(guardada?.token).toBe('token-ficticio-sin-refresh');
    expect(guardada).not.toHaveProperty('refreshToken');
    expect(guardada).not.toHaveProperty('refreshExpiraEn');
  });

  it('una cuenta que no es de clienta lanza ErrorRolNoPermitido, no guarda nada y revoca esa sesión', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    const token = unico('token-ficticio-admin');
    const refresh = unico('refresh-admin');
    servidor((llamada) =>
      llamada.ruta === '/api/auth/login'
        ? respuesta({ success: true, token, refreshToken: refresh, usuario: { ...USUARIO, rol: 'admin' } })
        : respuesta({ success: true }),
    );
    let error: unknown;
    await act(async () => {
      error = await capturarError(result.current.ingresar('clienta@ejemplo.test', 'ClaveFicticia1!'));
    });
    expect(error).toBeInstanceOf(ErrorRolNoPermitido);
    expect(result.current.estado).toBe('anonimo');
    expect(sesionEnAlmacen()).toBeNull();
    await waitFor(() => expect(llamadasA('/api/auth/logout')).toHaveLength(1));
    expect(llamadasA('/api/auth/logout')[0]).toMatchObject({
      auth: `Bearer ${token}`,
      cuerpo: { logoutAll: false, refreshToken: refresh },
    });
  });

  it('una respuesta sin token lanza ApiError 500 y no entra', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    servidor(() => respuesta({ success: true, usuario: USUARIO }));
    let error: unknown;
    await act(async () => {
      error = await capturarError(result.current.ingresar('clienta@ejemplo.test', 'ClaveFicticia1!'));
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500 });
    expect(result.current.estado).toBe('anonimo');
    expect(sesionEnAlmacen()).toBeNull();
  });

  it('credenciales inválidas: el 401 del login llega como ApiError, sin renovar ni guardar', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    servidor(() => respuesta({ message: 'Credenciales inválidas', code: 'CREDENCIALES_INVALIDAS' }, 401));
    let error: unknown;
    await act(async () => {
      error = await capturarError(result.current.ingresar('clienta@ejemplo.test', 'ClaveFicticia1!'));
    });
    expect(error).toMatchObject({ status: 401, code: 'CREDENCIALES_INVALIDAS' });
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe('anonimo');
    expect(sesionEnAlmacen()).toBeNull();
  });
});

describe('useAuth: cerrar sesión', () => {
  it('borra la sesión, queda anónimo y la revoca en el servidor con su refreshToken', async () => {
    const sesion = sesionMovil();
    await guardar(sesion);
    servidor((llamada) => (llamada.ruta === '/api/auth/me' ? respuesta(perfil()) : respuesta({ success: true })));
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('autenticado'));
    await waitFor(() => expect(llamadasA('/api/auth/me')).toHaveLength(1));

    let cerrada: boolean | undefined;
    await act(async () => {
      cerrada = await result.current.salir();
    });

    expect(cerrada).toBe(true);
    expect(result.current.estado).toBe('anonimo');
    expect(result.current.usuario).toBeNull();
    // Cerrar sesión no es una sesión vencida.
    expect(result.current.sesionVencida).toBe(false);
    expect(leerSecureStore()).toEqual({});
    await waitFor(() => expect(llamadasA('/api/auth/logout')).toHaveLength(1));
    expect(llamadasA('/api/auth/logout')[0]).toMatchObject({
      metodo: 'POST',
      auth: `Bearer ${sesion.token}`,
      cuerpo: { logoutAll: false, refreshToken: sesion.refreshToken },
    });
  });

  it('con el acceso por vencer renueva solo en memoria para revocar, sin volver a guardar nada', async () => {
    const sesion = sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO });
    servidor((llamada) =>
      llamada.ruta === RUTA_RENOVAR
        ? respuesta({ token: 'token-ficticio-memoria', refreshToken: 'refresh-ficticio-memoria' })
        : respuesta({ success: true }),
    );
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    // La sesión aparece después del arranque (por ejemplo, la guardó otro flujo).
    await guardar(sesion);

    await act(async () => {
      await result.current.salir();
    });
    await waitFor(() => expect(llamadasA('/api/auth/logout')).toHaveLength(1));
    expect(llamadasA(RUTA_RENOVAR)[0].cuerpo).toEqual({ refreshToken: sesion.refreshToken });
    expect(llamadasA('/api/auth/logout')[0]).toMatchObject({
      auth: 'Bearer token-ficticio-memoria',
      cuerpo: { logoutAll: false, refreshToken: 'refresh-ficticio-memoria' },
    });
    expect(leerSecureStore()).toEqual({});
  });

  it('espera la renovación en curso y revoca el refreshToken ya rotado', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    const sesion = sesionMovil({ emitidoEn: Date.now() - 15 * MINUTO });
    await guardar(sesion);
    const nuevo = unico('token-ficticio-rotado');
    const nuevoRefresh = unico('refresh-rotado');
    const espera = diferida<Response>();
    servidor((llamada) => (llamada.ruta === RUTA_RENOVAR ? espera.promesa : respuesta({ success: true })));

    const renovacion = renovarSesion();
    await hasta(() => llamadasA(RUTA_RENOVAR).length === 1);

    let cierre: Promise<boolean> = Promise.resolve(false);
    let termino = false;
    await act(async () => {
      cierre = result.current.salir().then((valor) => {
        termino = true;
        return valor;
      });
      await vueltas();
    });
    // Mientras la renovación sigue en vuelo, salir no borra nada.
    expect(termino).toBe(false);
    expect(sesionEnAlmacen()).toEqual(sesion);
    expect(llamadasA('/api/auth/logout')).toHaveLength(0);

    await act(async () => {
      espera.resolver(respuesta({ token: nuevo, refreshToken: nuevoRefresh }));
      await expect(cierre).resolves.toBe(true);
    });
    await expect(renovacion).resolves.toBe('renovada');
    expect(leerSecureStore()).toEqual({});
    await waitFor(() => expect(llamadasA('/api/auth/logout')).toHaveLength(1));
    expect(llamadasA('/api/auth/logout')[0]).toMatchObject({
      auth: `Bearer ${nuevo}`,
      cuerpo: { logoutAll: false, refreshToken: nuevoRefresh },
    });
  });

  it('si no se puede borrar la sesión (dos intentos), devuelve false y sigue dentro', async () => {
    const sesion = sesionMovil();
    await guardar(sesion);
    servidor(() => respuesta(perfil()));
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('autenticado'));
    await waitFor(() => expect(llamadasA('/api/auth/me')).toHaveLength(1));

    const borrar = SecureStore.deleteItemAsync as unknown as jest.Mock;
    borrar.mockRejectedValueOnce(new Error('Keystore ocupado')).mockRejectedValueOnce(new Error('Keystore ocupado'));
    let cerrada: boolean | undefined;
    await act(async () => {
      cerrada = await result.current.salir();
    });
    expect(cerrada).toBe(false);
    expect(result.current.estado).toBe('autenticado');
    expect(sesionEnAlmacen()).toMatchObject({ token: sesion.token });
    expect(llamadasA('/api/auth/logout')).toHaveLength(0);
  });

  it('sin sesión guardada, salir no llama al servidor', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('anonimo'));
    let cerrada: boolean | undefined;
    await act(async () => {
      cerrada = await result.current.salir();
    });
    expect(cerrada).toBe(true);
    await vueltas();
    expect(fetchSimulado()).not.toHaveBeenCalled();
  });
});

describe('useAuth: renovación periódica de sesiones sin refreshToken', () => {
  afterEach(async () => {
    // Lección de GP-02: desmontar y correr lo pendiente con los temporizadores falsos antes de
    // volver a los reales.
    await cleanup();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('cada 10 minutos con la app activa pide /api/auth/refresh y guarda el token nuevo', async () => {
    jest.useFakeTimers();
    const sesion = sesionClasica();
    await guardar(sesion);
    servidor((llamada) =>
      llamada.ruta === '/api/auth/refresh' ? respuesta({ token: 'token-ficticio-periodico' }) : respuesta(perfil()),
    );
    const { result } = await montar();
    await waitFor(() => expect(result.current.estado).toBe('autenticado'));
    await waitFor(() => expect(llamadasA('/api/auth/me')).toHaveLength(1));
    expect(llamadasA('/api/auth/refresh')).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(10 * MINUTO);
    });
    await waitFor(() => expect(llamadasA('/api/auth/refresh')).toHaveLength(1));
    expect(llamadasA('/api/auth/refresh')[0].auth).toBe(`Bearer ${sesion.token}`);
    await waitFor(() => expect(sesionEnAlmacen()?.token).toBe('token-ficticio-periodico'));
  });
});

describe('useAuth fuera de AuthProvider', () => {
  it('lanza un error claro', async () => {
    const espiaError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(renderHook(() => useAuth())).rejects.toThrow('useAuth debe usarse dentro de AuthProvider.');
    } finally {
      espiaError.mockRestore();
    }
  });
});
