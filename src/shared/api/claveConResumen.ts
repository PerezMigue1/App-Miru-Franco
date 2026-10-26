import * as Crypto from 'expo-crypto';

/** Resumen SHA-256 en hexadecimal (64 caracteres): solo letras y números, que SecureStore acepta. */
const RESUMEN_VALIDO = /^[0-9a-f]{64}$/;
/** Hexadecimales del resumen que van en la clave: 128 bits, sin choques entre cuentas en la práctica. */
const LARGO_RESUMEN = 32;

/**
 * Clave de SecureStore propia de una clienta sin su id en claro: el prefijo más un resumen SHA-256
 * de prefijo e id, para no dejar en el teléfono el rastro de qué cuentas lo usaron. Lanza si el
 * resumen falla o no es válido (sin él todas las clientas compartirían la clave): quien llama decide
 * qué hacer sin guardar nada.
 */
export async function claveConResumen(prefijo: string, usuarioId: string): Promise<string> {
  const resumen = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${prefijo}${usuarioId}`, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  // Si no llega un texto, toLowerCase lanza.
  const hex = resumen.toLowerCase();
  if (!RESUMEN_VALIDO.test(hex)) {
    throw new Error('Resumen de la clave no válido.');
  }
  return `${prefijo}${hex.slice(0, LARGO_RESUMEN)}`;
}
