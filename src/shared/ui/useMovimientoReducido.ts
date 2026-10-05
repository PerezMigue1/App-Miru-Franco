import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * true si el sistema pide reducir el movimiento. Arranca con el valor síncrono de Reanimated (sin
 * un cuadro animado de más) y se actualiza si la clienta cambia el ajuste con la app abierta.
 */
export function useMovimientoReducido(): boolean {
  const inicial = useReducedMotion();
  const [reducido, setReducido] = useState(inicial);

  useEffect(() => {
    let activo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((valor) => {
        if (activo) {
          setReducido(valor);
        }
      })
      .catch(() => {
        // Sin respuesta del sistema se conserva el valor inicial.
      });
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducido);
    return () => {
      activo = false;
      suscripcion.remove();
    };
  }, []);

  return reducido;
}
