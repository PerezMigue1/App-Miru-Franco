import { RESPALDO_CONFIGURACION } from '@/shared/api/configuracionPublica';

/**
 * Reglas que el backend guarda en cada cita al crearla (instantaneaReglasCita de
 * src/configuracion-sitio/reglas-negocio.ts): así un cambio de regla en el panel no afecta a las
 * citas ya agendadas. Vive aparte de formaPagoModel (que lo vuelve a exportar) para que citaModel lo
 * use sin una importación circular. Puro: sin React ni peticiones.
 */
export interface ReglasCita {
  plazoAnticipoHoras: number;
  minutosAntesPagoSalon: number;
  horasAvisoCancelarReagendar: number;
  diasHabilesExcepcionAnticipo: number;
  diasHabilesCancelarConReembolso: number;
  pierdeAnticipoSiNoAsiste: boolean;
  /** Días inhábiles del salón cuando se creó la cita ('YYYY-MM-DD'). */
  diasInhabiles: string[];
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/**
 * Valores por omisión, como reglasDeCita(null) del backend: los que regían antes de que las citas
 * guardaran sus reglas (el respaldo de la configuración), nunca los vigentes.
 */
function reglasPorOmision(): ReglasCita {
  const { citas, diasInhabiles } = RESPALDO_CONFIGURACION.reglas;
  return {
    plazoAnticipoHoras: citas.plazoAnticipoHoras,
    minutosAntesPagoSalon: citas.minutosAntesPagoSalon,
    horasAvisoCancelarReagendar: citas.horasAvisoCancelarReagendar,
    diasHabilesExcepcionAnticipo: citas.diasHabilesExcepcionAnticipo,
    diasHabilesCancelarConReembolso: citas.diasHabilesCancelarConReembolso,
    pierdeAnticipoSiNoAsiste: citas.pierdeAnticipoSiNoAsiste,
    diasInhabiles: diasInhabiles.map((dia) => dia.fecha),
  };
}

/** Un número finito o un booleano con el mismo tipo que el de omisión (filtrarNumerosYBooleanos del backend). */
function mismoTipo<V extends number | boolean>(valor: unknown, omision: V): V {
  if (typeof valor !== typeof omision) {
    return omision;
  }
  return typeof valor === 'number' && !Number.isFinite(valor) ? omision : (valor as V);
}

/**
 * Las reglas guardadas en una cita, completas, igual que reglasDeCita del backend: sin objeto (citas
 * anteriores a que se guardaran) son las de omisión; un campo que falte o venga con otro tipo toma
 * el de omisión; diasInhabiles se toma solo si todos sus elementos son 'YYYY-MM-DD' (si no, la de
 * omisión, como el backend).
 */
export function reglasDeCita(crudo: unknown): ReglasCita {
  const omision = reglasPorOmision();
  if (!esObjeto(crudo)) {
    return omision;
  }
  const dias = crudo.diasInhabiles;
  const diasValidos = Array.isArray(dias) && dias.every((dia) => typeof dia === 'string' && FECHA.test(dia));
  return {
    plazoAnticipoHoras: mismoTipo(crudo.plazoAnticipoHoras, omision.plazoAnticipoHoras),
    minutosAntesPagoSalon: mismoTipo(crudo.minutosAntesPagoSalon, omision.minutosAntesPagoSalon),
    horasAvisoCancelarReagendar: mismoTipo(crudo.horasAvisoCancelarReagendar, omision.horasAvisoCancelarReagendar),
    diasHabilesExcepcionAnticipo: mismoTipo(crudo.diasHabilesExcepcionAnticipo, omision.diasHabilesExcepcionAnticipo),
    diasHabilesCancelarConReembolso: mismoTipo(
      crudo.diasHabilesCancelarConReembolso,
      omision.diasHabilesCancelarConReembolso,
    ),
    pierdeAnticipoSiNoAsiste: mismoTipo(crudo.pierdeAnticipoSiNoAsiste, omision.pierdeAnticipoSiNoAsiste),
    diasInhabiles: diasValidos ? [...(dias as string[])] : omision.diasInhabiles,
  };
}

/**
 * Variables de los textos del sitio que salen de las reglas de una cita, con los mismos nombres que
 * variablesDeReglas del backend. Para obtenerTextoConReglas.
 */
export function variablesDeReglasCita(reglas: ReglasCita): Record<string, string> {
  return {
    plazoAnticipoHoras: String(reglas.plazoAnticipoHoras),
    minutosAntesPagoSalon: String(reglas.minutosAntesPagoSalon),
    horasAvisoCancelarReagendar: String(reglas.horasAvisoCancelarReagendar),
    diasHabilesExcepcionAnticipo: String(reglas.diasHabilesExcepcionAnticipo),
    diasHabilesCancelarConReembolso: String(reglas.diasHabilesCancelarConReembolso),
  };
}
