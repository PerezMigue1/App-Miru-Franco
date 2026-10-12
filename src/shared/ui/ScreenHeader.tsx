import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cabecera, espacio, fuente, pantalla, tipo, tracking } from './tokens';
import { useTheme } from './useTheme';

interface ScreenHeaderProps {
  titulo: string;
  /**
   * Acción secundaria alineada a la derecha del título. Va sobre el cromo carbón: su texto o ícono
   * debe usar colores.textoSobrePanel y su presionado colores.presionadoCromo.
   */
  accion?: ReactNode;
}

/**
 * Encabezado de pantalla: banda de cromo carbón desde arriba (como la cabecera de la web) con el
 * título en Playfair marfil y una acción opcional. Mide lo mismo que la cabecera fija de Inicio,
 * así el título no salta al cambiar de pestaña.
 */
export function ScreenHeader({ titulo, accion }: ScreenHeaderProps) {
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.encabezado,
        {
          paddingTop: top + cabecera.relleno,
          // El alto mínimo cuenta el relleno: el área segura más el alto de la cabecera de Inicio.
          minHeight: top + cabecera.alto,
          backgroundColor: colores.panel,
        },
      ]}
    >
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.textoSobrePanel }]}>
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
    // Con el alto mínimo, la línea del título queda centrada en la banda y no pegada arriba.
    alignContent: 'center',
    justifyContent: 'space-between',
    gap: espacio.m,
    paddingHorizontal: pantalla.margen,
    paddingBottom: cabecera.relleno,
    // La distancia de antes entre el encabezado y el contenido, ahora fuera de la banda (en lino).
    marginBottom: espacio.l,
  },
  titulo: {
    flexShrink: 1,
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.tituloPagina,
  },
});
