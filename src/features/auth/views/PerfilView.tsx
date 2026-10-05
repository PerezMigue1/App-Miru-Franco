import { useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { CalendarDays, LogOut, Package, ShieldCheck, UserPen } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ListRow } from '@/shared/ui/ListRow';
import { Monograma } from '@/shared/ui/Monograma';
import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import { Skeleton } from '@/shared/ui/Skeleton';
import { borde, esqueleto, espacio, fuente, pantalla, tipo, tracking } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { urlAvisoPrivacidad } from '../models/AuthModel';
import { useAuth } from '../viewmodels/useAuth';

/** Perfil con los datos de la sesión. */
export default function PerfilView() {
  const { colores } = useTheme();
  const { navigate } = useRouter();
  const { usuario, salir } = useAuth();

  const abrirCitas = () => navigate('/citas');
  const abrirAviso = () => {
    const url = urlAvisoPrivacidad();
    if (url) {
      openBrowserAsync(url).catch(() => {
        // Sin navegador disponible no hay nada más que hacer aquí.
      });
    }
  };
  const cerrarSesion = () => {
    salir().catch(() => {
      // salir() siempre deja la app sin sesión aunque falle el aviso al servidor.
    });
  };

  return (
    <ScrollView
      style={{ backgroundColor: colores.fondo }}
      contentContainerStyle={styles.contenido}
    >
      <ScreenHeader titulo="Perfil" />

      {usuario ? (
        <View style={styles.identidad}>
          <Monograma tamano="grande" />
          <Text style={[styles.nombre, { color: colores.texto }]}>{usuario.nombre}</Text>
          <Text style={[styles.correo, { color: colores.textoSuave }]}>{usuario.email}</Text>
        </View>
      ) : (
        <View style={styles.identidad} accessible accessibilityLabel="Cargando tus datos">
          <Monograma tamano="grande" />
          <Skeleton estilo={styles.nombreEsqueleto} />
          <Skeleton estilo={styles.correoEsqueleto} />
        </View>
      )}

      <View style={[styles.grupo, { borderColor: colores.hairline }]}>
        {/* TODO: editar datos y foto de perfil (issue por asignar). */}
        <ListRow icono={UserPen} titulo="Editar perfil" accessibilityHint="Disponible próximamente" />
        <ListRow icono={CalendarDays} titulo="Mis citas" onPress={abrirCitas} />
        {/* TODO(GP-06): historial de pedidos de la tienda. */}
        <ListRow icono={Package} titulo="Mis pedidos" accessibilityHint="Disponible próximamente" />
        <ListRow
          icono={ShieldCheck}
          titulo="Aviso de privacidad"
          onPress={abrirAviso}
          accessibilityHint="Se abre en el navegador"
        />
      </View>

      <View style={[styles.grupo, { borderColor: colores.hairline }]}>
        <ListRow icono={LogOut} titulo="Cerrar sesión" destructiva onPress={cerrarSesion} />
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
    marginTop: espacio.s,
    textAlign: 'center',
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
  },
  correo: {
    textAlign: 'center',
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  nombreEsqueleto: {
    width: esqueleto.anchoCorto,
    height: esqueleto.lineaGrande,
    marginTop: espacio.s,
  },
  correoEsqueleto: {
    width: esqueleto.anchoMedio,
    height: esqueleto.linea,
  },
  grupo: {
    borderTopWidth: borde.hairline,
    borderBottomWidth: borde.hairline,
  },
});
