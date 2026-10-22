import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import { espacio, pantalla } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { medidasSalon } from '../components/medidasSalon';
import {
  ArcoSalon,
  AvisoSinRed,
  ListaInhabiles,
  ListaValores,
  Parrafos,
  TarjetaContacto,
  TarjetaHorario,
  TituloSeccion,
} from '../components/PiezasSalon';
import { useSalonViewModel } from '../viewmodels/useSalonViewModel';

/**
 * El salón (GP-07.3): pantalla de la pila que se abre desde Perfil, con o sin sesión. Sobre nosotros,
 * contacto (llamar, WhatsApp, correo y mapa), horario de la semana y próximos días sin servicio, todo
 * desde la configuración pública; sin red, avisa y muestra lo guardado. Deslizar para actualizar
 * vuelve a pedir la configuración.
 */
export default function SalonView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const entrada = useEntradaContenido();
  const vm = useSalonViewModel();
  const { sobreNosotros, contacto, horario, inhabiles } = vm;

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo={vm.titulo} onVolver={vm.volver} />
      <ScrollView
        contentContainerStyle={[styles.contenido, { paddingBottom: bottom + espacio.x3 }]}
        refreshControl={
          <RefreshControl
            refreshing={vm.refrescando}
            onRefresh={vm.refrescar}
            colors={[colores.foco]}
            tintColor={colores.foco}
            progressBackgroundColor={colores.superficie}
          />
        }
      >
        {vm.avisoSinRed ? <AvisoSinRed texto={vm.avisoSinRed} /> : null}

        <Animated.View entering={entrada} style={styles.secciones}>
          <View style={styles.seccion}>
            <TituloSeccion titulo={sobreNosotros.titulo} />
            {sobreNosotros.imagen ? <ArcoSalon imagen={sobreNosotros.imagen} /> : null}
            <Parrafos parrafos={sobreNosotros.parrafos} />
          </View>

          {sobreNosotros.valores.length > 0 ? (
            <View style={styles.seccion}>
              <TituloSeccion titulo={sobreNosotros.valoresTitulo} />
              <ListaValores valores={sobreNosotros.valores} />
            </View>
          ) : null}

          <View style={styles.seccion}>
            <TituloSeccion titulo={contacto.titulo} />
            <Parrafos parrafos={[contacto.introduccion]} />
            {contacto.filas.length > 0 ? <TarjetaContacto filas={contacto.filas} onAbrir={vm.abrir} /> : null}
          </View>

          <View style={styles.seccion}>
            <TituloSeccion titulo={horario.titulo} />
            <TarjetaHorario dias={horario.dias} />
          </View>

          <View style={styles.seccion}>
            <TituloSeccion titulo={inhabiles.titulo} />
            <ListaInhabiles dias={inhabiles.dias} vacio={inhabiles.vacio} />
          </View>
        </Animated.View>
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
    // Margen para que la sombra de la primera tarjeta no se recorte bajo el encabezado.
    paddingTop: espacio.xs,
    gap: espacio.xxl,
  },
  secciones: {
    gap: medidasSalon.separacionSecciones,
  },
  seccion: {
    gap: espacio.l,
    paddingHorizontal: pantalla.margen,
  },
});
