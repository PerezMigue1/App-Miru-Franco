/// <reference types="node" />

import fs from 'fs';
import path from 'path';

/**
 * GP-02: configuración del proyecto Expo. Lee app.json y eas.json reales desde la raíz del repo y
 * verifica que la identidad de la app, los plugins y los perfiles de EAS sigan siendo los acordados.
 */

const RAIZ = path.resolve(__dirname, '../../..');

function leerJson<T>(archivo: string): T {
  const ruta = path.join(RAIZ, archivo);
  return JSON.parse(fs.readFileSync(ruta, 'utf8')) as T;
}

type Plugin = string | [string, Record<string, unknown>];

interface AppJson {
  expo: {
    name: string;
    slug: string;
    scheme: string;
    android: { package: string };
    plugins: Plugin[];
    experiments?: { typedRoutes?: boolean };
    extra: { eas: { projectId: string } };
  };
}

interface PerfilEas {
  developmentClient?: boolean;
  distribution?: string;
  android?: { buildType?: string };
  env?: Record<string, string>;
}

interface EasJson {
  build: Record<string, PerfilEas>;
}

function nombrePlugin(plugin: Plugin): string {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

describe('app.json', () => {
  const { expo } = leerJson<AppJson>('app.json');

  it('tiene el nombre, el slug y el esquema de la app', () => {
    expect(expo.name).toBe('Miru Franco');
    expect(expo.slug).toBe('App-Miru-Franco');
    expect(expo.scheme).toBe('appmirufranco');
  });

  it('usa el paquete de Android com.mirufranco.app', () => {
    expect(expo.android.package).toBe('com.mirufranco.app');
  });

  it('apunta al proyecto de EAS correcto', () => {
    expect(expo.extra.eas.projectId).toBe('90dee585-d39c-4627-b4e0-f416af31e84e');
  });

  it('declara los plugins que la app necesita', () => {
    const nombres = expo.plugins.map(nombrePlugin);
    expect(nombres).toEqual([
      'expo-router',
      'expo-splash-screen',
      'expo-secure-store',
      'expo-image-picker',
      'expo-build-properties',
    ]);
  });

  it('expo-image-picker no pide permisos de cámara ni de micrófono', () => {
    const picker = expo.plugins.find((p) => nombrePlugin(p) === 'expo-image-picker');
    expect(Array.isArray(picker)).toBe(true);
    const opciones = (picker as [string, Record<string, unknown>])[1];
    expect(opciones.cameraPermission).toBe(false);
    expect(opciones.microphonePermission).toBe(false);
  });

  it('tiene activadas las rutas tipadas de Expo Router', () => {
    expect(expo.experiments?.typedRoutes).toBe(true);
  });
});

describe('eas.json', () => {
  const { build } = leerJson<EasJson>('eas.json');

  it('solo define los perfiles development, preview y production', () => {
    expect(Object.keys(build).sort()).toEqual(['development', 'preview', 'production']);
  });

  it('development es un development build interno en APK', () => {
    const perfil = build.development;
    expect(perfil.developmentClient).toBe(true);
    expect(perfil.distribution).toBe('internal');
    expect(perfil.android?.buildType).toBe('apk');
  });

  it('preview es un APK interno sin development client', () => {
    const perfil = build.preview;
    expect(perfil.developmentClient).toBeUndefined();
    expect(perfil.distribution).toBe('internal');
    expect(perfil.android?.buildType).toBe('apk');
  });

  it('preview define las variables públicas de la API y la web', () => {
    const claves = Object.keys(build.preview.env ?? {}).sort();
    expect(claves).toEqual(['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_WEB_URL', 'OFUSCAR_JS']);
  });
});
