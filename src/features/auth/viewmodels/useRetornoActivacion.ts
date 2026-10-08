import { useLocalSearchParams } from 'expo-router';

/** Rutas que muestran la pantalla de acceso (las dos montan AuthContainer). */
export type RutaAcceso = '/login' | '/registro';

/** Ruta de acceso a la que regresa la activación; cualquier otro valor vuelve a /login. */
export function rutaAcceso(valor: string | undefined): RutaAcceso {
  return valor === '/registro' ? '/registro' : '/login';
}

/** Regreso desde la activación (con o sin éxito): una vez por cada "vez". */
export interface RetornoActivacion {
  correo: string;
  vez: string;
}

export interface EstadoRetorno {
  /** Aviso sobre el formulario de acceso cuando la cuenta se acaba de activar. */
  aviso: string | null;
  retorno: RetornoActivacion | null;
}

/**
 * Lee lo que la activación deja en los parámetros al regresar: el correo para escribirlo en Acceso
 * y si la cuenta quedó activada.
 */
export function useRetornoActivacion(): EstadoRetorno {
  const { activada, correo, vuelta, motivo } = useLocalSearchParams<{
    activada?: string;
    correo?: string;
    vuelta?: string;
    motivo?: string;
  }>();
  let aviso: string | null = null;
  if (activada === '1') {
    aviso = 'Tu cuenta está activada. Inicia sesión.';
  } else if (motivo === 'contrasena') {
    aviso = 'Tu contraseña cambió. Inicia sesión de nuevo.';
  }
  return {
    aviso,
    retorno:
      typeof vuelta === 'string' && vuelta
        ? { correo: typeof correo === 'string' ? correo : '', vez: vuelta }
        : null,
  };
}
