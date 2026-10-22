/// <reference types="jest" />

import {
  bloqueoDelDia,
  bloqueosDelMes,
  DIAS_BUSQUEDA_LIBRE,
  fechaLocal,
  mesDeFecha,
  primerDiaLibre,
  type DiaBloqueado,
} from '@/features/citas/models/citaModel';
import { armarBloqueos, motivoDeBloqueo } from '@/features/citas/viewmodels/useCalendarioCitas';
import {
  normalizarConfiguracion,
  RESPALDO_CONFIGURACION,
  type ConfiguracionPublica,
} from '@/shared/api/configuracionPublica';
import { obtenerTexto, type ClaveTextoSitio, type ContextoTexto } from '@/shared/api/textosSitio';

import { DIA_CITA, DIA_DOMINGO, DIA_SABADO, HOY } from '../../helpers/citasFicticias';
import {
  configuracionCalendario,
  DIAS_SEMANA,
  LEYENDA_CALENDARIO,
  TEXTO_CERRADO,
  TEXTO_INHABIL_SIN_MOTIVO,
  textoInhabil,
  type OpcionesCalendario,
} from '../../helpers/calendarioFicticio';

/**
 * GP-07.3: días sin citas en el calendario de la reserva y de reprogramar, con funciones puras
 * (citaModel y los textos de useCalendarioCitas): cerrados por el horario de su día de la semana,
 * inhábiles con y sin motivo (el inhábil gana aunque caiga en un día cerrado), cambio de mes y de
 * año, el siguiente día libre y la configuración del respaldo (domingo cerrado, sin inhábiles).
 * Las fechas se arman con año, mes y día locales, así que no dependen de la zona con la que corre
 * Jest. Octubre de 2026: el lunes 19 es HOY y el domingo 25 es DIA_DOMINGO.
 */

/** La configuración que se queda la app con ese horario y esos días inhábiles. */
const conCalendario = (opciones: OpcionesCalendario): ConfiguracionPublica =>
  normalizarConfiguracion(configuracionCalendario(opciones));

/** Los textos del respaldo, sin depender de la memoria del repositorio. */
const texto = (clave: ClaveTextoSitio, contexto?: ContextoTexto) => obtenerTexto(clave, contexto, RESPALDO_CONFIGURACION);

const NAVIDAD = { fecha: '2026-12-25', motivo: 'Navidad' };
const DESCANSO_SIN_MOTIVO = { fecha: '2026-10-21', motivo: '' };
const INHABIL_EN_DOMINGO = { fecha: DIA_DOMINGO, motivo: 'Inventario ficticio' };

const cerrado = (fecha: string): DiaBloqueado => ({ fecha, tipo: 'cerrado', motivo: '' });
const inhabil = (fecha: string, motivo: string): DiaBloqueado => ({ fecha, tipo: 'inhabil', motivo });

describe('bloqueoDelDia', () => {
  it.each<[string, string, OpcionesCalendario | null, DiaBloqueado | null]>([
    ['el domingo del respaldo está cerrado', DIA_DOMINGO, null, cerrado(DIA_DOMINGO)],
    ['el lunes del respaldo se puede elegir', HOY, null, null],
    ['el sábado del respaldo se puede elegir', DIA_SABADO, null, null],
    ['un martes cerrado por el horario', DIA_CITA, { cerrados: ['martes'] }, cerrado(DIA_CITA)],
    ['el domingo abierto si el horario lo abre', DIA_DOMINGO, { cerrados: [] }, null],
    ['un inhábil con motivo lleva su motivo', NAVIDAD.fecha, { inhabiles: [NAVIDAD] }, inhabil(NAVIDAD.fecha, 'Navidad')],
    ['un inhábil sin motivo', DESCANSO_SIN_MOTIVO.fecha, { inhabiles: [DESCANSO_SIN_MOTIVO] }, inhabil(DESCANSO_SIN_MOTIVO.fecha, '')],
    [
      'un inhábil que cae en domingo cerrado gana con su motivo',
      DIA_DOMINGO,
      { inhabiles: [INHABIL_EN_DOMINGO] },
      inhabil(DIA_DOMINGO, 'Inventario ficticio'),
    ],
    ['el motivo se recorta', NAVIDAD.fecha, { inhabiles: [{ ...NAVIDAD, motivo: '  Navidad  ' }] }, inhabil(NAVIDAD.fecha, 'Navidad')],
  ])('%s', (_caso, fecha, opciones, esperado) => {
    const configuracion = opciones ? conCalendario(opciones) : RESPALDO_CONFIGURACION;
    expect(bloqueoDelDia(fecha, configuracion)).toEqual(esperado);
  });

  it.each(DIAS_SEMANA.map((dia, i) => [dia, `2026-10-${String(19 + i)}`]))(
    'el día de la semana se calcula en hora local: %s (%s) cerrado',
    (dia, fecha) => {
      expect(bloqueoDelDia(fecha, conCalendario({ cerrados: [dia] }))).toEqual(cerrado(fecha));
    },
  );

  it.each(['2026-02-31', '2026-13-01', '2026-1-05', 'mañana', ''])('una fecha no válida (%p) no se bloquea', (fecha) => {
    expect(bloqueoDelDia(fecha, conCalendario({ cerrados: [...DIAS_SEMANA] }))).toBeNull();
  });

  it('un día del horario que falta no se bloquea', () => {
    const sinDomingo = { ...RESPALDO_CONFIGURACION, horario: { dias: RESPALDO_CONFIGURACION.horario.dias.slice(0, 6) } };
    expect(bloqueoDelDia(DIA_DOMINGO, sinDomingo)).toBeNull();
  });
});

describe('bloqueosDelMes', () => {
  it('con el respaldo, octubre de 2026 solo tiene sus cuatro domingos', () => {
    expect(bloqueosDelMes({ anio: 2026, mes: 9 }, RESPALDO_CONFIGURACION)).toEqual(
      ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'].map(cerrado),
    );
  });

  it('cada mes trae solo sus inhábiles, también al cambiar de año', () => {
    const configuracion = conCalendario({
      cerrados: [],
      inhabiles: [NAVIDAD, { fecha: '2027-01-01', motivo: 'Año nuevo' }, { fecha: '2026-11-30', motivo: 'Ficticio' }],
    });
    expect(bloqueosDelMes({ anio: 2026, mes: 11 }, configuracion)).toEqual([inhabil(NAVIDAD.fecha, 'Navidad')]);
    expect(bloqueosDelMes({ anio: 2027, mes: 0 }, configuracion)).toEqual([inhabil('2027-01-01', 'Año nuevo')]);
    expect(bloqueosDelMes({ anio: 2026, mes: 10 }, configuracion)).toEqual([inhabil('2026-11-30', 'Ficticio')]);
  });

  it('febrero de un año bisiesto llega al 29', () => {
    const configuracion = conCalendario({ cerrados: [], inhabiles: [{ fecha: '2028-02-29', motivo: 'Ficticio' }] });
    expect(bloqueosDelMes({ anio: 2028, mes: 1 }, configuracion)).toEqual([inhabil('2028-02-29', 'Ficticio')]);
  });

  it('sin días cerrados ni inhábiles no hay bloqueos', () => {
    expect(bloqueosDelMes({ anio: 2026, mes: 9 }, conCalendario({ cerrados: [] }))).toEqual([]);
  });
});

describe('primerDiaLibre y mesDeFecha', () => {
  it.each<[string, string, OpcionesCalendario | null, string | null]>([
    ['un día libre se queda', HOY, null, HOY],
    ['del domingo del respaldo pasa al lunes', DIA_DOMINGO, null, '2026-10-26'],
    [
      'del sábado inhábil y el domingo cerrado pasa al lunes del mes siguiente',
      '2026-10-31',
      { inhabiles: [{ fecha: '2026-10-31', motivo: 'Ficticio' }] },
      '2026-11-02',
    ],
    [
      'de fin de año con dos inhábiles pasa al año siguiente',
      '2026-12-31',
      { inhabiles: [{ fecha: '2026-12-31', motivo: 'Ficticio' }, { fecha: '2027-01-01', motivo: 'Año nuevo' }] },
      '2027-01-02',
    ],
    ['con todos los días cerrados no hay ninguno', HOY, { cerrados: [...DIAS_SEMANA] }, null],
    ['con una fecha no válida no hay ninguno', 'mañana', null, null],
  ])('%s', (_caso, desde, opciones, esperado) => {
    const configuracion = opciones ? conCalendario(opciones) : RESPALDO_CONFIGURACION;
    expect(primerDiaLibre(desde, configuracion)).toBe(esperado);
  });

  it(`busca hasta ${DIAS_BUSQUEDA_LIBRE} días`, () => {
    const inhabiles = Array.from({ length: DIAS_BUSQUEDA_LIBRE }, (_, i) => ({
      fecha: fechaLocal(new Date(2026, 9, 19 + i)),
      motivo: 'Ficticio',
    }));
    const configuracion = { ...RESPALDO_CONFIGURACION, reglas: { ...RESPALDO_CONFIGURACION.reglas, diasInhabiles: inhabiles } };
    expect(primerDiaLibre(HOY, configuracion)).toBeNull();
    const conUnoMenos = { ...configuracion, reglas: { ...configuracion.reglas, diasInhabiles: inhabiles.slice(0, -1) } };
    expect(primerDiaLibre(HOY, conUnoMenos)).toBe(inhabiles[DIAS_BUSQUEDA_LIBRE - 1].fecha);
  });

  it.each([
    ['2026-10-25', { anio: 2026, mes: 9 }],
    ['2027-01-01', { anio: 2027, mes: 0 }],
  ])('mesDeFecha(%s)', (fecha, mes) => {
    expect(mesDeFecha(fecha)).toEqual(mes);
  });
});

describe('textos de los días bloqueados (catálogo)', () => {
  it.each<[string, DiaBloqueado, string]>([
    ['cerrado', cerrado(DIA_DOMINGO), TEXTO_CERRADO],
    ['inhábil con motivo', inhabil(NAVIDAD.fecha, 'Navidad'), textoInhabil('Navidad')],
    ['inhábil con punto final no lo repite', inhabil(NAVIDAD.fecha, 'Navidad.'), textoInhabil('Navidad')],
    ['inhábil sin motivo', inhabil(NAVIDAD.fecha, ''), TEXTO_INHABIL_SIN_MOTIVO],
  ])('%s', (_caso, bloqueo, esperado) => {
    expect(motivoDeBloqueo(bloqueo, texto)).toBe(esperado);
  });

  it('armarBloqueos da el motivo por fecha, la leyenda y los inhábiles del mes con su motivo', () => {
    const lista = [cerrado(DIA_DOMINGO), inhabil('2026-10-27', 'Capacitación'), inhabil('2026-10-28', '')];
    expect(armarBloqueos(lista, texto, HOY)).toEqual({
      dias: {
        [DIA_DOMINGO]: TEXTO_CERRADO,
        '2026-10-27': textoInhabil('Capacitación'),
        '2026-10-28': TEXTO_INHABIL_SIN_MOTIVO,
      },
      leyenda: LEYENDA_CALENDARIO,
      inhabiles: [
        { fecha: '2026-10-27', motivo: 'Capacitación' },
        { fecha: '2026-10-28', motivo: TEXTO_INHABIL_SIN_MOTIVO },
      ],
    });
  });

  it('los días antes de hoy no entran y, sin bloqueos, no hay leyenda', () => {
    const lista = [cerrado('2026-10-18'), inhabil('2026-10-02', 'Pasado')];
    expect(armarBloqueos(lista, texto, HOY)).toEqual({ dias: {}, leyenda: '', inhabiles: [] });
  });

  it('hoy bloqueado sí entra', () => {
    expect(armarBloqueos([inhabil(HOY, 'Ficticio')], texto, HOY).dias).toEqual({ [HOY]: textoInhabil('Ficticio') });
  });
});
