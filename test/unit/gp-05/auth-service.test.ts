/// <reference types="jest" />

import type { DatosRegistro } from '@/features/auth/models/AuthModel';
import { esCuentaSinActivar } from '@/features/auth/models/AuthModel';
import { mensajeParaClienta } from '@/shared/api/mensajesError';
import {
  cerrarSesionServidor,
  iniciarSesion,
  nombreDispositivo,
  normalizarUsuario,
  obtenerPerfil,
  obtenerPreguntasSeguridad,
  reenviarCodigo,
  registrarUsuario,
  solicitarEnlaceRecuperacion,
  verificarCodigo,
  verificarCorreo,
} from '@/features/auth/models/authService';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { generacionActual, guardarSesion, leerSesion, type SesionGuardada } from '@/shared/api/tokenStorage';

import { leerSecureStore } from '../../helpers/secureStore';

/**
 * GP-05, primera entrega: llamadas de autenticación (src/features/auth/models/authService.ts).
 * Revisa ruta, método, cabeceras y cuerpo de cada petición, la respuesta correcta y los errores
 * (400, 401, 409, 429 y sin red). Solo fetch y expo-device son simulados; apiClient y tokenStorage
 * son los reales (SecureStore en memoria). Perfil, foto, cambio de contraseña y Google son de otro GP.
 */

/** Modelo del teléfono que devuelve expo-device en cada prueba (null: desconocido). */
const mockDispositivo: { modelo: string | null } = { modelo: null };

jest.mock('expo-device', () => ({
  get modelName(): string | null {
    return mockDispositivo.modelo;
  },
}));

const API = 'http://api.test';
const MINUTO_MS = 60 * 1000;

const CORREO = 'clienta@ejemplo.test';
const CLAVE = 'ClaveFicticia1!';

const fetchSimulado = (): jest.Mock => globalThis.fetch as unknown as jest.Mock;

/** Hace que fetch responda una vez con el cuerpo y el status indicados. */
function responder(cuerpo: string | null, status = 200): void {
  fetchSimulado().mockResolvedValueOnce(new Response(cuerpo, { status }));
}

function responderJson(datos: unknown, status = 200): void {
  responder(JSON.stringify(datos), status);
}

/** fetch rechaza una vez, como pasa sin red. */
function sinRed(): void {
  fetchSimulado().mockRejectedValueOnce(new TypeError('Network request failed'));
}

/** URL y opciones con que se llamó a fetch (por defecto, la primera llamada). */
function llamada(indice = 0): { url: string; init: RequestInit } {
  const [url, init] = fetchSimulado().mock.calls[indice] as [string, RequestInit];
  return { url, init };
}

function cabeceras(indice = 0): Record<string, string> {
  return llamada(indice).init.headers as Record<string, string>;
}

/** Cuerpo JSON enviado en la llamada indicada. */
function cuerpoEnviado(indice = 0): unknown {
  return JSON.parse(llamada(indice).init.body as string);
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

/** Sesión guardada en SecureStore (por defecto, reciente y sin refreshToken: no renueva nada). */
async function guardarSesionDePrueba(cambios: Partial<SesionGuardada> = {}): Promise<SesionGuardada> {
  const sesion: SesionGuardada = {
    token: 'token-ficticio-guardado',
    emitidoEn: Date.now(),
    usuario: { id: 'clienta-1', nombre: 'Clienta de Prueba', email: CORREO, rol: 'cliente' },
    ...cambios,
  };
  expect(await guardarSesion(sesion, generacionActual())).toBe(true);
  return sesion;
}

/** JWT de prueba (sin firma válida) con iat y exp; apiClient solo lee el payload. */
function jwtFicticio(iat: number, exp: number): string {
  const parte = (datos: object) => Buffer.from(JSON.stringify(datos)).toString('base64url');
  return `${parte({ alg: 'none', typ: 'JWT' })}.${parte({ iat, exp, sub: 'clienta-1' })}.firma-ficticia`;
}

const DATOS_REGISTRO: DatosRegistro = {
  nombre: 'Clienta de Prueba',
  email: CORREO,
  telefono: '7711234560',
  password: CLAVE,
  fechaNacimiento: '1995-04-27',
  preguntaSeguridad: { pregunta: '¿Nombre de tu primera mascota?', respuesta: 'Perla' },
  perfilCapilar: {
    tipoCabello: 'ondulado',
    tieneAlergias: true,
    alergias: 'Amoniaco',
    tratamientosQuimicos: false,
  },
  aceptaAvisoPrivacidad: true,
  recibePromociones: false,
  consienteDatosSensibles: true,
};

afterEach(() => {
  mockDispositivo.modelo = null;
});

describe('peticiones públicas', () => {
  it.each([
    ['iniciarSesion', () => iniciarSesion(CORREO, CLAVE)],
    ['obtenerPreguntasSeguridad', () => obtenerPreguntasSeguridad()],
    ['verificarCorreo', () => verificarCorreo(CORREO)],
    ['registrarUsuario', () => registrarUsuario(DATOS_REGISTRO)],
    ['verificarCodigo', () => verificarCodigo(CORREO, '123456')],
    ['reenviarCodigo', () => reenviarCodigo(CORREO)],
    ['solicitarEnlaceRecuperacion', () => solicitarEnlaceRecuperacion(CORREO)],
  ] as const)('%s nunca manda el token, aunque haya sesión guardada', async (_nombre, peticion) => {
    await guardarSesionDePrueba();
    responderJson({ success: true });
    await peticion();
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(cabeceras()).not.toHaveProperty('Authorization');
    expect(cabeceras().Accept).toBe('application/json');
  });

  it.each([
    ['iniciarSesion', () => iniciarSesion(CORREO, CLAVE)],
    ['verificarCodigo', () => verificarCodigo(CORREO, '123456')],
  ] as const)('%s: un 401 solo se informa (no renueva ni borra la sesión)', async (_nombre, peticion) => {
    const sesion = await guardarSesionDePrueba({ refreshToken: 'refresh-ficticio-publica' });
    responderJson({ message: 'No autorizado' }, 401);
    const error = await capturarError(peticion());
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(await leerSesion()).toEqual(sesion);
  });
});

describe('nombreDispositivo', () => {
  it('devuelve undefined si expo-device no conoce el modelo', () => {
    mockDispositivo.modelo = null;
    expect(nombreDispositivo()).toBeUndefined();
  });

  it('devuelve undefined con un modelo vacío o solo de espacios', () => {
    mockDispositivo.modelo = '';
    expect(nombreDispositivo()).toBeUndefined();
    mockDispositivo.modelo = '   ';
    expect(nombreDispositivo()).toBeUndefined();
  });

  it('quita los espacios de los extremos', () => {
    mockDispositivo.modelo = '  Teléfono Ficticio X  ';
    expect(nombreDispositivo()).toBe('Teléfono Ficticio X');
  });

  it('corta el modelo a 80 caracteres', () => {
    mockDispositivo.modelo = 'M'.repeat(120);
    expect(nombreDispositivo()).toBe('M'.repeat(80));
  });
});

describe('iniciarSesion', () => {
  const RESPUESTA = {
    success: true,
    token: 'token-ficticio',
    refreshToken: 'refresh-ficticio',
    refreshExpiraEn: '2026-11-18T12:00:00.000Z',
    usuario: { id: 7, nombre: 'Clienta de Prueba', email: CORREO, rol: 'cliente' },
  };

  it('hace POST a /api/auth/login con canal movil y devuelve la respuesta tal cual', async () => {
    responderJson(RESPUESTA);
    await expect(iniciarSesion(CORREO, CLAVE)).resolves.toEqual(RESPUESTA);
    expect(llamada().url).toBe(`${API}/api/auth/login`);
    expect(llamada().init.method).toBe('POST');
    expect(cabeceras()['Content-Type']).toBe('application/json');
    expect(cuerpoEnviado()).toEqual({ email: CORREO, password: CLAVE, canal: 'movil' });
  });

  it('sin modelo de teléfono no manda dispositivo', async () => {
    responderJson(RESPUESTA);
    await iniciarSesion(CORREO, CLAVE);
    expect(cuerpoEnviado()).not.toHaveProperty('dispositivo');
  });

  it('con modelo de teléfono lo manda como dispositivo', async () => {
    mockDispositivo.modelo = 'Teléfono Ficticio X';
    responderJson(RESPUESTA);
    await iniciarSesion(CORREO, CLAVE);
    expect(cuerpoEnviado()).toEqual({
      email: CORREO,
      password: CLAVE,
      canal: 'movil',
      dispositivo: 'Teléfono Ficticio X',
    });
  });

  it('manda el correo tal como lo recibe (normalizarlo le toca al viewmodel)', async () => {
    responderJson(RESPUESTA);
    await iniciarSesion('  Clienta@Ejemplo.TEST ', CLAVE);
    expect(cuerpoEnviado()).toMatchObject({ email: '  Clienta@Ejemplo.TEST ' });
  });

  it('no guarda nada en SecureStore (eso lo hace la sesión)', async () => {
    responderJson(RESPUESTA);
    await iniciarSesion(CORREO, CLAVE);
    expect(leerSecureStore()).toEqual({});
  });

  it('400: ApiError con el mensaje unido del backend', async () => {
    responderJson({ message: ['email must be an email', 'password should not be empty'] }, 400);
    const error = (await capturarError(iniciarSesion('malo', ''))) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toBe('email must be an email, password should not be empty');
  });

  it('401: credenciales inválidas, con su code y sin reintentar', async () => {
    responderJson({ message: 'Credenciales inválidas', code: 'CREDENCIALES_INVALIDAS' }, 401);
    const error = (await capturarError(iniciarSesion(CORREO, 'ClaveIncorrecta1!'))) as ApiError;
    expect(error.status).toBe(401);
    expect(error.code).toBe('CREDENCIALES_INVALIDAS');
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
  });

  it('403 de cuenta sin activar se reconoce con esCuentaSinActivar', async () => {
    responderJson({ message: 'Tu cuenta no está activada. Revisa tu correo.', code: 'CUENTA_NO_ACTIVADA' }, 403);
    const error = await capturarError(iniciarSesion(CORREO, CLAVE));
    expect(esCuentaSinActivar(error)).toBe(true);
  });

  it('429: ApiError con el status para mostrar la espera', async () => {
    responderJson({ message: 'ThrottlerException: Too Many Requests', statusCode: 429 }, 429);
    const error = (await capturarError(iniciarSesion(CORREO, CLAVE))) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
  });

  it('500: el mensaje técnico nunca llega a la clienta', async () => {
    responderJson({ message: 'PrismaClientInitializationError' }, 500);
    const error = await capturarError(iniciarSesion(CORREO, CLAVE));
    // GP-07.6: el texto para la clienta sale de mensajeParaClienta (el respaldo de la pantalla).
    expect(mensajeParaClienta(error, { respaldo: 'Genérico' })).toBe('Genérico');
  });

  it('sin red: ErrorDeRed', async () => {
    sinRed();
    await expect(iniciarSesion(CORREO, CLAVE)).rejects.toBeInstanceOf(ErrorDeRed);
  });
});

describe('cerrarSesionServidor', () => {
  it('sin refreshToken: POST /api/auth/logout con logoutAll false y el token indicado', async () => {
    await guardarSesionDePrueba();
    responderJson({ success: true });
    await expect(
      cerrarSesionServidor({ token: 'token-ficticio-a-revocar', emitidoEn: Date.now() }),
    ).resolves.toBeUndefined();
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(llamada().url).toBe(`${API}/api/auth/logout`);
    expect(llamada().init.method).toBe('POST');
    expect(cabeceras().Authorization).toBe('Bearer token-ficticio-a-revocar');
    expect(cuerpoEnviado()).toEqual({ logoutAll: false });
  });

  it('sin refreshToken no renueva aunque el token sea viejo', async () => {
    responderJson({ success: true });
    await cerrarSesionServidor({ token: 'token-ficticio-viejo', emitidoEn: Date.now() - 60 * MINUTO_MS });
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(llamada().url).toBe(`${API}/api/auth/logout`);
  });

  it('con refreshToken y acceso vigente: revoca esa sesión móvil en una sola petición', async () => {
    responderJson({ success: true });
    await cerrarSesionServidor({
      token: 'token-ficticio-vigente',
      emitidoEn: Date.now(),
      refreshToken: 'refresh-ficticio-vigente',
    });
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(llamada().url).toBe(`${API}/api/auth/logout`);
    expect(cabeceras().Authorization).toBe('Bearer token-ficticio-vigente');
    expect(cuerpoEnviado()).toEqual({ logoutAll: false, refreshToken: 'refresh-ficticio-vigente' });
  });

  it('lee la vida del acceso del JWT (exp menos iat), no del reloj del teléfono', async () => {
    // Acceso de una hora emitido hace 30 minutos: sigue vigente aunque pasen los 15 por defecto.
    const iat = 1_700_000_000;
    responderJson({ success: true });
    await cerrarSesionServidor({
      token: jwtFicticio(iat, iat + 60 * 60),
      emitidoEn: Date.now() - 30 * MINUTO_MS,
      refreshToken: 'refresh-ficticio-jwt',
    });
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(llamada().url).toBe(`${API}/api/auth/logout`);
  });

  it('con el acceso por vencer: renueva solo en memoria y revoca con los tokens nuevos', async () => {
    responderJson({ success: true, token: 'token-ficticio-renovado', refreshToken: 'refresh-ficticio-renovado' });
    responderJson({ success: true });
    await cerrarSesionServidor({
      token: 'token-ficticio-por-vencer',
      emitidoEn: Date.now() - 15 * MINUTO_MS,
      refreshToken: 'refresh-ficticio-por-vencer',
    });
    expect(fetchSimulado()).toHaveBeenCalledTimes(2);

    expect(llamada(0).url).toBe(`${API}/api/auth/movil/renovar`);
    expect(llamada(0).init.method).toBe('POST');
    expect(cabeceras(0)).not.toHaveProperty('Authorization');
    expect(cuerpoEnviado(0)).toEqual({ refreshToken: 'refresh-ficticio-por-vencer' });

    expect(llamada(1).url).toBe(`${API}/api/auth/logout`);
    expect(cabeceras(1).Authorization).toBe('Bearer token-ficticio-renovado');
    expect(cuerpoEnviado(1)).toEqual({ logoutAll: false, refreshToken: 'refresh-ficticio-renovado' });

    // Los tokens nuevos nunca se guardan en el teléfono.
    expect(leerSecureStore()).toEqual({});
  });

  it('el margen de renovación es de un minuto antes del vencimiento', async () => {
    // 15 min de vida, emitido hace 13 min 59 s: todavía no entra al margen de 60 s.
    responderJson({ success: true });
    await cerrarSesionServidor({
      token: 'token-ficticio-margen',
      emitidoEn: Date.now() - (14 * MINUTO_MS - 1000),
      refreshToken: 'refresh-ficticio-margen',
    });
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(llamada().url).toBe(`${API}/api/auth/logout`);
  });

  it.each([
    ['401 de la renovación', () => responderJson({ message: 'Sesión vencida', code: 'SESION_VENCIDA' }, 401)],
    ['409 de reuso', () => responderJson({ message: 'Reuso detectado', code: 'REUSO' }, 409)],
    ['429 de la renovación', () => responderJson({ message: 'Too Many Requests' }, 429)],
    ['200 sin tokens', () => responderJson({ success: true })],
    ['sin red', sinRed],
  ])('si la renovación no da tokens (%s), no intenta revocar y no lanza', async (caso, prepararRespuesta) => {
    prepararRespuesta();
    await expect(
      cerrarSesionServidor({
        token: 'token-ficticio-sin-renovar',
        emitidoEn: Date.now() - 20 * MINUTO_MS,
        refreshToken: `refresh-ficticio-${caso}`,
      }),
    ).resolves.toBeUndefined();
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(llamada().url).toBe(`${API}/api/auth/movil/renovar`);
  });

  it('un refreshToken ya rotado no se vuelve a mandar al servidor', async () => {
    const sesion = {
      token: 'token-ficticio-rotado',
      emitidoEn: Date.now() - 20 * MINUTO_MS,
      refreshToken: 'refresh-ficticio-rotado',
    };
    responderJson({ token: 'token-ficticio-r2', refreshToken: 'refresh-ficticio-r2' });
    responderJson({ success: true });
    await cerrarSesionServidor(sesion);
    expect(fetchSimulado()).toHaveBeenCalledTimes(2);

    await expect(cerrarSesionServidor(sesion)).resolves.toBeUndefined();
    expect(fetchSimulado()).toHaveBeenCalledTimes(2);
  });

  it('401 del logout: lanza ApiError sin renovar ni borrar la sesión guardada', async () => {
    const guardada = await guardarSesionDePrueba({ refreshToken: 'refresh-ficticio-guardado' });
    responderJson({ message: 'Token inválido' }, 401);
    const error = (await capturarError(
      cerrarSesionServidor({ token: 'token-ficticio-otro', emitidoEn: Date.now() }),
    )) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
    expect(await leerSesion()).toEqual(guardada);
  });

  it('sin red en el logout: ErrorDeRed', async () => {
    sinRed();
    await expect(
      cerrarSesionServidor({ token: 'token-ficticio', emitidoEn: Date.now() }),
    ).rejects.toBeInstanceOf(ErrorDeRed);
  });

  it('con token vacío no manda nada', async () => {
    await expect(cerrarSesionServidor({ token: '', emitidoEn: Date.now() })).rejects.toThrow(
      'Token explícito vacío: la petición no se envía.',
    );
    expect(fetchSimulado()).not.toHaveBeenCalled();
  });
});

describe('obtenerPerfil', () => {
  it('hace GET a /api/auth/me con el token guardado y devuelve la respuesta', async () => {
    await guardarSesionDePrueba();
    const perfil = { data: { id: 'clienta-1', nombre: 'Clienta de Prueba', email: CORREO, rol: 'cliente' } };
    responderJson(perfil);
    await expect(obtenerPerfil()).resolves.toEqual(perfil);
    expect(llamada().url).toBe(`${API}/api/auth/me`);
    expect(llamada().init.method).toBe('GET');
    expect(llamada().init.body).toBeUndefined();
    expect(cabeceras().Authorization).toBe('Bearer token-ficticio-guardado');
  });

  it('sin sesión sale sin token y el 401 solo se informa', async () => {
    responderJson({ message: 'Unauthorized' }, 401);
    const error = (await capturarError(obtenerPerfil())) as ApiError;
    expect(cabeceras()).not.toHaveProperty('Authorization');
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(fetchSimulado()).toHaveBeenCalledTimes(1);
  });

  it('429: ApiError', async () => {
    await guardarSesionDePrueba();
    responderJson({ message: 'Too Many Requests' }, 429);
    const error = (await capturarError(obtenerPerfil())) as ApiError;
    expect(error.status).toBe(429);
  });

  it('sin red: ErrorDeRed y la sesión se conserva', async () => {
    const sesion = await guardarSesionDePrueba();
    sinRed();
    await expect(obtenerPerfil()).rejects.toBeInstanceOf(ErrorDeRed);
    expect(await leerSesion()).toEqual(sesion);
  });
});

describe('obtenerPreguntasSeguridad', () => {
  const PREGUNTAS = [
    { id: 'p1', pregunta: '¿Nombre de tu primera mascota?' },
    { id: 'p2', pregunta: '¿Ciudad donde naciste?' },
  ];

  it('hace GET a /api/pregunta-seguridad y devuelve solo data', async () => {
    responderJson({ success: true, data: PREGUNTAS });
    await expect(obtenerPreguntasSeguridad()).resolves.toEqual(PREGUNTAS);
    expect(llamada().url).toBe(`${API}/api/pregunta-seguridad`);
    expect(llamada().init.method).toBe('GET');
  });

  it.each([
    ['data no es arreglo', JSON.stringify({ success: true, data: 'nada' })],
    ['sin data', JSON.stringify({ success: true })],
    ['un arreglo suelto (sin envoltura data)', JSON.stringify(PREGUNTAS)],
    ['cuerpo vacío', null],
  ])('devuelve [] si %s', async (_caso, cuerpo) => {
    responder(cuerpo, 200);
    await expect(obtenerPreguntasSeguridad()).resolves.toEqual([]);
  });

  it('429: ApiError', async () => {
    responderJson({ message: 'Too Many Requests' }, 429);
    const error = (await capturarError(obtenerPreguntasSeguridad())) as ApiError;
    expect(error.status).toBe(429);
  });

  it('sin red: ErrorDeRed', async () => {
    sinRed();
    await expect(obtenerPreguntasSeguridad()).rejects.toBeInstanceOf(ErrorDeRed);
  });
});

describe('verificarCorreo', () => {
  it('hace POST a /api/auth/verificar-correo con { correo } y devuelve si existe', async () => {
    responderJson({ existe: true, message: 'El correo ya está registrado' });
    await expect(verificarCorreo(CORREO)).resolves.toEqual({
      existe: true,
      message: 'El correo ya está registrado',
    });
    expect(llamada().url).toBe(`${API}/api/auth/verificar-correo`);
    expect(llamada().init.method).toBe('POST');
    expect(cuerpoEnviado()).toEqual({ correo: CORREO });
  });

  it('400: ApiError con el mensaje del backend', async () => {
    responderJson({ message: 'El correo no es válido' }, 400);
    const error = (await capturarError(verificarCorreo('malo'))) as ApiError;
    expect(error.status).toBe(400);
    expect(error.message).toBe('El correo no es válido');
  });

  it('429: ApiError', async () => {
    responderJson({ message: 'Too Many Requests' }, 429);
    const error = (await capturarError(verificarCorreo(CORREO))) as ApiError;
    expect(error.status).toBe(429);
  });

  it('sin red: ErrorDeRed', async () => {
    sinRed();
    await expect(verificarCorreo(CORREO)).rejects.toBeInstanceOf(ErrorDeRed);
  });
});

describe('registrarUsuario', () => {
  it('hace POST a /api/usuarios/registro con los datos tal cual (contrato actual)', async () => {
    responderJson({ success: true, message: 'Revisa tu correo para activar tu cuenta' }, 201);
    await expect(registrarUsuario(DATOS_REGISTRO)).resolves.toEqual({
      success: true,
      message: 'Revisa tu correo para activar tu cuenta',
    });
    expect(llamada().url).toBe(`${API}/api/usuarios/registro`);
    expect(llamada().init.method).toBe('POST');
    expect(llamada().init.body).toBe(JSON.stringify(DATOS_REGISTRO));
    expect(cuerpoEnviado()).toEqual(DATOS_REGISTRO);
  });

  it('los opcionales que no vienen no se mandan', async () => {
    const sinOpcionales: DatosRegistro = {
      ...DATOS_REGISTRO,
      perfilCapilar: { tipoCabello: 'liso', tieneAlergias: false, tratamientosQuimicos: false },
    };
    delete sinOpcionales.consienteDatosSensibles;
    responderJson({ success: true }, 201);
    await registrarUsuario(sinOpcionales);
    const enviado = cuerpoEnviado() as Record<string, unknown>;
    expect(enviado).not.toHaveProperty('consienteDatosSensibles');
    expect(enviado.perfilCapilar).toEqual({ tipoCabello: 'liso', tieneAlergias: false, tratamientosQuimicos: false });
  });

  it('400: une los mensajes de validación', async () => {
    responderJson({ message: ['telefono must be 10 digits', 'password too weak'], error: 'Bad Request' }, 400);
    const error = (await capturarError(registrarUsuario(DATOS_REGISTRO))) as ApiError;
    expect(error.status).toBe(400);
    expect(error.message).toBe('telefono must be 10 digits, password too weak');
  });

  it('409: correo ya registrado, con su code; el texto del servidor no llega a la clienta', async () => {
    responderJson({ message: 'El correo ya está registrado', code: 'CORREO_REGISTRADO' }, 409);
    const error = (await capturarError(registrarUsuario(DATOS_REGISTRO))) as ApiError;
    expect(error.status).toBe(409);
    expect(error.code).toBe('CORREO_REGISTRADO');
    expect(mensajeParaClienta(error, { respaldo: 'Genérico' })).toBe('Genérico');
  });

  it('429: ApiError', async () => {
    responderJson({ message: 'Too Many Requests' }, 429);
    const error = (await capturarError(registrarUsuario(DATOS_REGISTRO))) as ApiError;
    expect(error.status).toBe(429);
  });

  it('sin red: ErrorDeRed', async () => {
    sinRed();
    await expect(registrarUsuario(DATOS_REGISTRO)).rejects.toBeInstanceOf(ErrorDeRed);
  });
});

describe('verificarCodigo', () => {
  it('hace POST a /api/auth/verificar-otp con { email, codigo }', async () => {
    responderJson({ success: true, message: 'Cuenta activada' });
    await expect(verificarCodigo(CORREO, '123456')).resolves.toEqual({ success: true, message: 'Cuenta activada' });
    expect(llamada().url).toBe(`${API}/api/auth/verificar-otp`);
    expect(llamada().init.method).toBe('POST');
    expect(cuerpoEnviado()).toEqual({ email: CORREO, codigo: '123456' });
  });

  it('400: código inválido con su code', async () => {
    responderJson({ message: 'El código no es válido', code: 'CODIGO_INVALIDO' }, 400);
    const error = (await capturarError(verificarCodigo(CORREO, '000000'))) as ApiError;
    expect(error.status).toBe(400);
    expect(error.code).toBe('CODIGO_INVALIDO');
    expect(error.message).toBe('El código no es válido');
  });

  it('429: ApiError', async () => {
    responderJson({ message: 'Too Many Requests' }, 429);
    const error = (await capturarError(verificarCodigo(CORREO, '123456'))) as ApiError;
    expect(error.status).toBe(429);
  });

  it('sin red: ErrorDeRed', async () => {
    sinRed();
    await expect(verificarCodigo(CORREO, '123456')).rejects.toBeInstanceOf(ErrorDeRed);
  });
});

describe('reenviarCodigo', () => {
  it('hace POST a /api/auth/reenviar-codigo con { email }', async () => {
    responderJson({ success: true, message: 'Código reenviado' });
    await expect(reenviarCodigo(CORREO)).resolves.toEqual({ success: true, message: 'Código reenviado' });
    expect(llamada().url).toBe(`${API}/api/auth/reenviar-codigo`);
    expect(llamada().init.method).toBe('POST');
    expect(cuerpoEnviado()).toEqual({ email: CORREO });
  });

  it('400: ApiError con el mensaje del backend', async () => {
    responderJson({ message: 'La cuenta ya está activada' }, 400);
    const error = (await capturarError(reenviarCodigo(CORREO))) as ApiError;
    expect(error.status).toBe(400);
    expect(error.message).toBe('La cuenta ya está activada');
  });

  it('429: más de 3 por minuto', async () => {
    responderJson({ message: 'ThrottlerException: Too Many Requests' }, 429);
    const error = (await capturarError(reenviarCodigo(CORREO))) as ApiError;
    expect(error.status).toBe(429);
  });

  it('sin red: ErrorDeRed', async () => {
    sinRed();
    await expect(reenviarCodigo(CORREO)).rejects.toBeInstanceOf(ErrorDeRed);
  });
});

describe('solicitarEnlaceRecuperacion', () => {
  it('hace POST a /api/auth/solicitar-enlace-recuperacion con { email }', async () => {
    responderJson({ success: true, message: 'Si el correo existe, te enviamos un enlace' });
    await expect(solicitarEnlaceRecuperacion(CORREO)).resolves.toEqual({
      success: true,
      message: 'Si el correo existe, te enviamos un enlace',
    });
    expect(llamada().url).toBe(`${API}/api/auth/solicitar-enlace-recuperacion`);
    expect(llamada().init.method).toBe('POST');
    expect(cuerpoEnviado()).toEqual({ email: CORREO });
  });

  it('400: ApiError', async () => {
    responderJson({ message: 'email must be an email' }, 400);
    const error = (await capturarError(solicitarEnlaceRecuperacion('malo'))) as ApiError;
    expect(error.status).toBe(400);
  });

  it('429: ApiError', async () => {
    responderJson({ message: 'Too Many Requests' }, 429);
    const error = (await capturarError(solicitarEnlaceRecuperacion(CORREO))) as ApiError;
    expect(error.status).toBe(429);
  });

  it('sin red: ErrorDeRed', async () => {
    sinRed();
    await expect(solicitarEnlaceRecuperacion(CORREO)).rejects.toBeInstanceOf(ErrorDeRed);
  });
});

describe('normalizarUsuario', () => {
  it('convierte un id numérico a texto', () => {
    expect(normalizarUsuario({ id: 7, nombre: 'Clienta de Prueba', email: CORREO, rol: 'cliente' })).toEqual({
      id: '7',
      nombre: 'Clienta de Prueba',
      email: CORREO,
      rol: 'cliente',
    });
  });

  it('acepta el id 0 porque como texto no está vacío', () => {
    expect(normalizarUsuario({ id: 0, email: CORREO, rol: 'cliente' })?.id).toBe('0');
  });

  it('sin nombre o con un nombre que no es texto usa ""', () => {
    expect(normalizarUsuario({ id: 'u1', email: CORREO, rol: 'cliente' })?.nombre).toBe('');
    expect(normalizarUsuario({ id: 'u1', nombre: 42, email: CORREO, rol: 'cliente' })?.nombre).toBe('');
  });

  it('solo deja id, nombre, email y rol', () => {
    expect(
      normalizarUsuario({
        id: 'u1',
        nombre: 'Clienta de Prueba',
        email: CORREO,
        rol: 'cliente',
        password: 'hash-ficticio',
        telefono: '7711234560',
      }),
    ).toEqual({ id: 'u1', nombre: 'Clienta de Prueba', email: CORREO, rol: 'cliente' });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['un texto', 'clienta'],
    ['un número', 7],
    ['un arreglo', []],
    ['sin id', { email: CORREO, rol: 'cliente' }],
    ['con id vacío', { id: '', email: CORREO, rol: 'cliente' }],
    ['con id booleano', { id: true, email: CORREO, rol: 'cliente' }],
    ['sin email', { id: 'u1', rol: 'cliente' }],
    ['con email que no es texto', { id: 'u1', email: 5, rol: 'cliente' }],
    ['sin rol', { id: 'u1', email: CORREO }],
    ['con rol que no es texto', { id: 'u1', email: CORREO, rol: 1 }],
  ])('devuelve null con %s', (_caso, valor) => {
    expect(normalizarUsuario(valor)).toBeNull();
  });
});
