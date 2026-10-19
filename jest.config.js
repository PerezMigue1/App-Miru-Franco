// Valores de prueba: se fijan antes de transformar el código para que src nunca vea los del .env.
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
process.env.EXPO_PUBLIC_WEB_URL = 'http://web.test';

// Mismo transformador de Babel que jest-expo aplica a .js/.ts, para paquetes que publican .mjs
// (por ejemplo lucide-react-native).
const transformadorExpo = require('jest-expo/jest-preset').transform['\\.[jt]sx?$'];

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/test'],
  transform: {
    '\\.mjs$': transformadorExpo,
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
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
