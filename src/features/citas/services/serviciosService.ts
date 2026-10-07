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

  if (Array.isArray(raw.imagen)) {
    raw.imagen.forEach((imagen) => {
      const url = obtenerImagen(imagen);

      if (url) {
        imagenes.push(url);
      }
    });
  } else {
    const url = obtenerImagen(raw.imagen);

    if (url) {
      imagenes.push(url);
    }
  }

  if (Array.isArray(raw.imagenes)) {
    raw.imagenes.forEach((imagen) => {
      const url = obtenerImagen(imagen);

      if (url && !imagenes.includes(url)) {
        imagenes.push(url);
      }
    });
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
        (typeof id !== 'string' && typeof id !== 'number') ||
        typeof usuarioId !== 'string'
      ) {
        return null;
      }

      return {
        id,
        usuarioId,

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
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const precio =
    raw.precio !== undefined
      ? `$${Number(raw.precio).toFixed(2)}`
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
      anticipo &&
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

export async function obtenerServicios(): Promise<Servicio[]> {
  const respuesta = await apiGet<unknown>(
    '/api/servicios',
  );

  let lista: ApiServicio[] = [];

  if (Array.isArray(respuesta)) {
    lista = respuesta as ApiServicio[];
  } else if (
    respuesta &&
    typeof respuesta === 'object'
  ) {
    const objeto =
      respuesta as Record<string, unknown>;

    if (Array.isArray(objeto.data)) {
      lista = objeto.data as ApiServicio[];
    } else if (Array.isArray(objeto.servicios)) {
      lista = objeto.servicios as ApiServicio[];
    }
  }

  return lista
    .map(normalizarServicio)
    .filter((servicio) => servicio.activo !== false);
}