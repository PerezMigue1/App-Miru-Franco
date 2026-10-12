import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { transicionSeleccion } from '@/shared/ui/movimiento';
import { borde, espacio, radio, tienda, tiendaCatalogo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { FotoProducto } from './FotoProducto';

interface GaleriaProductoProps {
  /** URLs de la presentación elegida (o de todo el producto). Vacío: monograma grande. */
  fotos: string[];
  /** Nombre del producto, para la etiqueta de cada foto. */
  nombre: string;
  /** Producto o presentación sin existencias: las fotos se atenúan. */
  atenuada?: boolean;
}

/**
 * Fotos del producto a todo lo ancho, cuadradas, con paso de una en una al deslizar. Los puntos de
 * abajo marcan la foto actual (el activo es una pastilla de oro, más larga que los demás). Cuando
 * cambian las fotos (otra presentación) vuelve a la primera.
 */
export function GaleriaProducto({ fotos, nombre, atenuada = false }: GaleriaProductoProps) {
  const { width } = useWindowDimensions();
  const lista = useRef<FlatList<string>>(null);
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    setIndice(0);
    lista.current?.scrollToOffset({ offset: 0, animated: false });
  }, [fotos]);

  // Se actualiza al terminar el deslizamiento, no en cada cuadro del scroll.
  const alTerminar = useCallback(
    (evento: NativeSyntheticEvent<NativeScrollEvent>) => {
      const siguiente = Math.round(evento.nativeEvent.contentOffset.x / width);
      setIndice(Math.max(0, Math.min(fotos.length - 1, siguiente)));
    },
    [width, fotos.length],
  );

  const renderFoto = useCallback<ListRenderItem<string>>(
    ({ item, index }) => (
      <FotoGaleria
        uri={item}
        ancho={width}
        etiqueta={`Foto ${index + 1} de ${fotos.length} de ${nombre}`}
        atenuada={atenuada}
      />
    ),
    [width, fotos.length, nombre, atenuada],
  );

  const obtenerLayout = useCallback(
    (_: ArrayLike<string> | null | undefined, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width],
  );

  if (fotos.length === 0) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={`${nombre}, sin foto`}>
        <FotoProducto estilo={[styles.foto, { width }]} tamanoMonograma="grande" atenuada={atenuada} />
      </View>
    );
  }

  return (
    <View>
      <FlatList
        ref={lista}
        data={fotos}
        keyExtractor={claveFoto}
        renderItem={renderFoto}
        getItemLayout={obtenerLayout}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={fotos.length > 1}
        onMomentumScrollEnd={alTerminar}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
      />
      {fotos.length > 1 ? <Puntos total={fotos.length} activo={indice} /> : null}
    </View>
  );
}

function claveFoto(uri: string, index: number): string {
  return `${index}-${uri}`;
}

const FotoGaleria = memo(function FotoGaleria({
  uri,
  ancho,
  etiqueta,
  atenuada,
}: {
  uri: string;
  ancho: number;
  etiqueta: string;
  atenuada: boolean;
}) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={etiqueta}>
      <FotoProducto uri={uri} estilo={[styles.foto, { width: ancho }]} tamanoMonograma="grande" atenuada={atenuada} />
    </View>
  );
});

/** Indicador decorativo: la posición ya la anuncia la etiqueta de cada foto ("Foto 2 de 4"). */
function Puntos({ total, activo }: { total: number; activo: number }) {
  const { colores } = useTheme();
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.puntos}>
      {Array.from({ length: total }, (_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.punto,
            transicionSeleccion,
            i === activo
              ? { width: tiendaCatalogo.puntoActivo, backgroundColor: colores.oro, borderColor: colores.oro }
              : { backgroundColor: colores.fondo, borderColor: colores.textoSuave },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  foto: {
    aspectRatio: tienda.proporcionFoto,
  },
  puntos: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: espacio.s,
    paddingTop: espacio.m,
  },
  punto: {
    width: tienda.puntoGaleria,
    height: tienda.puntoGaleria,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
  },
});
