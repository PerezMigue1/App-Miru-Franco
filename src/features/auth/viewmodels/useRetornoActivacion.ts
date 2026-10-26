import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { useTextos } from '@/shared/api/useTextos';

import { useAuth, type AvisoBaja } from './useAuth';

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
 * Texto del aviso tras desactivar o eliminar la cuenta: el message del backend y, al eliminar, el
 * folio (si el message no lo trae ya).
 */
export function textoAvisoBaja(aviso: AvisoBaja, folio: (folio: string) => string): string {
  if (!aviso.folio || aviso.mensaje.includes(aviso.folio)) {
    return aviso.mensaje;
  }
  return `${aviso.mensaje} ${folio(aviso.folio)}`;
}

/**
 * Lee lo que la activación deja en los parámetros al regresar: el correo para escribirlo en Acceso
 * y si la cuenta quedó activada. Tras desactivar o eliminar la cuenta, el aviso es el de la baja
 * (vive en memoria, nunca en la ruta) y se descarta al salir de Acceso.
 */
export function useRetornoActivacion(): EstadoRetorno {
  const { activada, correo, vuelta, motivo } = useLocalSearchParams<{
    activada?: string;
    correo?: string;
    vuelta?: string;
    motivo?: string;
  }>();
  const { avisoBaja, descartarAvisoBaja } = useAuth();
  const texto = useTextos();
  useEffect(() => descartarAvisoBaja, [descartarAvisoBaja]);
  let aviso: string | null = null;
  if (motivo === 'reactivada') {
    // Regreso de Reactivar: el texto es siempre el del catálogo (el del servidor no viaja en la ruta).
    // Gana al aviso de la baja: si la clienta desactiva y reactiva sin salir de Acceso, lo último es
    // que su cuenta ya está activa.
    aviso = texto('cuenta.reactivar.listo');
  } else if (avisoBaja) {
    aviso = textoAvisoBaja(avisoBaja, (folio) => texto('cuenta.app.folio', { folio }));
  } else if (activada === '1') {
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
