import { ArrowLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePresion } from '@/shared/ui/movimiento';
import {
  cabecera,
  espacio,
  fuente,
  icono,
  pantalla,
  radio,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

/**
 * Encabezado de las pantallas de la pila: banda de cromo carbón desde arriba (como la cabecera de la
 * web) con el botón para volver y el título en Playfair marfil. Mide lo mismo que la cabecera fija
 * de Inicio.
 */
export function EncabezadoVolver({ titulo, onVolver }: { titulo: string; onVolver: () => void }) {
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();
  const { estilo: estiloPresion, hundir, soltar } = usePresion();
  return (
    <View
      style={[
        styles.encabezado,
        { paddingTop: top + cabecera.relleno, backgroundColor: colores.panel },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={onVolver}
        onPressIn={hundir}
        onPressOut={soltar}
      >
        {/* El círculo se tiñe (blanco al 4 % sobre el carbón) y se hunde en 140 ms. */}
        {({ pressed }) => (
          <Animated.View
            style={[
              styles.volver,
              { backgroundColor: pressed ? colores.presionadoCromo : colores.transparente },
              estiloPresion,
            ]}
          >
            <ArrowLeft
              color={colores.textoSobrePanel}
              size={icono.tamano}
              strokeWidth={icono.trazo}
            />
          </Animated.View>
        )}
      </Pressable>
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.textoSobrePanel }]}>
        {titulo}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    paddingHorizontal: pantalla.margen - espacio.m,
    paddingBottom: cabecera.relleno,
    // La distancia de antes entre el encabezado y el contenido, ahora fuera de la banda (en lino).
    marginBottom: espacio.l,
  },
  volver: {
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  titulo: {
    flexShrink: 1,
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.tituloPagina,
  },
});
