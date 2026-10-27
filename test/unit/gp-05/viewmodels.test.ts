/// <reference types="jest" />

import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { openBrowserAsync } from 'expo-web-browser';
import { createElement, type ReactNode } from 'react';
import { BackHandler } from 'react-native';

import { ERROR_TELEFONO, type PreguntaSeguridad } from '@/features/auth/models/AuthModel';
import { useActivarViewModel } from '@/features/auth/viewmodels/useActivarViewModel';
import { AuthProvider, useAuth } from '@/features/auth/viewmodels/useAuth';
import { useBienvenida } from '@/features/auth/viewmodels/useBienvenida';
import { useLoginViewModel } from '@/features/auth/viewmodels/useLoginViewModel';
import { useRecuperarViewModel } from '@/features/auth/viewmodels/useRecuperarViewModel';
import {
  useRegistroViewModel,
  type CampoRegistro,
  type CamposRegistro,
  type RegistroViewModel,
} from '@/features/auth/viewmodels/useRegistroViewModel';
import {
  SesionRequeridaProvider,
  useDescartarPendiente,
  useRequiereSesion,
} from '@/features/auth/viewmodels/useRequiereSesion';
import {
  rutaAcceso,
  useRetornoActivacion,
  type RutaAcceso,
} from '@/features/auth/viewmodels/useRetornoActivacion';
import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { leerSecureStore } from '../../helpers/secureStore';

// GP-07.6: los textos de error salen de shared/api/mensajesError (claves errores.* del catálogo).
const MENSAJE_DEMASIADOS_INTENTOS = RESPALDO_TEXTOS['errores.demasiadasSolicitudes'];

/**
 * GP-05, viewmodels de autenticación (caja blanca con renderHook): acceso, registro en dos pasos,
 * activación, recuperación, regreso de la activación, sesión requerida y bienvenida. Solo se
 * simulan fetch (servidor en http://api.test), la navegación de expo-router, el navegador del
 * sistema y la hoja de acceso (vista). apiClient, tokenStorage, authService y AuthProvider son los
 * reales.
 */

// ── Simulaciones de módulos ──────────────────────────────────────────────────────────────────

/** Router simulado: las mismas funciones en cada render. */
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  dismissTo: jest.fn(),
};

/** Ruta actual y parámetros de búsqueda que devuelve el expo-router simulado. */
const mockNavegacion: { ruta: string; params: Record<string, unknown> } = { ruta: '/login', params: {} };

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => mockRouter,
    usePathname: () => mockNavegacion.ruta,
    useLocalSearchParams: () => mockNavegacion.params,
    // La pantalla se da por enfocada mientras está montada.
    useFocusEffect: (efecto: () => void | (() => void)) => {
      useEffect(() => efecto(), [efecto]);
    },
  };
});

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })),
  openAuthSessionAsync: jest.fn(),
  WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss', OPENED: 'opened', LOCKED: 'locked' },
}));

/** Props de la hoja "Inicia sesión para continuar" en el último render (la vista no se prueba aquí). */
interface PropsHoja {
  visible: boolean;
  onCerrar: () => void;
  onIniciarSesion: () => void;
  onCrearCuenta: () => void;
}

const mockHoja: { props: PropsHoja | null } = { props: null };

jest.mock('@/features/auth/components/HojaAcceso', () => ({
  HojaAcceso: (props: PropsHoja) => {
    mockHoja.props = props;
    return null;
  },
}));

// ── Servidor simulado ────────────────────────────────────────────────────────────────────────

const API = 'http://api.test';
const URL_LOGIN = `${API}/api/auth/login`;
const URL_LOGOUT = `${API}/api/auth/logout`;
const URL_VERIFICAR_CORREO = `${API}/api/auth/verificar-correo`;
const URL_REGISTRO = `${API}/api/usuarios/registro`;
const URL_PREGUNTAS = `${API}/api/pregunta-seguridad`;
const URL_VERIFICAR_OTP = `${API}/api/auth/verificar-otp`;
const URL_REENVIAR = `${API}/api/auth/reenviar-codigo`;
const URL_RECUPERAR = `${API}/api/auth/solicitar-enlace-recuperacion`;

const CORREO = 'clienta@ejemplo.test';
const CLAVE = 'ClaveFicticia1!';
const TOKEN = 'token-ficticio';
const REFRESH = 'refresh-ficticio';
/** Mensaje técnico que el servidor nunca debe mostrarle a la clienta. */
const MENSAJE_TECNICO = 'PrismaClientKnownRequestError: fallo interno ficticio';

type LlamadaFetch = [string, RequestInit];

/** Respuesta mínima con lo que lee apiClient (ok, status y text()). */
function respuesta(cuerpo: unknown, status = 200): Response {
  const textoCuerpo = JSON.stringify(cuerpo);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: () => Promise.resolve(textoCuerpo),
    json: () => Promise.resolve(JSON.parse(textoCuerpo) as unknown),
  } as unknown as Response;
}

/** Lo que responde una ruta: un cuerpo, sin red o una respuesta que la prueba suelta cuando quiere. */
type Salida = { cuerpo: unknown; status?: number } | { sinRed: true } | { espera: Promise<Response> };

/**
 * Instala un fetch simulado que responde por URL. Con una lista, cada llamada toma la siguiente
 * salida y la última se repite. Cualquier otra URL es un 404.
 */
function servidor(rutas: Record<string, Salida | Salida[]>): jest.Mock {
  const pendientes = new Map<string, Salida[]>();
  for (const [url, salida] of Object.entries(rutas)) {
    pendientes.set(url, Array.isArray(salida) ? [...salida] : [salida]);
  }
  const simulado = jest.fn((url: string) => {
    const lista = pendientes.get(url);
    if (!lista || lista.length === 0) {
      return Promise.resolve(respuesta({ message: 'No encontrado' }, 404));
    }
    const salida = lista.length > 1 ? (lista.shift() as Salida) : lista[0];
    if ('sinRed' in salida) {
      return Promise.reject(new TypeError('Network request failed'));
    }
    if ('espera' in salida) {
      return salida.espera;
    }
    return Promise.resolve(respuesta(salida.cuerpo, salida.status ?? 200));
  });
  globalThis.fetch = simulado as unknown as typeof fetch;
  return simulado;
}

function llamadasA(simulado: jest.Mock, url: string): LlamadaFetch[] {
  return (simulado.mock.calls as unknown as LlamadaFetch[]).filter(([u]) => u === url);
}

function cuerpoDe(llamada: LlamadaFetch): unknown {
  return JSON.parse(String(llamada[1].body));
}

/** Promesa que la prueba resuelve cuando quiere (para ver el estado de carga). */
function diferida(): { promesa: Promise<Response>; resolver: (r: Response) => void } {
  let resolver: (r: Response) => void = () => undefined;
  const promesa = new Promise<Response>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

/** Respuesta 200 de POST /api/auth/login con canal "movil". */
function cuerpoLogin(rol = 'cliente'): Record<string, unknown> {
  return {
    success: true,
    token: TOKEN,
    refreshToken: REFRESH,
    refreshExpiraEn: Date.now() + 30 * 24 * 60 * 60 * 1000,
    usuario: { id: 7, nombre: 'Clienta Ficticia', email: CORREO, rol },
  };
}

function ConSesion({ children }: { children: ReactNode }) {
  return createElement(AuthProvider, null, children);
}

function ConSesionRequerida({ children }: { children: ReactNode }) {
  return createElement(AuthProvider, null, createElement(SesionRequeridaProvider, null, children));
}

/** Desmonta, corre lo pendiente con los temporizadores falsos y vuelve a los reales (ver GP-02). */
async function cerrarTemporizadores(): Promise<void> {
  await cleanup();
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
}

beforeEach(() => {
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.back.mockClear();
  mockRouter.dismissTo.mockClear();
  mockRouter.canGoBack.mockReset();
  mockRouter.canGoBack.mockImplementation(() => true);
  mockNavegacion.ruta = '/login';
  mockNavegacion.params = {};
  mockHoja.props = null;
  jest.mocked(openBrowserAsync).mockClear();
});

// ── useLoginViewModel ────────────────────────────────────────────────────────────────────────

describe('useLoginViewModel', () => {
  async function montarLogin() {
    const vista = await renderHook(() => ({ vm: useLoginViewModel(), auth: useAuth() }), {
      wrapper: ConSesion,
    });
    await waitFor(() => expect(vista.result.current.auth.estado).toBe('anonimo'));
    return vista;
  }

  async function escribir(
    result: { current: { vm: ReturnType<typeof useLoginViewModel> } },
    correo: string,
    clave: string,
  ) {
    await act(async () => {
      result.current.vm.setCorreo(correo);
    });
    await act(async () => {
      result.current.vm.setClave(clave);
    });
  }

  it('sin datos marca los dos campos como requeridos y no llama al servidor', async () => {
    const simulado = servidor({});
    const { result } = await montarLogin();

    await act(async () => {
      result.current.vm.entrar();
    });

    expect(result.current.vm.errores).toEqual({
      correo: 'El correo electrónico es requerido',
      clave: 'La contraseña es requerida',
    });
    expect(result.current.vm.errorGeneral).toBeNull();
    expect(result.current.vm.cargando).toBe(false);
    expect(simulado).not.toHaveBeenCalled();
  });

  it('un correo inválido se marca al salir del campo y luego se revalida en cada cambio', async () => {
    servidor({});
    const { result } = await montarLogin();

    await act(async () => {
      result.current.vm.setCorreo('clienta@');
    });
    // Antes de salir del campo no hay error.
    expect(result.current.vm.errores.correo).toBeNull();

    await act(async () => {
      result.current.vm.salirCorreo();
    });
    expect(result.current.vm.errores.correo).toBe('El correo electrónico no es válido');

    await act(async () => {
      result.current.vm.setCorreo(CORREO);
    });
    expect(result.current.vm.errores.correo).toBeNull();
  });

  it('con credenciales válidas inicia sesión, guarda la sesión y no navega', async () => {
    const simulado = servidor({ [URL_LOGIN]: { cuerpo: cuerpoLogin() } });
    const { result } = await montarLogin();
    await escribir(result, '  Clienta@Ejemplo.TEST ', CLAVE);

    await act(async () => {
      result.current.vm.entrar();
    });
    await waitFor(() => expect(result.current.auth.estado).toBe('autenticado'));

    const [login] = llamadasA(simulado, URL_LOGIN);
    expect(login[1].method).toBe('POST');
    expect(cuerpoDe(login)).toEqual(
      expect.objectContaining({ email: CORREO, password: CLAVE, canal: 'movil' }),
    );
    expect(result.current.auth.usuario).toEqual({
      id: '7',
      nombre: 'Clienta Ficticia',
      email: CORREO,
      rol: 'cliente',
    });
    const guardada = JSON.parse(leerSecureStore().auth_sesion) as Record<string, unknown>;
    expect(guardada.token).toBe(TOKEN);
    expect(guardada.refreshToken).toBe(REFRESH);
    expect(result.current.vm.errorGeneral).toBeNull();
    expect(result.current.vm.cargando).toBe(false);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('muestra el estado de carga e ignora un segundo envío mientras espera', async () => {
    const pendiente = diferida();
    const simulado = servidor({ [URL_LOGIN]: { espera: pendiente.promesa } });
    const { result } = await montarLogin();
    await escribir(result, CORREO, CLAVE);

    await act(async () => {
      result.current.vm.entrar();
    });
    expect(result.current.vm.cargando).toBe(true);

    await act(async () => {
      result.current.vm.entrar();
    });
    expect(llamadasA(simulado, URL_LOGIN)).toHaveLength(1);

    await act(async () => {
      pendiente.resolver(respuesta({ message: 'Unauthorized' }, 401));
    });
    await waitFor(() => expect(result.current.vm.cargando).toBe(false));
    expect(result.current.vm.errorGeneral).toBe('Correo o contraseña incorrectos');
  });

  it.each([
    ['401', { cuerpo: { message: 'Unauthorized' }, status: 401 }, 'Correo o contraseña incorrectos'],
    ['429', { cuerpo: { message: 'ThrottlerException: Too Many Requests' }, status: 429 }, MENSAJE_DEMASIADOS_INTENTOS],
    ['500', { cuerpo: { message: MENSAJE_TECNICO }, status: 500 }, 'No pudimos iniciar sesión. Intenta de nuevo.'],
    ['sin red', { sinRed: true }, MENSAJE_SIN_CONEXION],
  ] as [string, Salida, string][])('error %s: muestra un mensaje para la clienta', async (_caso, salida, esperado) => {
    servidor({ [URL_LOGIN]: salida });
    const { result } = await montarLogin();
    await escribir(result, CORREO, CLAVE);

    await act(async () => {
      result.current.vm.entrar();
    });

    await waitFor(() => expect(result.current.vm.errorGeneral).toBe(esperado));
    expect(result.current.vm.cargando).toBe(false);
    expect(result.current.auth.estado).toBe('anonimo');
    expect(leerSecureStore().auth_sesion).toBeUndefined();
  });

  // GP-07.6: el texto del servidor (que trae los minutos) ya no se muestra; el backend no manda code.
  it('un 403 de bloqueo temporal muestra el aviso propio, sin el texto del servidor', async () => {
    const delServidor = 'Tu cuenta está bloqueada temporalmente. Intenta en 15 minutos.';
    const aviso =
      'Tu cuenta está bloqueada temporalmente por varios intentos fallidos. Espera unos minutos e intenta de nuevo.';
    servidor({ [URL_LOGIN]: { cuerpo: { message: delServidor }, status: 403 } });
    const { result } = await montarLogin();
    await escribir(result, CORREO, CLAVE);

    await act(async () => {
      result.current.vm.entrar();
    });

    await waitFor(() => expect(result.current.vm.errorGeneral).toBe(aviso));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('una respuesta 200 sin token no crea sesión ni muestra el texto técnico', async () => {
    servidor({ [URL_LOGIN]: { cuerpo: { success: true, usuario: cuerpoLogin().usuario } } });
    const { result } = await montarLogin();
    await escribir(result, CORREO, CLAVE);

    await act(async () => {
      result.current.vm.entrar();
    });

    await waitFor(() =>
      expect(result.current.vm.errorGeneral).toBe('No pudimos iniciar sesión. Intenta de nuevo.'),
    );
    expect(result.current.auth.estado).toBe('anonimo');
    expect(leerSecureStore().auth_sesion).toBeUndefined();
  });

  it('una cuenta que no es de clienta no se guarda, se revoca y avisa que use el sitio web', async () => {
    const simulado = servidor({
      [URL_LOGIN]: { cuerpo: cuerpoLogin('administrador') },
      [URL_LOGOUT]: { cuerpo: { success: true } },
    });
    const { result } = await montarLogin();
    await escribir(result, CORREO, CLAVE);

    await act(async () => {
      result.current.vm.entrar();
    });

    await waitFor(() =>
      expect(result.current.vm.errorGeneral).toBe('Esta app es para clientas. Usa el sitio web'),
    );
    await waitFor(() => expect(llamadasA(simulado, URL_LOGOUT)).toHaveLength(1));
    const [logout] = llamadasA(simulado, URL_LOGOUT);
    expect((logout[1].headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(result.current.auth.estado).toBe('anonimo');
    expect(leerSecureStore().auth_sesion).toBeUndefined();
  });

  it('cuenta sin activar: abre la activación con el correo y regresa a la misma pantalla de acceso', async () => {
    mockNavegacion.ruta = '/registro';
    servidor({
      [URL_LOGIN]: {
        cuerpo: { message: 'Tu cuenta no está activada. Revisa tu correo para activar tu cuenta.', code: 'CUENTA_NO_ACTIVADA' },
        status: 403,
      },
    });
    const { result } = await montarLogin();
    await escribir(result, ' CLIENTA@ejemplo.test', CLAVE);

    await act(async () => {
      result.current.vm.entrar();
    });

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/activar',
      params: { email: CORREO, volverA: '/registro' },
    });
    expect(result.current.vm.errorGeneral).toBeNull();
    expect(result.current.vm.cargando).toBe(false);
    expect(result.current.auth.estado).toBe('anonimo');
  });

  it('prepararAcceso deja solo el correo: sin contraseña ni errores', async () => {
    servidor({});
    const { result } = await montarLogin();
    await act(async () => {
      result.current.vm.entrar();
    });
    expect(result.current.vm.errores.correo).not.toBeNull();

    await act(async () => {
      result.current.vm.setClave(CLAVE);
    });
    await act(async () => {
      result.current.vm.prepararAcceso(CORREO);
    });

    expect(result.current.vm.correo).toBe(CORREO);
    expect(result.current.vm.clave).toBe('');
    expect(result.current.vm.errores).toEqual({ correo: null, clave: null });
    expect(result.current.vm.errorGeneral).toBeNull();

    // El correo ya no se revalida en vivo tras prepararAcceso.
    await act(async () => {
      result.current.vm.setCorreo('otro@');
    });
    expect(result.current.vm.errores.correo).toBeNull();
  });
});

// ── useRegistroViewModel ─────────────────────────────────────────────────────────────────────

const PREGUNTA: PreguntaSeguridad = { id: '1', pregunta: '¿Cuál fue el nombre de tu primera mascota?' };

const PASO_1_VALIDO: Partial<CamposRegistro> = {
  nombre: 'Clienta Ficticia',
  correo: CORREO,
  telefono: '5512345678',
  nacimiento: '15/04/1995',
  pregunta: PREGUNTA,
  respuesta: 'Respuesta ficticia',
  clave: CLAVE,
  confirmacion: CLAVE,
};

/** GP-09 (Ronda 5): versión y hash ficticios del texto de la autorización de datos sensibles. */
const AUTORIZACION = { version: '1.0', hash: 'e'.repeat(64) };

const PASO_2_VALIDO: Partial<CamposRegistro> = {
  tipoCabello: 'ondulado',
  tieneAlergias: false,
  tratamientosQuimicos: false,
  aceptaTerminos: true,
  aceptaAviso: true,
};

type ResultadoRegistro = { current: RegistroViewModel };

/** Un cambio por render: cambiar() arma los campos nuevos con los del render actual. */
async function cambiarCampo<K extends CampoRegistro>(
  result: ResultadoRegistro,
  campo: K,
  valor: CamposRegistro[K],
): Promise<void> {
  await act(async () => {
    result.current.cambiar(campo, valor);
  });
}

async function llenar(result: ResultadoRegistro, campos: Partial<CamposRegistro>): Promise<void> {
  for (const [campo, valor] of Object.entries(campos) as [CampoRegistro, CamposRegistro[CampoRegistro]][]) {
    await cambiarCampo(result, campo, valor);
  }
}

/** Llena el paso 1, pulsa "Continuar" con la respuesta neutral del correo y espera el paso 2. */
async function llegarAlPaso2(result: ResultadoRegistro): Promise<void> {
  await llenar(result, PASO_1_VALIDO);
  await act(async () => {
    result.current.continuar();
  });
  await waitFor(() => expect(result.current.paso).toBe(2));
}

describe('useRegistroViewModel', () => {
  // La verificación del correo usa una espera de 600 ms, límites de 6 s y reintentos: todo con
  // temporizadores falsos para que ningún disparo dependa de lo que tarde la prueba.
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(cerrarTemporizadores);

  describe('paso 1: Tu cuenta', () => {
    it('empieza vacío en el paso 1, sin errores ni carga', async () => {
      servidor({});
      const { result } = await renderHook(() => useRegistroViewModel());

      expect(result.current.paso).toBe(1);
      expect(result.current.campos.correo).toBe('');
      expect(result.current.errores).toEqual({});
      expect(result.current.errorGeneral).toBeNull();
      expect(result.current.cargando).toBe(false);
      expect(result.current.verificandoCorreo).toBe(false);
      expect(result.current.estadoCorreo).toBe('inactivo');
      expect(result.current.requisitosClave.every((r) => !r.cumplido)).toBe(true);
    });

    it('"Continuar" sin datos marca cada campo, pide el foco en el primero y no llama al servidor', async () => {
      const simulado = servidor({});
      const { result } = await renderHook(() => useRegistroViewModel());

      await act(async () => {
        result.current.continuar();
      });

      expect(result.current.paso).toBe(1);
      expect(result.current.errorGeneral).toBe('Revisa los campos marcados.');
      expect(result.current.errores).toEqual(
        expect.objectContaining({
          nombre: 'El nombre completo es requerido',
          correo: 'El correo electrónico es requerido',
          telefono: 'El teléfono es requerido',
          nacimiento: 'La fecha de nacimiento es requerida',
          pregunta: 'Debes seleccionar una pregunta de seguridad',
          respuesta: 'La respuesta a la pregunta de seguridad es requerida',
          clave: 'La contraseña es requerida',
          confirmacion: 'Confirma tu contraseña',
        }),
      );
      expect(result.current.enfoque).toEqual({ campo: 'nombre', vez: 1 });
      expect(simulado).not.toHaveBeenCalled();
    });

    it('valida cada campo al salir y, desde su primer error, en cada cambio', async () => {
      servidor({});
      const { result } = await renderHook(() => useRegistroViewModel());

      await cambiarCampo(result, 'nombre', 'A');
      expect(result.current.errores.nombre).toBeUndefined();
      await act(async () => {
        result.current.salir('nombre');
      });
      expect(result.current.errores.nombre).toBe('El nombre debe tener al menos 2 caracteres');
      await cambiarCampo(result, 'nombre', 'Clienta Ficticia');
      expect(result.current.errores.nombre).toBeNull();

      await cambiarCampo(result, 'nacimiento', '31/02/1995');
      await act(async () => {
        result.current.salir('nacimiento');
      });
      expect(result.current.errores.nacimiento).toBe('Escribe una fecha que exista');

      const anioMenor = new Date().getFullYear() - 10;
      await cambiarCampo(result, 'nacimiento', `01/01/${anioMenor}`);
      expect(result.current.errores.nacimiento).toBe('Debes ser mayor de 18 años');
    });

    it('la contraseña sigue las reglas del backend y muestra sus requisitos mientras se escribe', async () => {
      servidor({});
      const { result } = await renderHook(() => useRegistroViewModel());

      await cambiarCampo(result, 'clave', 'abc');
      expect(result.current.requisitosClave.find((r) => r.id === 'minuscula')?.cumplido).toBe(true);
      expect(result.current.requisitosClave.find((r) => r.id === 'largo')?.cumplido).toBe(false);
      await act(async () => {
        result.current.salir('clave');
      });
      expect(result.current.errores.clave).toBe('La contraseña debe tener al menos 8 caracteres');

      await cambiarCampo(result, 'clave', CLAVE);
      expect(result.current.errores.clave).toBeNull();
      expect(result.current.requisitosClave.every((r) => r.cumplido)).toBe(true);
    });

    it('avisa en cuanto la confirmación deja de coincidir con la contraseña', async () => {
      servidor({});
      const { result } = await renderHook(() => useRegistroViewModel());
      await cambiarCampo(result, 'clave', CLAVE);

      await cambiarCampo(result, 'confirmacion', 'Clave');
      expect(result.current.errores.confirmacion).toBeNull();

      await cambiarCampo(result, 'confirmacion', 'ClaveX');
      expect(result.current.errores.confirmacion).toBe('Las contraseñas no coinciden');

      await cambiarCampo(result, 'confirmacion', CLAVE);
      expect(result.current.errores.confirmacion).toBeNull();

      // Cambiar la contraseña después de confirmarla avisa en ese momento.
      await cambiarCampo(result, 'clave', 'OtraClaveFicticia2!');
      expect(result.current.errores.confirmacion).toBe('Las contraseñas no coinciden');
    });

    it('un teléfono pegado incompleto se marca al momento y la lada 52 se quita al salir', async () => {
      servidor({});
      const { result } = await renderHook(() => useRegistroViewModel());

      await cambiarCampo(result, 'telefono', '55123');
      expect(result.current.errores.telefono).toBe(ERROR_TELEFONO);

      await cambiarCampo(result, 'telefono', '525512345678');
      await act(async () => {
        result.current.salir('telefono');
      });
      expect(result.current.campos.telefono).toBe('5512345678');
      expect(result.current.errores.telefono).toBeNull();
    });

    it('con todo válido y la respuesta neutral del correo pasa al paso 2 sin darlo por disponible', async () => {
      // Sin sesión de admin el backend siempre responde así, tenga o no cuenta el correo.
      const simulado = servidor({
        [URL_VERIFICAR_CORREO]: {
          cuerpo: { existe: false, message: 'Comprobaremos el correo al crear la cuenta' },
        },
      });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llenar(result, PASO_1_VALIDO);

      await act(async () => {
        result.current.continuar();
      });
      await waitFor(() => expect(result.current.paso).toBe(2));

      expect(result.current.direccionPaso).toBe(1);
      expect(result.current.estadoCorreo).toBe('sinAviso');
      expect(result.current.verificandoCorreo).toBe(false);
      expect(result.current.errorGeneral).toBeNull();
      const [verificacion] = llamadasA(simulado, URL_VERIFICAR_CORREO);
      expect(cuerpoDe(verificacion)).toEqual({ correo: CORREO });
    });

    it('con un correo ya registrado no avanza y pide el foco en el correo', async () => {
      servidor({ [URL_VERIFICAR_CORREO]: { cuerpo: { existe: true } } });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llenar(result, PASO_1_VALIDO);

      await act(async () => {
        result.current.continuar();
      });
      await waitFor(() => expect(result.current.estadoCorreo).toBe('registrado'));
      await waitFor(() => expect(result.current.enfoque?.campo).toBe('correo'));

      expect(result.current.paso).toBe(1);
      expect(result.current.verificandoCorreo).toBe(false);
    });

    it('"Continuar" espera la verificación del correo con verificandoCorreo', async () => {
      const pendiente = diferida();
      servidor({ [URL_VERIFICAR_CORREO]: { espera: pendiente.promesa } });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llenar(result, PASO_1_VALIDO);

      await act(async () => {
        result.current.continuar();
      });
      expect(result.current.verificandoCorreo).toBe(true);
      expect(result.current.estadoCorreo).toBe('verificando');

      await act(async () => {
        pendiente.resolver(respuesta({ existe: false }));
      });
      await waitFor(() => expect(result.current.paso).toBe(2));
      expect(result.current.verificandoCorreo).toBe(false);
    });
  });

  describe('verificación del correo', () => {
    it('verifica 600 ms después de dejar de escribir', async () => {
      const simulado = servidor({ [URL_VERIFICAR_CORREO]: { cuerpo: { existe: false } } });
      const { result } = await renderHook(() => useRegistroViewModel());

      await cambiarCampo(result, 'correo', 'Clienta@Ejemplo.test');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(599);
      });
      expect(llamadasA(simulado, URL_VERIFICAR_CORREO)).toHaveLength(0);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(1);
      });
      await waitFor(() => expect(result.current.estadoCorreo).toBe('sinAviso'));
      const llamadas = llamadasA(simulado, URL_VERIFICAR_CORREO);
      expect(llamadas).toHaveLength(1);
      expect(cuerpoDe(llamadas[0])).toEqual({ correo: CORREO });
    });

    it('un correo inválido no se verifica', async () => {
      const simulado = servidor({ [URL_VERIFICAR_CORREO]: { cuerpo: { existe: false } } });
      const { result } = await renderHook(() => useRegistroViewModel());

      await cambiarCampo(result, 'correo', 'clienta@ejemplo');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });

      expect(simulado).not.toHaveBeenCalled();
      expect(result.current.estadoCorreo).toBe('inactivo');
    });

    it('sin red queda "sinConexion" y reintenta a los 5 s', async () => {
      const simulado = servidor({
        [URL_VERIFICAR_CORREO]: [{ sinRed: true }, { cuerpo: { existe: false } }],
      });
      const { result } = await renderHook(() => useRegistroViewModel());
      await cambiarCampo(result, 'correo', CORREO);

      await act(async () => {
        result.current.salir('correo');
      });
      await waitFor(() => expect(result.current.estadoCorreo).toBe('sinConexion'));
      expect(llamadasA(simulado, URL_VERIFICAR_CORREO)).toHaveLength(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(5000);
      });
      await waitFor(() => expect(result.current.estadoCorreo).toBe('sinAviso'));
      expect(llamadasA(simulado, URL_VERIFICAR_CORREO)).toHaveLength(2);
    });

    it('un 4xx no se reintenta: queda "sinVerificar" y no bloquea', async () => {
      const simulado = servidor({
        [URL_VERIFICAR_CORREO]: { cuerpo: { message: 'Too Many Requests' }, status: 429 },
      });
      const { result } = await renderHook(() => useRegistroViewModel());
      await cambiarCampo(result, 'correo', CORREO);

      await act(async () => {
        result.current.salir('correo');
      });
      await waitFor(() => expect(result.current.estadoCorreo).toBe('sinVerificar'));

      await act(async () => {
        await jest.advanceTimersByTimeAsync(40000);
      });
      expect(llamadasA(simulado, URL_VERIFICAR_CORREO)).toHaveLength(1);
      expect(result.current.estadoCorreo).toBe('sinVerificar');
    });
  });

  describe('preguntas de seguridad', () => {
    it('carga la lista una sola vez', async () => {
      const simulado = servidor({ [URL_PREGUNTAS]: { cuerpo: { success: true, data: [PREGUNTA] } } });
      const { result } = await renderHook(() => useRegistroViewModel());
      expect(result.current.preguntas.estado).toBe('inactivo');

      await act(async () => {
        result.current.preguntas.cargar();
      });
      await waitFor(() => expect(result.current.preguntas.estado).toBe('listo'));
      expect(result.current.preguntas.lista).toEqual([PREGUNTA]);

      await act(async () => {
        result.current.preguntas.cargar();
      });
      expect(llamadasA(simulado, URL_PREGUNTAS)).toHaveLength(1);
    });

    it('si falla queda en "error" y se puede volver a intentar', async () => {
      const simulado = servidor({
        [URL_PREGUNTAS]: [{ sinRed: true }, { cuerpo: { success: true, data: [PREGUNTA] } }],
      });
      const { result } = await renderHook(() => useRegistroViewModel());

      await act(async () => {
        result.current.preguntas.cargar();
      });
      await waitFor(() => expect(result.current.preguntas.estado).toBe('error'));

      await act(async () => {
        result.current.preguntas.cargar();
      });
      await waitFor(() => expect(result.current.preguntas.estado).toBe('listo'));
      expect(llamadasA(simulado, URL_PREGUNTAS)).toHaveLength(2);
    });
  });

  describe('paso 2: Tu cabello', () => {
    it('"Finalizar registro" sin datos marca los obligatorios y no envía', async () => {
      const simulado = servidor({ [URL_VERIFICAR_CORREO]: { cuerpo: { existe: false } } });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llegarAlPaso2(result);

      await act(async () => {
        result.current.crearCuenta();
      });

      expect(result.current.errorGeneral).toBe('Revisa los campos marcados.');
      expect(result.current.errores).toEqual(
        expect.objectContaining({
          tipoCabello: 'Selecciona tu tipo de cabello',
          tieneAlergias: 'Debes indicar si tienes alergias a productos',
          tratamientosQuimicos: 'Debes indicar si has tenido tratamientos químicos previos',
          aceptaTerminos: 'Debes aceptar los Términos y Condiciones',
          aceptaAviso: 'Debes aceptar el Aviso de Privacidad',
        }),
      );
      expect(result.current.enfoque?.campo).toBe('tipoCabello');
      expect(result.current.paso).toBe(2);
      expect(llamadasA(simulado, URL_REGISTRO)).toHaveLength(0);
    });

    it('con alergias autorizadas pide su detalle; "No" borra el detalle y la autorización', async () => {
      servidor({ [URL_VERIFICAR_CORREO]: { cuerpo: { existe: false } } });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llegarAlPaso2(result);
      // GP-09 (Ronda 5): el detalle solo se pide después de la autorización de datos sensibles.
      await llenar(result, { ...PASO_2_VALIDO, tieneAlergias: true, autorizacionDatosSensibles: AUTORIZACION });

      await act(async () => {
        result.current.crearCuenta();
      });
      expect(result.current.errores.alergias).toBe('Especifica tus alergias');

      // Responder "No" borra el detalle y la autorización.
      await cambiarCampo(result, 'alergias', 'Alergia ficticia al amoniaco');
      await cambiarCampo(result, 'tieneAlergias', false);
      expect(result.current.campos.alergias).toBe('');
      expect(result.current.campos.autorizacionDatosSensibles).toBeNull();
      expect(result.current.errores.alergias).toBeNull();
    });

    it('"Atrás" regresa al paso 1 sin perder lo escrito', async () => {
      servidor({ [URL_VERIFICAR_CORREO]: { cuerpo: { existe: false } } });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llegarAlPaso2(result);

      await act(async () => {
        result.current.atras();
      });

      expect(result.current.paso).toBe(1);
      expect(result.current.direccionPaso).toBe(-1);
      expect(result.current.campos.nombre).toBe('Clienta Ficticia');
      expect(result.current.campos.clave).toBe(CLAVE);
    });

    it('con éxito envía el contrato actual y abre la activación con el código ya enviado', async () => {
      mockNavegacion.ruta = '/registro';
      const simulado = servidor({
        [URL_VERIFICAR_CORREO]: { cuerpo: { existe: false } },
        [URL_REGISTRO]: { cuerpo: { success: true, message: 'Usuario registrado' }, status: 201 },
      });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llegarAlPaso2(result);
      await llenar(result, {
        ...PASO_2_VALIDO,
        colorNatural: '  Castaño  ',
        tieneAlergias: true,
        alergias: ' Alergia ficticia al amoniaco ',
        autorizacionDatosSensibles: AUTORIZACION,
        recibePromociones: true,
      });

      await act(async () => {
        result.current.crearCuenta();
      });
      await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));

      const [registro] = llamadasA(simulado, URL_REGISTRO);
      expect(registro[1].method).toBe('POST');
      expect((registro[1].headers as Record<string, string>).Authorization).toBeUndefined();
      expect(cuerpoDe(registro)).toEqual({
        nombre: 'Clienta Ficticia',
        email: CORREO,
        telefono: '5512345678',
        password: CLAVE,
        fechaNacimiento: '1995-04-15',
        preguntaSeguridad: { pregunta: PREGUNTA.pregunta, respuesta: 'Respuesta ficticia' },
        perfilCapilar: {
          tipoCabello: 'ondulado',
          colorNatural: 'Castaño',
          tieneAlergias: true,
          alergias: 'Alergia ficticia al amoniaco',
          tratamientosQuimicos: false,
        },
        aceptaTerminos: true,
        aceptaAvisoPrivacidad: true,
        recibePromociones: true,
        rutaOrigen: '/registro',
        consienteDatosSensibles: true,
        autorizacionDatosSensibles: AUTORIZACION,
      });
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/activar',
        params: { email: CORREO, enviado: '1', volverA: '/registro' },
      });
      // Los datos de salud no se conservan en memoria después de enviarlos.
      expect(result.current.campos.alergias).toBe('');
      expect(result.current.campos.autorizacionDatosSensibles).toBeNull();
      expect(result.current.cargando).toBe(false);
    });

    it('muestra el estado de carga e ignora un segundo envío mientras espera', async () => {
      const pendiente = diferida();
      const simulado = servidor({
        [URL_VERIFICAR_CORREO]: { cuerpo: { existe: false } },
        [URL_REGISTRO]: { espera: pendiente.promesa },
      });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llegarAlPaso2(result);
      await llenar(result, PASO_2_VALIDO);

      await act(async () => {
        result.current.crearCuenta();
      });
      expect(result.current.cargando).toBe(true);

      await act(async () => {
        result.current.crearCuenta();
      });
      // Tampoco se puede volver al paso 1 mientras se envía.
      await act(async () => {
        result.current.atras();
      });
      expect(result.current.paso).toBe(2);
      expect(llamadasA(simulado, URL_REGISTRO)).toHaveLength(1);

      await act(async () => {
        pendiente.resolver(respuesta({ success: true }, 201));
      });
      await waitFor(() => expect(result.current.cargando).toBe(false));
      expect(mockRouter.push).toHaveBeenCalledTimes(1);
    });

    it('un 409 regresa al paso 1, marca el correo y ofrece iniciar sesión o recuperar la contraseña', async () => {
      servidor({
        [URL_VERIFICAR_CORREO]: { cuerpo: { existe: false } },
        [URL_REGISTRO]: { cuerpo: { message: 'El correo ya está registrado' }, status: 409 },
      });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llegarAlPaso2(result);
      await llenar(result, PASO_2_VALIDO);

      await act(async () => {
        result.current.crearCuenta();
      });
      await waitFor(() => expect(result.current.paso).toBe(1));

      expect(result.current.estadoCorreo).toBe('registrado');
      expect(result.current.errorGeneral).toBe(
        'Este correo ya tiene una cuenta. Toca Iniciar sesión para entrar o recuperar tu contraseña.',
      );
      expect(result.current.enfoque?.campo).toBe('correo');
      expect(result.current.cargando).toBe(false);
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('tras el 409, escribir otro correo quita el aviso de cuenta existente', async () => {
      servidor({
        [URL_VERIFICAR_CORREO]: { cuerpo: { existe: false } },
        [URL_REGISTRO]: { cuerpo: { message: 'El correo ya está registrado' }, status: 409 },
      });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llegarAlPaso2(result);
      await llenar(result, PASO_2_VALIDO);
      await act(async () => {
        result.current.crearCuenta();
      });
      await waitFor(() => expect(result.current.estadoCorreo).toBe('registrado'));

      await cambiarCampo(result, 'correo', 'otra.clienta@ejemplo.test');

      expect(result.current.errorGeneral).toBeNull();
      expect(result.current.estadoCorreo).toBe('inactivo');
    });

    it.each([
      ['429', { cuerpo: { message: 'ThrottlerException: Too Many Requests' }, status: 429 }, MENSAJE_DEMASIADOS_INTENTOS],
      ['500', { cuerpo: { message: MENSAJE_TECNICO }, status: 500 }, 'No pudimos crear tu cuenta. Intenta de nuevo.'],
      ['sin red', { sinRed: true }, MENSAJE_SIN_CONEXION],
      ['400 con texto del servidor (no se muestra)', { cuerpo: { message: 'El teléfono ya está registrado' }, status: 400 }, 'No pudimos crear tu cuenta. Revisa tus datos e intenta de nuevo.'],
      ['400 sin mensaje', { cuerpo: {}, status: 400 }, 'No pudimos crear tu cuenta. Revisa tus datos e intenta de nuevo.'],
    ] as [string, Salida, string][])('error %s: lo muestra sin salir del paso 2', async (_caso, salida, esperado) => {
      servidor({
        [URL_VERIFICAR_CORREO]: { cuerpo: { existe: false } },
        [URL_REGISTRO]: salida,
      });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llegarAlPaso2(result);
      await llenar(result, PASO_2_VALIDO);

      await act(async () => {
        result.current.crearCuenta();
      });

      await waitFor(() => expect(result.current.errorGeneral).toBe(esperado));
      expect(result.current.paso).toBe(2);
      expect(result.current.cargando).toBe(false);
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    // GP-07.6: el message del cuerpo es del servidor y no se muestra; se usa el texto propio.
    it('una respuesta con success false muestra el aviso propio y no abre la activación', async () => {
      servidor({
        [URL_VERIFICAR_CORREO]: { cuerpo: { existe: false } },
        [URL_REGISTRO]: { cuerpo: { success: false, message: 'No se pudo enviar el código' } },
      });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llegarAlPaso2(result);
      await llenar(result, PASO_2_VALIDO);

      await act(async () => {
        result.current.crearCuenta();
      });

      await waitFor(() => expect(result.current.errorGeneral).toBe('No pudimos crear tu cuenta. Intenta de nuevo.'));
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  describe('aviso, términos y reinicio', () => {
    it('abre el aviso de privacidad en el navegador y los términos en el visor de la app', async () => {
      servidor({});
      const { result } = await renderHook(() => useRegistroViewModel());

      await act(async () => {
        result.current.abrirAviso();
      });
      await act(async () => {
        result.current.abrirTerminos();
      });

      expect(openBrowserAsync).toHaveBeenCalledTimes(1);
      expect(openBrowserAsync).toHaveBeenCalledWith('http://web.test/aviso-de-privacidad');
      expect(mockRouter.push).toHaveBeenCalledWith('/legal/terminos');
      expect(result.current.errorGeneral).toBeNull();
    });

    it('si el navegador no abre, lo dice en el aviso general', async () => {
      servidor({});
      jest.mocked(openBrowserAsync).mockRejectedValueOnce(new Error('sin navegador'));
      const { result } = await renderHook(() => useRegistroViewModel());

      await act(async () => {
        result.current.abrirAviso();
      });

      await waitFor(() =>
        expect(result.current.errorGeneral).toBe('No pudimos abrir el aviso de privacidad.'),
      );
    });

    it('reiniciar vuelve al paso 1 con todo vacío y cancela la verificación pendiente', async () => {
      const simulado = servidor({ [URL_VERIFICAR_CORREO]: { cuerpo: { existe: false } } });
      const { result } = await renderHook(() => useRegistroViewModel());
      await llegarAlPaso2(result);
      await cambiarCampo(result, 'tieneAlergias', true);
      await cambiarCampo(result, 'alergias', 'Alergia ficticia');
      await act(async () => {
        result.current.atras();
      });
      await cambiarCampo(result, 'correo', 'otra@ejemplo.test');
      const verificacionesAntes = llamadasA(simulado, URL_VERIFICAR_CORREO).length;

      await act(async () => {
        result.current.reiniciar();
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });

      expect(result.current.paso).toBe(1);
      expect(result.current.campos.nombre).toBe('');
      expect(result.current.campos.correo).toBe('');
      expect(result.current.campos.alergias).toBe('');
      expect(result.current.errores).toEqual({});
      expect(result.current.estadoCorreo).toBe('inactivo');
      expect(result.current.enfoque).toBeNull();
      expect(llamadasA(simulado, URL_VERIFICAR_CORREO)).toHaveLength(verificacionesAntes);
    });
  });
});

// ── useActivarViewModel ──────────────────────────────────────────────────────────────────────

describe('useActivarViewModel', () => {
  interface PropsActivar {
    email: string;
    recienEnviado: boolean;
    volverA: RutaAcceso;
  }

  function montarActivar(props: Partial<PropsActivar> = {}) {
    const iniciales: PropsActivar = { email: CORREO, recienEnviado: false, volverA: '/login', ...props };
    return renderHook((p: PropsActivar) => useActivarViewModel(p.email, p.recienEnviado, p.volverA), {
      initialProps: iniciales,
    });
  }

  async function escribirCodigo(result: { current: ReturnType<typeof useActivarViewModel> }, codigo: string) {
    await act(async () => {
      result.current.setCodigo(codigo);
    });
  }

  it('el código solo acepta 6 dígitos y escribir borra el error', async () => {
    servidor({});
    const { result } = await montarActivar();

    await escribirCodigo(result, '12a 3-4');
    expect(result.current.codigo).toBe('1234');

    await act(async () => {
      result.current.verificar();
    });
    expect(result.current.error).toBe('El código debe tener 6 dígitos');

    await escribirCodigo(result, '12345678');
    expect(result.current.codigo).toBe('123456');
    expect(result.current.error).toBeNull();
  });

  it('sin correo no envía y pide volver a iniciar sesión', async () => {
    const simulado = servidor({});
    const { result } = await montarActivar({ email: '' });
    await escribirCodigo(result, '123456');

    await act(async () => {
      result.current.verificar();
    });
    await act(async () => {
      result.current.reenviar();
    });

    expect(result.current.error).toBe('No sabemos a qué correo se envió el código. Vuelve a iniciar sesión.');
    expect(simulado).not.toHaveBeenCalled();
  });

  it('con el código correcto regresa a la pantalla de acceso con la cuenta activada', async () => {
    const simulado = servidor({ [URL_VERIFICAR_OTP]: { cuerpo: { success: true } } });
    const { result } = await montarActivar({ volverA: '/registro' });
    await escribirCodigo(result, '123456');

    await act(async () => {
      result.current.verificar();
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1));

    expect(cuerpoDe(llamadasA(simulado, URL_VERIFICAR_OTP)[0])).toEqual({ email: CORREO, codigo: '123456' });
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({
      pathname: '/registro',
      params: { correo: CORREO, vuelta: expect.any(String), activada: '1' },
    });
    expect(result.current.error).toBeNull();
    expect(result.current.cargando).toBe(false);
  });

  it('muestra el estado de carga mientras verifica', async () => {
    const pendiente = diferida();
    const simulado = servidor({ [URL_VERIFICAR_OTP]: { espera: pendiente.promesa } });
    const { result } = await montarActivar();
    await escribirCodigo(result, '123456');

    await act(async () => {
      result.current.verificar();
    });
    expect(result.current.cargando).toBe(true);
    await act(async () => {
      result.current.verificar();
    });
    expect(llamadasA(simulado, URL_VERIFICAR_OTP)).toHaveLength(1);

    await act(async () => {
      pendiente.resolver(respuesta({ success: true }));
    });
    await waitFor(() => expect(result.current.cargando).toBe(false));
  });

  const CODIGO_INCORRECTO = 'El código es incorrecto o ha expirado. Solicita uno nuevo con «Reenviar código».';

  it.each([
    ['success false', { cuerpo: { success: false, message: 'Código inválido' } }, CODIGO_INCORRECTO],
    ['400', { cuerpo: { message: 'Código inválido o expirado' }, status: 400 }, CODIGO_INCORRECTO],
    ['404', { cuerpo: { message: 'Usuario no encontrado' }, status: 404 }, CODIGO_INCORRECTO],
    ['429', { cuerpo: { message: 'ThrottlerException: Too Many Requests' }, status: 429 }, MENSAJE_DEMASIADOS_INTENTOS],
    ['500', { cuerpo: { message: MENSAJE_TECNICO }, status: 500 }, 'No pudimos verificar el código. Intenta de nuevo en un momento.'],
    ['sin red', { sinRed: true }, MENSAJE_SIN_CONEXION],
  ] as [string, Salida, string][])('error %s: muestra un mensaje para la clienta y no sale', async (_caso, salida, esperado) => {
    servidor({ [URL_VERIFICAR_OTP]: salida });
    const { result } = await montarActivar();
    await escribirCodigo(result, '123456');

    await act(async () => {
      result.current.verificar();
    });

    await waitFor(() => expect(result.current.error).toBe(esperado));
    expect(result.current.cargando).toBe(false);
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('reenviar pide un código nuevo, borra el escrito y arranca la espera de 60 s', async () => {
    const simulado = servidor({ [URL_REENVIAR]: { cuerpo: { success: true } } });
    const { result } = await montarActivar();
    await escribirCodigo(result, '111111');

    await act(async () => {
      result.current.reenviar();
    });
    await waitFor(() => expect(result.current.mensaje).toBe('Te enviamos un código nuevo. Revisa tu correo.'));

    expect(cuerpoDe(llamadasA(simulado, URL_REENVIAR)[0])).toEqual({ email: CORREO });
    expect(result.current.codigo).toBe('');
    expect(result.current.espera).toBe(60);
    expect(result.current.reenviando).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it.each([
    ['sin red', { sinRed: true }, MENSAJE_SIN_CONEXION],
    ['500', { cuerpo: { message: MENSAJE_TECNICO }, status: 500 }, 'No pudimos reenviar el código. Intenta de nuevo.'],
  ] as [string, Salida, string][])('reenviar con error %s: muestra un mensaje para la clienta', async (_caso, salida, esperado) => {
    servidor({ [URL_REENVIAR]: salida });
    const { result } = await montarActivar();

    await act(async () => {
      result.current.reenviar();
    });

    await waitFor(() => expect(result.current.error).toBe(esperado));
    expect(result.current.espera).toBe(0);
    expect(result.current.mensaje).toBeNull();
  });

  // GP-09: el 429 usa la espera compartida (60 s si no trae retryAfter), no la propia del envío.
  it('reenviar con 429 sin retryAfter deja el reenvío en espera 60 s', async () => {
    servidor({ [URL_REENVIAR]: { cuerpo: { message: 'Demasiadas solicitudes' }, status: 429 } });
    const { result } = await montarActivar();

    await act(async () => {
      result.current.reenviar();
    });

    await waitFor(() => expect(result.current.error).toBe(MENSAJE_DEMASIADOS_INTENTOS));
    expect(result.current.espera).toBe(0);
    expect(result.current.reenvioEnLimite).toBe(true);
    expect(result.current.textoReenviar).toBe('Intenta de nuevo en 60 s');
  });

  it('"Volver" y el Atrás de Android regresan a la pantalla de acceso sin activar', async () => {
    servidor({});
    // El manejador de la vista no usa el evento: se guarda como una función sin argumentos.
    let manejador: (() => boolean | null | undefined) | null = null;
    const quitar = jest.fn();
    const espia = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_evento, alPulsar) => {
      manejador = alPulsar as unknown as () => boolean | null | undefined;
      return { remove: quitar };
    });
    try {
      const { result, unmount } = await montarActivar({ volverA: '/registro' });

      await act(async () => {
        result.current.volver();
      });
      expect(mockRouter.dismissTo).toHaveBeenLastCalledWith({
        pathname: '/registro',
        params: { correo: CORREO, vuelta: expect.any(String) },
      });

      expect(manejador).not.toBeNull();
      let atendido: boolean | null | undefined = false;
      await act(async () => {
        atendido = (manejador as unknown as () => boolean)();
      });
      expect(atendido).toBe(true);
      expect(mockRouter.dismissTo).toHaveBeenCalledTimes(2);
      expect(mockRouter.dismissTo).toHaveBeenLastCalledWith({
        pathname: '/registro',
        params: { correo: CORREO, vuelta: expect.any(String) },
      });

      await unmount();
      expect(quitar).toHaveBeenCalled();
    } finally {
      espia.mockRestore();
    }
  });

  describe('cuenta regresiva del reenvío', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(cerrarTemporizadores);

    it('recién enviado espera 60 s, baja de uno en uno y bloquea el reenvío hasta llegar a 0', async () => {
      const simulado = servidor({ [URL_REENVIAR]: { cuerpo: { success: true } } });
      const { result } = await montarActivar({ recienEnviado: true });
      expect(result.current.espera).toBe(60);

      await act(async () => {
        result.current.reenviar();
      });
      expect(simulado).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.espera).toBe(59);

      for (let i = 0; i < 59; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }
      expect(result.current.espera).toBe(0);

      await act(async () => {
        result.current.reenviar();
      });
      await waitFor(() => expect(llamadasA(simulado, URL_REENVIAR)).toHaveLength(1));
      await waitFor(() => expect(result.current.espera).toBe(60));
    });
  });
});

// ── useRecuperarViewModel ────────────────────────────────────────────────────────────────────

describe('useRecuperarViewModel', () => {
  const MENSAJE_NEUTRO = 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña';

  it('valida el correo antes de enviar y escribir borra el error', async () => {
    const simulado = servidor({});
    const { result } = await renderHook(() => useRecuperarViewModel());

    await act(async () => {
      result.current.enviar();
    });
    expect(result.current.errorCorreo).toBe('El correo electrónico es requerido');

    await act(async () => {
      result.current.setCorreo('clienta@ejemplo');
    });
    expect(result.current.errorCorreo).toBeNull();
    await act(async () => {
      result.current.enviar();
    });
    expect(result.current.errorCorreo).toBe('El correo electrónico no es válido');
    expect(simulado).not.toHaveBeenCalled();
  });

  it('con éxito muestra el mensaje neutro y envía el correo normalizado', async () => {
    const simulado = servidor({ [URL_RECUPERAR]: { cuerpo: { success: true, message: 'Enlace enviado' } } });
    const { result } = await renderHook(() => useRecuperarViewModel());
    await act(async () => {
      result.current.setCorreo('  Clienta@Ejemplo.TEST ');
    });

    await act(async () => {
      result.current.enviar();
    });

    await waitFor(() => expect(result.current.mensaje).toBe(MENSAJE_NEUTRO));
    expect(cuerpoDe(llamadasA(simulado, URL_RECUPERAR)[0])).toEqual({ email: CORREO });
    expect(result.current.error).toBeNull();
    expect(result.current.cargando).toBe(false);
  });

  it('muestra el estado de carga e ignora un segundo envío', async () => {
    const pendiente = diferida();
    const simulado = servidor({ [URL_RECUPERAR]: { espera: pendiente.promesa } });
    const { result } = await renderHook(() => useRecuperarViewModel());
    await act(async () => {
      result.current.setCorreo(CORREO);
    });

    await act(async () => {
      result.current.enviar();
    });
    expect(result.current.cargando).toBe(true);
    await act(async () => {
      result.current.enviar();
    });
    expect(llamadasA(simulado, URL_RECUPERAR)).toHaveLength(1);

    await act(async () => {
      pendiente.resolver(respuesta({ success: true }));
    });
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.mensaje).toBe(MENSAJE_NEUTRO);
  });

  it.each([
    ['404', { cuerpo: { message: 'Usuario no encontrado' }, status: 404 }],
    ['500', { cuerpo: { message: MENSAJE_TECNICO }, status: 500 }],
  ] as [string, Salida][])('un error %s del servidor muestra el mismo mensaje neutro', async (_caso, salida) => {
    servidor({ [URL_RECUPERAR]: salida });
    const { result } = await renderHook(() => useRecuperarViewModel());
    await act(async () => {
      result.current.setCorreo(CORREO);
    });

    await act(async () => {
      result.current.enviar();
    });

    await waitFor(() => expect(result.current.mensaje).toBe(MENSAJE_NEUTRO));
    expect(result.current.error).toBeNull();
  });

  it.each([
    ['429', { cuerpo: { message: 'ThrottlerException: Too Many Requests' }, status: 429 }, MENSAJE_DEMASIADOS_INTENTOS],
    ['sin red', { sinRed: true }, MENSAJE_SIN_CONEXION],
  ] as [string, Salida, string][])('error %s: muestra un aviso para la clienta', async (_caso, salida, esperado) => {
    servidor({ [URL_RECUPERAR]: salida });
    const { result } = await renderHook(() => useRecuperarViewModel());
    await act(async () => {
      result.current.setCorreo(CORREO);
    });

    await act(async () => {
      result.current.enviar();
    });

    await waitFor(() => expect(result.current.error).toBe(esperado));
    expect(result.current.mensaje).toBeNull();
    expect(result.current.cargando).toBe(false);
  });

  it('"Volver" regresa si hay pantalla anterior y si no, abre el acceso', async () => {
    servidor({});
    const { result } = await renderHook(() => useRecuperarViewModel());

    await act(async () => {
      result.current.volver();
    });
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    mockRouter.canGoBack.mockImplementation(() => false);
    await act(async () => {
      result.current.volver();
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/login');
  });
});

// ── useRetornoActivacion ─────────────────────────────────────────────────────────────────────

describe('useRetornoActivacion', () => {
  it('rutaAcceso solo acepta /registro; cualquier otro valor vuelve a /login', () => {
    expect(rutaAcceso('/registro')).toBe('/registro');
    expect(rutaAcceso('/login')).toBe('/login');
    expect(rutaAcceso('/inicio')).toBe('/login');
    expect(rutaAcceso(undefined)).toBe('/login');
  });

  it('sin parámetros no hay aviso ni retorno', async () => {
    const { result } = await renderHook(() => useRetornoActivacion(), { wrapper: AuthProvider });
    expect(result.current).toEqual({ aviso: null, retorno: null });
  });

  it('con la cuenta activada avisa y devuelve el correo y la vez', async () => {
    mockNavegacion.params = { activada: '1', correo: CORREO, vuelta: '1700000000000' };
    const { result } = await renderHook(() => useRetornoActivacion(), { wrapper: AuthProvider });
    expect(result.current).toEqual({
      aviso: 'Tu cuenta está activada. Inicia sesión.',
      retorno: { correo: CORREO, vez: '1700000000000' },
    });
  });

  it('tras cambiar la contraseña avisa que inicie sesión de nuevo', async () => {
    mockNavegacion.params = { motivo: 'contrasena', correo: CORREO, vuelta: '1' };
    const { result } = await renderHook(() => useRetornoActivacion(), { wrapper: AuthProvider });
    expect(result.current.aviso).toBe('Tu contraseña cambió. Inicia sesión de nuevo.');
  });

  it('un regreso sin activar no avisa, y un correo que no es texto queda vacío', async () => {
    mockNavegacion.params = { correo: [CORREO, 'otra@ejemplo.test'], vuelta: '2' };
    const { result } = await renderHook(() => useRetornoActivacion(), { wrapper: AuthProvider });
    expect(result.current).toEqual({ aviso: null, retorno: { correo: '', vez: '2' } });
  });

  it('sin "vuelta" no hay retorno aunque venga el correo', async () => {
    mockNavegacion.params = { correo: CORREO, vuelta: '' };
    const { result } = await renderHook(() => useRetornoActivacion(), { wrapper: AuthProvider });
    expect(result.current.retorno).toBeNull();
  });
});

// ── useRequiereSesion ────────────────────────────────────────────────────────────────────────

describe('useRequiereSesion', () => {
  async function montar() {
    const vista = await renderHook(
      () => ({ requiere: useRequiereSesion(), descartar: useDescartarPendiente(), auth: useAuth() }),
      { wrapper: ConSesionRequerida },
    );
    await waitFor(() => expect(vista.result.current.auth.estado).toBe('anonimo'));
    return vista;
  }

  async function iniciarSesion(result: { current: { auth: ReturnType<typeof useAuth> } }) {
    await act(async () => {
      await result.current.auth.ingresar(CORREO, CLAVE);
    });
    await waitFor(() => expect(result.current.auth.estado).toBe('autenticado'));
  }

  it('sin sesión abre la hoja de acceso y hace la acción una sola vez al iniciar sesión', async () => {
    servidor({ [URL_LOGIN]: { cuerpo: cuerpoLogin() } });
    const { result } = await montar();
    const accion = jest.fn();
    expect(mockHoja.props?.visible).toBe(false);

    await act(async () => {
      result.current.requiere(accion);
    });
    expect(accion).not.toHaveBeenCalled();
    expect(mockHoja.props?.visible).toBe(true);

    await iniciarSesion(result);
    await waitFor(() => expect(accion).toHaveBeenCalledTimes(1));
    expect(mockHoja.props?.visible).toBe(false);
  });

  it('con sesión hace la acción de inmediato, sin abrir la hoja', async () => {
    servidor({ [URL_LOGIN]: { cuerpo: cuerpoLogin() } });
    const { result } = await montar();
    await iniciarSesion(result);
    const accion = jest.fn();

    await act(async () => {
      result.current.requiere(accion);
    });

    expect(accion).toHaveBeenCalledTimes(1);
    expect(mockHoja.props?.visible).toBe(false);
  });

  it('sin acción solo abre la hoja', async () => {
    servidor({});
    const { result } = await montar();

    await act(async () => {
      result.current.requiere();
    });

    expect(mockHoja.props?.visible).toBe(true);
  });

  it('cerrar la hoja descarta la acción pendiente', async () => {
    servidor({ [URL_LOGIN]: { cuerpo: cuerpoLogin() } });
    const { result } = await montar();
    const accion = jest.fn();
    await act(async () => {
      result.current.requiere(accion);
    });

    await act(async () => {
      mockHoja.props?.onCerrar();
    });
    expect(mockHoja.props?.visible).toBe(false);

    await iniciarSesion(result);
    expect(accion).not.toHaveBeenCalled();
  });

  it('"Iniciar sesión" y "Crear cuenta" cierran la hoja y abren su pantalla, conservando la acción', async () => {
    servidor({ [URL_LOGIN]: { cuerpo: cuerpoLogin() } });
    const { result } = await montar();
    const accion = jest.fn();

    await act(async () => {
      result.current.requiere(accion);
    });
    await act(async () => {
      mockHoja.props?.onCrearCuenta();
    });
    expect(mockRouter.push).toHaveBeenLastCalledWith('/registro');
    expect(mockHoja.props?.visible).toBe(false);

    await act(async () => {
      result.current.requiere(accion);
    });
    await act(async () => {
      mockHoja.props?.onIniciarSesion();
    });
    expect(mockRouter.push).toHaveBeenLastCalledWith('/login');
    expect(mockHoja.props?.visible).toBe(false);

    await iniciarSesion(result);
    await waitFor(() => expect(accion).toHaveBeenCalledTimes(1));
  });

  it('cerrar Acceso sin iniciar sesión (useDescartarPendiente) descarta la acción', async () => {
    servidor({ [URL_LOGIN]: { cuerpo: cuerpoLogin() } });
    const { result } = await montar();
    const accion = jest.fn();
    await act(async () => {
      result.current.requiere(accion);
    });
    await act(async () => {
      mockHoja.props?.onIniciarSesion();
    });

    await act(async () => {
      result.current.descartar();
    });
    await iniciarSesion(result);

    expect(accion).not.toHaveBeenCalled();
  });
});

// ── useBienvenida ────────────────────────────────────────────────────────────────────────────

describe('useBienvenida', () => {
  async function montar(introTerminada: boolean) {
    const vista = await renderHook(
      (props: { intro: boolean }) => ({ vm: useBienvenida(props.intro), auth: useAuth() }),
      { wrapper: ConSesion, initialProps: { intro: introTerminada } },
    );
    await waitFor(() => expect(vista.result.current.auth.estado).toBe('anonimo'));
    return vista;
  }

  it('en la primera apertura, sin sesión, aparece en cuanto termina la intro', async () => {
    servidor({});
    const { result, rerender } = await montar(false);
    expect(result.current.vm.visible).toBe(false);

    await rerender({ intro: true });
    await waitFor(() => expect(result.current.vm.visible).toBe(true));
  });

  it('si ya se vio, no vuelve a aparecer', async () => {
    servidor({});
    await SecureStore.setItemAsync('bienvenida_vista', '1');
    const { result } = await montar(true);

    // La marca se leyó y, tras dejar correr sus promesas, la hoja sigue oculta.
    await waitFor(() => expect(SecureStore.getItemAsync).toHaveBeenCalledWith('bienvenida_vista'));
    await act(async () => {
      await new Promise((resolver) => {
        setTimeout(resolver, 0);
      });
    });
    expect(result.current.vm.visible).toBe(false);
  });

  it('"Explorar" la cierra y guarda la marca de vista', async () => {
    servidor({});
    const { result } = await montar(true);
    await waitFor(() => expect(result.current.vm.visible).toBe(true));

    await act(async () => {
      result.current.vm.explorar();
    });

    expect(result.current.vm.visible).toBe(false);
    await waitFor(() => expect(leerSecureStore().bienvenida_vista).toBe('1'));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('"Crear cuenta" e "Iniciar sesión" la cierran y abren su pantalla', async () => {
    servidor({});
    const { result } = await montar(true);
    await waitFor(() => expect(result.current.vm.visible).toBe(true));

    await act(async () => {
      result.current.vm.crearCuenta();
    });
    expect(mockRouter.push).toHaveBeenLastCalledWith('/registro');
    expect(result.current.vm.visible).toBe(false);

    await act(async () => {
      result.current.vm.iniciarSesion();
    });
    expect(mockRouter.push).toHaveBeenLastCalledWith('/login');
    await waitFor(() => expect(leerSecureStore().bienvenida_vista).toBe('1'));
  });

  it('con sesión no se muestra y queda marcada como vista', async () => {
    servidor({ [URL_LOGIN]: { cuerpo: cuerpoLogin() } });
    const { result } = await montar(true);
    await waitFor(() => expect(result.current.vm.visible).toBe(true));

    await act(async () => {
      await result.current.auth.ingresar(CORREO, CLAVE);
    });
    await waitFor(() => expect(result.current.auth.estado).toBe('autenticado'));

    expect(result.current.vm.visible).toBe(false);
    await waitFor(() => expect(leerSecureStore().bienvenida_vista).toBe('1'));
  });
});
