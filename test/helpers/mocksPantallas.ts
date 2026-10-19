/// <reference types="jest" />

/**
 * Mocks de las pruebas con pantallas reales. Cada prueba importa este archivo antes que cualquier
 * otro módulo, para que los mocks queden registrados antes de cargar expo-router/testing-library.
 *
 * expo-router/testing-library carga build/testing-library/mocks.js, que vuelve a registrar el mock de
 * react-native-reanimated con el mock básico de la librería y reemplaza al de test/setup.ts (la app
 * no carga sin cubicBezier, steps, linear y useReducedMotion). Se sustituye ese archivo por lo mismo
 * que hace, salvo lo de Reanimated (ver GP-02).
 */
jest.mock('expo-router/build/testing-library/mocks', () => {
  require('react-native-gesture-handler/jestSetup');
  return {};
});

jest.mock('expo-linking', () => ({
  ...jest.requireActual<object>('expo-linking'),
  createURL: (ruta: string) => `appmirufranco://${ruta}`,
  resolveScheme: () => 'appmirufranco',
  addEventListener: () => ({ remove: () => undefined }),
}));
