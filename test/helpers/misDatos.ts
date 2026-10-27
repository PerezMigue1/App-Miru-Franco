/// <reference types="jest" />

import { respuesta } from './servidorSimulado';

/**
 * Datos ficticios de Mis datos y privacidad (GP-09) con la forma de src/arco y src/consentimientos
 * del backend ({ success, data }). Folios, fechas y textos son inventados; nunca datos reales.
 */

export const RUTA_MIAS = '/api/arco/mias';
export const RUTA_SOLICITUDES = '/api/arco/solicitudes';
export const RUTA_MIS_DATOS = '/api/arco/mis-datos';
export const RUTA_OPOSICION = '/api/arco/oposicion';
export const RUTA_MIOS = '/api/consentimientos/mios';
export const RUTA_CONSENTIMIENTOS = '/api/consentimientos';
export const RUTA_ME = '/api/auth/me';

export const ALERGIA_FICTICIA = 'Alergia ficticia al amoniaco';

/** Solicitud propia cruda (SELECT_SOLICITUD_PROPIA). Por omisión, un acceso recibido. */
export function solicitudCruda(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 41,
    folio: 'ARCO-2026-000041',
    tipo: 'acceso',
    descripcion: null,
    estado: 'recibida',
    // 03:30 UTC: en UTC es el 20 de octubre y en México (UTC-6) todavía el 19.
    creadaEn: '2026-10-20T03:30:00.000Z',
    venceRespuesta: '2026-11-17T03:30:00.000Z',
    respuesta: null,
    respondidaEn: null,
    venceEfectividad: null,
    atendidaEn: null,
    ...cambios,
  };
}

/** Solicitud respondida con su respuesta y su plazo para aplicarla. */
export const RESPONDIDA = solicitudCruda({
  id: 42,
  folio: 'ARCO-2026-000042',
  tipo: 'rectificacion',
  descripcion: 'Mi teléfono ficticio cambió.',
  estado: 'respondida',
  creadaEn: '2026-10-01T18:00:00.000Z',
  respuesta: 'Corregimos tu teléfono ficticio.',
  respondidaEn: '2026-10-05T18:00:00.000Z',
  venceEfectividad: '2026-10-26T18:00:00.000Z',
});

/** Oposición ya atendida (la que deja POST /api/arco/oposicion). */
export const OPOSICION_ATENDIDA = solicitudCruda({
  id: 43,
  folio: 'ARCO-2026-000043',
  tipo: 'oposicion',
  descripcion: 'Oposición al uso de mis datos para enviarme promociones.',
  estado: 'atendida',
  creadaEn: '2026-10-10T16:00:00.000Z',
  respuesta: 'Aplicada de inmediato: ya no recibirás promociones.',
  respondidaEn: '2026-10-10T16:00:00.000Z',
  atendidaEn: '2026-10-10T16:00:00.000Z',
});

/** 200 de GET /api/arco/mias. */
export function respuestaMias(lista: unknown[] = []): Response {
  return respuesta({ success: true, data: lista });
}

/** 201 de POST /api/arco/solicitudes o /api/arco/oposicion con la solicitud creada. */
export function respuestaSolicitud(cambios: Record<string, unknown> = {}): Response {
  return respuesta({ success: true, data: solicitudCruda(cambios) }, 201);
}

/**
 * Alergias en GET /api/arco/mis-datos desde la Ronda 9 del backend: sin autorización vigente el texto
 * no viaja (alergias en null) y los campos nuevos dicen si hay uno guardado.
 */
export const ALERGIAS_OCULTAS = Object.freeze({
  alergias: null,
  datosSensiblesAutorizados: false,
  alergiasGuardadas: true,
  alergiasOcultas: true,
});

/** Con la autorización vigente: el texto viaja y no están ocultas. */
export const ALERGIAS_AUTORIZADAS = Object.freeze({
  alergias: ALERGIA_FICTICIA,
  datosSensiblesAutorizados: true,
  alergiasGuardadas: true,
  alergiasOcultas: false,
});

/** Sin alergias guardadas (ni texto ni aviso). */
export const SIN_ALERGIAS = Object.freeze({
  alergias: null,
  datosSensiblesAutorizados: false,
  alergiasGuardadas: false,
  alergiasOcultas: false,
});

/**
 * Perfil crudo de GET /api/arco/mis-datos (SELECT_MIS_DATOS) de la Ronda 9: por omisión, con alergias
 * guardadas y sin autorización (el texto no viaja).
 */
export function perfilMisDatos(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'clienta-mis-datos-1',
    nombre: 'Clienta Ficticia',
    email: 'misdatos@ejemplo.test',
    telefono: '7710000001',
    fechaNacimiento: '1995-04-12T00:00:00.000Z',
    foto: null,
    googleId: null,
    rol: 'cliente',
    aceptaAvisoPrivacidad: true,
    recibePromociones: true,
    confirmado: true,
    activo: true,
    creadoEn: '2026-01-15T17:00:00.000Z',
    actualizadoEn: '2026-10-01T17:00:00.000Z',
    ultimaActividad: '2026-10-25T17:00:00.000Z',
    tipoCabello: 'ondulado',
    colorNatural: 'Castaño',
    colorActual: 'Castaño claro',
    productosUsados: 'Shampoo ficticio',
    ...ALERGIAS_OCULTAS,
    tratamientosQuimicos: true,
    tratamientos: 'Tinte ficticio',
    ...cambios,
  };
}

/** 200 de GET /api/arco/mis-datos con 2 pedidos, 3 citas y 1 factura; lo demás vacío. */
export function respuestaMisDatos(perfil: Record<string, unknown> = perfilMisDatos()): Response {
  return respuesta({
    success: true,
    data: {
      generadoEn: '2026-10-26T17:30:00.000Z',
      perfil,
      direcciones: [],
      pedidos: [{ id: 1 }, { id: 2 }],
      citas: [{ id: 1 }, { id: 2 }, { id: 3 }],
      consentimientos: [],
      solicitudesArco: [],
      ventasSalon: [],
      facturas: [{ id: 'f-1' }],
      quejas: [],
      valoraciones: [],
      metodosPago: [],
      cotizaciones: [],
      observaciones: [],
      seguimientos: [],
      devoluciones: [],
      pagos: [],
      notificaciones: [],
      preferenciasNotificacion: [],
    },
  });
}

/** Fila de GET /api/consentimientos/mios. */
export function filaConsentimiento(tipo: string, accion: 'aceptado' | 'revocado', creadoEn: string) {
  return { id: `${tipo}-${creadoEn}`, tipo, accion, creadoEn, documentoSlug: 'aviso-privacidad', documentoVersion: '2.0' };
}

/** 200 de GET /api/consentimientos/mios (lo más reciente primero). */
export function respuestaMios(filas: unknown[] = []): Response {
  return respuesta({ success: true, data: filas });
}

/** Fotos autorizadas en una cita. */
export const FOTOS_ACEPTADAS = [filaConsentimiento('fotos_resultado', 'aceptado', '2026-09-01T17:00:00.000Z')];

/** Fotos autorizadas y después retiradas. */
export const FOTOS_REVOCADAS = [
  filaConsentimiento('fotos_resultado', 'revocado', '2026-10-01T17:00:00.000Z'),
  filaConsentimiento('fotos_resultado', 'aceptado', '2026-09-01T17:00:00.000Z'),
];

/** 201 de POST /api/consentimientos. */
export function respuestaRevocado(tipo: string): Response {
  return respuesta({ success: true, data: [{ id: '77', tipo, accion: 'revocado', creadoEn: '2026-10-26T17:00:00.000Z' }] }, 201);
}

/** GET /api/auth/me con recibePromociones. */
export function respuestaMe(recibePromociones: boolean): Response {
  return respuesta({
    data: {
      id: 'clienta-mis-datos-1',
      nombre: 'Clienta Ficticia',
      email: 'misdatos@ejemplo.test',
      rol: 'cliente',
      recibePromociones,
    },
  });
}

/** 5xx con su referencia, como el filtro global del backend. */
export function error500(referencia = 'A1B2C3D4'): Response {
  return respuesta({ success: false, statusCode: 500, message: 'Error interno ficticio', referencia }, 500);
}

/** Folio ficticio de la cancelación que ya está abierta. */
export const FOLIO_ABIERTA = 'ARCO-2026-000040';

/** 409 de POST /api/arco/solicitudes con una cancelación abierta; desde la Ronda 9 el folio va en errors.folio (null: sin errors). */
export function cancelacionAbierta409(errors: unknown = { folio: FOLIO_ABIERTA }): Response {
  return respuesta(
    {
      success: false,
      statusCode: 409,
      message: `Ya tienes una solicitud de cancelación abierta con folio ${FOLIO_ABIERTA}.`,
      code: 'CANCELACION_ABIERTA',
      ...(errors === null ? {} : { errors }),
    },
    409,
  );
}

/** 400 de validación del DTO (el message técnico nunca se muestra). */
export function validacion400(): Response {
  return respuesta(
    { success: false, statusCode: 400, error: 'Bad Request', message: 'La descripción no puede pasar de 2000 caracteres' },
    400,
  );
}
