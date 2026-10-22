import { MENSAJE_SIN_CONEXION, esErrorDeRed } from '@/features/auth/models/AuthModel';
import { precioParaMostrar } from '@/features/inicio/models/FluidoModel';
import { enlaceTelefono, enlaceWhatsApp } from '@/features/salon/models/salonModel';
import { ApiError } from '@/shared/api/apiClient';
import { obtenerConfiguracion, type ConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { aceptacionDeDocumento, registrarConsentimientos } from '@/shared/api/consentimientos';
import { obtenerDocumentoVigente, type DocumentoLegalVigente } from '@/shared/api/documentosLegales';
import { obtenerTexto, obtenerTextoConReglas, type ClaveTextoSitio } from '@/shared/api/textosSitio';

import {
  admiteCambios,
  esVigente,
  estadoAnticipo,
  fechaLargaLegible,
  limiteAnticipo,
  limitePagoCorto,
  montoPagadoAnticipo,
  plazoAnticipoPasado,
  textoAvisoReagendar,
  type Cita,
  type EstadoAnticipoCita,
  type PoliticaCancelacion,
} from './citaModel';
import {
  avisoCancelar,
  conUnidad,
  consecuenciaNoAsistir,
  LIMITE_DIAS_HABILES_EXCEPCION,
  MINIMO_DIAS_HABILES_REEMBOLSO,
  opcionesAnticipo,
  puedeElegirPagoEnSalon,
  saldoEnSalon,
  textoMetodosSalon,
  textosAdvertenciaAnticipo,
  textoSinAnticipo,
  variablesDeReglasCita,
} from './formaPagoModel';

/**
 * Lo que la clienta hace con una cita ya agendada (GP-07.4): la forma de pago del detalle, cambiar el
 * anticipo a pago en el salón, el aviso antes de cancelar y el de reprogramar. Todo con las reglas
 * GUARDADAS en la cita (cita.reglas) para que un cambio de regla en el panel no cambie lo que la
 * cita prometió; solo lo que la cita no guarda (métodos del salón, opciones de pago, meses con pago
 * en línea) sale de la configuración vigente. Los textos son del catálogo (textosSitio). Equivale a
 * OpcionesAnticipo, consentimientoAnticipo y avisoAnticipo.ts de cancelar en la web. Sin React.
 */

const HORA_MS = 60 * 60 * 1000;

// ── Forma de pago del detalle ────────────────────────────────────────────────────────────────

/** Sección "Forma de pago" del detalle de la cita, ya armada para pintar. */
export interface FormaPagoCita {
  /** Monto del anticipo ("$360"), o null si la cita no lo pide. */
  anticipo: string | null;
  /** Etiqueta del monto del anticipo (citas.formaPago.anticipoEtiqueta). */
  etiquetaAnticipo: string;
  /** Con el anticipo pendiente: si se paga en línea o en el salón; si no, null. */
  modo: string | null;
  /** "Paga antes de las 6:30 p. m." del anticipo pendiente en línea, o null. */
  limite: string | null;
  /** Qué significa el estado del anticipo (pagado, en revisión, retenido...), o null. */
  explicacion: string | null;
  /** Lo que se paga en el salón: el saldo después del anticipo o, sin anticipo, el precio. */
  saldo: string | null;
  /** Plazo, política y qué pasa si no llega (pendiente) o solo qué pasa si no llega (pagado). */
  avisos: string[];
  /** Métodos activos del salón, o null. */
  metodos: string | null;
  /** Aviso mínimo para reagendar desde la cuenta (si la regla de la cita lo pide), o null. */
  avisoReagendar: string | null;
  /** Se ofrece el enlace a la Política de anticipos y cancelación. */
  conPolitica: boolean;
}

/** Explicación de cada estado del anticipo que no es 'pendiente' ni 'no_requiere'. */
const EXPLICACION: Readonly<Record<Exclude<EstadoAnticipoCita, 'pendiente' | 'no_requiere'>, ClaveTextoSitio>> = {
  pagado: 'anticipos.pagado',
  en_revision: 'anticipos.enRevision',
  vencido: 'anticipos.liberada',
  retenido: 'anticipos.retenido',
  reembolsado: 'anticipos.devuelto',
  liberada: 'citas.detalle.liberado',
};

/** "El día de tu cita pagas en el salón $840 (el total menos tu anticipo)." o sin monto. */
function textoSaldo(cita: Cita, config: ConfiguracionPublica): string {
  const saldo = saldoEnSalon(cita.servicioPrecio, cita.anticipoRequerido);
  const monto = saldo === null ? null : precioParaMostrar(String(saldo));
  return monto
    ? obtenerTexto('citas.pagoSalon.saldo', { saldo: monto }, config)
    : obtenerTexto('citas.pagoSalon.saldoSinPrecio', {}, config);
}

/** Avisos del anticipo: pendiente y a tiempo, la advertencia completa; vigente, qué pasa si no llega. */
function avisosDeAnticipo(cita: Cita, pendiente: boolean, ahora: Date, config: ConfiguracionPublica): string[] {
  if (pendiente) {
    return plazoAnticipoPasado(cita.anticipoVenceEn, ahora)
      ? []
      : textosAdvertenciaAnticipo({
          enSalon: cita.anticipoEnSalon,
          venceEn: cita.anticipoVenceEn,
          ahora,
          reglas: cita.reglas,
          config,
        });
  }
  return esVigente(cita) ? [consecuenciaNoAsistir(cita.reglas, config)] : [];
}

/** Explicación del estado; pendiente con el plazo ya pasado en el teléfono, un texto neutro. */
function explicacionDeAnticipo(
  cita: Cita,
  estado: Exclude<EstadoAnticipoCita, 'no_requiere'>,
  ahora: Date,
  config: ConfiguracionPublica,
): string | null {
  if (estado === 'pendiente') {
    return plazoAnticipoPasado(cita.anticipoVenceEn, ahora) ? obtenerTexto('citas.detalle.revisandoPago', {}, config) : null;
  }
  return obtenerTexto(EXPLICACION[estado], {}, config);
}

/**
 * La sección "Forma de pago" del detalle con la regla guardada en la cita: monto y estado del
 * anticipo, si el pendiente se paga en línea o en el salón, saldo, plazo y consecuencias, métodos
 * del salón y el aviso para reagendar. Sin anticipo: lo que se paga en el salón y los métodos. Una
 * cita que ya no está vigente solo lleva lo que pasó con su anticipo.
 */
export function formaPagoDeCita(
  cita: Cita,
  ahora: Date = new Date(),
  config: ConfiguracionPublica = obtenerConfiguracion(),
): FormaPagoCita {
  const vigente = esVigente(cita);
  const cambios = admiteCambios(cita, ahora);
  const estado = estadoAnticipo(cita);
  const base = {
    etiquetaAnticipo: obtenerTexto('citas.formaPago.anticipoEtiqueta', {}, config),
    metodos: vigente ? textoMetodosSalon(config) : null,
    avisoReagendar: cambios ? avisoCancelar(cita.reglas, config) : null,
  };
  if (estado === 'no_requiere') {
    return {
      ...base,
      anticipo: null,
      modo: null,
      limite: null,
      explicacion: null,
      saldo: vigente ? textoSinAnticipo(cita.servicioPrecio, config) : null,
      avisos: [],
      conPolitica: false,
    };
  }
  const pendiente = estado === 'pendiente' && cambios;
  const enLinea = pendiente && !cita.anticipoEnSalon;
  return {
    ...base,
    anticipo: cita.anticipoMonto,
    modo: pendiente ? obtenerTexto(cita.anticipoEnSalon ? 'citas.detalle.enSalon' : 'citas.detalle.enLinea', {}, config) : null,
    limite: enLinea ? limitePagoCorto(cita.anticipoVenceEn, ahora) : null,
    explicacion: explicacionDeAnticipo(cita, estado, ahora, config),
    saldo: vigente ? textoSaldo(cita, config) : null,
    avisos: avisosDeAnticipo(cita, pendiente, ahora, config),
    conPolitica: vigente,
  };
}

/** Formas de pagar el anticipo pendiente que se ofrecen en el detalle. */
export interface OpcionesPagoCita {
  /** "Pagar anticipo con Mercado Pago" (también adelanta el pago de un anticipo en el salón). */
  enLinea: boolean;
  /** "Pagar en el salón": cambiar a pago en el salón un anticipo apartado en línea. */
  enSalon: boolean;
}

/**
 * Con el anticipo pendiente y la cita con cambios: en línea si la regla vigente lo permite (o si las
 * dos formas están apagadas, como la web) y en el salón si la regla VIGENTE permitirAnticipoEnSalon
 * está activa y todavía cabe el plazo de la cita (puedeElegirPagoEnSalon, con los minutos guardados
 * en la cita y el margen del backend). Las demás reglas las revisa el backend. Sin plazo o con el
 * plazo ya pasado en el teléfono no se ofrece ninguna: el backend rechaza las dos (409) y el detalle
 * pide no pagar de nuevo mientras revisa el pago. El estado sigue siendo 'pendiente'.
 */
export function opcionesPagoDeCita(
  cita: Cita,
  ahora: Date = new Date(),
  config: ConfiguracionPublica = obtenerConfiguracion(),
): OpcionesPagoCita {
  if (
    estadoAnticipo(cita) !== 'pendiente' ||
    !admiteCambios(cita, ahora) ||
    !cita.anticipoVenceEn ||
    plazoAnticipoPasado(cita.anticipoVenceEn, ahora)
  ) {
    return { enLinea: false, enSalon: false };
  }
  const opciones = opcionesAnticipo(config.reglas.citas, config.reglas.pagos);
  return {
    enLinea: opciones.includes('linea'),
    enSalon: opciones.includes('salon') && puedeElegirPagoEnSalon(cita, ahora),
  };
}

/**
 * "Págalo en línea o en el salón. Si no se paga en 2 horas, el horario se libera." (anticipos.pendiente)
 * para el anticipo pendiente en línea recién agendado, con las formas de pago que se ofrecen y el
 * plazo guardado en la cita.
 */
export function textoAnticipoPendiente(
  cita: Cita,
  ahora: Date = new Date(),
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string {
  const opciones = opcionesAnticipo(config.reglas.citas, config.reglas.pagos);
  const formas = [
    opciones.includes('linea') ? 'en línea' : null,
    opciones.includes('salon') && puedeElegirPagoEnSalon(cita, ahora) ? 'en el salón' : null,
  ].filter(Boolean);
  return obtenerTexto(
    'anticipos.pendiente',
    {
      // Sin ninguna forma a la mano (solo el salón y sin margen), el texto va sin ellas.
      formasPago: formas.join(' o ') || null,
      plazoAnticipo: conUnidad(cita.reglas.plazoAnticipoHoras, 'hora', 'horas'),
    },
    config,
  );
}

// ── Consentimiento de la Política de anticipos ───────────────────────────────────────────────

/** Formulario del consentimiento al pagar o cambiar el anticipo de una cita (el mismo de la web). */
export const FORMULARIO_ANTICIPO_CITA = 'anticipo-cita';

/**
 * Registra que la clienta aceptó la Política de anticipos y cancelación antes de pagar o de cambiar
 * la forma de pago, con la versión y el hash que tuvo a la vista (`vista`, la que mostraba la casilla
 * al marcarla) o, si no había ninguna a la vista, la vigente. Devuelve null si quedó registrado o el
 * mensaje para la clienta si no: sin versión no se registra nada. Nunca rechaza.
 */
export async function registrarAceptacionAnticipos(
  rutaOrigen: string,
  config: ConfiguracionPublica = obtenerConfiguracion(),
  vista: DocumentoLegalVigente | null = null,
): Promise<string | null> {
  const documento = vista ?? (await obtenerDocumentoVigente('anticipos')).documento;
  if (!documento) {
    return obtenerTexto('citas.detalle.politicaNoDisponible', {}, config);
  }
  try {
    await registrarConsentimientos({
      items: [aceptacionDeDocumento(documento)],
      formulario: FORMULARIO_ANTICIPO_CITA,
      rutaOrigen,
    });
    return null;
  } catch (error) {
    return esErrorDeRed(error) ? MENSAJE_SIN_CONEXION : obtenerTexto('citas.detalle.consentimientoFallo', {}, config);
  }
}

// ── Cancelar ─────────────────────────────────────────────────────────────────────────────────

/** La política del anticipo para cancelar: 'cargando' mientras se consulta; null sin datos. */
export type PoliticaConsultada = PoliticaCancelacion | null | 'cargando';

/**
 * Lo pagado del anticipo que importa al cancelar: con estado 'pagado', o algo pagado que no se
 * retuvo ni se reembolsó. 0 si no hay anticipo pagado.
 */
export function anticipoPagadoAlCancelar(cita: Cita): number {
  const estado = estadoAnticipo(cita);
  const pagado = montoPagadoAnticipo(cita);
  const conPago = estado === 'pagado' || (pagado > 0 && estado !== 'retenido' && estado !== 'reembolsado');
  return conPago ? pagado : 0;
}

/**
 * Faltan menos horas para la cita que las de aviso de su regla (horasAvisoCancelarReagendar; 0 es
 * sin mínimo): ya no se puede reagendar desde la cuenta. Cancelar sí se puede.
 */
export function dentroDelAviso(cita: Cita, ahora: Date = new Date()): boolean {
  const horas = cita.reglas.horasAvisoCancelarReagendar;
  const inicio = new Date(cita.fechaHoraInicio).getTime();
  return horas > 0 && Number.isFinite(inicio) && inicio - ahora.getTime() < horas * HORA_MS;
}

/** "24 horas" de la regla de aviso de la cita. */
const horasDeAviso = (cita: Cita) => conUnidad(cita.reglas.horasAvisoCancelarReagendar, 'hora', 'horas');

/** Reembolsable según el backend y todavía dentro del plazo con el reloj de hoy (como la web). */
function reembolsableAhora(politica: PoliticaConsultada, ahora: Date): boolean {
  if (politica === null || politica === 'cargando' || !politica.reembolsable || !politica.reembolsableHasta) {
    return false;
  }
  const limite = new Date(politica.reembolsableHasta).getTime();
  return Number.isFinite(limite) && ahora.getTime() <= limite;
}

/** Sin anticipo pagado: cancelar no cuesta; con aviso mínimo, se agrega el de reagendar. */
function avisoSinAnticipo(cita: Cita, restriccion: string | null, config: ConfiguracionPublica): string {
  const aviso =
    restriccion ??
    (cita.reglas.horasAvisoCancelarReagendar > 0
      ? obtenerTexto('citas.cancelar.avisoReagendar', { horasAviso: horasDeAviso(cita) }, config)
      : null);
  return [obtenerTexto('citas.cancelar.sinAnticipo', {}, config), aviso].filter(Boolean).join(' ');
}

/** Con anticipo pagado y la política ya consultada: si se devuelve, si el plazo terminó o si no. */
function avisoConAnticipo(
  cita: Cita,
  monto: number,
  politica: PoliticaCancelacion | null,
  ahora: Date,
  restriccion: string | null,
  config: ConfiguracionPublica,
): string {
  const variables = {
    anticipo: precioParaMostrar(String(monto)) ?? cita.anticipoMonto,
    diasExcepcion: Math.min(LIMITE_DIAS_HABILES_EXCEPCION, cita.reglas.diasHabilesExcepcionAnticipo),
    diasReembolso: Math.max(MINIMO_DIAS_HABILES_REEMBOLSO, cita.reglas.diasHabilesCancelarConReembolso),
  };
  const tx = (clave: ClaveTextoSitio, extra: Record<string, string> = {}) =>
    obtenerTexto(clave, { ...variables, ...extra }, config);
  const reprogramar = restriccion ?? tx('citas.cancelar.reprogramar');
  if (!politica) {
    return `${tx('citas.cancelar.anticipoSinDatos')} ${reprogramar}`;
  }
  const fechaLimite = politica.reembolsableHasta ? fechaLargaLegible(politica.reembolsableHasta) : '';
  // Reembolsable ahora implica una fecha límite válida (reembolsableAhora la revisa).
  if (reembolsableAhora(politica, ahora)) {
    const hasta = tx('citas.cancelar.anticipoHasta', { fechaLimite });
    return [tx('citas.cancelar.anticipoReembolsable'), hasta, restriccion].filter(Boolean).join(' ');
  }
  if (fechaLimite) {
    return `${tx('citas.cancelar.anticipoPlazoTerminado', { fechaLimite })} ${reprogramar}`;
  }
  return `${tx('citas.cancelar.anticipoNoReembolsable')} ${reprogramar}`;
}

/**
 * Aviso antes de cancelar (textoAnticipoAlCancelar y textoCancelarSinAnticipo de la web) con la
 * regla de la cita: sin anticipo pagado, que no tiene costo (y el aviso para reagendar si la regla lo
 * pide); con anticipo pagado, mientras carga la política un texto de espera y después si se devuelve
 * (con su fecha límite), si el plazo terminó, si no se devuelve o, sin datos, la regla general.
 * Dentro de las horas de aviso se dice que ya no se puede reagendar desde la cuenta.
 */
export function avisoCancelacion(
  cita: Cita,
  politica: PoliticaConsultada,
  ahora: Date = new Date(),
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string {
  const restriccion = dentroDelAviso(cita, ahora)
    ? obtenerTexto('citas.detalle.cancelarSinReagendar', { horasAviso: horasDeAviso(cita) }, config)
    : null;
  const monto = anticipoPagadoAlCancelar(cita);
  if (monto <= 0) {
    return avisoSinAnticipo(cita, restriccion, config);
  }
  if (politica === 'cargando') {
    return obtenerTexto('citas.detalle.cancelarRevisando', {}, config);
  }
  return avisoConAnticipo(cita, monto, politica, ahora, restriccion, config);
}

/** Aviso al terminar de cancelar: con reembolso si la política lo decía al confirmar (toastCitaCancelada). */
export function avisoCitaCancelada(
  politica: PoliticaConsultada,
  ahora: Date = new Date(),
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string {
  return obtenerTexto(reembolsableAhora(politica, ahora) ? 'citas.cancelar.toastReembolso' : 'citas.cancelar.toast', {}, config);
}

// ── Reprogramar ──────────────────────────────────────────────────────────────────────────────

/** "Para reagendar con menos de 24 horas de anticipación, comunícate con el salón." con la regla de la cita. */
export function avisoFueraDePlazo(cita: Cita): string {
  return textoAvisoReagendar(cita.reglas.horasAvisoCancelarReagendar);
}

/**
 * Qué pasa con el anticipo al reprogramar (comentario de reprogramar en citas.service.ts): pagado,
 * se respeta para la nueva fecha; pendiente en el salón, su plazo pasa a los minutos de la regla de
 * la cita antes del nuevo horario; pendiente en línea, conserva su plazo. null si no aplica.
 */
export function avisoAnticipoAlReprogramar(
  cita: Cita,
  ahora: Date = new Date(),
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string | null {
  const estado = estadoAnticipo(cita);
  if (estado === 'pagado') {
    const anticipo = precioParaMostrar(String(anticipoPagadoAlCancelar(cita))) ?? cita.anticipoMonto;
    return obtenerTexto('citas.reprogramar.anticipoPagado', { anticipo }, config);
  }
  if (estado !== 'pendiente') {
    return null;
  }
  if (cita.anticipoEnSalon) {
    return obtenerTextoConReglas('citas.reprogramar.anticipoSalon', variablesDeReglasCita(cita.reglas), {}, config);
  }
  const limite = limiteAnticipo(cita.anticipoVenceEn, ahora);
  return limite
    ? obtenerTexto('citas.reprogramar.anticipoLinea', { limite }, config)
    : obtenerTexto('citas.reprogramar.anticipoLineaSinPlazo', {}, config);
}

/**
 * 404 de GET /api/citas/disponibilidad porque la especialista ya no atiende ("Especialista no
 * encontrado o inactivo"): no se reagenda desde la cuenta, se habla con el salón.
 */
export function esEspecialistaInactiva(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.message.toLowerCase().includes('especialista');
}

// ── Contacto con el salón ────────────────────────────────────────────────────────────────────

/** Una forma de contactar al salón: llamar o escribir por WhatsApp. */
export interface ContactoSalon {
  tipo: 'telefono' | 'whatsapp';
  titulo: string;
  url: string;
}

/**
 * Teléfono y WhatsApp del salón de la configuración, con los enlaces y textos de la pantalla El
 * salón (salonModel y salon.contacto.*). Solo los que tienen un número completo.
 */
export function contactoSalon(config: ConfiguracionPublica = obtenerConfiguracion()): ContactoSalon[] {
  const { telefono, whatsapp } = config.salon;
  const llamar = enlaceTelefono(telefono);
  const escribir = enlaceWhatsApp(whatsapp);
  const contactos: ContactoSalon[] = [];
  if (llamar) {
    contactos.push({
      tipo: 'telefono',
      titulo: obtenerTexto('salon.contacto.telefono', { telefono: telefono.trim() }, config),
      url: llamar,
    });
  }
  if (escribir) {
    contactos.push({ tipo: 'whatsapp', titulo: obtenerTexto('salon.contacto.whatsapp', {}, config), url: escribir });
  }
  return contactos;
}
