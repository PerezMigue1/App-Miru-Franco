/// <reference types="jest" />

import { obtenerCita } from '@/features/citas/models/citaModel';
import {
  avisoCancelar,
  consecuenciaNoAsistir,
  conUnidad,
  etiquetaCasillaPolitica,
  etiquetaOpcion,
  LIMITE_DIAS_HABILES_EXCEPCION,
  listaMetodosSalon,
  MARGEN_MINIMO_ANTICIPO_MS,
  MINIMO_DIAS_HABILES_REEMBOLSO,
  opcionesAnticipo,
  opcionInicial,
  plazoDeOpcion,
  puedeElegirPagoEnSalon,
  reglasDeCita,
  saldoEnSalon,
  textoBotonConfirmar,
  textoFaltaPolitica,
  textoMetodosSalon,
  textoPoliticaAnticipos,
  textosAdvertenciaAnticipo,
  textoSinAnticipo,
  variablesDeReglasCita,
  type ReglasCita,
} from '@/features/citas/models/formaPagoModel';
import {
  reiniciarConfiguracionPublica,
  RESPALDO_CONFIGURACION,
  type ConfiguracionPublica,
  type PagosPublicos,
  type ReglasCitasPublicas,
} from '@/shared/api/configuracionPublica';

import { CLIENTA_CITAS, citaCruda, cuerpoCita, enHoraLocal, ID_CITA, masMinutos } from '../../helpers/citasFicticias';
import { respuesta, servidorConRutas } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';

/**
 * GP-07.4: modelo de la forma de pago de una cita (src/features/citas/models/formaPagoModel.ts y
 * reglasCitaModel.ts). Funciones puras con configuraciones armadas en cada prueba: opciones del
 * anticipo, plazos, consecuencias, métodos, saldo, botón, la Política de anticipos con sus límites,
 * las reglas guardadas en la cita y cuándo se puede elegir pagar en el salón. Solo la lectura de la
 * cita (reglas guardadas) pasa por el servidor simulado.
 */

/** Respaldo con cambios en reglas de citas, pagos y textos del servidor. */
function configuracionCon({
  citas = {},
  pagos = {},
  textos = {},
}: {
  citas?: Partial<ReglasCitasPublicas>;
  pagos?: Partial<PagosPublicos>;
  textos?: Record<string, string>;
} = {}): ConfiguracionPublica {
  const { reglas } = RESPALDO_CONFIGURACION;
  return {
    ...RESPALDO_CONFIGURACION,
    reglas: { ...reglas, citas: { ...reglas.citas, ...citas }, pagos: { ...reglas.pagos, ...pagos } },
    textos,
  };
}

/** Reglas guardadas en una cita: por omisión las mismas del respaldo. */
const reglasCita = (cambios: Partial<ReglasCita> = {}): ReglasCita => ({ ...reglasDeCita(null), ...cambios });

const RESPALDO = configuracionCon();
const NO_ASISTE_PIERDE = 'Si no llegas a tu cita y no avisas, el anticipo no se devuelve.';
const NO_ASISTE_REVISA = 'Si no llegas a tu cita, el salón revisa la devolución de tu anticipo.';
const resumenPolitica = (excepcion: number, reembolso: number) =>
  `Si al pagar tu anticipo faltan más de ${excepcion} días hábiles para tu cita, puedes cancelarla dentro de los ${reembolso} días hábiles siguientes a tu pago y te devolvemos el anticipo completo. Si faltan ${excepcion} días hábiles o menos, al cancelar el anticipo no se devuelve, pero puedes reagendar con aviso; si el salón cancela, te lo devolvemos.`;

beforeEach(() => {
  reiniciarConfiguracionPublica();
});

describe('conUnidad', () => {
  it.each([
    [1, '1 hora'],
    [2, '2 horas'],
    [0, '0 horas'],
  ])('%i: "%s"', (n, esperado) => {
    expect(conUnidad(n, 'hora', 'horas')).toBe(esperado);
  });
});

describe('opciones del anticipo', () => {
  it.each<[string, boolean, boolean, string[]]>([
    ['las dos activas', true, true, ['linea', 'salon']],
    ['sin pago en el salón', true, false, ['linea']],
    ['sin Mercado Pago', false, true, ['salon']],
    ['las dos apagadas (en línea y decide el backend)', false, false, ['linea']],
  ])('%s', (_caso, mercadoPagoAnticipos, permitirAnticipoEnSalon, esperadas) => {
    const config = configuracionCon({ citas: { permitirAnticipoEnSalon }, pagos: { mercadoPagoAnticipos } });

    expect(opcionesAnticipo(config.reglas.citas, config.reglas.pagos)).toEqual(esperadas);
    expect(opcionInicial(config.reglas.citas, config.reglas.pagos)).toBe(esperadas[0]);
  });

  it('sin argumentos usa la configuración en memoria y las etiquetas salen del catálogo', () => {
    expect(opcionesAnticipo()).toEqual(['linea', 'salon']);
    expect(opcionInicial()).toBe('linea');
    expect(etiquetaOpcion('linea')).toBe('Pagar anticipo en línea');
    expect(etiquetaOpcion('salon', configuracionCon({ textos: { 'citas.formaPago.opcionSalon': 'En caja ficticia' } }))).toBe(
      'En caja ficticia',
    );
  });
});

describe('plazoDeOpcion', () => {
  it('en línea: las horas con su unidad y el tope de minutos', () => {
    expect(plazoDeOpcion('linea', undefined, RESPALDO)).toBe(
      'Con Mercado Pago. Tienes 2 horas para pagarlo, sin pasar de 15 minutos antes de tu cita; si no, el horario se libera.',
    );
    expect(plazoDeOpcion('linea', undefined, configuracionCon({ citas: { plazoAnticipoHoras: 1 } }))).toContain('Tienes 1 hora para');
  });

  it('en el salón con llegada antes del plazo: cuándo llegar y qué pasa si no se paga', () => {
    expect(plazoDeOpcion('salon', undefined, RESPALDO)).toBe(
      'Llega entre 20 y 15 minutos antes para pagarlo. Si a 15 minutos de tu cita no se ha pagado, la cita se cancela.',
    );
  });

  it.each([
    ['igual', 15],
    ['menor', 10],
  ])('en el salón con llegada %s al plazo: solo qué pasa si no se paga', (_caso, minutosLlegadaAntes) => {
    expect(plazoDeOpcion('salon', undefined, configuracionCon({ citas: { minutosLlegadaAntes } }))).toBe(
      'Si a 15 minutos de tu cita no se ha pagado, la cita se cancela.',
    );
  });

  it('reglas de la cita distintas de las vigentes: el respaldo con las de la cita', () => {
    const config = configuracionCon({
      citas: { minutosAntesPagoSalon: 30 },
      textos: { 'citas.formaPago.plazoLinea': 'Plazo ficticio del servidor: {plazoAnticipo} y 30 minutos.' },
    });

    expect(plazoDeOpcion('linea', reglasCita({ plazoAnticipoHoras: 4, minutosAntesPagoSalon: 25 }), config)).toBe(
      'Con Mercado Pago. Tienes 4 horas para pagarlo, sin pasar de 25 minutos antes de tu cita; si no, el horario se libera.',
    );
    expect(plazoDeOpcion('linea', reglasCita({ plazoAnticipoHoras: 4, minutosAntesPagoSalon: 30 }), config)).toBe(
      'Plazo ficticio del servidor: 4 horas y 30 minutos.',
    );
  });

  it('en el salón usa los minutos de la cita para decidir si pide llegar antes', () => {
    expect(plazoDeOpcion('salon', reglasCita({ minutosAntesPagoSalon: 20 }), RESPALDO)).toBe(
      'Si a 20 minutos de tu cita no se ha pagado, la cita se cancela.',
    );
  });
});

describe('consecuenciaNoAsistir', () => {
  it.each<[string, Partial<ReglasCitasPublicas>, Partial<PagosPublicos>, string]>([
    ['pierde y con meses en línea', {}, {}, `${NO_ASISTE_PIERDE} Durante 6 meses, tus próximas citas se apartan pagando el anticipo en línea.`],
    ['un mes', { mesesSoloPagoEnLinea: 1 }, {}, `${NO_ASISTE_PIERDE} Durante 1 mes, tus próximas citas se apartan pagando el anticipo en línea.`],
    ['el salón revisa', { pierdeAnticipoSiNoAsiste: false, mesesSoloPagoEnLinea: 0 }, {}, NO_ASISTE_REVISA],
    ['sin meses', { mesesSoloPagoEnLinea: 0 }, {}, NO_ASISTE_PIERDE],
    ['sin pago en línea', {}, { mercadoPagoAnticipos: false }, NO_ASISTE_PIERDE],
  ])('%s', (_caso, citas, pagos, esperado) => {
    expect(consecuenciaNoAsistir(undefined, configuracionCon({ citas, pagos }))).toBe(esperado);
  });

  it('la regla guardada en la cita gana a la vigente', () => {
    const config = configuracionCon({ citas: { mesesSoloPagoEnLinea: 0 } });

    expect(consecuenciaNoAsistir(reglasCita({ pierdeAnticipoSiNoAsiste: false }), config)).toBe(NO_ASISTE_REVISA);
  });
});

describe('avisoCancelar', () => {
  it('con 0 horas no hay aviso', () => {
    expect(avisoCancelar(undefined, RESPALDO)).toBeNull();
  });

  it.each([
    [24, '24 horas'],
    [1, '1 hora'],
  ])('con %i: avisa con "%s"', (horasAvisoCancelarReagendar, horas) => {
    expect(avisoCancelar(undefined, configuracionCon({ citas: { horasAvisoCancelarReagendar } }))).toBe(
      `Para reagendar desde tu cuenta avisa con al menos ${horas} de anticipación; con menos aviso, reagenda con el salón.`,
    );
  });

  it('las horas guardadas en la cita ganan a las vigentes', () => {
    expect(avisoCancelar(reglasCita({ horasAvisoCancelarReagendar: 0 }), configuracionCon({ citas: { horasAvisoCancelarReagendar: 24 } }))).toBeNull();
  });
});

describe('métodos del salón', () => {
  it.each<[PagosPublicos['metodosSalon'], string]>([
    [[], ''],
    [['efectivo'], 'efectivo'],
    [['efectivo', 'transferencia'], 'efectivo o transferencia'],
    [['efectivo', 'tarjeta', 'transferencia'], 'efectivo, tarjeta o transferencia'],
  ])('%j: "%s"', (metodos, esperado) => {
    expect(listaMetodosSalon(metodos)).toBe(esperado);
  });

  it('el texto lista los activos y sin métodos es null', () => {
    expect(textoMetodosSalon(RESPALDO)).toBe('En el salón puedes pagar con efectivo, tarjeta o transferencia.');
    expect(textoMetodosSalon(configuracionCon({ pagos: { metodosSalon: [] } }))).toBeNull();
  });
});

describe('sin anticipo y saldo', () => {
  it.each([
    ['número', 450, 'Pagas $450 en el salón el día de tu cita.'],
    ['texto con $ y comas', '$1,200.00', 'Pagas $1,200 en el salón el día de tu cita.'],
    ['sin precio', null, 'Pagas tu servicio en el salón el día de tu cita.'],
    ['texto que no es número', 'consultar', 'Pagas tu servicio en el salón el día de tu cita.'],
    ['cero', 0, 'Pagas tu servicio en el salón el día de tu cita.'],
  ])('textoSinAnticipo con %s', (_caso, precio, esperado) => {
    expect(textoSinAnticipo(precio, RESPALDO)).toBe(esperado);
  });

  it.each([
    ['"$1,200.00" menos 360', '$1,200.00', 360, 840],
    ['con centavos', '1200', '$360.50', 839.5],
    ['redondeo a centavos', 100.1, 0.2, 99.9],
    ['anticipo mayor que el precio (nunca negativo)', 100, 150, 0],
    ['anticipo que no se lee', 100, 'x', 100],
    ['sin precio', null, 10, null],
    ['precio en cero', '0', 0, null],
    ['precio que no es número', 'consultar', 10, null],
  ])('saldoEnSalon %s', (_caso, precio, anticipo, esperado) => {
    expect(saldoEnSalon(precio, anticipo)).toBe(esperado);
  });
});

describe('textoBotonConfirmar', () => {
  it.each<[number, 'linea' | 'salon', boolean, string]>([
    [0, 'linea', false, 'Confirmar cita'],
    [0, 'salon', true, 'Confirmando…'],
    [360, 'linea', false, 'Confirmar y pagar anticipo'],
    [360, 'linea', true, 'Abriendo Mercado Pago…'],
    [360, 'salon', false, 'Confirmar y pagar en el salón'],
    [360, 'salon', true, 'Apartando…'],
  ])('anticipo %i, %s, enviando %s: "%s"', (anticipo, opcion, enviando, esperado) => {
    expect(textoBotonConfirmar(anticipo, opcion, enviando, RESPALDO)).toBe(esperado);
  });
});

describe('Política de anticipos', () => {
  it('los límites son los del backend', () => {
    expect([LIMITE_DIAS_HABILES_EXCEPCION, MINIMO_DIAS_HABILES_REEMBOLSO]).toEqual([10, 5]);
  });

  it.each<[string, Partial<ReglasCita> | undefined, Partial<ReglasCitasPublicas>, [number, number]]>([
    ['vigentes del respaldo', undefined, {}, [10, 5]],
    ['vigentes de la configuración', undefined, { diasHabilesExcepcionAnticipo: 7, diasHabilesCancelarConReembolso: 8 }, [7, 8]],
    ['de la cita dentro de los límites', { diasHabilesExcepcionAnticipo: 4, diasHabilesCancelarConReembolso: 9 }, {}, [4, 9]],
    ['de la cita fuera de los límites legales', { diasHabilesExcepcionAnticipo: 15, diasHabilesCancelarConReembolso: 3 }, {}, [10, 5]],
  ])('resumen con días %s', (_caso, reglas, citas, [excepcion, reembolso]) => {
    expect(textoPoliticaAnticipos(reglas && reglasCita(reglas), configuracionCon({ citas }))).toBe(resumenPolitica(excepcion, reembolso));
  });

  it('la etiqueta de la casilla se parte alrededor del nombre de la política', () => {
    expect(etiquetaCasillaPolitica(RESPALDO)).toEqual({
      completa: 'Leí la Política de anticipos y cancelación',
      antes: 'Leí la ',
      enlace: 'Política de anticipos y cancelación',
      despues: '',
    });
    expect(textoFaltaPolitica(RESPALDO)).toBe('Para continuar marca que leíste la Política de anticipos y cancelación.');
  });

  it('si la etiqueta no trae el nombre, el enlace va al final', () => {
    const config = configuracionCon({ textos: { 'citas.politicaAnticipos.casilla': 'Acepto las condiciones ficticias.' } });

    expect(etiquetaCasillaPolitica(config)).toEqual({
      completa: 'Acepto las condiciones ficticias.',
      antes: 'Acepto las condiciones ficticias. ',
      enlace: 'Leer la Política de anticipos y cancelación',
      despues: '',
    });
  });
});

describe('puedeElegirPagoEnSalon', () => {
  const AHORA = enHoraLocal('2026-10-22', '09:00');
  /** Inicio que deja exactamente el margen después del plazo del salón (minutos antes). */
  const inicioJusto = (minutos: number, extraMs = 0) =>
    new Date(AHORA.getTime() + minutos * 60_000 + MARGEN_MINIMO_ANTICIPO_MS + extraMs).toISOString();

  it('con el margen mínimo justo se puede; un milisegundo menos, no', () => {
    expect(MARGEN_MINIMO_ANTICIPO_MS).toBe(5 * 60_000);
    expect(puedeElegirPagoEnSalon({ fechaHoraInicio: inicioJusto(15) }, AHORA)).toBe(true);
    expect(puedeElegirPagoEnSalon({ fechaHoraInicio: inicioJusto(15, -1) }, AHORA)).toBe(false);
  });

  it('usa los minutos guardados en la cita y, si se pasan, los indicados', () => {
    const cita = { fechaHoraInicio: inicioJusto(15), reglas: reglasCita({ minutosAntesPagoSalon: 60 }) };

    expect(puedeElegirPagoEnSalon(cita, AHORA)).toBe(false);
    expect(puedeElegirPagoEnSalon(cita, AHORA, 15)).toBe(true);
  });

  it.each([
    ['el anticipo ya es del salón', { fechaHoraInicio: masMinutos(AHORA, 600).toISOString(), anticipoEnSalon: true }],
    ['el inicio no se puede leer', { fechaHoraInicio: 'mañana' }],
  ])('no se puede si %s', (_caso, cita) => {
    expect(puedeElegirPagoEnSalon(cita, AHORA)).toBe(false);
  });
});

describe('textosAdvertenciaAnticipo', () => {
  const AHORA = enHoraLocal('2026-10-22', '09:00');
  const VENCE = enHoraLocal('2026-10-22', '11:15').toISOString();
  const consecuencia = `${NO_ASISTE_PIERDE} Durante 6 meses, tus próximas citas se apartan pagando el anticipo en línea.`;

  it('en el salón: el plazo sin "también en línea", que se libera, la política y la consecuencia', () => {
    expect(textosAdvertenciaAnticipo({ enSalon: true, venceEn: VENCE, ahora: AHORA, config: RESPALDO })).toEqual([
      'Paga tu anticipo en el salón antes de las 11:15 a. m. (15 minutos antes de tu cita). Si no lo pagas a tiempo, el horario se libera.',
      resumenPolitica(10, 5),
      consecuencia,
    ]);
  });

  it('en línea: el plazo con el límite en minúscula entre paréntesis y las horas de la cita', () => {
    const [plazo, politica] = textosAdvertenciaAnticipo({
      enSalon: false,
      venceEn: VENCE,
      ahora: AHORA,
      reglas: reglasCita({ plazoAnticipoHoras: 1, diasHabilesExcepcionAnticipo: 3 }),
      config: RESPALDO,
    });

    expect(plazo).toBe('Tienes 1 hora para pagarlo en línea (paga antes de las 11:15 a. m.); si no, el horario se libera.');
    expect(politica).toBe(resumenPolitica(3, 5));
  });

  it('en línea sin plazo: sin límite y con la configuración en memoria', () => {
    expect(textosAdvertenciaAnticipo({ enSalon: false, venceEn: null })[0]).toBe(
      'Tienes 2 horas para pagarlo en línea; si no, el horario se libera.',
    );
  });
});

describe('reglasDeCita', () => {
  const OMISION: ReglasCita = {
    plazoAnticipoHoras: 2,
    minutosAntesPagoSalon: 15,
    horasAvisoCancelarReagendar: 0,
    diasHabilesExcepcionAnticipo: 10,
    diasHabilesCancelarConReembolso: 5,
    pierdeAnticipoSiNoAsiste: true,
    diasInhabiles: [],
  };
  const GUARDADAS: ReglasCita = {
    plazoAnticipoHoras: 4,
    minutosAntesPagoSalon: 30,
    horasAvisoCancelarReagendar: 12,
    diasHabilesExcepcionAnticipo: 8,
    diasHabilesCancelarConReembolso: 6,
    pierdeAnticipoSiNoAsiste: false,
    diasInhabiles: ['2026-12-24', '2026-12-25'],
  };

  it.each([
    ['null', null],
    ['texto', 'reglas'],
    ['lista', [GUARDADAS]],
  ])('%s: las de omisión (las del respaldo, no las vigentes)', (_caso, crudo) => {
    expect(reglasDeCita(crudo)).toEqual(OMISION);
  });

  it('un objeto completo se copia tal cual, con su propia lista de días', () => {
    const reglas = reglasDeCita(GUARDADAS);

    expect(reglas).toEqual(GUARDADAS);
    expect(reglas.diasInhabiles).not.toBe(GUARDADAS.diasInhabiles);
  });

  it('cada campo inválido toma el de omisión sin tocar los demás', () => {
    expect(
      reglasDeCita({
        ...GUARDADAS,
        plazoAnticipoHoras: '4',
        minutosAntesPagoSalon: Number.NaN,
        horasAvisoCancelarReagendar: Number.POSITIVE_INFINITY,
        pierdeAnticipoSiNoAsiste: 'no',
        diasInhabiles: 'navidad',
      }),
    ).toEqual({ ...GUARDADAS, plazoAnticipoHoras: 2, minutosAntesPagoSalon: 15, horasAvisoCancelarReagendar: 0, pierdeAnticipoSiNoAsiste: true, diasInhabiles: [] });
  });

  it('diasInhabiles con fechas mezcladas con otros valores: la de omisión, como el backend', () => {
    expect(reglasDeCita({ diasInhabiles: ['2026-12-25', '25/12/2026', 7] }).diasInhabiles).toEqual([]);
  });

  it('la omisión sale del respaldo de la configuración, también sus días inhábiles', () => {
    jest.isolateModules(() => {
      jest.doMock('@/shared/api/configuracionPublica', () => {
        const real = jest.requireActual<typeof import('@/shared/api/configuracionPublica')>('@/shared/api/configuracionPublica');
        const { reglas } = real.RESPALDO_CONFIGURACION;
        return {
          ...real,
          RESPALDO_CONFIGURACION: { ...real.RESPALDO_CONFIGURACION, reglas: { ...reglas, diasInhabiles: [{ fecha: '2026-12-25', motivo: 'Navidad' }] } },
        };
      });
      const aislado = jest.requireActual<typeof import('@/features/citas/models/reglasCitaModel')>('@/features/citas/models/reglasCitaModel');

      expect(aislado.reglasDeCita(undefined).diasInhabiles).toEqual(['2026-12-25']);
    });
  });

  it('las variables usan los nombres del backend', () => {
    expect(variablesDeReglasCita(GUARDADAS)).toEqual({
      plazoAnticipoHoras: '4',
      minutosAntesPagoSalon: '30',
      horasAvisoCancelarReagendar: '12',
      diasHabilesExcepcionAnticipo: '8',
      diasHabilesCancelarConReembolso: '6',
    });
  });
});

describe('sin configuración explícita', () => {
  it('cada texto usa la configuración en memoria (al inicio, el respaldo)', () => {
    const lejos = { fechaHoraInicio: new Date(Date.now() + 24 * 60 * 60_000).toISOString() };

    expect([
      plazoDeOpcion('linea'),
      consecuenciaNoAsistir(),
      avisoCancelar(),
      textoMetodosSalon(),
      textoSinAnticipo(450),
      textoBotonConfirmar(0, 'linea', false),
      textoPoliticaAnticipos(),
      etiquetaCasillaPolitica(),
      textoFaltaPolitica(),
    ]).toEqual([
      plazoDeOpcion('linea', undefined, RESPALDO),
      consecuenciaNoAsistir(undefined, RESPALDO),
      avisoCancelar(undefined, RESPALDO),
      textoMetodosSalon(RESPALDO),
      textoSinAnticipo(450, RESPALDO),
      textoBotonConfirmar(0, 'linea', false, RESPALDO),
      textoPoliticaAnticipos(undefined, RESPALDO),
      etiquetaCasillaPolitica(RESPALDO),
      textoFaltaPolitica(RESPALDO),
    ]);
    expect(puedeElegirPagoEnSalon(lejos)).toBe(true);
  });
});

describe('reglas guardadas en la cita (citaModel)', () => {
  const simularServidor = servidorConRutas({});
  const RUTA = `GET /api/citas/${ID_CITA}?propios=true`;

  beforeEach(async () => {
    await sembrarSesion(CLIENTA_CITAS);
  });

  it('con reglas: las normaliza y marca reglasGuardadas', async () => {
    simularServidor({ [RUTA]: () => respuesta(cuerpoCita({ ...citaCruda(), reglas: { plazoAnticipoHoras: 6, diasInhabiles: ['2026-12-25'] } })) });

    const cita = await obtenerCita(ID_CITA);

    expect(cita.reglasGuardadas).toBe(true);
    expect(cita.reglas).toEqual(reglasCita({ plazoAnticipoHoras: 6, diasInhabiles: ['2026-12-25'] }));
  });

  it('sin reglas: las de omisión y reglasGuardadas en false', async () => {
    simularServidor({ [RUTA]: () => respuesta(cuerpoCita(citaCruda())) });

    const cita = await obtenerCita(ID_CITA);

    expect(cita.reglasGuardadas).toBe(false);
    expect(cita.reglas).toEqual(reglasDeCita(null));
  });
});
