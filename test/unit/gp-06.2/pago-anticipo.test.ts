/// <reference types="jest" />

import {
  crearPreferenciaAnticipo,
  mensajeAnticipoParaClienta,
  motivoConflictoAnticipo,
  obtenerEstadoAnticipo,
  REDIRECCION_ANTICIPO,
  RETORNO_MERCADO_PAGO,
  type EstadoAnticipo,
} from '@/features/citas/models/citaModel';
import { ApiError, crearErrorApi, ErrorDeRed } from '@/shared/api/apiClient';

import {
  CLIENTA_CITAS,
  conError,
  deepLinkAnticipo,
  ERRORES,
  errorDe,
  ESTADO_APP_DEL_BACKEND,
  ESTADOS_ANTICIPO_BACKEND,
  estadoAnticipoCrudo,
  ID_CITA,
  initPointFicticio,
  llamadasDeRuta,
  preferenciaCruda,
  rutaEstadoAnticipo,
  rutaPreferencia,
  simularServidorReserva,
  simularSinRed,
  usarRelojFijo,
  type CuerpoError,
  type EstadoAnticipoBackend,
} from '../../helpers/citasFicticias';
import { respuesta } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';

/**
 * GP-06.2 (reservar cita con anticipo): pago del anticipo con Mercado Pago en
 * src/features/citas/models/citaModel.ts, en caja blanca. crearPreferenciaAnticipo (initPoint https
 * y sus errores), obtenerEstadoAnticipo con cada estado real del backend y las constantes del regreso
 * a la app. Solo fetch es simulado (http://api.test) y el reloj está fijo en AHORA.
 */

usarRelojFijo();

const MENSAJE_SIN_INIT_POINT = 'Respuesta de anticipo sin initPoint.';

/** El estado agrupado que da la app para ese cuerpo de GET /api/pagos-en-linea/citas/:id/estado. */
async function estadoDe(cuerpo: unknown): Promise<EstadoAnticipo> {
  simularServidorReserva({ [rutaEstadoAnticipo()]: () => respuesta(cuerpo) });
  return obtenerEstadoAnticipo(ID_CITA);
}

// ── crearPreferenciaAnticipo ─────────────────────────────────────────────────────────────────

describe('crearPreferenciaAnticipo: URL de Mercado Pago', () => {
  it('pide la preferencia con origen=app, sin cuerpo y con sesión, y devuelve el initPoint', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidorReserva({});
    await expect(crearPreferenciaAnticipo(ID_CITA)).resolves.toBe(initPointFicticio());
    expect(llamadas).toHaveLength(1);
    const [llamada] = llamadasDeRuta(llamadas, rutaPreferencia());
    expect(llamada.ruta).toBe(`/api/pagos-en-linea/citas/${ID_CITA}/preferencia?origen=app`);
    expect(llamada.cuerpo).toBeUndefined();
    expect(llamada.cabeceras.Authorization).toMatch(/^Bearer /);
  });

  it('el id de texto da la misma ruta que el numérico', async () => {
    const llamadas = simularServidorReserva({});
    await crearPreferenciaAnticipo(String(ID_CITA));
    expect(llamadasDeRuta(llamadas, rutaPreferencia())).toHaveLength(1);
  });

  it('codifica el id con encodeURIComponent', async () => {
    const id = 'a b/c?d';
    const llamadas = simularServidorReserva({ [rutaPreferencia(id)]: () => respuesta(preferenciaCruda(id)) });
    await expect(crearPreferenciaAnticipo(id)).resolves.toBe(initPointFicticio(id));
    expect(llamadas[0].ruta).toBe('/api/pagos-en-linea/citas/a%20b%2Fc%3Fd/preferencia?origen=app');
  });

  it.each<[string, unknown]>([
    ['con espacios alrededor', { initPoint: `  ${initPointFicticio()}  ` }],
    ['envuelto en { data }', { success: true, data: preferenciaCruda() }],
  ])('acepta el initPoint https %s', async (_caso, cuerpo) => {
    simularServidorReserva({ [rutaPreferencia()]: () => respuesta(cuerpo, 201) });
    await expect(crearPreferenciaAnticipo(ID_CITA)).resolves.toBe(initPointFicticio());
  });

  it.each<[string, unknown]>([
    ['sin initPoint', {}],
    ['initPoint vacío', { initPoint: '' }],
    ['initPoint http', { initPoint: 'http://pago.test/checkout/cita-501' }],
    ['solo el prefijo https', { initPoint: 'https://' }],
    ['initPoint numérico', { initPoint: 501 }],
    ['con otro nombre de campo', { init_point: initPointFicticio() }],
    ['cuerpo null', null],
    ['cuerpo de texto', initPointFicticio()],
  ])('%s falla con un error que no es ApiError', async (_caso, cuerpo) => {
    simularServidorReserva({ [rutaPreferencia()]: () => respuesta(cuerpo, 201) });
    const error = await errorDe(crearPreferenciaAnticipo(ID_CITA));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).message).toBe(MENSAJE_SIN_INIT_POINT);
  });
});

describe('crearPreferenciaAnticipo: errores del backend', () => {
  it.each<[string, CuerpoError, ReturnType<typeof motivoConflictoAnticipo>]>([
    ['409 plazo terminado', ERRORES.plazoTerminado, 'vencido'],
    ['409 ya pagado', ERRORES.anticipoPagado, 'pagado'],
    ['409 cita no vigente', ERRORES.citaNoVigente, 'noVigente'],
    ['400 la cita no pide anticipo', ERRORES.noPideAnticipo, null],
    ['404 cita ajena o inexistente', ERRORES.citaNoEncontrada, null],
    ['500', ERRORES.interno, null],
  ])('un %s llega como ApiError y su motivo es %p', async (_caso, cuerpo, motivo) => {
    simularServidorReserva({ [rutaPreferencia()]: conError(cuerpo) });
    const error = await errorDe(crearPreferenciaAnticipo(ID_CITA));
    expect(error).toEqual(crearErrorApi({ tipo: 'respuesta', status: cuerpo.statusCode, cuerpo }));
    expect(motivoConflictoAnticipo(error)).toBe(motivo);
    // Ninguno de estos textos se muestra tal cual: no son de la lista para la clienta.
    expect(mensajeAnticipoParaClienta(error)).toBeNull();
  });

  it('sin red llega como el ErrorDeRed de apiClient', async () => {
    simularSinRed();
    const error = await errorDe(crearPreferenciaAnticipo(ID_CITA));
    expect(error).toBeInstanceOf(ErrorDeRed);
    expect(motivoConflictoAnticipo(error)).toBeNull();
  });
});

// ── obtenerEstadoAnticipo ────────────────────────────────────────────────────────────────────

describe('obtenerEstadoAnticipo: estado real (GET /api/pagos-en-linea/citas/:id/estado)', () => {
  it('pide el estado con sesión y sin cuerpo', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidorReserva({});
    await obtenerEstadoAnticipo(ID_CITA);
    expect(llamadas).toHaveLength(1);
    const [llamada] = llamadasDeRuta(llamadas, rutaEstadoAnticipo());
    expect(llamada.ruta).toBe(`/api/pagos-en-linea/citas/${ID_CITA}/estado`);
    expect(llamada.cuerpo).toBeUndefined();
    expect(llamada.cabeceras.Authorization).toMatch(/^Bearer /);
  });

  it('codifica el id con encodeURIComponent', async () => {
    const id = 'a b/c';
    const llamadas = simularServidorReserva({ [rutaEstadoAnticipo(id)]: () => respuesta(estadoAnticipoCrudo('aprobado')) });
    await expect(obtenerEstadoAnticipo(id)).resolves.toBe('aprobado');
    expect(llamadas[0].ruta).toBe('/api/pagos-en-linea/citas/a%20b%2Fc/estado');
  });

  // aprobado y no_requiere → 'aprobado'; pendiente y revision → 'pendiente'; rechazado, cancelada,
  // vencido, reembolsado y sin_pago → 'sin_pago'.
  it.each(ESTADOS_ANTICIPO_BACKEND.map((estado) => [estado, ESTADO_APP_DEL_BACKEND[estado]]))(
    'el estado %s del backend queda como %s',
    async (estado, esperado) => {
      await expect(estadoDe(estadoAnticipoCrudo(estado))).resolves.toBe(esperado);
    },
  );

  it.each<[string, EstadoAnticipoBackend]>([
    ['Mercado Pago en proceso', 'pendiente'],
    ['pago en revisión', 'revision'],
  ])('en proceso (%s) NUNCA se trata como sin pago', async (_caso, estado) => {
    const resultado = await estadoDe(estadoAnticipoCrudo(estado));
    expect(resultado).not.toBe('sin_pago');
    expect(resultado).toBe('pendiente');
  });

  it.each<[string, unknown]>([
    ['desconocido', estadoAnticipoCrudo('desconocido')],
    ['vacío', estadoAnticipoCrudo('')],
    ['en mayúsculas (no se reconoce)', estadoAnticipoCrudo('APROBADO')],
    ['el estado de un pago en lugar del anticipo', estadoAnticipoCrudo('en_revision')],
    ['sin estado', { citaEstado: 'pendiente' }],
    ['estado null', { estado: null }],
    ['estado numérico', { estado: 1 }],
    ['cuerpo null', null],
    ['cuerpo de texto', 'aprobado'],
  ])('un estado %s se trata como sin pago', async (_caso, cuerpo) => {
    await expect(estadoDe(cuerpo)).resolves.toBe('sin_pago');
  });

  it.each<[string, unknown, EstadoAnticipo]>([
    ['con espacios alrededor', estadoAnticipoCrudo(' revision '), 'pendiente'],
    ['envuelto en { data }', { success: true, data: estadoAnticipoCrudo('aprobado') }, 'aprobado'],
  ])('lee el estado %s', async (_caso, cuerpo, esperado) => {
    await expect(estadoDe(cuerpo)).resolves.toBe(esperado);
  });

  it.each<[string, () => void, (error: unknown) => void]>([
    ['sin red llega como ErrorDeRed', simularSinRed, (error) => expect(error).toEqual(crearErrorApi({ tipo: 'red' }))],
    [
      'un 404 llega como ApiError',
      () => simularServidorReserva({ [rutaEstadoAnticipo()]: conError(ERRORES.citaNoEncontrada) }),
      (error) =>
        expect(error).toEqual(
          crearErrorApi({ tipo: 'respuesta', status: 404, cuerpo: ERRORES.citaNoEncontrada }),
        ),
    ],
  ])('%s', async (_caso, preparar, revisar) => {
    preparar();
    revisar(await errorDe(obtenerEstadoAnticipo(ID_CITA)));
  });
});

// ── Regreso de Mercado Pago ──────────────────────────────────────────────────────────────────

describe('regreso de Mercado Pago a la app', () => {
  it('REDIRECCION_ANTICIPO es el deep link appmirufranco://anticipo', () => {
    expect(REDIRECCION_ANTICIPO).toBe('appmirufranco://anticipo');
  });

  it('RETORNO_MERCADO_PAGO es la marca retorno=mp', () => {
    expect(RETORNO_MERCADO_PAGO).toBe('retorno=mp');
  });

  it('juntas arman el regreso appmirufranco://anticipo/<id>?retorno=mp del backend', () => {
    expect(`${REDIRECCION_ANTICIPO}/${ID_CITA}?${RETORNO_MERCADO_PAGO}`).toBe(deepLinkAnticipo());
  });
});
