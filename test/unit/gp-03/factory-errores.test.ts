/// <reference types="jest" />

import { ApiError, apiGet, crearErrorApi, ErrorDeRed } from '@/shared/api/apiClient';

/**
 * GP-03: Factory de errores de la API (crearErrorApi en src/shared/api/apiClient.ts). Revisa la
 * clase, el mensaje, el status y el code de cada tipo de error, y que un error HTTP real de apiGet
 * sea igual al que crea el Factory con el mismo cuerpo. Todo con fetch simulado.
 */

const MENSAJE_RED = 'Sin conexión con el servidor.';
const MENSAJE_SESION = 'Tu sesión terminó. Inicia sesión de nuevo.';

const fetchSimulado = (): jest.Mock => globalThis.fetch as unknown as jest.Mock;

/** Promesa rechazada de una petición, para revisar el error con instanceof. */
async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba que la petición fallara.');
}

describe("crearErrorApi: tipo 'red'", () => {
  it('crea un ErrorDeRed (que también es Error) con su nombre y mensaje', () => {
    const error: ErrorDeRed = crearErrorApi({ tipo: 'red' });
    expect(error).toBeInstanceOf(ErrorDeRed);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error.name).toBe('ErrorDeRed');
    expect(error.message).toBe(MENSAJE_RED);
  });

  it('crea un error nuevo en cada llamada', () => {
    expect(crearErrorApi({ tipo: 'red' })).not.toBe(crearErrorApi({ tipo: 'red' }));
  });
});

describe("crearErrorApi: tipo 'respuesta'", () => {
  it('usa message y code del cuerpo', () => {
    const error: ApiError = crearErrorApi({
      tipo: 'respuesta',
      status: 400,
      cuerpo: { message: 'El código no es válido.', code: 'CODIGO_INVALIDO' },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(400);
    expect(error.message).toBe('El código no es válido.');
    expect(error.code).toBe('CODIGO_INVALIDO');
  });

  it('une message con ", " cuando es un arreglo', () => {
    const error = crearErrorApi({
      tipo: 'respuesta',
      status: 422,
      cuerpo: { message: ['Falta el correo.', 'Falta la contraseña.'] },
    });
    expect(error.status).toBe(422);
    expect(error.message).toBe('Falta el correo., Falta la contraseña.');
    expect(error.code).toBeUndefined();
  });

  it('usa error cuando no hay message', () => {
    const error = crearErrorApi({ tipo: 'respuesta', status: 404, cuerpo: { error: 'Not Found' } });
    expect(error.message).toBe('Not Found');
    expect(error.status).toBe(404);
  });

  it('sin message ni error usa el mensaje genérico con el status y deja code undefined', () => {
    const error = crearErrorApi({ tipo: 'respuesta', status: 500, cuerpo: {} });
    expect(error.message).toBe('Error en la solicitud (500).');
    expect(error.status).toBe(500);
    expect(error.code).toBeUndefined();
  });

  it('con cuerpo de texto o null usa el mensaje genérico', () => {
    const deTexto = crearErrorApi({ tipo: 'respuesta', status: 502, cuerpo: 'Bad Gateway' });
    expect(deTexto.message).toBe('Error en la solicitud (502).');
    expect(deTexto.code).toBeUndefined();

    const nulo = crearErrorApi({ tipo: 'respuesta', status: 503, cuerpo: null });
    expect(nulo.message).toBe('Error en la solicitud (503).');
    expect(nulo.status).toBe(503);
    expect(nulo.code).toBeUndefined();
  });

  it('ignora un code vacío o que no es texto', () => {
    expect(crearErrorApi({ tipo: 'respuesta', status: 400, cuerpo: { code: '' } }).code).toBeUndefined();
    expect(crearErrorApi({ tipo: 'respuesta', status: 400, cuerpo: { code: 7 } }).code).toBeUndefined();
  });
});

describe("crearErrorApi: tipo 'sesionTerminada'", () => {
  it('sin code da 401, el mensaje para la clienta y SESION_VENCIDA', () => {
    const error: ApiError = crearErrorApi({ tipo: 'sesionTerminada' });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(401);
    expect(error.message).toBe(MENSAJE_SESION);
    expect(error.code).toBe('SESION_VENCIDA');
  });

  it('con code lo conserva', () => {
    const error = crearErrorApi({ tipo: 'sesionTerminada', code: 'SESION_REVOCADA' });
    expect(error.status).toBe(401);
    expect(error.message).toBe(MENSAJE_SESION);
    expect(error.code).toBe('SESION_REVOCADA');
  });

  it('con code undefined usa SESION_VENCIDA', () => {
    expect(crearErrorApi({ tipo: 'sesionTerminada', code: undefined }).code).toBe('SESION_VENCIDA');
  });
});

describe('crearErrorApi y apiGet', () => {
  it('un error HTTP de apiGet es igual al que crea el Factory con el mismo cuerpo', async () => {
    const cuerpo = { message: 'El servicio no existe.', code: 'SERVICIO_NO_ENCONTRADO' };
    fetchSimulado().mockResolvedValueOnce(new Response(JSON.stringify(cuerpo), { status: 404 }));

    const real = await capturarError(apiGet('/api/servicios/no-existe', { publica: true }));
    const esperado = crearErrorApi({ tipo: 'respuesta', status: 404, cuerpo });

    expect(real).toBeInstanceOf(ApiError);
    const error = real as ApiError;
    expect(error.name).toBe(esperado.name);
    expect(error.status).toBe(esperado.status);
    expect(error.message).toBe(esperado.message);
    expect(error.code).toBe(esperado.code);
  });

  it('sin red, apiGet lanza un error igual al que crea el Factory', async () => {
    fetchSimulado().mockRejectedValueOnce(new TypeError('Network request failed'));

    const real = await capturarError(apiGet('/api/servicios', { publica: true }));
    const esperado = crearErrorApi({ tipo: 'red' });

    expect(real).toBeInstanceOf(ErrorDeRed);
    expect((real as ErrorDeRed).name).toBe(esperado.name);
    expect((real as ErrorDeRed).message).toBe(esperado.message);
  });
});
