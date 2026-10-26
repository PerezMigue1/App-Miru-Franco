/// <reference types="jest" />

import {
  CODIGO_CUENTA_DESACTIVADA,
  ErrorCuentaDesactivada,
  esCuentaDesactivada,
  esCuentaSinActivar,
} from '@/features/auth/models/AuthModel';
import {
  CODIGOS_CONFIRMACION,
  bloqueosDelError,
  confirmarReactivacion,
  cuerpoConfirmacion,
  desactivarCuenta,
  eliminarCuenta,
  esCuentaCambio,
  esCuentaConPendientes,
  esCuentaDePersonal,
  esErrorDeConfirmacion,
  esErrorDePassword,
  mensajeDeCuenta,
  normalizarPendiente,
  normalizarResultadoBaja,
  normalizarRevision,
  pedirCodigoCuenta,
  revisarCuenta,
  solicitarReactivacion,
} from '@/features/auth/models/cuentaPropia';
import { leerRetornoGoogle, REDIRECCION_GOOGLE } from '@/features/auth/models/googleAuth';
import { ApiError, ErrorDeRed, apiDelete } from '@/shared/api/apiClient';
import { CODIGO_BLOQUEO_TEMPORAL, MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { CODIGO_GOOGLE, regresoConCodigo } from '../../helpers/google';
import { limite429, respuestaCon, servidorEnOrden } from '../../helpers/limitesRed';
import { cerrarPruebaSesion, guardarEnAlmacen, sesionFicticia } from '../../helpers/sesionLimites';

/**
 * GP-09, prompt 2, bloque A: modelo de la cuenta propia (desactivar, eliminar y reactivar) según
 * CONTRATO_APP_CUENTA.md. Cuerpos y rutas exactos, normalización de la revisión (lo desconocido
 * nunca permite continuar), reconocimiento de cada code y el regreso de Google con
 * error=cuenta_desactivada. fetch simulado en http://api.test con datos ficticios.
 */

const RUTA_REVISION = '/api/auth/me/cuenta/revision';
const RUTA_CODIGO = '/api/auth/me/cuenta/codigo';
const RUTA_DESACTIVAR = '/api/auth/me/desactivar';
const RUTA_ELIMINAR = '/api/auth/me';
const RUTA_SOLICITAR = '/api/auth/reactivar/solicitar';
const RUTA_CONFIRMAR = '/api/auth/reactivar/confirmar';
const CORREO = 'clienta@ejemplo.test';
const CLAVE = 'ClaveFicticia1!';
const CODIGO = '123456';
const FOLIO = 'ARCO-2026-000123';

const CITA_SE_CANCELA = {
  tipo: 'cita_se_cancela',
  entidad: 'cita',
  id: 128,
  mensaje: 'Tu cita de Corte del 28 oct 2026, 11:00.',
  enlace: '/cliente/servicios-citas/mis-citas',
};
const PEDIDO_SE_CANCELA = {
  tipo: 'pedido_se_cancela',
  entidad: 'pedido',
  id: 57,
  mensaje: 'Tu pedido #57 sin pagar.',
  enlace: '/cliente/tienda-online/mis-pedidos',
};
const BLOQUEO_CITA = {
  tipo: 'cita_con_anticipo',
  entidad: 'cita',
  id: 130,
  mensaje: 'Tu cita de Tinte tiene un anticipo pagado.',
  enlace: '/cliente/servicios-citas/mis-citas',
};

function revisionValida(extra: Record<string, unknown> = {}) {
  return {
    metodoConfirmacion: 'password',
    seResuelveSolo: [CITA_SE_CANCELA, PEDIDO_SE_CANCELA],
    bloqueos: [],
    puedeContinuar: true,
    ...extra,
  };
}

/** Error del backend con la forma del filtro global. */
function errorDelBackend(status: number, code: string | undefined, message: string, errors?: unknown): Response {
  return respuestaCon(
    { success: false, statusCode: status, error: 'Error', message, ...(code ? { code } : {}), ...(errors ? { errors } : {}) },
    status,
  );
}

async function errorDe(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba que la petición fallara.');
}

afterEach(async () => {
  await cerrarPruebaSesion();
});

describe('normalizarRevision', () => {
  it('lee la revisión del contrato tal cual', () => {
    expect(normalizarRevision(revisionValida())).toEqual({
      metodoConfirmacion: 'password',
      seResuelveSolo: [
        { tipo: 'cita_se_cancela', entidad: 'cita', id: '128', mensaje: CITA_SE_CANCELA.mensaje },
        { tipo: 'pedido_se_cancela', entidad: 'pedido', id: '57', mensaje: PEDIDO_SE_CANCELA.mensaje },
      ],
      bloqueos: [],
      puedeContinuar: true,
    });
  });

  it('acepta el método codigo de las cuentas de Google', () => {
    expect(normalizarRevision(revisionValida({ metodoConfirmacion: 'codigo' }))?.metodoConfirmacion).toBe('codigo');
  });

  it.each([
    ['sin datos', null],
    ['una lista', []],
    ['un método desconocido', revisionValida({ metodoConfirmacion: 'biometria' })],
    ['sin método', revisionValida({ metodoConfirmacion: undefined })],
    ['sin seResuelveSolo', revisionValida({ seResuelveSolo: undefined })],
    ['seResuelveSolo que no es lista', revisionValida({ seResuelveSolo: true })],
    ['bloqueos que no es lista', revisionValida({ bloqueos: {} })],
    ['un pendiente que se cancela sin texto', revisionValida({ seResuelveSolo: [{ ...CITA_SE_CANCELA, mensaje: '' }] })],
  ])('con %s no se puede confiar en ella (null)', (_caso, valor) => {
    expect(normalizarRevision(valor)).toBeNull();
  });

  it.each([
    ['falso', false],
    ['el texto "true"', 'true'],
    ['1', 1],
    ['sin el campo', undefined],
  ])('puedeContinuar %s no deja continuar', (_caso, valor) => {
    expect(normalizarRevision(revisionValida({ puedeContinuar: valor }))?.puedeContinuar).toBe(false);
  });

  it('con un bloqueo no se continúa aunque el servidor diga puedeContinuar: true', () => {
    const revision = normalizarRevision(revisionValida({ bloqueos: [BLOQUEO_CITA], puedeContinuar: true }));
    expect(revision?.puedeContinuar).toBe(false);
    expect(revision?.bloqueos).toEqual([
      { tipo: 'cita_con_anticipo', entidad: 'cita', id: '130', mensaje: BLOQUEO_CITA.mensaje },
    ]);
  });

  it('un bloqueo sin forma sigue bloqueando, sin entidad ni texto', () => {
    const revision = normalizarRevision(revisionValida({ bloqueos: ['raro'], puedeContinuar: true }));
    expect(revision?.puedeContinuar).toBe(false);
    expect(revision?.bloqueos).toEqual([{ tipo: '', entidad: null, id: null, mensaje: '' }]);
  });
});

describe('normalizarPendiente', () => {
  it.each([
    ['una entidad desconocida', { ...BLOQUEO_CITA, entidad: 'factura' }],
    ['un id cero', { ...BLOQUEO_CITA, id: 0 }],
    ['un id negativo', { ...BLOQUEO_CITA, id: -3 }],
    ['un id con letras', { ...BLOQUEO_CITA, id: '12a' }],
    ['un id decimal', { ...BLOQUEO_CITA, id: 1.5 }],
    ['sin id', { ...BLOQUEO_CITA, id: undefined }],
  ])('con %s no abre ninguna pantalla', (_caso, valor) => {
    expect(normalizarPendiente(valor)).toMatchObject({ entidad: null, id: null, mensaje: BLOQUEO_CITA.mensaje });
  });

  it('acepta el id como texto de dígitos', () => {
    expect(normalizarPendiente({ ...PEDIDO_SE_CANCELA, id: '57' })).toMatchObject({ entidad: 'pedido', id: '57' });
  });
});

describe('cuerpoConfirmacion', () => {
  it('con contraseña manda solo password y confirmacion: true', () => {
    expect(cuerpoConfirmacion({ metodo: 'password', password: CLAVE })).toEqual({ password: CLAVE, confirmacion: true });
  });

  it('con código manda solo codigo y confirmacion: true', () => {
    expect(cuerpoConfirmacion({ metodo: 'codigo', codigo: CODIGO })).toEqual({ codigo: CODIGO, confirmacion: true });
  });
});

describe('llamadas protegidas de la cuenta', () => {
  beforeEach(async () => {
    await guardarEnAlmacen(sesionFicticia());
  });

  it('revisarCuenta pide GET /api/auth/me/cuenta/revision con la sesión y normaliza data', async () => {
    const llamadas = servidorEnOrden({ [`GET ${RUTA_REVISION}`]: [respuestaCon({ success: true, data: revisionValida() })] });

    const revision = await revisarCuenta();

    expect(revision.puedeContinuar).toBe(true);
    expect(revision.seResuelveSolo).toHaveLength(2);
    expect(llamadas[0].cabeceras.Authorization).toMatch(/^Bearer /);
  });

  it('una revisión sin forma es un error de la respuesta, nunca un permiso', async () => {
    servidorEnOrden({ [`GET ${RUTA_REVISION}`]: [respuestaCon({ success: true, data: revisionValida({ metodoConfirmacion: 'x' }) })] });

    expect(await errorDe(revisarCuenta())).toMatchObject({ status: 500 });
  });

  it('una respuesta vacía también es un error', async () => {
    servidorEnOrden({ [`GET ${RUTA_REVISION}`]: [respuestaCon(null)] });

    expect(await errorDe(revisarCuenta())).toBeInstanceOf(ApiError);
  });

  it('pedirCodigoCuenta manda POST con {} y nunca devuelve un código', async () => {
    const llamadas = servidorEnOrden({
      [`POST ${RUTA_CODIGO}`]: [
        respuestaCon({ success: true, message: 'Te enviamos un código a tu correo. Vence en 10 minutos.', vigenciaMinutos: 10 }),
      ],
    });

    const enviado = await pedirCodigoCuenta();

    expect(llamadas[0].cuerpo).toEqual({});
    expect(enviado).toEqual({ mensaje: 'Te enviamos un código a tu correo. Vence en 10 minutos.', vigenciaMinutos: 10 });
  });

  it('pedirCodigoCuenta ignora una vigencia que no sirve y un message técnico', async () => {
    servidorEnOrden({ [`POST ${RUTA_CODIGO}`]: [respuestaCon({ success: true, message: 'OK', vigenciaMinutos: '10' })] });

    expect(await pedirCodigoCuenta()).toEqual({ mensaje: null, vigenciaMinutos: null });
  });

  it('desactivarCuenta manda POST /api/auth/me/desactivar con la contraseña y la casilla', async () => {
    const llamadas = servidorEnOrden({
      [`POST ${RUTA_DESACTIVAR}`]: [
        respuestaCon({ success: true, message: 'Desactivamos tu cuenta y cerramos tus sesiones.', data: { cancelaciones: [], correoEnviado: true } }),
      ],
    });

    const resultado = await desactivarCuenta({ metodo: 'password', password: CLAVE });

    expect(llamadas[0]).toMatchObject({ metodo: 'POST', ruta: RUTA_DESACTIVAR, cuerpo: { password: CLAVE, confirmacion: true } });
    expect(resultado).toEqual({ mensaje: 'Desactivamos tu cuenta y cerramos tus sesiones.', folio: null });
  });

  it('eliminarCuenta manda DELETE /api/auth/me con el código y devuelve el folio', async () => {
    const mensaje = `Eliminamos tu cuenta. Te enviamos la confirmación con el folio ${FOLIO} a tu correo.`;
    const llamadas = servidorEnOrden({
      [`DELETE ${RUTA_ELIMINAR}`]: [respuestaCon({ success: true, message: mensaje, data: { folio: FOLIO, cancelaciones: [] } })],
    });

    const resultado = await eliminarCuenta({ metodo: 'codigo', codigo: CODIGO });

    expect(llamadas[0]).toMatchObject({ metodo: 'DELETE', ruta: RUTA_ELIMINAR, cuerpo: { codigo: CODIGO, confirmacion: true } });
    expect(resultado).toEqual({ mensaje, folio: FOLIO });
  });

  it('un error de la baja conserva el code, el message y errors.bloqueos', async () => {
    servidorEnOrden({
      [`POST ${RUTA_DESACTIVAR}`]: [errorDelBackend(409, 'CUENTA_CON_PENDIENTES', 'Tienes pendientes.', { bloqueos: [BLOQUEO_CITA] })],
    });

    const error = await errorDe(desactivarCuenta({ metodo: 'password', password: CLAVE }));

    expect(esCuentaConPendientes(error)).toBe(true);
    expect(bloqueosDelError(error)).toEqual([
      { tipo: 'cita_con_anticipo', entidad: 'cita', id: '130', mensaje: BLOQUEO_CITA.mensaje },
    ]);
  });
});

describe('reactivar (públicas)', () => {
  it('solicitarReactivacion manda solo { email }, sin sesión, y devuelve el texto neutro', async () => {
    await guardarEnAlmacen(sesionFicticia());
    const neutro = 'Si tu cuenta está desactivada, te enviamos un código. Revisa tu correo, también la carpeta de spam.';
    const llamadas = servidorEnOrden({ [`POST ${RUTA_SOLICITAR}`]: [respuestaCon({ success: true, message: neutro })] });

    expect(await solicitarReactivacion(CORREO)).toBe(neutro);
    expect(llamadas[0].cuerpo).toEqual({ email: CORREO });
    expect(llamadas[0].cabeceras.Authorization).toBeUndefined();
  });

  it('confirmarReactivacion manda { email, codigo } sin sesión', async () => {
    const listo = 'Tu cuenta está activa otra vez. Ya puedes iniciar sesión.';
    const llamadas = servidorEnOrden({ [`POST ${RUTA_CONFIRMAR}`]: [respuestaCon({ success: true, message: listo })] });

    expect(await confirmarReactivacion(CORREO, CODIGO)).toBe(listo);
    expect(llamadas[0].cuerpo).toEqual({ email: CORREO, codigo: CODIGO });
    expect(llamadas[0].cabeceras.Authorization).toBeUndefined();
  });

  it('sin message para la clienta devuelve null (la pantalla usa su texto)', async () => {
    servidorEnOrden({ [`POST ${RUTA_SOLICITAR}`]: [respuestaCon({ success: true })] });

    expect(await solicitarReactivacion(CORREO)).toBeNull();
  });
});

describe('normalizarResultadoBaja', () => {
  it.each([
    ['sin data', { success: true, message: 'Listo.' }],
    ['un folio vacío', { message: 'Listo.', data: { folio: '  ' } }],
    ['un folio con minúsculas', { message: 'Listo.', data: { folio: 'arco-1' } }],
    ['un folio que no es texto', { message: 'Listo.', data: { folio: 123 } }],
    ['un folio con espacios dentro', { message: 'Listo.', data: { folio: 'ARCO 1' } }],
  ])('con %s el folio es null', (_caso, respuesta) => {
    expect(normalizarResultadoBaja(respuesta).folio).toBeNull();
  });

  it('sin respuesta no trae mensaje ni folio', () => {
    expect(normalizarResultadoBaja(null)).toEqual({ mensaje: null, folio: null });
  });
});

describe('reconocimiento por code', () => {
  const error = (status: number, code?: string, message = 'Mensaje del servidor para la clienta.') =>
    new ApiError(status, message, code);

  it('409 CUENTA_CON_PENDIENTES y 409 CUENTA_CAMBIO', () => {
    expect(esCuentaConPendientes(error(409, 'CUENTA_CON_PENDIENTES'))).toBe(true);
    expect(esCuentaCambio(error(409, 'CUENTA_CAMBIO'))).toBe(true);
    expect(esCuentaConPendientes(error(409, 'CUENTA_CAMBIO'))).toBe(false);
    expect(esCuentaCambio(error(400, 'CUENTA_CAMBIO'))).toBe(false);
    expect(esCuentaConPendientes(new Error('CUENTA_CON_PENDIENTES'))).toBe(false);
  });

  it('403 CUENTA_DE_PERSONAL', () => {
    expect(esCuentaDePersonal(error(403, 'CUENTA_DE_PERSONAL'))).toBe(true);
    expect(esCuentaDePersonal(error(403))).toBe(false);
  });

  it.each([...CODIGOS_CONFIRMACION])('el 400 %s es de la confirmación (nunca un 401)', (code) => {
    expect(esErrorDeConfirmacion(error(400, code))).toBe(true);
    expect(esErrorDeConfirmacion(error(401, code))).toBe(false);
  });

  it('los 8 codes de la confirmación del contrato', () => {
    expect([...CODIGOS_CONFIRMACION].sort()).toEqual(
      [
        'CODIGO_INCORRECTO',
        'CODIGO_INVALIDO',
        'CODIGO_REQUERIDO',
        'CODIGO_VENCIDO',
        'INTENTOS_AGOTADOS',
        'PASSWORD_INCORRECTA',
        'PASSWORD_REQUERIDA',
        'SIN_CODIGO',
      ].sort(),
    );
  });

  it('un 400 sin code o con otro code no es de la confirmación', () => {
    expect(esErrorDeConfirmacion(error(400))).toBe(false);
    expect(esErrorDeConfirmacion(error(400, 'OTRO'))).toBe(false);
  });

  it('los de la contraseña se distinguen de los del código', () => {
    expect(esErrorDePassword(error(400, 'PASSWORD_INCORRECTA'))).toBe(true);
    expect(esErrorDePassword(error(400, 'PASSWORD_REQUERIDA'))).toBe(true);
    expect(esErrorDePassword(error(400, 'CODIGO_INCORRECTO'))).toBe(false);
  });

  it('bloqueosDelError: [] si no es CUENTA_CON_PENDIENTES o no trae la lista', () => {
    expect(bloqueosDelError(error(409, 'CUENTA_CAMBIO'))).toEqual([]);
    expect(bloqueosDelError(new ApiError(409, 'x', 'CUENTA_CON_PENDIENTES', undefined, undefined, { bloqueos: 'no' }))).toEqual([]);
    expect(bloqueosDelError(new ApiError(409, 'x', 'CUENTA_CON_PENDIENTES'))).toEqual([]);
  });
});

describe('403 CUENTA_DESACTIVADA del login', () => {
  it('se reconoce solo por su code', () => {
    expect(esCuentaDesactivada(new ApiError(403, 'Desactivaste tu cuenta.', CODIGO_CUENTA_DESACTIVADA))).toBe(true);
    expect(esCuentaDesactivada(new ErrorCuentaDesactivada())).toBe(true);
  });

  it('CUENTA_NO_ACTIVADA y cualquier otro 403 no son cuenta desactivada', () => {
    const sinActivar = new ApiError(403, 'Tu cuenta no está activada.', 'CUENTA_NO_ACTIVADA');
    expect(esCuentaDesactivada(sinActivar)).toBe(false);
    expect(esCuentaSinActivar(sinActivar)).toBe(true);
    expect(esCuentaDesactivada(new ApiError(403, 'Desactivaste tu cuenta.'))).toBe(false);
    expect(esCuentaDesactivada(new ApiError(401, 'x', CODIGO_CUENTA_DESACTIVADA))).toBe(false);
    expect(esCuentaSinActivar(new ApiError(403, 'x', CODIGO_CUENTA_DESACTIVADA))).toBe(false);
  });
});

describe('mensajeDeCuenta', () => {
  const RESPALDO = 'Respaldo de la pantalla.';

  it.each([...CODIGOS_CONFIRMACION, 'CUENTA_DE_PERSONAL', 'CUENTA_CAMBIO', 'CUENTA_CON_PENDIENTES', 'CUENTA_DESACTIVADA'])(
    'con %s muestra el message del backend',
    (code) => {
      expect(mensajeDeCuenta(new ApiError(400, 'Texto del catálogo para la clienta.', code), RESPALDO)).toBe(
        'Texto del catálogo para la clienta.',
      );
    },
  );

  it.each([
    ['PASSWORD_REQUERIDA', RESPALDO_TEXTOS['cuenta.app.error.passwordRequerida']],
    ['PASSWORD_INCORRECTA', RESPALDO_TEXTOS['cuenta.app.error.passwordIncorrecta']],
    ['CODIGO_REQUERIDO', RESPALDO_TEXTOS['cuenta.app.error.codigoRequerido']],
    ['SIN_CODIGO', RESPALDO_TEXTOS['cuenta.app.error.sinCodigo']],
    ['CODIGO_INCORRECTO', RESPALDO_TEXTOS['errores.codigoIncorrecto']],
    ['CODIGO_VENCIDO', RESPALDO_TEXTOS['errores.codigoVencido']],
    ['INTENTOS_AGOTADOS', RESPALDO_TEXTOS['errores.intentosAgotados']],
    ['CODIGO_INVALIDO', RESPALDO_TEXTOS['errores.codigoInvalido']],
    ['CUENTA_DE_PERSONAL', RESPALDO_TEXTOS['cuenta.personal']],
    ['CUENTA_CAMBIO', RESPALDO_TEXTOS['cuenta.app.cambio']],
    ['CUENTA_CON_PENDIENTES', RESPALDO_TEXTOS['cuenta.revision.bloquea']],
    ['CUENTA_DESACTIVADA', RESPALDO_TEXTOS['cuenta.login.desactivada']],
    ['CUENTA_CON_PASSWORD', RESPALDO_TEXTOS['cuenta.app.error.cuentaConPassword']],
    ['CORREO_NO_ENVIADO', RESPALDO_TEXTOS['errores.correoNoEnviado']],
  ])('con %s sin message usa el respaldo de la app', (code, esperado) => {
    expect(mensajeDeCuenta(new ApiError(400, '', code), RESPALDO)).toBe(esperado);
  });

  it('un message técnico con code conocido no se muestra', () => {
    expect(mensajeDeCuenta(new ApiError(400, 'BadRequestException', 'SIN_CODIGO'), RESPALDO)).toBe(
      RESPALDO_TEXTOS['cuenta.app.error.sinCodigo'],
    );
  });

  it.each([
    ['Forbidden', 403, 'CUENTA_DE_PERSONAL', RESPALDO_TEXTOS['cuenta.personal']],
    ['Bad Gateway', 502, 'CORREO_NO_ENVIADO', RESPALDO_TEXTOS['errores.correoNoEnviado']],
    ['Unauthorized', 400, 'PASSWORD_INCORRECTA', RESPALDO_TEXTOS['cuenta.app.error.passwordIncorrecta']],
    ['Not Found', 400, 'SIN_CODIGO', RESPALDO_TEXTOS['cuenta.app.error.sinCodigo']],
    ['Gateway Timeout', 400, 'CODIGO_REQUERIDO', RESPALDO_TEXTOS['cuenta.app.error.codigoRequerido']],
  ])('el nombre HTTP "%s" (sin message) nunca se muestra', (nombre, status, code, esperado) => {
    expect(mensajeDeCuenta(new ApiError(status, nombre, code), RESPALDO)).toBe(esperado);
  });

  it('un 400 sin code (por ejemplo, sin la casilla) nunca muestra el message', () => {
    expect(mensajeDeCuenta(new ApiError(400, 'property x should not exist'), RESPALDO)).toBe(RESPALDO);
  });

  it('el 429 BLOQUEO_TEMPORAL y el 429 ESPERA_CODIGO muestran su message', () => {
    expect(mensajeDeCuenta(new ApiError(429, 'Bloqueamos tu cuenta 15 minutos.', CODIGO_BLOQUEO_TEMPORAL, undefined, 900), RESPALDO)).toBe(
      'Bloqueamos tu cuenta 15 minutos.',
    );
    expect(mensajeDeCuenta(new ApiError(429, '', 'ESPERA_CODIGO'), RESPALDO)).toBe(RESPALDO_TEXTOS['cuenta.app.error.esperaCodigo']);
  });

  it('un 429 sin code con retryAfter muestra su message (límite de peticiones)', () => {
    expect(mensajeDeCuenta(new ApiError(429, 'Demasiadas solicitudes. Intenta de nuevo en 30 segundos.', undefined, undefined, 30), RESPALDO)).toBe(
      'Demasiadas solicitudes. Intenta de nuevo en 30 segundos.',
    );
  });

  it('sin red usa el texto único de sin conexión', () => {
    expect(mensajeDeCuenta(new ErrorDeRed(), RESPALDO)).toBe(MENSAJE_SIN_CONEXION);
  });

  it('un 5xx sin code usa el respaldo de la pantalla', () => {
    expect(mensajeDeCuenta(new ApiError(503, 'Service Unavailable'), RESPALDO)).toBe(RESPALDO);
  });
});

describe('apiDelete con cuerpo', () => {
  it('manda el cuerpo JSON solo si se lo pasan', async () => {
    const llamadas = servidorEnOrden({ 'DELETE /a': [respuestaCon(null)], 'DELETE /b': [respuestaCon(null)] });

    await apiDelete('/a', { publica: true }, { campo: 1 });
    await apiDelete('/b', { publica: true });

    expect(llamadas[0].cuerpo).toEqual({ campo: 1 });
    expect(llamadas[1].cuerpo).toBeUndefined();
  });

  it('un 429 de la baja conserva su retryAfter', async () => {
    await guardarEnAlmacen(sesionFicticia());
    servidorEnOrden({ [`DELETE ${RUTA_ELIMINAR}`]: [limite429(40)] });

    expect(await errorDe(eliminarCuenta({ metodo: 'password', password: CLAVE }))).toMatchObject({ status: 429, retryAfter: 40 });
  });
});

describe('regreso de Google con error=cuenta_desactivada', () => {
  it('el regreso exacto se reconoce aparte', () => {
    expect(leerRetornoGoogle(`${REDIRECCION_GOOGLE}?error=cuenta_desactivada`)).toEqual({ tipo: 'cuentaDesactivada' });
  });

  it.each([
    ['otro error', `${REDIRECCION_GOOGLE}?error=authentication_failed`],
    ['el error en mayúsculas', `${REDIRECCION_GOOGLE}?error=CUENTA_DESACTIVADA`],
    ['con otro parámetro', `${REDIRECCION_GOOGLE}?error=cuenta_desactivada&x=1`],
    ['con un code además', `${REDIRECCION_GOOGLE}?error=cuenta_desactivada&code=${CODIGO_GOOGLE}`],
    ['con fragmento', `${REDIRECCION_GOOGLE}?error=cuenta_desactivada#`],
    ['en otra ruta', 'appmirufranco://auth/otra?error=cuenta_desactivada'],
    ['con espacio al final', `${REDIRECCION_GOOGLE}?error=cuenta_desactivada `],
  ])('con %s sigue siendo el error genérico', (_caso, url) => {
    expect(leerRetornoGoogle(url)).toEqual({ tipo: 'error' });
  });

  it('la validación estricta del code no cambia', () => {
    expect(leerRetornoGoogle(regresoConCodigo())).toEqual({ tipo: 'codigo', code: CODIGO_GOOGLE });
    expect(leerRetornoGoogle(regresoConCodigo('zz'))).toEqual({ tipo: 'error' });
  });
});
