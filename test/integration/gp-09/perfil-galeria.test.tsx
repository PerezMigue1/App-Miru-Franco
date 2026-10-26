/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import * as ImagePicker from 'expo-image-picker';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { reiniciarReaceptacion } from '@/features/auth/viewmodels/useDocumentosPendientes';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';

import { permisoGaleria, simularAndroid } from '../../helpers/galeriaAndroid';
import { LIMITE_MS, prepararPruebasDePantalla, ultimoBoton } from '../../helpers/pantallas';
import { abrirPerfilConSesion } from '../../helpers/pantallasPerfil';

/**
 * GP-09 (#9), bloque D, con las pantallas reales (renderRouter sobre src/app): la galería de la foto
 * de perfil en Android 13 o más nuevo (sin permiso) y en Android 12 (explicación antes del permiso),
 * y la fila "Mis datos y privacidad" en Tu cuenta. Solo van simulados el servidor (API en
 * http://api.test) y el selector de imágenes; la clienta cancela la selección, así que nada se sube.
 */

jest.mock('expo-image-picker', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  getMediaLibraryPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const TITULO_EXPLICACION = 'Elegir tu foto de perfil';
const AVISO_AJUSTES = 'Para elegir tu foto, permite que la app vea tus fotos desde los ajustes del teléfono.';
const AVISO_NEGADO =
  'Sin el permiso no podemos abrir tus fotos. Cuando quieras, toca tu foto otra vez y el teléfono te lo volverá a pedir.';

/** Toca el avatar y, en la hoja "Foto de perfil", "Elegir de la galería". */
async function elegirDeGaleria(): Promise<void> {
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir foto de perfil' }));
  expect(await screen.findByText('Foto de perfil')).toBeOnTheScreen();
  await fireEvent.press(ultimoBoton('Elegir de la galería'));
}

describe('Galería de la foto de perfil y fila Mis datos (GP-09)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();
  let restaurarPlataforma: () => void = () => undefined;

  beforeEach(() => {
    reiniciarReaceptacion();
    reiniciarDocumentosLegales();
    // Por omisión el permiso aún no está concedido: en Android 12 sale la explicación.
    jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockReset();
    jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(permisoGaleria('negado'));
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockReset();
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockReset();
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null });
  });

  afterEach(() => {
    restaurarPlataforma();
    restaurarPlataforma = () => undefined;
  });

  it(
    'Android 13: "Elegir de la galería" abre el selector del sistema directo, sin explicación ni permiso',
    async () => {
      await abrirPerfilConSesion();
      restaurarPlataforma = simularAndroid(33);

      await elegirDeGaleria();

      await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
      expect(ImagePicker.getMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
      expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
      expect(screen.queryByRole('header', { name: TITULO_EXPLICACION })).not.toBeOnTheScreen();
      expect(screen.queryByText(AVISO_AJUSTES)).not.toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Android 12 con el permiso ya concedido: abre el selector directo, sin explicación ni pregunta',
    async () => {
      jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(permisoGaleria('concedido'));
      await abrirPerfilConSesion();
      restaurarPlataforma = simularAndroid(32);

      await elegirDeGaleria();

      await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
      expect(ImagePicker.getMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
      expect(screen.queryByRole('header', { name: TITULO_EXPLICACION })).not.toBeOnTheScreen();
      expect(screen.queryByText(AVISO_AJUSTES)).not.toBeOnTheScreen();
      expect(screen.queryByText(AVISO_NEGADO)).not.toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Android 12 si la consulta del permiso falla: sale la explicación (camino seguro)',
    async () => {
      jest.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockRejectedValue(new Error('sin respuesta'));
      await abrirPerfilConSesion();
      restaurarPlataforma = simularAndroid(32);

      await elegirDeGaleria();

      expect(await screen.findByRole('header', { name: TITULO_EXPLICACION })).toBeOnTheScreen();
      expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Android 12 sin el permiso: la explicación sale sola (sin la hoja de opciones) y "Ahora no" no pide nada',
    async () => {
      await abrirPerfilConSesion();
      restaurarPlataforma = simularAndroid(32);

      await elegirDeGaleria();

      expect(await screen.findByRole('header', { name: TITULO_EXPLICACION })).toBeOnTheScreen();
      expect(screen.getByText(/Para cambiar tu foto de perfil/)).toBeOnTheScreen();
      // La hoja de opciones ya se cerró: su encabezado no queda junto a la explicación.
      await waitFor(() => expect(screen.queryByRole('header', { name: 'Foto de perfil' })).not.toBeOnTheScreen());

      await fireEvent.press(ultimoBoton('Ahora no'));
      await waitFor(() =>
        expect(screen.queryByRole('header', { name: TITULO_EXPLICACION })).not.toBeOnTheScreen(),
      );
      expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
      expect(screen.queryByText(AVISO_AJUSTES)).not.toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Android 12: "Continuar" pide el permiso; concedido abre la galería',
    async () => {
      jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(permisoGaleria('concedido'));
      await abrirPerfilConSesion();
      restaurarPlataforma = simularAndroid(32);

      await elegirDeGaleria();
      expect(await screen.findByRole('header', { name: TITULO_EXPLICACION })).toBeOnTheScreen();
      await fireEvent.press(ultimoBoton('Continuar'));

      await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
      expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(AVISO_AJUSTES)).not.toBeOnTheScreen();
      expect(screen.queryByText(AVISO_NEGADO)).not.toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Android 12: negado para siempre deja "Abrir ajustes" y no abre la galería',
    async () => {
      jest
        .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
        .mockResolvedValue(permisoGaleria('negadoParaSiempre'));
      await abrirPerfilConSesion();
      restaurarPlataforma = simularAndroid(32);

      await elegirDeGaleria();
      expect(await screen.findByRole('header', { name: TITULO_EXPLICACION })).toBeOnTheScreen();
      await fireEvent.press(ultimoBoton('Continuar'));

      expect(await screen.findByText(AVISO_AJUSTES)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Abrir ajustes' })).toBeOnTheScreen();
      expect(screen.queryByText(AVISO_NEGADO)).not.toBeOnTheScreen();
      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Android 12: negado esta vez avisa que puede volver a intentarlo, sin "Abrir ajustes"',
    async () => {
      jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(permisoGaleria('negado'));
      await abrirPerfilConSesion();
      restaurarPlataforma = simularAndroid(32);

      await elegirDeGaleria();
      expect(await screen.findByRole('header', { name: TITULO_EXPLICACION })).toBeOnTheScreen();
      await fireEvent.press(ultimoBoton('Continuar'));

      expect(await screen.findByText(AVISO_NEGADO)).toBeOnTheScreen();
      expect(screen.queryByText(AVISO_AJUSTES)).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Abrir ajustes' })).not.toBeOnTheScreen();
      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Tu cuenta muestra "Mis datos y privacidad" con su descripción después de Mi cuenta',
    async () => {
      await abrirPerfilConSesion();

      const fila = screen.getByRole('button', {
        name: 'Mis datos y privacidad, Tus derechos ARCO, tus solicitudes y tus permisos',
      });
      expect(fila).toBeOnTheScreen();
      const botones = screen.getAllByRole('button').map((boton) => boton.props.accessibilityLabel as string);
      const miCuenta = botones.findIndex((nombre) => nombre?.startsWith('Mi cuenta,'));
      const misDatos = botones.findIndex((nombre) => nombre?.startsWith('Mis datos y privacidad,'));
      expect(miCuenta).toBeGreaterThanOrEqual(0);
      expect(misDatos).toBe(miCuenta + 1);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
