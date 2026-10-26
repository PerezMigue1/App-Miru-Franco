import { useSyncExternalStore } from 'react';

import { conexionLenta, suscribirConexion } from './estadoConexion';

/** true mientras alguna petición al salón lleve más de 3 s sin respuesta (ver estadoConexion.ts). */
export function useConexionLenta(): boolean {
  return useSyncExternalStore(suscribirConexion, conexionLenta, conexionLenta);
}
