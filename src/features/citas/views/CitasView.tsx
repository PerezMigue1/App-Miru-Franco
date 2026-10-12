import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import { espacio, pantalla } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { ListaServicios } from '../components/ListaServicios';
import { useCatalogoServiciosViewModel } from '../viewmodels/useCatalogoServiciosViewModel';

/** Catálogo de servicios. Mis citas se abre desde Perfil. */
export default function CitasView() {
  const { colores } = useTheme();
  const catalogo = useCatalogoServiciosViewModel();

  return (
    <ScrollView
      style={{ backgroundColor: colores.fondo }}
      contentContainerStyle={styles.contenido}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader titulo="Servicios" subtitulo="Explora nuestros servicios y agenda tu cita" />
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
  catalogo: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.xxl,
  },
});
