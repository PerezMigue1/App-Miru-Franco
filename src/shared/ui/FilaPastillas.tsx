import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { espacio, pantalla } from './tokens';

interface FilaPastillasProps {
  children: ReactNode;
  /** Nombre del grupo para el lector de pantalla (FilaChipsDesplazable de la web). */
  accessibilityLabel?: string;
}

/**
 * Fila de pastillas de filtro con scroll horizontal, compartida por la tienda y los servicios.
 * Llega hasta el borde de la pantalla al desplazarse; el relleno conserva el margen.
 */
export function FilaPastillas({ children, accessibilityLabel = 'Filtrar por categoría' }: FilaPastillasProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel={accessibilityLabel}
      style={styles.fila}
      contentContainerStyle={styles.contenido}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fila: {
    marginHorizontal: -pantalla.margen,
    flexGrow: 0,
  },
  contenido: {
    gap: espacio.s,
    paddingHorizontal: pantalla.margen,
  },
});
