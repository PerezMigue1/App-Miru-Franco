/// <reference types="jest" />

import { jwtFicticio } from './sesionGuardada';
import { respuesta, type Manejador } from './servidorSimulado';

/**
 * Piezas comunes de las pruebas del inicio con Google (GP-05.3): expo-crypto y expo-web-browser
 * simulados, el código de un solo uso, los regresos del navegador y el canje del servidor. Nada sale
 * a la red ni abre un navegador. Las fábricas se usan desde jest.mock con require (jest.mock se
 * eleva en cada archivo).
 */

/** Deep link de regreso (el mismo que REDIRECCION_GOOGLE de googleAuth.ts). */
export const REGRESO_GOOGLE = 'appmirufranco://auth/callback';

/** Código ficticio de un solo uso: 64 hexadecimales, como lo emite el backend. */
export const CODIGO_GOOGLE = 'c0de'.repeat(16);

/** Deep link de regreso con el código indicado (por defecto, CODIGO_GOOGLE). */
export function regresoConCodigo(code: string = CODIGO_GOOGLE): string {
  return `${REGRESO_GOOGLE}?code=${code}`;
}

/** Deep link de regreso cuando Google o el backend rechazan el inicio. */
export const REGRESO_CON_ERROR = `${REGRESO_GOOGLE}?error=acceso_denegado`;

// ── expo-crypto ──────────────────────────────────────────────────────────────────────────────

/** Bytes fijos del verifier: 0, 1, 2, ... (así el resultado se puede calcular en la prueba). */
export function bytesFijos(largo: number): Uint8Array {
  return Uint8Array.from({ length: largo }, (_, i) => i);
}

/**
 * Módulo expo-crypto simulado: getRandomBytes con bytes fijos, digest y digestStringAsync (en
 * hexadecimal) con el SHA-256 real de Node y getRandomValues (lo usa Inicio para barajar) que llena
 * el arreglo con 0, 1, 2, ...
 */
export function cryptoSimulado() {
  const { createHash } = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
    getRandomBytes: jest.fn((largo: number) => bytesFijos(largo)),
    digest: jest.fn((_algoritmo: string, datos: Uint8Array) => {
      const resumen = createHash('sha256').update(datos).digest();
      return Promise.resolve(resumen.buffer.slice(resumen.byteOffset, resumen.byteOffset + resumen.length));
    }),
    digestStringAsync: jest.fn((_algoritmo: string, datos: string) =>
      Promise.resolve(createHash('sha256').update(datos, 'utf8').digest('hex')),
    ),
    getRandomValues: jest.fn(<T extends ArrayBufferView>(arreglo: T): T => {
      const valores = arreglo as unknown as { length: number; [i: number]: number };
      for (let i = 0; i < valores.length; i++) {
        valores[i] = i;
      }
      return arreglo;
    }),
  };
}

// ── expo-web-browser ─────────────────────────────────────────────────────────────────────────

/** Módulo expo-web-browser simulado: ningún navegador se abre; cada prueba programa el resultado. */
export function navegadorSimulado() {
  return {
    openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })),
    openAuthSessionAsync: jest.fn(() => Promise.resolve({ type: 'cancel' })),
    WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss', OPENED: 'opened', LOCKED: 'locked' },
  };
}

/** openAuthSessionAsync del mock de expo-web-browser registrado en la prueba. */
export function abrirSesionSimulada(): jest.Mock {
  return jest.requireMock<{ openAuthSessionAsync: jest.Mock }>('expo-web-browser').openAuthSessionAsync;
}

/** El navegador regresa a la app con el deep link indicado. */
export function navegadorRegresa(url: string): jest.Mock {
  return abrirSesionSimulada().mockResolvedValueOnce({ type: 'success', url });
}

/**
 * La clienta cierra el navegador sin terminar ('cancel'), o Android lo descarta ('dismiss'), como
 * pasa con una cuenta nueva que se va a completar el registro en la web.
 */
export function navegadorSeCierra(tipo: 'cancel' | 'dismiss' = 'cancel'): jest.Mock {
  return abrirSesionSimulada().mockResolvedValueOnce({ type: tipo });
}

// ── Canje en el servidor ─────────────────────────────────────────────────────────────────────

/** Sesión móvil ficticia que emite POST /api/auth/exchange-code (con refreshToken de 30 días). */
export const SESION_GOOGLE = {
  token: jwtFicticio('clienta-google'),
  refreshToken: 'refresh-ficticio-google',
  refreshExpiraEn: '2099-01-01T00:00:00.000Z',
};

/** Respuesta exitosa del canje. */
export function canjeExitoso(sesion: Record<string, unknown> = SESION_GOOGLE): Response {
  return respuesta({ success: true, ...sesion });
}

/** Ruta del canje en el servidor simulado (por defecto, exitosa). */
export function rutaCanje(manejador: Manejador = () => canjeExitoso()): Record<string, Manejador> {
  return { 'POST /api/auth/exchange-code': manejador };
}
