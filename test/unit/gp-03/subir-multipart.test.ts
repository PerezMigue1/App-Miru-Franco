/// <reference types="jest" />

import { File as ArchivoLocal } from 'expo-file-system';

import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { subirMultipart } from '@/shared/api/subirMultipart';
import { generacionActual, guardarSesion } from '@/shared/api/tokenStorage';

/**
 * GP-03: subida multipart (src/shared/api/subirMultipart.ts), que se usa para mandar la foto de
 * perfil a un servicio externo con una firma. fetch y expo-file-system van simulados.
 */

// File de expo-file-system simulado: solo guarda la uri del archivo local.
jest.mock('expo-file-system', () => ({
  File: class {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }
  },
}));

const URL_SUBIDA = 'https://subidas.ejemplo.test/v1/upload';
const URI_ARCHIVO = 'file:///datos/cache/foto-de-prueba.jpg';
const CAMPOS = {
  api_key: 'llave-de-prueba',
  timestamp: '1760000000',
  signature: 'firma-de-prueba',
  folder: 'perfiles',
};

const fetchSimulado = (): jest.Mock => globalThis.fetch as unknown as jest.Mock;

function responder(cuerpo: string | null, status = 200): void {
  fetchSimulado().mockResolvedValueOnce(new Response(cuerpo, { status }));
}

function opcionesFetch(): RequestInit {
  return (fetchSimulado().mock.calls[0] as [string, RequestInit])[1];
}

async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba que la subida fallara.');
}

let espiaAppend: jest.SpyInstance;

beforeEach(() => {
  espiaAppend = jest.spyOn(FormData.prototype, 'append');
});

afterEach(() => {
  espiaAppend.mockRestore();
});

describe('subirMultipart: petición', () => {
  it('hace POST a la url recibida con un FormData y una señal', async () => {
    responder('{}');
    await subirMultipart(URL_SUBIDA, URI_ARCHIVO, CAMPOS);
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(fetchSimulado().mock.calls[0][0]).toBe(URL_SUBIDA);
    const init = opcionesFetch();
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('pone el archivo local en "file" y cada campo tal cual, en ese orden', async () => {
    responder('{}');
    await subirMultipart(URL_SUBIDA, URI_ARCHIVO, CAMPOS);

    const llamadas = espiaAppend.mock.calls as [string, unknown][];
    expect(llamadas).toHaveLength(1 + Object.keys(CAMPOS).length);

    const [nombreArchivo, archivo] = llamadas[0];
    expect(nombreArchivo).toBe('file');
    expect(archivo).toBeInstanceOf(ArchivoLocal);
    expect((archivo as { uri: string }).uri).toBe(URI_ARCHIVO);

    expect(llamadas.slice(1)).toEqual(Object.entries(CAMPOS));
    // Todo se agregó al mismo FormData que llegó a fetch.
    for (const instancia of espiaAppend.mock.instances) {
      expect(instancia).toBe(opcionesFetch().body);
    }
    const formulario = opcionesFetch().body as FormData;
    for (const [nombre, valor] of Object.entries(CAMPOS)) {
      expect(formulario.get(nombre)).toBe(valor);
    }
  });

  it('sin campos solo agrega el archivo', async () => {
    responder('{}');
    await subirMultipart(URL_SUBIDA, URI_ARCHIVO, {});
    expect(espiaAppend).toHaveBeenCalledTimes(1);
    expect(espiaAppend.mock.calls[0][0]).toBe('file');
  });

  it('no manda Authorization ni cabeceras aunque haya sesión guardada', async () => {
    const guardada = await guardarSesion(
      {
        token: 'token-de-prueba',
        emitidoEn: Date.now(),
        usuario: { id: 'clienta-1', nombre: 'Clienta de Prueba', email: 'clienta@prueba.test', rol: 'cliente' },
      },
      generacionActual(),
    );
    expect(guardada).toBe(true);
    responder('{}');
    await subirMultipart(URL_SUBIDA, URI_ARCHIVO, CAMPOS);
    const init = opcionesFetch();
    expect(init.headers).toBeUndefined();
    expect(JSON.stringify(init)).not.toContain('token-de-prueba');
  });
});

describe('subirMultipart: respuesta', () => {
  it('devuelve el JSON de una respuesta ok', async () => {
    const datos = { secure_url: 'https://cdn.ejemplo.test/foto.jpg', public_id: 'perfiles/foto' };
    responder(JSON.stringify(datos), 200);
    await expect(subirMultipart(URL_SUBIDA, URI_ARCHIVO, CAMPOS)).resolves.toEqual(datos);
  });

  it('devuelve null si la respuesta ok viene vacía', async () => {
    responder(null, 204);
    await expect(subirMultipart(URL_SUBIDA, URI_ARCHIVO, CAMPOS)).resolves.toBeNull();
  });

  it('devuelve null si la respuesta ok no es JSON', async () => {
    responder('subida lista', 200);
    await expect(subirMultipart(URL_SUBIDA, URI_ARCHIVO, CAMPOS)).resolves.toBeNull();
  });
});

describe('subirMultipart: errores', () => {
  it('si fetch rechaza, lanza ErrorDeRed', async () => {
    fetchSimulado().mockRejectedValueOnce(new TypeError('Network request failed'));
    const error = await capturarError(subirMultipart(URL_SUBIDA, URI_ARCHIVO, CAMPOS));
    expect(error).toBeInstanceOf(ErrorDeRed);
    expect((error as ErrorDeRed).message).toBe('Sin conexión con el servidor.');
  });

  it('un status no ok lanza ApiError con mensaje genérico, sin el mensaje del servidor', async () => {
    responder(JSON.stringify({ error: { message: 'Invalid Signature' }, message: 'Firma inválida', code: 'FIRMA' }), 401);
    const error = await capturarError(subirMultipart(URL_SUBIDA, URI_ARCHIVO, CAMPOS));
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(401);
    expect(apiError.message).toBe('Error en la subida (401).');
    expect(apiError.code).toBeUndefined();
    expect(apiError.name).toBe('ApiError');
  });

  it('un status no ok con texto plano también da el mensaje genérico', async () => {
    responder('Bad Gateway', 502);
    const error = (await capturarError(subirMultipart(URL_SUBIDA, URI_ARCHIVO, CAMPOS))) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.message).toBe('Error en la subida (502).');
  });
});

describe('subirMultipart: límite de 60 s', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('aborta a los 60000 ms y lanza ErrorDeRed', async () => {
    jest.useFakeTimers();
    fetchSimulado().mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolver, rechazar) => {
          init.signal?.addEventListener('abort', () => {
            rechazar(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const resultado = subirMultipart(URL_SUBIDA, URI_ARCHIVO, CAMPOS).then(
      () => 'resuelta',
      (error: unknown) => error,
    );
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    const senal = opcionesFetch().signal as AbortSignal;

    jest.advanceTimersByTime(59999);
    expect(senal.aborted).toBe(false);

    jest.advanceTimersByTime(1);
    expect(senal.aborted).toBe(true);
    await expect(resultado).resolves.toBeInstanceOf(ErrorDeRed);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('una respuesta a tiempo limpia el temporizador', async () => {
    jest.useFakeTimers();
    responder('{}');
    await expect(subirMultipart(URL_SUBIDA, URI_ARCHIVO, CAMPOS)).resolves.toEqual({});
    expect(jest.getTimerCount()).toBe(0);
  });
});
