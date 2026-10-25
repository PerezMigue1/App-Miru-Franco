/// <reference types="jest" />

import { mensajeDelReenvio } from '@/features/auth/models/AuthModel';
import {
  MENSAJES_ANTICIPO_EN_SALON,
  MENSAJES_ANTICIPO_PARA_CLIENTA,
  mensajeAnticipoEnSalon,
  mensajeAnticipoParaClienta,
  mensajeCancelacion,
  mensajeReprogramacion,
} from '@/features/citas/models/citaModel';
import { registrarAceptacionAnticipos } from '@/features/citas/models/gestionCitaModel';
import { mensajeErrorAvisos } from '@/features/notificaciones/models/avisoModel';
import { mensajeComunTienda, mensajeErrorCarrito } from '@/features/tienda/models/carritoModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { AHORA } from '../../helpers/citasFicticias';
import { reiniciarRepositorios, servidorGestion, turnos } from '../../helpers/gestionCitas';
import { RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';
import { respuesta } from '../../helpers/servidorSimulado';
import {
  TEXTO_DEMASIADAS_SOLICITUDES,
  TEXTO_SESION_TERMINADA,
  TEXTO_SIN_CONEXION,
  TEXTO_TIEMPO_AGOTADO,
} from '../../helpers/textosError';

/**
 * GP-07.6, los modelos de las features pasan por mensajeParaClienta (shared/api/mensajesError): el
 * texto del servidor solo sirve para clasificar y lo que se devuelve es siempre un texto propio de
 * la app, con el tiempo agotado, el límite de solicitudes y la referencia de un 5xx. fetch simulado
 * en http://api.test, datos ficticios.
 */

reiniciarRepositorios();
beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
});
afterEach(() => {
  jest.useRealTimers();
});

const TECNICO = 'QueryFailedError: relation "citas" does not exist';
const REFERENCIA = 'ABCDEF12';
const FRASE_REFERENCIA = RESPALDO_TEXTOS['errores.referencia'].replace('{referencia}', REFERENCIA);
const THROTTLER = new ApiError(429, 'ThrottlerException: Too Many Requests');
const TIEMPO_AGOTADO = new ErrorDeRed('tiempoAgotado');
const conReferencia = (status = 500) => new ApiError(status, TECNICO, undefined, REFERENCIA);

describe('citaModel: los 400 del anticipo devuelven el texto propio', () => {
  it.each(MENSAJES_ANTICIPO_PARA_CLIENTA.map((texto) => [texto]))('"%s" (con espacios del servidor) da el texto de la lista', (texto) => {
    const propio = mensajeAnticipoParaClienta(new ApiError(400, `  ${texto}  `));

    expect(propio).toBe(texto);
    expect(MENSAJES_ANTICIPO_PARA_CLIENTA).toContain(propio);
  });

  it('la variante con N citas por pagar en el salón se arma con el número, no con el texto del servidor', () => {
    expect(
      mensajeAnticipoParaClienta(new ApiError(400, 'Ya tienes 3 citas por pagar en el salón. Paga su anticipo o elige pagar en línea.')),
    ).toBe('Ya tienes 3 citas por pagar en el salón. Paga su anticipo o elige pagar en línea.');
  });

  it.each([
    ['otro 400 en inglés', new ApiError(400, 'Bad Request Exception')],
    ['el texto de la lista con otro status', new ApiError(409, MENSAJES_ANTICIPO_PARA_CLIENTA[0])],
    ['un texto que solo empieza como la variante', new ApiError(400, 'Ya tienes 3 citas por pagar en el salón. <script>')],
    ['sin red', new ErrorDeRed()],
  ])('%s: null', (_caso, error) => {
    expect(mensajeAnticipoParaClienta(error)).toBeNull();
  });
});

describe('citaModel: anticipo en el salón', () => {
  it.each(
    Object.entries(MENSAJES_ANTICIPO_EN_SALON).flatMap(([status, textos]) => textos.map((texto) => [Number(status), texto] as const)),
  )('%i "%s" da el texto propio', (status, texto) => {
    expect(mensajeAnticipoEnSalon(new ApiError(status, texto))).toBe(texto);
  });

  it('la variante con N citas solo vale en un 400 y se arma con el número', () => {
    const variante = 'Ya tienes 2 citas por pagar en el salón. Paga su anticipo o paga esta en línea.';

    expect(mensajeAnticipoEnSalon(new ApiError(400, variante))).toBe(variante);
    expect(mensajeAnticipoEnSalon(new ApiError(409, variante))).toBe(RESPALDO_TEXTOS['citas.anticipoSalon.noSePudo']);
  });

  it.each<[string, unknown, string]>([
    ['tiempo agotado', TIEMPO_AGOTADO, TEXTO_TIEMPO_AGOTADO],
    ['429 (ThrottlerException)', THROTTLER, TEXTO_DEMASIADAS_SOLICITUDES],
    ['500 con referencia', conReferencia(), `${RESPALDO_TEXTOS['citas.anticipoSalon.noSePudo']} ${FRASE_REFERENCIA}`],
  ])('%s: el texto de mensajeParaClienta', (_caso, error, esperado) => {
    expect(mensajeAnticipoEnSalon(error)).toBe(esperado);
  });
});

describe('citaModel: reprogramar y cancelar', () => {
  it.each<[string, (error: unknown) => string, string]>([
    ['reprogramar', mensajeReprogramacion, 'No pudimos cambiar tu cita. Intenta de nuevo en un momento.'],
    ['cancelar', mensajeCancelacion, 'No pudimos cancelar tu cita. Intenta de nuevo en un momento.'],
  ])('%s distingue cada tipo de error y nunca muestra el texto del servidor', (_caso, mensaje, generico) => {
    expect(mensaje(new ErrorDeRed())).toBe(TEXTO_SIN_CONEXION);
    expect(mensaje(TIEMPO_AGOTADO)).toBe(TEXTO_TIEMPO_AGOTADO);
    expect(mensaje(new ApiError(401, TECNICO))).toBe(TEXTO_SESION_TERMINADA);
    expect(mensaje(THROTTLER)).toBe(TEXTO_DEMASIADAS_SOLICITUDES);
    expect(mensaje(new ApiError(500, TECNICO))).toBe(generico);
    expect(mensaje(conReferencia(503))).toBe(`${generico} ${FRASE_REFERENCIA}`);
    expect(mensaje(new ApiError(400, 'motivo must be a string'))).not.toContain('must be');
  });
});

describe('tienda y avisos: lo común pasa por mensajeSinContexto', () => {
  it.each<[string, unknown, string | null]>([
    ['sin red', new ErrorDeRed(), TEXTO_SIN_CONEXION],
    ['tiempo agotado', TIEMPO_AGOTADO, TEXTO_TIEMPO_AGOTADO],
    ['401', new ApiError(401, TECNICO), TEXTO_SESION_TERMINADA],
    ['429 (ThrottlerException)', THROTTLER, TEXTO_DEMASIADAS_SOLICITUDES],
    ['un code conocido', new ApiError(409, TECNICO, 'RENOVACION_EN_CURSO'), RESPALDO_TEXTOS['errores.renovacionEnCurso']],
    ['500', new ApiError(500, TECNICO), null],
  ])('mensajeComunTienda con %s', (_caso, error, esperado) => {
    expect(mensajeComunTienda(error)).toBe(esperado);
  });

  it.each<[string, unknown, string]>([
    ['tiempo agotado', TIEMPO_AGOTADO, TEXTO_TIEMPO_AGOTADO],
    ['429', THROTTLER, TEXTO_DEMASIADAS_SOLICITUDES],
    ['500 en inglés', new ApiError(500, 'Internal Server Error'), 'No pudimos actualizar tu carrito. Intenta de nuevo en un momento.'],
  ])('mensajeErrorCarrito con %s', (_caso, error, esperado) => {
    expect(mensajeErrorCarrito(error)).toBe(esperado);
  });

  it('mensajeErrorAvisos con tiempo agotado y con 429', () => {
    expect(mensajeErrorAvisos(TIEMPO_AGOTADO, 'cargar')).toBe(TEXTO_TIEMPO_AGOTADO);
    expect(mensajeErrorAvisos(THROTTLER, 'borrar')).toBe(TEXTO_DEMASIADAS_SOLICITUDES);
  });
});

describe('gestionCitaModel: registrar la aceptación de la política', () => {
  it.each<[string, () => Response | Promise<Response>, string]>([
    ['429', () => respuesta({ message: 'ThrottlerException: Too Many Requests' }, 429), TEXTO_DEMASIADAS_SOLICITUDES],
    [
      '500 con referencia',
      () => respuesta({ message: TECNICO, referencia: REFERENCIA }, 500),
      `${RESPALDO_TEXTOS['citas.detalle.consentimientoFallo']} ${FRASE_REFERENCIA}`,
    ],
  ])('con %s explica sin el texto del servidor', async (_caso, falla, esperado) => {
    await servidorGestion({ [RUTA_CONSENTIMIENTOS]: turnos(falla) });

    await expect(registrarAceptacionAnticipos('app/cita')).resolves.toBe(esperado);
  });
});

// GP-09: el reenvío ya no responde 400 por una cuenta activada; su 200 trae un mensaje neutro.
describe('AuthModel.mensajeDelReenvio', () => {
  const NEUTRO = 'Si la cuenta existe y falta activarla, te enviamos un código nuevo.';
  it.each<[string, unknown, string | null]>([
    ['el 200 con su mensaje neutro', { success: true, message: NEUTRO }, NEUTRO],
    ['el mensaje con espacios', { message: `  ${NEUTRO} ` }, NEUTRO],
    ['sin message', { success: true }, null],
    ['un message vacío', { message: '   ' }, null],
    ['un message que no es texto', { message: 42 }, null],
    ['un nombre HTTP en inglés', { message: 'OK' }, null],
    ['otro nombre HTTP en mayúsculas', { message: 'TOO MANY REQUESTS' }, null],
    ['un texto técnico', { message: 'TypeError: ficticio en reenviarCodigoException' }, null],
    ['sin cuerpo', null, null],
    ['un cuerpo que no es objeto', 'texto suelto', null],
  ])('%s', (_caso, respuesta, esperado) => {
    expect(mensajeDelReenvio(respuesta)).toBe(esperado);
  });
});
