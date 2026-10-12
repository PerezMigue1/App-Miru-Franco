import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from './useTheme';

/**
 * Franja fija del alto de la barra de estado, en el carbón del cromo: los íconos claros del sistema
 * siempre tienen carbón detrás, aunque el contenido pase por debajo al hacer scroll. No recibe toques.
 * Las hojas y el visor (Modal) se pintan en su propia ventana, encima de ella.
 */
export function FondoBarraEstado() {
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();
  if (top === 0) {
    return null;
  }
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={[styles.franja, { height: top, backgroundColor: colores.panel }]}
    />
  );
}

const styles = StyleSheet.create({
  franja: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: 'none',
  },
});
