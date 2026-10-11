import { REDIRECCION_GOOGLE } from '@/features/auth/models/googleAuth';
import { REDIRECCION_ANTICIPO, RETORNO_MERCADO_PAGO } from '@/features/citas/models/citaModel';

/**
 * El regreso de Google (appmirufranco://auth/callback) lo atiende openAuthSessionAsync con su
 * propio listener de Linking; Expo Router no debe navegar con él (sería "Unmatched route").
 * Con la app abierta se ignora (null: no hay navegación). En arranque en frío la sesión de Google
 * ya se perdió con el proceso: la app abre en la raíz como siempre.
 * El regreso de Mercado Pago (appmirufranco://anticipo/<id>?retorno=mp) sigue el mismo criterio:
 * lo atiende openAuthSessionAsync en la pantalla de anticipo ya abierta, sin abrir otra encima.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    const regresoAnticipo =
      path.startsWith(`${REDIRECCION_ANTICIPO}/`) && path.includes(RETORNO_MERCADO_PAGO);
    if (!path.startsWith(REDIRECCION_GOOGLE) && !regresoAnticipo) {
      return path;
    }
    return initial ? '/' : null;
  } catch {
    // Un error aquí cerraría la app: se abre la raíz.
    return '/';
  }
}
