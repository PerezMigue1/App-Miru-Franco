import * as Crypto from 'expo-crypto';

import { apiPost, getBaseUrl } from '@/shared/api/apiClient';

import { nombreDispositivo } from './authService';

/** Deep link al que el backend devuelve el inicio con Google. */
export const REDIRECCION_GOOGLE = 'appmirufranco://auth/callback';

/** Fallo del inicio con Google; el mensaje nunca lleva el código, el verifier ni tokens. */
export class ErrorInicioGoogle extends Error {
  constructor() {
    super('No se pudo completar el inicio con Google.');
    this.name = 'ErrorInicioGoogle';
  }
}

const ALFABETO_BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LARGO_PKCE = 43;
const BYTES_VERIFIER = 32;
const LARGO_CODIGO = 64;

/**
 * Base64url sin relleno (RFC 4648 §5). Codificador propio de 6 en 6 bits: no depende de `btoa`
 * ni de pasar los bytes por una cadena binaria.
 */
export function aBase64Url(bytes: Uint8Array): string {
  let salida = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const bloque = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    salida +=
      ALFABETO_BASE64URL[(bloque >> 18) & 63] +
      ALFABETO_BASE64URL[(bloque >> 12) & 63] +
      ALFABETO_BASE64URL[(bloque >> 6) & 63] +
      ALFABETO_BASE64URL[bloque & 63];
  }
  const resto = bytes.length - i;
  if (resto === 1) {
    const bloque = bytes[i] << 16;
    salida += ALFABETO_BASE64URL[(bloque >> 18) & 63] + ALFABETO_BASE64URL[(bloque >> 12) & 63];
  } else if (resto === 2) {
    const bloque = (bytes[i] << 16) | (bytes[i + 1] << 8);
    salida +=
      ALFABETO_BASE64URL[(bloque >> 18) & 63] +
      ALFABETO_BASE64URL[(bloque >> 12) & 63] +
      ALFABETO_BASE64URL[(bloque >> 6) & 63];
  }
  return salida;
}

/** Bytes ASCII de un texto que solo tiene caracteres base64url (el verifier). */
function bytesAscii(texto: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    bytes[i] = texto.charCodeAt(i);
  }
  return bytes;
}

/** Par PKCE S256: verifier aleatorio de 32 bytes y challenge = base64url(SHA-256(verifier)). */
export async function crearPkce(): Promise<{ verifier: string; challenge: string }> {
  let verifier: string;
  let challenge: string;
  try {
    verifier = aBase64Url(Crypto.getRandomBytes(BYTES_VERIFIER));
    const resumen = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytesAscii(verifier));
    challenge = aBase64Url(new Uint8Array(resumen));
  } catch {
    throw new ErrorInicioGoogle();
  }
  if (verifier.length !== LARGO_PKCE || challenge.length !== LARGO_PKCE) {
    throw new ErrorInicioGoogle();
  }
  return { verifier, challenge };
}

/** URL que se abre en el navegador para iniciar con Google desde la app. */
export function urlInicioGoogle(challenge: string): string {
  return `${getBaseUrl()}/api/auth/google?origen=app&code_challenge=${encodeURIComponent(challenge)}`;
}

export type RetornoGoogle = { tipo: 'codigo'; code: string } | { tipo: 'error' };

function esHexadecimal(caracter: string): boolean {
  return (
    (caracter >= '0' && caracter <= '9') ||
    (caracter >= 'a' && caracter <= 'f') ||
    (caracter >= 'A' && caracter <= 'F')
  );
}

function esCodigoValido(code: string): boolean {
  if (code.length !== LARGO_CODIGO) {
    return false;
  }
  for (const caracter of code) {
    if (!esHexadecimal(caracter)) {
      return false;
    }
  }
  return true;
}

/**
 * Lee el deep link de regreso. La query se parte a mano por '?', '&' y '=' (el `URL` de React
 * Native no es fiable con esquemas propios ni con `searchParams`). Cualquier cosa que no sea un
 * único `code` de 64 hexadecimales, sin `error`, se trata como error.
 */
export function leerRetornoGoogle(url: string): RetornoGoogle {
  const fallo: RetornoGoogle = { tipo: 'error' };
  if (!url.startsWith(REDIRECCION_GOOGLE)) {
    return fallo;
  }
  // Sin fragmento; tras la ruta solo puede venir la query.
  const sinFragmento = url.split('#')[0];
  const resto = sinFragmento.slice(REDIRECCION_GOOGLE.length);
  if (!resto.startsWith('?')) {
    return fallo;
  }
  let code: string | undefined;
  for (const par of resto.slice(1).split('&')) {
    const separador = par.indexOf('=');
    const clave = separador === -1 ? par : par.slice(0, separador);
    const valorCrudo = separador === -1 ? '' : par.slice(separador + 1);
    if (clave === 'error') {
      return fallo;
    }
    if (clave === 'code') {
      if (code !== undefined) {
        return fallo;
      }
      try {
        code = decodeURIComponent(valorCrudo);
      } catch {
        return fallo;
      }
    }
  }
  return code !== undefined && esCodigoValido(code) ? { tipo: 'codigo', code } : fallo;
}

/** Respuesta de POST /api/auth/exchange-code; se valida en quien la usa (no trae usuario). */
export interface RespuestaCanjeGoogle {
  success?: boolean;
  token?: unknown;
  refreshToken?: unknown;
  refreshExpiraEn?: unknown;
}

/**
 * POST /api/auth/exchange-code con canal "movil": canjea el código de un solo uso con el verifier.
 * Público: su 401 (verifier incorrecto o código usado/vencido) no dispara renovación.
 */
export function canjearCodigoGoogle(code: string, verifier: string): Promise<RespuestaCanjeGoogle> {
  const dispositivo = nombreDispositivo();
  const cuerpo = dispositivo
    ? { code, code_verifier: verifier, canal: 'movil', dispositivo }
    : { code, code_verifier: verifier, canal: 'movil' };
  return apiPost<RespuestaCanjeGoogle>('/api/auth/exchange-code', cuerpo, { publica: true });
}
