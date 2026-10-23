/// <reference types="jest" />

import { redirectSystemPath } from '@/app/+native-intent';
import { leerRetornoGoogle } from '@/features/auth/models/googleAuth';
import { REDIRECCION_ANTICIPO, RETORNO_MERCADO_PAGO } from '@/features/citas/models/citaModel';
import { REDIRECCION_PEDIDO } from '@/features/tienda/models/pedidoModel';

import { CODIGO_GOOGLE, REGRESO_GOOGLE, regresoConCodigo } from '../../helpers/google';

/**
 * GP-07.6, regresos a la app validados de forma exacta.
 * - leerRetornoGoogle (googleAuth.ts): el backend (auth.service.ts, googleLogin con codeChallenge)
 *   arma siempre `appmirufranco://auth/callback?code=<64 hex>`; solo eso se acepta. Un fragmento,
 *   aunque sea un '#' vacío, `error`, un parámetro de más o un '&' sobrante son error.
 * - redirectSystemPath (+native-intent.tsx): el regreso de Mercado Pago es exactamente
 *   `<base>/<id numérico>?...` con `retorno=mp` como parámetro propio (anticipos.util.ts del
 *   backend); los parámetros que agrega Mercado Pago se ignoran. El de Google es la ruta exacta
 *   seguida de fin, '?' o '#'. Lo que no cumple se trata como cualquier otra ruta.
 */

const enFrio = (path: string): string | null => redirectSystemPath({ path, initial: true });
const conAppAbierta = (path: string): string | null => redirectSystemPath({ path, initial: false });

/** Lo que Mercado Pago agrega a la back_url al volver (valores ficticios). */
const PARAMETROS_MP =
  'collection_id=123&collection_status=approved&payment_id=123&status=approved&external_reference=cita-15&payment_type=credit_card&merchant_order_id=9&preference_id=pref-ficticia&site_id=MLM&processing_mode=aggregator&merchant_account_id=null';

describe('leerRetornoGoogle exacto', () => {
  it.each([
    ['el regreso del backend', regresoConCodigo(), CODIGO_GOOGLE],
    ['el código codificado con %', `${REGRESO_GOOGLE}?code=%63${CODIGO_GOOGLE.slice(1)}`, CODIGO_GOOGLE],
  ])('acepta %s', (_caso, url, code) => {
    expect(leerRetornoGoogle(url)).toEqual({ tipo: 'codigo', code });
  });

  it.each([
    ['un fragmento con error', `${regresoConCodigo()}#error`],
    ['un fragmento vacío', `${regresoConCodigo()}#`],
    ['el fragmento #_=_', `${regresoConCodigo()}#_=_`],
    ['un parámetro extra antes', `${REGRESO_GOOGLE}?estado=x&code=${CODIGO_GOOGLE}`],
    ['un parámetro extra después', `${regresoConCodigo()}&estado=x`],
    ['un & al final', `${regresoConCodigo()}&`],
    ['error después del code', `${regresoConCodigo()}&error=acceso_denegado`],
    ['un code repetido', `${regresoConCodigo()}&code=${CODIGO_GOOGLE}`],
    ['un & codificado dentro del code', `${REGRESO_GOOGLE}?code=${CODIGO_GOOGLE}%26error`],
    ['la ruta con algo pegado', `${REGRESO_GOOGLE}x?code=${CODIGO_GOOGLE}`],
    ['la ruta con / antes de la query', `${REGRESO_GOOGLE}/?code=${CODIGO_GOOGLE}`],
    ['un = de más en el code', `${REGRESO_GOOGLE}?code=${CODIGO_GOOGLE}=`],
  ])('rechaza %s', (_caso, url) => {
    expect(leerRetornoGoogle(url)).toEqual({ tipo: 'error' });
  });
});

describe('regreso de Mercado Pago exacto', () => {
  it.each([
    ['anticipo', `${REDIRECCION_ANTICIPO}/15?${RETORNO_MERCADO_PAGO}`, `/anticipo/15?${RETORNO_MERCADO_PAGO}`],
    [
      'anticipo con los parámetros de Mercado Pago',
      `${REDIRECCION_ANTICIPO}/15?${RETORNO_MERCADO_PAGO}&${PARAMETROS_MP}`,
      `/anticipo/15?${RETORNO_MERCADO_PAGO}`,
    ],
    [
      'anticipo con retorno=mp al final',
      `${REDIRECCION_ANTICIPO}/15?${PARAMETROS_MP}&${RETORNO_MERCADO_PAGO}`,
      `/anticipo/15?${RETORNO_MERCADO_PAGO}`,
    ],
    [
      'pedido con los parámetros de Mercado Pago',
      `${REDIRECCION_PEDIDO}/22?${RETORNO_MERCADO_PAGO}&${PARAMETROS_MP}`,
      `/pedido-confirmado/22?${RETORNO_MERCADO_PAGO}`,
    ],
    ['pedido con fragmento tras la query', `${REDIRECCION_PEDIDO}/22?${RETORNO_MERCADO_PAGO}#x`, `/pedido-confirmado/22?${RETORNO_MERCADO_PAGO}`],
  ])('%s: con la app abierta no navega y en frío abre su pantalla', (_caso, path, esperado) => {
    expect(conAppAbierta(path)).toBeNull();
    expect(enFrio(path)).toBe(esperado);
  });

  it.each([
    ['retorno=mp dentro de otro parámetro', `${REDIRECCION_ANTICIPO}/15?xretorno=mpx`, `${REDIRECCION_ANTICIPO}/15`],
    ['retorno con otro valor', `${REDIRECCION_ANTICIPO}/15?retorno=mpx`, `${REDIRECCION_ANTICIPO}/15`],
    ['retorno=mp solo en el fragmento', `${REDIRECCION_ANTICIPO}/15#${RETORNO_MERCADO_PAGO}`, `${REDIRECCION_ANTICIPO}/15`],
    ['retorno=mp en la ruta', `${REDIRECCION_ANTICIPO}/15/${RETORNO_MERCADO_PAGO}`, `${REDIRECCION_ANTICIPO}/15/${RETORNO_MERCADO_PAGO}`],
    ['id con letras', `${REDIRECCION_ANTICIPO}/15abc?${RETORNO_MERCADO_PAGO}`, `${REDIRECCION_ANTICIPO}/15abc`],
    ['/ tras el id', `${REDIRECCION_ANTICIPO}/15/?${RETORNO_MERCADO_PAGO}`, `${REDIRECCION_ANTICIPO}/15/`],
    ['sin id', `${REDIRECCION_ANTICIPO}/?${RETORNO_MERCADO_PAGO}`, `${REDIRECCION_ANTICIPO}/`],
    ['pedido con retorno=mp en otro parámetro', `${REDIRECCION_PEDIDO}/22?a=retorno=mp`, `${REDIRECCION_PEDIDO}/22?a=retorno=mp`],
    ['otra ruta con el mismo inicio', `${REDIRECCION_ANTICIPO}x/15?${RETORNO_MERCADO_PAGO}`, `${REDIRECCION_ANTICIPO}x/15?${RETORNO_MERCADO_PAGO}`],
  ])('%s no es un regreso: se abre como cualquier otra ruta', (_caso, path, esperado) => {
    expect(conAppAbierta(path)).toBe(esperado);
    expect(enFrio(path)).toBe(esperado);
  });
});

describe('regreso de Google exacto en el arranque', () => {
  it.each([
    ['sin query', REGRESO_GOOGLE],
    ['con query', regresoConCodigo()],
    ['con fragmento', `${REGRESO_GOOGLE}#x`],
  ])('%s: con la app abierta no navega y en frío abre la raíz', (_caso, path) => {
    expect(conAppAbierta(path)).toBeNull();
    expect(enFrio(path)).toBe('/');
  });

  it.each([`${REGRESO_GOOGLE}x`, `${REGRESO_GOOGLE}x?code=${CODIGO_GOOGLE}`, `${REGRESO_GOOGLE}/extra`])(
    '%s no es el regreso de Google: pasa como cualquier otra ruta',
    (path) => {
      expect(conAppAbierta(path)).toBe(path);
      expect(enFrio(path)).toBe(path);
    },
  );
});
