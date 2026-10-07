import { useCallback, useRef } from 'react';

/**
 * Candado inmediato contra el doble envío: el estado de carga llega un render tarde, así que dos
 * toques (o el botón y la tecla del teclado) en el mismo cuadro pasarían los dos. Mientras la
 * acción corre, las siguientes llamadas se ignoran.
 */
export function useCandado(): (accion: () => Promise<void>) => void {
  const ocupado = useRef(false);
  return useCallback((accion: () => Promise<void>) => {
    if (ocupado.current) {
      return;
    }
    ocupado.current = true;
    const ejecutar = async () => {
      try {
        await accion();
      } finally {
        ocupado.current = false;
      }
    };
    ejecutar().catch(() => {
      // Cada acción maneja y muestra sus propios errores.
    });
  }, []);
}
