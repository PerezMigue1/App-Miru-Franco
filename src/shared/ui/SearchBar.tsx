import { Search } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { borde, espacio, fuente, icono, radio, tipo, toqueMinimo } from './tokens';
import { useTheme } from './useTheme';

interface SearchBarProps {
  texto: string;
  onPress?: () => void;
  accessibilityHint?: string;
}

/**
 * Barra de búsqueda visual: aún no escribe (la búsqueda llega en GP-06), solo lleva a donde se
 * buscará. Al presionar, el borde toma el color de foco.
 */
export function SearchBar({ texto, onPress, accessibilityHint }: SearchBarProps) {
  const { colores } = useTheme();
  return (
    <Pressable
      // Botón y no campo: aún no se escribe aquí, solo lleva a donde se buscará.
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.barra,
        {
          backgroundColor: colores.campoFondo,
          borderColor: pressed ? colores.foco : colores.campoBorde,
        },
      ]}
    >
      <Search color={colores.campoPlaceholder} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      <Text numberOfLines={1} style={[styles.texto, { color: colores.campoPlaceholder }]}>
        {texto}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  barra: {
    flex: 1,
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingHorizontal: espacio.l,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
  },
  texto: {
    flexShrink: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
