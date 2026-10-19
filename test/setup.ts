/// <reference types="jest" />

import { limpiarSecureStore } from './helpers/secureStore';

/**
 * Configuración global de las pruebas: variables de entorno de prueba, mocks de módulos nativos y
 * un fetch simulado. Ninguna prueba hace peticiones reales.
 */

// Variables de entorno de prueba (también se fijan en jest.config.js antes de transformar).
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
process.env.EXPO_PUBLIC_WEB_URL = 'http://web.test';

// expo-secure-store en memoria. El almacén se vacía antes de cada prueba (ver helpers/secureStore.ts).
jest.mock('expo-secure-store', () => {
  const almacen = new Map<string, string>();
  return {
    __almacen: almacen,
    AFTER_FIRST_UNLOCK: 0,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
    ALWAYS: 2,
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
    ALWAYS_THIS_DEVICE_ONLY: 4,
    WHEN_UNLOCKED: 5,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    isAvailableAsync: jest.fn(() => Promise.resolve(true)),
    getItemAsync: jest.fn((clave: string) => Promise.resolve(almacen.get(clave) ?? null)),
    setItemAsync: jest.fn((clave: string, valor: string) => {
      almacen.set(clave, valor);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((clave: string) => {
      almacen.delete(clave);
      return Promise.resolve();
    }),
    getItem: jest.fn((clave: string) => almacen.get(clave) ?? null),
    setItem: jest.fn((clave: string, valor: string) => {
      almacen.set(clave, valor);
    }),
    canUseBiometricAuthentication: jest.fn(() => false),
  };
});

// expo-font: las fuentes se dan por cargadas.
jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn(() => Promise.resolve(undefined)),
  isLoaded: jest.fn(() => true),
  isLoading: jest.fn(() => false),
}));

// expo-splash-screen: todo resuelve sin hacer nada.
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
  hide: jest.fn(),
  setOptions: jest.fn(),
}));

// react-native-worklets y react-native-reanimated: mocks oficiales de cada librería. Reanimated 4
// carga worklets al iniciar, y sin su mock intenta usar el módulo nativo.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// El mock de Reanimated no trae las curvas de las transiciones CSS ni useReducedMotion, que sí usa
// src/shared/ui; se agregan con lo mínimo.
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  return {
    ...mock,
    cubicBezier: jest.fn((x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2 })),
    steps: jest.fn((pasos: number, modificador = 'jump-end') => ({ pasos, modificador })),
    linear: jest.fn((...puntos: unknown[]) => ({ puntos })),
    useReducedMotion: jest.fn(() => false),
  };
});

/** fetch por defecto: rechaza para que cada prueba configure la respuesta que necesita. */
function fetchNoSimulado(): Promise<Response> {
  return Promise.reject(new Error('fetch no simulado en esta prueba'));
}

globalThis.fetch = jest.fn(fetchNoSimulado) as unknown as typeof fetch;

beforeEach(() => {
  limpiarSecureStore();
  globalThis.fetch = jest.fn(fetchNoSimulado) as unknown as typeof fetch;
});
