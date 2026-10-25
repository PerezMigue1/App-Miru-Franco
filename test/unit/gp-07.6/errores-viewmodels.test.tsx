/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ErrorRolNoPermitido, MENSAJE_ROL_NO_PERMITIDO } from '@/features/auth/models/AuthModel';
import { useActivarViewModel } from '@/features/auth/viewmodels/useActivarViewModel';
import { useGoogleViewModel } from '@/features/auth/viewmodels/useGoogleViewModel';
import { useLoginViewModel } from '@/features/auth/viewmodels/useLoginViewModel';
import { useRegistroViewModel } from '@/features/auth/viewmodels/useRegistroViewModel';
import { useContenidoInicio } from '@/features/inicio/viewmodels/useContenidoInicio';
import { useListaContenido } from '@/features/salon/viewmodels/useListaContenido';
import { useCatalogoViewModel } from '@/features/tienda/viewmodels/useCatalogoViewModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';
import { useDocumentoLegal } from '@/shared/api/useDocumentoLegal';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { respuesta } from '../../helpers/servidorSimulado';
import {
  TEXTO_DEMASIADAS_SOLICITUDES,
  TEXTO_SERVIDOR,
  TEXTO_SIN_CONEXION,
  TEXTO_TIEMPO_AGOTADO,
} from '../../helpers/textosError';
import { errorServidor, reiniciarSimulaciones, servidorVm, sinRed, type ManejadorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-07.6, viewmodels que muestran errores: cada uno guarda el error (o su tipo) y expone el texto de
 * mensajeParaClienta, distinto para sin red, tiempo agotado, falla del servidor y límite de
 * solicitudes; nunca el message de un ApiError. fetch simulado en http://api.test; el inicio de
 * sesión se simula en useAuth para controlar el error que llega.
 */

const mockAuth = { ingresar: jest.fn(), ingresarConGoogle: jest.fn() };

jest.mock('expo-router', () => ({
  ...require('../../helpers/viewmodelsAuth').expoRouterSimulado(),
  usePathname: () => '/login',
}));
jest.mock('@/features/auth/viewmodels/useAuth', () => ({
  useAuth: () => ({ ...require('../../helpers/viewmodelsAuth').authSimulada, ...mockAuth }),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })) }));
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

const TECNICO = 'TypeError: Cannot read properties of undefined (reading "id")';
const THROTTLER = new ApiError(429, 'ThrottlerException: Too Many Requests');
const AUN_NO = 'Aún no responde';

/** Un fetch que nunca responde hasta que se acaba el límite de 60 s de apiClient. */
function servidorQueNoResponde(): void {
  globalThis.fetch = jest.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolver, rechazar) => {
        init?.signal?.addEventListener('abort', () => rechazar(new DOMException(AUN_NO, 'AbortError')));
      }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  reiniciarSimulaciones();
  reiniciarConfiguracionPublica();
  reiniciarDocumentosLegales();
  limpiarArchivos();
  mockAuth.ingresar.mockReset();
  mockAuth.ingresarConGoogle.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('acceso', () => {
  async function entrarCon(error: unknown) {
    mockAuth.ingresar.mockRejectedValue(error);
    const { result } = await renderHook(() => useLoginViewModel());
    await act(async () => {
      result.current.setCorreo('clienta@ejemplo.test');
    });
    await act(async () => {
      result.current.setClave('ClaveFicticia1!');
    });
    await act(async () => {
      result.current.entrar();
    });
    await waitFor(() => expect(result.current.cargando).toBe(false));
    return result.current.errorGeneral;
  }

  it.each<[string, unknown, string]>([
    ['429 (ThrottlerException)', THROTTLER, TEXTO_DEMASIADAS_SOLICITUDES],
    ['tiempo agotado', new ErrorDeRed('tiempoAgotado'), TEXTO_TIEMPO_AGOTADO],
    ['sin red', new ErrorDeRed(), TEXTO_SIN_CONEXION],
    ['403 de bloqueo sin code', new ApiError(403, 'Cuenta bloqueada temporalmente. Intenta de nuevo en 9 minutos.'), 'Tu cuenta está bloqueada temporalmente por varios intentos fallidos. Espera unos minutos e intenta de nuevo.'],
    ['403 de una cuenta del personal', new ApiError(403, TECNICO, 'CUENTA_DE_PERSONAL'), RESPALDO_TEXTOS['errores.cuentaDePersonal']],
    ['500 en inglés', new ApiError(500, 'Internal Server Error'), 'No pudimos iniciar sesión. Intenta de nuevo.'],
    ['una cuenta que no es de clienta', new ErrorRolNoPermitido(), MENSAJE_ROL_NO_PERMITIDO],
  ])('login con %s', async (_caso, error, esperado) => {
    await expect(entrarCon(error)).resolves.toBe(esperado);
  });

  it.each<[string, unknown, string]>([
    ['429', THROTTLER, TEXTO_DEMASIADAS_SOLICITUDES],
    ['sin red', new ErrorDeRed(), TEXTO_SIN_CONEXION],
    ['un canje 400 con CODIGO_INVALIDO (del código de Google)', new ApiError(400, TECNICO, 'CODIGO_INVALIDO'), 'No pudimos iniciar sesión con Google. Inténtalo de nuevo.'],
    ['un 401 del canje', new ApiError(401, TECNICO), 'No pudimos iniciar sesión con Google. Inténtalo de nuevo.'],
  ])('Google con %s', async (_caso, error, esperado) => {
    mockAuth.ingresarConGoogle.mockRejectedValue(error);
    const { result } = await renderHook(() => useGoogleViewModel());

    await act(async () => {
      result.current.entrar();
    });

    await waitFor(() => expect(result.current.error).toBe(esperado));
  });

  it.each<[string, ManejadorVm, string]>([
    // GP-09: el reenvío ya no responde 400 ni 404; si llega uno, no dice nada de la cuenta.
    ['un 400 sin code', () => errorServidor(400, 'Este correo electrónico ya está activado.'), 'No pudimos reenviar el código. Intenta de nuevo.'],
    ['un 500', () => errorServidor(500, TECNICO), 'No pudimos reenviar el código. Intenta de nuevo.'],
    ['sin red', sinRed, TEXTO_SIN_CONEXION],
  ])('reenviar el código con %s', async (_caso, salida, esperado) => {
    servidorVm({ 'POST /api/auth/reenviar-codigo': salida });
    const { result } = await renderHook(() => useActivarViewModel('clienta@ejemplo.test', false, '/login'));

    await act(async () => {
      result.current.reenviar();
    });

    await waitFor(() => expect(result.current.error).toBe(esperado));
  });

  it.each<[string, ManejadorVm, string]>([
    ['un 500', () => errorServidor(500, TECNICO), 'No pudimos cargar las preguntas. Intenta de nuevo en un momento.'],
    ['sin red', sinRed, TEXTO_SIN_CONEXION],
  ])('las preguntas de seguridad con %s dicen por qué no cargaron', async (_caso, salida, esperado) => {
    servidorVm({ 'GET /api/pregunta-seguridad': salida });
    const { result } = await renderHook(() => useRegistroViewModel());

    await act(async () => {
      result.current.preguntas.cargar();
    });

    await waitFor(() => expect(result.current.preguntas.estado).toBe('error'));
    expect(result.current.preguntas.error).toBe(esperado);
  });
});

describe('contenido de Inicio', () => {
  it.each<[string, unknown, string, string]>([
    ['sin red', new ErrorDeRed(), 'sinConexion', TEXTO_SIN_CONEXION],
    ['un 500', new ApiError(500, TECNICO), 'servidor', TEXTO_SERVIDOR],
    ['tiempo agotado', new ErrorDeRed('tiempoAgotado'), 'tiempoAgotado', TEXTO_TIEMPO_AGOTADO],
  ])('useListaContenido con %s guarda el tipo y su texto', async (_caso, error, tipo, texto) => {
    const cargar = () => Promise.reject(error);
    const { result } = await renderHook(() => useListaContenido(cargar));

    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current).toMatchObject({ tipoError: tipo, mensajeError: texto });
  });

  it('useListaContenido sin error no trae tipo ni texto', async () => {
    const cargar = () => Promise.resolve(['dato ficticio']);
    const { result } = await renderHook(() => useListaContenido(cargar));

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current).toMatchObject({ tipoError: null, mensajeError: null });
  });

  it.each<[string, ManejadorVm, string]>([
    ['sin red', sinRed, RESPALDO_TEXTOS['inicio.contenido.errorTexto']],
    ['un 500', () => errorServidor(500, TECNICO), TEXTO_SERVIDOR],
  ])('las secciones de Inicio con %s', async (_caso, salida, esperado) => {
    servidorVm({
      'GET /api/galeria': salida,
      'GET /api/contenido/promociones': salida,
      'GET /api/contenido/equipo': salida,
      'GET /api/contenido/preguntas-frecuentes': salida,
      'GET /api/configuracion-publica': () => respuesta({ message: TECNICO }, 503),
    });
    const { result } = await renderHook(() => useContenidoInicio());

    await waitFor(() => expect(result.current.preguntas.estado).toBe('error'));
    await waitFor(() => expect(result.current.galeria.estado).toBe('error'));
    for (const seccion of [result.current.galeria, result.current.promociones, result.current.equipo, result.current.preguntas]) {
      expect(seccion.mensajeError).toBe(esperado);
    }
  });
});

describe('documento legal', () => {
  it.each<[string, ManejadorVm, string]>([
    ['un 500', () => errorServidor(500, TECNICO), TEXTO_SERVIDOR],
    ['sin red', sinRed, TEXTO_SIN_CONEXION],
  ])('sin documento, %s da su texto', async (_caso, salida, esperado) => {
    servidorVm({ 'GET /api/documentos-legales/terminos/vigente': salida });
    const { result } = await renderHook(() => useDocumentoLegal('terminos'));

    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.vigencia).toBeNull();
    expect(result.current.mensajeError).toBe(esperado);
  });
});

describe('tienda', () => {
  it('el catálogo con tiempo agotado no dice "Sin conexión"', async () => {
    jest.useFakeTimers();
    servidorQueNoResponde();
    const { result } = await renderHook(() => useCatalogoViewModel());

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60000);
    });

    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.errorRed).toBe(false);
  });
});
