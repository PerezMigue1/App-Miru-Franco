import { precioParaMostrar } from '@/features/inicio/models/FluidoModel';
import {
  obtenerConfiguracion,
  type ConfiguracionPublica,
  type MetodoPagoSalon,
  type PagosPublicos,
  type ReglasCitasPublicas,
} from '@/shared/api/configuracionPublica';
import { obtenerTexto, obtenerTextoConReglas, type ContextoTexto } from '@/shared/api/textosSitio';

import { limitePagoCorto, plazoAnticipoEnSalon, type Cita, type PagoAnticipo } from './citaModel';
import { variablesDeReglasCita, type ReglasCita } from './reglasCitaModel';

export { reglasDeCita, variablesDeReglasCita, type ReglasCita } from './reglasCitaModel';

/**
 * Forma de pago de una cita (reservar, detalle y Mis citas): qué opciones del anticipo se ofrecen y
 * los textos de plazo, consecuencias, métodos del salón y la Política de anticipos, todo con las
 * reglas de Admin > Configuración del sitio > Reglas. Equivale a formaPago.ts y advertenciaAnticipo.ts
 * de la web. Los textos salen del catálogo (textosSitio) y cada función que recibe `reglas`
 * guardadas de una cita las usa en lugar de las vigentes. Puro: sin React ni peticiones.
 */

/** Cómo se paga el anticipo: en línea con Mercado Pago o en el salón (el mismo de crearCita). */
export type OpcionAnticipo = PagoAnticipo;

/** Precio como número o texto del API ("450.00", "$1,200.00"). */
export type Precio = number | string | null | undefined;

/**
 * La excepción de la Política de anticipos nunca pasa de 10 días hábiles: es el límite de la
 * política publicada (DIAS_HABILES_EXCEPCION_SERVICIO de src/citas/anticipos/anticipos.util.ts del
 * backend, que politicaCancelacionAnticipo aplica con Math.min).
 */
export const LIMITE_DIAS_HABILES_EXCEPCION = 10;

/**
 * El plazo para cancelar con reembolso nunca baja de 5 días hábiles: es el mínimo de ley
 * (DIAS_HABILES_CANCELAR_CON_REEMBOLSO de src/citas/anticipos/anticipos.util.ts del backend, que
 * politicaCancelacionAnticipo aplica con Math.max).
 */
export const MINIMO_DIAS_HABILES_REEMBOLSO = 5;

/**
 * Margen mínimo antes del plazo del salón para apartar con pago en el salón: el backend rechaza
 * agendar o cambiar a pago en el salón con menos (MARGEN_MINIMO_ANTICIPO_MS de
 * src/citas/citas.service.ts).
 */
export const MARGEN_MINIMO_ANTICIPO_MS = 5 * 60 * 1000;

const MINUTO_MS = 60 * 1000;

/** El nombre de la política dentro de la etiqueta de la casilla: es el texto del enlace. */
export const NOMBRE_POLITICA_ANTICIPOS = 'Política de anticipos y cancelación';

const CLAVE_OPCION: Record<OpcionAnticipo, string> = {
  linea: 'citas.formaPago.opcionLinea',
  salon: 'citas.formaPago.opcionSalon',
};

const ETIQUETA_METODO: Record<MetodoPagoSalon, string> = {
  efectivo: 'efectivo',
  tarjeta: 'tarjeta',
  transferencia: 'transferencia',
};

/**
 * El texto de una clave: con las reglas guardadas de una cita (obtenerTextoConReglas) si las hay, o
 * con las vigentes (obtenerTexto) si no.
 */
function texto(clave: string, contexto: ContextoTexto, reglas: ReglasCita | undefined, config: ConfiguracionPublica): string {
  return reglas
    ? obtenerTextoConReglas(clave, variablesDeReglasCita(reglas), contexto, config)
    : obtenerTexto(clave, contexto, config);
}

/** Número de un precio o monto: quita "$" y comas antes de Number. NaN si no se puede leer. */
function aNumero(valor: Precio): number {
  if (typeof valor === 'number') {
    return valor;
  }
  const limpio = (valor ?? '').replaceAll('$', '').replaceAll(',', '').trim();
  return limpio ? Number(limpio) : Number.NaN;
}

/** "1 hora" / "2 horas" (como conUnidad de la web). */
export function conUnidad(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Las opciones activas para pagar el anticipo, en el orden en que se muestran: en línea si
 * mercadoPagoAnticipos y en el salón si permitirAnticipoEnSalon. El panel no deja apagar las dos; si
 * llegara así, se ofrece en línea y el backend decide (como la web).
 */
export function opcionesAnticipo(
  reglasCitas: Pick<ReglasCitasPublicas, 'permitirAnticipoEnSalon'> = obtenerConfiguracion().reglas.citas,
  pagos: Pick<PagosPublicos, 'mercadoPagoAnticipos'> = obtenerConfiguracion().reglas.pagos,
): OpcionAnticipo[] {
  const opciones: OpcionAnticipo[] = [];
  if (pagos.mercadoPagoAnticipos) {
    opciones.push('linea');
  }
  if (reglasCitas.permitirAnticipoEnSalon) {
    opciones.push('salon');
  }
  return opciones.length > 0 ? opciones : ['linea'];
}

/** La opción que se marca al entrar: la primera activa (en línea si está activa). */
export function opcionInicial(
  reglasCitas?: Pick<ReglasCitasPublicas, 'permitirAnticipoEnSalon'>,
  pagos?: Pick<PagosPublicos, 'mercadoPagoAnticipos'>,
): OpcionAnticipo {
  return opcionesAnticipo(reglasCitas, pagos)[0];
}

/** "Pagar anticipo en línea" / "Pagar anticipo en el salón". */
export function etiquetaOpcion(opcion: OpcionAnticipo, config: ConfiguracionPublica = obtenerConfiguracion()): string {
  return obtenerTexto(CLAVE_OPCION[opcion], {}, config);
}

/**
 * Plazo y qué pasa si no se paga, según la opción. En línea: el plazo en horas y el tope de minutos
 * antes de la cita. En el salón: cuándo llegar (solo si se pide llegar antes del plazo) y que la cita
 * se cancela si no se paga. Con `reglas` de una cita usa su plazo y sus minutos.
 */
export function plazoDeOpcion(
  opcion: OpcionAnticipo,
  reglas?: ReglasCita,
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string {
  const vigentes = config.reglas.citas;
  if (opcion === 'linea') {
    const horas = reglas?.plazoAnticipoHoras ?? vigentes.plazoAnticipoHoras;
    return texto('citas.formaPago.plazoLinea', { plazoAnticipo: conUnidad(horas, 'hora', 'horas') }, reglas, config);
  }
  const minutosSalon = reglas?.minutosAntesPagoSalon ?? vigentes.minutosAntesPagoSalon;
  const plazo = texto('citas.formaPago.plazoSalon', {}, reglas, config);
  if (vigentes.minutosLlegadaAntes <= minutosSalon) {
    return plazo;
  }
  return `${texto('citas.formaPago.llegadaSalon', {}, reglas, config)} ${plazo}`;
}

/**
 * Qué pasa con el anticipo si no llega (regla "Si no llega, pierde el anticipo", la guardada en la
 * cita si viene) y, si hay meses con pago solo en línea y el pago en línea está activo, que sus
 * próximas citas se apartan pagando en línea.
 */
export function consecuenciaNoAsistir(reglas?: ReglasCita, config: ConfiguracionPublica = obtenerConfiguracion()): string {
  const pierde = reglas?.pierdeAnticipoSiNoAsiste ?? config.reglas.citas.pierdeAnticipoSiNoAsiste;
  const base = texto(pierde ? 'citas.formaPago.noAsistePierde' : 'citas.formaPago.noAsisteRevisa', {}, reglas, config);
  const meses = config.reglas.citas.mesesSoloPagoEnLinea;
  if (meses <= 0 || !config.reglas.pagos.mercadoPagoAnticipos) {
    return base;
  }
  const soloLinea = texto(
    'citas.formaPago.soloLineaDespuesFalta',
    { mesesSoloLinea: conUnidad(meses, 'mes', 'meses') },
    reglas,
    config,
  );
  return `${base} ${soloLinea}`;
}

/** Aviso mínimo para reagendar desde la cuenta, solo si la regla lo pide (más de 0 horas); si no, null. */
export function avisoCancelar(reglas?: ReglasCita, config: ConfiguracionPublica = obtenerConfiguracion()): string | null {
  const horas = reglas?.horasAvisoCancelarReagendar ?? config.reglas.citas.horasAvisoCancelarReagendar;
  return horas > 0
    ? texto('citas.formaPago.avisoCancelar', { horasAviso: conUnidad(horas, 'hora', 'horas') }, reglas, config)
    : null;
}

/** "efectivo, tarjeta o transferencia" (como listaMetodosSalon de la web); '' sin métodos. */
export function listaMetodosSalon(metodos: readonly MetodoPagoSalon[]): string {
  const nombres = metodos.map((metodo) => ETIQUETA_METODO[metodo]);
  if (nombres.length <= 1) {
    return nombres.join('');
  }
  return `${nombres.slice(0, -1).join(', ')} o ${nombres[nombres.length - 1]}`;
}

/** "En el salón puedes pagar con efectivo, tarjeta o transferencia.", o null si no hay métodos activos. */
export function textoMetodosSalon(config: ConfiguracionPublica = obtenerConfiguracion()): string | null {
  const metodos = config.reglas.pagos.metodosSalon;
  return metodos.length > 0
    ? obtenerTexto('citas.formaPago.metodosSalon', { metodosSalon: listaMetodosSalon(metodos) }, config)
    : null;
}

/** Sin anticipo: "Pagas $450 en el salón el día de tu cita." (sin precio válido, el texto sin monto). */
export function textoSinAnticipo(precio: Precio, config: ConfiguracionPublica = obtenerConfiguracion()): string {
  const numero = aNumero(precio);
  const monto = Number.isFinite(numero) ? precioParaMostrar(String(numero)) : null;
  return monto
    ? obtenerTexto('citas.formaPago.sinAnticipoPrecio', { precio: monto }, config)
    : obtenerTexto('citas.formaPago.sinAnticipo', {}, config);
}

/**
 * Lo que queda por pagar en el salón después del anticipo, redondeado a centavos y nunca negativo.
 * null si el precio no es un número mayor que 0. Un anticipo que no se puede leer cuenta como 0.
 */
export function saldoEnSalon(precio: Precio, anticipo: Precio): number | null {
  const total = aNumero(precio);
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }
  const pagado = aNumero(anticipo);
  const saldo = Math.round((total - (Number.isFinite(pagado) ? pagado : 0)) * 100) / 100;
  return Math.max(0, saldo);
}

/**
 * Texto del botón final de la reserva según el anticipo y la opción elegida. Mientras se envía
 * (`enviando`) lleva un texto genérico de espera.
 */
export function textoBotonConfirmar(
  anticipo: number,
  opcion: OpcionAnticipo,
  enviando: boolean,
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string {
  if (anticipo <= 0) {
    return enviando ? 'Confirmando…' : obtenerTexto('citas.crear.botonConfirmar', {}, config);
  }
  if (opcion === 'linea') {
    return enviando ? 'Abriendo Mercado Pago…' : obtenerTexto('citas.crear.botonConfirmarLinea', {}, config);
  }
  return enviando ? 'Apartando…' : obtenerTexto('citas.crear.botonConfirmarSalon', {}, config);
}

/**
 * Resumen de la Política de anticipos y cancelación para la casilla, con los días de la cita (sus
 * reglas guardadas) o los vigentes, acotados como el backend: la excepción hasta
 * LIMITE_DIAS_HABILES_EXCEPCION y el reembolso desde MINIMO_DIAS_HABILES_REEMBOLSO.
 */
export function textoPoliticaAnticipos(
  reglas?: Pick<ReglasCita, 'diasHabilesExcepcionAnticipo' | 'diasHabilesCancelarConReembolso'>,
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string {
  const vigentes = config.reglas.citas;
  const excepcion = reglas?.diasHabilesExcepcionAnticipo ?? vigentes.diasHabilesExcepcionAnticipo;
  const reembolso = reglas?.diasHabilesCancelarConReembolso ?? vigentes.diasHabilesCancelarConReembolso;
  return obtenerTexto(
    'citas.politicaAnticipos.resumen',
    {
      diasExcepcion: Math.min(LIMITE_DIAS_HABILES_EXCEPCION, excepcion),
      diasReembolso: Math.max(MINIMO_DIAS_HABILES_REEMBOLSO, reembolso),
    },
    config,
  );
}

/** Etiqueta de la casilla partida alrededor del enlace a la política. */
export interface EtiquetaCasillaPolitica {
  /** La etiqueta completa, para el lector de pantalla. */
  completa: string;
  antes: string;
  enlace: string;
  despues: string;
}

/**
 * "Leí la Política de anticipos y cancelación" partida para pintar el nombre de la política como
 * enlace. Si el texto no trae ese nombre, el enlace va al final con "Leer la Política...".
 */
export function etiquetaCasillaPolitica(config: ConfiguracionPublica = obtenerConfiguracion()): EtiquetaCasillaPolitica {
  const completa = obtenerTexto('citas.politicaAnticipos.casilla', {}, config);
  const indice = completa.indexOf(NOMBRE_POLITICA_ANTICIPOS);
  if (indice < 0) {
    return { completa, antes: `${completa} `, enlace: obtenerTexto('anticipos.enlacePolitica', {}, config), despues: '' };
  }
  return {
    completa,
    antes: completa.slice(0, indice),
    enlace: NOMBRE_POLITICA_ANTICIPOS,
    despues: completa.slice(indice + NOMBRE_POLITICA_ANTICIPOS.length),
  };
}

/** "Para continuar marca que leíste la Política de anticipos y cancelación." */
export function textoFaltaPolitica(config: ConfiguracionPublica = obtenerConfiguracion()): string {
  return obtenerTexto('citas.politicaAnticipos.falta', {}, config);
}

/**
 * "Pagar en el salón" se puede elegir si el anticipo todavía no es del salón y aún cabe su plazo
 * (`minutosAntesPagoSalon` antes del inicio) más MARGEN_MINIMO_ANTICIPO_MS. Por omisión usa los
 * minutos guardados en la cita y, sin ellos, los vigentes. Las demás reglas (faltas, otra cita por
 * pagar en el salón) las revisa el backend y su mensaje se muestra tal cual.
 */
export function puedeElegirPagoEnSalon(
  cita: Pick<Cita, 'fechaHoraInicio'> & Partial<Pick<Cita, 'anticipoEnSalon' | 'reglas'>>,
  ahora: Date = new Date(),
  minutosAntesPagoSalon: number = cita.reglas?.minutosAntesPagoSalon ??
    obtenerConfiguracion().reglas.citas.minutosAntesPagoSalon,
): boolean {
  if (cita.anticipoEnSalon) {
    return false;
  }
  const inicio = new Date(cita.fechaHoraInicio).getTime();
  if (!Number.isFinite(inicio)) {
    return false;
  }
  return inicio - minutosAntesPagoSalon * MINUTO_MS - ahora.getTime() >= MARGEN_MINIMO_ANTICIPO_MS;
}

/** Lo que necesita la advertencia del anticipo. */
export interface DatosAdvertenciaAnticipo {
  /** El anticipo se paga en el salón. */
  enSalon: boolean;
  /** Plazo del anticipo (ISO), o null. */
  venceEn: string | null;
  ahora?: Date;
  /** Reglas guardadas en la cita (Cita.reglas), si las hay. */
  reglas?: ReglasCita;
  config?: ConfiguracionPublica;
}

/**
 * Advertencia junto a los botones de pago (advertenciaAnticipo.ts de la web): el plazo (en el salón,
 * con plazoAnticipoEnSalon de citaModel y los minutos de la cita; en línea, "anticipos.plazoLinea" con el límite), el resumen
 * de la Política de anticipos y qué pasa si no llega.
 */
export function textosAdvertenciaAnticipo({
  enSalon,
  venceEn,
  ahora = new Date(),
  reglas,
  config = obtenerConfiguracion(),
}: DatosAdvertenciaAnticipo): string[] {
  let plazo: string;
  if (enSalon) {
    const minutos = reglas?.minutosAntesPagoSalon ?? config.reglas.citas.minutosAntesPagoSalon;
    plazo = `${plazoAnticipoEnSalon(venceEn, ahora, minutos, config)} ${texto('anticipos.salonSeLibera', {}, reglas, config)}`;
  } else {
    const horas = reglas?.plazoAnticipoHoras ?? config.reglas.citas.plazoAnticipoHoras;
    const limite = limitePagoCorto(venceEn, ahora);
    plazo = texto(
      'anticipos.plazoLinea',
      {
        plazoAnticipo: conUnidad(horas, 'hora', 'horas'),
        limite: limite ? ` (${limite.charAt(0).toLowerCase()}${limite.slice(1)})` : '',
      },
      reglas,
      config,
    );
  }
  return [plazo, textoPoliticaAnticipos(reglas, config), consecuenciaNoAsistir(reglas, config)];
}
