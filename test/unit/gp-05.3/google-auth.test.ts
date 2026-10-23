/// <reference types="jest" />

import { createHash } from 'node:crypto';

import * as Crypto from 'expo-crypto';

import {
  aBase64Url,
  canjearCodigoGoogle,
  crearPkce,
  ErrorInicioGoogle,
  leerRetornoGoogle,
  REDIRECCION_GOOGLE,
  urlInicioGoogle,
} from '@/features/auth/models/googleAuth';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';

import {
  bytesFijos,
  CODIGO_GOOGLE,
  REGRESO_CON_ERROR,
  REGRESO_GOOGLE,
  regresoConCodigo,
  rutaCanje,
  SESION_GOOGLE,
} from '../../helpers/google';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { API } from '../../helpers/servidorSimulado';
import { errorServidor, servidorVm, sinRed } from '../../helpers/viewmodelsAuth';

/**
 * GP-05.3, inicio de sesión con Google: modelo de src/features/auth/models/googleAuth.ts (caja
 * blanca). Revisa el codificador base64url propio con vectores del RFC 4648, el par PKCE S256
 * (verifier de 32 bytes y challenge con SHA-256) y sus fallos, la URL que abre el navegador, la
 * lectura del deep link de regreso (código válido, error, URL ajena, parámetros vacíos o repetidos,
 * código mal formado) y el canje del código en POST /api/auth/exchange-code. expo-crypto y
 * expo-device son simulados y fetch responde por ruta: nada sale a la red ni abre un navegador.
 */

jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());

/** Modelo que reporta expo-device en cada prueba (null: el teléfono no lo da). */
let mockModelo: string | null = null;
jest.mock('expo-device', () => ({ get modelName() { return mockModelo; } }));

const MENSAJE_FALLO = 'No se pudo completar el inicio con Google.';
const RUTA_RENOVAR = '/api/auth/movil/renovar';

/** Bytes de un texto ASCII (vectores del RFC 4648). */
const ascii = (texto: string): Uint8Array => Uint8Array.from(Buffer.from(texto, 'ascii'));

/** Base64url sin relleno calculado con Node, para comparar. */
const base64UrlNode = (bytes: Uint8Array | string): string =>
  Buffer.from(typeof bytes === 'string' ? Buffer.from(bytes, 'ascii') : bytes).toString('base64url');

/** Challenge S256 esperado: base64url(SHA-256(verifier en ASCII)). */
const challengeEsperado = (verifier: string): string =>
  createHash('sha256').update(verifier, 'ascii').digest('base64url');

/** Promesa rechazada, para revisar el error con instanceof. */
const capturar = (promesa: Promise<unknown>): Promise<unknown> =>
  promesa.then(
    () => Promise.reject(new Error('La promesa debía rechazar')),
    (error: unknown) => error,
  );

const getRandomBytes = jest.mocked(Crypto.getRandomBytes);
const digest = jest.mocked(Crypto.digest);

beforeEach(() => {
  getRandomBytes.mockClear();
  digest.mockClear();
  mockModelo = null;
});

describe('aBase64Url', () => {
  it.each([
    ['', ''],
    ['f', 'Zg'],
    ['fo', 'Zm8'],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg'],
    ['fooba', 'Zm9vYmE'],
    ['foobar', 'Zm9vYmFy'],
  ])('codifica "%s" como "%s" (RFC 4648 sin relleno)', (texto, esperado) => {
    expect(aBase64Url(ascii(texto))).toBe(esperado);
  });

  it('un arreglo vacío da una cadena vacía', () => {
    expect(aBase64Url(new Uint8Array(0))).toBe('');
  });

  it.each([
    ['resto de 1 byte', [0xfb], '-w'],
    ['resto de 2 bytes', [0xff, 0xff], '__8'],
    ['bloque completo', [0xfb, 0xff, 0xbf], '-_-_'],
    ['bloques completos con resto', [0xfb, 0xff, 0xbf, 0xfb, 0xff], '-_-_-_8'],
  ])('%s: usa - y _ en lugar de + y /', (_caso, bytes, esperado) => {
    const salida = aBase64Url(Uint8Array.from(bytes));
    expect(salida).toBe(esperado);
    expect(salida).not.toMatch(/[+/=]/);
  });

  it.each([1, 2, 3, 31, 32, 33, 256])('coincide con Node para %i bytes y nunca lleva +, / ni =', (largo) => {
    const bytes = Uint8Array.from({ length: largo }, (_, i) => (i * 37 + 251) % 256);
    const salida = aBase64Url(bytes);
    expect(salida).toBe(base64UrlNode(bytes));
    expect(salida).toMatch(/^[A-Za-z0-9_-]*$/);
  });
});

describe('crearPkce', () => {
  it('verifier = base64url de 32 bytes aleatorios y challenge = base64url(SHA-256(verifier))', async () => {
    const { verifier, challenge } = await crearPkce();
    expect(verifier).toBe(base64UrlNode(bytesFijos(32)));
    expect(verifier).toHaveLength(43);
    expect(challenge).toBe(challengeEsperado(verifier));
    expect(challenge).toHaveLength(43);
  });

  it('pide 32 bytes y resume con SHA-256 los bytes ASCII del verifier', async () => {
    const { verifier } = await crearPkce();
    expect(getRandomBytes).toHaveBeenCalledTimes(1);
    expect(getRandomBytes).toHaveBeenCalledWith(32);
    expect(digest).toHaveBeenCalledTimes(1);
    const [algoritmo, datos] = digest.mock.calls[0];
    expect(algoritmo).toBe(Crypto.CryptoDigestAlgorithm.SHA256);
    expect(Buffer.from(datos as Uint8Array).toString('ascii')).toBe(verifier);
  });

  /** Fallos de expo-crypto y largos inesperados del verifier o del resumen. */
  const casosDeFallo: [string, () => void][] = [
    ['getRandomBytes lanza', () => getRandomBytes.mockImplementationOnce(() => { throw new Error('sin entropía'); })],
    ['digest rechaza', () => digest.mockRejectedValueOnce(new Error('sin resumen'))],
    ['digest lanza sin promesa', () => digest.mockImplementationOnce(() => { throw new Error('sin resumen'); })],
    ['getRandomBytes devuelve 16 bytes', () => getRandomBytes.mockReturnValueOnce(bytesFijos(16))],
    ['getRandomBytes devuelve 33 bytes', () => getRandomBytes.mockReturnValueOnce(bytesFijos(33))],
    ['digest devuelve un resumen de 16 bytes', () => digest.mockResolvedValueOnce(new ArrayBuffer(16))],
  ];

  it.each(casosDeFallo)('%s: lanza ErrorInicioGoogle con su mensaje fijo', async (_caso, preparar) => {
    preparar();
    const error = await capturar(crearPkce());
    expect(error).toBeInstanceOf(ErrorInicioGoogle);
    expect((error as Error).name).toBe('ErrorInicioGoogle');
    expect((error as Error).message).toBe(MENSAJE_FALLO);
  });

  it('el mensaje de un largo inesperado no lleva el verifier', async () => {
    getRandomBytes.mockReturnValueOnce(bytesFijos(16));
    const error = (await capturar(crearPkce())) as Error;
    expect(error.message).not.toContain(base64UrlNode(bytesFijos(16)));
    expect(error.message).not.toContain(base64UrlNode(bytesFijos(32)));
  });
});

describe('urlInicioGoogle', () => {
  it('arma la URL del backend con origen=app y el challenge', () => {
    expect(urlInicioGoogle('reto_Ficticio-1')).toBe(
      `${API}/api/auth/google?origen=app&code_challenge=reto_Ficticio-1`,
    );
  });

  it('codifica el challenge para la query', () => {
    expect(urlInicioGoogle('a b&c=d')).toBe(`${API}/api/auth/google?origen=app&code_challenge=a%20b%26c%3Dd`);
  });
});

describe('leerRetornoGoogle', () => {
  it('REDIRECCION_GOOGLE es el deep link de regreso de la app', () => {
    expect(REDIRECCION_GOOGLE).toBe(REGRESO_GOOGLE);
  });

  const MAYUSCULAS = 'ABCDEF0123456789'.repeat(4);
  const MEZCLADO = 'aBcDeF0123456789'.repeat(4);

  it.each([
    ['el código de 64 hexadecimales', regresoConCodigo(), CODIGO_GOOGLE],
    ['hexadecimales en mayúsculas', regresoConCodigo(MAYUSCULAS), MAYUSCULAS],
    ['mayúsculas y minúsculas', regresoConCodigo(MEZCLADO), MEZCLADO],
    ['codificado con %', `${REGRESO_GOOGLE}?code=%63${CODIGO_GOOGLE.slice(1)}`, CODIGO_GOOGLE],
  ])('acepta %s', (_caso, url, code) => {
    expect(leerRetornoGoogle(url)).toEqual({ tipo: 'codigo', code });
  });

  it.each([
    // GP-07.6: el regreso se valida exacto (el backend solo manda ?code=<64 hex>): un fragmento,
    // parámetros de más o un & sobrante ya no se aceptan.
    ['con fragmento #', `${regresoConCodigo()}#_=_`],
    ['con error solo en el fragmento', `${regresoConCodigo()}#error=x`],
    ['con parámetros extra', `${REGRESO_GOOGLE}?estado=x&code=${CODIGO_GOOGLE}&otro`],
    ['con & al final', `${regresoConCodigo()}&`],
    ['error con valor', REGRESO_CON_ERROR],
    ['error sin valor', `${REGRESO_GOOGLE}?error`],
    ['error vacío', `${REGRESO_GOOGLE}?error=`],
    ['error después del code', `${regresoConCodigo()}&error=x`],
    ['error antes del code', `${REGRESO_GOOGLE}?error=x&code=${CODIGO_GOOGLE}`],
    ['otro esquema', `otraapp://auth/callback?code=${CODIGO_GOOGLE}`],
    ['esquema en mayúsculas', `APPMIRUFRANCO://auth/callback?code=${CODIGO_GOOGLE}`],
    ['otra ruta', `appmirufranco://auth/otra?code=${CODIGO_GOOGLE}`],
    ['ruta más larga', `${REGRESO_GOOGLE}/extra?code=${CODIGO_GOOGLE}`],
    ['http', `http://api.test/auth/callback?code=${CODIGO_GOOGLE}`],
    ['https', `https://web.test/auth/callback?code=${CODIGO_GOOGLE}`],
    ['cadena vacía', ''],
    ['espacio antes del esquema', ` ${regresoConCodigo()}`],
    ['ruta sin ?', REGRESO_GOOGLE],
    ['code solo en el fragmento', `${REGRESO_GOOGLE}#code=${CODIGO_GOOGLE}`],
    ['code vacío', `${REGRESO_GOOGLE}?code=`],
    ['code sin =', `${REGRESO_GOOGLE}?code`],
    ['? solo', `${REGRESO_GOOGLE}?`],
    ['sin code', `${REGRESO_GOOGLE}?estado=x`],
    ['clave Code en mayúscula', `${REGRESO_GOOGLE}?Code=${CODIGO_GOOGLE}`],
    ['code repetido', `${regresoConCodigo()}&code=${CODIGO_GOOGLE}`],
    ['code repetido con el primero vacío', `${REGRESO_GOOGLE}?code=&code=${CODIGO_GOOGLE}`],
    ['63 caracteres', regresoConCodigo(CODIGO_GOOGLE.slice(1))],
    ['65 caracteres', regresoConCodigo(`${CODIGO_GOOGLE}a`)],
    ['carácter g', regresoConCodigo(`g${CODIGO_GOOGLE.slice(1)}`)],
    ['carácter G', regresoConCodigo(`G${CODIGO_GOOGLE.slice(1)}`)],
    ['espacio codificado', regresoConCodigo(`%20${CODIGO_GOOGLE.slice(1)}`)],
    ['decodeURIComponent falla', regresoConCodigo('%E0%A4%A')],
  ])('rechaza %s', (_caso, url) => {
    expect(leerRetornoGoogle(url)).toEqual({ tipo: 'error' });
  });
});

describe('canjearCodigoGoogle', () => {
  const VERIFIER = 'verifier-ficticio-de-prueba';
  const CUERPO_BASE = { code: CODIGO_GOOGLE, code_verifier: VERIFIER, canal: 'movil' };

  it('hace POST a /api/auth/exchange-code con el dispositivo y devuelve la respuesta', async () => {
    mockModelo = 'Telefono Ficticio';
    const llamadas = servidorVm(rutaCanje());
    await expect(canjearCodigoGoogle(CODIGO_GOOGLE, VERIFIER)).resolves.toEqual({
      success: true,
      ...SESION_GOOGLE,
    });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].metodo).toBe('POST');
    expect(llamadas[0].url).toBe(`${API}/api/auth/exchange-code`);
    expect(llamadas[0].cuerpo).toEqual({ ...CUERPO_BASE, dispositivo: 'Telefono Ficticio' });
    expect(llamadas[0].cabeceras['Content-Type']).toBe('application/json');
  });

  it.each([
    ['expo-device no da modelo', null],
    ['el modelo viene en blanco', '   '],
  ])('sin dispositivo cuando %s', async (_caso, modelo) => {
    mockModelo = modelo;
    const llamadas = servidorVm(rutaCanje());
    await canjearCodigoGoogle(CODIGO_GOOGLE, VERIFIER);
    expect(llamadas[0].cuerpo).toEqual(CUERPO_BASE);
    expect(llamadas[0].cuerpo).not.toHaveProperty('dispositivo');
  });

  it('es pública: no manda Authorization aunque haya una sesión guardada', async () => {
    await sembrarSesion({ id: '41', nombre: 'Clienta Ficticia', email: 'clienta@ejemplo.test', rol: 'cliente' });
    const llamadas = servidorVm(rutaCanje());
    await canjearCodigoGoogle(CODIGO_GOOGLE, VERIFIER);
    expect(llamadas[0].cabeceras).not.toHaveProperty('Authorization');
  });

  it.each([400, 401])('un %i del servidor lanza ApiError con su status y no intenta renovar', async (status) => {
    await sembrarSesion({ id: '42', nombre: 'Otra Clienta', email: 'otra@ejemplo.test', rol: 'cliente' });
    const llamadas = servidorVm(rutaCanje(() => errorServidor(status, 'Código inválido o vencido')));
    const error = await capturar(canjearCodigoGoogle(CODIGO_GOOGLE, VERIFIER));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
    expect(llamadas).toHaveLength(1);
    expect(llamadas.some((l) => l.ruta === RUTA_RENOVAR)).toBe(false);
  });

  it('sin red lanza ErrorDeRed de apiClient', async () => {
    servidorVm({ 'POST /api/auth/exchange-code': sinRed });
    const error = await capturar(canjearCodigoGoogle(CODIGO_GOOGLE, VERIFIER));
    expect(error).toBeInstanceOf(ErrorDeRed);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});
