import * as SecureStore from 'expo-secure-store';

import { claveConResumen } from '@/shared/api/claveConResumen';

/**
 * Marca en el teléfono de que a la clienta ya se le ofreció autorizar sus alergias en este inicio de
 * sesión: así la oferta no vuelve a salir cada vez que abre la app con la sesión guardada. Cada
 * clienta tiene su clave (resumen SHA-256 del id, nunca el id en claro) y la marca se borra al
 * cerrar sesión, para que el siguiente inicio de sesión la ofrezca otra vez. No es un dato sensible
 * (solo '1'). Si SecureStore o el resumen fallan, se sigue sin la marca (vale la memoria de la sesión).
 */
const PREFIJO_CLAVE = 'oferta_salud_';
const OFRECIDA = '1';

const claveDe = (usuarioId: string): Promise<string> => claveConResumen(PREFIJO_CLAVE, usuarioId);

/** true si ya se le ofreció en este inicio de sesión. Nunca rechaza (sin marca legible, false). */
export async function ofertaYaHecha(usuarioId: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(await claveDe(usuarioId))) === OFRECIDA;
  } catch {
    return false;
  }
}

/** Deja la marca de oferta hecha. Nunca rechaza. */
export async function marcarOfertaHecha(usuarioId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(await claveDe(usuarioId), OFRECIDA);
  } catch {
    // Sin la marca, la memoria de la sesión evita repetirla mientras la app siga abierta.
  }
}

/** Borra la marca (al cerrar la sesión). Nunca rechaza. */
export async function olvidarOferta(usuarioId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(await claveDe(usuarioId));
  } catch {
    // Sin SecureStore no queda nada que se pueda leer.
  }
}
