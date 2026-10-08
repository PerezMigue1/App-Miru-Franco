import { CheckCheck } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { InvitacionSesion } from '@/features/auth/components/InvitacionSesion';
import { useAuth } from '@/features/auth/viewmodels/useAuth';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import {
  espacio,
  fuente,
  icono,
  opacidad,
  pantalla,
  tipo,
  toqueMinimo,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

/** Notificaciones: solo presentación; los avisos llegan con las notificaciones push. */
export default function NotificacionesView() {
  const { colores } = useTheme();
  const { estado } = useAuth();

  if (estado !== 'autenticado') {
    return (
      <ScrollView style={{ backgroundColor: colores.fondo }} contentContainerStyle={styles.contenido}>
        <ScreenHeader titulo="Notificaciones" />
        <InvitacionSesion
          titulo="Tus avisos en un solo lugar"
          beneficio="Inicia sesión para recibir los recordatorios de tus citas y el estado de tus pedidos."
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colores.fondo }}
      contentContainerStyle={styles.contenido}
    >
      <ScreenHeader
        titulo="Notificaciones"
        accion={
          // Deshabilitada hasta que existan avisos.
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            disabled
            style={[styles.accion, { opacity: opacidad.deshabilitado }]}
          >
            <CheckCheck color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            <Text style={[styles.textoAccion, { color: colores.texto }]}>Marcar todas como leídas</Text>
          </Pressable>
        }
      />
      <View style={styles.cuerpo}>
        <EmptyState
          titulo="Aquí verás tus avisos"
          mensaje="Los recordatorios de tus citas y el estado de tus pedidos llegarán a esta pestaña."
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    paddingBottom: espacio.x3,
  },
  cuerpo: {
    paddingHorizontal: pantalla.margen,
  },
  accion: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
  },
  textoAccion: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
