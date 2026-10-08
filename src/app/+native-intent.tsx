import { REDIRECCION_GOOGLE } from '@/features/auth/models/googleAuth';

/**
 * El regreso de Google (appmirufranco://auth/callback) lo atiende openAuthSessionAsync con su
 * propio listener de Linking; Expo Router no debe navegar con él (sería "Unmatched route").
 * Con la app abierta se ignora (null: no hay navegación). En arranque en frío la sesión de Google
 * ya se perdió con el proceso: la app abre en la raíz como siempre.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    if (!path.startsWith(REDIRECCION_GOOGLE)) {
      return path;
    }
    return initial ? '/' : null;
  } catch {
    // Un error aquí cerraría la app: se abre la raíz.
    return '/';
  }
}
