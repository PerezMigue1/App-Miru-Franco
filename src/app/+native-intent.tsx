import { REDIRECCION_GOOGLE } from '@/features/auth/models/googleAuth';
import { REDIRECCION_ANTICIPO, RETORNO_MERCADO_PAGO } from '@/features/citas/models/citaModel';
import { REDIRECCION_PEDIDO } from '@/features/tienda/models/pedidoModel';

/** El id de un regreso de Mercado Pago: solo dígitos. */
const ID_NUMERICO = /^\d+$/;

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
function esRegresoGoogle(path: string): boolean {
  if (!path.startsWith(REDIRECCION_GOOGLE)) {
    return false;
  }
  // Exactamente la ruta de regreso: termina ahí o sigue su query o su fragmento.
  const siguiente = path.charAt(REDIRECCION_GOOGLE.length);
  return siguiente === '' || siguiente === '?' || siguiente === '#';
}

/**
 * Id del regreso de Mercado Pago si `path` es exactamente `<base>/<id numérico>?...` con
 * `retorno=mp` como uno de los parámetros de la query (no como parte de otro). Mercado Pago agrega
 * sus parámetros (collection_id, status, payment_id, preference_id...): se ignoran sin usarlos, igual
 * que el fragmento. null si no es un regreso válido.
 */
function idDeRegresoMercadoPago(path: string, base: string): string | null {
  const prefijo = `${base}/`;
  if (!path.startsWith(prefijo)) {
    return null;
  }
  const sinFragmento = path.split('#')[0];
  const inicioQuery = sinFragmento.indexOf('?');
  if (inicioQuery === -1) {
    return null;
  }
  const id = sinFragmento.slice(prefijo.length, inicioQuery);
  const parametros = sinFragmento.slice(inicioQuery + 1).split('&');
  return ID_NUMERICO.test(id) && parametros.includes(RETORNO_MERCADO_PAGO) ? id : null;
}

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    const citaId = idDeRegresoMercadoPago(path, REDIRECCION_ANTICIPO);
    const pedidoId = idDeRegresoMercadoPago(path, REDIRECCION_PEDIDO);
    if (!esRegresoGoogle(path) && citaId === null && pedidoId === null) {
      // ?pagar=1 abre Mercado Pago sin otro toque: solo lo pone la navegación interna. Un enlace
      // externo a la confirmación o al anticipo llega sin parámetros.
      return CON_PAGO_AUTOMATICO.test(path) ? path.split(/[?#]/)[0] : path;
    }
    if (!initial) {
      return null;
    }
    if (citaId !== null) {
      return `/anticipo/${citaId}?${RETORNO_MERCADO_PAGO}`;
    }
    if (pedidoId !== null) {
      return `/pedido-confirmado/${pedidoId}?${RETORNO_MERCADO_PAGO}`;
    }
    return '/';
  } catch {
    // Un error aquí cerraría la app: se abre la raíz.
    return '/';
  }
}
