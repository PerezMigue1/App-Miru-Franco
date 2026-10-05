import { useIsFocused, useRouter } from 'expo-router';
import { Bell, UserRound, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/shared/ui/EmptyState';
import { SearchBar } from '@/shared/ui/SearchBar';
import {
  borde,
  cabecera,
  espacio,
  fuente,
  icono,
  pantalla,
  radio,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

import { GaleriaEsqueleto, GaleriaTrabajo } from '../components/GaleriaTrabajo';
import { HeroFluidos } from '../components/HeroFluidos';
import type { FotoGaleria } from '../models/FotoModel';
import { useInicioViewModel, type EstadoInicio } from '../viewmodels/useInicioViewModel';

export default function InicioView() {
  const { estado, fluidos, fotos, recargar } = useInicioViewModel();
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();
  const reducido = useMovimientoReducido();
  const enfocada = useIsFocused();
  const { navigate } = useRouter();
  const refScroll = useAnimatedRef<Animated.ScrollView>();
  const desplazamiento = useScrollOffset(refScroll);
  const [altoVisible, setAltoVisible] = useState(0);
  const altoCabecera = top + cabecera.alto;

  const medir = (e: LayoutChangeEvent) => setAltoVisible(e.nativeEvent.layout.height);

  // TODO(GP-06): llevar al detalle del Fluido Di Goji en la tienda; por ahora abre la pestaña Tienda.
  const verGoji = () => navigate('/tienda');
  // TODO(GP-06): abrir la búsqueda de productos y servicios; por ahora abre la pestaña Tienda.
  const buscar = () => navigate('/tienda');
  const abrirPerfil = () => navigate('/perfil');
  const abrirNotificaciones = () => navigate('/notificaciones');

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <Animated.ScrollView
        ref={refScroll}
        onLayout={medir}
        contentContainerStyle={styles.contenido}
      >
        {altoVisible > 0 ? (
          <HeroFluidos
            fluidos={fluidos}
            cargando={estado === 'cargando'}
            desplazamiento={desplazamiento}
            altoVisible={altoVisible}
            altoCabecera={altoCabecera}
            enfocada={enfocada}
            reducido={reducido}
            onVerGoji={verGoji}
          />
        ) : null}

        <View style={styles.galeria}>
          <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
            Nuestro trabajo
          </Text>
          <ContenidoGaleria estado={estado} fotos={fotos} onReintentar={recargar} />
        </View>
      </Animated.ScrollView>

      {/* Cabecera fija con fondo propio: el contenido pasa por debajo sin chocar con la barra de estado. */}
      <View
        style={[
          styles.cabecera,
          {
            paddingTop: top + cabecera.relleno,
            backgroundColor: colores.fondo,
            borderBottomColor: colores.hairline,
          },
        ]}
      >
        <BotonIcono icono={UserRound} etiqueta="Abrir perfil" onPress={abrirPerfil} />
        <SearchBar
          texto="Buscar productos y servicios"
          accessibilityHint="Abre la tienda"
          onPress={buscar}
        />
        <BotonIcono icono={Bell} etiqueta="Abrir notificaciones" onPress={abrirNotificaciones} />
      </View>
    </View>
  );
}

function BotonIcono({
  icono: Icono,
  etiqueta,
  onPress,
}: {
  icono: LucideIcon;
  etiqueta: string;
  onPress: () => void;
}) {
  const { colores } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      onPress={onPress}
      style={({ pressed }) => [
        styles.botonIcono,
        { backgroundColor: pressed ? colores.presionado : 'transparent' },
      ]}
    >
      <Icono color={colores.texto} size={icono.tamano} strokeWidth={icono.trazo} />
    </Pressable>
  );
}

function ContenidoGaleria({
  estado,
  fotos,
  onReintentar,
}: {
  estado: EstadoInicio;
  fotos: FotoGaleria[];
  onReintentar: () => void;
}) {
  if (estado === 'cargando') {
    return <GaleriaEsqueleto />;
  }
  if (estado === 'error') {
    return (
      <EmptyState
        titulo="No pudimos cargar el inicio"
        mensaje="Revisa tu conexión a internet e inténtalo de nuevo."
        accion={{ titulo: 'Reintentar', onPress: onReintentar }}
      />
    );
  }
  return <GaleriaTrabajo fotos={fotos} />;
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  contenido: {
    paddingBottom: espacio.x5,
  },
  cabecera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    paddingHorizontal: pantalla.margen - espacio.s,
    paddingBottom: cabecera.relleno,
    borderBottomWidth: borde.hairline,
  },
  botonIcono: {
    width: toqueMinimo,
    height: toqueMinimo,
    borderRadius: radio.pastilla,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galeria: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.x5,
    gap: espacio.xl,
  },
  titulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.titulo,
  },
});
