import { ApiError, apiGet, apiPost } from '@/shared/api/apiClient';

/**
 * Derechos ARCO de la titular (GP-09), con el contrato de src/arco del backend:
 * - POST /api/arco/solicitudes { tipo, descripcion? } (5 por minuto): crea una solicitud; 409 con
 *   code CANCELACION_ABIERTA si ya tiene una cancelación abierta.
 * - GET /api/arco/mias: sus solicitudes, la más reciente primero.
 * - GET /api/arco/mis-datos (10 por minuto): todos sus datos personales (derecho de acceso).
 * - POST /api/arco/oposicion { finalidad: 'promociones' } (5 por minuto): se aplica de inmediato y
 *   queda una solicitud ya atendida.
 * Todas responden { success, data }. Los errores llegan como ApiError o ErrorDeRed de apiClient.
 */

export const TIPOS_ARCO = ['acceso', 'rectificacion', 'cancelacion', 'oposicion', 'revocacion'] as const;
export type TipoArco = (typeof TIPOS_ARCO)[number];

export const ESTADOS_ARCO = ['recibida', 'en_proceso', 'respondida', 'atendida', 'rechazada'] as const;
export type EstadoArco = (typeof ESTADOS_ARCO)[number];

/** Largo máximo de la descripción (MaxLength del DTO del backend). */
export const LARGO_DESCRIPCION_ARCO = 2000;

/** Una solicitud propia (SELECT_SOLICITUD_PROPIA del backend). Las fechas son ISO. */
export interface SolicitudArco {
  id: string;
  folio: string;
  tipo: TipoArco;
  descripcion: string | null;
  estado: EstadoArco;
  creadaEn: string;
  venceRespuesta: string | null;
  respuesta: string | null;
  respondidaEn: string | null;
  venceEfectividad: string | null;
  atendidaEn: string | null;
}

/** Secciones de GET /api/arco/mis-datos que se cuentan, en el orden en que se muestran. */
export const SECCIONES_MIS_DATOS = [
  'direcciones',
  'pedidos',
  'citas',
  'consentimientos',
  'solicitudesArco',
  'ventasSalon',
  'facturas',
  'quejas',
  'valoraciones',
  'metodosPago',
  'cotizaciones',
  'observaciones',
  'seguimientos',
  'devoluciones',
  'pagos',
  'notificaciones',
  'preferenciasNotificacion',
] as const;
export type SeccionMisDatos = (typeof SECCIONES_MIS_DATOS)[number];

/** Perfil de "mis datos" sin nada técnico (ni id, rol, googleId ni banderas internas). */
export interface PerfilMisDatos {
  nombre: string;
  email: string;
  telefono: string;
  /** AAAA-MM-DD, o vacío. */
  fechaNacimiento: string;
  tipoCabello: string;
  colorNatural: string;
  colorActual: string;
  productosUsados: string;
  tratamientosQuimicos: boolean | null;
  tratamientos: string;
  /** Solo con la autorización de datos sensibles vigente; si no, null (nunca se guarda en memoria). */
  alergias: string | null;
  /** Hay alergias guardadas que no se muestran porque no hay autorización vigente. */
  alergiasOcultas: boolean;
  recibePromociones: boolean;
  /** ISO, o vacío. */
  creadoEn: string;
}

export interface ResumenMisDatos {
  /** ISO de cuándo se generó, o vacío. */
  generadoEn: string;
  perfil: PerfilMisDatos;
  conteos: { seccion: SeccionMisDatos; cantidad: number }[];
}

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');
const textoONull = (valor: unknown): string | null => texto(valor) || null;

function respuestaInvalida(): ApiError {
  return new ApiError(500, 'La respuesta del servidor no trae los datos ARCO esperados.');
}

const esTipoArco = (valor: unknown): valor is TipoArco => TIPOS_ARCO.includes(valor as TipoArco);
const esEstadoArco = (valor: unknown): valor is EstadoArco => ESTADOS_ARCO.includes(valor as EstadoArco);

/** Una solicitud del servidor validada, o null si le falta el folio, el tipo, el estado o la fecha. */
export function normalizarSolicitudArco(crudo: unknown): SolicitudArco | null {
  if (!esObjeto(crudo)) {
    return null;
  }
  const folio = texto(crudo.folio);
  const creadaEn = texto(crudo.creadaEn);
  const id = typeof crudo.id === 'number' || typeof crudo.id === 'string' ? String(crudo.id) : '';
  if (!id || !folio || !creadaEn || !esTipoArco(crudo.tipo) || !esEstadoArco(crudo.estado)) {
    return null;
  }
  return {
    id,
    folio,
    tipo: crudo.tipo,
    descripcion: textoONull(crudo.descripcion),
    estado: crudo.estado,
    creadaEn,
    venceRespuesta: textoONull(crudo.venceRespuesta),
    respuesta: textoONull(crudo.respuesta),
    respondidaEn: textoONull(crudo.respondidaEn),
    venceEfectividad: textoONull(crudo.venceEfectividad),
    atendidaEn: textoONull(crudo.atendidaEn),
  };
}

function solicitudDe(respuesta: unknown): SolicitudArco {
  const solicitud = normalizarSolicitudArco(esObjeto(respuesta) ? respuesta.data : null);
  if (!solicitud) {
    throw respuestaInvalida();
  }
  return solicitud;
}

/** POST /api/arco/solicitudes. La descripción va recortada y solo si trae texto. */
export async function crearSolicitudArco(entrada: { tipo: TipoArco; descripcion?: string }): Promise<SolicitudArco> {
  const descripcion = entrada.descripcion?.trim();
  const cuerpo = descripcion ? { tipo: entrada.tipo, descripcion } : { tipo: entrada.tipo };
  return solicitudDe(await apiPost<unknown>('/api/arco/solicitudes', cuerpo));
}

/** GET /api/arco/mias: las solicitudes válidas, en el orden del servidor (la más reciente primero). */
export async function misSolicitudesArco(): Promise<SolicitudArco[]> {
  const respuesta = await apiGet<unknown>('/api/arco/mias');
  if (!esObjeto(respuesta) || !Array.isArray(respuesta.data)) {
    throw respuestaInvalida();
  }
  return respuesta.data.map(normalizarSolicitudArco).filter((s): s is SolicitudArco => s !== null);
}

/** POST /api/arco/oposicion a las promociones: devuelve la solicitud ya atendida. */
export async function oponerseAPromociones(): Promise<SolicitudArco> {
  return solicitudDe(await apiPost<unknown>('/api/arco/oposicion', { finalidad: 'promociones' }));
}

/** GET /api/arco/mis-datos: el objeto data tal cual (se resume con resumirMisDatos). */
export async function leerMisDatos(): Promise<unknown> {
  const respuesta = await apiGet<unknown>('/api/arco/mis-datos');
  const datos = esObjeto(respuesta) ? respuesta.data : null;
  if (!esObjeto(datos) || !esObjeto(datos.perfil)) {
    throw respuestaInvalida();
  }
  return datos;
}

/**
 * Resumen para la pantalla: el perfil y cuántos registros hay de cada sección. El backend manda las
 * alergias aunque no haya autorización vigente: aquí se descartan si `alergiasAutorizadas` no es true,
 * y solo queda la marca de que están guardadas y ocultas.
 */
export function resumirMisDatos(crudo: unknown, alergiasAutorizadas: boolean): ResumenMisDatos {
  const datos = esObjeto(crudo) ? crudo : {};
  const perfil = esObjeto(datos.perfil) ? datos.perfil : {};
  const alergias = texto(perfil.alergias);
  return {
    generadoEn: texto(datos.generadoEn),
    perfil: {
      nombre: texto(perfil.nombre),
      email: texto(perfil.email),
      telefono: texto(perfil.telefono),
      fechaNacimiento: texto(perfil.fechaNacimiento).slice(0, 10),
      tipoCabello: texto(perfil.tipoCabello),
      colorNatural: texto(perfil.colorNatural),
      colorActual: texto(perfil.colorActual),
      productosUsados: texto(perfil.productosUsados),
      tratamientosQuimicos: typeof perfil.tratamientosQuimicos === 'boolean' ? perfil.tratamientosQuimicos : null,
      tratamientos: texto(perfil.tratamientos),
      alergias: alergiasAutorizadas ? alergias : null,
      alergiasOcultas: !alergiasAutorizadas && alergias !== '',
      recibePromociones: perfil.recibePromociones === true,
      creadoEn: texto(perfil.creadoEn),
    },
    conteos: SECCIONES_MIS_DATOS.map((seccion) => {
      const lista = datos[seccion];
      return { seccion, cantidad: Array.isArray(lista) ? lista.length : 0 };
    }),
  };
}
