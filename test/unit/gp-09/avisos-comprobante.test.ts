/// <reference types="jest" />

import { destinoDeAviso, normalizarAviso } from '@/features/notificaciones/models/avisoModel';
import { rutaComprobante } from '@/shared/api/comprobantesDeCompra';

import { avisoComprobante, enSnakeCase, ID_AVISO_COMPROBANTE, ID_COMPROBANTE } from '../../helpers/avisosFicticios';

/**
 * GP-09, Bloque C: aviso "Te enviamos tu comprobante" (tipo 'comprobante'). El backend
 * (onComprobanteEnviado en src/notificaciones/notificaciones.listener.ts) manda entidadTipo
 * 'comprobante', entidadId con el id del comprobante (no el de la compra) y urlAccion
 * '/cliente/comprobante?tipo=pedido|cita|venta&id=<id de la compra>'. La app abre su pantalla del
 * comprobante, '/comprobante?tipo=<tipo>&id=<id de la compra>', para un pedido, una cita o una venta
 * del salón. Funciones puras, sin red.
 */

const RUTA = '/cliente/comprobante';

describe('destinoDeAviso: página de comprobante', () => {
  it.each([
    ['de un pedido', `${RUTA}?tipo=pedido&id=7`, '/comprobante?tipo=pedido&id=7'],
    ['de una cita', `${RUTA}?tipo=cita&id=12`, '/comprobante?tipo=cita&id=12'],
    ['de una venta del salón', `${RUTA}?tipo=venta&id=5`, '/comprobante?tipo=venta&id=5'],
    ['con los parámetros al revés', `${RUTA}?id=12&tipo=cita`, '/comprobante?tipo=cita&id=12'],
    ['con mayúsculas y espacios', `  ${RUTA.toUpperCase()}?TIPO=Pedido&ID=007  `, '/comprobante?tipo=pedido&id=7'],
    ['absoluta con hash', `https://www.ejemplo.test${RUTA}?tipo=venta&id=7#ticket`, '/comprobante?tipo=venta&id=7'],
    ['con diagonal al final', `${RUTA}/?tipo=cita&id=3`, '/comprobante?tipo=cita&id=3'],
    ['con un parámetro de más y otro sin valor', `${RUTA}?origen=correo&vacio&tipo=pedido&id=9`, '/comprobante?tipo=pedido&id=9'],
    ['con el tipo codificado', `${RUTA}?tipo=%70edido&id=7`, '/comprobante?tipo=pedido&id=7'],
  ])('%s (%s) abre %s', (_caso, urlAccion, esperado) => {
    expect(destinoDeAviso({ urlAccion, entidadTipo: 'comprobante', entidadId: String(ID_COMPROBANTE) })).toBe(esperado);
  });

  it.each([
    ['sin query', RUTA],
    ['sin id', `${RUTA}?tipo=pedido`],
    ['sin tipo', `${RUTA}?id=7`],
    ['con id que no es entero positivo', `${RUTA}?tipo=pedido&id=0`],
    ['con id con letras', `${RUTA}?tipo=cita&id=12a`],
    ['con id negativo', `${RUTA}?tipo=venta&id=-5`],
    ['con id con decimales', `${RUTA}?tipo=venta&id=5.5`],
    ['con tipo desconocido', `${RUTA}?tipo=factura&id=7`],
    ['con un valor mal codificado', `${RUTA}?tipo=pedido&id=%E0%A4%A`],
  ])('%s no abre nada: nunca usa el id del comprobante como si fuera de la compra', (_caso, urlAccion) => {
    expect(destinoDeAviso({ urlAccion, entidadTipo: 'comprobante', entidadId: String(ID_COMPROBANTE) })).toBeNull();
  });

  it('entidadTipo comprobante sin urlAccion no abre nada', () => {
    expect(destinoDeAviso({ entidadTipo: 'comprobante', entidadId: 3 })).toBeNull();
  });

  it('si la urlAccion de comprobante no sirve pero la entidad es un pedido, usa la entidad', () => {
    expect(destinoDeAviso({ urlAccion: `${RUTA}?tipo=factura&id=5`, entidadTipo: 'pedido', entidadId: 8 })).toBe('/pedido/8');
  });

  it('una ruta del personal con el comprobante no abre nada', () => {
    expect(destinoDeAviso({ urlAccion: '/operacion/caja/comprobante?tipo=venta&id=5' })).toBeNull();
  });

  it('el destino es la misma ruta que arma rutaComprobante', () => {
    expect(destinoDeAviso({ urlAccion: `${RUTA}?tipo=venta&id=45` })).toBe(rutaComprobante('venta', 45));
  });

  it('la query de otra ruta de la clienta no cambia su destino', () => {
    expect(destinoDeAviso({ urlAccion: '/cliente/tienda-online/mis-pedidos/7?tipo=cita&id=12' })).toBe('/pedido/7');
  });
});

describe('normalizarAviso: aviso de comprobante como lo manda el backend', () => {
  it.each([
    ['pedido', 7, '/comprobante?tipo=pedido&id=7'],
    ['cita', 12, '/comprobante?tipo=cita&id=12'],
    ['venta', 5, '/comprobante?tipo=venta&id=5'],
  ] as const)('comprobante de %s %p → %p', (tipo, compraId, destino) => {
    expect(normalizarAviso(avisoComprobante(tipo, compraId))).toEqual({
      id: ID_AVISO_COMPROBANTE,
      tipo: 'comprobante',
      titulo: 'Te enviamos tu comprobante',
      mensaje: 'Enviamos a tu correo el comprobante P-000010 por $450.00.',
      fecha: '2026-10-19T16:30:00.000Z',
      leida: false,
      destino,
    });
  });

  it('en snake_case también abre el comprobante', () => {
    expect(normalizarAviso(enSnakeCase(avisoComprobante('cita', 12)))?.destino).toBe('/comprobante?tipo=cita&id=12');
  });
});
