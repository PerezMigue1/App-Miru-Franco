import { ArrowLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { espacio, fuente, icono, pantalla, radio, tipo, toqueMinimo, tracking } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

/** Encabezado de una pantalla que se abre desde Perfil: botón para volver y título en Playfair. */
export function EncabezadoVolver({ titulo, onVolver }: { titulo: string; onVolver: () => void }) {
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();
  return (
    <View style={[styles.encabezado, { paddingTop: top + espacio.l }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={onVolver}
        style={({ pressed }) => [
          styles.volver,
          { backgroundColor: pressed ? colores.presionado : 'transparent' },
        ]}
      >
        <ArrowLeft color={colores.texto} size={icono.tamano} strokeWidth={icono.trazo} />
      </Pressable>
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
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
    paddingBottom: espacio.l,
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
    letterSpacing: tracking.titulo,
  },
});
