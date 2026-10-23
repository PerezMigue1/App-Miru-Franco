import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { aceptacionDeDocumento, registrarConsentimientos } from '@/shared/api/consentimientos';
import { obtenerDocumentoVigente, type DocumentoLegalVigente } from '@/shared/api/documentosLegales';

/**
 * Consentimientos de la reserva (consentimientosCita.ts y consentimientoAnticipo.ts de la web): antes
 * de apartar el horario se registran las casillas marcadas y, si un registro falla, la cita no se
 * crea. Con anticipo, primero la Política de anticipos y cancelación con la versión y el hash
 * vigentes; después, si la clienta la marcó, la autorización de fotos del resultado. Sin React.
 */

/** Ruta de la app que se guarda con cada consentimiento de la reserva. */
export const RUTA_ORIGEN_RESERVA = 'app/reservar';

/** Formulario del consentimiento de anticipos (el mismo de la web en crear cita y en el detalle). */
export const FORMULARIO_ANTICIPOS = 'anticipo-cita';

/** Formulario de la autorización de fotos (el de crear cita en la web). */
export const FORMULARIO_FOTOS = 'crear-cita';

/** Qué paso de los consentimientos falló. */
export type PasoConsentimiento = 'version' | 'anticipos' | 'fotos';

/** Falla de un consentimiento: la cita no se creó. `causa` es el error de la red o del servidor. */
export class ErrorConsentimiento extends Error {
  readonly paso: PasoConsentimiento;
  readonly causa: unknown;

  constructor(paso: PasoConsentimiento, causa?: unknown) {
    super(`Consentimiento sin registrar: ${paso}`);
    this.name = 'ErrorConsentimiento';
    this.paso = paso;
    this.causa = causa;
  }
}

export interface CasillasReserva {
  /** La reserva pide anticipo: se registra la Política de anticipos (la clienta ya la marcó). */
  conAnticipo: boolean;
  /** La clienta marcó la casilla opcional de fotos del resultado. */
  autorizaFotos: boolean;
  /**
   * La versión de la política que la casilla mostraba al marcarla. Es la que se registra; sin ella
   * (no había ninguna a la vista) se pide la vigente.
   */
  politicaVista?: DocumentoLegalVigente | null;
}

/**
 * Registra los consentimientos de la reserva en orden y solo resuelve si todos se guardaron. Con
 * anticipo registra la versión de la política que la clienta tuvo a la vista o, si no había ninguna,
 * la vigente (memoria, red o archivo): sin versión (404, o sin red y sin nada guardado) no se registra
 * nada. Lanza ErrorConsentimiento con el paso que falló.
 */
export async function registrarConsentimientosReserva({
  conAnticipo,
  autorizaFotos,
  politicaVista = null,
}: CasillasReserva): Promise<void> {
  if (conAnticipo) {
    const { documento, error } = politicaVista
      ? { documento: politicaVista, error: undefined }
      : await obtenerDocumentoVigente('anticipos');
    if (!documento) {
      throw new ErrorConsentimiento('version', error);
    }
    try {
      await registrarConsentimientos({
        items: [aceptacionDeDocumento(documento)],
        formulario: FORMULARIO_ANTICIPOS,
        rutaOrigen: RUTA_ORIGEN_RESERVA,
      });
    } catch (causa) {
      throw new ErrorConsentimiento('anticipos', causa);
    }
  }
  if (autorizaFotos) {
    try {
      await registrarConsentimientos({
        items: [{ tipo: 'fotos_resultado', accion: 'aceptado' }],
        formulario: FORMULARIO_FOTOS,
        rutaOrigen: RUTA_ORIGEN_RESERVA,
      });
    } catch (causa) {
      throw new ErrorConsentimiento('fotos', causa);
    }
  }
}

// ── Mensajes para la clienta ─────────────────────────────────────────────────────────────────

/** La sesión terminó a mitad de la reserva (401 en cualquier paso). */
export const MENSAJE_SESION_RESERVA = 'Tu sesión terminó. Inicia sesión de nuevo para confirmar tu cita.';

export const MENSAJE_SIN_VERSION_POLITICA =
  'No pudimos confirmar la versión vigente de la Política de anticipos y cancelación, así que no continuamos. Revisa tu conexión a internet e intenta de nuevo.';

const PREFIJO_ANTICIPOS =
  'No pudimos guardar tu aceptación de la Política de anticipos y cancelación, así que no continuamos.';

const PREFIJO_FOTOS =
  'No pudimos guardar tu autorización de fotos, así que tu cita no se agendó. Intenta de nuevo o desmarca esa casilla para continuar.';

const DETALLE_SIN_RED = 'Revisa tu conexión a internet e intenta de nuevo.';
const DETALLE_VERSION_CAMBIO =
  'La política se actualizó hace un momento: revisa la versión vigente, vuelve a marcar la casilla y confirma de nuevo.';
const DETALLE_GENERICO = 'Intenta de nuevo en un momento.';

/** 401: la sesión terminó (apiClient ya intentó renovarla). */
export function esSesionTerminada(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

const esSinRed = (error: unknown) => error instanceof ErrorDeRed || (error instanceof ApiError && error.status === 0);

/** El 400 del backend porque la versión o el hash de la política ya no son los publicados. */
export function esVersionNoPublicada(error: unknown): boolean {
  return error instanceof ErrorConsentimiento && error.paso === 'anticipos' && error.causa instanceof ApiError && error.causa.status === 400;
}

/**
 * Mensaje claro de una falla de consentimiento, como la web: qué no se guardó y qué hacer, sin el
 * texto técnico del servidor. Una sesión terminada da MENSAJE_SESION_RESERVA.
 */
export function mensajeConsentimiento(error: ErrorConsentimiento): string {
  if (error.paso === 'version') {
    return MENSAJE_SIN_VERSION_POLITICA;
  }
  if (esSesionTerminada(error.causa)) {
    return MENSAJE_SESION_RESERVA;
  }
  let detalle = DETALLE_GENERICO;
  if (esSinRed(error.causa)) {
    detalle = DETALLE_SIN_RED;
  } else if (esVersionNoPublicada(error)) {
    detalle = DETALLE_VERSION_CAMBIO;
  }
  return `${error.paso === 'anticipos' ? PREFIJO_ANTICIPOS : PREFIJO_FOTOS} ${detalle}`;
}
