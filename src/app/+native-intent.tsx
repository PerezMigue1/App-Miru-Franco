import { REDIRECCION_GOOGLE } from '@/features/auth/models/googleAuth';
import { REDIRECCION_ANTICIPO, RETORNO_MERCADO_PAGO } from '@/features/citas/models/citaModel';

/**
 * El regreso de Google (appmirufranco://auth/callback) lo atiende openAuthSessionAsync con su
 * propio listener de Linking; Expo Router no debe navegar con él (sería "Unmatched route").
 * Con la app abierta se ignora (null: no hay navegación). En arranque en frío la sesión de Google
 * ya se perdió con el proceso: la app abre en la raíz como siempre.
 * El regreso de Mercado Pago (appmirufranco://anticipo/<id>?retorno=mp) con la app abierta lo
 * atiende openAuthSessionAsync en la pantalla de anticipo ya abierta, sin abrir otra encima. En
 * arranque en frío (Android cerró la app mientras la clienta pagaba) abre /anticipo/<id>?retorno=mp,
 * que consulta el estado del pago; sin sesión, el guard de la ruta la saca como a cualquier otra.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    const regresoAnticipo =
      path.startsWith(`${REDIRECCION_ANTICIPO}/`) && path.includes(RETORNO_MERCADO_PAGO);
    if (!path.startsWith(REDIRECCION_GOOGLE) && !regresoAnticipo) {
      return path;
    }
    if (!initial) {
      return null;
    }
    if (regresoAnticipo) {
      // Solo un id numérico: cualquier otra cosa abre la raíz.
      const citaId = /^(\d+)(?:[/?#]|$)/.exec(path.slice(REDIRECCION_ANTICIPO.length + 1))?.[1];
      if (citaId) {
        return `/anticipo/${citaId}?${RETORNO_MERCADO_PAGO}`;
      }
    }
    return '/';
  } catch {
    // Un error aquí cerraría la app: se abre la raíz.
    return '/';
  }
}
