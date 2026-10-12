import { REDIRECCION_GOOGLE } from '@/features/auth/models/googleAuth';
import { REDIRECCION_ANTICIPO, RETORNO_MERCADO_PAGO } from '@/features/citas/models/citaModel';
import { REDIRECCION_PEDIDO } from '@/features/tienda/models/pedidoModel';

/** Solo un id numérico al inicio del resto de la ruta: cualquier otra cosa no se acepta. */
const ID_NUMERICO = /^(\d+)(?:[/?#]|$)/;

/** Rutas que aceptan ?pagar=1 (abre Mercado Pago solo), con o sin el esquema de la app. */
const CON_PAGO_AUTOMATICO = /^(?:appmirufranco:\/\/)?\/?(?:pedido-confirmado|anticipo)\//;

/**
 * El regreso de Google (appmirufranco://auth/callback) lo atiende openAuthSessionAsync con su
 * propio listener de Linking; Expo Router no debe navegar con él (sería "Unmatched route").
 * Con la app abierta se ignora (null: no hay navegación). En arranque en frío la sesión de Google
 * ya se perdió con el proceso: la app abre en la raíz como siempre.
 * El regreso de Mercado Pago (appmirufranco://anticipo/<id>?retorno=mp) con la app abierta lo
 * atiende openAuthSessionAsync en la pantalla de anticipo ya abierta, sin abrir otra encima. En
 * arranque en frío (Android cerró la app mientras la clienta pagaba) abre /anticipo/<id>?retorno=mp,
 * que consulta el estado del pago; sin sesión, el guard de la ruta la saca como a cualquier otra.
 * El regreso del pago de un pedido (appmirufranco://pedido/<id>?retorno=mp) se trata igual: con la
 * app abierta lo atiende la confirmación del pedido ya abierta; en arranque en frío abre
 * /pedido-confirmado/<id>?retorno=mp, que consulta el pago. Sin esto Expo Router abriría
 * /pedido/<id> (el detalle del pedido) en lugar de la confirmación.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    const regresoAnticipo =
      path.startsWith(`${REDIRECCION_ANTICIPO}/`) && path.includes(RETORNO_MERCADO_PAGO);
    const regresoPedido =
      path.startsWith(`${REDIRECCION_PEDIDO}/`) && path.includes(RETORNO_MERCADO_PAGO);
    if (!path.startsWith(REDIRECCION_GOOGLE) && !regresoAnticipo && !regresoPedido) {
      // ?pagar=1 abre Mercado Pago sin otro toque: solo lo pone la navegación interna. Un enlace
      // externo a la confirmación o al anticipo llega sin parámetros.
      return CON_PAGO_AUTOMATICO.test(path) ? path.split(/[?#]/)[0] : path;
    }
    if (!initial) {
      return null;
    }
    if (regresoAnticipo) {
      const citaId = ID_NUMERICO.exec(path.slice(REDIRECCION_ANTICIPO.length + 1))?.[1];
      if (citaId) {
        return `/anticipo/${citaId}?${RETORNO_MERCADO_PAGO}`;
      }
    }
    if (regresoPedido) {
      const pedidoId = ID_NUMERICO.exec(path.slice(REDIRECCION_PEDIDO.length + 1))?.[1];
      if (pedidoId) {
        return `/pedido-confirmado/${pedidoId}?${RETORNO_MERCADO_PAGO}`;
      }
    }
    return '/';
  } catch {
    // Un error aquí cerraría la app: se abre la raíz.
    return '/';
  }
}
