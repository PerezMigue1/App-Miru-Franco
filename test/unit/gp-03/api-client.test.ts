/// <reference types="jest" />

import {
  ApiError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  checkHealth,
  ErrorDeRed,
  esUrlPermitida,
  getBaseUrl,
} from '@/shared/api/apiClient';
import { generacionActual, guardarSesion, type SesionGuardada } from '@/shared/api/tokenStorage';

/**
 * GP-03: cliente HTTP de la app (src/shared/api/apiClient.ts). Revisa la URL base, las cabeceras,
 * los métodos, la lectura de respuestas y errores, el límite de 60 s (GP-09) y checkHealth. Todo con fetch
 * simulado; la renovación de sesión es de GP-05 y aquí no se dispara (las sesiones son recientes y
 * sin refreshToken, y ninguna petición protegida recibe un 401).
 */

const API = 'http://api.test';

const fetchSimulado = (): jest.Mock => globalThis.fetch as unknown as jest.Mock;

/** Hace que fetch responda una vez con el cuerpo y el status indicados. */
function responder(cuerpo: string | null, status = 200): void {
  fetchSimulado().mockResolvedValueOnce(new Response(cuerpo, { status }));
}

function responderJson(datos: unknown, status = 200): void {
  responder(JSON.stringify(datos), status);
}

/** URL y opciones con que se llamó a fetch (por defecto, la primera llamada). */
function llamada(indice = 0): { url: string; init: RequestInit } {
  const [url, init] = fetchSimulado().mock.calls[indice] as [string, RequestInit];
  return { url, init };
}

function cabeceras(indice = 0): Record<string, string> {
  return llamada(indice).init.headers as Record<string, string>;
}

/** Sesión reciente y sin refreshToken: no dispara ninguna renovación. */
async function guardarSesionReciente(token = 'token-de-prueba'): Promise<void> {
  const sesion: SesionGuardada = {
    token,
    emitidoEn: Date.now(),
    usuario: { id: 'clienta-1', nombre: 'Clienta de Prueba', email: 'clienta@prueba.test', rol: 'cliente' },
  };
  const guardada = await guardarSesion(sesion, generacionActual());
  expect(guardada).toBe(true);
}

/** Promesa rechazada de una petición, para revisar el error con instanceof. */
async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba que la petición fallara.');
}

describe('getBaseUrl y esUrlPermitida', () => {
  const urlOriginal = process.env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = urlOriginal;
  });

  it('usa la URL de prueba del entorno', () => {
    expect(getBaseUrl()).toBe(API);
  });

  it('quita las diagonales finales y los espacios', () => {
    process.env.EXPO_PUBLIC_API_URL = '  https://api.ejemplo.test///  ';
    expect(getBaseUrl()).toBe('https://api.ejemplo.test');
  });

  it('lanza si falta EXPO_PUBLIC_API_URL o está vacía', () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    expect(() => getBaseUrl()).toThrow('Falta la variable de entorno EXPO_PUBLIC_API_URL.');
    process.env.EXPO_PUBLIC_API_URL = '   ';
    expect(() => getBaseUrl()).toThrow('Falta la variable de entorno EXPO_PUBLIC_API_URL.');
  });

  it('lanza si la URL no es permitida', () => {
    process.env.EXPO_PUBLIC_API_URL = 'ftp://api.ejemplo.test';
    expect(() => getBaseUrl()).toThrow('EXPO_PUBLIC_API_URL debe usar https.');
  });

  it('acepta https, sin importar mayúsculas ni espacios', () => {
    expect(esUrlPermitida('https://api.ejemplo.test')).toBe(true);
    expect(esUrlPermitida('HTTPS://API.EJEMPLO.TEST')).toBe(true);
    expect(esUrlPermitida('   https://api.ejemplo.test  ')).toBe(true);
  });

  it('acepta http en desarrollo (__DEV__ es true en jest-expo)', () => {
    expect(__DEV__).toBe(true);
    expect(esUrlPermitida('http://api.test')).toBe(true);
    expect(esUrlPermitida(' HTTP://API.TEST ')).toBe(true);
  });

  it('rechaza http cuando __DEV__ es false y sigue aceptando https', () => {
    const global = globalThis as unknown as { __DEV__: boolean };
    const devOriginal = global.__DEV__;
    try {
      global.__DEV__ = false;
      expect(esUrlPermitida('http://api.test')).toBe(false);
      expect(esUrlPermitida('https://api.ejemplo.test')).toBe(true);
      expect(() => getBaseUrl()).toThrow('EXPO_PUBLIC_API_URL debe usar https.');
    } finally {
      global.__DEV__ = devOriginal;
    }
    expect(__DEV__).toBe(true);
  });

  it('rechaza otros esquemas y textos sin esquema', () => {
    expect(esUrlPermitida('ftp://api.ejemplo.test')).toBe(false);
    expect(esUrlPermitida('ws://api.ejemplo.test')).toBe(false);
    expect(esUrlPermitida('javascript:alert(1)')).toBe(false);
    expect(esUrlPermitida('api.ejemplo.test')).toBe(false);
    expect(esUrlPermitida('')).toBe(false);
  });
});

describe('URL y cabeceras', () => {
  it('arma la URL con la base de prueba y el path', async () => {
    responderJson({ ok: true });
    await apiGet('/api/servicios', { publica: true });
    expect(llamada().url).toBe(`${API}/api/servicios`);
  });

  it('manda Authorization: Bearer con la sesión guardada', async () => {
    await guardarSesionReciente();
    responderJson({ ok: true });
    await apiGet('/api/citas?propios=true');
    expect(llamada().url).toBe(`${API}/api/citas?propios=true`);
    expect(cabeceras().Authorization).toBe('Bearer token-de-prueba');
  });

  it('no manda Authorization si no hay sesión', async () => {
    responderJson({ ok: true });
    await apiGet('/api/citas?propios=true');
    expect(cabeceras()).not.toHaveProperty('Authorization');
  });

  it('con { publica: true } nunca manda el token, aunque haya sesión', async () => {
    await guardarSesionReciente();
    responderJson([]);
    await apiGet('/api/servicios', { publica: true });
    expect(cabeceras()).not.toHaveProperty('Authorization');
  });

  it('con { token } manda ese token y no el guardado', async () => {
    await guardarSesionReciente();
    responderJson({ ok: true });
    await apiPost('/api/auth/logout', undefined, { token: 'token-explicito-de-prueba' });
    expect(cabeceras().Authorization).toBe('Bearer token-explicito-de-prueba');
  });

  it('con { token: "" } lanza sin llamar a fetch', async () => {
    await guardarSesionReciente();
    await expect(apiPost('/api/auth/logout', undefined, { token: '' })).rejects.toThrow(
      'Token explícito vacío: la petición no se envía.',
    );
    expect(fetchSimulado()).not.toHaveBeenCalled();
  });

  it('siempre manda Accept: application/json', async () => {
    responderJson({});
    responderJson({});
    responderJson({});
    await apiGet('/a', { publica: true });
    await apiPost('/b', { x: 1 }, { publica: true });
    await apiDelete('/c');
    for (const indice of [0, 1, 2]) {
      expect(cabeceras(indice).Accept).toBe('application/json');
    }
  });

  it.each([
    ['POST', apiPost],
    ['PUT', apiPut],
    ['PATCH', apiPatch],
  ] as const)('%s con cuerpo manda Content-Type JSON y el cuerpo serializado', async (metodo, funcion) => {
    const cuerpo = { nombre: 'Corte', precio: 150, lista: [1, 2] };
    responderJson({ ok: true });
    await funcion('/api/recurso', cuerpo, { publica: true });
    const { init } = llamada();
    expect(init.method).toBe(metodo);
    expect(cabeceras()['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify(cuerpo));
  });

  it('GET y DELETE no mandan Content-Type ni cuerpo', async () => {
    responderJson({});
    responderJson({});
    await apiGet('/a', { publica: true });
    await apiDelete('/b', { publica: true });
    for (const indice of [0, 1]) {
      expect(cabeceras(indice)).not.toHaveProperty('Content-Type');
      expect(llamada(indice).init.body).toBeUndefined();
    }
  });

  it('POST sin cuerpo no manda Content-Type ni cuerpo', async () => {
    responderJson({});
    await apiPost('/a', undefined, { publica: true });
    expect(cabeceras()).not.toHaveProperty('Content-Type');
    expect(llamada().init.body).toBeUndefined();
  });

  it('cada petición lleva una señal para el límite de tiempo', async () => {
    responderJson({});
    await apiGet('/a', { publica: true });
    expect(llamada().init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('métodos HTTP', () => {
  it.each([
    ['GET', () => apiGet('/m', { publica: true })],
    ['POST', () => apiPost('/m', { a: 1 }, { publica: true })],
    ['PUT', () => apiPut('/m', { a: 1 }, { publica: true })],
    ['PATCH', () => apiPatch('/m', { a: 1 }, { publica: true })],
    ['DELETE', () => apiDelete('/m', { publica: true })],
  ] as const)('%s usa el método correcto', async (metodo, enviarPeticion) => {
    responderJson({});
    await enviarPeticion();
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(llamada().init.method).toBe(metodo);
    expect(llamada().url).toBe(`${API}/m`);
  });

  it.each([
    ['PUT', apiPut],
    ['PATCH', apiPatch],
    ['POST', apiPost],
  ] as const)('%s protegido también manda el token guardado', async (metodo, funcion) => {
    await guardarSesionReciente();
    responderJson({});
    await funcion('/m', { a: 1 });
    expect(llamada().init.method).toBe(metodo);
    expect(cabeceras().Authorization).toBe('Bearer token-de-prueba');
  });
});

describe('lectura de respuestas 2xx', () => {
  it('devuelve el objeto JSON', async () => {
    responderJson({ id: 'cita-1', estado: 'pendiente' }, 201);
    await expect(apiGet('/a', { publica: true })).resolves.toEqual({ id: 'cita-1', estado: 'pendiente' });
  });

  it('devuelve null si el cuerpo está vacío', async () => {
    responder(null, 204);
    await expect(apiDelete('/a', { publica: true })).resolves.toBeNull();
    responder('', 200);
    await expect(apiGet('/a', { publica: true })).resolves.toBeNull();
  });

  it('devuelve el texto si no es JSON', async () => {
    responder('pong', 200);
    await expect(apiGet('/a', { publica: true })).resolves.toBe('pong');
  });

  it('con sesión guardada también lee la respuesta', async () => {
    await guardarSesionReciente();
    responderJson([{ id: 'cita-1' }]);
    await expect(apiGet('/api/citas?propios=true')).resolves.toEqual([{ id: 'cita-1' }]);
  });
});

describe('errores HTTP', () => {
  it('usa message y code del backend', async () => {
    responderJson({ message: 'El horario ya está ocupado.', code: 'HORARIO_OCUPADO' }, 400);
    const error = await capturarError(apiPost('/api/citas', { a: 1 }, { publica: true }));
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.message).toBe('El horario ya está ocupado.');
    expect(apiError.code).toBe('HORARIO_OCUPADO');
    expect(apiError.name).toBe('ApiError');
  });

  it('une message cuando es un arreglo', async () => {
    responderJson({ message: ['nombre es obligatorio', 'email no es válido'] }, 400);
    const error = (await capturarError(apiPost('/a', {}, { publica: true }))) as ApiError;
    expect(error.message).toBe('nombre es obligatorio, email no es válido');
    expect(error.code).toBeUndefined();
  });

  it('usa error cuando no hay message', async () => {
    responderJson({ error: 'Not Found', statusCode: 404 }, 404);
    const error = (await capturarError(apiGet('/a', { publica: true }))) as ApiError;
    expect(error.status).toBe(404);
    expect(error.message).toBe('Not Found');
  });

  it('usa error cuando message es un texto vacío o un arreglo vacío', async () => {
    responderJson({ message: '', error: 'Bad Request' }, 400);
    responderJson({ message: [], error: 'Bad Request' }, 400);
    const primero = (await capturarError(apiGet('/a', { publica: true }))) as ApiError;
    const segundo = (await capturarError(apiGet('/a', { publica: true }))) as ApiError;
    expect(primero.message).toBe('Bad Request');
    expect(segundo.message).toBe('Bad Request');
  });

  it('sin message ni error usa el mensaje genérico con el status', async () => {
    responderJson({}, 500);
    const error = (await capturarError(apiGet('/a', { publica: true }))) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(error.message).toBe('Error en la solicitud (500).');
  });

  it('con cuerpo vacío usa el mensaje genérico', async () => {
    responder(null, 503);
    // Un POST: una lectura con 503 se repite una vez (GP-09) y aquí solo se revisa el mensaje.
    const error = (await capturarError(apiPost('/a', undefined, { publica: true }))) as ApiError;
    expect(error.message).toBe('Error en la solicitud (503).');
    expect(error.code).toBeUndefined();
  });

  it('con texto plano (no JSON) usa el mensaje genérico', async () => {
    responder('<html>Bad Gateway</html>', 502);
    const error = (await capturarError(apiGet('/a', { publica: true }))) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.message).toBe('Error en la solicitud (502).');
    expect(error.code).toBeUndefined();
  });

  it('code que no es texto o está vacío queda undefined', async () => {
    responderJson({ message: 'Falla', code: 123 }, 400);
    responderJson({ message: 'Falla', code: '' }, 400);
    responderJson({ message: 'Falla', code: null }, 400);
    for (let i = 0; i < 3; i++) {
      const error = (await capturarError(apiGet('/a', { publica: true }))) as ApiError;
      expect(error.message).toBe('Falla');
      expect(error.code).toBeUndefined();
    }
  });

  it('un error con sesión guardada (no 401) llega como ApiError', async () => {
    await guardarSesionReciente();
    responderJson({ message: 'Sin permiso.', code: 'PROHIBIDO' }, 403);
    const error = (await capturarError(apiGet('/api/citas?propios=true'))) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe('PROHIBIDO');
  });

  it('un 401 en una petición pública solo se informa como ApiError', async () => {
    responderJson({ message: 'Credenciales inválidas.', code: 'CREDENCIALES_INVALIDAS' }, 401);
    const error = (await capturarError(apiPost('/api/auth/login', { canal: 'movil' }, { publica: true }))) as ApiError;
    expect(error.status).toBe(401);
    expect(error.code).toBe('CREDENCIALES_INVALIDAS');
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
  });
});

describe('fallo de red', () => {
  it('si fetch rechaza, lanza ErrorDeRed', async () => {
    fetchSimulado().mockRejectedValueOnce(new TypeError('Network request failed'));
    const error = await capturarError(apiGet('/a', { publica: true }));
    expect(error).toBeInstanceOf(ErrorDeRed);
    expect((error as ErrorDeRed).message).toBe('Sin conexión con el servidor.');
    expect((error as ErrorDeRed).name).toBe('ErrorDeRed');
  });

  it('también en una petición protegida con sesión', async () => {
    await guardarSesionReciente();
    fetchSimulado().mockRejectedValueOnce(new TypeError('Network request failed'));
    const error = await capturarError(apiGet('/api/citas?propios=true'));
    expect(error).toBeInstanceOf(ErrorDeRed);
  });
});

describe('límite de 60 s (GP-09: Render tarda de 30 a 60 s en despertar)', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  /** fetch que nunca responde: solo rechaza cuando su señal se aborta. */
  function fetchQueEspera(): void {
    fetchSimulado().mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolver, rechazar) => {
          init.signal?.addEventListener('abort', () => {
            rechazar(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
  }

  it('aborta a los 60000 ms y lanza ErrorDeRed', async () => {
    jest.useFakeTimers();
    fetchQueEspera();
    const resultado = apiGet('/lenta', { publica: true }).then(
      () => 'resuelta',
      (error: unknown) => error,
    );
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    const senal = llamada().init.signal as AbortSignal;

    jest.advanceTimersByTime(59999);
    expect(senal.aborted).toBe(false);

    jest.advanceTimersByTime(1);
    expect(senal.aborted).toBe(true);
    const error = await resultado;
    expect(error).toBeInstanceOf(ErrorDeRed);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('una respuesta a tiempo limpia el temporizador', async () => {
    jest.useFakeTimers();
    responderJson({ ok: true });
    await expect(apiGet('/rapida', { publica: true })).resolves.toEqual({ ok: true });
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('checkHealth', () => {
  it('hace GET a /salud y devuelve true si la respuesta es ok', async () => {
    responder('ok', 200);
    await expect(checkHealth()).resolves.toBe(true);
    expect(llamada().url).toBe(`${API}/salud`);
    expect(llamada().init.method).toBe('GET');
  });

  it('devuelve false si el status no es ok', async () => {
    responder('caído', 503);
    await expect(checkHealth()).resolves.toBe(false);
  });

  it('devuelve false si fetch rechaza', async () => {
    fetchSimulado().mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(checkHealth()).resolves.toBe(false);
  });

  it('devuelve false si falta la URL base', async () => {
    const urlOriginal = process.env.EXPO_PUBLIC_API_URL;
    try {
      delete process.env.EXPO_PUBLIC_API_URL;
      await expect(checkHealth()).resolves.toBe(false);
      expect(fetchSimulado()).not.toHaveBeenCalled();
    } finally {
      process.env.EXPO_PUBLIC_API_URL = urlOriginal;
    }
  });
});
