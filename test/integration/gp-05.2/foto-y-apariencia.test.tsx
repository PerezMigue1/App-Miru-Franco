/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Appearance, Linking, StyleSheet } from 'react-native';
import type { TestInstance } from 'test-renderer';

import { temaClaro, temaOscuro } from '@/shared/ui/colores';

import { LIMITE_MS, prepararPruebasDePantalla, ultimoBoton } from '../../helpers/pantallas';
import { abrirPerfilConSesion } from '../../helpers/pantallasPerfil';
import { CLIENTA, PERFIL_COMPLETO } from '../../helpers/perfilClienta';
import { leerSecureStore } from '../../helpers/secureStore';
import { sesionGuardada } from '../../helpers/sesionGuardada';
import { llamadasA, respuesta, type Llamada } from '../../helpers/servidorSimulado';

/**
 * GP-05.2 (#18): foto de perfil y apariencia desde Perfil, con las pantallas reales (renderRouter
 * sobre src/app). Solo van simulados el servidor, Cloudinary (responde el mismo fetch simulado),
 * el selector de imágenes, el recorte y los archivos locales.
 */

// Selector de imágenes: cada prueba decide el permiso y la foto elegida.
jest.mock('expo-image-picker', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

// Recorte y reducción: devuelve un JPEG listo en la caché, sin tocar imágenes reales.
jest.mock('expo-image-manipulator', () => {
  const { manipuladorSimulado } =
    jest.requireActual<typeof import('../../helpers/fotoSimulada')>('../../helpers/fotoSimulada');
  const { contexto } = manipuladorSimulado('file:///cache/foto-lista.jpg', 1024);
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    ImageManipulator: { manipulate: jest.fn(() => contexto) },
  };
});

// Archivo local: guarda la uri, pesa 200 KB y se puede borrar.
jest.mock('expo-file-system', () => ({
  File: class {
    readonly uri: string;
    readonly size = 200 * 1024;
    readonly exists = true;

    constructor(uri: string) {
      this.uri = uri;
    }

    delete(): void {
      // Nada que borrar en la prueba.
    }
  },
}));

const URL_SUBIDA = 'https://api.cloudinary.com/v1_1/nube-ficticia/image/upload';
const URL_FOTO = 'https://res.cloudinary.com/nube-ficticia/image/upload/v1/avatares/usuario_clienta-perfil-1.jpg';
const URI_ELEGIDA = 'file:///cache/foto-elegida.jpg';
const RUTA_FIRMA = '/api/auth/me/foto/firma';
const AVISO_PERMISO =
  'Para elegir tu foto, permite que la app vea tus fotos desde los ajustes del teléfono.';
const FILA_APARIENCIA = 'Apariencia, Claro, oscuro o igual que tu teléfono.';

const PARAMS_FIRMA = {
  folder: 'avatares',
  public_id: `usuario_${CLIENTA.id}`,
  overwrite: 'true',
  timestamp: '1760000000',
};

/** Rutas de la foto: firma, subida a Cloudinary y guardado en /me. */
const RUTAS_FOTO = {
  [`POST ${RUTA_FIRMA}`]: () =>
    respuesta({
      success: true,
      data: { uploadUrl: URL_SUBIDA, apiKey: 'llave-ficticia', signature: 'firma-ficticia', params: PARAMS_FIRMA },
    }),
  [`POST ${URL_SUBIDA}`]: () => respuesta({ secure_url: URL_FOTO, public_id: PARAMS_FIRMA.public_id }),
  'PATCH /api/auth/me': () => respuesta({ success: true, data: { ...PERFIL_COMPLETO, foto: URL_FOTO } }),
};

function permiso(concedido: boolean): ImagePicker.PermissionResponse {
  return {
    granted: concedido,
    status: concedido ? ImagePicker.PermissionStatus.GRANTED : ImagePicker.PermissionStatus.DENIED,
    canAskAgain: !concedido,
    expires: 'never',
  };
}

/** Lo que recibió el fetch simulado para una url (el cuerpo y las cabeceras tal cual). */
function opcionesEnviadas(url: string): RequestInit[] {
  const llamadas = (globalThis.fetch as unknown as jest.Mock).mock.calls as [unknown, RequestInit][];
  return llamadas.filter(([entrada]) => entrada === url).map(([, init]) => init);
}

/** Toca el avatar y, en la hoja "Foto de perfil", "Elegir de la galería". */
async function elegirDeGaleria(): Promise<void> {
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir foto de perfil' }));
  expect(await screen.findByText('Foto de perfil')).toBeOnTheScreen();
  await fireEvent.press(ultimoBoton('Elegir de la galería'));
}

/** Nada de la subida salió: ni firma, ni Cloudinary, ni guardado. */
function sinSubida(llamadas: Llamada[]): void {
  expect(llamadasA(llamadas, 'POST', RUTA_FIRMA)).toHaveLength(0);
  expect(opcionesEnviadas(URL_SUBIDA)).toHaveLength(0);
  expect(llamadasA(llamadas, 'PATCH', '/api/auth/me')).toHaveLength(0);
}

/** Fondo de la pantalla de Perfil: el primer contenedor con color de fondo sobre el correo. */
function fondoDePerfil(): unknown {
  let nodo: TestInstance | null = screen.getByText(CLIENTA.email);
  while (nodo) {
    const fondo = StyleSheet.flatten(nodo.props.style)?.backgroundColor;
    if (fondo !== undefined) {
      return fondo;
    }
    nodo = nodo.parent;
  }
  return undefined;
}

const SISTEMA = 'Sistema. Sigue la configuración del teléfono';
const CLARO = 'Claro. Lino y vino';
const OSCURO = 'Oscuro. Carbón y oro';

/**
 * Abre la hoja Apariencia desde Perfil, revisa que marque la opción vigente, elige la nueva y
 * espera a que la hoja se cierre.
 */
async function cambiarApariencia(vigente: string, nueva: string): Promise<void> {
  await fireEvent.press(screen.getByRole('button', { name: FILA_APARIENCIA }));
  expect(await screen.findByRole('radio', { name: vigente })).toBeChecked();
  for (const otra of [SISTEMA, CLARO, OSCURO].filter((opcion) => opcion !== vigente)) {
    expect(screen.getByRole('radio', { name: otra })).not.toBeChecked();
  }
  await fireEvent.press(screen.getByRole('radio', { name: nueva }));
  await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Apariencia' })).not.toBeOnTheScreen());
}

describe('Foto de perfil y apariencia (GP-05.2)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  // Cada prueba cuenta sus propias llamadas al selector y al recorte.
  beforeEach(() => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockReset();
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockReset();
    jest.mocked(ImageManipulator.manipulate).mockClear();
  });

  it(
    'con permiso: pide la firma, sube a Cloudinary, guarda la url en /me y muestra la foto nueva',
    async () => {
      jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(permiso(true));
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
        canceled: false,
        assets: [{ uri: URI_ELEGIDA, width: 2000, height: 1500 }],
      });
      const { llamadas } = await abrirPerfilConSesion(RUTAS_FOTO);
      const { token } = sesionGuardada() ?? { token: '' };

      await elegirDeGaleria();

      // Al terminar, el avatar ofrece cambiar la foto y la muestra.
      expect(await screen.findByRole('button', { name: 'Cambiar foto de perfil' })).toBeOnTheScreen();
      expect(
        screen.container.queryAll((nodo) => JSON.stringify(nodo.props.source ?? null).includes(URL_FOTO)).length,
      ).toBeGreaterThan(0);

      // El selector se abrió cuadrado y la foto se preparó antes de subirla.
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      expect(ImageManipulator.manipulate).toHaveBeenCalledWith(URI_ELEGIDA);

      // Firma con la sesión de la clienta.
      const firmas = llamadasA(llamadas, 'POST', RUTA_FIRMA);
      expect(firmas).toHaveLength(1);
      expect(firmas[0].cabeceras.Authorization).toBe(`Bearer ${token}`);

      // Subida a Cloudinary sin el token de la app, con la firma y cada parámetro tal cual.
      const subidas = opcionesEnviadas(URL_SUBIDA);
      expect(subidas).toHaveLength(1);
      expect(subidas[0].method).toBe('POST');
      expect(subidas[0].headers).toBeUndefined();
      const formulario = subidas[0].body as FormData;
      expect(formulario).toBeInstanceOf(FormData);
      expect(formulario.get('api_key')).toBe('llave-ficticia');
      expect(formulario.get('signature')).toBe('firma-ficticia');
      for (const [nombre, valor] of Object.entries(PARAMS_FIRMA)) {
        expect(formulario.get(nombre)).toBe(valor);
      }
      expect(formulario.has('file')).toBe(true);

      // La url segura de Cloudinary se guarda en el perfil con la sesión de la clienta.
      const guardados = llamadasA(llamadas, 'PATCH', '/api/auth/me');
      expect(guardados).toHaveLength(1);
      expect(guardados[0].cuerpo).toEqual({ foto: URL_FOTO });
      expect(guardados[0].cabeceras.Authorization).toBe(`Bearer ${token}`);
      expect(screen.queryByText(AVISO_PERMISO)).not.toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin permiso: explica en español cómo darlo, ofrece los ajustes y no sube nada',
    async () => {
      jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(permiso(false));
      const abrirAjustes = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
      const { llamadas } = await abrirPerfilConSesion(RUTAS_FOTO);

      await elegirDeGaleria();

      expect(await screen.findByText(AVISO_PERMISO)).toBeOnTheScreen();
      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
      expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
      sinSubida(llamadas);
      expect(screen.getByRole('button', { name: 'Elegir foto de perfil' })).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Abrir ajustes' }));
      expect(abrirAjustes).toHaveBeenCalledTimes(1);
      abrirAjustes.mockRestore();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'la apariencia se elige en su hoja, se guarda en el teléfono y cambia el fondo de la pantalla',
    async () => {
      const esquema = jest.spyOn(Appearance, 'setColorScheme');
      await abrirPerfilConSesion();
      expect(leerSecureStore().preferencia_apariencia).toBeUndefined();

      // Oscuro: se guarda, se aplica al teléfono y el fondo pasa a carbón.
      await cambiarApariencia(SISTEMA, OSCURO);
      expect(leerSecureStore().preferencia_apariencia).toBe('oscuro');
      expect(esquema).toHaveBeenLastCalledWith('dark');
      expect(fondoDePerfil()).toBe(temaOscuro.fondo);

      // Claro: el fondo vuelve a lino.
      await cambiarApariencia(OSCURO, CLARO);
      expect(leerSecureStore().preferencia_apariencia).toBe('claro');
      expect(esquema).toHaveBeenLastCalledWith('light');
      expect(fondoDePerfil()).toBe(temaClaro.fondo);

      // Sistema devuelve el control al teléfono: el fondo sigue su esquema.
      await cambiarApariencia(CLARO, SISTEMA);
      expect(leerSecureStore().preferencia_apariencia).toBe('sistema');
      expect(esquema).toHaveBeenLastCalledWith('unspecified');
      const sistemaOscuro = Appearance.getColorScheme() === 'dark';
      expect(fondoDePerfil()).toBe(sistemaOscuro ? temaOscuro.fondo : temaClaro.fondo);
      esquema.mockRestore();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
