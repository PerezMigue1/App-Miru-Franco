/// <reference types="jest" />

import { conUnidad, consecuenciaNoAsistir, textoMetodosSalon, textoPoliticaAnticipos } from '@/features/citas/models/formaPagoModel';
import {
  avisoAnticipoAlReprogramar,
  avisoCancelacion,
  avisoCitaCancelada,
  contactoSalon,
  dentroDelAviso,
  formaPagoDeCita,
  opcionesPagoDeCita,
  textoAnticipoPendiente,
} from '@/features/citas/models/gestionCitaModel';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  AHORA,
  citaAnticipoPagado,
  citaConAnticipo,
  citaCruda,
  citaEnSalon,
  HOY,
  isoMexico,
  masMinutos,
  pagoCrudo,
  RETENIDO_EN_ISO,
  type CitaCruda,
} from '../../helpers/citasFicticias';
import { configVigente, conReglas, horas, normalizada, REGLAS_CITA, REGLAS_OMISION } from '../../helpers/gestionCitas';
import { REGLAS_FICTICIAS } from '../../helpers/reservaFicticia';

/**
 * GP-07.4, detalle de la cita: la sección "Forma de pago" (formaPagoDeCita) y las formas de pagar el
 * anticipo pendiente (opcionesPagoDeCita) con la regla GUARDADA en la cita. La configuración
 * vigente ficticia tiene otras cifras (REGLAS_FICTICIAS) para notar cuál se usa. Reloj fijo en
 * AHORA (lunes 19 de octubre de 2026, 10:00 en México).
 */

const VIGENTE = configVigente();

const cita = normalizada;

beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('formaPagoDeCita: regla guardada contra regla vigente', () => {
  it('anticipo pendiente en línea: plazo en horas de la cita, consecuencia y aviso de reagendar de la cita', () => {
    const forma = formaPagoDeCita(cita(conReglas(citaConAnticipo())), AHORA, VIGENTE);
    const [plazo, politica, consecuencia] = forma.avisos;

    expect(plazo).toContain(horas(REGLAS_CITA.plazoAnticipoHoras));
    expect(plazo).not.toContain(horas(REGLAS_FICTICIAS.plazoAnticipoHoras));
    expect(politica).toBe(textoPoliticaAnticipos(REGLAS_CITA, VIGENTE));
    // La cita no retiene el anticipo si no llega (la vigente sí).
    expect(consecuencia).toBe(consecuenciaNoAsistir(REGLAS_CITA, VIGENTE));
    expect(consecuencia).toContain(RESPALDO_TEXTOS['citas.formaPago.noAsisteRevisa']);
    expect(forma.avisoReagendar).toContain(horas(REGLAS_CITA.horasAvisoCancelarReagendar));
    expect(forma).toMatchObject({
      anticipo: '$360',
      etiquetaAnticipo: RESPALDO_TEXTOS['citas.formaPago.anticipoEtiqueta'],
      modo: RESPALDO_TEXTOS['citas.detalle.enLinea'],
      explicacion: null,
      saldo: obtenerTexto('citas.pagoSalon.saldo', { saldo: '$840' }, VIGENTE),
      metodos: textoMetodosSalon(VIGENTE),
      conPolitica: true,
    });
    expect(forma.limite).toMatch(/^Paga antes de/);
  });

  it('anticipo pendiente en el salón: minutos de la cita aunque el servidor mande el texto con los vigentes', () => {
    const vigentes = REGLAS_FICTICIAS.minutosAntesPagoSalon;
    const conTextos = configVigente(undefined, {
      'citas.anticipoSalon.plazo': `Texto del servidor: paga {limite} (${vigentes} minutos antes).`,
    });
    const forma = formaPagoDeCita(cita(conReglas(citaEnSalon())), AHORA, conTextos);

    expect(forma.modo).toBe(RESPALDO_TEXTOS['citas.detalle.enSalon']);
    expect(forma.limite).toBeNull();
    expect(forma.avisos[0]).toContain(`(${REGLAS_CITA.minutosAntesPagoSalon} minutos antes de tu cita)`);
    expect(forma.avisos[0]).not.toContain(`${vigentes} minutos`);
  });

  it('cita sin reglas guardadas: usa las de omisión, no las vigentes', () => {
    const forma = formaPagoDeCita(cita(citaConAnticipo()), AHORA, VIGENTE);
    expect(forma.avisos[0]).toContain(conUnidad(REGLAS_OMISION.plazoAnticipoHoras, 'hora', 'horas'));
    expect(forma.avisos[2]).toBe(consecuenciaNoAsistir(REGLAS_OMISION, VIGENTE));
    // La regla de omisión no pide aviso para reagendar.
    expect(forma.avisoReagendar).toBeNull();
  });
});

describe('formaPagoDeCita: cada estado', () => {
  it('sin anticipo: lo que se paga en el salón con el precio y los métodos, sin política', () => {
    expect(formaPagoDeCita(cita(conReglas(citaCruda())), AHORA, VIGENTE)).toMatchObject({
      anticipo: null,
      modo: null,
      explicacion: null,
      saldo: obtenerTexto('citas.formaPago.sinAnticipoPrecio', { precio: '$350' }, VIGENTE),
      avisos: [],
      metodos: textoMetodosSalon(VIGENTE),
      conPolitica: false,
    });
  });

  it('sin métodos del salón activos: no los menciona', () => {
    const sinMetodos = configVigente({ metodosSalon: [] });
    expect(formaPagoDeCita(cita(citaCruda()), AHORA, sinMetodos).metodos).toBeNull();
  });

  it('sin precio del servicio: el saldo sin monto', () => {
    const sinPrecio = citaConAnticipo({ servicio: { ...citaConAnticipo().servicio, precio: '0.00' } });
    expect(formaPagoDeCita(cita(sinPrecio), AHORA, VIGENTE).saldo).toBe(RESPALDO_TEXTOS['citas.pagoSalon.saldoSinPrecio']);
  });

  it('pagado: lo dice, el saldo y solo qué pasa si no llega', () => {
    const forma = formaPagoDeCita(cita(conReglas(citaAnticipoPagado())), AHORA, VIGENTE);
    expect(forma).toMatchObject({
      modo: null,
      limite: null,
      explicacion: RESPALDO_TEXTOS['anticipos.pagado'],
      avisos: [consecuenciaNoAsistir(REGLAS_CITA, VIGENTE)],
    });
  });

  it.each<[string, CitaCruda, string]>([
    ['retenido', citaAnticipoPagado({ estado: 'no_asistio' }), 'anticipos.retenido'],
    [
      'reembolsado',
      citaConAnticipo({ estado: 'cancelada', pagos: [pagoCrudo({ estado: 'reembolsado' })] }),
      'anticipos.devuelto',
    ],
    ['liberado', citaConAnticipo({ estado: 'cancelada', motivoCancelacion: 'Cambio de planes' }), 'citas.detalle.liberado'],
    ['vencido por la barrida', citaConAnticipo({ estado: 'cancelada', motivoCancelacion: 'anticipo_no_pagado' }), 'anticipos.liberada'],
  ])('%s: una cita cerrada solo explica qué pasó con su anticipo', (_caso, cruda, clave) => {
    expect(formaPagoDeCita(cita(cruda), AHORA, VIGENTE)).toMatchObject({
      explicacion: obtenerTexto(clave, {}, VIGENTE),
      saldo: null,
      avisos: [],
      metodos: null,
      avisoReagendar: null,
      conPolitica: false,
    });
  });

  it('en revisión: lo dice y sigue con su saldo', () => {
    const enRevision = citaConAnticipo({ pagos: [pagoCrudo({ estado: 'en_revision' })] });
    expect(formaPagoDeCita(cita(enRevision), AHORA, VIGENTE).explicacion).toBe(RESPALDO_TEXTOS['anticipos.enRevision']);
  });

  it('pendiente con el plazo ya pasado en el teléfono: texto neutro, sin hora límite ni advertencia', () => {
    const pasado = citaConAnticipo({ anticipoVenceEn: masMinutos(AHORA, -5).toISOString() });
    expect(formaPagoDeCita(cita(pasado), AHORA, VIGENTE)).toMatchObject({
      explicacion: RESPALDO_TEXTOS['citas.detalle.revisandoPago'],
      limite: null,
      avisos: [],
    });
  });

  it('pendiente en una cita que ya empezó: sin modo ni plazo, solo qué pasa si no llega', () => {
    const empezada = citaConAnticipo({ fechaHoraInicio: isoMexico(HOY, '09:30') });
    expect(formaPagoDeCita(cita(empezada), AHORA, VIGENTE)).toMatchObject({
      modo: null,
      limite: null,
      avisos: [consecuenciaNoAsistir(REGLAS_OMISION, VIGENTE)],
      avisoReagendar: null,
    });
  });

  it('una cita retenida con el pago marcado sin el pago aprobado: retenido', () => {
    const retenida = citaAnticipoPagado({ pagos: [pagoCrudo({ estado: 'aprobado', retenidoEn: RETENIDO_EN_ISO })] });
    expect(formaPagoDeCita(cita(retenida), AHORA, VIGENTE).explicacion).toBe(RESPALDO_TEXTOS['anticipos.retenido']);
  });
});

describe('opcionesPagoDeCita', () => {
  it('pendiente en línea con las dos reglas activas: en línea y en el salón', () => {
    expect(opcionesPagoDeCita(cita(conReglas(citaConAnticipo())), AHORA, VIGENTE)).toEqual({ enLinea: true, enSalon: true });
  });

  it('con la regla VIGENTE de pago en el salón apagada no se ofrece el salón', () => {
    const apagada = configVigente({ citas: { permitirAnticipoEnSalon: false } });
    expect(opcionesPagoDeCita(cita(conReglas(citaConAnticipo())), AHORA, apagada)).toEqual({ enLinea: true, enSalon: false });
  });

  it('sin margen antes del plazo de la cita (sus minutos más 5) no se ofrece el salón', () => {
    // Faltan 44 minutos para la cita: su regla pide 40 antes, y el margen de 5 ya no cabe.
    const cercana = conReglas(citaConAnticipo({ fechaHoraInicio: masMinutos(AHORA, 44).toISOString() }));
    expect(opcionesPagoDeCita(cita(cercana), AHORA, VIGENTE).enSalon).toBe(false);
    // Con 45 minutos sí cabe justo.
    const justa = conReglas(citaConAnticipo({ fechaHoraInicio: masMinutos(AHORA, 45).toISOString() }));
    expect(opcionesPagoDeCita(cita(justa), AHORA, VIGENTE).enSalon).toBe(true);
  });

  it('ya en el salón: solo adelantar en línea; sin Mercado Pago, ninguna', () => {
    expect(opcionesPagoDeCita(cita(citaEnSalon()), AHORA, VIGENTE)).toEqual({ enLinea: true, enSalon: false });
    const sinMp = configVigente({ mercadoPagoAnticipos: false });
    expect(opcionesPagoDeCita(cita(citaEnSalon()), AHORA, sinMp)).toEqual({ enLinea: false, enSalon: false });
  });

  it('sin anticipo pendiente o sin cambios: ninguna', () => {
    expect(opcionesPagoDeCita(cita(citaAnticipoPagado()), AHORA, VIGENTE)).toEqual({ enLinea: false, enSalon: false });
    expect(opcionesPagoDeCita(cita(citaConAnticipo({ estado: 'cancelada' })), AHORA, VIGENTE)).toEqual({
      enLinea: false,
      enSalon: false,
    });
  });
});

describe('textoAnticipoPendiente y contactoSalon', () => {
  it('confirmación: las formas de pago que se ofrecen y el plazo de la cita', () => {
    const plazo = conUnidad(REGLAS_CITA.plazoAnticipoHoras, 'hora', 'horas');
    const pendiente = cita(conReglas(citaConAnticipo()));
    expect(textoAnticipoPendiente(pendiente, AHORA, VIGENTE)).toBe(
      obtenerTexto('anticipos.pendiente', { formasPago: 'en línea o en el salón', plazoAnticipo: plazo }, VIGENTE),
    );
    const soloSalon = configVigente({ mercadoPagoAnticipos: false });
    expect(textoAnticipoPendiente(pendiente, AHORA, soloSalon)).toContain('Págalo en el salón.');
    const ninguna = configVigente({ mercadoPagoAnticipos: false, citas: { permitirAnticipoEnSalon: false } });
    expect(textoAnticipoPendiente(pendiente, AHORA, ninguna)).toContain('Págalo en línea.');
    // Solo el salón y ya sin margen: el texto sin formas de pago.
    const cercana = cita(conReglas(citaConAnticipo({ fechaHoraInicio: masMinutos(AHORA, 30).toISOString() })));
    expect(textoAnticipoPendiente(cercana, AHORA, soloSalon)).toMatch(/^Págalo\. Si no se paga en /);
  });

  it('sin ahora ni configuración usan el reloj del teléfono y la configuración en memoria (el respaldo)', () => {
    const pendiente = cita(citaConAnticipo());
    expect(formaPagoDeCita(pendiente).avisos).toHaveLength(3);
    expect(opcionesPagoDeCita(pendiente)).toEqual({ enLinea: true, enSalon: true });
    expect(textoAnticipoPendiente(pendiente)).toContain('en línea o en el salón');
    expect(avisoCancelacion(pendiente, null)).toBe(RESPALDO_TEXTOS['citas.cancelar.sinAnticipo']);
    expect(avisoCitaCancelada(null)).toBe(RESPALDO_TEXTOS['citas.cancelar.toast']);
    expect(avisoAnticipoAlReprogramar(cita(citaCruda()))).toBeNull();
    expect(dentroDelAviso(pendiente)).toBe(false);
    expect(contactoSalon()).toHaveLength(2);
  });

  it('contacto: teléfono y WhatsApp del salón; sin números completos, ninguno', () => {
    const { salon } = VIGENTE;
    expect(contactoSalon(VIGENTE)).toEqual([
      { tipo: 'telefono', titulo: obtenerTexto('salon.contacto.telefono', { telefono: salon.telefono }, VIGENTE), url: expect.stringMatching(/^tel:\+52\d{10}$/) },
      { tipo: 'whatsapp', titulo: RESPALDO_TEXTOS['salon.contacto.whatsapp'], url: expect.stringMatching(/^https:\/\/wa\.me\/52\d{10}$/) },
    ]);
    expect(contactoSalon({ ...VIGENTE, salon: { ...salon, telefono: '123', whatsapp: '' } })).toEqual([]);
  });
});
