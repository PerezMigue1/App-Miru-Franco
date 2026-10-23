import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Preferencia "Avisos en la app" de cada clienta, guardada en el teléfono (GP-07.6). El backend no
 * tiene todavía un endpoint de preferencias para la clienta (haría falta, por ejemplo, GET y PATCH
 * /api/notificaciones/preferencias con { enApp: boolean }), así que vale solo en este teléfono.
 *
 * Cada clienta tiene su clave: otra cuenta en el mismo teléfono tiene la suya y nunca hereda la de
 * otra. La clave no lleva el id en claro sino un resumen SHA-256 de él, para no dejar en el teléfono
 * el rastro de qué cuentas lo usaron. No es un dato sensible (solo '1' o '0'); como la apariencia, no
 * se borra al cerrar sesión para que al volver a entrar siga como la dejó. Si SecureStore o el
 * resumen fallan, quedan encendidos (el comportamiento de siempre).
 */
const PREFIJO_CLAVE = 'preferencia_avisos_';
const ENCENDIDOS = '1';
const APAGADOS = '0';
/** Resumen SHA-256 en hexadecimal (64 caracteres): solo letras y números, que SecureStore acepta. */
const RESUMEN_VALIDO = /^[0-9a-f]{64}$/;
/** Hexadecimales del resumen que van en la clave: 128 bits, sin choques entre cuentas en la práctica. */
const LARGO_RESUMEN = 32;

/** Clave de la clienta: prefijo y el resumen del id, nunca el id. Lanza si el resumen no es válido. */
async function claveDe(usuarioId: string): Promise<string> {
  const resumen = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${PREFIJO_CLAVE}${usuarioId}`,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  // Si no llega un texto, toLowerCase lanza y quien llama deja los avisos encendidos.
  const hex = resumen.toLowerCase();
  if (!RESUMEN_VALIDO.test(hex)) {
    // Sin un resumen válido todas las clientas compartirían la clave: mejor no guardar nada.
    throw new Error('Resumen de la clave no válido.');
  }
  return `${PREFIJO_CLAVE}${hex.slice(0, LARGO_RESUMEN)}`;
}

/** true si los avisos en la app están encendidos para esta clienta (por omisión, sí). Nunca rechaza. */
export async function leerPreferenciaAvisos(usuarioId: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(await claveDe(usuarioId))) !== APAGADOS;
  } catch {
    return true;
  }
}

/** Guarda la preferencia. Nunca rechaza: si falla, vale en esta sesión y al reabrir vuelve la anterior. */
export async function guardarPreferenciaAvisos(usuarioId: string, enApp: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(await claveDe(usuarioId), enApp ? ENCENDIDOS : APAGADOS);
  } catch {
    // Se aplica igual mientras la app siga abierta.
  }
}
