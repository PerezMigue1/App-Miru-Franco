import * as SecureStore from 'expo-secure-store';

import { claveConResumen } from '@/shared/api/claveConResumen';

/**
 * Preferencia "Avisos en la app" de cada clienta, guardada en el teléfono (GP-07.6). El backend no
 * tiene todavía un endpoint de preferencias para la clienta (haría falta, por ejemplo, GET y PATCH
 * /api/notificaciones/preferencias con { enApp: boolean }), así que vale solo en este teléfono.
 *
 * Cada clienta tiene su clave: otra cuenta en el mismo teléfono tiene la suya y nunca hereda la de
 * otra. La clave no lleva el id en claro sino un resumen SHA-256 de él, para no dejar en el teléfono
 * el rastro de qué cuentas lo usaron. No es un dato sensible (solo '1' o '0'); como la apariencia, no
 * se borra al cerrar sesión ni al desactivar la cuenta para que al volver a entrar siga como la dejó;
 * al eliminar la cuenta sí se borra (borrarPreferenciaAvisos). Si SecureStore o el resumen fallan,
 * quedan encendidos (el comportamiento de siempre).
 */
const PREFIJO_CLAVE = 'preferencia_avisos_';
const ENCENDIDOS = '1';
const APAGADOS = '0';
/** Clave de la clienta: prefijo y el resumen del id, nunca el id. Lanza si el resumen no es válido. */
const claveDe = (usuarioId: string): Promise<string> => claveConResumen(PREFIJO_CLAVE, usuarioId);

/** true si los avisos en la app están encendidos para esta clienta (por omisión, sí). Nunca rechaza. */
export async function leerPreferenciaAvisos(usuarioId: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(await claveDe(usuarioId))) !== APAGADOS;
  } catch {
    return true;
  }
}

/**
 * Las escrituras van en fila: un guardado que siguiera en camino nunca vuelve a escribir la clave
 * después de borrarla al eliminar la cuenta.
 */
let fila: Promise<void> = Promise.resolve();

function enFila(escritura: () => Promise<void>): Promise<void> {
  fila = fila.then(escritura, escritura);
  return fila;
}

/** Guarda la preferencia. Nunca rechaza: si falla, vale en esta sesión y al reabrir vuelve la anterior. */
export function guardarPreferenciaAvisos(usuarioId: string, enApp: boolean): Promise<void> {
  return enFila(async () => {
    try {
      await SecureStore.setItemAsync(await claveDe(usuarioId), enApp ? ENCENDIDOS : APAGADOS);
    } catch {
      // Se aplica igual mientras la app siga abierta.
    }
  });
}

/** Borra la preferencia de la clienta (al eliminar su cuenta). Nunca rechaza. */
export function borrarPreferenciaAvisos(usuarioId: string): Promise<void> {
  return enFila(async () => {
    try {
      await SecureStore.deleteItemAsync(await claveDe(usuarioId));
    } catch {
      // Sin SecureStore no queda nada que borrar que se pueda leer.
    }
  });
}
