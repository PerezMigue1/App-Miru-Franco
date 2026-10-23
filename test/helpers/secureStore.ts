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

const PREFIJO_AVISOS = 'preferencia_avisos_';

/**
 * Clave de la preferencia "Avisos en la app" de una clienta (preferenciaAvisos.ts): el prefijo y los
 * primeros 32 hexadecimales del SHA-256 de prefijo más id, calculado con Node. Nunca lleva el id.
 */
export function clavePreferenciaAvisos(usuarioId: string): string {
  const { createHash } = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  const resumen = createHash('sha256').update(`${PREFIJO_AVISOS}${usuarioId}`, 'utf8').digest('hex');
  return `${PREFIJO_AVISOS}${resumen.slice(0, 32)}`;
}
