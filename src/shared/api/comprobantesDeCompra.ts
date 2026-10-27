import { apiGet } from './apiClient';

/**
 * Comprobantes de compra de la clienta (GP-09, backend-miru src/comprobantes). Vive en shared porque
 * lo usan la tienda (detalle del pedido), las citas (detalle de la cita), los avisos (el aviso
 * "Te enviamos tu comprobante") y la pantalla del comprobante, que no se importan entre sí.
 * - GET /api/comprobantes/mios?tipo=pedido|cita|venta&id=N (sesión): { success, data: [{ tipo, id,
 *   etiqueta, folio, total, fecha }] }; vacía si la compra no es suya. De una cita puede traer dos: el
 *   anticipo (tipo 'cita') y la venta del salón con que se cobró (tipo 'venta', con el id de la venta).
 * - La pantalla del comprobante es /comprobante?tipo=<tipo>&id=<id>, con los de un elemento de esa lista.
 */

export type TipoComprobante = 'pedido' | 'cita' | 'venta';

const TIPOS: readonly TipoComprobante[] = ['pedido', 'cita', 'venta'];

export type Objeto = Record<string, unknown>;

/** Un objeto plano (ni null ni arreglo). */
export function esObjeto(valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Texto sin espacios a los lados; null si no es texto o queda vacío. Un número no cuenta como texto. */
export function textoValido(valor: unknown): string | null {
  const limpio = typeof valor === 'string' ? valor.trim() : '';
  return limpio === '' ? null : limpio;
}

/** Número finito; null si no es número (un texto con cifras tampoco cuenta). */
export function numeroValido(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

/** El tipo de compra ('pedido', 'cita' o 'venta'), sin espacios y en minúsculas; null si no es uno de esos. */
export function tipoComprobante(valor: unknown): TipoComprobante | null {
  const limpio = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  return TIPOS.find((tipo) => tipo === limpio) ?? null;
}

/** Id entero positivo de la compra: un número o un texto de solo dígitos ('007' es 7); null si no lo es. */
export function idDeCompra(valor: unknown): number | null {
  let numero = Number.NaN;
  if (typeof valor === 'number') {
    numero = valor;
  } else if (typeof valor === 'string' && /^\d+$/.test(valor.trim())) {
    numero = Number(valor.trim());
  }
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

/** Query de una compra: 'tipo=pedido&id=7'. */
export function consultaDeCompra(tipo: TipoComprobante, id: number): string {
  return `tipo=${encodeURIComponent(tipo)}&id=${encodeURIComponent(String(id))}`;
}

/** Pantalla de la app con el comprobante de una compra: '/comprobante?tipo=pedido&id=7'. */
export function rutaComprobante(tipo: TipoComprobante, id: number): string {
  return `/comprobante?${consultaDeCompra(tipo, id)}`;
}

/** Un comprobante que la clienta puede ver de una compra (elemento de GET /api/comprobantes/mios). */
export interface CompraConComprobante {
  tipo: TipoComprobante;
  id: number;
  /** "Pedido #12", "Anticipo de la cita #8" o "Venta V-00045", como lo manda el backend. */
  etiqueta: string;
  folio: string;
  total: number | null;
  fecha: string | null;
}

/** Un elemento de la lista; null si no trae tipo, id o etiqueta válidos. */
function compraDe(crudo: unknown): CompraConComprobante | null {
  if (!esObjeto(crudo)) {
    return null;
  }
  const tipo = tipoComprobante(crudo.tipo);
  const id = idDeCompra(crudo.id);
  const etiqueta = textoValido(crudo.etiqueta);
  if (!tipo || id === null || !etiqueta) {
    return null;
  }
  return {
    tipo,
    id,
    etiqueta,
    folio: textoValido(crudo.folio) ?? '',
    total: numeroValido(crudo.total),
    fecha: textoValido(crudo.fecha),
  };
}

/**
 * Lista de { data: [...] } (o un arreglo): descarta los elementos que no sirven y los repetidos (mismo
 * tipo e id) y conserva el orden del backend. Cualquier otra forma da una lista vacía.
 */
export function normalizarComprobantesDeCompra(crudo: unknown): CompraConComprobante[] {
  const lista: unknown = esObjeto(crudo) ? crudo.data : crudo;
  if (!Array.isArray(lista)) {
    return [];
  }
  const vistos = new Set<string>();
  return lista
    .map(compraDe)
    .filter((compra): compra is CompraConComprobante => {
      if (compra === null) {
        return false;
      }
      const clave = `${compra.tipo}:${compra.id}`;
      if (vistos.has(clave)) {
        return false;
      }
      vistos.add(clave);
      return true;
    });
}

/** Comprobantes de un pedido, una cita o una venta de la clienta: GET /api/comprobantes/mios (con sesión). */
export function listarComprobantesDeCompra(tipo: TipoComprobante, id: number): Promise<CompraConComprobante[]> {
  return apiGet<unknown>(`/api/comprobantes/mios?${consultaDeCompra(tipo, id)}`).then(normalizarComprobantesDeCompra);
}
