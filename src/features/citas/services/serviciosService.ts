
import { apiGet } from '@/shared/api/apiClient';

import type { Servicio } from '../models/Servicio';

type ApiServicio = {
  id?: string | number;
  _id?: string | number;

  nombre?: string;
  descripcion?: string;

  descripcionLarga?: string;
  descripcion_larga?: string;

  duracion?: string | number;
  duracionMinutos?: number;
  duracion_minutos?: number;

  precio?: number | string;
  categoria?: string;

  anticipoMonto?: number | string | null;
  anticipo_monto?: number | string | null;

  requiereEvaluacion?: boolean;
  requiere_evaluacion?: boolean;

  activo?: boolean;

  imagen?: unknown;
  imagenes?: unknown[];

  incluye?: unknown[];
  recomendaciones?: unknown[];

  especialistas?: Record<string, unknown>[];
  servicio_especialistas?: Record<string, unknown>[];
};

function obtenerImagen(valor: unknown): string | undefined {
  if (typeof valor === 'string') {
    return valor.trim() || undefined;
  }

  if (valor && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>;

    const url =
      objeto.secure_url ??
      objeto.url ??
      objeto.src;

    if (typeof url === 'string') {
      return url;
    }
  }

  return undefined;
}

function normalizarServicio(raw: ApiServicio): Servicio {
  const duracionMinutos =
    raw.duracionMinutos ??
    raw.duracion_minutos;

  const anticipoRaw =
    raw.anticipoMonto ??
    raw.anticipo_monto;

  const imagenes: string[] = [];

  const agregarImagen = (valor: unknown) => {
    const url = obtenerImagen(valor);

    if (url && !imagenes.includes(url)) {
      imagenes.push(url);
    }
  };

  if (Array.isArray(raw.imagen)) {
    raw.imagen.forEach(agregarImagen);
  } else {
    agregarImagen(raw.imagen);
  }

  if (Array.isArray(raw.imagenes)) {
    raw.imagenes.forEach(agregarImagen);
  }

  const especialistasRaw =
    raw.especialistas ??
    raw.servicio_especialistas ??
    [];

  const especialistas = especialistasRaw
    .map((item) => {
      const usuario =
        item.usuario &&
        typeof item.usuario === 'object'
          ? item.usuario as Record<string, unknown>
          : {};

      const id =
        item.id ??
        item.usuarioId ??
        item.usuario_id;

      const usuarioId =
        item.usuarioId ??
        item.usuario_id;

      if (
        (typeof id !== 'string' &&
          typeof id !== 'number') ||
        (typeof usuarioId !== 'string' &&
          typeof usuarioId !== 'number')
      ) {
        return null;
      }

      return {
        id,
        usuarioId: String(usuarioId),

        nombre:
          typeof usuario.nombre === 'string'
            ? usuario.nombre
            : undefined,

        rol:
          typeof usuario.rol === 'string'
            ? usuario.rol
            : undefined,

        avatarUrl:
          typeof usuario.avatarUrl === 'string'
            ? usuario.avatarUrl
            : undefined,
      };
    })
    .filter(
      (item): item is NonNullable<typeof item> =>
        item !== null
    );

  const precioNumero = Number(raw.precio);

  const precio =
    raw.precio !== undefined &&
    raw.precio !== null &&
    Number.isFinite(precioNumero)
      ? `$${precioNumero.toFixed(2)}`
      : undefined;

  const anticipo =
    anticipoRaw === null ||
    anticipoRaw === undefined
      ? null
      : Number(anticipoRaw);

  return {
    id: raw.id ?? raw._id ?? '',
    nombre: raw.nombre ?? '',
    descripcion: raw.descripcion,

    descripcionLarga:
      raw.descripcionLarga ??
      raw.descripcion_larga,

    duracionMinutos,

    duracion:
      raw.duracion !== undefined
        ? String(raw.duracion)
        : duracionMinutos
          ? `${duracionMinutos} min`
          : undefined,

    precio,
    categoria: raw.categoria,

    anticipoMonto:
      anticipo !== null &&
      Number.isFinite(anticipo) &&
      anticipo > 0
        ? anticipo
        : null,

    requiereEvaluacion:
      raw.requiereEvaluacion ??
      raw.requiere_evaluacion,

    activo:
      typeof raw.activo === 'boolean'
        ? raw.activo
        : true,

    imagen: imagenes[0],
    imagenes,
    especialistas,
  };
}

// Identifica las diferentes estructuras
// que podría devolver el backend.
function extraerLista(respuesta: unknown): ApiServicio[] {
  if (Array.isArray(respuesta)) {
    return respuesta as ApiServicio[];
  }

  if (!respuesta || typeof respuesta !== 'object') {
    return [];
  }

  const objeto = respuesta as Record<string, unknown>;

  if (Array.isArray(objeto.data)) {
    return objeto.data as ApiServicio[];
  }

  if (Array.isArray(objeto.servicios)) {
    return objeto.servicios as ApiServicio[];
  }

  if (Array.isArray(objeto.results)) {
    return objeto.results as ApiServicio[];
  }

  if (
    objeto.data &&
    typeof objeto.data === 'object'
  ) {
    const data = objeto.data as Record<string, unknown>;

    if (Array.isArray(data.servicios)) {
      return data.servicios as ApiServicio[];
    }

    if (Array.isArray(data.data)) {
      return data.data as ApiServicio[];
    }

    if (Array.isArray(data.results)) {
      return data.results as ApiServicio[];
    }
  }

  console.warn(
    '[MIRU] Formato de servicios no reconocido:',
    Object.keys(objeto)
  );

  return [];
}

// Obtiene servicios desde la API
export async function obtenerServicios(): Promise<Servicio[]> {
  try {
    console.log('[MIRU] Solicitando servicios...');

    const respuesta = await apiGet<unknown>(
      '/api/servicios'
    );

    console.log(
      '[MIRU] Respuesta de servicios:',
      JSON.stringify(respuesta, null, 2)
    );

    const lista = extraerLista(respuesta);

    console.log(
      '[MIRU] Servicios recibidos:',
      lista.length
    );

    const normalizados = lista.map(normalizarServicio);

    const activos = normalizados.filter(
      (servicio) => servicio.activo !== false
    );

    console.log(
      '[MIRU] Servicios activos:',
      activos.length
    );

    return activos;
  } catch (error) {
    console.error(
      '[MIRU] Error al obtener servicios:',
      error
    );

    throw error;
  }
}
