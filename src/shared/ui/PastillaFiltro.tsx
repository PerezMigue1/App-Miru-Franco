import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { cubicBezier } from 'react-native-reanimated';

import { transicionSeleccion, usePresion } from './movimiento';
import { borde, controles, curva, duracion, espacio, fuente, radio, toqueMinimo } from './tokens';
import { useTheme } from './useTheme';

interface PastillaFiltroProps {
  texto: string;
  activo: boolean;
  onPress: () => void;
  /** Nombre para el lector de pantalla; si falta, se lee el texto. */
  accessibilityLabel?: string;
}

/** El texto cambia de color al mismo ritmo que el relleno (transicionSeleccion: 140 ms). */
const transicionTexto = {
  transitionProperty: 'color',
  transitionDuration: duracion.estadoCampo,
  transitionTimingFunction: cubicBezier(...curva.salida),
} as const;

/**
 * Pastilla de filtro como Button chip/outline de la web: rectángulo de radio 10, no píldora. La
 * activa va rellena de --hover con texto blanco en los dos temas; las inactivas solo llevan contorno
 * de 1px con el texto del mismo color. Mide 36 a la vista y 48 de área táctil; al tocarla se hunde
 * a 0.97 (o baja la opacidad con movimiento reducido).
 */
export const PastillaFiltro = memo(function PastillaFiltro({
  texto,
  activo,
  onPress,
  accessibilityLabel,
}: PastillaFiltroProps) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  // La activa conserva el borde del color del relleno: no se ve y la pastilla no cambia de tamaño.
  const colorBorde = activo ? colores.chipActivo : colores.chipInactivo;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={accessibilityLabel ?? texto}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
      style={styles.area}
    >
      <Animated.View
        style={[
          styles.pastilla,
          transicionSeleccion,
          {
            backgroundColor: activo ? colores.chipActivo : colores.transparente,
            borderColor: colorBorde,
          },
          estilo,
        ]}
      >
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.texto,
            transicionTexto,
            { color: activo ? colores.textoChipActivo : colores.chipInactivo },
          ]}
        >
          {texto}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // Área táctil de 48 con la pastilla de 36 centrada en vertical.
  area: {
    minHeight: toqueMinimo,
    justifyContent: 'center',
  },
  pastilla: {
    minHeight: controles.pastillaAlto,
    justifyContent: 'center',
    paddingHorizontal: espacio.m,
    paddingVertical: controles.pastillaRellenoVertical,
    borderRadius: radio.campo,
    borderWidth: borde.hairline,
  },
  texto: {
    fontFamily: fuente.textoFuerte,
    fontSize: controles.textoPastilla.tamano,
    lineHeight: controles.textoPastilla.linea,
  },
});
