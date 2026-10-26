/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import { openBrowserAsync } from 'expo-web-browser';
import { Linking } from 'react-native';

import {
  ERROR_CONSENTIMIENTO_SALUD,
  ERROR_TELEFONO,
} from '@/features/auth/models/AuthModel';
import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import {
  MENSAJE_ESPERA_UN_MOMENTO,
  MENSAJE_FOTO_FALLIDA,
  MENSAJE_FOTO_NO_GUARDADA,
  mensajeFotoPesada,
  MENSAJE_QUITAR_FALLIDO,
  MENSAJE_SUBIDA_NO_DISPONIBLE,
  PESO_MAXIMO_FOTO,
  type FormularioPerfil,
} from '@/features/auth/models/PerfilModel';
import {
  useCambiarContrasenaViewModel,
  type CambiarContrasenaViewModel,
  type CampoDato,
} from '@/features/auth/viewmodels/useCambiarContrasenaViewModel';
import {
  useEditarPerfilViewModel,
  type EditarPerfilViewModel,
} from '@/features/auth/viewmodels/useEditarPerfilViewModel';
import { fijarFotoClienta, useFotoClienta } from '@/features/auth/viewmodels/useFotoClienta';
import { usePerfilViewModel } from '@/features/auth/viewmodels/usePerfilViewModel';
import { generacionActual, nuevaGeneracion } from '@/shared/api/tokenStorage';
import { AparienciaProvider } from '@/shared/ui/apariencia';

import { espiarConsola } from '../../helpers/consola';
import { permisoGaleria, simularAndroid } from '../../helpers/galeriaAndroid';
import { CLIENTA, PERFIL_COMPLETO, respuestaPerfil } from '../../helpers/perfilClienta';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import {
  authSimulada,
  cerrarConTemporizadores,
  diferida,
  enSecuencia,
  errorServidor,
  espiarAtras,
  navegacionSimulada,
  reiniciarSimulaciones,
  routerSimulado,
  servidorVm,
  sinRed,
  type LlamadaVm,
  type ManejadorVm,
  type Salida,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-05.2 (issue #18), viewmodels de Perfil con renderHook: Perfil (carga, foto, apariencia y
 * cierre), Editar perfil, Cambiar contraseña con código por correo y la foto de la cabecera. Se
 * simulan fetch (API en http://api.test y Cloudinary), expo-router, useAuth, el navegador, el
 * selector de fotos, el manipulador de imágenes y expo-file-system. apiClient, authService,
 * PerfilModel y tokenStorage son los reales.
 */

// ── Simulaciones de módulos ──────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })),
}));

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

/** Peso que reporta File de expo-file-system y archivos temporales borrados. */
const mockArchivos: { tamano: number; borrados: string[] } = { tamano: 0, borrados: [] };

jest.mock('expo-file-system', () => ({
  File: class {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    get size(): number {
      return mockArchivos.tamano;
    }

    get exists(): boolean {
      return true;
    }

    delete(): void {
      mockArchivos.borrados.push(this.uri);
    }
  },
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: jest.fn((uri: string) => ({
      crop: jest.fn(),
      resize: jest.fn(),
      release: jest.fn(),
      renderAsync: jest.fn(() =>
        Promise.resolve({
          saveAsync: jest.fn(() => Promise.resolve({ uri: `${uri}.lista.jpg` })),
          release: jest.fn(),
        }),
      ),
    })),
  },
}));

// ── Datos ficticios ──────────────────────────────────────────────────────────────────────────

const CLAVE = 'ClaveFicticia1!';
const CLAVE_NUEVA = 'NuevaFicticia7#';
/** Mensaje técnico que el servidor nunca debe mostrarle a la clienta. */
const MENSAJE_TECNICO = 'PrismaClientKnownRequestError: fallo interno ficticio';
const URL_SUBIDA = 'https://api.cloudinary.com/v1_1/nube-ficticia/image/upload';
const FOTO_ANTERIOR = 'https://res.cloudinary.com/nube-ficticia/image/upload/v1/avatares/anterior.jpg';
const FOTO_NUEVA = 'https://res.cloudinary.com/nube-ficticia/image/upload/v2/avatares/nueva.jpg';
const URI_ELEGIDA = 'file:///cache/elegida.jpg';
const URI_LISTA = `${URI_ELEGIDA}.lista.jpg`;

const RUTA_ME = 'GET /api/auth/me';
const RUTA_PATCH = 'PATCH /api/auth/me';
const RUTA_FIRMA = 'POST /api/auth/me/foto/firma';
const RUTA_CLOUDINARY = `POST ${URL_SUBIDA}`;
const RUTA_CODIGO = 'POST /api/auth/me/password/codigo';
const RUTA_CAMBIO = 'POST /api/auth/me/password';

function firma(uploadUrl = URL_SUBIDA): Response {
  return respuesta({
    success: true,
    data: {
      uploadUrl,
      apiKey: 123456,
      signature: 'firma-ficticia',
      params: { folder: 'avatares/usuario_ficticio', timestamp: '1000' },
    },
  });
}

const RUTAS_FOTO: Record<string, ManejadorVm> = {
  [RUTA_FIRMA]: () => firma(),
  [RUTA_CLOUDINARY]: () => respuesta({ secure_url: FOTO_NUEVA }),
  [RUTA_PATCH]: () => respuesta({ success: true }),
};

const ok = (): Response => respuesta({ success: true });
const fallaInterna = (): Response => errorServidor(500, MENSAJE_TECNICO);

/** Cuántas veces se llamó cada ruta "MÉTODO /ruta" (o "MÉTODO url"). */
function veces(llamadas: LlamadaVm[], ruta: string): number {
  const [metodo, camino] = ruta.split(' ');
  return camino.startsWith('/') ? llamadasA(llamadas, metodo, camino).length : llamadas.filter((l) => l.url === camino).length;
}

function cuerpoDe(llamadas: LlamadaVm[], ruta: string): unknown {
  const [metodo, camino] = ruta.split(' ');
  return llamadasA(llamadas, metodo, camino)[0]?.cuerpo;
}

let cuentas = 0;

/** Sesión de la clienta en useAuth; cada prueba de la cabecera usa una cuenta nueva. */
function conSesion(id: string = CLIENTA.id): void {
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = { ...CLIENTA, id };
}

/** Deja correr las promesas pendientes (con los temporizadores falsos). */
async function asentar(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  reiniciarSimulaciones();
  mockArchivos.tamano = 200_000;
  mockArchivos.borrados = [];
  jest.mocked(openBrowserAsync).mockClear();
  // El permiso aún no está concedido: en Android 12 la explicación sale antes de pedirlo.
  jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockReset();
  jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(permisoGaleria('negado'));
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockReset();
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({ granted: true } as never);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockReset();
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockResolvedValue({ canceled: false, assets: [{ uri: URI_ELEGIDA, width: 1200, height: 1600 }] } as never);
});


// ── Carga de GET /me (las tres pantallas) ────────────────────────────────────────────────────

/** Lo que comparten las tres pantallas que cargan GET /me. */
type ConCarga = () => { estado: string; reintentar: () => void };

describe.each<[string, ConCarga]>([
  ['usePerfilViewModel', () => usePerfilViewModel()],
  ['useEditarPerfilViewModel', () => useEditarPerfilViewModel()],
  ['useCambiarContrasenaViewModel', () => useCambiarContrasenaViewModel()],
])('%s: carga del perfil', (_nombre, usarHook) => {
  it('mientras llega GET /me está cargando y luego queda lista', async () => {
    conSesion();
    const pendiente = diferida();
    servidorVm({ [RUTA_ME]: () => pendiente.promesa });
    const { result } = await renderHook(usarHook);

    expect(result.current.estado).toBe('cargando');
    await act(async () => {
      pendiente.soltar(respuestaPerfil());
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
  });

  it.each<[string, () => Salida]>([
    ['un error interno', fallaInterna],
    ['sin conexión', sinRed],
    ['una respuesta sin perfil', () => respuesta({ data: { nombre: 'Sin id ni correo' } })],
  ])('con %s queda en error y "reintentar" vuelve a pedir el perfil', async (_caso, falla) => {
    conSesion();
    let fallar = true;
    const llamadas = servidorVm({ [RUTA_ME]: () => (fallar ? falla() : respuestaPerfil()) });
    const { result } = await renderHook(usarHook);

    await waitFor(() => expect(result.current.estado).toBe('error'));
    const antes = veces(llamadas, RUTA_ME);
    fallar = false;
    await act(async () => {
      result.current.reintentar();
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(veces(llamadas, RUTA_ME)).toBe(antes + 1);
  });
});

// ── usePerfilViewModel ───────────────────────────────────────────────────────────────────────

describe('usePerfilViewModel', () => {
  async function montarPerfil(rutas: Record<string, ManejadorVm> = {}, perfil: Record<string, unknown> = {}) {
    conSesion();
    const llamadas = servidorVm({
      [RUTA_ME]: () => respuestaPerfil({ ...PERFIL_COMPLETO, foto: FOTO_ANTERIOR, ...perfil }),
      ...rutas,
    });
    const vista = await renderHook(() => usePerfilViewModel(), { wrapper: AparienciaProvider });
    await waitFor(() => expect(vista.result.current.estado).toBe('listo'));
    return { ...vista, llamadas };
  }

  it('sin sesión no pide nada y queda en "sinSesion"', async () => {
    const llamadas = servidorVm({});
    const { result } = await renderHook(() => usePerfilViewModel());

    await asentar();
    expect(result.current.estado).toBe('sinSesion');
    expect(result.current.perfil).toBeNull();
    expect(llamadas).toHaveLength(0);
  });

  it('muestra solo nombre, correo, foto y si tiene contraseña (nunca las alergias)', async () => {
    const { result } = await montarPerfil({}, { alergias: 'Polvo ficticio', tienePassword: false });

    expect(result.current.perfil).toEqual({
      nombre: CLIENTA.nombre,
      email: CLIENTA.email,
      foto: FOTO_ANTERIOR,
      tienePassword: false,
    });
  });

  it.each([
    ['http por fuera de Cloudinary', 'http://otro.ejemplo.test/foto.jpg'],
    ['otro host https', 'https://imagenes.ejemplo.test/foto.jpg'],
  ])('una foto de %s no se carga (cae al monograma)', async (_caso, foto) => {
    const { result } = await montarPerfil({}, { foto });

    expect(result.current.perfil?.foto).toBeNull();
  });

  it('si una recarga falla con el perfil ya en pantalla, lo conserva', async () => {
    let fallar = false;
    const { result } = await montarPerfil({ [RUTA_ME]: () => (fallar ? fallaInterna() : respuestaPerfil()) });

    fallar = true;
    await act(async () => {
      result.current.reintentar();
    });
    await asentar();
    expect(result.current.estado).toBe('listo');
    expect(result.current.perfil?.nombre).toBe(CLIENTA.nombre);
  });

  it('al cerrarse la sesión borra el perfil y queda en "sinSesion"', async () => {
    const { result, rerender } = await montarPerfil();

    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    await rerender({});
    expect(result.current.estado).toBe('sinSesion');
    expect(result.current.perfil).toBeNull();
  });

  it.each([
    ['perfil', 'Tus cambios se guardaron.'],
    ['otro', null],
  ])('con guardado=%s el aviso es %p y el parámetro se borra', async (guardado, aviso) => {
    navegacionSimulada.params = { guardado };
    const { result } = await montarPerfil();

    expect(result.current.avisoGuardado).toBe(aviso);
    expect(navegacionSimulada.setParams).toHaveBeenCalledWith({ guardado: undefined });
  });

  it.each<[string, (vm: ReturnType<typeof usePerfilViewModel>) => void, string]>([
    ['editarPerfil', (vm) => vm.editarPerfil(), '/editar-perfil'],
    ['abrirMisCitas', (vm) => vm.abrirMisCitas(), '/mis-citas'],
    ['abrirMisPedidos', (vm) => vm.abrirMisPedidos(), '/mis-pedidos'],
    ['cambiarContrasena', (vm) => vm.cambiarContrasena(), '/cambiar-contrasena'],
  ])('%s abre %s', async (_accion, accion, ruta) => {
    const { result } = await montarPerfil();

    await act(async () => {
      accion(result.current);
    });
    expect(routerSimulado.push).toHaveBeenCalledWith(ruta);
  });

  it('abre el aviso de privacidad del sitio y no truena sin navegador', async () => {
    const { result } = await montarPerfil();
    jest.mocked(openBrowserAsync).mockRejectedValueOnce(new Error('sin navegador'));

    await act(async () => {
      result.current.abrirAviso();
    });
    expect(openBrowserAsync).toHaveBeenCalledWith('http://web.test/aviso-de-privacidad');
  });

  it('abre y cierra la hoja de apariencia y aplica la elegida', async () => {
    const { result } = await montarPerfil();

    await act(async () => {
      result.current.abrirApariencia();
    });
    expect(result.current.hojaApariencia).toBe(true);
    await act(async () => {
      result.current.cerrarApariencia();
    });
    expect(result.current.hojaApariencia).toBe(false);
    await act(async () => {
      result.current.abrirApariencia();
    });
    await act(async () => {
      result.current.elegirApariencia('oscuro');
    });
    expect(result.current.apariencia).toBe('oscuro');
    expect(result.current.hojaApariencia).toBe(false);
  });

  describe('cierre de sesión', () => {
    it('se confirma antes; cancelar no cierra nada', async () => {
      const { result } = await montarPerfil();

      await act(async () => {
        result.current.cerrarSesion();
      });
      expect(result.current.confirmarCierre).toBe(true);
      await act(async () => {
        result.current.cancelarConfirmacion();
      });
      expect(result.current.confirmarCierre).toBe(false);
      expect(authSimulada.salir).not.toHaveBeenCalled();
    });

    it.each<[boolean, string | null, number]>([
      [true, null, 1],
      [false, 'No se pudo cerrar la sesión. Intenta de nuevo', 0],
    ])('si salir() responde %p el error es %p', async (cerrada, error, navegaciones) => {
      authSimulada.salir.mockResolvedValue(cerrada);
      const { result } = await montarPerfil();

      await act(async () => {
        result.current.cerrarSesion();
      });
      await act(async () => {
        result.current.cerrarSesionConfirmada();
      });
      await asentar();
      expect(result.current.confirmarCierre).toBe(false);
      expect(authSimulada.salir).toHaveBeenCalledTimes(1);
      expect(result.current.errorCierre).toBe(error);
      expect(routerSimulado.navigate).toHaveBeenCalledTimes(navegaciones);
    });
  });

  describe('foto', () => {
    // GP-09: en Android 13 o más nuevo la galería se abre directo, sin permiso (así corren estas
    // pruebas); el permiso con su explicación de Android 12 se prueba en test/unit/gp-09/perfil-galeria.
    let restaurarPlataforma: () => void = () => undefined;
    beforeEach(() => {
      restaurarPlataforma = simularAndroid(34);
    });
    afterEach(() => restaurarPlataforma());

    async function elegirFoto(result: { current: ReturnType<typeof usePerfilViewModel> }): Promise<void> {
      await act(async () => {
        result.current.abrirOpcionesFoto();
      });
      expect(result.current.opcionesFoto).toBe(true);
      await act(async () => {
        result.current.elegirFoto();
      });
      expect(result.current.opcionesFoto).toBe(false);
      // La hoja de opciones terminó de irse (alCerrarse de Hoja).
      await act(async () => {
        result.current.alCerrarseOpciones();
      });
    }

    it('Android 12: negado para siempre lo explica, no abre el selector y ofrece los ajustes', async () => {
      restaurarPlataforma();
      restaurarPlataforma = simularAndroid(32);
      jest
        .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
        .mockResolvedValue(permisoGaleria('negadoParaSiempre'));
      const ajustes = jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('sin ajustes'));
      const { result, llamadas } = await montarPerfil(RUTAS_FOTO);

      await elegirFoto(result);
      // Sin el permiso concedido, primero la explicación; el permiso se pide con "Continuar".
      await waitFor(() => expect(result.current.explicacionGaleria).toBe(true));
      expect(ImagePicker.getMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
      await act(async () => {
        result.current.continuarGaleria();
      });
      await waitFor(() => expect(result.current.permisoDenegado).toBe(true));
      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
      expect(veces(llamadas, RUTA_FIRMA)).toBe(0);

      await act(async () => {
        result.current.abrirAjustes();
      });
      expect(ajustes).toHaveBeenCalled();
      ajustes.mockRestore();
    });

    it('si la clienta cancela la selección no sube nada ni marca error', async () => {
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null } as never);
      const { result, llamadas } = await montarPerfil(RUTAS_FOTO);

      await elegirFoto(result);
      await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
      // Android 13 o más nuevo: el selector del sistema no pide ni consulta el permiso.
      expect(ImagePicker.getMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
      expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
      await asentar();
      expect(veces(llamadas, RUTA_FIRMA)).toBe(0);
      expect(result.current.fotoOcupada).toBe(false);
      expect(result.current.errorFoto).toBeNull();
      expect(result.current.permisoDenegado).toBe(false);
    });

    it('sube con la firma a Cloudinary, guarda la URL con PATCH /me y avisa a la cabecera', async () => {
      const id = `clienta-foto-${(cuentas += 1)}`;
      const anexos = jest.spyOn(FormData.prototype, 'append');
      conSesion(id);
      const llamadas = servidorVm({ ...RUTAS_FOTO, [RUTA_ME]: () => respuestaPerfil({ ...PERFIL_COMPLETO, id }) });
      const { result } = await renderHook(() => ({ vm: usePerfilViewModel(), cabecera: useFotoClienta() }));
      await waitFor(() => expect(result.current.vm.estado).toBe('listo'));
      expect(result.current.cabecera).toBeNull();

      await act(async () => {
        result.current.vm.elegirFoto();
      });
      await waitFor(() => expect(result.current.vm.perfil?.foto).toBe(FOTO_NUEVA));

      expect(veces(llamadas, RUTA_FIRMA)).toBe(1);
      const subida = llamadas.find((l) => l.url === URL_SUBIDA);
      expect(subida?.init?.body).toBeInstanceOf(FormData);
      expect(anexos.mock.calls.map(([nombre]) => nombre)).toEqual(
        expect.arrayContaining(['file', 'api_key', 'signature', 'folder', 'timestamp']),
      );
      expect(anexos).toHaveBeenCalledWith('signature', 'firma-ficticia');
      // La subida a Cloudinary nunca lleva el token de la app.
      expect(subida?.cabeceras).toEqual({});
      expect(cuerpoDe(llamadas, RUTA_PATCH)).toEqual({ foto: FOTO_NUEVA });
      expect(result.current.cabecera).toBe(FOTO_NUEVA);
      expect(result.current.vm.errorFoto).toBeNull();
      expect(result.current.vm.fotoOcupada).toBe(false);
      expect(mockArchivos.borrados).toEqual([URI_ELEGIDA, URI_LISTA]);
      anexos.mockRestore();
    });

    interface FallaFoto {
      caso: string;
      rutas?: Record<string, ManejadorVm>;
      preparar?: () => void;
      mensaje: string;
      /** Hasta qué paso llega: [firma, Cloudinary, PATCH]. */
      pasos: [number, number, number];
    }

    it.each<FallaFoto>([
      {
        caso: 'la foto sigue pesando más de 5 MB',
        preparar: () => {
          mockArchivos.tamano = PESO_MAXIMO_FOTO + 1;
        },
        mensaje: mensajeFotoPesada(),
        pasos: [0, 0, 0],
      },
      {
        caso: 'no se puede preparar la imagen',
        preparar: () => {
          jest.mocked(ImageManipulator.manipulate).mockImplementationOnce(() => {
            throw new Error('imagen dañada ficticia');
          });
        },
        mensaje: MENSAJE_FOTO_FALLIDA,
        pasos: [0, 0, 0],
      },
      {
        caso: 'la subida no está configurada (503)',
        rutas: { [RUTA_FIRMA]: () => errorServidor(503, MENSAJE_TECNICO) },
        mensaje: MENSAJE_SUBIDA_NO_DISPONIBLE,
        pasos: [1, 0, 0],
      },
      {
        caso: 'se pidieron demasiadas firmas (429)',
        rutas: { [RUTA_FIRMA]: () => errorServidor(429, 'ThrottlerException: Too Many Requests') },
        mensaje: MENSAJE_ESPERA_UN_MOMENTO,
        pasos: [1, 0, 0],
      },
      {
        caso: 'no hay conexión al pedir la firma',
        rutas: { [RUTA_FIRMA]: sinRed },
        mensaje: MENSAJE_SIN_CONEXION,
        pasos: [1, 0, 0],
      },
      {
        caso: 'la firma no apunta a Cloudinary por https',
        rutas: { [RUTA_FIRMA]: () => firma('http://api.cloudinary.com/v1_1/nube-ficticia/image/upload') },
        mensaje: MENSAJE_FOTO_FALLIDA,
        pasos: [1, 0, 0],
      },
      {
        caso: 'Cloudinary rechaza la subida',
        rutas: { [RUTA_CLOUDINARY]: () => errorServidor(400, MENSAJE_TECNICO) },
        mensaje: MENSAJE_FOTO_FALLIDA,
        pasos: [1, 1, 0],
      },
      {
        caso: 'Cloudinary responde una URL que no es suya',
        rutas: { [RUTA_CLOUDINARY]: () => respuesta({ secure_url: 'http://otro.ejemplo.test/foto.jpg' }) },
        mensaje: MENSAJE_FOTO_FALLIDA,
        pasos: [1, 1, 0],
      },
      {
        caso: 'PATCH /me rechaza la URL (400)',
        rutas: { [RUTA_PATCH]: () => errorServidor(400, MENSAJE_TECNICO) },
        mensaje: MENSAJE_FOTO_NO_GUARDADA,
        pasos: [1, 1, 1],
      },
      {
        caso: 'PATCH /me falla en el servidor (500)',
        rutas: { [RUTA_PATCH]: fallaInterna },
        mensaje: MENSAJE_FOTO_FALLIDA,
        pasos: [1, 1, 1],
      },
    ])('si $caso, avisa en español y conserva la foto anterior', async ({ rutas, preparar, mensaje, pasos }) => {
      preparar?.();
      const { result, llamadas } = await montarPerfil({ ...RUTAS_FOTO, ...rutas });

      await elegirFoto(result);
      await waitFor(() => expect(result.current.errorFoto).toBe(mensaje));
      await asentar();

      expect(result.current.errorFoto).not.toContain('Prisma');
      expect(result.current.perfil?.foto).toBe(FOTO_ANTERIOR);
      expect(result.current.fotoOcupada).toBe(false);
      expect([RUTA_FIRMA, RUTA_CLOUDINARY, RUTA_PATCH].map((ruta) => veces(llamadas, ruta))).toEqual(pasos);
    });

    it.each<[string, () => Response]>([
      ['con la firma', () => firma()],
      ['con un error', fallaInterna],
    ])('si la sesión cambia mientras se pide la firma y esta llega %s, se abandona en silencio', async (_caso, salida) => {
      const pendiente = diferida();
      const { result, llamadas } = await montarPerfil({ ...RUTAS_FOTO, [RUTA_FIRMA]: () => pendiente.promesa });

      await elegirFoto(result);
      await waitFor(() => expect(veces(llamadas, RUTA_FIRMA)).toBe(1));
      expect(result.current.fotoOcupada).toBe(true);
      nuevaGeneracion();
      await act(async () => {
        pendiente.soltar(salida());
      });
      await asentar();

      expect(result.current.errorFoto).toBeNull();
      expect(result.current.fotoOcupada).toBe(false);
      expect(veces(llamadas, RUTA_CLOUDINARY)).toBe(0);
      expect(veces(llamadas, RUTA_PATCH)).toBe(0);
    });

    it('quitar la foto se confirma antes y cancelar no la quita', async () => {
      const { result, llamadas } = await montarPerfil();

      await act(async () => {
        result.current.abrirOpcionesFoto();
      });
      await act(async () => {
        result.current.quitarFoto();
      });
      expect(result.current.opcionesFoto).toBe(false);
      expect(result.current.confirmarQuitarFoto).toBe(true);
      await act(async () => {
        result.current.cancelarConfirmacion();
      });
      expect(result.current.confirmarQuitarFoto).toBe(false);
      expect(veces(llamadas, RUTA_PATCH)).toBe(0);
      await act(async () => {
        result.current.cerrarOpcionesFoto();
      });
      expect(result.current.opcionesFoto).toBe(false);
    });

    it.each<[string, () => Salida, string | null, string | null]>([
      ['el servidor la quita', ok, null, null],
      ['no hay conexión', sinRed, MENSAJE_SIN_CONEXION, FOTO_ANTERIOR],
      ['el servidor falla', fallaInterna, MENSAJE_QUITAR_FALLIDO, FOTO_ANTERIOR],
    ])('al quitarla, si %s el error es %p y la foto queda %p', async (_caso, salida, error, foto) => {
      const { result, llamadas } = await montarPerfil({ [RUTA_PATCH]: salida });

      await act(async () => {
        result.current.quitarFoto();
      });
      await act(async () => {
        result.current.quitarFotoConfirmada();
      });
      await waitFor(() => expect(veces(llamadas, RUTA_PATCH)).toBe(1));
      await asentar();

      expect(cuerpoDe(llamadas, RUTA_PATCH)).toEqual({ foto: null });
      expect(result.current.errorFoto).toBe(error);
      expect(result.current.perfil?.foto).toBe(foto);
      expect(result.current.fotoOcupada).toBe(false);
    });

    it('mientras se sube una foto no se puede cerrar la sesión', async () => {
      const pendiente = diferida();
      const { result, llamadas } = await montarPerfil({ ...RUTAS_FOTO, [RUTA_FIRMA]: () => pendiente.promesa });

      await elegirFoto(result);
      await waitFor(() => expect(veces(llamadas, RUTA_FIRMA)).toBe(1));
      await act(async () => {
        result.current.cerrarSesion();
      });
      expect(result.current.confirmarCierre).toBe(false);

      await act(async () => {
        pendiente.soltar(firma());
      });
      await waitFor(() => expect(result.current.perfil?.foto).toBe(FOTO_NUEVA));
    });
  });
});

// ── useEditarPerfilViewModel ─────────────────────────────────────────────────────────────────

describe('useEditarPerfilViewModel', () => {
  type ResultadoEdicion = { current: EditarPerfilViewModel };

  async function montarEdicion(rutas: Record<string, ManejadorVm> = {}, perfil: Record<string, unknown> = {}) {
    conSesion();
    const llamadas = servidorVm({
      [RUTA_ME]: () => respuestaPerfil({ ...PERFIL_COMPLETO, ...perfil }),
      [RUTA_PATCH]: ok,
      ...rutas,
    });
    const vista = await renderHook(() => useEditarPerfilViewModel());
    await waitFor(() => expect(vista.result.current.estado).toBe('listo'));
    return { ...vista, llamadas };
  }

  async function escribir(result: ResultadoEdicion, cambios: Partial<FormularioPerfil>): Promise<void> {
    for (const [campo, valor] of Object.entries(cambios)) {
      await act(async () => {
        result.current.cambiar(campo as keyof FormularioPerfil, valor as never);
      });
    }
  }

  async function guardar(result: ResultadoEdicion): Promise<void> {
    await act(async () => {
      result.current.guardar();
    });
  }

  it('llena el formulario con el perfil de /me (teléfono sin lada y fecha DD/MM/AAAA)', async () => {
    const { result } = await montarEdicion({}, { telefono: '+52 7710000000' });

    expect(result.current.correo).toBe(CLIENTA.email);
    expect(result.current.formulario).toMatchObject({
      nombre: CLIENTA.nombre,
      telefono: '7710000000',
      nacimiento: '12/04/1995',
      tipoCabello: 'ondulado',
      tratamientosQuimicos: false,
    });
  });

  it.each<[keyof FormularioPerfil, string, string | null]>([
    ['nombre', '', 'El nombre completo es requerido'],
    ['nombre', 'A', 'El nombre debe tener al menos 2 caracteres'],
    ['telefono', '12345', ERROR_TELEFONO],
    ['telefono', '', null],
    ['nacimiento', '31/02/1990', 'Escribe una fecha que exista'],
    ['nacimiento', '01/01/2020', 'Debes ser mayor de 18 años'],
    ['nacimiento', '', null],
    ['alergias', '<script>', 'Las alergias no pueden contener caracteres especiales peligrosos'],
    ['colorNatural', '', null],
  ])('al salir de %s con %p el error es %p', async (campo, valor, error) => {
    const { result } = await montarEdicion();

    await escribir(result, { [campo]: valor });
    await act(async () => {
      result.current.salirDe(campo);
    });
    expect(result.current.errores[campo]).toBe(error);
  });

  it('un campo marcado se vuelve a revisar mientras se corrige', async () => {
    const { result } = await montarEdicion();

    await escribir(result, { nombre: '' });
    await act(async () => {
      result.current.salirDe('nombre');
    });
    expect(result.current.errores.nombre).toBe('El nombre completo es requerido');
    await escribir(result, { nombre: 'Clienta Corregida' });
    expect(result.current.errores.nombre).toBeNull();
  });

  it('guardar con errores no llama al servidor, avisa y pide el foco del primero cada vez', async () => {
    const { result, llamadas } = await montarEdicion();

    await escribir(result, { nombre: '', telefono: '123' });
    await guardar(result);
    expect(result.current.errores.nombre).toBe('El nombre completo es requerido');
    expect(result.current.errores.telefono).toBe(ERROR_TELEFONO);
    expect(result.current.errorGeneral).toBe('Revisa los campos marcados.');
    expect(result.current.enfoque).toEqual({ campo: 'nombre', vez: 1 });

    await guardar(result);
    expect(result.current.enfoque).toEqual({ campo: 'nombre', vez: 2 });
    expect(veces(llamadas, RUTA_PATCH)).toBe(0);
  });

  it('una fecha a medio escribir bloquea el guardado con el foco en la fecha', async () => {
    const { result, llamadas } = await montarEdicion();

    await escribir(result, { nacimiento: '12/04' });
    await guardar(result);
    expect(result.current.errores.nacimiento).toBe('Escribe la fecha como DD/MM/AAAA');
    expect(result.current.enfoque?.campo).toBe('nacimiento');
    expect(veces(llamadas, RUTA_PATCH)).toBe(0);
  });

  it('sin cambios, guardar solo regresa', async () => {
    const { result, llamadas } = await montarEdicion();

    await guardar(result);
    expect(routerSimulado.back).toHaveBeenCalledTimes(1);
    expect(veces(llamadas, RUTA_PATCH)).toBe(0);
  });

  it('guarda solo lo que cambió, actualiza el nombre de la sesión y vuelve a Perfil con aviso', async () => {
    const { result, llamadas } = await montarEdicion();

    await escribir(result, { nombre: 'Clienta Renombrada', telefono: '7719999999', recibePromociones: true });
    await guardar(result);
    await waitFor(() => expect(routerSimulado.dismissTo).toHaveBeenCalled());

    expect(cuerpoDe(llamadas, RUTA_PATCH)).toEqual({
      nombre: 'Clienta Renombrada',
      telefono: '7719999999',
      recibePromociones: true,
    });
    expect(authSimulada.actualizarNombre).toHaveBeenCalledWith('Clienta Renombrada', generacionActual());
    expect(routerSimulado.dismissTo).toHaveBeenCalledWith({ pathname: '/perfil', params: { guardado: 'perfil' } });
    expect(result.current.errorGeneral).toBeNull();
  });

  it.each<[string, () => Salida, string]>([
    ['un error interno con detalle técnico', fallaInterna, 'No pudimos guardar tus cambios. Intenta de nuevo.'],
    ['sin conexión', sinRed, MENSAJE_SIN_CONEXION],
    [
      'una regla del backend (400; su texto no se muestra)',
      () => errorServidor(400, 'El teléfono ya está registrado en otra cuenta.'),
      'No pudimos guardar tus cambios. Intenta de nuevo.',
    ],
  ])('si el guardado falla por %s, avisa en español y se queda', async (_caso, salida, mensaje) => {
    const { result } = await montarEdicion({ [RUTA_PATCH]: salida });

    await escribir(result, { colorActual: 'Rubio ficticio' });
    await guardar(result);
    await waitFor(() => expect(result.current.errorGeneral).toBe(mensaje));

    expect(result.current.errorGeneral).not.toContain('Prisma');
    expect(result.current.guardando).toBe(false);
    expect(routerSimulado.dismissTo).not.toHaveBeenCalled();
    expect(authSimulada.actualizarNombre).not.toHaveBeenCalled();
  });

  it('un segundo toque mientras guarda no envía otra vez y "volver" espera', async () => {
    const pendiente = diferida();
    const { result, llamadas } = await montarEdicion({ [RUTA_PATCH]: () => pendiente.promesa });

    await escribir(result, { colorNatural: 'Negro ficticio' });
    await guardar(result);
    await waitFor(() => expect(result.current.guardando).toBe(true));
    await guardar(result);
    await act(async () => {
      result.current.volver();
    });
    expect(result.current.confirmarSalida).toBe(false);
    expect(routerSimulado.back).not.toHaveBeenCalled();

    await act(async () => {
      pendiente.soltar(ok());
    });
    await waitFor(() => expect(routerSimulado.dismissTo).toHaveBeenCalledTimes(1));
    expect(veces(llamadas, RUTA_PATCH)).toBe(1);
  });

  it('si la sesión cambia mientras guarda, no navega en la sesión nueva', async () => {
    const pendiente = diferida();
    const { result } = await montarEdicion({ [RUTA_PATCH]: () => pendiente.promesa });
    const generacion = generacionActual();

    await escribir(result, { nombre: 'Clienta Otra' });
    await guardar(result);
    await waitFor(() => expect(result.current.guardando).toBe(true));
    nuevaGeneracion();
    await act(async () => {
      pendiente.soltar(ok());
    });
    await waitFor(() => expect(result.current.guardando).toBe(false));

    // useAuth decide con la generación de origen si el nombre todavía aplica.
    expect(authSimulada.actualizarNombre).toHaveBeenCalledWith('Clienta Otra', generacion);
    expect(routerSimulado.dismissTo).not.toHaveBeenCalled();
  });

  describe('consentimiento de alergias', () => {
    it('alergias nuevas piden la autorización; con ella se envía consienteDatosSensibles', async () => {
      // GP-09 (Ronda 5): con la autorización de datos sensibles vigente el campo funciona como antes.
      const { result, llamadas } = await montarEdicion({}, { datosSensiblesAutorizados: true });

      await escribir(result, { alergias: 'Polvo ficticio' });
      expect(result.current.pideConsentimiento).toBe(true);
      await guardar(result);
      expect(result.current.errores.consiente).toBe(ERROR_CONSENTIMIENTO_SALUD);
      expect(result.current.enfoque?.campo).toBe('consiente');
      expect(veces(llamadas, RUTA_PATCH)).toBe(0);

      // Marcado en vivo: el error se va al autorizar y vuelve si cambian las alergias sin ella.
      await act(async () => {
        result.current.setConsiente(true);
      });
      expect(result.current.consiente).toBe(true);
      expect(result.current.errores.consiente).toBeNull();
      await escribir(result, { alergias: 'Polvo y polen ficticios' });
      expect(result.current.errores.consiente).toBeNull();

      await guardar(result);
      await waitFor(() => expect(veces(llamadas, RUTA_PATCH)).toBe(1));
      expect(cuerpoDe(llamadas, RUTA_PATCH)).toEqual({
        alergias: 'Polvo y polen ficticios',
        consienteDatosSensibles: true,
      });
    });

    it('borrar las alergias no pide autorización y las envía como null', async () => {
      const { result, llamadas } = await montarEdicion({}, { alergias: 'Polvo ficticio', datosSensiblesAutorizados: true });

      await escribir(result, { alergias: '' });
      expect(result.current.pideConsentimiento).toBe(false);
      await guardar(result);
      await waitFor(() => expect(veces(llamadas, RUTA_PATCH)).toBe(1));
      expect(cuerpoDe(llamadas, RUTA_PATCH)).toEqual({ alergias: null });
    });
  });

  describe('tratamientos químicos', () => {
    it('al pasar a Sí exige el detalle y lo envía junto con la respuesta', async () => {
      const { result, llamadas } = await montarEdicion();

      await escribir(result, { tratamientosQuimicos: true });
      await guardar(result);
      expect(result.current.errores.tratamientos).toBe('Especifica los tratamientos');
      expect(result.current.enfoque?.campo).toBe('tratamientos');

      await escribir(result, { tratamientos: 'Alaciado ficticio' });
      expect(result.current.errores.tratamientos).toBeNull();
      // Con No el detalle se oculta sin borrarse; al volver a Sí reaparece.
      await escribir(result, { tratamientosQuimicos: false });
      await escribir(result, { tratamientosQuimicos: true });
      expect(result.current.formulario.tratamientos).toBe('Alaciado ficticio');

      await guardar(result);
      await waitFor(() => expect(veces(llamadas, RUTA_PATCH)).toBe(1));
      expect(cuerpoDe(llamadas, RUTA_PATCH)).toEqual({ tratamientosQuimicos: true, tratamientos: 'Alaciado ficticio' });
    });

    it('sin respuesta en /me y sin tocarla no bloquea el guardado', async () => {
      const { result, llamadas } = await montarEdicion({}, { tratamientosQuimicos: undefined });

      expect(result.current.formulario.tratamientosQuimicos).toBeNull();
      await escribir(result, { colorActual: 'Cobrizo ficticio' });
      await guardar(result);
      await waitFor(() => expect(veces(llamadas, RUTA_PATCH)).toBe(1));
      expect(result.current.errores.tratamientosQuimicos).toBeNull();
      expect(cuerpoDe(llamadas, RUTA_PATCH)).toEqual({ colorActual: 'Cobrizo ficticio' });
    });
  });

  describe('salida con cambios sin guardar', () => {
    it('sin cambios, "volver" regresa directo', async () => {
      const { result } = await montarEdicion();

      await act(async () => {
        result.current.volver();
      });
      expect(result.current.confirmarSalida).toBe(false);
      expect(routerSimulado.back).toHaveBeenCalledTimes(1);
    });

    it('con cambios pregunta; "seguir editando" se queda y "descartar" regresa', async () => {
      const { result } = await montarEdicion();

      await escribir(result, { nombre: 'Clienta Sin Guardar' });
      await act(async () => {
        result.current.volver();
      });
      expect(result.current.confirmarSalida).toBe(true);
      await act(async () => {
        result.current.seguirEditando();
      });
      expect(result.current.confirmarSalida).toBe(false);
      expect(routerSimulado.back).not.toHaveBeenCalled();

      await act(async () => {
        result.current.volver();
      });
      await act(async () => {
        result.current.descartar();
      });
      expect(result.current.confirmarSalida).toBe(false);
      expect(routerSimulado.back).toHaveBeenCalledTimes(1);
    });

    it('el Atrás de Android también pregunta y se suelta al desmontar', async () => {
      const atras = espiarAtras();
      try {
        const { result, unmount } = await montarEdicion();

        await escribir(result, { nacimiento: '12/04/19' });
        let atendido = false;
        await act(async () => {
          atendido = atras.pulsar();
        });
        expect(atendido).toBe(true);
        expect(result.current.confirmarSalida).toBe(true);
        expect(routerSimulado.back).not.toHaveBeenCalled();
        await unmount();
        expect(atras.quitar).toHaveBeenCalled();
      } finally {
        atras.restaurar();
      }
    });
  });

  it.each<[string, () => Promise<unknown>, string | null]>([
    ['se abre', () => Promise.resolve({ type: 'opened' }), null],
    ['no hay navegador', () => Promise.reject(new Error('sin navegador')), 'No pudimos abrir el aviso de privacidad.'],
  ])('el aviso de privacidad: si %s el error es %p', async (_caso, apertura, error) => {
    jest.mocked(openBrowserAsync).mockImplementationOnce(apertura as never);
    const { result } = await montarEdicion();

    await act(async () => {
      result.current.abrirAviso();
    });
    await asentar();
    expect(openBrowserAsync).toHaveBeenCalledWith('http://web.test/aviso-de-privacidad');
    expect(result.current.errorGeneral).toBe(error);
  });
});

// ── useCambiarContrasenaViewModel ────────────────────────────────────────────────────────────

describe('useCambiarContrasenaViewModel', () => {
  type ResultadoClave = { current: CambiarContrasenaViewModel };

  const codigoEnviado = (): Response =>
    respuesta({ success: true, message: 'Te enviamos un código.', vigenciaMinutos: 15 });

  async function montarClave(rutas: Record<string, ManejadorVm> = {}) {
    conSesion();
    const llamadas = servidorVm({
      [RUTA_ME]: () => respuestaPerfil(),
      [RUTA_CODIGO]: codigoEnviado,
      [RUTA_CAMBIO]: () => respuesta({ success: true, message: 'Contraseña actualizada.' }),
      ...rutas,
    });
    const vista = await renderHook(() => useCambiarContrasenaViewModel());
    await waitFor(() => expect(vista.result.current.estado).toBe('listo'));
    return { ...vista, llamadas };
  }

  async function llenar(result: ResultadoClave, valores: Partial<Record<CampoDato, string>>): Promise<void> {
    for (const [campo, valor] of Object.entries(valores)) {
      await act(async () => {
        result.current.cambiar(campo as CampoDato, valor);
      });
    }
  }

  async function tocar(accion: () => void): Promise<void> {
    await act(async () => {
      accion();
    });
  }

  /** Llena los datos válidos, pide el código y espera el paso 2. */
  async function llegarAlPaso2(rutas: Record<string, ManejadorVm> = {}) {
    const vista = await montarClave(rutas);
    await llenar(vista.result, { actual: CLAVE, nueva: CLAVE_NUEVA, confirmacion: CLAVE_NUEVA });
    await tocar(() => vista.result.current.enviarCodigo());
    await waitFor(() => expect(vista.result.current.paso).toBe(2));
    return vista;
  }

  /** Corre la cuenta regresiva del reenvío segundo a segundo hasta llegar a 0. */
  async function agotarEspera(result: ResultadoClave): Promise<void> {
    for (let vuelta = 0; vuelta < 60 && result.current.espera > 0; vuelta += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
  }

  /** Lo que ve la clienta tras un error: el campo marcado o el aviso general. */
  function destino(vm: CambiarContrasenaViewModel): { campo: string; mensaje: string } | { aviso: string } | null {
    const marcado = Object.entries(vm.errores).find(([, mensaje]) => mensaje);
    if (marcado) {
      return { campo: marcado[0], mensaje: String(marcado[1]) };
    }
    return vm.aviso ? { aviso: vm.aviso } : null;
  }

  it('sin datos marca los tres campos, enfoca el primero y no pide código', async () => {
    const { result, llamadas } = await montarClave();

    await tocar(() => result.current.enviarCodigo());
    expect(result.current.errores).toEqual({
      actual: 'Ingresa tu contraseña actual',
      nueva: 'La contraseña es requerida',
      confirmacion: 'Confirma tu contraseña',
    });
    expect(result.current.enfoque).toEqual({ campo: 'actual', vez: 1 });
    expect(veces(llamadas, RUTA_CODIGO)).toBe(0);
  });

  it.each<[CampoDato, Partial<Record<CampoDato, string>>, string]>([
    ['actual', { actual: '' }, 'Ingresa tu contraseña actual'],
    ['nueva', { nueva: 'Corta1!' }, 'La contraseña debe tener al menos 8 caracteres'],
    ['nueva', { nueva: 'Clave#7710000000' }, 'La contraseña no puede contener tu teléfono'],
    ['confirmacion', { nueva: CLAVE_NUEVA, confirmacion: 'OtraFicticia3$' }, 'Las contraseñas no coinciden'],
  ])('al salir de %s con %p el error es %p', async (campo, valores, error) => {
    const { result } = await montarClave();

    await llenar(result, valores);
    await tocar(() => result.current.salirDe(campo));
    expect(result.current.errores[campo]).toBe(error);
  });

  it('corregir la nueva vuelve a revisar la confirmación y un campo marcado se revisa en vivo', async () => {
    const { result } = await montarClave();

    await llenar(result, { nueva: 'Corta1!', confirmacion: CLAVE_NUEVA });
    await tocar(() => result.current.salirDe('nueva'));
    expect(result.current.errores.confirmacion).toBeUndefined();
    await llenar(result, { nueva: CLAVE_NUEVA });
    expect(result.current.errores.nueva).toBeNull();
    expect(result.current.errores.confirmacion).toBeNull();
    expect(result.current.requisitos.every((r) => r.cumplido)).toBe(true);
  });

  it('pide el código con la contraseña actual y pasa al paso 2 con su vigencia', async () => {
    const { result, llamadas } = await llegarAlPaso2();

    expect(cuerpoDe(llamadas, RUTA_CODIGO)).toEqual({ actualPassword: CLAVE });
    expect(result.current.vigenciaMinutos).toBe(15);
    expect(result.current.espera).toBe(60);
    expect(result.current.codigoVigente).toBe(true);
    expect(result.current.enfoque?.campo).toBe('codigo');
    expect(result.current.enviando).toBe(false);
  });

  it.each<[string, () => Salida, ReturnType<typeof destino>]>([
    [
      'contraseña actual incorrecta',
      () => errorServidor(400, 'La contraseña actual no es correcta.', 'PASSWORD_ACTUAL_INCORRECTA'),
      { campo: 'actual', mensaje: 'La contraseña actual no es correcta.' },
    ],
    ['400 sin code', () => errorServidor(400), { campo: 'actual', mensaje: 'La contraseña actual no es correcta.' }],
    [
      'correo no enviado (CORREO_NO_ENVIADO)',
      () => errorServidor(503, MENSAJE_TECNICO, 'CORREO_NO_ENVIADO'),
      { aviso: 'No pudimos enviar el código a tu correo. Intenta de nuevo en unos minutos.' },
    ],
    [
      'correo no enviado (502 sin code)',
      () => errorServidor(502, MENSAJE_TECNICO),
      { aviso: 'No pudimos enviar el código a tu correo. Intenta de nuevo en unos minutos.' },
    ],
    [
      'cuenta de Google sin contraseña',
      () => errorServidor(409, 'Tu cuenta entra con Google y no tiene contraseña.', 'CUENTA_SIN_PASSWORD'),
      { aviso: 'Tu cuenta entra con Google y no tiene contraseña.' },
    ],
    [
      'demasiados códigos en la hora',
      () => errorServidor(429, 'Pediste demasiados códigos. Intenta en 20 minutos.', 'DEMASIADOS_CODIGOS'),
      { aviso: 'Pediste demasiados códigos. Espera unos minutos e intenta de nuevo.' },
    ],
    ['error interno con detalle técnico', fallaInterna, { aviso: 'No pudimos cambiar tu contraseña. Intenta de nuevo.' }],
    ['sin conexión', sinRed, { aviso: MENSAJE_SIN_CONEXION }],
    [
      'sesión no confirmada (401)',
      () => errorServidor(401, 'Unauthorized'),
      { aviso: 'No pudimos confirmar tu sesión. Intenta de nuevo.' },
    ],
  ])('al pedir el código, %s se muestra en español y se queda en el paso 1', async (_caso, salida, esperado) => {
    const { result } = await montarClave({ [RUTA_CODIGO]: salida });

    await llenar(result, { actual: CLAVE, nueva: CLAVE_NUEVA, confirmacion: CLAVE_NUEVA });
    await tocar(() => result.current.enviarCodigo());
    await waitFor(() => expect(destino(result.current)).toEqual(esperado));

    expect(result.current.paso).toBe(1);
    expect(JSON.stringify(destino(result.current))).not.toContain('Prisma');
    expect(result.current.codigoVigente).toBe(false);
  });

  it('el código solo acepta 6 dígitos; con menos no llama al servidor', async () => {
    const { result, llamadas } = await llegarAlPaso2();

    await tocar(() => result.current.setCodigo('12a-3'));
    expect(result.current.codigo).toBe('123');
    await tocar(() => result.current.cambiarContrasena());
    expect(result.current.errores.codigo).toBe('El código debe tener 6 dígitos');
    expect(veces(llamadas, RUTA_CAMBIO)).toBe(0);

    await tocar(() => result.current.setCodigo('12 34 56 78'));
    expect(result.current.codigo).toBe('123456');
    expect(result.current.errores.codigo).toBeNull();
  });

  it('con el código correcto cambia la contraseña, borra lo escrito y cierra la sesión', async () => {
    const { result, llamadas } = await llegarAlPaso2();

    await tocar(() => result.current.setCodigo('123456'));
    await tocar(() => result.current.cambiarContrasena());
    await waitFor(() => expect(authSimulada.cerrarTrasCambioDeContrasena).toHaveBeenCalledTimes(1));

    expect(cuerpoDe(llamadas, RUTA_CAMBIO)).toEqual({
      actualPassword: CLAVE,
      nuevaPassword: CLAVE_NUEVA,
      codigo: '123456',
    });
    expect(result.current.valores).toEqual({ actual: '', nueva: '', confirmacion: '' });
    expect(result.current.codigo).toBe('');
  });

  it.each([
    ['incorrecto', 'El código no coincide.'],
    ['vencido', 'El código ya venció.'],
  ])('un código %s se limpia, se marca y se queda en el paso 2 sin cerrar la sesión', async (_caso, mensaje) => {
    const { result } = await llegarAlPaso2({
      [RUTA_CAMBIO]: () => errorServidor(400, mensaje, 'CODIGO_INVALIDO'),
    });

    await tocar(() => result.current.setCodigo('654321'));
    await tocar(() => result.current.cambiarContrasena());
    await waitFor(() => expect(result.current.errores.codigo).toBe('El código no es válido o ya venció.'));

    expect(result.current.codigo).toBe('');
    expect(result.current.paso).toBe(2);
    expect(result.current.enfoque?.campo).toBe('codigo');
    expect(result.current.cambiando).toBe(false);
    expect(authSimulada.cerrarTrasCambioDeContrasena).not.toHaveBeenCalled();
  });

  it.each<[string, () => Salida, ReturnType<typeof destino>, number]>([
    [
      'una regla de la nueva (400 sin code; su texto no se muestra)',
      () => errorServidor(400, 'La nueva contraseña no puede ser igual a la contraseña actual'),
      { campo: 'nueva', mensaje: 'Tu contraseña nueva no cumple los requisitos o es igual a la actual. Elige otra.' },
      1,
    ],
    [
      'la contraseña actual incorrecta',
      () => errorServidor(400, 'La contraseña actual no es correcta.', 'PASSWORD_ACTUAL_INCORRECTA'),
      { campo: 'actual', mensaje: 'La contraseña actual no es correcta.' },
      1,
    ],
    ['un error interno con detalle técnico', fallaInterna, { aviso: 'No pudimos cambiar tu contraseña. Intenta de nuevo.' }, 2],
    ['sin conexión', sinRed, { aviso: MENSAJE_SIN_CONEXION }, 2],
  ])('al cambiarla, %s se muestra en español en el paso %#', async (_caso, salida, esperado, paso) => {
    const { result } = await llegarAlPaso2({ [RUTA_CAMBIO]: salida });

    await tocar(() => result.current.setCodigo('123456'));
    await tocar(() => result.current.cambiarContrasena());
    await waitFor(() => expect(destino(result.current)).toEqual(esperado));

    expect(result.current.paso).toBe(paso);
    expect(authSimulada.cerrarTrasCambioDeContrasena).not.toHaveBeenCalled();
  });

  it.each<[string, () => Response]>([
    ['un 401', () => errorServidor(401, 'Unauthorized')],
    ['el cambio hecho', () => respuesta({ success: true })],
  ])('si la sesión terminó mientras se cambiaba y llega %s, no toca la sesión nueva', async (_caso, salida) => {
    const pendiente = diferida();
    const { result } = await llegarAlPaso2({ [RUTA_CAMBIO]: () => pendiente.promesa });

    await tocar(() => result.current.setCodigo('123456'));
    await tocar(() => result.current.cambiarContrasena());
    await waitFor(() => expect(result.current.cambiando).toBe(true));
    nuevaGeneracion();
    await act(async () => {
      pendiente.soltar(salida());
    });
    await waitFor(() => expect(result.current.cambiando).toBe(false));

    expect(destino(result.current)).toBeNull();
    expect(authSimulada.cerrarTrasCambioDeContrasena).not.toHaveBeenCalled();
  });

  it('el reenvío espera la cuenta regresiva y luego manda otro código', async () => {
    const { result, llamadas } = await llegarAlPaso2({
      [RUTA_CODIGO]: enSecuencia(codigoEnviado, codigoEnviado, sinRed),
    });

    await tocar(() => result.current.reenviar());
    expect(veces(llamadas, RUTA_CODIGO)).toBe(1);

    await agotarEspera(result);
    expect(result.current.espera).toBe(0);
    expect(result.current.codigoVigente).toBe(false);

    await tocar(() => result.current.reenviar());
    await waitFor(() => expect(result.current.avisoExito).toBe('Te enviamos un código nuevo. Revisa tu correo.'));
    expect(veces(llamadas, RUTA_CODIGO)).toBe(2);
    expect(result.current.espera).toBe(60);
    expect(result.current.reenviando).toBe(false);
  });

  it('un reenvío sin conexión avisa y no confirma el envío', async () => {
    const { result } = await llegarAlPaso2({ [RUTA_CODIGO]: enSecuencia(codigoEnviado, sinRed) });

    await agotarEspera(result);
    await tocar(() => result.current.reenviar());
    await waitFor(() => expect(result.current.aviso).toBe(MENSAJE_SIN_CONEXION));
    expect(result.current.avisoExito).toBeNull();
  });

  it('volver al paso 1 conserva lo escrito y con el código vigente no pide otro', async () => {
    const atras = espiarAtras();
    try {
      const { result, llamadas } = await llegarAlPaso2();

      let atendido = false;
      await act(async () => {
        atendido = atras.pulsar();
      });
      expect(atendido).toBe(true);
      expect(result.current.paso).toBe(1);
      expect(result.current.valores).toEqual({ actual: CLAVE, nueva: CLAVE_NUEVA, confirmacion: CLAVE_NUEVA });

      await tocar(() => result.current.enviarCodigo());
      expect(result.current.paso).toBe(2);
      expect(veces(llamadas, RUTA_CODIGO)).toBe(1);

      await tocar(() => result.current.volver());
      expect(result.current.paso).toBe(1);
      // Otra contraseña actual invalida el código pedido con la anterior.
      await llenar(result, { actual: 'OtraClaveFicticia4%' });
      expect(result.current.codigoVigente).toBe(false);
      await tocar(() => result.current.volver());
      expect(routerSimulado.back).toHaveBeenCalledTimes(1);
    } finally {
      atras.restaurar();
    }
  });

  it.each<[string, () => Promise<unknown>, string | null]>([
    ['se abre', () => Promise.resolve({ type: 'opened' }), null],
    ['no hay navegador', () => Promise.reject(new Error('sin navegador')), 'No pudimos abrir la recuperación de contraseña.'],
  ])('"Olvidé mi contraseña": si %s el aviso es %p', async (_caso, apertura, aviso) => {
    jest.mocked(openBrowserAsync).mockImplementationOnce(apertura as never);
    const { result } = await montarClave();

    await tocar(() => result.current.abrirOlvido());
    await asentar();
    expect(openBrowserAsync).toHaveBeenCalledWith('http://web.test/forgot-password');
    expect(result.current.aviso).toBe(aviso);
  });
});

// ── useFotoClienta ───────────────────────────────────────────────────────────────────────────

describe('useFotoClienta', () => {
  /** Cada prueba usa una cuenta nueva: la foto vive en memoria compartida entre pruebas. */
  function nuevaCuenta(): string {
    cuentas += 1;
    const id = `clienta-cabecera-${cuentas}`;
    conSesion(id);
    return id;
  }

  function perfilDe(id: string, foto: string | null): () => Response {
    return () => respuestaPerfil({ ...PERFIL_COMPLETO, id, foto });
  }

  it('sin sesión es null y no pide /me', async () => {
    const llamadas = servidorVm({});
    const { result } = await renderHook(() => useFotoClienta());

    await asentar();
    expect(result.current).toBeNull();
    expect(llamadas).toHaveLength(0);
  });

  it.each<[string, string | null, string | null]>([
    ['una foto de Cloudinary', FOTO_ANTERIOR, FOTO_ANTERIOR],
    ['una foto de otro sitio', 'http://otro.ejemplo.test/foto.jpg', null],
    ['ninguna foto', null, null],
  ])('con %s en /me muestra %p', async (_caso, foto, esperada) => {
    const id = nuevaCuenta();
    const llamadas = servidorVm({ [RUTA_ME]: perfilDe(id, foto) });
    const { result } = await renderHook(() => useFotoClienta());

    await waitFor(() => expect(veces(llamadas, RUTA_ME)).toBe(1));
    await asentar();
    expect(result.current).toBe(esperada);
  });

  it.each<[string, () => Salida]>([
    ['es de otra cuenta', perfilDe('otra-clienta', FOTO_ANTERIOR)],
    ['falla', fallaInterna],
  ])('si la respuesta de /me %s, no muestra foto', async (_caso, salida) => {
    nuevaCuenta();
    const llamadas = servidorVm({ [RUTA_ME]: salida });
    const { result } = await renderHook(() => useFotoClienta());

    await waitFor(() => expect(veces(llamadas, RUTA_ME)).toBe(1));
    await asentar();
    expect(result.current).toBeNull();
  });

  it('avisa a todas las cabeceras cuando Perfil cambia la foto', async () => {
    const id = nuevaCuenta();
    servidorVm({ [RUTA_ME]: perfilDe(id, FOTO_ANTERIOR) });
    const { result } = await renderHook(() => [useFotoClienta(), useFotoClienta()]);
    await waitFor(() => expect(result.current).toEqual([FOTO_ANTERIOR, FOTO_ANTERIOR]));

    await act(async () => {
      fijarFotoClienta(FOTO_NUEVA);
    });
    expect(result.current).toEqual([FOTO_NUEVA, FOTO_NUEVA]);
    await act(async () => {
      fijarFotoClienta('http://otro.ejemplo.test/foto.jpg');
    });
    expect(result.current).toEqual([null, null]);
  });

  it('sin sesión, fijarFotoClienta no muestra nada', async () => {
    servidorVm({});
    const { result } = await renderHook(() => useFotoClienta());
    await asentar();

    await act(async () => {
      fijarFotoClienta(FOTO_NUEVA);
    });
    expect(result.current).toBeNull();
  });

  it('el foco no vuelve a pedir /me antes del refresco; después sí', async () => {
    const id = nuevaCuenta();
    const llamadas = servidorVm({ [RUTA_ME]: perfilDe(id, FOTO_ANTERIOR) });
    const primera = await renderHook(() => useFotoClienta());
    await waitFor(() => expect(primera.result.current).toBe(FOTO_ANTERIOR));
    await primera.unmount();

    const segunda = await renderHook(() => useFotoClienta());
    await asentar();
    expect(segunda.result.current).toBe(FOTO_ANTERIOR);
    expect(veces(llamadas, RUTA_ME)).toBe(1);
    await segunda.unmount();

    jest.setSystemTime(Date.now() + 61_000);
    await renderHook(() => useFotoClienta());
    await waitFor(() => expect(veces(llamadas, RUTA_ME)).toBe(2));
  });

  it('al cambiar de cuenta descarta la lectura anterior, lee la nueva y al salir queda en null', async () => {
    const idA = nuevaCuenta();
    const pendiente = diferida();
    const fotoB = 'https://res.cloudinary.com/nube-ficticia/image/upload/v3/avatares/cuenta-b.jpg';
    let idB = '';
    const llamadas = servidorVm({
      [RUTA_ME]: enSecuencia(
        () => pendiente.promesa,
        () => respuestaPerfil({ ...PERFIL_COMPLETO, id: idB, foto: fotoB }),
      ),
    });
    const { result, rerender } = await renderHook(() => useFotoClienta());
    await waitFor(() => expect(veces(llamadas, RUTA_ME)).toBe(1));

    idB = nuevaCuenta();
    await rerender({});
    expect(result.current).toBeNull();
    await act(async () => {
      pendiente.soltar(perfilDe(idA, FOTO_ANTERIOR)());
    });
    await waitFor(() => expect(result.current).toBe(fotoB));
    expect(veces(llamadas, RUTA_ME)).toBe(2);

    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    await rerender({});
    expect(result.current).toBeNull();
  });
});

// ── Revisión de la consola ───────────────────────────────────────────────────────────────────

// Al terminar cada prueba: desmonta, corre lo pendiente dentro de act y revisa que React y la app no
// hayan escrito ningún error ni aviso (por ejemplo, una actualización fuera de act).
espiarConsola(cerrarConTemporizadores, true);
