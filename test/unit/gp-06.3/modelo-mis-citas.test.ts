/// <reference types="jest" />

import {
  admiteCambios,
  avisoAnticipoEnSalon,
  cancelarCita,
  esVigente,
  estadoAnticipo,
  etiquetaEstadoAnticipo,
  etiquetaEstadoCita,
  fechaLocal,
  limitePagoCorto,
  listarMisCitas,
  mensajeCancelacion,
  mensajeReprogramacion,
  montoPagadoAnticipo,
  obtenerCita,
  reprogramarCita,
  separarMisCitas,
  type Cita,
  type EstadoAnticipoCita,
  type EtiquetaEstado,
} from '@/features/citas/models/citaModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';

import {
  AHORA,
  AHORA_ISO,
  AYER,
  CITA_CON_ANTICIPO,
  CITA_CON_ANTICIPO_NORMALIZADA,
  CITA_SIN_ANTICIPO,
  CITA_SIN_ANTICIPO_NORMALIZADA,
  citaAnticipoPagado,
  citaCancelada,
  citaNormalizada,
  citaNormalizadaEn,
  citaReprogramada,
  CLIENTA_CITAS,
  conError,
  cuerpoCita,
  cuerpoError,
  cuerpoMisCitas,
  DESFASE_MEXICO_HORAS,
  DIA_CITA,
  DIA_SABADO,
  enHoraLocal,
  ERRORES,
  ERRORES_MIS_CITAS,
  errorDe,
  ESTADOS_CITA,
  HOY,
  ID_CITA,
  isoMexico,
  llamadasDeRuta,
  masMinutos,
  MENSAJES_BACKEND,
  MOTIVO_CANCELACION,
  PAGADO_EN_ISO,
  pagoCrudo,
  pagoNormalizado,
  RETENIDO_EN_ISO,
  RUTA_MIS_CITAS,
  rutaCancelar,
  rutaCita,
  rutaReprogramar,
  simularServidorMisCitas,
  sinRedEnRuta,
  slotCrudo,
  TEXTOS_MIS_CITAS,
  usarRelojFijo,
  VENCE_ANTICIPO_ISO,
  type CuerpoError,
} from '../../helpers/citasFicticias';
import { respuesta, type Llamada, type Manejador } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';

/**
 * GP-06.3 (Mis citas): modelo de Mis citas en src/features/citas/models/citaModel.ts, en caja blanca.
 * La lista y el detalle de las citas de la clienta, cómo se separan en próximas e historial con el
 * día local del teléfono, las insignias de la cita y del anticipo, lo pagado, reprogramar y cancelar,
 * y los mensajes de sus errores armados por apiClient. Lo que ya prueba GP-06.2 (crearCita,
 * disponibilidad, preferencia, normalización campo por campo y fechas del calendario) no se repite.
 * Solo fetch es simulado (http://api.test) y el reloj está fijo en AHORA; apiClient es el real.
 */

usarRelojFijo();

/** Hoy a las 10:00 del teléfono: el día y la hora no dependen de la zona con la que corre Jest. */
const AHORA_LOCAL = enHoraLocal(HOY, '10:00');

/** Sábado a las 12:00 de México: el horario nuevo al reprogramar. */
const SLOT_NUEVO = slotCrudo(DIA_SABADO, '12:00');

/** El pago aprobado del anticipo, ya normalizado. */
const PAGO_APROBADO = pagoNormalizado({ estado: 'aprobado', pagadoEn: PAGADO_EN_ISO });

/** Texto técnico que nunca debe llegar a la pantalla. */
const TEXTO_TECNICO = 'PrismaClientKnownRequestError: Unique constraint failed on the fields: (especialistaId)';

/** La única llamada a esa ruta, revisando que salió con la sesión de la clienta. */
function llamadaConSesion(llamadas: Llamada[], ruta: string): Llamada {
  const [llamada, ...otras] = llamadasDeRuta(llamadas, ruta);
  expect(otras).toHaveLength(0);
  expect(llamada?.cabeceras.Authorization).toMatch(/^Bearer /);
  return llamada;
}

/** Ids de las próximas y del historial, en su orden. */
function idsSeparados(citas: Cita[], ahora?: Date): { proximas: Cita['id'][]; historial: Cita['id'][] } {
  const { proximas, historial } = separarMisCitas(citas, ahora);
  return { proximas: proximas.map((c) => c.id), historial: historial.map((c) => c.id) };
}

/** El error con el que falla `llamar` cuando esa ruta responde con `manejador`. */
async function errorAl(ruta: string, manejador: Manejador, llamar: () => Promise<unknown>): Promise<unknown> {
  simularServidorMisCitas({ [ruta]: manejador });
  return errorDe(llamar());
}

const reprogramar = () => reprogramarCita(ID_CITA, SLOT_NUEVO);
const cancelar = () => cancelarCita(ID_CITA, MOTIVO_CANCELACION);

// ── Lista ────────────────────────────────────────────────────────────────────────────────────

describe('listarMisCitas: citas de la clienta (GET /api/citas?propios=true)', () => {
  it('pide la lista ordenada por inicio, hasta 100, con la sesión de la clienta (no es pública)', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidorMisCitas({});
    await listarMisCitas();
    expect(llamadas).toHaveLength(1);
    const llamada = llamadaConSesion(llamadas, RUTA_MIS_CITAS);
    expect(llamada.metodo).toBe('GET');
    expect(llamada.ruta).toBe('/api/citas?propios=true&orden=fechaHoraInicio&limit=100');
    expect(llamada.cuerpo).toBeUndefined();
  });

  it('normaliza cada cita con su servicio, especialista, montos ("$360") y pagos', async () => {
    const lista = [CITA_CON_ANTICIPO, citaAnticipoPagado({ id: 502 }), { ...CITA_SIN_ANTICIPO, id: 503 }];
    simularServidorMisCitas({ [RUTA_MIS_CITAS]: () => respuesta(cuerpoMisCitas(lista)) });
    await expect(listarMisCitas()).resolves.toEqual([
      CITA_CON_ANTICIPO_NORMALIZADA,
      citaNormalizada({ id: 502, estado: 'confirmada', anticipoPagadoEn: PAGADO_EN_ISO, pagos: [PAGO_APROBADO] }),
      { ...CITA_SIN_ANTICIPO_NORMALIZADA, id: 503 },
    ]);
  });

  it('las citas de ejemplo llegan todas, en el orden del servidor', async () => {
    simularServidorMisCitas({});
    expect((await listarMisCitas()).map((c) => [c.id, c.estado])).toEqual([
      [ID_CITA, 'pendiente'],
      [502, 'confirmada'],
      [503, 'completada'],
      [504, 'cancelada'],
    ]);
  });

  it('descarta lo que no es objeto y las citas sin id o sin un inicio que se pueda leer', async () => {
    const lista = [
      null,
      'cita',
      { ...CITA_CON_ANTICIPO, id: undefined },
      { ...CITA_CON_ANTICIPO, id: { numero: 1 } },
      { ...CITA_CON_ANTICIPO, id: 601, fechaHoraInicio: '' },
      { ...CITA_CON_ANTICIPO, id: 602, fechaHoraInicio: null },
      { ...CITA_CON_ANTICIPO, id: 603, fechaHoraInicio: 'mañana a las once' },
      { ...CITA_CON_ANTICIPO, id: 604 },
    ];
    simularServidorMisCitas({ [RUTA_MIS_CITAS]: () => respuesta(cuerpoMisCitas(lista)) });
    expect((await listarMisCitas()).map((c) => c.id)).toEqual([604]);
  });

  it.each<[string, unknown]>([
    ['una lista vacía', cuerpoMisCitas([])],
    ['una respuesta sin data', { success: true, count: 0 }],
    ['data null', { success: true, data: null }],
    ['un cuerpo null', null],
  ])('%s da Mis citas vacía', async (_caso, cuerpo) => {
    simularServidorMisCitas({ [RUTA_MIS_CITAS]: () => respuesta(cuerpo) });
    await expect(listarMisCitas()).resolves.toEqual([]);
  });
});

// ── Detalle ──────────────────────────────────────────────────────────────────────────────────

describe('obtenerCita: detalle de Mis citas', () => {
  it('con el id de la ruta (texto) trae la cita cancelada con su motivo y el anticipo retenido', async () => {
    const cruda = citaCancelada({
      anticipoPagadoEn: PAGADO_EN_ISO,
      pagos: [pagoCrudo({ estado: 'aprobado', pagadoEn: PAGADO_EN_ISO, retenidoEn: RETENIDO_EN_ISO })],
    });
    const llamadas = simularServidorMisCitas({ [rutaCita()]: () => respuesta(cuerpoCita(cruda)) });
    const cita = await obtenerCita(String(ID_CITA));
    expect(llamadas[0].ruta).toBe(`/api/citas/${ID_CITA}?propios=true`);
    expect(cita).toEqual(
      citaNormalizada({
        estado: 'cancelada',
        motivoCancelacion: MOTIVO_CANCELACION,
        anticipoPagadoEn: PAGADO_EN_ISO,
        pagos: [{ ...PAGO_APROBADO, retenidoEn: RETENIDO_EN_ISO }],
      }),
    );
    expect(estadoAnticipo(cita, AHORA)).toBe('retenido');
  });

  it('una cita ajena o que no existe responde 404 y la clienta lee "No encontramos esta cita."', async () => {
    const error = await errorAl(rutaCita(), conError(ERRORES_MIS_CITAS.citaNoEncontrada), () => obtenerCita(ID_CITA));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404 });
    expect(mensajeReprogramacion(error)).toBe(TEXTOS_MIS_CITAS.citaNoEncontrada);
    expect(mensajeCancelacion(error)).toBe(TEXTOS_MIS_CITAS.citaNoEncontrada);
  });
});

// ── Próximas e historial ─────────────────────────────────────────────────────────────────────

describe('separarMisCitas: próximas e historial con el día local del teléfono', () => {
  /** Cita con ese estado que empieza a esa hora local del teléfono. */
  const citaLocal = (id: number, estado: string, fecha: string, hora: string) =>
    citaNormalizadaEn(id, enHoraLocal(fecha, hora), { estado });

  it('próximas de la más cercana a la más lejana; historial de la más reciente a la más antigua', () => {
    const lista = [
      citaLocal(1, 'reprogramada', '2026-10-28', '12:00'),
      citaLocal(2, 'completada', '2026-10-10', '12:00'),
      citaLocal(3, 'pendiente', DIA_CITA, '11:00'),
      citaLocal(4, 'cancelada', DIA_SABADO, '12:00'),
      citaLocal(5, 'confirmada', HOY, '09:00'),
      citaLocal(6, 'pendiente', AYER, '18:00'),
      citaLocal(7, 'en_curso', HOY, '09:30'),
      citaLocal(8, 'no_asistio', '2026-10-30', '10:00'),
    ];
    const original = [...lista];
    // Sin `ahora` usa el reloj (AHORA cae en HOY tanto en UTC como en México).
    expect(idsSeparados(lista)).toEqual({ proximas: [5, 7, 3, 1], historial: [8, 4, 6, 2] });
    expect(lista).toEqual(original);
  });

  it.each<[string, string, string, string, 'proximas' | 'historial']>([
    ['vigente de hoy temprano (su hora ya pasó)', 'pendiente', HOY, '08:00', 'proximas'],
    ['vigente de hoy a las 00:00', 'confirmada', HOY, '00:00', 'proximas'],
    ['en curso ahorita', 'en_curso', HOY, '09:30', 'proximas'],
    ['reprogramada para mañana', 'reprogramada', DIA_CITA, '11:00', 'proximas'],
    ['vigente de ayer', 'confirmada', AYER, '18:00', 'historial'],
    ['vigente de ayer a las 23:30 del teléfono', 'pendiente', AYER, '23:30', 'historial'],
    ['cancelada futura', 'cancelada', DIA_SABADO, '12:00', 'historial'],
    ['completada futura', 'completada', DIA_SABADO, '12:00', 'historial'],
    ['no asistió, futura', 'no_asistio', DIA_SABADO, '12:00', 'historial'],
    ['con un estado desconocido', 'en_espera', DIA_SABADO, '12:00', 'historial'],
  ])('una cita %s va a %s', (_caso, estado, fecha, hora, cubeta) => {
    const separadas = idsSeparados([citaLocal(1, estado, fecha, hora)], AHORA_LOCAL);
    expect(separadas[cubeta]).toEqual([1]);
  });

  it('una cita con un inicio que no se puede leer va al historial', () => {
    const cita = citaNormalizada({ id: 9, fechaHoraInicio: 'pronto' });
    expect(separarMisCitas([cita], AHORA_LOCAL)).toEqual({ proximas: [], historial: [cita] });
  });

  it('borde del día: a las 23:30 de México de ayer en UTC ya es hoy; en America/Mexico_City va al historial', () => {
    const inicio = isoMexico(AYER, '23:30');
    const cita = citaNormalizadaEn(9, inicio, { estado: 'confirmada' });
    // En UTC el instante ya es hoy; en México (o más al oeste) todavía es ayer en el teléfono.
    expect(inicio.slice(0, 10)).toBe(HOY);
    const caeAyer = new Date(inicio).getTimezoneOffset() >= DESFASE_MEXICO_HORAS * 60;
    expect(fechaLocal(new Date(inicio))).toBe(caeAyer ? AYER : HOY);
    expect(fechaLocal(AHORA)).toBe(HOY);
    expect(separarMisCitas([cita], AHORA)).toEqual(
      caeAyer ? { proximas: [], historial: [cita] } : { proximas: [cita], historial: [] },
    );
  });
});

// ── Insignias, reglas y montos ───────────────────────────────────────────────────────────────

describe('etiquetaEstadoCita', () => {
  it.each<[string, EtiquetaEstado]>([
    ['pendiente', { texto: 'Pendiente', tono: 'aviso' }],
    ['confirmada', { texto: 'Confirmada', tono: 'exito' }],
    ['en_curso', { texto: 'En curso', tono: 'exito' }],
    ['completada', { texto: 'Completada', tono: 'neutro' }],
    ['cancelada', { texto: 'Cancelada', tono: 'neutro' }],
    ['reprogramada', { texto: 'Reprogramada', tono: 'neutro' }],
    ['no_asistio', { texto: 'No asististe', tono: 'neutro' }],
    ['en_espera', { texto: 'Sin estado', tono: 'neutro' }],
    ['', { texto: 'Sin estado', tono: 'neutro' }],
    ['constructor', { texto: 'Sin estado', tono: 'neutro' }],
  ])('"%s" se muestra como %p', (estado, esperada) => {
    expect(etiquetaEstadoCita(estado)).toEqual(esperada);
  });
});

describe('esVigente y admiteCambios por estado', () => {
  it('ESTADOS_CITA del helper son los que conoce la insignia', () => {
    expect(ESTADOS_CITA.every((estado) => etiquetaEstadoCita(estado).texto !== 'Sin estado')).toBe(true);
  });

  it.each<[string, boolean, boolean]>([
    ['pendiente', true, true],
    ['confirmada', true, true],
    ['reprogramada', true, true],
    ['en_curso', true, false],
    ['completada', false, false],
    ['cancelada', false, false],
    ['no_asistio', false, false],
    ['', false, false],
  ])('"%s": vigente %p, admite reprogramar o cancelar %p', (estado, vigente, cambios) => {
    const cita = citaNormalizada({ estado });
    expect(esVigente(cita)).toBe(vigente);
    expect(admiteCambios(cita)).toBe(cambios);
  });
});

describe('estadoAnticipo y etiquetaEstadoAnticipo', () => {
  it.each<[string, Partial<Cita>, EstadoAnticipoCita]>([
    ['sin anticipo', { anticipoRequerido: 0, anticipoMonto: null, anticipoVenceEn: null }, 'no_requiere'],
    ['pagado con su pago aprobado', { estado: 'confirmada', anticipoPagadoEn: PAGADO_EN_ISO, pagos: [PAGO_APROBADO] }, 'pagado'],
    ['marcado como pagado sin el pago aprobado (como la web)', { estado: 'confirmada', anticipoPagadoEn: PAGADO_EN_ISO }, 'pagado'],
    [
      'retenido por el salón (retenidoEn)',
      { estado: 'cancelada', anticipoPagadoEn: PAGADO_EN_ISO, pagos: [{ ...PAGO_APROBADO, retenidoEn: RETENIDO_EN_ISO }] },
      'retenido',
    ],
    ['retenido porque no asistió', { estado: 'no_asistio', anticipoPagadoEn: PAGADO_EN_ISO, pagos: [PAGO_APROBADO] }, 'retenido'],
    ['retenido porque no asistió, sin el pago aprobado', { estado: 'no_asistio', anticipoPagadoEn: PAGADO_EN_ISO }, 'retenido'],
    ['transferencia en revisión', { pagos: [pagoNormalizado({ estado: 'en_revision', metodo: 'transferencia' })] }, 'en_revision'],
    ['reembolsado', { estado: 'cancelada', pagos: [pagoNormalizado({ estado: 'reembolsado' })] }, 'reembolsado'],
    ['liberado: cancelada sin pagar', { estado: 'cancelada', motivoCancelacion: MOTIVO_CANCELACION }, 'liberada'],
    ['pendiente con el plazo por delante', {}, 'pendiente'],
    ['pendiente aunque el pago se rechazó', { pagos: [pagoNormalizado({ estado: 'rechazado' })] }, 'pendiente'],
    ['pendiente sin plazo', { anticipoVenceEn: null }, 'pendiente'],
    ['vencido: el plazo ya pasó', { anticipoVenceEn: masMinutos(AHORA, -1).toISOString() }, 'vencido'],
    ['vencido justo al llegar el plazo', { anticipoVenceEn: AHORA_ISO }, 'vencido'],
  ])('%s da %p', (_caso, cambios, esperado) => {
    expect(estadoAnticipo(citaNormalizada(cambios), AHORA)).toBe(esperado);
  });

  it('sin ahora usa el reloj: pendiente antes del plazo y vencido después', () => {
    const cita = citaNormalizada();
    expect(estadoAnticipo(cita)).toBe('pendiente');
    jest.setSystemTime(masMinutos(VENCE_ANTICIPO_ISO, 1));
    expect(estadoAnticipo(cita)).toBe('vencido');
  });

  it.each<[EstadoAnticipoCita, EtiquetaEstado]>([
    ['no_requiere', { texto: 'Sin anticipo', tono: 'neutro' }],
    ['retenido', { texto: 'Anticipo retenido', tono: 'neutro' }],
    ['pagado', { texto: 'Anticipo pagado', tono: 'exito' }],
    ['en_revision', { texto: 'Anticipo en revisión', tono: 'aviso' }],
    ['reembolsado', { texto: 'Anticipo reembolsado', tono: 'neutro' }],
    ['liberada', { texto: 'Anticipo liberado', tono: 'neutro' }],
    ['pendiente', { texto: 'Anticipo pendiente', tono: 'aviso' }],
    ['vencido', { texto: 'Anticipo vencido', tono: 'aviso' }],
  ])('la insignia de "%s" es %p', (estado, esperada) => {
    expect(etiquetaEstadoAnticipo(estado)).toEqual(esperada);
  });
});

describe('montoPagadoAnticipo (aviso de cancelación)', () => {
  it.each<[string, Partial<Cita>, number]>([
    [
      'suma los aprobados con centavos sin arrastrar decimales y omite los rechazados',
      {
        anticipoPagadoEn: PAGADO_EN_ISO,
        pagos: [
          pagoNormalizado({ estado: 'aprobado', monto: 100.1 }),
          pagoNormalizado({ estado: 'aprobado', monto: 100.2 }),
          pagoNormalizado({ estado: 'rechazado' }),
        ],
      },
      200.3,
    ],
    ['marcada como pagada sin pagos aprobados: el anticipo completo', { anticipoPagadoEn: PAGADO_EN_ISO, pagos: [pagoNormalizado({ estado: 'rechazado' })] }, 360],
    ['sin pagar nada', { pagos: [pagoNormalizado()] }, 0],
  ])('%s', (_caso, cambios, esperado) => {
    expect(montoPagadoAnticipo(citaNormalizada(cambios))).toBe(esperado);
  });
});

// ── Reprogramar y cancelar ───────────────────────────────────────────────────────────────────

describe('reprogramarCita (PATCH /api/citas/:id/reprogramar?propios=true)', () => {
  it('manda solo el inicio y el fin del slot y devuelve la cita reprogramada normalizada', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidorMisCitas({});
    const cita = await reprogramar();
    expect(llamadas).toHaveLength(1);
    const llamada = llamadaConSesion(llamadas, rutaReprogramar());
    expect(llamada.cuerpo).toStrictEqual({ fechaHoraInicio: SLOT_NUEVO.inicio, fechaHoraFin: SLOT_NUEVO.fin });
    expect(cita).toEqual(
      citaNormalizada({ estado: 'reprogramada', fechaHoraInicio: SLOT_NUEVO.inicio, fechaHoraFin: SLOT_NUEVO.fin }),
    );
  });

  it.each<[string, unknown]>([
    ['sin data', { success: true }],
    ['con data null', { success: true, data: null }],
    ['vacía', null],
  ])('si la respuesta llega %s, relee la cita con GET para no dar por fallido el cambio', async (_caso, cuerpo) => {
    const llamadas = simularServidorMisCitas({
      [rutaReprogramar()]: () => respuesta(cuerpo),
      [rutaCita()]: () => respuesta(cuerpoCita(citaReprogramada(SLOT_NUEVO))),
    });
    await expect(reprogramar()).resolves.toMatchObject({ estado: 'reprogramada', fechaHoraInicio: SLOT_NUEVO.inicio });
    expect(llamadas.map((l) => `${l.metodo} ${l.ruta}`)).toEqual([rutaReprogramar(), rutaCita()]);
  });
});

describe('cancelarCita (PATCH /api/citas/:id/cancelar?propios=true)', () => {
  it('manda el motivo recortado y no devuelve la cita (la pantalla la recarga)', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidorMisCitas({});
    await expect(cancelarCita(ID_CITA, `  ${MOTIVO_CANCELACION}  `)).resolves.toBeUndefined();
    expect(llamadas).toHaveLength(1);
    expect(llamadaConSesion(llamadas, rutaCancelar()).cuerpo).toStrictEqual({ motivoCancelacion: MOTIVO_CANCELACION });
  });

  it('un motivo de puros espacios sale vacío y el 400 de validación pide escribirlo', async () => {
    const llamadas = simularServidorMisCitas({ [rutaCancelar()]: conError(ERRORES_MIS_CITAS.motivoVacio) });
    const error = await errorDe(cancelarCita(ID_CITA, '   '));
    expect(llamadas[0].cuerpo).toStrictEqual({ motivoCancelacion: '' });
    expect(mensajeCancelacion(error)).toBe(TEXTOS_MIS_CITAS.motivoVacio);
  });
});

describe.each<[string, (id: string) => string, (id: string) => Promise<unknown>]>([
  ['reprogramar', rutaReprogramar, (id) => reprogramarCita(id, SLOT_NUEVO)],
  ['cancelar', rutaCancelar, (id) => cancelarCita(id, MOTIVO_CANCELACION)],
])('%s: el id va codificado en la ruta', (accion, ruta, llamar) => {
  it('con encodeURIComponent', async () => {
    const id = 'a b/c?d';
    const llamadas = simularServidorMisCitas({ [ruta(id)]: () => respuesta(cuerpoCita()) });
    await llamar(id);
    expect(llamadas[0].ruta).toBe(`/api/citas/a%20b%2Fc%3Fd/${accion}?propios=true`);
  });
});

// ── Mensajes de error para la clienta ────────────────────────────────────────────────────────

describe('mensajeReprogramacion con errores reales de apiClient', () => {
  it.each<[string, Manejador, string]>([
    ['sin red', sinRedEnRuta, TEXTOS_MIS_CITAS.sinConexion],
    ['400 de horario ocupado (no es 409)', conError(ERRORES.horarioOcupado), TEXTOS_MIS_CITAS.horarioOcupado],
    ['400 de una cita completada', conError(ERRORES_MIS_CITAS.reprogramarCompletada), TEXTOS_MIS_CITAS.reprogramarNoSePuede],
    ['400 sin tiempo para el anticipo (texto ya escrito para la clienta)', conError(ERRORES.sinTiempoAnticipo), MENSAJES_BACKEND.sinTiempoAnticipo],
    ['400 técnico desconocido', conError(cuerpoError(400, TEXTO_TECNICO)), TEXTOS_MIS_CITAS.reprogramarGenerico],
    ['401 de sesión terminada', conError(ERRORES.noAutorizado), TEXTOS_MIS_CITAS.sesionTerminada],
    ['404 de cita ajena', conError(ERRORES_MIS_CITAS.citaNoEncontrada), TEXTOS_MIS_CITAS.citaNoEncontrada],
    ['409 de cita ya cobrada', conError(ERRORES_MIS_CITAS.citaCobrada), TEXTOS_MIS_CITAS.citaCobrada],
    ['409 de otro conflicto', conError(cuerpoError(409, 'Conflicto ficticio')), TEXTOS_MIS_CITAS.reprogramarGenerico],
    ['422 de validación', conError(ERRORES.validacion), TEXTOS_MIS_CITAS.reprogramarGenerico],
    ['500', conError(ERRORES.interno), TEXTOS_MIS_CITAS.reprogramarGenerico],
  ])('%s', async (_caso, manejador, esperado) => {
    expect(mensajeReprogramacion(await errorAl(rutaReprogramar(), manejador, reprogramar))).toBe(esperado);
  });
});

describe('mensajeCancelacion con errores reales de apiClient', () => {
  it.each<[string, Manejador, string]>([
    ['sin red', sinRedEnRuta, TEXTOS_MIS_CITAS.sinConexion],
    ['400 de una cita ya cancelada', conError(ERRORES_MIS_CITAS.cancelarCancelada), TEXTOS_MIS_CITAS.cancelarNoSePuede],
    ['400 de motivo con caracteres no permitidos', conError(ERRORES_MIS_CITAS.motivoNoPermitido), TEXTOS_MIS_CITAS.motivoCaracteres],
    ['400 de motivo vacío (validación)', conError(ERRORES_MIS_CITAS.motivoVacio), TEXTOS_MIS_CITAS.motivoVacio],
    ['400 técnico desconocido', conError(cuerpoError(400, TEXTO_TECNICO)), TEXTOS_MIS_CITAS.cancelarGenerico],
    ['401 de sesión terminada', conError(ERRORES.noAutorizado), TEXTOS_MIS_CITAS.sesionTerminada],
    ['404 de cita ajena', conError(ERRORES_MIS_CITAS.citaNoEncontrada), TEXTOS_MIS_CITAS.citaNoEncontrada],
    ['409 de cita ya cobrada', conError(ERRORES_MIS_CITAS.citaCobrada), TEXTOS_MIS_CITAS.citaCobrada],
    ['500', conError(ERRORES.interno), TEXTOS_MIS_CITAS.cancelarGenerico],
  ])('%s', async (_caso, manejador, esperado) => {
    expect(mensajeCancelacion(await errorAl(rutaCancelar(), manejador, cancelar))).toBe(esperado);
  });
});

describe('mensajes de reprogramar y cancelar: nunca el texto técnico del servidor', () => {
  it.each<[string, CuerpoError]>([
    ['horario ocupado', ERRORES.horarioOcupado],
    ['cita completada', ERRORES_MIS_CITAS.reprogramarCompletada],
    ['cita ya cancelada', ERRORES_MIS_CITAS.cancelarCancelada],
    ['caracteres no permitidos', ERRORES_MIS_CITAS.motivoNoPermitido],
    ['motivo vacío', ERRORES_MIS_CITAS.motivoVacio],
    ['cita no encontrada', ERRORES_MIS_CITAS.citaNoEncontrada],
    ['cita cobrada', ERRORES_MIS_CITAS.citaCobrada],
    ['no autorizado', ERRORES.noAutorizado],
    ['interno', ERRORES.interno],
    ['técnico', cuerpoError(400, TEXTO_TECNICO)],
  ])('%s', async (_caso, cuerpo) => {
    const tecnicos = ([] as string[]).concat(cuerpo.message);
    const mensajes = [
      mensajeReprogramacion(await errorAl(rutaReprogramar(), conError(cuerpo), reprogramar)),
      mensajeCancelacion(await errorAl(rutaCancelar(), conError(cuerpo), cancelar)),
    ];
    for (const mensaje of mensajes) {
      expect(tecnicos.some((tecnico) => mensaje.includes(tecnico))).toBe(false);
      expect(mensaje).not.toMatch(/cita #|statusCode|Prisma|should not|Unauthorized|Internal/);
    }
  });

  it.each<[string, unknown, string, string]>([
    ['ApiError con status 0 (sin red)', new ApiError(0, TEXTO_TECNICO), TEXTOS_MIS_CITAS.sinConexion, TEXTOS_MIS_CITAS.sinConexion],
    ['ErrorDeRed', new ErrorDeRed(), TEXTOS_MIS_CITAS.sinConexion, TEXTOS_MIS_CITAS.sinConexion],
    ['un Error común con texto técnico', new Error(TEXTO_TECNICO), TEXTOS_MIS_CITAS.reprogramarGenerico, TEXTOS_MIS_CITAS.cancelarGenerico],
    ['null', null, TEXTOS_MIS_CITAS.reprogramarGenerico, TEXTOS_MIS_CITAS.cancelarGenerico],
  ])('%s da su mensaje fijo', (_caso, error, alReprogramar, alCancelar) => {
    expect(mensajeReprogramacion(error)).toBe(alReprogramar);
    expect(mensajeCancelacion(error)).toBe(alCancelar);
  });
});

// ── Plazo del anticipo en la tarjeta y en el salón ───────────────────────────────────────────

describe('limitePagoCorto y avisoAnticipoEnSalon', () => {
  const SIN_PLAZO = 'Paga tu anticipo en el salón a más tardar 15 minutos antes de tu cita. También puedes pagarlo en línea.';
  const aviso = (limite: string) =>
    `Paga tu anticipo en el salón ${limite} (15 minutos antes de tu cita). También puedes pagarlo en línea.`;

  it.each<[string, string | null, string | null, string]>([
    ['vence hoy a la 1:15', enHoraLocal(HOY, '13:15').toISOString(), 'Paga antes de la 1:15 p. m.', aviso('antes de la 1:15 p. m.')],
    ['vence hoy a las 11:15', enHoraLocal(HOY, '11:15').toISOString(), 'Paga antes de las 11:15 a. m.', aviso('antes de las 11:15 a. m.')],
    [
      'vence otro día',
      enHoraLocal(DIA_CITA, '10:45').toISOString(),
      'Paga antes del martes 20 de octubre, 10:45 a. m.',
      aviso('antes del martes 20 de octubre, 10:45 a. m.'),
    ],
    ['no hay plazo', null, null, SIN_PLAZO],
    ['el plazo no es fecha', 'pronto', null, SIN_PLAZO],
  ])('%s', (_caso, venceEn, corto, enSalon) => {
    expect(limitePagoCorto(venceEn, AHORA_LOCAL)).toBe(corto);
    expect(avisoAnticipoEnSalon(venceEn, AHORA_LOCAL)).toBe(enSalon);
  });

  it('el aviso sin ahora usa el reloj del teléfono', () => {
    jest.setSystemTime(AHORA_LOCAL);
    expect(avisoAnticipoEnSalon(enHoraLocal(HOY, '13:15').toISOString())).toBe(aviso('antes de la 1:15 p. m.'));
  });
});
