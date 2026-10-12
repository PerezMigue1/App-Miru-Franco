import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';

import { transicionSeleccion, usePresion } from '@/shared/ui/movimiento';
import { borde, espacio, fuente, pantalla, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface FiltroCategoriasProps {
  categorias: string[];
  /** Categoría elegida; null es "Todas". */
  elegida: string | null;
  onElegir: (categoria: string | null) => void;
}

/** Fila de categorías con scroll horizontal: "Todas" y las del catálogo cargado. */
export function FiltroCategorias({ categorias, elegida, onElegir }: FiltroCategoriasProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Categorías"
      style={styles.filtros}
      contentContainerStyle={styles.fila}
    >
      <Chip texto="Todas" valor={null} activo={elegida === null} onElegir={onElegir} />
      {categorias.map((categoria) => (
        <Chip
          key={categoria}
          texto={categoria}
          valor={categoria}
          activo={elegida === categoria}
          onElegir={onElegir}
        />
      ))}
    </ScrollView>
  );
}

interface ChipProps {
  texto: string;
  valor: string | null;
  activo: boolean;
  onElegir: (categoria: string | null) => void;
}

/** Filtro: se hunde al tocarlo y el relleno de selección se funde en 140 ms. */
const Chip = memo(function Chip({ texto, valor, activo, onElegir }: ChipProps) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={`Categoría ${texto}`}
      onPress={() => onElegir(valor)}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      {/* Color de selección y no de acción: en oscuro el vino casi desaparece sobre carbón. */}
      <Animated.View
        style={[
          styles.chip,
          transicionSeleccion,
          {
            backgroundColor: activo ? colores.seleccion : colores.fondo,
            borderColor: activo ? colores.seleccion : colores.campoBorde,
          },
          estilo,
        ]}
      >
        <Text style={[styles.texto, { color: activo ? colores.textoSobreSeleccion : colores.texto }]}>
          {texto}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // Los chips llegan hasta el borde de la pantalla al desplazarse; el relleno conserva el margen.
  filtros: {
    marginHorizontal: -pantalla.margen,
    flexGrow: 0,
  },
  fila: {
    gap: espacio.s,
    paddingHorizontal: pantalla.margen,
  },
  chip: {
    minHeight: toqueMinimo,
    justifyContent: 'center',
    paddingHorizontal: espacio.l,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
  },
  texto: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
