/// <reference types="jest" />

import {
  normalizarConfiguracion,
  RESPALDO_CONFIGURACION,
  type ConfiguracionPublica,
} from '@/shared/api/configuracionPublica';

import { CONFIGURACION_COMPLETA, DATOS_EXCLUIDOS, respuestaCompleta } from '../../helpers/configuracionFicticia';

/**
 * GP-07.1: normalización de la configuración pública (normalizarConfiguracion, pura). Campo por
 * campo, lo que falte o venga con otro tipo toma el valor del respaldo sin romper el resto, y lo que
 * la app no usa (responsable, correo de privacidad, transferencia, redes, contenido, variables) no
 * entra. Sin red ni disco: no hace falta simular nada.
 */

/** respuestaCompleta() con una parte de `reglas` reemplazada. */
function conReglas(cambios: Record<string, unknown>): Record<string, unknown> {
  const completa = respuestaCompleta();
  return { ...completa, reglas: { ...(completa.reglas as Record<string, unknown>), ...cambios } };
}

/** respuestaCompleta() con reglas.pagos.metodosSalon reemplazado. */
function conMetodos(metodosSalon: unknown): ConfiguracionPublica {
  const reglas = respuestaCompleta().reglas as { pagos: Record<string, unknown> };
  return normalizarConfiguracion(conReglas({ pagos: { ...reglas.pagos, metodosSalon } }));
}

/** respuestaCompleta() con horario.dias reemplazado. */
const conDias = (dias: unknown) => normalizarConfiguracion({ ...respuestaCompleta(), horario: { dias } });

const semana = (cambio: Record<string, unknown> = {}) =>
  ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].map((dia) => ({
    dia,
    cerrado: false,
    abre: '08:00',
    cierra: '16:00',
    ...cambio,
  }));

describe('normalizarConfiguracion: respuesta completa', () => {
  it('se queda solo con los campos que usa la app, con los textos recortados', () => {
    expect(normalizarConfiguracion(respuestaCompleta())).toEqual(CONFIGURACION_COMPLETA);
  });

  it('no deja pasar responsable, correo de privacidad, transferencia, redes, contenido ni variables', () => {
    const configuracion = normalizarConfiguracion(respuestaCompleta());

    expect(Object.keys(configuracion).sort()).toEqual(['anticiposActivos', 'horario', 'reglas', 'salon', 'textos']);
    expect(Object.keys(configuracion.reglas).sort()).toEqual(['citas', 'diasInhabiles', 'pagos', 'tienda']);
    expect(Object.keys(configuracion.reglas.pagos).sort()).toEqual(['mercadoPagoAnticipos', 'mercadoPagoTienda', 'metodosSalon']);
    expect(configuracion.salon).not.toHaveProperty('responsable');
    expect(configuracion.salon).not.toHaveProperty('correoPrivacidad');
    const texto = JSON.stringify(configuracion);
    for (const dato of DATOS_EXCLUIDOS) {
      expect(texto).not.toContain(dato);
    }
  });

  it('devuelve un objeto congelado que no se puede modificar', () => {
    const configuracion = normalizarConfiguracion(respuestaCompleta());

    expect(Object.isFrozen(configuracion)).toBe(true);
    expect(Object.isFrozen(configuracion.reglas.citas)).toBe(true);
    expect(Object.isFrozen(configuracion.horario.dias[0])).toBe(true);
    expect(Object.isFrozen(RESPALDO_CONFIGURACION.reglas.pagos.metodosSalon)).toBe(true);
  });
});

describe('normalizarConfiguracion: cuerpo que no es objeto', () => {
  it.each([
    ['null', null],
    ['texto', '<html>portal cautivo</html>'],
    ['arreglo', [respuestaCompleta()]],
    ['número', 42],
  ])('cuerpo %s: respaldo completo', (_caso, cuerpo) => {
    expect(normalizarConfiguracion(cuerpo)).toBe(RESPALDO_CONFIGURACION);
  });
});

describe('normalizarConfiguracion: respuesta parcial', () => {
  it('objeto vacío: todos los valores del respaldo', () => {
    expect(normalizarConfiguracion({})).toEqual(RESPALDO_CONFIGURACION);
  });

  it('secciones en null (salón u horario sin guardar en el backend): esas secciones del respaldo y lo demás del servidor', () => {
    const configuracion = normalizarConfiguracion({ ...respuestaCompleta(), salon: null, horario: null });

    expect(configuracion.salon).toEqual(RESPALDO_CONFIGURACION.salon);
    expect(configuracion.horario).toEqual(RESPALDO_CONFIGURACION.horario);
    expect(configuracion.reglas).toEqual(CONFIGURACION_COMPLETA.reglas);
    expect(configuracion.textos).toEqual(CONFIGURACION_COMPLETA.textos);
  });

  it('un campo que falta toma el respaldo sin tocar a sus vecinos', () => {
    const completa = respuestaCompleta();
    const { telefono: _telefono, ...salon } = completa.salon as Record<string, unknown>;
    const configuracion = normalizarConfiguracion({ ...completa, salon });

    expect(configuracion.salon).toEqual({ ...CONFIGURACION_COMPLETA.salon, telefono: RESPALDO_CONFIGURACION.salon.telefono });
  });
});

describe('normalizarConfiguracion: tipos equivocados', () => {
  it('números: solo enteros finitos >= 0; lo demás toma el respaldo', () => {
    const citas = {
      plazoAnticipoHoras: '3',
      minutosAntesPagoSalon: -5,
      minutosLlegadaAntes: 2.5,
      toleranciaLlegadaMinutos: Number.NaN,
      permitirAnticipoEnSalon: 'no',
      maxCitasPorPagarEnSalon: null,
      intervaloHorariosMinutos: 0,
      horasAvisoCancelarReagendar: Infinity,
    };
    const configuracion = normalizarConfiguracion(conReglas({ citas }));

    expect(configuracion.reglas.citas).toEqual({ ...RESPALDO_CONFIGURACION.reglas.citas, intervaloHorariosMinutos: 0 });
  });

  it('textos con otro tipo toman el respaldo; los que son texto se recortan', () => {
    const configuracion = normalizarConfiguracion({
      salon: { nombre: 123, telefono: '  +52 700 000 0009 ', ciudad: { valor: 'x' } },
      reglas: { tienda: { tiempoPreparacionTexto: false } },
    });

    expect(configuracion.salon).toEqual({ ...RESPALDO_CONFIGURACION.salon, telefono: '+52 700 000 0009' });
    expect(configuracion.reglas.tienda.tiempoPreparacionTexto).toBe(RESPALDO_CONFIGURACION.reglas.tienda.tiempoPreparacionTexto);
  });

  it('anticiposActivos y las banderas de pago que no son booleanas toman el respaldo', () => {
    const configuracion = normalizarConfiguracion({
      anticiposActivos: 'false',
      reglas: { pagos: { mercadoPagoTienda: 0, mercadoPagoAnticipos: false } },
    });

    expect(configuracion.anticiposActivos).toBe(true);
    expect(configuracion.reglas.pagos.mercadoPagoTienda).toBe(true);
    expect(configuracion.reglas.pagos.mercadoPagoAnticipos).toBe(false);
  });

  it('reglas que no es objeto: todas las reglas del respaldo', () => {
    expect(normalizarConfiguracion({ ...respuestaCompleta(), reglas: ['citas'] }).reglas).toEqual(RESPALDO_CONFIGURACION.reglas);
  });
});

describe('normalizarConfiguracion: horario', () => {
  it('acepta los siete días en cualquier orden y los entrega de lunes a domingo, con las horas recortadas', () => {
    const dias = semana().reverse();
    dias[0] = { ...dias[0], abre: ' 07:30 ' };

    const configuracion = conDias(dias);

    expect(configuracion.horario.dias.map((d) => d.dia)).toEqual(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']);
    expect(configuracion.horario.dias[6]).toEqual({ dia: 'domingo', cerrado: false, abre: '07:30', cierra: '16:00' });
  });

  it('un día cerrado guarda abre y cierra vacíos aunque el servidor mande horas', () => {
    const dias = semana();
    dias[2] = { ...dias[2], cerrado: true };

    expect(conDias(dias).horario.dias[2]).toEqual({ dia: 'miercoles', cerrado: true, abre: '', cierra: '' });
  });

  it.each([
    ['con seis días', semana().slice(1)],
    ['con un día repetido en lugar de otro', semana().map((d, i) => (i === 6 ? { ...d, dia: 'lunes' } : d))],
    ['con un nombre de día desconocido', semana().map((d, i) => (i === 3 ? { ...d, dia: 'feriado' } : d))],
    ['con una hora que no es HH:MM', semana().map((d, i) => (i === 1 ? { ...d, cierra: '7 pm' } : d))],
    ['con una hora fuera de rango', semana().map((d, i) => (i === 1 ? { ...d, abre: '24:00' } : d))],
    ['con un día que no es objeto', semana().map((d, i) => (i === 4 ? null : d))],
    ['sin lista de días', 'lunes a sábado'],
  ])('horario %s: el horario completo del respaldo', (_caso, dias) => {
    expect(conDias(dias).horario).toEqual(RESPALDO_CONFIGURACION.horario);
  });
});

describe('normalizarConfiguracion: días inhábiles, métodos de pago y textos', () => {
  it('días inhábiles: quita las entradas con fecha mala o motivo que no es texto y recorta el motivo', () => {
    const diasInhabiles = [
      { fecha: '2026-11-02', motivo: '  Día de muertos ' },
      { fecha: '2026-11-2', motivo: 'Fecha sin ceros' },
      { fecha: '02/11/2026', motivo: 'Otro formato' },
      { fecha: 20261225, motivo: 'Número' },
      { fecha: '2026-12-12', motivo: null },
      'texto suelto',
      null,
      { fecha: '2026-12-31', motivo: '' },
    ];

    expect(normalizarConfiguracion(conReglas({ diasInhabiles })).reglas.diasInhabiles).toEqual([
      { fecha: '2026-11-02', motivo: 'Día de muertos' },
      { fecha: '2026-12-31', motivo: '' },
    ]);
  });

  it('días inhábiles que no son lista: lista vacía', () => {
    expect(normalizarConfiguracion(conReglas({ diasInhabiles: { fecha: '2026-11-02' } })).reglas.diasInhabiles).toEqual([]);
  });

  it('métodos del salón: solo los tres conocidos, sin repetir y en orden fijo', () => {
    expect(conMetodos(['transferencia', 'bitcoin', 'efectivo', 'efectivo', 7, 'TARJETA']).reglas.pagos.metodosSalon).toEqual([
      'efectivo',
      'transferencia',
    ]);
  });

  it('métodos del salón en lista vacía: ninguno (el salón los apagó todos)', () => {
    expect(conMetodos([]).reglas.pagos.metodosSalon).toEqual([]);
  });

  it('métodos del salón que no son lista: los del respaldo', () => {
    expect(conMetodos('efectivo').reglas.pagos.metodosSalon).toEqual(['efectivo', 'tarjeta', 'transferencia']);
  });

  it('textos: solo los pares con valor de texto, recortado', () => {
    const textos = { uno: ' Hola ', dos: 2, tres: null, cuatro: ['x'], cinco: { a: 'b' }, seis: '' };

    expect(normalizarConfiguracion({ textos }).textos).toEqual({ uno: 'Hola', seis: '' });
  });

  it('textos que no son objeto: vacío', () => {
    expect(normalizarConfiguracion({ textos: ['Hola'] }).textos).toEqual({});
  });
});
