/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import {
  API_SELECTOR_SIN_PERMISO,
  galeriaSinPermiso,
  resultadoPermisoGaleria,
} from '@/features/auth/models/permisoGaleria';
import { usePerfilViewModel } from '@/features/auth/viewmodels/usePerfilViewModel';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { nuevaGeneracion } from '@/shared/api/tokenStorage';
import { AparienciaProvider } from '@/shared/ui/apariencia';

import { espiarConsola } from '../../helpers/consola';
import { permisoGaleria, simularAndroid } from '../../helpers/galeriaAndroid';
import { CLIENTA, PERFIL_COMPLETO, respuestaPerfil } from '../../helpers/perfilClienta';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import {
  authSimulada,
  cerrarConTemporizadores,
  reiniciarSimulaciones,
  routerSimulado,
  servidorVm,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-09 (#9), bloque D: la galería de la foto de perfil sin el permiso bloqueado en el APK. En
 * Android 13 o más nuevo el selector del sistema se abre directo; en Android 12 o anterior, una hoja
 * explica para qué es antes de pedir el permiso, salvo que ya esté concedido (se consulta antes).
 * También la fila "Mis datos y privacidad". Se simulan fetch (API en http://api.test), expo-router, useAuth, el selector de fotos y los archivos locales.
 */

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

jest.mock('expo-file-system', () => ({
  File: class {
    readonly uri: string;
    readonly size = 200_000;
    readonly exists = true;

    constructor(uri: string) {
      this.uri = uri;
    }

    delete(): void {
      // Nada que borrar en la prueba.
    }
  },
}));

jest.mock('expo-image-manipulator', () => {
  const { manipuladorSimulado } =
    jest.requireActual<typeof import('../../helpers/fotoSimulada')>('../../helpers/fotoSimulada');
  const { contexto } = manipuladorSimulado('file:///cache/galeria-lista.jpg', 1024);
  return { SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate: jest.fn(() => contexto) } };
});

const URL_SUBIDA = 'https://api.cloudinary.com/v1_1/nube-ficticia/image/upload';
const FOTO_NUEVA = 'https://res.cloudinary.com/nube-ficticia/image/upload/v3/avatares/galeria.jpg';
const RUTA_FIRMA = '/api/auth/me/foto/firma';

const RUTAS = {
  'GET /api/auth/me': () => respuestaPerfil({ ...PERFIL_COMPLETO, foto: null }),
  [`POST ${RUTA_FIRMA}`]: () =>
    respuesta({
      success: true,
      data: { uploadUrl: URL_SUBIDA, apiKey: 1, signature: 'firma-ficticia', params: { timestamp: '1' } },
    }),
  [`POST ${URL_SUBIDA}`]: () => respuesta({ secure_url: FOTO_NUEVA }),
  'PATCH /api/auth/me': () => respuesta({ success: true }),
};

type Vm = { current: ReturnType<typeof usePerfilViewModel> };

let restaurarPlataforma: (() => void) | null = null;

function enAndroid(version: number): void {
  restaurarPlataforma = simularAndroid(version);
}

async function montar() {
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = { ...CLIENTA };
  const llamadas = servidorVm(RUTAS);
  const vista = await renderHook(() => usePerfilViewModel(), { wrapper: AparienciaProvider });
  await waitFor(() => expect(vista.result.current.estado).toBe('listo'));
  return { ...vista, llamadas };
}

/** Toca el avatar y "Elegir de la galería": la hoja de opciones siempre se cierra antes. */
async function elegirDeGaleria(result: Vm): Promise<void> {
  await act(async () => {
    result.current.abrirOpcionesFoto();
  });
  await act(async () => {
    result.current.elegirFoto();
  });
  expect(result.current.opcionesFoto).toBe(false);
  // En Android 12 o anterior, la consulta del permiso responde antes de la explicación.
  await asentar();
  // La hoja de opciones terminó de irse (alCerrarse de Hoja): ya puede salir la explicación.
  await act(async () => {
    result.current.alCerrarseOpciones();
  });
}

async function continuar(result: Vm): Promise<void> {
  await act(async () => {
    result.current.continuarGaleria();
  });
  expect(result.current.explicacionGaleria).toBe(false);
}

async function asentar(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  reiniciarSimulaciones();
  // Por omisión el permiso aún no está concedido: en Android 12 sale la explicación.
  jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockReset();
  jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(permisoGaleria('negado'));
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockReset();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockReset();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null } as never);
});

afterEach(() => {
  restaurarPlataforma?.();
  restaurarPlataforma = null;
});

describe('permisoGaleria (modelo)', () => {
  it.each<[string, number | string, boolean]>([
    ['Android 12L (32)', 32, false],
    ['Android 13 (33)', API_SELECTOR_SIN_PERMISO, true],
    ['Android 14 (34)', 34, true],
    ['Android con la versión en texto', '35', true],
  ])('%s, versión %s: galeriaSinPermiso es %s', (_caso, version, esperado) => {
    expect(galeriaSinPermiso('android', version)).toBe(esperado);
  });

  it('fuera de Android (iOS en las pruebas) la galería no se abre sin revisar el permiso', () => {
    expect(Platform.OS).toBe('ios');
    expect(galeriaSinPermiso(Platform.OS, Platform.Version)).toBe(false);
    expect(galeriaSinPermiso('ios', 40)).toBe(false);
  });

  it('clasifica la respuesta del permiso', () => {
    expect(resultadoPermisoGaleria(permisoGaleria('concedido'))).toBe('concedido');
    expect(resultadoPermisoGaleria(permisoGaleria('negado'))).toBe('negado');
    expect(resultadoPermisoGaleria(permisoGaleria('negadoParaSiempre'))).toBe('negadoParaSiempre');
  });
});

describe('usePerfilViewModel: galería en Android 13 o más nuevo', () => {
  it.each([33, 34])('API %i: abre el selector directo, sin explicación ni permiso, y sube la foto', async (api) => {
    enAndroid(api);
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/galeria.jpg', width: 1200, height: 1200 }],
    } as never);
    const { result, llamadas } = await montar();

    await elegirDeGaleria(result);
    await waitFor(() => expect(result.current.perfil?.foto).toBe(FOTO_NUEVA));

    expect(result.current.explicacionGaleria).toBe(false);
    expect(ImagePicker.getMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(llamadasA(llamadas, 'POST', RUTA_FIRMA)).toHaveLength(1);
    expect(result.current.permisoDenegado).toBe(false);
    expect(result.current.avisoPermisoGaleria).toBeNull();
  });
});

describe('usePerfilViewModel: galería en Android 12 o anterior', () => {
  beforeEach(() => enAndroid(32));

  it('sin el permiso concedido, primero explica para qué es, sin pedir el permiso ni abrir el selector', async () => {
    const { result } = await montar();

    await elegirDeGaleria(result);

    expect(ImagePicker.getMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.explicacionGaleria).toBe(true);
    expect(result.current.textosGaleria).toEqual({
      titulo: obtenerTexto('perfil.galeria.titulo'),
      texto: obtenerTexto('perfil.galeria.texto'),
      continuar: obtenerTexto('perfil.galeria.continuar'),
      ahoraNo: obtenerTexto('perfil.galeria.ahoraNo'),
    });
    expect(result.current.textosGaleria.titulo).not.toBe('perfil.galeria.titulo');
    expect(result.current.textosGaleria.texto).toContain('foto de perfil');
    await asentar();
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('la explicación espera a que la hoja de opciones termine de irse: las dos hojas no se cruzan', async () => {
    const { result } = await montar();
    await act(async () => {
      result.current.abrirOpcionesFoto();
    });
    await act(async () => {
      result.current.elegirFoto();
    });
    await asentar();

    // La consulta ya respondió, pero la hoja de opciones sigue bajando.
    expect(ImagePicker.getMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.explicacionGaleria).toBe(false);

    await act(async () => {
      result.current.alCerrarseOpciones();
    });
    expect(result.current.explicacionGaleria).toBe(true);
  });

  it('con el permiso ya concedido abre el selector directo, sin explicación ni pregunta, y sube la foto', async () => {
    jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(permisoGaleria('concedido'));
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/galeria.jpg', width: 1200, height: 1200 }],
    } as never);
    const { result, llamadas } = await montar();

    await elegirDeGaleria(result);
    await waitFor(() => expect(result.current.perfil?.foto).toBe(FOTO_NUEVA));

    expect(ImagePicker.getMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.explicacionGaleria).toBe(false);
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(llamadasA(llamadas, 'POST', RUTA_FIRMA)).toHaveLength(1);
    expect(result.current.permisoDenegado).toBe(false);
    expect(result.current.avisoPermisoGaleria).toBeNull();
  });

  it('negado para siempre en la consulta: también explica antes y deja la pregunta a "Continuar"', async () => {
    jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(permisoGaleria('negadoParaSiempre'));
    jest
      .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
      .mockResolvedValue(permisoGaleria('negadoParaSiempre'));
    const { result } = await montar();

    await elegirDeGaleria(result);
    expect(result.current.explicacionGaleria).toBe(true);
    expect(result.current.permisoDenegado).toBe(false);
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();

    await continuar(result);
    await waitFor(() => expect(result.current.permisoDenegado).toBe(true));
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('si la consulta del permiso falla, sigue por el camino seguro: la explicación y luego la pregunta', async () => {
    jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockRejectedValue(new Error('sin respuesta del teléfono'));
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(permisoGaleria('concedido'));
    const { result } = await montar();

    await elegirDeGaleria(result);

    expect(result.current.explicacionGaleria).toBe(true);
    expect(result.current.errorFoto).toBeNull();
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();

    await continuar(result);
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('dos toques seguidos: una sola consulta y un solo selector', async () => {
    let responder: (permiso: ImagePicker.PermissionResponse) => void = () => undefined;
    jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockReturnValue(
      new Promise((resolver) => {
        responder = resolver;
      }),
    );
    let cerrarSelector: (eleccion: ImagePicker.ImagePickerResult) => void = () => undefined;
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockReturnValue(
      new Promise((resolver) => {
        cerrarSelector = resolver;
      }),
    );
    const { result } = await montar();

    // Dos toques mientras se consulta el permiso.
    await act(async () => {
      result.current.elegirFoto();
      result.current.elegirFoto();
    });
    expect(ImagePicker.getMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      responder(permisoGaleria('concedido'));
    });
    await asentar();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);

    // Otro toque con el selector abierto tampoco consulta ni abre otro.
    await act(async () => {
      result.current.elegirFoto();
    });
    await asentar();
    expect(ImagePicker.getMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(result.current.explicacionGaleria).toBe(false);

    // Al cerrar el selector, el candado se suelta: un toque nuevo vuelve a consultar.
    await act(async () => {
      cerrarSelector({ canceled: true, assets: null });
    });
    await asentar();
    jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(permisoGaleria('negado'));
    await elegirDeGaleria(result);
    expect(ImagePicker.getMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(2);
    expect(result.current.explicacionGaleria).toBe(true);
  });

  it.each<['concedido' | 'negado']>([['concedido'], ['negado']])(
    'si la sesión cambia mientras se consulta el permiso (%s), se abandona en silencio',
    async (caso) => {
      let responder: (permiso: ImagePicker.PermissionResponse) => void = () => undefined;
      jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockReturnValue(
        new Promise((resolver) => {
          responder = resolver;
        }),
      );
      const { result } = await montar();

      await act(async () => {
        result.current.elegirFoto();
      });
      nuevaGeneracion();
      await act(async () => {
        responder(permisoGaleria(caso));
      });
      await asentar();

      expect(result.current.explicacionGaleria).toBe(false);
      expect(result.current.errorFoto).toBeNull();
      expect(result.current.permisoDenegado).toBe(false);
      expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    },
  );

  it('"Ahora no" cierra la explicación sin pedir nada', async () => {
    const { result, llamadas } = await montar();

    await elegirDeGaleria(result);
    await act(async () => {
      result.current.cerrarExplicacionGaleria();
    });
    await asentar();

    expect(result.current.explicacionGaleria).toBe(false);
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(llamadasA(llamadas, 'POST', RUTA_FIRMA)).toHaveLength(0);
    expect(result.current.permisoDenegado).toBe(false);
    expect(result.current.avisoPermisoGaleria).toBeNull();
  });

  it('"Continuar" pide el permiso y, concedido, abre la galería', async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(permisoGaleria('concedido'));
    const { result } = await montar();

    await elegirDeGaleria(result);
    await continuar(result);
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));

    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.permisoDenegado).toBe(false);
    expect(result.current.avisoPermisoGaleria).toBeNull();
  });

  it('negado para siempre: no abre la galería y deja "Abrir ajustes"', async () => {
    jest
      .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
      .mockResolvedValue(permisoGaleria('negadoParaSiempre'));
    const { result, llamadas } = await montar();

    await elegirDeGaleria(result);
    await continuar(result);
    await waitFor(() => expect(result.current.permisoDenegado).toBe(true));

    expect(result.current.avisoPermisoGaleria).toBeNull();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(llamadasA(llamadas, 'POST', RUTA_FIRMA)).toHaveLength(0);
  });

  it('negado esta vez: no abre nada ni ofrece los ajustes; avisa que se puede volver a intentar', async () => {
    jest
      .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
      .mockResolvedValueOnce(permisoGaleria('negado'))
      .mockResolvedValueOnce(permisoGaleria('concedido'));
    const { result } = await montar();

    await elegirDeGaleria(result);
    await continuar(result);
    await waitFor(() => expect(result.current.avisoPermisoGaleria).toBe(obtenerTexto('perfil.galeria.negado')));
    expect(result.current.permisoDenegado).toBe(false);
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();

    // Al intentarlo otra vez y conceder, el aviso se va y la galería se abre.
    await elegirDeGaleria(result);
    expect(result.current.explicacionGaleria).toBe(true);
    await continuar(result);
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
    expect(result.current.avisoPermisoGaleria).toBeNull();
    expect(result.current.permisoDenegado).toBe(false);
  });

  it('si la sesión cambia mientras el teléfono pregunta, se abandona en silencio', async () => {
    let responder: (permiso: ImagePicker.PermissionResponse) => void = () => undefined;
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockReturnValue(
      new Promise((resolver) => {
        responder = resolver;
      }),
    );
    const { result } = await montar();

    await elegirDeGaleria(result);
    await continuar(result);
    nuevaGeneracion();
    await act(async () => {
      responder(permisoGaleria('negado'));
    });
    await asentar();

    expect(result.current.avisoPermisoGaleria).toBeNull();
    expect(result.current.permisoDenegado).toBe(false);
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('al cerrarse la sesión con la explicación abierta, la explicación se cierra', async () => {
    const { result, rerender } = await montar();

    await elegirDeGaleria(result);
    expect(result.current.explicacionGaleria).toBe(true);
    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    await act(async () => {
      rerender({});
    });

    expect(result.current.estado).toBe('sinSesion');
    expect(result.current.explicacionGaleria).toBe(false);
  });
});

describe('usePerfilViewModel: galería fuera de Android (iOS en las pruebas)', () => {
  it('también consulta el permiso: concedido abre el selector directo; sin él, explica antes', async () => {
    expect(Platform.OS).toBe('ios');
    jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValueOnce(permisoGaleria('concedido'));
    const { result } = await montar();

    await elegirDeGaleria(result);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(result.current.explicacionGaleria).toBe(false);

    await elegirDeGaleria(result);
    expect(result.current.explicacionGaleria).toBe(true);
    expect(ImagePicker.getMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(2);
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });
});

describe('usePerfilViewModel: fila "Mis datos y privacidad"', () => {
  it('trae sus textos del catálogo y abre /mis-datos', async () => {
    const { result } = await montar();

    expect(result.current.filaMisDatos).toEqual({
      titulo: obtenerTexto('privacidad.app.fila'),
      descripcion: obtenerTexto('privacidad.app.filaDescripcion'),
    });
    expect(result.current.filaMisDatos.titulo).toBe('Mis datos y privacidad');
    await act(async () => {
      result.current.abrirMisDatos();
    });
    expect(routerSimulado.push).toHaveBeenCalledWith('/mis-datos');
  });
});

espiarConsola(cerrarConTemporizadores, true);
