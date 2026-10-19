/// <reference types="jest" />

import { ApiError, apiGet, checkHealth, ErrorDeRed } from '@/shared/api/apiClient';
import { subirMultipart } from '@/shared/api/subirMultipart';
import {
  borrarSesion,
  generacionActual,
  guardarSesion,
  leerSesion,
  reemplazarToken,
  type SesionGuardada,
} from '@/shared/api/tokenStorage';

import { leerSecureStore } from '../../helpers/secureStore';

/**
 * Integración de la capa de API: tokenStorage real, apiClient real y el mock en memoria de
 * expo-secure-store de test/setup.ts trabajando juntos. Solo fetch y expo-file-system son simulados.
 * No se prueba la renovación ni la expiración de la sesión (GP-05): las sesiones se guardan recién
 * emitidas y ninguna petición protegida con sesión recibe un 401.
 */

// expo-file-system: File solo guarda la uri que recibe (subirMultipart lo mete en el FormData).
jest.mock('expo-file-system', () => ({
  File: class {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }
  },
}));

const API = 'http://api.test';
const RUTA_RENOVAR_MOVIL = '/api/auth/movil/renovar';
const URL_SUBIDA = 'https://subidas.test/upload';

const USUARIO = { id: 'cli-1', nombre: 'Clienta de prueba', email: 'clienta@prueba.test', rol: 'cliente' };

/** Sesión sin refreshToken (camino clásico), recién emitida. */
function sesionClasica(token = 'token-prueba-clasico'): SesionGuardada {
  return { token, emitidoEn: Date.now(), usuario: USUARIO };
}

/** Sesión con refreshToken (camino móvil), recién emitida. */
function sesionMovil(token = 'token-prueba-movil'): SesionGuardada {
  return { token, emitidoEn: Date.now(), usuario: USUARIO, refreshToken: 'refresh-prueba-movil' };
}

/** Respuesta JSON: un Response real si el entorno lo trae; si no, lo mínimo que lee apiClient. */
function respuesta(cuerpo: unknown, status = 200): Response {
  const texto = cuerpo === undefined ? '' : JSON.stringify(cuerpo);
  if (typeof Response === 'function') {
    return new Response(texto, { status, headers: { 'Content-Type': 'application/json' } });
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(texto),
  } as unknown as Response;
}

type LlamadaFetch = [string, RequestInit];

/** Instala un fetch simulado que siempre devuelve la misma respuesta y lo regresa para revisarlo. */
function simularFetch(cuerpo: unknown, status = 200): jest.Mock {
  const simulado = jest.fn(() => Promise.resolve(respuesta(cuerpo, status)));
  globalThis.fetch = simulado as unknown as typeof fetch;
  return simulado;
}

function llamadas(simulado: jest.Mock): LlamadaFetch[] {
  return simulado.mock.calls as unknown as LlamadaFetch[];
}

function encabezados(llamada: LlamadaFetch): Record<string, string> {
  return (llamada[1].headers ?? {}) as Record<string, string>;
}

async function guardar(sesion: SesionGuardada): Promise<void> {
  await expect(guardarSesion(sesion, generacionActual())).resolves.toBe(true);
}

describe('Capa de API con la sesión guardada (GP-03)', () => {
  it('una sesión guardada sin refreshToken hace que apiGet lleve su Bearer', async () => {
    await guardar(sesionClasica());
    // La sesión quedó en el almacén simulado, en una sola entrada.
    expect(Object.keys(leerSecureStore())).toEqual(['auth_sesion']);

    const simulado = simularFetch({ success: true, data: [] });
    await expect(apiGet('/api/citas?propios=true')).resolves.toEqual({ success: true, data: [] });

    expect(simulado).toHaveBeenCalledTimes(1);
    const [llamada] = llamadas(simulado);
    expect(llamada[0]).toBe(`${API}/api/citas?propios=true`);
    expect(llamada[1].method).toBe('GET');
    expect(encabezados(llamada).Authorization).toBe('Bearer token-prueba-clasico');
  });

  it('una sesión móvil reciente lleva su Bearer sin pedir renovación', async () => {
    await guardar(sesionMovil());

    const simulado = simularFetch({ success: true });
    await expect(apiGet('/api/auth/me')).resolves.toEqual({ success: true });

    // Una sola petición, a la ruta pedida: el acceso recién emitido no está por vencer.
    expect(simulado).toHaveBeenCalledTimes(1);
    const [llamada] = llamadas(simulado);
    expect(llamada[0]).toBe(`${API}/api/auth/me`);
    expect(llamada[0]).not.toContain(RUTA_RENOVAR_MOVIL);
    expect(encabezados(llamada).Authorization).toBe('Bearer token-prueba-movil');
    // La sesión sigue igual (no se rotó el refreshToken).
    await expect(leerSesion()).resolves.toMatchObject({
      token: 'token-prueba-movil',
      refreshToken: 'refresh-prueba-movil',
    });
  });

  it('después de borrarSesion la siguiente petición sale sin Authorization', async () => {
    await guardar(sesionClasica());
    await borrarSesion();
    expect(leerSecureStore()).toEqual({});
    await expect(leerSesion()).resolves.toBeNull();

    const simulado = simularFetch({ success: true });
    await apiGet('/api/citas?propios=true');

    expect(simulado).toHaveBeenCalledTimes(1);
    const [llamada] = llamadas(simulado);
    expect(encabezados(llamada).Authorization).toBeUndefined();
    expect(encabezados(llamada).Accept).toBe('application/json');
  });

  it('un error del backend llega como ApiError con status, mensaje y code, y la sesión sigue', async () => {
    const sesion = sesionClasica();
    await guardar(sesion);

    simularFetch({ message: 'Horario ocupado', code: 'HORARIO_OCUPADO' }, 400);
    const error: unknown = await apiGet('/api/citas/disponibilidad').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: 'Horario ocupado', code: 'HORARIO_OCUPADO' });
    await expect(leerSesion()).resolves.toEqual(sesion);
  });

  it('un fallo de red llega como ErrorDeRed y la sesión sigue', async () => {
    const sesion = sesionMovil();
    await guardar(sesion);

    const simulado = jest.fn(() => Promise.reject(new TypeError('Network request failed')));
    globalThis.fetch = simulado as unknown as typeof fetch;

    const error: unknown = await apiGet('/api/citas?propios=true').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeRed);
    expect((error as Error).message).toBe('Sin conexión con el servidor.');
    // No hubo intento de renovar: solo la petición que falló.
    expect(simulado).toHaveBeenCalledTimes(1);
    await expect(leerSesion()).resolves.toEqual(sesion);
  });

  it('checkHealth consulta /salud: true con ok y false con 503', async () => {
    const sano = simularFetch({ ok: true });
    await expect(checkHealth()).resolves.toBe(true);
    expect(llamadas(sano)[0][0]).toBe(`${API}/salud`);
    expect(llamadas(sano)[0][1].method).toBe('GET');

    const caido = simularFetch({ message: 'Servicio no disponible' }, 503);
    await expect(checkHealth()).resolves.toBe(false);
    expect(llamadas(caido)[0][0]).toBe(`${API}/salud`);
  });

  it('subirMultipart no usa el token guardado: sube al servicio externo sin Authorization', async () => {
    await guardar(sesionClasica());

    const simulado = simularFetch({ secure_url: 'https://imagenes.test/foto.jpg' });
    const resultado = await subirMultipart(URL_SUBIDA, 'file:///foto-prueba.jpg', {
      api_key: 'llave-prueba',
      timestamp: '1700000000',
    });

    expect(resultado).toEqual({ secure_url: 'https://imagenes.test/foto.jpg' });
    expect(simulado).toHaveBeenCalledTimes(1);
    const [llamada] = llamadas(simulado);
    expect(llamada[0]).toBe(URL_SUBIDA);
    expect(llamada[1].method).toBe('POST');
    expect(llamada[1].body).toBeInstanceOf(FormData);
    // Sin encabezados propios: ni Authorization ni Content-Type (el boundary lo arma fetch).
    expect(llamada[1].headers).toBeUndefined();
    // La sesión guardada no se tocó.
    await expect(leerSesion()).resolves.toMatchObject({ token: 'token-prueba-clasico' });
  });

  it('reemplazarToken hace que la siguiente petición lleve el token nuevo', async () => {
    await guardar(sesionClasica('token-prueba-viejo'));

    await expect(
      reemplazarToken('token-prueba-viejo', 'token-prueba-nuevo', Date.now(), generacionActual()),
    ).resolves.toBe(true);

    const simulado = simularFetch({ success: true });
    await apiGet('/api/citas?propios=true');

    expect(simulado).toHaveBeenCalledTimes(1);
    expect(encabezados(llamadas(simulado)[0]).Authorization).toBe('Bearer token-prueba-nuevo');
    // Los datos de la clienta se conservan al reemplazar el token.
    await expect(leerSesion()).resolves.toMatchObject({ token: 'token-prueba-nuevo', usuario: USUARIO });
  });
});
