import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/shared/ui/EmptyState';
import { espacio, fuente, pantalla, tipo, tracking } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

export default function NotificacionesView() {
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colores.fondo }}
      contentContainerStyle={[styles.contenido, { paddingTop: top + espacio.xxl }]}
    >
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
        Notificaciones
      </Text>
      <EmptyState
        titulo="Tus avisos vivirán aquí"
        mensaje="Pronto recibirás en esta pestaña los recordatorios de tus citas y el estado de tus pedidos."
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
