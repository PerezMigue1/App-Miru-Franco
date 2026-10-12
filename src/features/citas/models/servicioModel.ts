import { apiGet } from '@/shared/api/apiClient';
import { precioParaMostrar } from '@/features/inicio/models/FluidoModel';
import {
  esObjeto,
  idDe,
  listaDe,
  primeraImagen,
  texto,
  type Crudo,
} from '@/features/inicio/models/inicioService';

/** Especialista que atiende un servicio. */
export interface Especialista {
  id: string | number;
  nombre: string;
  foto?: string;
}

/** Servicio del salón ya normalizado para mostrar en catálogo y detalle. */
export interface Servicio {
  id: string | number;
  nombre: string;
  categoria?: string;
  /** Descripción corta ('' si no viene). */
  descripcion: string;
  /** Descripción larga ('' si no viene). */
  descripcionLarga: string;
  /** "$1,200" listo para mostrar, o null si no hay precio válido. */
  precio: string | null;
  /** "$360" si el servicio pide anticipo, o null. */
  anticipo: string | null;
  /** "45 min", "1 h 30 min", "3 h", o null si no hay duración válida. */
  duracion: string | null;
  requiereEvaluacion: boolean;
  activo?: boolean;
  /** Primera URL https válida del campo imagen (texto o arreglo). */
  imagen?: string;
  incluye: string[];
  recomendaciones: string[];
  /** Solo las que trae el servicio; [] si no trae (el detalle por id nunca las trae). */
  especialistas: Especialista[];
}

/** Minutos a "45 min", "1 h 30 min" o "3 h"; null si no es un número válido. */
export function duracionParaMostrar(valor: unknown): string | null {
  const minutos = typeof valor === 'number' ? valor : Number(texto(valor));
  if (!Number.isFinite(minutos) || minutos <= 0) {
    return null;
  }
  const total = Math.round(minutos);
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (horas === 0) {
    return `${resto} min`;
  }
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** Solo textos no vacíos, recortados. */
function listaDeTextos(valor: unknown): string[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  return valor.map((elemento) => (typeof elemento === 'string' ? elemento.trim() : '')).filter(Boolean);
}

/** La forma de las especialistas aún no es fija: nombre propio o del usuario ligado. */
function normalizarEspecialista(crudo: Crudo): Especialista | null {
  const usuario = esObjeto(crudo.usuario) ? crudo.usuario : undefined;
  const nombre = texto(crudo.nombre) || texto(usuario?.nombre);
  if (!nombre) {
    return null;
  }
  return {
    id: idDe(crudo),
    nombre,
    foto: primeraImagen(crudo.foto, crudo.imagen, usuario?.foto),
  };
}

function normalizarServicio(crudo: Crudo): Servicio {
  const categoria = texto(crudo.categoria);
  const especialistas = Array.isArray(crudo.especialistas)
    ? crudo.especialistas
        .filter(esObjeto)
        .map(normalizarEspecialista)
        .filter((especialista): especialista is Especialista => especialista !== null)
    : [];
  return {
    id: idDe(crudo),
    nombre: texto(crudo.nombre),
    categoria: categoria || undefined,
    descripcion: texto(crudo.descripcion),
    descripcionLarga: texto(crudo.descripcionLarga),
    precio: precioParaMostrar(texto(crudo.precio)),
    anticipo: precioParaMostrar(texto(crudo.anticipoMonto)),
    duracion: duracionParaMostrar(crudo.duracionMinutos),
    requiereEvaluacion: crudo.requiereEvaluacion === true,
    activo: typeof crudo.activo === 'boolean' ? crudo.activo : undefined,
    imagen: primeraImagen(crudo.imagen, crudo.imagenes),
    incluye: listaDeTextos(crudo.incluye),
    recomendaciones: listaDeTextos(crudo.recomendaciones),
    especialistas,
  };
}

/** Lectura pública del catálogo de servicios: GET /api/servicios. */
export function obtenerServicios(): Promise<Servicio[]> {
  return apiGet<unknown>('/api/servicios', { publica: true }).then((respuesta) =>
    listaDe(respuesta, ['data', 'servicios', 'servicio']).map(normalizarServicio),
  );
}

/** Lectura pública de un servicio: GET /api/servicios/:id. Un 404 llega como ApiError. */
export function obtenerServicio(id: string): Promise<Servicio> {
  return apiGet<unknown>(`/api/servicios/${encodeURIComponent(id)}`, { publica: true }).then(
    (respuesta) => {
      const crudo = esObjeto(respuesta) && esObjeto(respuesta.data) ? respuesta.data : undefined;
      if (!crudo) {
        throw new Error('Respuesta de servicio sin datos.');
      }
      return normalizarServicio(crudo);
    },
  );
}
