import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { espacio, fuente, pantalla, tipo, tracking } from './tokens';
import { useTheme } from './useTheme';

interface ScreenHeaderProps {
  titulo: string;
  /** Acción secundaria alineada a la derecha del título. */
  accion?: ReactNode;
}

/** Encabezado de pantalla: título en Playfair bajo la barra de estado y una acción opcional. */
export function ScreenHeader({ titulo, accion }: ScreenHeaderProps) {
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();
  return (
    <View style={[styles.encabezado, { paddingTop: top + espacio.xxl }]}>
      <Text
        accessibilityRole="header"
        style={[styles.titulo, { color: colores.texto }]}
      >
        {titulo}
      </Text>
      {accion ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  encabezado: {
    flexDirection: 'row',
    // Si la acción no cabe junto al título, baja a la siguiente línea en lugar de cortarse.
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacio.m,
    paddingHorizontal: pantalla.margen,
    paddingBottom: espacio.l,
  },
  titulo: {
    flexShrink: 1,
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.titulo,
  },
});
