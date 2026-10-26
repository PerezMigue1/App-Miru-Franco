import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

/**
 * Mientras la pantalla está enfocada, el Atrás de Android sale por el mismo camino que su enlace de
 * volver (Activar y Reactivar): llama a `salir` y consume la pulsación. Se suscribe de nuevo si
 * `salir` cambia y deja de escuchar al perder el foco.
 */
export function useAtrasSale(salir: () => void): void {
  useFocusEffect(
    useCallback(() => {
      const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
        salir();
        return true;
      });
      return () => suscripcion.remove();
    }, [salir]),
  );
}
