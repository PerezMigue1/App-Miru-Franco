import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { curva, duracion, opacidad, radio } from './tokens';
import { useMovimientoReducido } from './useMovimientoReducido';
import { useTheme } from './useTheme';

const EASE_ENTRADA_SALIDA = Easing.bezier(...curva.entradaSalida);

interface SkeletonProps {
  /** Tamaño y forma del bloque; por defecto radio de campo. */
  estilo?: StyleProp<ViewStyle>;
}

/**
 * Bloque de carga en arena con un pulso suave de opacidad (DESIGN.md: skeleton en lugar de
 * spinners). Con movimiento reducido queda fijo. Decorativo para lectores de pantalla: el
 * contenedor que lo usa anuncia la carga.
 */
export function Skeleton({ estilo }: SkeletonProps) {
  const { colores } = useTheme();
  const reducido = useMovimientoReducido();
  const valor = useSharedValue(1);

  useEffect(() => {
    if (reducido) {
      valor.set(1);
      return undefined;
    }
    valor.set(
      withRepeat(
        withTiming(opacidad.pulsoMinimo, { duration: duracion.pulso, easing: EASE_ENTRADA_SALIDA }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(valor);
  }, [reducido, valor]);

  const animado = useAnimatedStyle(() => ({ opacity: valor.get() }));

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        { borderRadius: radio.campo, backgroundColor: colores.superficieSecundaria },
        estilo,
        animado,
      ]}
    />
  );
}
