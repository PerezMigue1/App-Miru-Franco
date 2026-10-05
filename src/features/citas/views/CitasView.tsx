import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/shared/ui/EmptyState';
import { espacio, fuente, pantalla, tipo, tracking } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

export default function CitasView() {
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colores.fondo }}
      contentContainerStyle={[styles.contenido, { paddingTop: top + espacio.xxl }]}
    >
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
        Citas
      </Text>
      <EmptyState
        titulo="Tus citas vivirán aquí"
        mensaje="Pronto podrás reservar, pagar el anticipo y consultar tus citas desde esta pestaña."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    paddingHorizontal: pantalla.margen,
    paddingBottom: espacio.x3,
  },
  titulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.titulo,
    marginBottom: espacio.xxl,
  },
});
