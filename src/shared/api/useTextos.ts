import { useCallback, useSyncExternalStore } from 'react';

import { obtenerConfiguracion, suscribir } from './configuracionPublica';
import { obtenerTexto, type ClaveTextoSitio, type ContextoTexto } from './textosSitio';

/** Devuelve el texto de una clave ya llenado con sus variables (ver obtenerTexto). */
export type FuncionTexto = (clave: ClaveTextoSitio, contexto?: ContextoTexto) => string;

/**
 * Textos del sitio para las pantallas (patrón Observer): la función `texto` es la misma mientras no
 * cambie la configuración y cambia (volviendo a pintar) cuando el repositorio recibe una versión
 * nueva. Se suscribe directo al repositorio, sin el oyente de AppState de useConfiguracionPublica.
 */
export function useTextos(): FuncionTexto {
  const configuracion = useSyncExternalStore(suscribir, obtenerConfiguracion, obtenerConfiguracion);
  return useCallback<FuncionTexto>((clave, contexto) => obtenerTexto(clave, contexto, configuracion), [configuracion]);
}
