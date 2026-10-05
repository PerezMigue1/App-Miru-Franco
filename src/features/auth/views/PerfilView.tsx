import { useRouter } from 'expo-router';
import { CalendarDays, LogOut, Package, ShieldCheck, UserPen } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ListRow } from '@/shared/ui/ListRow';
import { Monograma } from '@/shared/ui/Monograma';
import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import { Skeleton } from '@/shared/ui/Skeleton';
import { borde, esqueleto, espacio, pantalla } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

/** Perfil: solo presentación; los datos de la clienta llegan con la sesión de GP-05. */
export default function PerfilView() {
  const { colores } = useTheme();
  const { navigate } = useRouter();
  const abrirCitas = () => navigate('/citas');

  return (
    <ScrollView
      style={{ backgroundColor: colores.fondo }}
      contentContainerStyle={styles.contenido}
    >
      <ScreenHeader titulo="Perfil" />

      {/* Nombre y correo como skeleton: sin sesión no hay datos que mostrar (GP-05). */}
      <View style={styles.identidad} accessible accessibilityLabel="Tus datos aparecerán al iniciar sesión">
        <Monograma tamano="grande" />
        <Skeleton estilo={styles.nombre} />
        <Skeleton estilo={styles.correo} />
      </View>

      <View style={[styles.grupo, { borderColor: colores.hairline }]}>
        {/* TODO(GP-05): editar datos y foto de perfil. */}
        <ListRow icono={UserPen} titulo="Editar perfil" accessibilityHint="Disponible próximamente" />
        <ListRow icono={CalendarDays} titulo="Mis citas" onPress={abrirCitas} />
        {/* TODO(GP-06): historial de pedidos de la tienda. */}
        <ListRow icono={Package} titulo="Mis pedidos" accessibilityHint="Disponible próximamente" />
        {/* TODO(GP-05): mostrar el aviso de privacidad. */}
        <ListRow icono={ShieldCheck} titulo="Aviso de privacidad" accessibilityHint="Disponible próximamente" />
      </View>

      <View style={[styles.grupo, { borderColor: colores.hairline }]}>
        {/* TODO(GP-05): cerrar sesión y borrar el token guardado. */}
        <ListRow
          icono={LogOut}
          titulo="Cerrar sesión"
          destructiva
          accessibilityHint="Disponible próximamente"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    paddingBottom: espacio.x3,
    gap: espacio.xxl,
  },
  identidad: {
    alignItems: 'center',
    gap: espacio.m,
    paddingHorizontal: pantalla.margen,
  },
  nombre: {
    width: esqueleto.anchoCorto,
    height: esqueleto.lineaGrande,
    marginTop: espacio.s,
  },
  correo: {
    width: esqueleto.anchoMedio,
    height: esqueleto.linea,
  },
  grupo: {
    borderTopWidth: borde.hairline,
    borderBottomWidth: borde.hairline,
  },
});
