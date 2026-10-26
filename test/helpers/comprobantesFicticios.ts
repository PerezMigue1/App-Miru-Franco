/// <reference types="jest" />

import { respuesta, type Manejador } from './servidorSimulado';

/**
 * GP-09, Bloque A: datos ficticios de los comprobantes de compra con la forma del backend
 * (backend-miru src/comprobantes: GET /api/comprobantes/mio y GET /api/comprobantes/mios). Ningún dato
 * es real: salón, clienta, folios y referencias son inventados.
 */

export type TipoFicticio = 'pedido' | 'cita' | 'venta';

/** "GET /api/comprobantes/mio?tipo=pedido&id=7", como la clave del servidor simulado. */
export const rutaMio = (tipo: TipoFicticio, id: number) => `GET /api/comprobantes/mio?tipo=${tipo}&id=${id}`;
/** "GET /api/comprobantes/mios?tipo=pedido&id=7". */
export const rutaMios = (tipo: TipoFicticio, id: number) => `GET /api/comprobantes/mios?tipo=${tipo}&id=${id}`;

/** Salón ficticio del ticket. */
export const SALON_COMPROBANTE = {
  nombre: 'Salón Ficticio',
  direccion: 'Calle Inventada 123',
  ciudad: 'Ciudad Ficticia',
  codigoPostal: '43000',
  telefono: '+52 000 000 0000',
  correoContacto: 'contacto@ejemplo.test',
};

/** Leyendas ya llenas, como las manda el backend. */
export const LEYENDAS_COMPROBANTE = {
  iva: 'Todos los precios incluyen IVA.',
  cambios: 'Cambios de producto: dentro de 7 días naturales después de recogerlo, con este comprobante.',
  noEsFactura: 'Este comprobante no es una factura.',
  factura: 'Si necesitas factura, pídela en el salón dentro del mes de tu compra.',
};

/** Concepto con el nombre más largo que se prueba (que se parta, nunca se corte). */
export const CONCEPTO_LARGO =
  'Tratamiento capilar reconstructor de keratina con aceite de argán y sellado térmico para cabello largo';

/**
 * Comprobante completo de una venta del salón: dos líneas (una con descuento), descuento total,
 * anticipo ya pagado, quién atendió, referencia y enviado por correo. `parcial` reemplaza campos.
 */
export function comprobanteCompleto(parcial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    folio: 'V-00045',
    tipo: 'venta',
    compra: 'Venta V-00045',
    fecha: '2026-10-19T16:30:00.000Z',
    fechaTexto: '19 de octubre de 2026, 10:30',
    salon: SALON_COMPROBANTE,
    clienta: 'Clienta Ficticia',
    atendio: 'Especialista Ficticia',
    lineas: [
      { descripcion: CONCEPTO_LARGO, cantidad: 1, precioUnitario: 1200, descuento: 200, importe: 1000 },
      { descripcion: 'Shampoo ficticio', cantidad: 2, precioUnitario: 149.5, descuento: 0, importe: 299 },
    ],
    subtotal: 1499,
    descuento: 200,
    anticipoAplicado: 300,
    total: 999,
    metodoPago: 'Tarjeta (terminal del salón)',
    referencia: 'REF-FICTICIA-1',
    leyendas: LEYENDAS_COMPROBANTE,
    envio: { estado: 'enviado', enviadoEn: '2026-10-19T16:31:00.000Z', envios: 1 },
    ...parcial,
  };
}

/** Comprobante mínimo del pago de un pedido: una línea, sin descuentos, sin atendió ni referencia, sin envío. */
export function comprobanteMinimo(parcial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    folio: 'P-000010',
    tipo: 'pedido',
    compra: 'Pedido #7',
    fecha: '2026-10-19T16:30:00.000Z',
    fechaTexto: '19 de octubre de 2026, 10:30',
    salon: { nombre: 'Salón Ficticio' },
    clienta: 'Clienta Ficticia',
    atendio: null,
    lineas: [{ descripcion: 'Acondicionador ficticio', cantidad: 1, precioUnitario: 450, descuento: 0, importe: 450 }],
    subtotal: 450,
    descuento: 0,
    anticipoAplicado: 0,
    total: 450,
    metodoPago: 'Mercado Pago',
    referencia: null,
    leyendas: { iva: 'Todos los precios incluyen IVA.' },
    envio: null,
    ...parcial,
  };
}

/** 200 de GET /api/comprobantes/mio. */
export const respuestaMio = (data: unknown) => respuesta({ success: true, data });

/** Un elemento de GET /api/comprobantes/mios. */
export function compraCruda(tipo: TipoFicticio, id: number, etiqueta: string, parcial: Record<string, unknown> = {}) {
  return { tipo, id, etiqueta, folio: 'P-000010', total: 450, fecha: '2026-10-19T16:30:00.000Z', ...parcial };
}

/** 200 de GET /api/comprobantes/mios con esa lista. */
export const respuestaMios = (data: unknown[]) => respuesta({ success: true, data });

/** Manejador de /mios con esa lista. */
export const conMios = (...compras: Record<string, unknown>[]): Manejador => () => respuestaMios(compras);
