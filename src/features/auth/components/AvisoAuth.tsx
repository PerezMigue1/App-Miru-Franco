import { CircleAlert, CircleCheck } from 'lucide-react-native';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useEntradaContenido } from '@/shared/ui/movimiento';
import { borde, espacio, fuente, icono, radio, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

/**
 * Mensaje de error o de éxito de un formulario. La región en vivo queda siempre montada para que
 * TalkBack anuncie el texto cuando aparece; vacía, queda fuera del flujo y no suma espacio.
 */
export function Aviso({
  tipo: tipoAviso,
  texto,
  estilo,
  cortes = false,
}: {
  tipo: 'error' | 'exito';
  texto: string | null;
  /** Estilo del contenedor cuando hay mensaje (por ejemplo, márgenes). */
  estilo?: StyleProp<ViewStyle>;
  /** El error se anuncia sin interrumpir (polite), como en Reactivar. */
  cortes?: boolean;
}) {
  const { colores } = useTheme();
  const entrada = useEntradaContenido();
  const esError = tipoAviso === 'error';
  const Icono = esError ? CircleAlert : CircleCheck;
  const color = esError ? colores.peligro : colores.texto;
  return (
    <View
      collapsable={false}
      accessibilityLiveRegion={esError && !cortes ? 'assertive' : 'polite'}
      style={texto ? estilo : styles.fueraDeFlujo}
    >
      {/* El mensaje aparece en 220 ms (reducido: solo se funde) en lugar de saltar a la vista. */}
      {texto ? (
        <Animated.View
          accessible
          entering={entrada}
          style={[styles.aviso, { borderColor: esError ? colores.peligro : colores.hairline }]}
        >
          <Icono color={esError ? colores.peligro : colores.foco} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          <Text style={[styles.parrafo, styles.textoAviso, { color }]}>{texto}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
    padding: espacio.l,
    borderRadius: radio.campo,
    borderWidth: borde.hairline,
  },
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  textoAviso: {
    flex: 1,
  },
  // La región en vivo vacía queda fuera del flujo: no suma espacio.
  fueraDeFlujo: {
    position: 'absolute',
  },
});
