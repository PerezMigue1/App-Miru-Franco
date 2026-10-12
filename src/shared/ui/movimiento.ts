import { useCallback, useMemo } from 'react';
import {
  Easing,
  FadeIn,
  Keyframe,
  ReduceMotion,
  cubicBezier,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { curva, duracion, escalaPresionado, movimiento, opacidad } from './tokens';
import { useMovimientoReducido } from './useMovimientoReducido';

/**
 * Movimiento compartido de la app (DESIGN.md sección 7). Todas las pantallas leen de aquí las
 * curvas, la respuesta al presionar y las apariciones, para que duren y se sientan igual.
 */

export const EASE_SALIDA = Easing.bezier(...curva.salida);
export const EASE_ENTRADA_SALIDA = Easing.bezier(...curva.entradaSalida);
export const EASE_HOJA = Easing.bezier(...curva.hoja);

/**
 * Transición del color de borde (foco de un campo, casilla activa): 140 ms en el hilo de UI. Es un
 * cambio de color, así que se conserva con movimiento reducido.
 */
export const transicionBorde = {
  transitionProperty: 'borderColor',
  transitionDuration: duracion.estadoCampo,
  transitionTimingFunction: cubicBezier(...curva.salida),
} as const;

/**
 * Transición del relleno y del borde de una opción al elegirla (día, horario, filtro): 140 ms.
 */
export const transicionSeleccion = {
  // Arreglo mutable: el estilo de Reanimated no acepta una tupla de solo lectura.
  transitionProperty: ['backgroundColor', 'borderColor'] as ('backgroundColor' | 'borderColor')[],
  transitionDuration: duracion.estadoCampo,
  transitionTimingFunction: cubicBezier(...curva.salida),
} as const;

const AJUSTE_PRESION = {
  duration: duracion.presionar,
  easing: EASE_SALIDA,
  // La opacidad del modo reducido también es animación: no se salta.
  reduceMotion: ReduceMotion.Never,
};

/**
 * Respuesta al presionar algo tocable (botón, tarjeta, opción): se hunde a 0.97 en 140 ms al
 * tocar y regresa al soltar. Con movimiento reducido no cambia de tamaño: baja la opacidad.
 *
 * El estilo devuelto controla `transform` y `opacity`: va en una vista sin opacidad propia (la
 * atenuación de deshabilitado se pone en la vista de afuera).
 */
export function usePresion() {
  const reducido = useMovimientoReducido();
  const presion = useSharedValue(0);

  const estilo = useAnimatedStyle(() => {
    const p = presion.get();
    return reducido
      ? { opacity: 1 - p * (1 - opacidad.presionadoReducido), transform: [{ scale: 1 }] }
      : { opacity: 1, transform: [{ scale: 1 - p * (1 - escalaPresionado) }] };
  });

  const hundir = useCallback(() => {
    presion.set(withTiming(1, AJUSTE_PRESION));
  }, [presion]);
  const soltar = useCallback(() => {
    presion.set(withTiming(0, AJUSTE_PRESION));
  }, [presion]);

  return { estilo, hundir, soltar };
}

/**
 * Aparición de contenido que la clienta estaba esperando (una lista que terminó de cargar, una
 * sección, un estado vacío): opacidad y 8px hacia arriba en 220 ms con curva de salida. Con
 * movimiento reducido, solo opacidad.
 *
 * En listas virtualizadas va en el contenedor, nunca en cada fila (las filas se reciclan y la
 * entrada se repetiría al hacer scroll). `retraso` permite escalonar bloques fijos.
 */
export function useEntradaContenido(retraso = 0) {
  const reducido = useMovimientoReducido();
  return useMemo(
    () =>
      reducido
        ? FadeIn.duration(duracion.aparecer).delay(retraso).reduceMotion(ReduceMotion.Never)
        : new Keyframe({
            0: { opacity: 0, transform: [{ translateY: movimiento.desplazamiento }] },
            100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE_SALIDA },
          })
            .duration(duracion.aparecer)
            .delay(retraso),
    [reducido, retraso],
  );
}
