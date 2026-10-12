import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from './Button';
import { Monograma } from './Monograma';
import { useEntradaContenido } from './movimiento';
import { espacio, fuente, tipo, tracking } from './tokens';
import { useTheme } from './useTheme';

interface EmptyStateProps {
  titulo: string;
  mensaje: string;
  accion?: { titulo: string; onPress: () => void };
}

/**
 * Estado vacío o de error: monograma, mensaje honesto y, si existe, una acción real. Aparece con
 * un fundido corto en lugar de saltar en lugar del contenido.
 */
export function EmptyState({ titulo, mensaje, accion }: EmptyStateProps) {
  const { colores } = useTheme();
  const entrada = useEntradaContenido();
  return (
    <Animated.View entering={entrada} style={styles.contenedor}>
      <Monograma tamano="mediano" />
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
        {titulo}
      </Text>
      <Text style={[styles.mensaje, { color: colores.textoSuave }]}>{mensaje}</Text>
      {accion ? (
        <View style={styles.accion}>
          <Button titulo={accion.titulo} onPress={accion.onPress} variante="secundario" />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    alignItems: 'center',
    paddingVertical: espacio.x3,
    gap: espacio.m,
  },
  titulo: {
    marginTop: espacio.s,
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
    textAlign: 'center',
  },
  mensaje: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    textAlign: 'center',
  },
  accion: {
    marginTop: espacio.s,
  },
});
