/// <reference types="jest" />

import {
  crearPedido,
  crearPreferenciaPedido,
  esPiezasAgotadas,
  mensajeCrearPedido,
  mensajePreferenciaPedido,
  motivoConflictoPedido,
  pideRevisarCarrito,
} from '@/features/tienda/models/pedidoModel';
import { releerCarrito } from '@/features/tienda/viewmodels/usePiezasCarrito';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';

import { CLIENTA_CITAS, conError, errorDe, usarRelojFijo } from '../../helpers/citasFicticias';
import { RUTAS_DE_FONDO } from '../../helpers/datosClienta';
import { MENSAJE_LIMITE } from '../../helpers/limitesRed';
import { errorDelServidor } from '../../helpers/pantallasServicios';
import { respuesta, servidorConRutas, type Manejador } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import {
  CARRITO_CRUDO,
  cuerpoListaTienda,
  ERRORES_PAGO_PEDIDO,
  ERRORES_PEDIDOS,
  ID_PEDIDO,
  METODO_EN_LINEA,
  RUTA_CARRITO,
  RUTA_CREAR_PEDIDO,
  RUTA_PREFERENCIA_PEDIDO,
  rutasPedidos,
} from '../../helpers/tiendaFicticia';
import {
  conLimitePago,
  conPiezasAgotadas,
  MENSAJE_PIEZAS_AGOTADAS,
  MENSAJE_PIEZAS_NOMBRE_ENGANOSO,
  MENSAJE_STOCK_TECNICO,
  TEXTOS_STOCK,
} from '../../helpers/tiendaStock409';

/**
 * GP-09, bloque B: el 409 de piezas agotadas (ronda 8 del backend) al crear el pedido y al pedir su
 * pago. La clienta ve el message del backend tal cual solo si es la frase del contrato ("Ya no hay
 * suficientes piezas de X"); un 409 técnico o sin message cae al texto de la app. Los otros 409 (ya
 * no pendiente, vencido, total) siguen con su texto. Todo con fetch simulado en http://api.test.
 */

usarRelojFijo();

const simularServidor = servidorConRutas({ ...RUTAS_DE_FONDO, ...rutasPedidos() });

const LINEAS = [{ productoId: 301, presentacionId: 3011, cantidad: 2 }];
const crear = () => crearPedido(LINEAS, METODO_EN_LINEA);
const pagar = () => crearPreferenciaPedido(ID_PEDIDO);

/** El error real de apiClient al llamar a esa ruta con ese manejador. */
async function errorAl(ruta: string, manejador: Manejador, llamar: () => Promise<unknown>): Promise<unknown> {
  await sembrarSesion(CLIENTA_CITAS);
  simularServidor({ [ruta]: manejador });
  return errorDe(llamar());
}

/** 409 sin message: el backend solo manda el nombre HTTP. */
const sinMessage: Manejador = () => respuesta({ statusCode: 409, error: 'Conflict' }, 409);

describe('esPiezasAgotadas', () => {
  it.each<[string, unknown, boolean]>([
    ['409 del contrato', new ApiError(409, MENSAJE_PIEZAS_AGOTADAS), true],
    ['409 con nombre engañoso', new ApiError(409, MENSAJE_PIEZAS_NOMBRE_ENGANOSO), true],
    ['409 técnico que menciona el stock', new ApiError(409, MENSAJE_STOCK_TECNICO), true],
    ['409 ya no pendiente', new ApiError(409, ERRORES_PAGO_PEDIDO.noPendiente.message as string), false],
    ['409 vencido', new ApiError(409, ERRORES_PAGO_PEDIDO.vencido.message as string), false],
    ['409 total', new ApiError(409, ERRORES_PAGO_PEDIDO.total.message as string), false],
    ['400 de stock (otro camino)', new ApiError(400, MENSAJE_PIEZAS_AGOTADAS), false],
    ['un Error común con el texto', new Error(MENSAJE_PIEZAS_AGOTADAS), false],
    ['sin red', new ErrorDeRed(), false],
    ['null', null, false],
  ])('%s da %p', (_caso, error, esperado) => {
    expect(esPiezasAgotadas(error)).toBe(esperado);
  });
});

describe('crear el pedido con 409 de piezas agotadas (errores reales de apiClient)', () => {
  it.each<[string, Manejador, string, boolean]>([
    ['409 del contrato: el message tal cual', conPiezasAgotadas(), MENSAJE_PIEZAS_AGOTADAS, true],
    ['409 con nombre engañoso: el message tal cual', conPiezasAgotadas(MENSAJE_PIEZAS_NOMBRE_ENGANOSO), MENSAJE_PIEZAS_NOMBRE_ENGANOSO, true],
    ['409 técnico de stock: el texto de la app', conPiezasAgotadas(MENSAJE_STOCK_TECNICO), TEXTOS_STOCK.crearSinPiezas, true],
    ['409 sin message: el genérico de la app', sinMessage, TEXTOS_STOCK.crearGenerico, false],
    ['409 de otro conflicto: el genérico', conError(ERRORES_PEDIDOS.pedidoCambio), TEXTOS_STOCK.crearGenerico, false],
    ['400 de stock: sigue con su texto', conError(ERRORES_PEDIDOS.stockInsuficiente), TEXTOS_STOCK.crearSinPiezas, true],
  ])('%s', async (_caso, manejador, esperado, alCarrito) => {
    const error = await errorAl(RUTA_CREAR_PEDIDO, manejador, crear);
    expect(error).toBeInstanceOf(ApiError);
    expect(mensajeCrearPedido(error)).toBe(esperado);
    expect(pideRevisarCarrito(error)).toBe(alCarrito);
  });

  it('nunca muestra el texto técnico', async () => {
    const error = await errorAl(RUTA_CREAR_PEDIDO, conPiezasAgotadas(MENSAJE_STOCK_TECNICO), crear);
    expect(mensajeCrearPedido(error)).not.toMatch(/Exception|presentacion 3011/);
  });
});

describe('pedir el pago con 409 de piezas agotadas (errores reales de apiClient)', () => {
  it.each<[string, Manejador, string, ReturnType<typeof motivoConflictoPedido>]>([
    ['409 del contrato: el message tal cual', conPiezasAgotadas(), MENSAJE_PIEZAS_AGOTADAS, 'sinPiezas'],
    ['409 con nombre engañoso: no es total ni pendiente', conPiezasAgotadas(MENSAJE_PIEZAS_NOMBRE_ENGANOSO), MENSAJE_PIEZAS_NOMBRE_ENGANOSO, 'sinPiezas'],
    ['409 técnico de stock: el texto de la app', conPiezasAgotadas(MENSAJE_STOCK_TECNICO), TEXTOS_STOCK.pagoSinPiezas, 'sinPiezas'],
    ['409 sin message: el genérico de la app', sinMessage, TEXTOS_STOCK.pagoGenerico, null],
    ['409 ya no pendiente: sigue igual', conError(ERRORES_PAGO_PEDIDO.noPendiente), 'Este pedido ya no está pendiente de pago.', 'noPendiente'],
    ['409 vencido: sigue igual', conError(ERRORES_PAGO_PEDIDO.vencido), 'El plazo de 24 horas para pagar terminó y el pedido se canceló. Puedes volver a hacer tu compra.', 'vencido'],
  ])('%s', async (_caso, manejador, esperado, motivo) => {
    const error = await errorAl(RUTA_PREFERENCIA_PEDIDO, manejador, pagar);
    expect(motivoConflictoPedido(error)).toBe(motivo);
    expect(mensajePreferenciaPedido(error, { reglas: null })).toBe(esperado);
  });

  it('el 429 del límite de la preferencia muestra su message y trae los segundos', async () => {
    const error = await errorAl(RUTA_PREFERENCIA_PEDIDO, conLimitePago(12), pagar);
    expect(error).toMatchObject({ status: 429, retryAfter: 12 });
    expect(mensajePreferenciaPedido(error)).toBe(MENSAJE_LIMITE);
  });

  it('un Error común con la frase del contrato no se muestra', () => {
    expect(mensajePreferenciaPedido(new Error(MENSAJE_PIEZAS_AGOTADAS))).toBe(TEXTOS_STOCK.pagoGenerico);
    expect(mensajeCrearPedido(new Error(MENSAJE_PIEZAS_AGOTADAS))).toBe(TEXTOS_STOCK.crearGenerico);
  });

  it('un 409 técnico sin las palabras de stock sigue en el genérico', () => {
    expect(mensajePreferenciaPedido(new ApiError(409, 'Unique constraint failed'))).toBe(TEXTOS_STOCK.pagoGenerico);
  });
});

describe('releerCarrito', () => {
  it('lee el carrito con la misma lectura de la pantalla Carrito y devuelve su lista', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidor({ [RUTA_CARRITO]: () => respuesta(cuerpoListaTienda(CARRITO_CRUDO)) });
    const lista = await releerCarrito();
    expect(lista?.map((item) => item.presentacionId)).toEqual(CARRITO_CRUDO.map((item) => item.presentacionId));
    expect(llamadas.filter((llamada) => `${llamada.metodo} ${llamada.ruta}` === RUTA_CARRITO)).toHaveLength(1);
  });

  it('si la lectura falla devuelve null y no lanza', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    simularServidor({ [RUTA_CARRITO]: errorDelServidor });
    await expect(releerCarrito()).resolves.toBeNull();
  });
});
