/// <reference types="jest" />

import { reiniciarConfiguracionPublica, RESPALDO_CONFIGURACION } from '@/shared/api/configuracionPublica';
import { obtenerTexto, obtenerTextoConReglas, RESPALDO_TEXTOS, variablesDeReglas } from '@/shared/api/textosSitio';

import { CONFIGURACION_COMPLETA } from '../../helpers/configuracionFicticia';
import { configuracionConTextos } from '../../helpers/textosFicticios';

/**
 * GP-07.4: textos de citas y forma de pago en el respaldo (copiados del catálogo del backend) y
 * obtenerTextoConReglas, para textos que dependen de las reglas guardadas en una cita: el servidor
 * manda los textos con las reglas vigentes ya llenas, así que si la cita tiene otras, se usa el
 * respaldo con las de la cita.
 */

/** Claves de GP-07.4 que usan las pantallas de la reserva, el detalle y Mis citas. */
const CLAVES_GP_07_4 = [
  'citas.crear.tituloConfirmar',
  'citas.crear.anticipoDescuentoSaldo',
  'citas.crear.anticipoDescuento',
  'citas.crear.botonConfirmar',
  'citas.crear.botonConfirmarLinea',
  'citas.crear.botonConfirmarSalon',
  ...[
    'anticipoEtiqueta', 'saldoEtiqueta', 'pregunta', 'opcionLinea', 'opcionSalon', 'plazoLinea', 'llegadaSalon',
    'plazoSalon', 'noAsistePierde', 'noAsisteRevisa', 'soloLineaDespuesFalta', 'avisoCancelar', 'metodosSalon',
    'sinAnticipoPrecio', 'sinAnticipo',
  ].map((clave) => `citas.formaPago.${clave}`),
  'citas.confirmacion.titulo',
  'citas.recordatorio',
  'citas.lista.vacia',
  'citas.lista.sinResultados',
  'citas.pagoSalon.saldo',
  'citas.pagoSalon.saldoSinPrecio',
  ...[
    'sinAnticipo', 'avisoReagendar', 'anticipoSinDatos', 'anticipoReembolsable', 'anticipoHasta',
    'anticipoPlazoTerminado', 'anticipoNoReembolsable', 'reprogramar', 'toast', 'toastReembolso',
  ].map((clave) => `citas.cancelar.${clave}`),
  ...[
    'sinAnticipo', 'botonPagar', 'botonMercadoPago', 'botonSalon', 'enlacePolitica', 'pendiente', 'plazoLinea',
    'salonSeLibera', 'pagado', 'enRevision', 'liberada', 'retenido', 'devuelto',
  ].map((clave) => `anticipos.${clave}`),
  'citas.politicaAnticipos.resumen',
  'citas.politicaAnticipos.casilla',
  'citas.politicaAnticipos.falta',
];

/** Plazo en línea como lo manda el servidor: con los minutos vigentes (30) ya llenos. */
const PLAZO_SERVIDOR = 'Plazo ficticio: paga en {plazoAnticipo}, hasta 30 minutos antes.';
const CON_PLAZO = configuracionConTextos({ 'citas.formaPago.plazoLinea': PLAZO_SERVIDOR });

beforeEach(() => {
  reiniciarConfiguracionPublica();
});

describe('respaldo de GP-07.4', () => {
  it('trae todas las claves de citas, forma de pago, cancelar y anticipos', () => {
    expect(CLAVES_GP_07_4.filter((clave) => !Object.prototype.hasOwnProperty.call(RESPALDO_TEXTOS, clave))).toEqual([]);
  });

  it('copia exacta de ejemplos del catálogo del backend, con sus variables', () => {
    expect(RESPALDO_TEXTOS['citas.formaPago.plazoLinea']).toBe(
      'Con Mercado Pago. Tienes {plazoAnticipo} para pagarlo, sin pasar de {minutosAntesPagoSalon} minutos antes de tu cita; si no, el horario se libera.',
    );
    expect(RESPALDO_TEXTOS['anticipos.plazoLinea']).toBe(
      'Tienes {plazoAnticipo} para pagarlo en línea{limite}; si no, el horario se libera.',
    );
  });

  it('el resumen de la política usa variables y no cifras escritas', () => {
    const resumen = RESPALDO_TEXTOS['citas.politicaAnticipos.resumen'];

    expect(resumen).toContain('{diasExcepcion}');
    expect(resumen).toContain('{diasReembolso}');
    expect(resumen).not.toMatch(/\d/);
  });
});

describe('variablesDeReglas', () => {
  it('incluye los meses con pago solo en línea y los días de la política, con los nombres del backend', () => {
    expect(variablesDeReglas(CONFIGURACION_COMPLETA)).toMatchObject({
      mesesSoloPagoEnLinea: '3',
      diasHabilesExcepcionAnticipo: '7',
      diasHabilesCancelarConReembolso: '8',
    });
    expect(variablesDeReglas(RESPALDO_CONFIGURACION)).toMatchObject({
      mesesSoloPagoEnLinea: '6',
      diasHabilesExcepcionAnticipo: '10',
      diasHabilesCancelarConReembolso: '5',
    });
  });
});

describe('obtenerTextoConReglas', () => {
  it('reglas de la cita iguales a las vigentes: usa el texto del servidor', () => {
    expect(
      obtenerTextoConReglas('citas.formaPago.plazoLinea', { minutosAntesPagoSalon: '30' }, { plazoAnticipo: '3 horas' }, CON_PLAZO),
    ).toBe('Plazo ficticio: paga en 3 horas, hasta 30 minutos antes.');
  });

  it('reglas de la cita distintas de las vigentes: usa el respaldo con las de la cita', () => {
    expect(
      obtenerTextoConReglas('citas.formaPago.plazoLinea', { minutosAntesPagoSalon: '15' }, { plazoAnticipo: '2 horas' }, CON_PLAZO),
    ).toBe('Con Mercado Pago. Tienes 2 horas para pagarlo, sin pasar de 15 minutos antes de tu cita; si no, el horario se libera.');
  });

  it('una regla distinta que la plantilla no usa no cambia de texto', () => {
    expect(
      obtenerTextoConReglas('citas.formaPago.plazoLinea', { diasHabilesExcepcionAnticipo: '1' }, { plazoAnticipo: '3 horas' }, CON_PLAZO),
    ).toBe('Plazo ficticio: paga en 3 horas, hasta 30 minutos antes.');
  });

  it('con el respaldo llena también las reglas vigentes que la cita no guarda y nunca deja llaves', () => {
    const config = configuracionConTextos({});

    expect(obtenerTextoConReglas('citas.formaPago.llegadaSalon', { minutosAntesPagoSalon: '5' }, {}, config)).toBe(
      'Llega entre 10 y 5 minutos antes para pagarlo.',
    );
    expect(obtenerTextoConReglas('citas.formaPago.plazoLinea', { minutosAntesPagoSalon: '5' }, {}, config)).not.toMatch(/[{}]/);
  });

  it('clave sin respaldo: el texto del servidor con las variables propias', () => {
    const config = configuracionConTextos({ 'citas.otroAviso': 'Aviso ficticio de {minutosAntesPagoSalon} minutos.' });

    expect(obtenerTextoConReglas('citas.otroAviso', { minutosAntesPagoSalon: '15' }, {}, config)).toBe('Aviso ficticio de 15 minutos.');
    expect(obtenerTextoConReglas('citas.claveQueNoExiste', {}, {}, config)).toBe('');
  });

  it('sin configuración explícita usa la que hay en memoria (al inicio, el respaldo)', () => {
    expect(obtenerTextoConReglas('citas.formaPago.plazoSalon', { minutosAntesPagoSalon: '20' })).toBe(
      'Si a 20 minutos de tu cita no se ha pagado, la cita se cancela.',
    );
    expect(obtenerTexto('citas.politicaAnticipos.casilla')).toBe('Leí la Política de anticipos y cancelación');
  });
});
