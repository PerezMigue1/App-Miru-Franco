/// <reference types="jest" />

/** Forma del mock en memoria de expo-secure-store definido en test/setup.ts. */
interface SecureStoreSimulado {
  __almacen: Map<string, string>;
}

function almacen(): Map<string, string> {
  return jest.requireMock<SecureStoreSimulado>('expo-secure-store').__almacen;
}

/** Vacía el almacén simulado de expo-secure-store. test/setup.ts ya lo llama antes de cada prueba. */
export function limpiarSecureStore(): void {
  almacen().clear();
}

/** Copia del contenido actual del almacén simulado, para revisar qué se guardó. */
export function leerSecureStore(): Record<string, string> {
  return Object.fromEntries(almacen());
}
