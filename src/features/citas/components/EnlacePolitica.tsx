import { FileText } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import { espacio, fuente, icono, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface EnlacePoliticaProps {
  /** "Leer la Política de anticipos y cancelación" (anticipos.enlacePolitica del catálogo). */
  texto: string;
  onPress: () => void;
}

/**
 * Enlace al visor de la Política de anticipos y cancelación (detalle, cancelar, reprogramar y
 * anticipo): texto subrayado en el color de enlace con su ícono, rol link y 48dp de alto táctil. Se
 * hunde al presionarlo con la respuesta compartida de usePresion (con movimiento reducido, opacidad).
 */
export function EnlacePolitica({ texto, onPress }: EnlacePoliticaProps) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint="Abre la política en la app"
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
      style={styles.area}
    >
      <Animated.View style={[styles.enlace, estilo]}>
        <FileText color={colores.enlace} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        <Text style={[styles.texto, { color: colores.enlace }]}>{texto}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  area: {
    alignSelf: 'flex-start',
  },
  enlace: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
  },
  texto: {
    flexShrink: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    textDecorationLine: 'underline',
  },
});
