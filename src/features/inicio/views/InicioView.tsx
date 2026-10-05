import { useIsFocused, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';

import { EmptyState } from '@/shared/ui/EmptyState';
import { espacio, fuente, pantalla, tipo, tracking } from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

import { GaleriaEsqueleto, GaleriaTrabajo } from '../components/GaleriaTrabajo';
import { HeroFluidos } from '../components/HeroFluidos';
import type { FotoGaleria } from '../models/FotoModel';
import { useInicioViewModel, type EstadoInicio } from '../viewmodels/useInicioViewModel';

export default function InicioView() {
  const { estado, fluidos, fotos, recargar } = useInicioViewModel();
  const { colores } = useTheme();
  const reducido = useMovimientoReducido();
  const enfocada = useIsFocused();
  const { navigate } = useRouter();
  const refScroll = useAnimatedRef<Animated.ScrollView>();
  const desplazamiento = useScrollOffset(refScroll);
  const [altoVisible, setAltoVisible] = useState(0);

  const medir = (e: LayoutChangeEvent) => setAltoVisible(e.nativeEvent.layout.height);

  // TODO(GP-06): llevar al detalle del Fluido Di Goji en la tienda; por ahora abre la pestaña Tienda.
  const verGoji = () => navigate('/tienda');

  return (
    <Animated.ScrollView
      ref={refScroll}
      onLayout={medir}
      style={{ backgroundColor: colores.fondo }}
      contentContainerStyle={styles.contenido}
    >
      {altoVisible > 0 ? (
        <HeroFluidos
          fluidos={fluidos}
          cargando={estado === 'cargando'}
          desplazamiento={desplazamiento}
          altoVisible={altoVisible}
          enfocada={enfocada}
          reducido={reducido}
          onVerGoji={verGoji}
        />
      ) : null}

      <View style={styles.galeria}>
        <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
          Nuestro trabajo
        </Text>
        <ContenidoGaleria estado={estado} fotos={fotos} reducido={reducido} onReintentar={recargar} />
      </View>
    </Animated.ScrollView>
  );
}

function ContenidoGaleria({
  estado,
  fotos,
  reducido,
  onReintentar,
}: {
  estado: EstadoInicio;
  fotos: FotoGaleria[];
  reducido: boolean;
  onReintentar: () => void;
}) {
  if (estado === 'cargando') {
    return <GaleriaEsqueleto reducido={reducido} />;
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
  contenido: {
    paddingBottom: espacio.x5,
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
