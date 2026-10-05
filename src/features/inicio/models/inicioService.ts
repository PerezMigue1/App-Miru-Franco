import { apiGet } from '@/shared/api/apiClient';

/** Producto del catálogo: los campos de la interfaz Producto de la web que usa la app. */
export interface Producto {
  id: string | number;
  nombre: string;
  /** Tal como lo manda el catálogo ("1200" o "$1,200"); vacío si no hay precio. */
  precio: string;
  categoria: string;
  /** Primera URL https válida del campo imagen (texto o arreglo). */
  imagen?: string;
}

/** Servicio del salón: los campos de la interfaz Servicio de la web que usa la app. */
export interface Servicio {
  id: string | number;
  nombre: string;
  categoria?: string;
  activo?: boolean;
  /** Primera URL https válida del campo imagen (texto o arreglo). */
  imagen?: string;
}

type Crudo = Record<string, unknown>;

const PREFIJO_HTTPS = 'https://';

function esObjeto(valor: unknown): valor is Crudo {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** El backend responde con un arreglo o con { data | productos | servicios: [] }. */
function listaDe(respuesta: unknown, claves: string[]): Crudo[] {
  let lista: unknown = respuesta;
  if (esObjeto(respuesta)) {
    lista = claves.map((clave) => respuesta[clave]).find((valor) => Array.isArray(valor));
  }
  return Array.isArray(lista) ? lista.filter(esObjeto) : [];
}

function texto(valor: unknown): string {
  if (typeof valor === 'string') {
    return valor.trim();
  }
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return String(valor);
  }
  return '';
}

function idDe(crudo: Crudo): string | number {
  const id = crudo.id ?? crudo._id;
  if (typeof id === 'number' || typeof id === 'string') {
    return id;
  }
  return '';
}

function urlHttps(valor: unknown): string | undefined {
  if (typeof valor === 'string') {
    const url = valor.trim();
    return url.startsWith(PREFIJO_HTTPS) && url.length > PREFIJO_HTTPS.length ? url : undefined;
  }
  if (esObjeto(valor)) {
    // Cloudinary a veces guarda objetos { secure_url | url | src } en lugar de texto.
    return urlHttps(valor.secure_url ?? valor.url ?? valor.src);
  }
  return undefined;
}

/** El campo imagen puede ser texto o arreglo: se toma la primera URL https válida. */
function primeraImagen(...valores: unknown[]): string | undefined {
  for (const valor of valores) {
    const lista: unknown[] = Array.isArray(valor) ? valor : [valor];
    for (const elemento of lista) {
      const url = urlHttps(elemento);
      if (url) {
        return url;
      }
    }
  }
  return undefined;
}

/** Como en la web: si hay presentaciones manda el menor de sus precios. */
function precioDe(crudo: Crudo): string {
  if (Array.isArray(crudo.presentaciones)) {
    const precios = crudo.presentaciones
      .filter(esObjeto)
      .map((presentacion) => Number(texto(presentacion.precio).split('$').join('').split(',').join('')))
      .filter((numero) => Number.isFinite(numero) && numero > 0);
    if (precios.length > 0) {
      return String(Math.min(...precios));
    }
  }
  return texto(crudo.precio);
}

function normalizarProducto(crudo: Crudo): Producto {
  return {
    id: idDe(crudo),
    nombre: texto(crudo.nombre),
    precio: precioDe(crudo),
    categoria: texto(crudo.categoria),
    imagen: primeraImagen(crudo.imagen, crudo.imagenes),
  };
}

function normalizarServicio(crudo: Crudo): Servicio {
  const categoria = texto(crudo.categoria);
  return {
    id: idDe(crudo),
    nombre: texto(crudo.nombre),
    categoria: categoria || undefined,
    activo: typeof crudo.activo === 'boolean' ? crudo.activo : undefined,
    imagen: primeraImagen(crudo.imagen, crudo.imagenes),
  };
}

/** Lectura pública del catálogo: GET /api/productos. */
export function obtenerProductos(): Promise<Producto[]> {
  return apiGet<unknown>('/api/productos').then((respuesta) =>
    listaDe(respuesta, ['data', 'productos', 'producto']).map(normalizarProducto),
  );
}

/** Lectura pública de servicios: GET /api/servicios. */
export function obtenerServicios(): Promise<Servicio[]> {
  return apiGet<unknown>('/api/servicios').then((respuesta) =>
    listaDe(respuesta, ['data', 'servicios', 'servicio']).map(normalizarServicio),
  );
}
