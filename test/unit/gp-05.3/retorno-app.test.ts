/// <reference types="jest" />

import { redirectSystemPath } from '@/app/+native-intent';
import { REDIRECCION_ANTICIPO, RETORNO_MERCADO_PAGO } from '@/features/citas/models/citaModel';
import { REDIRECCION_PEDIDO } from '@/features/tienda/models/pedidoModel';

import { REGRESO_CON_ERROR, REGRESO_GOOGLE, regresoConCodigo } from '../../helpers/google';

/**
 * GP-05.3, regreso a la app: redirectSystemPath de src/app/+native-intent.tsx (caja blanca). El
 * regreso de Google no debe navegar con la app abierta (lo atiende openAuthSessionAsync) y en
 * arranque en frío abre la raíz. Además revisa que las demás rutas sigan igual: las normales pasan
 * tal cual, ?pagar=1 se quita en la confirmación del pedido y en el anticipo, y los regresos de
 * Mercado Pago van a su pantalla solo en arranque en frío y con un id numérico. Sin red ni navegador.
 */

/** Ruta que Expo Router abriría con la app abierta (initial false) o en arranque en frío (true). */
const conAppAbierta = (path: string): string | null => redirectSystemPath({ path, initial: false });
const enFrio = (path: string): string | null => redirectSystemPath({ path, initial: true });

const ANTICIPO = (resto: string): string => `${REDIRECCION_ANTICIPO}/${resto}`;
const PEDIDO = (resto: string): string => `${REDIRECCION_PEDIDO}/${resto}`;

describe('regreso de Google', () => {
  const regresos = [
    ['con código', regresoConCodigo()],
    ['con error', REGRESO_CON_ERROR],
    ['sin query', REGRESO_GOOGLE],
    ['con fragmento', `${regresoConCodigo()}#_=_`],
  ];

  it.each(regresos)('%s y la app abierta: no navega (null)', (_caso, path) => {
    expect(conAppAbierta(path)).toBeNull();
  });

  it.each(regresos)('%s en arranque en frío: abre la raíz', (_caso, path) => {
    expect(enFrio(path)).toBe('/');
  });
});

describe('rutas normales', () => {
  it.each([
    '/',
    '/inicio',
    '/servicio/3',
    '/citas?filtro=proximas',
    'appmirufranco://inicio',
    'appmirufranco://servicio/3',
    '/anticipo/5',
    '/pedido-confirmado/12',
    '/pedido/9?pagar=1',
    ANTICIPO('7'),
    PEDIDO('9'),
  ])('%s pasa igual con la app abierta y en frío', (path) => {
    expect(conAppAbierta(path)).toBe(path);
    expect(enFrio(path)).toBe(path);
  });
});

describe('?pagar=1 solo lo pone la navegación interna', () => {
  it.each([
    ['/pedido-confirmado/12?pagar=1', '/pedido-confirmado/12'],
    ['pedido-confirmado/12?pagar=1', 'pedido-confirmado/12'],
    ['appmirufranco://pedido-confirmado/12?pagar=1', 'appmirufranco://pedido-confirmado/12'],
    ['/anticipo/5?pagar=1', '/anticipo/5'],
    ['anticipo/5?pagar=1', 'anticipo/5'],
    [`${ANTICIPO('5')}?pagar=1`, ANTICIPO('5')],
    ['/anticipo/5#pagar', '/anticipo/5'],
    [`/anticipo/5?pagar=1&${RETORNO_MERCADO_PAGO}`, '/anticipo/5'],
  ])('%s se abre como %s', (path, esperado) => {
    expect(conAppAbierta(path)).toBe(esperado);
    expect(enFrio(path)).toBe(esperado);
  });
});

describe('regreso de Mercado Pago', () => {
  it.each([
    ['anticipo', ANTICIPO(`15?${RETORNO_MERCADO_PAGO}`), `/anticipo/15?${RETORNO_MERCADO_PAGO}`],
    ['anticipo con más parámetros', ANTICIPO(`15?${RETORNO_MERCADO_PAGO}&estado=x`), `/anticipo/15?${RETORNO_MERCADO_PAGO}`],
    ['pedido', PEDIDO(`22?${RETORNO_MERCADO_PAGO}`), `/pedido-confirmado/22?${RETORNO_MERCADO_PAGO}`],
  ])('%s: con la app abierta no navega y en frío abre %s', (_caso, path, esperado) => {
    expect(conAppAbierta(path)).toBeNull();
    expect(enFrio(path)).toBe(esperado);
  });

  // GP-07.6: solo `<base>/<id numérico>?...` con retorno=mp como parámetro de la query es un
  // regreso; lo demás se abre como cualquier otra ruta (el anticipo sin sus parámetros).
  it.each([
    ['anticipo con / tras el id', ANTICIPO(`15/?${RETORNO_MERCADO_PAGO}`), ANTICIPO('15/')],
    ['pedido con retorno solo en el fragmento', PEDIDO(`22#${RETORNO_MERCADO_PAGO}`), PEDIDO(`22#${RETORNO_MERCADO_PAGO}`)],
    ['anticipo sin id numérico', ANTICIPO(`abc?${RETORNO_MERCADO_PAGO}`), ANTICIPO('abc')],
    ['anticipo con id mezclado', ANTICIPO(`12abc?${RETORNO_MERCADO_PAGO}`), ANTICIPO('12abc')],
    ['anticipo sin id', ANTICIPO(`?${RETORNO_MERCADO_PAGO}`), ANTICIPO('')],
    ['pedido sin id numérico', PEDIDO(`x?${RETORNO_MERCADO_PAGO}`), PEDIDO(`x?${RETORNO_MERCADO_PAGO}`)],
  ])('%s no es un regreso: se abre como %s', (_caso, path, esperado) => {
    expect(conAppAbierta(path)).toBe(esperado);
    expect(enFrio(path)).toBe(esperado);
  });
});

describe('errores inesperados', () => {
  it.each([undefined, null, 42])('una ruta que no es texto (%p) abre la raíz sin lanzar', (valor) => {
    const path = valor as unknown as string;
    expect(redirectSystemPath({ path, initial: false })).toBe('/');
    expect(redirectSystemPath({ path, initial: true })).toBe('/');
  });
});
