import { ApiError, apiGet } from '@/shared/api/apiClient';
import {
  consultaDeCompra,
  esObjeto,
  numeroValido,
  textoValido,
  tipoComprobante,
  type Objeto,
  type TipoComprobante,
} from '@/shared/api/comprobantesDeCompra';

/**
 * Comprobante de compra de la clienta (GP-09): GET /api/comprobantes/mio?tipo=pedido|cita|venta&id=N
 * (con sesión) → { success, data: DatosComprobante & { envio } }. 404 si la compra no es suya o no
 * tiene un pago aprobado. La respuesta se revisa campo por campo sin confiar en ella: las cifras
 * tienen que llegar como número y los textos como texto; si algo obligatorio no sirve, el comprobante
 * entero no sirve (nunca se pinta un ticket a medias). Las leyendas ya vienen llenas por el backend con
 * las reglas vigentes y se muestran tal cual.
 */

export interface LineaComprobante {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  /** Descuento de la línea; 0 si no hay. */
  descuento: number;
  importe: number;
}

export interface SalonComprobante {
  nombre: string;
  direccion: string;
  ciudad: string;
  codigoPostal: string;
  telefono: string;
  correoContacto: string;
}

export interface LeyendasComprobante {
  iva: string;
  cambios: string;
  noEsFactura: string;
  factura: string;
}

export interface Comprobante {
  folio: string;
  tipo: TipoComprobante;
  /** "Pedido #12", "Cita #8" o "Venta V-00045": la compra a la que pertenece. */
  compra: string;
  /** Fecha del pago ya en hora del centro de México, como la escribe el backend. */
  fechaTexto: string;
  salon: SalonComprobante;
  clienta: string;
  atendio: string | null;
  lineas: LineaComprobante[];
  subtotal: number;
  descuento: number;
  anticipoAplicado: number;
  total: number;
  metodoPago: string;
  /** Operación de Mercado Pago o referencia de caja; nunca un número de tarjeta. */
  referencia: string | null;
  leyendas: LeyendasComprobante;
  /** El backend ya lo mandó por correo (envio.estado 'enviado'). */
  enviadoPorCorreo: boolean;
}

/** La respuesta llegó, pero no tiene la forma de un comprobante. Nunca se muestra su contenido. */
export class ComprobanteInvalido extends Error {
  constructor() {
    super('La respuesta no es un comprobante.');
    this.name = 'ComprobanteInvalido';
  }
}

/** Texto opcional: '' si no viene; null si viene con otra cosa que no es texto. */
function textoOpcional(valor: unknown): string | null {
  if (valor === undefined || valor === null) {
    return '';
  }
  return typeof valor === 'string' ? valor.trim() : null;
}

/** Cifra opcional: 0 si no viene; null si viene con otra cosa que no es un número. */
function cifraOpcional(valor: unknown): number | null {
  return valor === undefined || valor === null ? 0 : numeroValido(valor);
}

function lineaDe(crudo: unknown): LineaComprobante | null {
  if (!esObjeto(crudo)) {
    return null;
  }
  const descripcion = textoValido(crudo.descripcion);
  const cantidad = numeroValido(crudo.cantidad);
  const precioUnitario = numeroValido(crudo.precioUnitario);
  const descuento = cifraOpcional(crudo.descuento);
  const importe = numeroValido(crudo.importe);
  if (!descripcion || cantidad === null || cantidad <= 0 || precioUnitario === null || descuento === null || importe === null) {
    return null;
  }
  return { descripcion, cantidad, precioUnitario, descuento, importe };
}

function salonDe(crudo: unknown): SalonComprobante | null {
  if (!esObjeto(crudo)) {
    return null;
  }
  const nombre = textoValido(crudo.nombre);
  const campos = ['direccion', 'ciudad', 'codigoPostal', 'telefono', 'correoContacto'] as const;
  const valores = campos.map((campo) => textoOpcional(crudo[campo]));
  if (!nombre || valores.includes(null)) {
    return null;
  }
  const [direccion, ciudad, codigoPostal, telefono, correoContacto] = valores as string[];
  return { nombre, direccion, ciudad, codigoPostal, telefono, correoContacto };
}

function leyendasDe(crudo: unknown): LeyendasComprobante {
  const leyendas: Objeto = esObjeto(crudo) ? crudo : {};
  return {
    iva: textoValido(leyendas.iva) ?? '',
    cambios: textoValido(leyendas.cambios) ?? '',
    noEsFactura: textoValido(leyendas.noEsFactura) ?? '',
    factura: textoValido(leyendas.factura) ?? '',
  };
}

/** Las líneas del ticket; null si no es una lista, está vacía o alguna línea no sirve. */
function lineasDe(crudo: unknown): LineaComprobante[] | null {
  if (!Array.isArray(crudo) || crudo.length === 0) {
    return null;
  }
  const lineas = crudo.map(lineaDe);
  return lineas.every((linea): linea is LineaComprobante => linea !== null) ? lineas : null;
}

/**
 * El comprobante de `data` ya revisado, o null si no sirve: sin folio, compra, fecha, clienta, método
 * de pago, salón con nombre, líneas válidas o alguna cifra que no llegó como número. El tipo, si no es
 * uno de los conocidos, es el que se pidió.
 */
export function normalizarComprobante(crudo: unknown, tipoPedido: TipoComprobante): Comprobante | null {
  if (!esObjeto(crudo)) {
    return null;
  }
  const textos = {
    folio: textoValido(crudo.folio),
    compra: textoValido(crudo.compra),
    fechaTexto: textoValido(crudo.fechaTexto),
    clienta: textoValido(crudo.clienta),
    metodoPago: textoValido(crudo.metodoPago),
  };
  const salon = salonDe(crudo.salon);
  const lineas = lineasDe(crudo.lineas);
  const subtotal = numeroValido(crudo.subtotal);
  const total = numeroValido(crudo.total);
  const descuento = cifraOpcional(crudo.descuento);
  const anticipoAplicado = cifraOpcional(crudo.anticipoAplicado);
  const cifras = [subtotal, total, descuento, anticipoAplicado];
  if (Object.values(textos).includes(null) || !salon || !lineas || cifras.includes(null)) {
    return null;
  }
  const envio = esObjeto(crudo.envio) ? crudo.envio : null;
  return {
    folio: textos.folio as string,
    tipo: tipoComprobante(crudo.tipo) ?? tipoPedido,
    compra: textos.compra as string,
    fechaTexto: textos.fechaTexto as string,
    salon,
    clienta: textos.clienta as string,
    atendio: textoValido(crudo.atendio),
    lineas,
    subtotal: subtotal as number,
    descuento: descuento as number,
    anticipoAplicado: anticipoAplicado as number,
    total: total as number,
    metodoPago: textos.metodoPago as string,
    referencia: textoValido(crudo.referencia),
    leyendas: leyendasDe(crudo.leyendas),
    enviadoPorCorreo: envio?.estado === 'enviado',
  };
}

/**
 * El comprobante de una compra de la clienta: GET /api/comprobantes/mio (con sesión). Lanza el
 * ApiError o ErrorDeRed de apiClient tal cual, y ComprobanteInvalido si la respuesta no sirve.
 */
export async function obtenerComprobante(tipo: TipoComprobante, id: number): Promise<Comprobante> {
  const respuesta = await apiGet<unknown>(`/api/comprobantes/mio?${consultaDeCompra(tipo, id)}`);
  const comprobante = normalizarComprobante(esObjeto(respuesta) ? respuesta.data : null, tipo);
  if (!comprobante) {
    throw new ComprobanteInvalido();
  }
  return comprobante;
}

/** El servidor respondió 404: la compra no es de la clienta o no tiene un pago aprobado. */
export function esComprobanteNoEncontrado(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
