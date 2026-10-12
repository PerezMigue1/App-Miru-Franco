import { useRouter } from 'expo-router';
import { CheckCheck } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { InvitacionSesion } from '@/features/auth/components/InvitacionSesion';
import { useAuth } from '@/features/auth/viewmodels/useAuth';
import { EmptyState } from '@/shared/ui/EmptyState';
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

/**
 * Notificaciones: pantalla propia encima de las pestañas (se abre con la campana de Inicio). Solo
 * presentación; los avisos llegan con las notificaciones push.
 */
export default function NotificacionesView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const router = useRouter();
  const { estado } = useAuth();

  const regresar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      // Abierta sin nada debajo (por ejemplo, desde un enlace): lleva a Inicio.
      router.dismissTo('/inicio');
    }
  };

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo="Notificaciones" onVolver={regresar} />
      <ScrollView
        style={{ backgroundColor: colores.fondo }}
        contentContainerStyle={[styles.contenido, { paddingBottom: bottom + espacio.x3 }]}
      >
        {estado !== 'autenticado' ? (
          <InvitacionSesion
            titulo="Tus avisos en un solo lugar"
            beneficio="Inicia sesión para recibir los recordatorios de tus citas y el estado de tus pedidos."
          />
        ) : (
          <View style={styles.cuerpo}>
            {/* Deshabilitada hasta que existan avisos. */}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              disabled
              style={[styles.accion, { opacity: opacidad.deshabilitado }]}
            >
              <CheckCheck color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
              <Text style={[styles.textoAccion, { color: colores.texto }]}>Marcar todas como leídas</Text>
            </Pressable>
            <EmptyState
              titulo="Aquí verás tus avisos"
              mensaje="Los recordatorios de tus citas y el estado de tus pedidos llegarán aquí."
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  contenido: {
    flexGrow: 1,
  },
  cuerpo: {
    paddingHorizontal: pantalla.margen,
  },
  accion: {
    alignSelf: 'flex-end',
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
