import { useRouter, type Href } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ListRow } from '@/shared/ui/ListRow';
import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import { espacio, pantalla } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { ListaServicios } from '../components/ListaServicios';
import { useCatalogoServiciosViewModel } from '../viewmodels/useCatalogoServiciosViewModel';

/** Catálogo de servicios con acceso a Mis citas arriba. */
export default function CitasView() {
  const { colores } = useTheme();
  const { push } = useRouter();
  const catalogo = useCatalogoServiciosViewModel();

  return (
    <ScrollView
      style={{ backgroundColor: colores.fondo }}
      contentContainerStyle={styles.contenido}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader titulo="Servicios" subtitulo="Explora nuestros servicios y agenda tu cita" />
      <View style={styles.misCitas}>
        <ListRow
          icono={CalendarDays}
          titulo="Mis citas"
          detalle="Próximas e historial"
          accessibilityHint="Abre tus próximas citas y tu historial"
          onPress={() => push('/mis-citas' as Href)}
        />
      </View>
      <View style={styles.catalogo}>
        <ListaServicios catalogo={catalogo} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    paddingBottom: espacio.x3,
  },
  misCitas: {
    paddingTop: espacio.l,
  },
  catalogo: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.xxl,
  },
});
