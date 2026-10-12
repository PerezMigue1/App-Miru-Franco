import { Search } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';

import { transicionBorde, usePresion } from './movimiento';
import { borde, controles, espacio, fuente, icono, radio, tipo, toqueMinimo } from './tokens';
import { useTheme } from './useTheme';

interface SearchBarProps {
  texto: string;
  onPress?: () => void;
  accessibilityHint?: string;
}

/**
 * Barra de búsqueda visual: aún no escribe, solo lleva a donde se buscará. Tiene el aspecto de
 * .mf-campo de la web (rectángulo de radio 10, borde de 1px, sin pastilla). Al presionar, se hunde
 * como un botón y toma el foco del campo: borde de foco y halo de 3px.
 */
export function SearchBar({ texto, onPress, accessibilityHint }: SearchBarProps) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <Pressable
      // Botón y no campo: aún no se escribe aquí, solo lleva a donde se buscará.
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
      style={styles.pulsable}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.barra,
            transicionBorde,
            {
              backgroundColor: colores.campoFondo,
              borderColor: pressed ? colores.foco : colores.campoBorde,
            },
            pressed ? { boxShadow: `0 0 0 ${controles.halo}px ${colores.focoHalo}` } : null,
            estilo,
          ]}
        >
          <Search color={colores.campoPlaceholder} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          <Text numberOfLines={1} style={[styles.texto, { color: colores.campoPlaceholder }]}>
            {texto}
          </Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pulsable: {
    flex: 1,
  },
  barra: {
    flexGrow: 1,
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingHorizontal: espacio.l,
    borderRadius: radio.campo,
    borderWidth: borde.entrada,
  },
  texto: {
    flexShrink: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
