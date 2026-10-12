import { ApiError, apiGet } from '@/shared/api/apiClient';
import { precioParaMostrar } from '@/features/inicio/models/FluidoModel';
import {
  esObjeto,
  idDe,
  listaDe,
  primeraImagen,
  texto,
  urlHttps,
  type Crudo,
  type Producto,
} from '@/features/inicio/models/inicioService';

/**
 * Presentación de un producto (GET /api/productos): { id, tamanio, imagenes[], precio: "380",
 * precioOriginal: "510" | null, stock, disponible, fechaCaducidad, productoId }. Los precios
 * llegan como texto y aquí se guardan en centavos para no arrastrar decimales.
 */
export interface Presentacion {
  id: number;
  /** "500ml"; vacío si no viene. */
  tamanio: string;
  /** URLs https de Cloudinary ([] si no hay). */
  imagenes: string[];
  /** Precio en centavos (0 si no es válido: no se puede comprar). */
  precioCentavos: number;
  /** Precio antes del descuento en centavos, solo si es mayor que el precio; si no, null. */
  precioOriginalCentavos: number | null;
  /** Piezas en existencia (0 si no viene). */
  stock: number;
  disponible: boolean;
}

/**
 * Producto de la tienda: el Producto de Inicio (id, nombre, precio, categoria, imagen) más lo que
 * usan el catálogo y el detalle. `precio` es el menor de las presentaciones comprables, como texto
 * ("380"), igual que en Inicio.
 */
export interface ProductoCatalogo extends Producto {
  id: number;
  marca: string;
  descripcion: string;
  descripcionLarga: string;
  /** Porcentaje de descuento entero (0 si no hay). */
  descuento: number;
  nuevo: boolean;
  crueltyFree: boolean;
  caracteristicas: string[];
  /** El backend guarda estos tres como arreglo de Postgres ('{"a","b"}'): una línea por elemento. */
  ingredientes: string[];
  modoUso: string[];
  resultado: string[];
  presentaciones: Presentacion[];
}

// ── Precios ────────────────────────────────────────────────────────────────────────────────

/** "1,200.50", "$380" o 380 a centavos; 0 si no es un precio positivo. */
export function aCentavos(valor: unknown): number {
  const numero = Number(texto(valor).split('$').join('').split(',').join(''));
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) : 0;
}

/** Centavos a "$1,200" o "$149.50" (cifras para mostrar con tabular-nums). 0 o menos: "$0". */
export function formatoPrecio(centavos: number): string {
  if (!Number.isFinite(centavos) || centavos <= 0) {
    return '$0';
  }
  return precioParaMostrar(String(centavos / 100)) ?? '$0';
}

/** "1 pieza" o "N piezas". */
export function textoPiezas(cantidad: number): string {
  return cantidad === 1 ? '1 pieza' : `${cantidad} piezas`;
}

// ── Normalizadores ─────────────────────────────────────────────────────────────────────────

function enteroPositivo(valor: unknown): number {
  const numero = Number(texto(valor));
  return Number.isInteger(numero) && numero > 0 ? numero : 0;
}

function listaDeTextos(valor: unknown): string[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  return valor.map((elemento) => texto(elemento)).filter(Boolean);
}

/**
 * Texto que puede venir como arreglo de Postgres ('{"Aplicar sobre cabello húmedo."}' o '{"a","b"}')
 * o como texto normal: una línea por elemento, sin llaves ni comillas.
 */
function lineasDe(valor: unknown): string[] {
  const crudo = texto(valor);
  if (!crudo) {
    return [];
  }
  if (!crudo.startsWith('{') || !crudo.endsWith('}')) {
    return [crudo];
  }
  return crudo
    .slice(1, -1)
    .split('","')
    .map((parte) => parte.split('"').join('').trim())
    .filter(Boolean);
}

function imagenesDe(valor: unknown): string[] {
  const lista: unknown[] = Array.isArray(valor) ? valor : [valor];
  return lista.map(urlHttps).filter((url): url is string => Boolean(url));
}

function normalizarPresentacion(crudo: Crudo): Presentacion | null {
  const id = enteroPositivo(crudo.id);
  if (id === 0) {
    return null;
  }
  const precioCentavos = aCentavos(crudo.precio);
  const original = aCentavos(crudo.precioOriginal);
  return {
    id,
    tamanio: texto(crudo.tamanio ?? crudo['tamaño']),
    imagenes: imagenesDe(crudo.imagenes ?? crudo.imagen),
    precioCentavos,
    precioOriginalCentavos: original > precioCentavos && precioCentavos > 0 ? original : null,
    stock: Math.max(0, Math.floor(Number(crudo.stock) || 0)),
    disponible: crudo.disponible === true,
  };
}

/** Se puede comprar: disponible, con existencias y con un precio real. */
export function presentacionComprable(presentacion: Presentacion): boolean {
  return presentacion.disponible && presentacion.stock > 0 && presentacion.precioCentavos > 0;
}

function normalizarProducto(crudo: Crudo): ProductoCatalogo | null {
  const id = enteroPositivo(idDe(crudo));
  const nombre = texto(crudo.nombre);
  if (id === 0 || !nombre) {
    return null;
  }
  const presentaciones = Array.isArray(crudo.presentaciones)
    ? crudo.presentaciones
        .filter(esObjeto)
        .map(normalizarPresentacion)
        .filter((presentacion): presentacion is Presentacion => presentacion !== null)
    : [];
  const comprables = presentaciones.filter(presentacionComprable);
  const conPrecio = presentaciones.filter((presentacion) => presentacion.precioCentavos > 0);
  const base = comprables.length > 0 ? comprables : conPrecio;
  const menor = base.length > 0 ? Math.min(...base.map((presentacion) => presentacion.precioCentavos)) : 0;
  const descuento = Math.round(Number(crudo.descuento) || 0);
  return {
    id,
    nombre,
    precio: menor > 0 ? String(menor / 100) : '',
    categoria: texto(crudo.categoria),
    // Foto de la tarjeta: la primera de una presentación comprable; si no, la de cualquiera.
    imagen: primeraImagen(
      ...comprables.map((presentacion) => presentacion.imagenes),
      ...presentaciones.map((presentacion) => presentacion.imagenes),
    ),
    marca: texto(crudo.marca),
    descripcion: texto(crudo.descripcion),
    descripcionLarga: texto(crudo.descripcionLarga),
    descuento: descuento > 0 && descuento < 100 ? descuento : 0,
    nuevo: crudo.nuevo === true,
    crueltyFree: crudo.crueltyFree === true,
    caracteristicas: listaDeTextos(crudo.caracteristicas),
    ingredientes: lineasDe(crudo.ingredientes),
    modoUso: lineasDe(crudo.modoUso),
    resultado: lineasDe(crudo.resultado),
    presentaciones,
  };
}

// ── Llamadas a la API (públicas) ───────────────────────────────────────────────────────────

/**
 * Catálogo completo: GET /api/productos (público). Responde { success, count, data[] }. Se
 * descartan los productos sin id o sin nombre. Los que tienen existencias van primero, como en la
 * web; el resto conserva el orden del servidor.
 */
export function obtenerCatalogo(): Promise<ProductoCatalogo[]> {
  return apiGet<unknown>('/api/productos', { publica: true }).then((respuesta) => {
    const productos = listaDe(respuesta, ['data', 'productos'])
      .map(normalizarProducto)
      .filter((producto): producto is ProductoCatalogo => producto !== null);
    return [...productos.filter((p) => !estaAgotado(p)), ...productos.filter(estaAgotado)];
  });
}

/**
 * Un producto: GET /api/productos/:id (público). Responde { success, data } o 404 "Producto no
 * encontrado". Un id no numérico daría 500 en el backend, así que se responde 404 sin llamar.
 */
export function obtenerProducto(id: string | number): Promise<ProductoCatalogo> {
  const limpio = enteroPositivo(id);
  if (limpio === 0) {
    return Promise.reject(new ApiError(404, 'Producto no encontrado'));
  }
  return apiGet<unknown>(`/api/productos/${limpio}`, { publica: true }).then((respuesta) => {
    const crudo = esObjeto(respuesta) && esObjeto(respuesta.data) ? respuesta.data : undefined;
    const producto = crudo ? normalizarProducto(crudo) : null;
    if (!producto) {
      throw new ApiError(404, 'Producto no encontrado');
    }
    return producto;
  });
}

// ── Reglas del catálogo ────────────────────────────────────────────────────────────────────

/** Ninguna presentación se puede comprar. */
export function estaAgotado(producto: ProductoCatalogo): boolean {
  return !producto.presentaciones.some(presentacionComprable);
}

/** Menor precio del producto en centavos (0 si no tiene). */
export function precioDesdeCentavos(producto: ProductoCatalogo): number {
  return aCentavos(producto.precio);
}

/** El producto tiene más de una presentación con precio distinto: se muestra "Desde $380". */
export function tienePreciosDistintos(producto: ProductoCatalogo): boolean {
  const precios = new Set(
    producto.presentaciones.filter((p) => p.precioCentavos > 0).map((p) => p.precioCentavos),
  );
  return precios.size > 1;
}

/**
 * Presentación que se elige al abrir el detalle: la primera comprable; si ninguna, la primera.
 * null si el producto no tiene presentaciones.
 */
export function presentacionInicial(producto: ProductoCatalogo): Presentacion | null {
  return producto.presentaciones.find(presentacionComprable) ?? producto.presentaciones[0] ?? null;
}

/** Categorías del catálogo cargado, sin repetir y en orden alfabético. */
export function categoriasDe(productos: ProductoCatalogo[]): string[] {
  const categorias = new Set(productos.map((producto) => producto.categoria).filter(Boolean));
  return [...categorias].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Minúsculas y sin acentos, para buscar "acondicionador" con "ACONDICIONADÓR". */
function normalizarBusqueda(valor: string): string {
  try {
    return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  } catch {
    return valor.toLowerCase().trim();
  }
}

/**
 * Filtra por categoría (null = todas) y por búsqueda en nombre, marca y categoría, como la web.
 * La búsqueda no distingue mayúsculas ni acentos.
 */
export function filtrarProductos(
  productos: ProductoCatalogo[],
  busqueda: string,
  categoria: string | null,
): ProductoCatalogo[] {
  const termino = normalizarBusqueda(busqueda);
  return productos.filter((producto) => {
    if (categoria && producto.categoria !== categoria) {
      return false;
    }
    if (!termino) {
      return true;
    }
    return normalizarBusqueda(`${producto.nombre} ${producto.marca} ${producto.categoria}`).includes(termino);
  });
}
