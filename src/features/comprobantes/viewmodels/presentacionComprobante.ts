import type { FuncionTexto } from '@/shared/api/useTextos';

import type { Comprobante, LineaComprobante } from '../models/comprobanteModel';

/**
 * Lo que pinta el ticket del comprobante, ya con los textos del catálogo y las cifras formateadas
 * (GP-09). Igual que el ticket del correo y de la web (backend-miru ticket-comprobante.ts y
 * TicketComprobante de miru-franco-web): datos del salón, folio con la compra, fecha, atendió, cliente,
 * líneas, totales, método de pago, referencia, leyendas y despedida.
 */

/**
 * Pesos, con el mismo formato que el resto de la app (precioParaMostrar de inicio): "$1,200" si es
 * entero y "$149.50" si lleva centavos. Se redondea a centavos antes para que 149.999 no salga largo.
 */
export function montoTicket(valor: number): string {
  const centavos = Math.round(valor * 100) / 100;
  const decimales = Number.isInteger(centavos) ? 0 : 2;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(centavos);
}

/** Un monto que se resta: "-$50". */
const menos = (valor: number) => `-${montoTicket(valor)}`;

export interface LineaVisible {
  clave: string;
  descripcion: string;
  cantidad: string;
  precio: string;
  importe: string;
  /** "Descuento -$50" bajo el concepto, o null si la línea no tiene descuento. */
  descuento: string | null;
  /** Lo que lee TalkBack de la fila completa. */
  etiquetaAccesible: string;
}

export interface FilaMonto {
  clave: string;
  etiqueta: string;
  valor: string;
}

export interface DatoTicket {
  etiqueta: string;
  valor: string;
}

export interface TicketVisible {
  salon: string;
  titulo: string;
  /** Domicilio y contacto del salón, cada uno en su línea (solo los que hay). */
  datosSalon: string[];
  folio: DatoTicket;
  /** "(Pedido #12)" junto al folio, o null si el folio ya la dice. */
  compra: string | null;
  fecha: DatoTicket;
  atendio: DatoTicket | null;
  clienta: DatoTicket;
  columnas: { concepto: string; cantidad: string; precio: string; importe: string };
  /** "Conceptos del comprobante: 3", para la lista. */
  etiquetaTabla: string;
  lineas: LineaVisible[];
  /** Subtotal, descuento (si hay) y anticipo ya pagado (si hay). */
  montos: FilaMonto[];
  total: { etiqueta: string; nota: string; valor: string; etiquetaAccesible: string };
  metodoPago: DatoTicket;
  referencia: DatoTicket | null;
  leyendas: { iva: string; cambios: string; noEsFactura: string; factura: string };
  gracias: string;
  /** "También te lo enviamos por correo.", o null si no se mandó. */
  enviado: string | null;
}

/** Domicilio ("Calle, Ciudad, C.P. 43000") y contacto ("Tel. ... · correo"), como el ticket del correo. */
function datosDelSalon({ salon }: Comprobante): string[] {
  const domicilio = [salon.direccion, salon.ciudad, salon.codigoPostal ? `C.P. ${salon.codigoPostal}` : '']
    .filter(Boolean)
    .join(', ');
  const contacto = [salon.telefono ? `Tel. ${salon.telefono}` : '', salon.correoContacto].filter(Boolean).join(' · ');
  return [domicilio, contacto].filter(Boolean);
}

function lineaVisible(linea: LineaComprobante, indice: number, texto: FuncionTexto): LineaVisible {
  const cantidad = String(linea.cantidad);
  const precio = montoTicket(linea.precioUnitario);
  const importe = montoTicket(linea.importe);
  const descuento = linea.descuento > 0 ? texto('comprobante.app.descuentoLinea', { monto: menos(linea.descuento) }) : null;
  const fila = texto('comprobante.app.lineaAccesible', { descripcion: linea.descripcion, cantidad, precio, importe });
  return {
    clave: String(indice),
    descripcion: linea.descripcion,
    cantidad,
    precio,
    importe,
    descuento,
    etiquetaAccesible: descuento ? `${fila}, ${descuento}` : fila,
  };
}

function montos(comprobante: Comprobante, texto: FuncionTexto): FilaMonto[] {
  const filas: FilaMonto[] = [
    { clave: 'subtotal', etiqueta: texto('comprobante.app.subtotal'), valor: montoTicket(comprobante.subtotal) },
  ];
  if (comprobante.descuento > 0) {
    filas.push({ clave: 'descuento', etiqueta: texto('comprobante.app.descuento'), valor: menos(comprobante.descuento) });
  }
  if (comprobante.anticipoAplicado > 0) {
    filas.push({
      clave: 'anticipo',
      etiqueta: texto('comprobante.app.anticipoAplicado'),
      valor: menos(comprobante.anticipoAplicado),
    });
  }
  return filas;
}

const dato = (etiqueta: string, valor: string): DatoTicket => ({ etiqueta, valor });

/** Arma el ticket de un comprobante ya revisado por el modelo. */
export function presentarComprobante(comprobante: Comprobante, texto: FuncionTexto): TicketVisible {
  const total = montoTicket(comprobante.total);
  return {
    salon: comprobante.salon.nombre,
    titulo: texto('correos.comprobante.titulo'),
    datosSalon: datosDelSalon(comprobante),
    folio: dato(texto('comprobante.app.folio'), comprobante.folio),
    compra: comprobante.compra.includes(comprobante.folio) ? null : `(${comprobante.compra})`,
    fecha: dato(texto('comprobante.app.fecha'), texto('comprobante.app.fechaCentro', { fecha: comprobante.fechaTexto })),
    atendio: comprobante.atendio ? dato(texto('comprobante.app.atendio'), comprobante.atendio) : null,
    clienta: dato(texto('comprobante.app.clienta'), comprobante.clienta),
    columnas: {
      concepto: texto('comprobante.app.columnaConcepto'),
      cantidad: texto('comprobante.app.columnaCantidad'),
      precio: texto('comprobante.app.columnaPrecio'),
      importe: texto('comprobante.app.columnaImporte'),
    },
    etiquetaTabla: texto('comprobante.app.tablaAccesible', { numero: comprobante.lineas.length }),
    lineas: comprobante.lineas.map((linea, indice) => lineaVisible(linea, indice, texto)),
    montos: montos(comprobante, texto),
    total: {
      etiqueta: texto('comprobante.app.total'),
      nota: texto('comprobante.app.ivaIncluido'),
      valor: total,
      etiquetaAccesible: texto('comprobante.app.totalAccesible', { monto: total }),
    },
    metodoPago: dato(texto('comprobante.app.metodoPago'), comprobante.metodoPago),
    referencia: comprobante.referencia ? dato(texto('comprobante.app.referencia'), comprobante.referencia) : null,
    leyendas: comprobante.leyendas,
    gracias: `${texto('correos.comprobante.gracias')} ${comprobante.salon.nombre}`,
    enviado: comprobante.enviadoPorCorreo ? texto('comprobante.app.enviadoCorreo') : null,
  };
}
