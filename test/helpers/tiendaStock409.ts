/// <reference types="jest" />

import { cuerpoError, respuestaError } from './citasFicticias';
import { limite429 } from './limitesRed';
import { respuesta, type Llamada, type Manejador } from './servidorSimulado';
import { preferenciaPedidoCruda } from './tiendaFicticia';

/**
 * GP-09, bloque B: datos ficticios del 409 de piezas agotadas (ronda 8 del backend) y del 429 al
 * pedir el pago de un pedido. Todo en http://api.test con nombres de productos inventados.
 */

/** El message del backend al crear el pedido o pedir su pago sin piezas suficientes. */
export const MENSAJE_PIEZAS_AGOTADAS = 'Ya no hay suficientes piezas de Shampoo hidratante (250ml)';

/** Mismo contrato con un nombre que dice "total" y "pendiente": no se confunde con esos 409. */
export const MENSAJE_PIEZAS_NOMBRE_ENGANOSO = 'Ya no hay suficientes piezas de Crema total pendiente (50ml)';

/** 409 técnico que menciona el stock: se reconoce como piezas agotadas, pero no se muestra. */
export const MENSAJE_STOCK_TECNICO = 'StockConflictException: stock insuficiente en presentacion 3011';

/** Textos de la app (respaldos del catálogo). */
export const TEXTOS_STOCK = {
  crearSinPiezas: 'Uno de tus productos ya no tiene piezas suficientes. Revisa tu carrito.',
  crearGenerico: 'No pudimos crear tu pedido. Intenta de nuevo en un momento.',
  pagoSinPiezas: 'Ya no hay piezas suficientes de uno de los productos de tu pedido. Revisa tu pedido en Mis pedidos.',
  pagoGenerico: 'No pudimos abrir el pago. Intenta de nuevo.',
} as const;

/** Cuerpo del 409 de piezas agotadas con ese message. */
export function cuerpoPiezasAgotadas(message: string = MENSAJE_PIEZAS_AGOTADAS) {
  return cuerpoError(409, message);
}

/** Responde el 409 de piezas agotadas. */
export function conPiezasAgotadas(message: string = MENSAJE_PIEZAS_AGOTADAS): Manejador {
  return () => respuestaError(cuerpoPiezasAgotadas(message));
}

/** Responde el 429 del límite de la preferencia (10 por minuto) con esos segundos. */
export function conLimitePago(segundos: number): Manejador {
  return () => limite429(segundos);
}

/** La preferencia de Mercado Pago que sí se crea (initPoint ficticio). */
export const preferenciaCreada: Manejador = () => respuesta(preferenciaPedidoCruda(), 201);

/** Hubo una lectura del carrito después de la primera llamada a "MÉTODO /ruta". */
export function lecturasCarritoDespuesDe(llamadas: Llamada[], metodo: string, ruta: string): number {
  const inicio = llamadas.findIndex((llamada) => llamada.metodo === metodo && llamada.ruta === ruta);
  if (inicio < 0) {
    return 0;
  }
  return llamadas.slice(inicio + 1).filter((llamada) => llamada.metodo === 'GET' && llamada.ruta === '/api/carrito').length;
}
