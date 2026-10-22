/// <reference types="jest" />

import {
  avisoAnticipoEnSalon,
  crearCita,
  esHorarioOcupado,
  estadoAnticipo,
  limiteAnticipo,
  limitePagoCorto,
  mensajeAnticipoParaClienta,
  mensajeCancelacion,
  mensajeReprogramacion,
  montoPagadoAnticipo,
  obtenerCita,
  pideAnticipo,
  type Cita,
  type EstadoAnticipoCita,
} from '@/features/citas/models/citaModel';
import { ApiError, crearErrorApi } from '@/shared/api/apiClient';

import {
  AHORA,
  AVISO_EN_SALON_SIN_PLAZO,
  avisoEnSalonEsperado,
  citaCanceladaPorAnticipo,
  citaEnSalon,
  citaEnSalonNormalizada,
  citaPagadaEnSalon,
  CLIENTA_CITAS,
  conError,
  cuerpoCita,
  cuerpoErrorFiltro,
  DESFASE_MEXICO_HORAS,
  DIA_CITA,
  DIA_SABADO,
  ERRORES,
  errorDe,
  errorVariasPorPagarEnSalon,
  FIN_CITA_CON_ANTICIPO_ISO,
  HORA_MS,
  HOY,
  INICIO_CITA_ISO,
  isoMexico,
  masMinutos,
  MENSAJES_BACKEND,
  mensajeVariasPorPagarEnSalon,
  MINUTO_MS,
  MINUTOS_PAGO_EN_SALON,
  MOTIVO_CANCELACION,
  PAGADO_EN_ISO,
  pagoEnSalon,
  pagoNormalizado,
  RETENIDO_EN_ISO,
  RUTA_CREAR_CITA,
  rutaCita,
  simularServidorReserva,
  TEXTOS_MIS_CITAS,
  usarRelojFijo,
  VENCE_ANTICIPO_ISO,
  VENCE_EN_SALON_ISO,
  type CitaCruda,
  type CuerpoError,
} from '../../helpers/citasFicticias';
import { diaLegible, horaEnTelefono, plazoEsperado } from '../../helpers/pantallasReserva';
import { ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { respuesta } from '../../helpers/servidorSimulado';

/**
 * GP-06.5 (pago del anticipo en el salón): modelo de la cita con anticipo en el salón en
 * src/features/citas/models/citaModel.ts, en caja blanca. Cuándo la cita sigue pidiendo el pago en
 * el salón según su estado y su plazo (inicio menos 15 minutos), el límite y el aviso en la hora del
 * teléfono, lo pagado (con el reembolso que conserva anticipoPagadoEn) y los mensajes de los 400 del
 * salón, del 503 genérico, sin red y con la sesión vencida. Lo que ya prueban GP-06.2 y GP-06.3
 * (normalización campo por campo, la lista de mensajes del anticipo, los 400 de crearCita ya
 * conocidos y los límites armados a mano) no se repite. Solo fetch es simulado (http://api.test) y
 * el reloj está fijo en AHORA; apiClient es el real. Pasa con TZ=UTC y con TZ=America/Mexico_City.
 */

usarRelojFijo();

/** El teléfono está en la hora de México (TZ=America/Mexico_City); con TZ=UTC es false. */
const TELEFONO_EN_MEXICO = AHORA.getTimezoneOffset() === DESFASE_MEXICO_HORAS * 60;

/** La cita cruda tal como la entrega el modelo (GET /api/citas/:id?propios=true). */
async function normalizada(cruda: CitaCruda): Promise<Cita> {
  simularServidorReserva({ [rutaCita(cruda.id)]: () => respuesta(cuerpoCita(cruda)) });
  return obtenerCita(cruda.id);
}

/** ApiError tal como lo arma apiClient con ese cuerpo de error del backend. */
function apiErrorDe(cuerpo: CuerpoError): ApiError {
  return crearErrorApi({ tipo: 'respuesta', status: cuerpo.statusCode, cuerpo });
}

// ── Cuándo se ofrece el pago en el salón ─────────────────────────────────────────────────────

describe('estadoAnticipo y pideAnticipo de una cita con anticipo en el salón', () => {
  it('la cita llega con anticipoEnSalon y el plazo 15 minutos antes del inicio, no a las 2 horas', async () => {
    const cita = await normalizada(citaEnSalon());
    expect(cita).toMatchObject({
      anticipoEnSalon: true,
      anticipoVenceEn: VENCE_EN_SALON_ISO,
      fechaHoraInicio: INICIO_CITA_ISO,
      fechaHoraFin: FIN_CITA_CON_ANTICIPO_ISO,
    });
    expect(new Date(INICIO_CITA_ISO).getTime() - new Date(VENCE_EN_SALON_ISO).getTime()).toBe(
      MINUTOS_PAGO_EN_SALON * MINUTO_MS,
    );
  });

  // pideAnticipo solo mira el monto y anticipoPagadoEn; el estado de la cita lo resuelve estadoAnticipo.
  it.each<[string, EstadoAnticipoCita, boolean, CitaCruda]>([
    ['sin pagar y con el plazo por delante', 'pendiente', true, citaEnSalon()],
    [
      'de hoy a las 10:30: le quedan 15 minutos para pagar',
      'pendiente',
      true,
      citaEnSalon({ fechaHoraInicio: isoMexico(HOY, '10:30') }),
    ],
    [
      // GP-07.4: el reloj del teléfono no la vence; sigue pendiente hasta que el backend la cancele.
      'de hoy a las 10:10: el plazo (9:55) ya pasó y la barrida aún no la cancela',
      'pendiente',
      true,
      citaEnSalon({ fechaHoraInicio: isoMexico(HOY, '10:10') }),
    ],
    ['cancelada por la barrida (anticipo_no_pagado)', 'vencido', true, citaCanceladaPorAnticipo()],
    [
      'cancelada por la clienta antes de pagar',
      'liberada',
      true,
      citaEnSalon({ estado: 'cancelada', motivoCancelacion: MOTIVO_CANCELACION }),
    ],
    ['pagada en el salón (efectivo aprobado)', 'pagado', false, citaPagadaEnSalon()],
    ['pagada en el salón y la clienta no asistió', 'retenido', false, citaPagadaEnSalon({ estado: 'no_asistio' })],
    [
      'pagada en el salón y retenida al cancelar',
      'retenido',
      false,
      citaPagadaEnSalon({ estado: 'cancelada', pagos: [pagoEnSalon({ retenidoEn: RETENIDO_EN_ISO })] }),
    ],
    [
      'pagada en el salón y reembolsada (conserva anticipoPagadoEn)',
      'reembolsado',
      false,
      citaPagadaEnSalon({ estado: 'cancelada', pagos: [pagoEnSalon({ estado: 'reembolsado' })] }),
    ],
  ])('una cita %s da %p (pide anticipo: %p)', async (_caso, estado, pide, cruda) => {
    const cita = await normalizada(cruda);
    expect(cita.anticipoEnSalon).toBe(true);
    expect(estadoAnticipo(cita)).toBe(estado);
    expect(pideAnticipo(cita)).toBe(pide);
  });

  it('el pago en efectivo del salón se normaliza con su método y su monto', async () => {
    const cita = await normalizada(citaPagadaEnSalon());
    expect(cita.pagos).toEqual([
      pagoNormalizado({ estado: 'aprobado', metodo: 'efectivo', pagadoEn: PAGADO_EN_ISO }),
    ]);
  });

  // GP-07.4: el plazo vencido lo decide el backend; con el reloj tres horas después las dos siguen
  // pendientes y la de pago en línea ya no muestra una hora límite que pasó.
  it('tres horas después la cita en el salón y la de pago en línea siguen pendientes', () => {
    const despues = new Date(AHORA.getTime() + 3 * HORA_MS);
    jest.setSystemTime(despues);
    const enLinea = citaEnSalonNormalizada({ anticipoEnSalon: false, anticipoVenceEn: VENCE_ANTICIPO_ISO });
    expect(estadoAnticipo(citaEnSalonNormalizada())).toBe('pendiente');
    expect(estadoAnticipo(enLinea)).toBe('pendiente');
    expect(limitePagoCorto(enLinea.anticipoVenceEn, despues)).toBeNull();
  });
});

// ── Límite y aviso en la hora del teléfono ───────────────────────────────────────────────────

describe('limiteAnticipo y avisoAnticipoEnSalon con el plazo que manda el servidor', () => {
  /**
   * El límite que debe ver la clienta en la hora local del teléfono: solo la hora si vence el mismo
   * día que AHORA y el día con la hora si no. `fecha` es el día de la cita en México.
   */
  function limiteEnTelefono(fecha: string, vence: string): string {
    return fecha === HOY
      ? plazoEsperado(vence).slice('Paga '.length)
      : `antes del ${diaLegible(fecha)}, ${horaEnTelefono(vence)}`;
  }

  it.each<[string, string, string, string]>([
    ['hoy a la 1:15 p. m.: vence a la 1:00', HOY, '13:15', 'antes de la 1:00 p. m.'],
    ['hoy a la 1:00 p. m.: vence a las 12:45', HOY, '13:00', 'antes de las 12:45 p. m.'],
    ['el martes a las 11:00: vence otro día', DIA_CITA, '11:00', 'antes del martes 20 de octubre, 10:45 a. m.'],
    ['el sábado en el primer horario (9:30)', DIA_SABADO, '09:30', 'antes del sábado 24 de octubre, 9:15 a. m.'],
  ])('cita %s', async (_caso, fecha, hora, enMexico) => {
    const inicio = isoMexico(fecha, hora);
    const { anticipoVenceEn } = await normalizada(citaEnSalon({ fechaHoraInicio: inicio }));
    const vence = anticipoVenceEn ?? '';
    // La hora límite es exactamente el inicio menos 15 minutos.
    expect(vence).toBe(masMinutos(inicio, -MINUTOS_PAGO_EN_SALON).toISOString());
    // En México se lee la hora de Huejutla escrita a mano; con otra zona, la hora local del teléfono.
    const limite = TELEFONO_EN_MEXICO ? enMexico : limiteEnTelefono(fecha, vence);
    expect(limiteEnTelefono(fecha, vence)).toBe(limite);
    // Sin `ahora` usan el reloj del teléfono (fijo en AHORA).
    expect(limiteAnticipo(vence)).toBe(limite);
    expect(limitePagoCorto(vence)).toBe(`Paga ${limite}`);
    const aviso = avisoAnticipoEnSalon(vence);
    expect(aviso).toBe(avisoEnSalonEsperado(limite));
    expect(aviso).toContain(`(${MINUTOS_PAGO_EN_SALON} minutos antes de tu cita)`);
  });

  it.each<[string, string | null]>([
    ['la cita no trae plazo', null],
    ['el plazo no es una fecha', '2026-10-20T25:61:00.000Z'],
  ])('%s: sigue pendiente y el aviso pide pagar a más tardar 15 minutos antes', async (_caso, anticipoVenceEn) => {
    const cita = await normalizada(citaEnSalon({ anticipoVenceEn }));
    expect(estadoAnticipo(cita)).toBe('pendiente');
    expect(limiteAnticipo(cita.anticipoVenceEn, AHORA)).toBeNull();
    expect(limitePagoCorto(cita.anticipoVenceEn, AHORA)).toBeNull();
    expect(avisoAnticipoEnSalon(cita.anticipoVenceEn, AHORA)).toBe(AVISO_EN_SALON_SIN_PLAZO);
  });
});

// ── Monto por pagar y lo pagado ──────────────────────────────────────────────────────────────

describe('monto del anticipo en el salón y montoPagadoAnticipo', () => {
  it.each<[string, number, string]>([
    ['360.00', 360, '$360'],
    ['$1,200', 1200, '$1,200'],
  ])('anticipoRequerido %p se cobra como %p ("%s") y, ya pagado sin pago aprobado, cuenta completo', async (crudo, monto, texto) => {
    const porPagar = await normalizada(citaEnSalon({ anticipoRequerido: crudo }));
    expect(porPagar).toMatchObject({ anticipoRequerido: monto, anticipoMonto: texto });
    expect(montoPagadoAnticipo(porPagar)).toBe(0);
    const pagada = await normalizada(citaEnSalon({ anticipoRequerido: crudo, anticipoPagadoEn: PAGADO_EN_ISO }));
    expect(montoPagadoAnticipo(pagada)).toBe(monto);
  });

  const efectivo = (cambios: Parameters<typeof pagoNormalizado>[0] = {}) =>
    pagoNormalizado({ estado: 'aprobado', metodo: 'efectivo', pagadoEn: PAGADO_EN_ISO, ...cambios });

  it.each<[string, Partial<Cita>, number]>([
    ['pagada en el salón en efectivo', { anticipoPagadoEn: PAGADO_EN_ISO, pagos: [efectivo()] }, 360],
    ['marcada pagada sin ningún pago', { anticipoPagadoEn: PAGADO_EN_ISO, pagos: [] }, 360],
    [
      'pagada y reembolsada: el pago queda reembolsado y la cita conserva anticipoPagadoEn',
      { estado: 'cancelada', anticipoPagadoEn: PAGADO_EN_ISO, pagos: [efectivo({ estado: 'reembolsado' })] },
      0,
    ],
    [
      'reembolsada y vuelta a pagar: cuenta el pago aprobado',
      { anticipoPagadoEn: PAGADO_EN_ISO, pagos: [efectivo({ estado: 'reembolsado' }), efectivo()] },
      360,
    ],
    [
      'pagada y retenida por el salón',
      { estado: 'no_asistio', anticipoPagadoEn: PAGADO_EN_ISO, pagos: [efectivo({ retenidoEn: RETENIDO_EN_ISO })] },
      360,
    ],
    ['transferencia en revisión, sin aprobar', { pagos: [efectivo({ estado: 'en_revision', metodo: 'transferencia' })] }, 0],
    ['nada pagado', {}, 0],
  ])('%s', (_caso, cambios, esperado) => {
    expect(montoPagadoAnticipo(citaEnSalonNormalizada(cambios))).toBe(esperado);
  });
});

// ── Mensajes de error ────────────────────────────────────────────────────────────────────────

describe('mensajes de los 400 del anticipo en el salón', () => {
  it.each<[string, CuerpoError, string]>([
    ['regla permitirAnticipoEnSalon apagada', ERRORES.anticipoSalonNoPermitido, MENSAJES_BACKEND.anticipoSalonNoPermitido],
    ['ya tiene 2 citas por pagar en el salón', errorVariasPorPagarEnSalon(2), mensajeVariasPorPagarEnSalon(2)],
    ['ya tiene 3 citas por pagar en el salón', errorVariasPorPagarEnSalon(3), mensajeVariasPorPagarEnSalon(3)],
    [
      '2 citas por pagar con espacios de más',
      cuerpoErrorFiltro(400, `  ${mensajeVariasPorPagarEnSalon(2)}  `),
      mensajeVariasPorPagarEnSalon(2),
    ],
  ])('%s llega tal cual a la clienta', (_caso, cuerpo, esperado) => {
    const error = apiErrorDe(cuerpo);
    expect(mensajeAnticipoParaClienta(error)).toBe(esperado);
    expect(mensajeReprogramacion(error)).toBe(esperado);
    expect(esHorarioOcupado(error)).toBe(false);
  });

  it.each<[string, ApiError]>([
    [
      'un número escrito con letras',
      new ApiError(400, 'Ya tienes muchas citas por pagar en el salón. Paga su anticipo o elige pagar en línea.'),
    ],
    ['un número con decimales', new ApiError(400, mensajeVariasPorPagarEnSalon(2.5))],
    ['el texto de otra ruta', new ApiError(400, mensajeVariasPorPagarEnSalon(2).replace('elige pagar', 'paga esta'))],
    ['la regla apagada con otro texto encima', new ApiError(400, `Error: ${MENSAJES_BACKEND.anticipoSalonNoPermitido}`)],
    ['la regla apagada sin el punto final', new ApiError(400, MENSAJES_BACKEND.anticipoSalonNoPermitido.slice(0, -1))],
    ['la regla apagada como 409', new ApiError(409, MENSAJES_BACKEND.anticipoSalonNoPermitido)],
    ['2 citas por pagar como 500', new ApiError(500, mensajeVariasPorPagarEnSalon(2))],
    ['el 503 genérico del filtro', apiErrorDe(ERRORES.servicioNoDisponible)],
  ])('%s no llega a la clienta: null y mensajes genéricos', (_caso, error) => {
    expect(mensajeAnticipoParaClienta(error)).toBeNull();
    expect(mensajeReprogramacion(error)).toBe(TEXTOS_MIS_CITAS.reprogramarGenerico);
    expect(mensajeCancelacion(error)).toBe(TEXTOS_MIS_CITAS.cancelarGenerico);
  });

  it.each<[string, unknown, string]>([
    ['sin red', crearErrorApi({ tipo: 'red' }), TEXTOS_MIS_CITAS.sinConexion],
    ['con la sesión vencida', crearErrorApi({ tipo: 'sesionTerminada' }), TEXTOS_MIS_CITAS.sesionTerminada],
  ])('%s: mensajeAnticipoParaClienta da null y reprogramar y cancelar explican qué pasó', (_caso, error, esperado) => {
    expect(mensajeAnticipoParaClienta(error)).toBeNull();
    expect(mensajeReprogramacion(error)).toBe(esperado);
    expect(mensajeCancelacion(error)).toBe(esperado);
  });

  it('la sesión vencida es un ApiError 401 con code SESION_VENCIDA', () => {
    expect(crearErrorApi({ tipo: 'sesionTerminada' })).toMatchObject({ status: 401, code: 'SESION_VENCIDA' });
  });
});

describe("crearCita con pagoAnticipo 'salon' que el backend rechaza", () => {
  it.each<[string, CuerpoError, string | null]>([
    ['400 de la regla apagada', ERRORES.anticipoSalonNoPermitido, MENSAJES_BACKEND.anticipoSalonNoPermitido],
    ['400 de 2 citas por pagar en el salón', errorVariasPorPagarEnSalon(2), mensajeVariasPorPagarEnSalon(2)],
    ['503 genérico del filtro', ERRORES.servicioNoDisponible, null],
  ])('%s: ApiError con su status y el mensaje que puede ver la clienta', async (_caso, cuerpo, esperado) => {
    simularServidorReserva({ [RUTA_CREAR_CITA]: conError(cuerpo) });
    const error = await errorDe(
      crearCita({
        clienteId: CLIENTA_CITAS.id,
        especialistaId: ESPECIALISTA_UNO.usuarioId,
        servicioId: 2,
        fechaHoraInicio: INICIO_CITA_ISO,
        fechaHoraFin: FIN_CITA_CON_ANTICIPO_ISO,
        pagoAnticipo: 'salon',
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toEqual(apiErrorDe(cuerpo));
    expect(error).toMatchObject({ status: cuerpo.statusCode });
    expect(mensajeAnticipoParaClienta(error)).toBe(esperado);
  });
});
