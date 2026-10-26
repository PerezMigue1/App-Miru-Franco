// Valores de prueba: se fijan antes de transformar el código para que src nunca vea los del .env.
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
process.env.EXPO_PUBLIC_WEB_URL = 'http://web.test';

// Mismo transformador de Babel que jest-expo aplica a .js/.ts, para paquetes que publican .mjs
// (por ejemplo lucide-react-native).
const transformadorExpo = require('jest-expo/jest-preset').transform[String.raw`\.[jt]sx?$`];

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/test'],
  transform: {
    [String.raw`\.mjs$`]: transformadorExpo,
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // La mitad de los núcleos, no todos menos uno (el valor de Jest): con --coverage cada worker carga
  // las pantallas instrumentadas y, en un equipo de 16 hilos con 16 GB, 15 workers agotaban la memoria
  // (memoria libre en 0). El sistema paginaba, una prueba de 0.1 s pasaba de los 5 s y los workers no
  // alcanzaban a salir a tiempo ("A worker process has failed to exit gracefully"). Con la mitad, la
  // corrida completa con cobertura es más rápida y no deja ese aviso. En el CI (2 a 4 núcleos) cambia poco.
  maxWorkers: '50%',
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|lucide-react-native|standard-navigation)',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageReporters: ['text-summary', 'lcov'],
};
