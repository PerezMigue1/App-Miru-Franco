/// <reference types="jest" />

import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { createHash } from 'node:crypto';

import { ErrorRolNoPermitido } from '@/features/auth/models/AuthModel';
import { ErrorInicioGoogle } from '@/features/auth/models/googleAuth';
import { AuthProvider, useAuth } from '@/features/auth/viewmodels/useAuth';
import { useGoogleViewModel } from '@/features/auth/viewmodels/useGoogleViewModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';

import { espiarConsola } from '../../helpers/consola';
import { CLAVE, CORREO, USUARIO } from '../../helpers/datosClienta';
import {
  CODIGO_GOOGLE,
  REGRESO_CON_ERROR,
  REGRESO_GOOGLE,
  SESION_GOOGLE,
  abrirSesionSimulada,
  bytesFijos,
  canjeExitoso,
  navegadorRegresa,
  navegadorSeCierra,
  regresoConCodigo,
  rutaCanje,
} from '../../helpers/google';
import { jwtFicticio, sesionGuardada } from '../../helpers/sesionGuardada';
import { API, llamadasA, respuesta } from '../../helpers/servidorSimulado';
import {
  diferida,
  errorServidor,
  servidorVm,
  sinRed,
  type LlamadaVm,
  type ManejadorVm,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-05.3, inicio de sesión con Google (caja blanca con renderHook): useGoogleViewModel montado
 * junto con useAuth dentro del AuthProvider real, y useAuth.ingresarConGoogle con pedirCodigoGoogle,
 * el canje con PKCE, /api/auth/me con el token emitido, guardarSesionNueva y la revocación de la
 * sesión emitida que no se guarda. Solo se simulan fetch (servidor en http://api.test), expo-crypto
 * (bytes fijos y el SHA-256 real de Node), expo-web-browser y expo-device; apiClient, tokenStorage,
 * authService y googleAuth son los reales. La consola no debe recibir nada: así el code, el
 * verifier y los tokens nunca se escriben ahí.
 */

jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());
// Sin modelo de teléfono: el canje no lleva `dispositivo` y su cuerpo se compara completo.
jest.mock('expo-device', () => ({ modelName: null }));

const RUTA_CANJE = '/api/auth/exchange-code';
const RUTA_ME = '/api/auth/me';
const RUTA_LOGOUT = '/api/auth/logout';
const RUTA_RENOVAR = '/api/auth/movil/renovar';
const MENSAJE_GOOGLE = 'No pudimos iniciar sesión con Google. Inténtalo de nuevo.';
const MENSAJE_ROL = new ErrorRolNoPermitido().message;
/** Mensaje técnico que el servidor nunca debe mostrarle a la clienta. */
const MENSAJE_TECNICO = 'PrismaClientKnownRequestError: fallo interno ficticio';

/** Par PKCE esperado, calculado aparte con Node a partir de los bytes fijos del mock (32 bytes). */
const VERIFIER = Buffer.from(bytesFijos(32)).toString('base64url');
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

/** Revocación que se espera de la sesión emitida por el canje y no guardada. */
const REVOCACION_GOOGLE = [
  `Bearer ${SESION_GOOGLE.token}`,
  { logoutAll: false, refreshToken: SESION_GOOGLE.refreshToken },
];

/** Servidor con el canje exitoso, /me de la clienta y /logout; `cambios` reemplaza rutas. */
function servidorGoogle(cambios: Record<string, ManejadorVm> = {}): LlamadaVm[] {
  return servidorVm({
    ...rutaCanje(),
    [`GET ${RUTA_ME}`]: () => respuesta({ data: USUARIO }),
    [`POST ${RUTA_LOGOUT}`]: () => respuesta({ success: true }),
    ...cambios,
  });
}

/** El navegador queda abierto hasta que la prueba lo suelta con un resultado. */
function navegadorPendiente(): (resultado: { type: string; url?: string }) => void {
  let soltar: (resultado: unknown) => void = () => undefined;
  abrirSesionSimulada().mockReturnValueOnce(
    new Promise((resolver) => {
      soltar = resolver;
    }),
  );
  return (resultado) => soltar(resultado);
}

/** Monta useAuth y useGoogleViewModel en el mismo hook y espera a que no haya sesión guardada. */
async function montar() {
  const vista = await renderHook(() => ({ auth: useAuth(), vm: useGoogleViewModel() }), {
    wrapper: AuthProvider,
  });
  await waitFor(() => expect(vista.result.current.auth.estado).toBe('anonimo'));
  return vista.result;
}

type Resultado = Awaited<ReturnType<typeof montar>>;

/** Toca "Continuar con Google" y espera a que termine la carga. */
async function tocarGoogle(result: Resultado): Promise<void> {
  await act(async () => {
    result.current.vm.entrar();
  });
  await waitFor(() => expect(result.current.vm.abriendo).toBe(false));
}

/** Llama a ingresarConGoogle directamente y devuelve lo que resolvió o lo que lanzó. */
async function ingresarDirecto(result: Resultado): Promise<{ valor: boolean } | { error: unknown }> {
  let salida: { valor: boolean } | { error: unknown } = { error: null };
  await act(async () => {
    try {
      salida = { valor: await result.current.auth.ingresarConGoogle() };
    } catch (error) {
      salida = { error };
    }
  });
  return salida;
}

/** Revocaciones enviadas: [Authorization, cuerpo] de cada POST /api/auth/logout. */
function revocaciones(llamadas: LlamadaVm[]): unknown[][] {
  return llamadasA(llamadas, 'POST', RUTA_LOGOUT).map((l) => [l.cabeceras.Authorization, l.cuerpo]);
}

/** Sin sesión en memoria ni en SecureStore, y sin ninguna renovación. */
function revisarSinSesion(result: Resultado, llamadas: LlamadaVm[]): void {
  expect(result.current.auth.estado).toBe('anonimo');
  expect(result.current.auth.usuario).toBeNull();
  expect(sesionGuardada()).toBeNull();
  expect(llamadasA(llamadas, 'POST', RUTA_RENOVAR)).toHaveLength(0);
}

const consolas = ['log', 'info', 'debug'] as const;
let espiasConsola: jest.SpyInstance[] = [];

// console.error y console.warn: espiarConsola revisa que ninguna prueba escriba nada.
espiarConsola(async () => {
  await cleanup();
}, true);

beforeEach(() => {
  abrirSesionSimulada().mockReset();
  abrirSesionSimulada().mockResolvedValue({ type: 'cancel' });
  espiasConsola = consolas.map((metodo) => jest.spyOn(console, metodo));
});

afterEach(() => {
  try {
    for (const espia of espiasConsola) {
      expect(espia).not.toHaveBeenCalled();
    }
  } finally {
    espiasConsola.forEach((espia) => espia.mockRestore());
  }
});

describe('useGoogleViewModel: la clienta entra con Google', () => {
  it('abre Google con el challenge, canjea con su verifier, pide /me con el token y guarda la sesión móvil', async () => {
    const llamadas = servidorGoogle();
    navegadorRegresa(regresoConCodigo());
    const result = await montar();
    expect(result.current.vm).toMatchObject({ abriendo: false, error: null });

    await tocarGoogle(result);
    await waitFor(() => expect(result.current.auth.estado).toBe('autenticado'));

    expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1);
    expect(abrirSesionSimulada()).toHaveBeenCalledWith(
      `${API}/api/auth/google?origen=app&code_challenge=${CHALLENGE}`,
      REGRESO_GOOGLE,
    );
    expect(llamadas.map((l) => [l.metodo, l.ruta])).toEqual([
      ['POST', RUTA_CANJE],
      ['GET', RUTA_ME],
    ]);
    const [canje, perfil] = llamadas;
    expect(canje.cuerpo).toEqual({ code: CODIGO_GOOGLE, code_verifier: VERIFIER, canal: 'movil' });
    // El canje es público: no lleva ningún Bearer.
    expect(canje.cabeceras.Authorization).toBeUndefined();
    expect(perfil.cabeceras.Authorization).toBe(`Bearer ${SESION_GOOGLE.token}`);

    expect(result.current.auth.usuario).toEqual({ ...USUARIO, id: String(USUARIO.id) });
    expect(sesionGuardada()).toEqual({
      token: SESION_GOOGLE.token,
      refreshToken: SESION_GOOGLE.refreshToken,
      refreshExpiraEn: Date.parse(SESION_GOOGLE.refreshExpiraEn),
      emitidoEn: expect.any(Number),
      usuario: { ...USUARIO, id: String(USUARIO.id) },
    });
    expect(result.current.vm).toMatchObject({ abriendo: false, error: null });
    expect(revocaciones(llamadas)).toEqual([]);
  });

  it('doble toque: abre Google una sola vez, ignora otro toque mientras abre y al volver entra', async () => {
    const llamadas = servidorGoogle();
    const soltar = navegadorPendiente();
    const result = await montar();

    await act(async () => {
      result.current.vm.entrar();
      result.current.vm.entrar();
    });
    await waitFor(() => expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1));
    expect(result.current.vm.abriendo).toBe(true);

    // Con abriendo en true, entrar() ni siquiera llega al candado.
    await act(async () => {
      result.current.vm.entrar();
    });
    expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1);

    await act(async () => {
      soltar({ type: 'success', url: regresoConCodigo() });
    });
    await waitFor(() => expect(result.current.vm.abriendo).toBe(false));
    expect(result.current.auth.estado).toBe('autenticado');
    expect(result.current.vm.error).toBeNull();
    expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1);
    expect(llamadasA(llamadas, 'POST', RUTA_CANJE)).toHaveLength(1);
  });

  it('limpiarError quita el mensaje y un nuevo intento empieza sin el error anterior', async () => {
    servidorGoogle();
    navegadorRegresa(REGRESO_CON_ERROR);
    navegadorRegresa(REGRESO_CON_ERROR);
    const result = await montar();

    await tocarGoogle(result);
    expect(result.current.vm.error).toBe(MENSAJE_GOOGLE);
    await act(async () => {
      result.current.vm.limpiarError();
    });
    expect(result.current.vm.error).toBeNull();

    await tocarGoogle(result);
    expect(result.current.vm.error).toBe(MENSAJE_GOOGLE);
    const soltar = navegadorPendiente();
    await act(async () => {
      result.current.vm.entrar();
    });
    expect(result.current.vm).toMatchObject({ abriendo: true, error: null });

    await act(async () => {
      soltar({ type: 'cancel' });
    });
    await waitFor(() => expect(result.current.vm.abriendo).toBe(false));
    expect(result.current.vm.error).toBeNull();
  });
});

// ── Intentos que no entran ───────────────────────────────────────────────────────────────────

interface Fallo {
  /** Programa el navegador (y lo que haga falta) para un intento. */
  preparar: () => void;
  rutas?: Record<string, ManejadorVm>;
  /** Mensaje que muestra el viewmodel (null: cancelar o cerrar no muestra nada). */
  mensaje: string | null;
  /** Lo que lanza ingresarConGoogle (null: resuelve false). */
  lanza: (abstract new (...args: never[]) => Error) | null;
  /** Llamadas al canje. */
  canjes: 0 | 1;
  /** La sesión emitida por el canje se revoca en el servidor. */
  revoca: boolean;
}

type ClaseError = Fallo['lanza'];

const conCodigo = () => {
  navegadorRegresa(regresoConCodigo());
};

/** Falla en el navegador: no se canjea nada. Sin clase de error es cancelar o cerrar (sin mensaje). */
function enNavegador(preparar: () => void, lanza: ClaseError = ErrorInicioGoogle): Fallo {
  return { preparar, mensaje: lanza ? MENSAJE_GOOGLE : null, lanza, canjes: 0, revoca: false };
}

/** Falla en el canje: no hay sesión emitida que revocar. */
function enCanje(salida: ManejadorVm, lanza: ClaseError, mensaje = MENSAJE_GOOGLE): Fallo {
  const rutas = { [`POST ${RUTA_CANJE}`]: salida };
  return { preparar: conCodigo, rutas, mensaje, lanza, canjes: 1, revoca: false };
}

/** Falla después del canje (/me, rol o SecureStore): la sesión emitida se revoca. */
function trasCanje(salidaMe: ManejadorVm, lanza: ClaseError, mensaje = MENSAJE_GOOGLE): Fallo {
  const rutas = { [`GET ${RUTA_ME}`]: salidaMe };
  return { preparar: conCodigo, rutas, mensaje, lanza, canjes: 1, revoca: true };
}

const meDeLaClienta: ManejadorVm = () => respuesta({ data: USUARIO });
const meConRol = (rol: string): ManejadorVm => () => respuesta({ data: { ...USUARIO, rol } });

const FALLOS: [string, Fallo][] = [
  ['la clienta cancela el navegador', enNavegador(() => navegadorSeCierra('cancel'), null)],
  ['Android cierra el navegador (dismiss)', enNavegador(() => navegadorSeCierra('dismiss'), null)],
  ['el regreso trae error', enNavegador(() => navegadorRegresa(REGRESO_CON_ERROR))],
  ['el navegador regresa a una URL ajena', enNavegador(() => navegadorRegresa(`https://ajeno.test/auth/callback?code=${CODIGO_GOOGLE}`))],
  ['el navegador responde un tipo inesperado (locked)', enNavegador(() => abrirSesionSimulada().mockResolvedValueOnce({ type: 'locked' }))],
  ['openAuthSessionAsync lanza', enNavegador(() => abrirSesionSimulada().mockRejectedValueOnce(new Error(MENSAJE_TECNICO)))],
  ['el canje responde 400', enCanje(() => errorServidor(400, MENSAJE_TECNICO, 'CODIGO_INVALIDO'), ApiError)],
  ['el canje responde 401', enCanje(() => errorServidor(401, MENSAJE_TECNICO), ApiError)],
  // GP-07.6: sin red se dice sin conexión (mensajeParaClienta), no el mensaje general de Google.
  ['el canje se queda sin red', enCanje(sinRed, ErrorDeRed, MENSAJE_SIN_CONEXION)],
  ['el canje no trae token', enCanje(() => canjeExitoso({ token: '', refreshToken: SESION_GOOGLE.refreshToken }), ApiError)],
  ['/me responde 401', trasCanje(() => errorServidor(401, MENSAJE_TECNICO), ApiError)],
  ['/me responde 500', trasCanje(() => errorServidor(500, MENSAJE_TECNICO), ApiError)],
  ['/me se queda sin red', trasCanje(sinRed, ErrorDeRed, MENSAJE_SIN_CONEXION)],
  ['/me no trae usuario', trasCanje(() => respuesta({ success: true }), ErrorInicioGoogle)],
  ['/me trae un usuario sin id', trasCanje(() => respuesta({ data: { ...USUARIO, id: '' } }), ErrorInicioGoogle)],
  [
    'SecureStore no puede guardar la sesión',
    {
      ...trasCanje(meDeLaClienta, Error),
      preparar: () => {
        conCodigo();
        jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error(MENSAJE_TECNICO));
      },
    },
  ],
  // Cuenta que no es de clienta: el mismo aviso que el login con correo.
  ['la cuenta es de administradora', trasCanje(meConRol('administrador'), ErrorRolNoPermitido, MENSAJE_ROL)],
  ['la cuenta es de estilista', trasCanje(meConRol('estilista'), ErrorRolNoPermitido, MENSAJE_ROL)],
];

/** Monta con el servidor y el navegador del caso, y devuelve el resultado y las llamadas. */
async function montarFallo(fallo: Fallo): Promise<{ result: Resultado; llamadas: LlamadaVm[] }> {
  const llamadas = servidorGoogle(fallo.rutas);
  fallo.preparar();
  return { result: await montar(), llamadas };
}

/** Lo común después de un intento que no entra: sin sesión, canjes y revocación esperados. */
async function revisarIntentoFallido(result: Resultado, llamadas: LlamadaVm[], fallo: Fallo): Promise<void> {
  revisarSinSesion(result, llamadas);
  expect(llamadasA(llamadas, 'POST', RUTA_CANJE)).toHaveLength(fallo.canjes);
  await waitFor(() => expect(revocaciones(llamadas)).toEqual(fallo.revoca ? [REVOCACION_GOOGLE] : []));
}

describe('useGoogleViewModel: intentos que no entran', () => {
  it.each(FALLOS)('%s: no entra, deja el mensaje esperado y ninguna sesión', async (_caso, fallo) => {
    const { result, llamadas } = await montarFallo(fallo);

    await tocarGoogle(result);

    expect(result.current.vm).toMatchObject({ abriendo: false, error: fallo.mensaje });
    expect(result.current.vm.error ?? '').not.toContain(MENSAJE_TECNICO);
    await revisarIntentoFallido(result, llamadas, fallo);
  });
});

describe('useAuth.ingresarConGoogle: lo que devuelve o lanza', () => {
  it('devuelve true cuando la clienta entra', async () => {
    servidorGoogle();
    navegadorRegresa(regresoConCodigo());
    const result = await montar();
    expect(await ingresarDirecto(result)).toEqual({ valor: true });
    expect(result.current.auth.estado).toBe('autenticado');
  });

  it('un canje sin refreshToken guarda la sesión sin refreshToken ni vencimiento', async () => {
    servidorGoogle(rutaCanje(() => canjeExitoso({ token: SESION_GOOGLE.token, refreshExpiraEn: SESION_GOOGLE.refreshExpiraEn })));
    navegadorRegresa(regresoConCodigo());
    const result = await montar();
    expect(await ingresarDirecto(result)).toEqual({ valor: true });
    expect(sesionGuardada()).toEqual({
      token: SESION_GOOGLE.token,
      emitidoEn: expect.any(Number),
      usuario: { ...USUARIO, id: String(USUARIO.id) },
    });
  });

  it.each(FALLOS)('%s', async (_caso, fallo) => {
    const { result, llamadas } = await montarFallo(fallo);
    const esperado = fallo.lanza ? { error: expect.any(fallo.lanza) } : { valor: false };

    expect(await ingresarDirecto(result)).toEqual(esperado);
    await revisarIntentoFallido(result, llamadas, fallo);
  });
});

describe('useAuth.ingresarConGoogle: otra sesión gana mientras se canjea', () => {
  const SESION_CORREO = { token: jwtFicticio('clienta-correo'), refreshToken: 'refresh-ficticio-correo' };

  it.each<[string, (auth: Resultado['current']['auth']) => Promise<unknown>, string | null]>([
    ['la clienta inicia sesión con correo', (auth) => auth.ingresar(CORREO, CLAVE), SESION_CORREO.token],
    ['la clienta cierra sesión', (auth) => auth.salir(), null],
  ])('%s: la sesión de Google no se guarda, devuelve false y se revoca', async (_caso, ganar, tokenFinal) => {
    const espera = diferida();
    const llamadas = servidorGoogle({
      [`POST ${RUTA_CANJE}`]: () => espera.promesa,
      'POST /api/auth/login': () => respuesta({ success: true, ...SESION_CORREO, usuario: USUARIO }),
    });
    navegadorRegresa(regresoConCodigo());
    const result = await montar();

    let intento: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      intento = result.current.auth.ingresarConGoogle();
    });
    await waitFor(() => expect(llamadasA(llamadas, 'POST', RUTA_CANJE)).toHaveLength(1));
    await act(async () => {
      await ganar(result.current.auth);
    });

    let valor: boolean | null = null;
    await act(async () => {
      espera.soltar(canjeExitoso());
      valor = await intento;
    });

    expect(valor).toBe(false);
    await waitFor(() => expect(revocaciones(llamadas)).toEqual([REVOCACION_GOOGLE]));
    expect(sesionGuardada()?.token ?? null).toBe(tokenFinal);
    expect(result.current.auth.usuario?.email ?? null).toBe(tokenFinal ? CORREO : null);
  });
});
