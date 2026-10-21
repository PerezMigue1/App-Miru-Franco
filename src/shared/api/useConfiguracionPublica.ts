import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import {
  cacheVencida,
  cargarConLimite,
  estadoConfiguracion,
  refrescar,
  suscribir,
  TIEMPO_MAXIMO_CARGA_MS,
  type ConfiguracionPublica,
  type OrigenConfiguracion,
  type ResultadoRefresco,
} from './configuracionPublica';

export interface ConfiguracionPublicaHook {
  configuracion: ConfiguracionPublica;
  origen: OrigenConfiguracion;
  /** Vuelve a pedir la configuración a la red (por ejemplo, al deslizar para actualizar). */
  refrescar: () => Promise<ResultadoRefresco>;
}

/**
 * Configuración pública del salón para las pantallas (patrón Observer): se vuelve a pintar cuando el
 * repositorio recibe una versión nueva. Al volver la app a primer plano, refresca solo si la caché
 * ya venció.
 */
export function useConfiguracionPublica(): ConfiguracionPublicaHook {
  const { configuracion, origen } = useSyncExternalStore(suscribir, estadoConfiguracion, estadoConfiguracion);

  useEffect(() => {
    let anterior: unknown = AppState.currentState;
    const suscripcion = AppState.addEventListener('change', (siguiente) => {
      const volvio = anterior !== 'active' && siguiente === 'active';
      anterior = siguiente;
      if (volvio && cacheVencida()) {
        // refrescar nunca rechaza.
        void refrescar();
      }
    });
    return () => suscripcion.remove();
  }, []);

  return { configuracion, origen, refrescar };
}

/**
 * Carga inicial para la pantalla de carga: true cuando cargarConLimite resolvió con la red, el
 * archivo o el respaldo. cargarConLimite no rechaza y tiene límite; aun así un rechazo cuenta como
 * listo para que la app nunca se quede en el splash.
 */
export function useCargaConfiguracion(ms: number = TIEMPO_MAXIMO_CARGA_MS): boolean {
  const [lista, setLista] = useState(false);

  useEffect(() => {
    let montado = true;
    const marcarLista = () => {
      // Sin cambiar estado si la raíz ya se desmontó.
      if (montado) {
        setLista(true);
      }
    };
    cargarConLimite(ms).then(marcarLista, marcarLista);
    return () => {
      montado = false;
    };
  }, [ms]);

  return lista;
}
