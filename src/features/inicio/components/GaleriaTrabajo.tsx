import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EmptyState } from '@/shared/ui/EmptyState';
import { Monograma } from '@/shared/ui/Monograma';
import { Skeleton } from '@/shared/ui/Skeleton';
import { curva, duracion, escalaPresionado, galeria, radio } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { FotoGaleria } from '../models/FotoModel';
import { VisorFoto } from './VisorFoto';

const EASE_SALIDA = Easing.bezier(...curva.salida);

interface Forma {
  columna: number;
  fila: number;
  columnas: number;
  filas: number;
}

/** Bloque editorial de 7 fotos que llena exacto una cuadrícula de 4 columnas por 3 filas. */
const MOSAICO: Forma[] = [
  { columna: 0, fila: 0, columnas: 2, filas: 2 },
  { columna: 2, fila: 0, columnas: 1, filas: 2 },
  { columna: 3, fila: 0, columnas: 1, filas: 1 },
  { columna: 3, fila: 1, columnas: 1, filas: 1 },
  { columna: 0, fila: 2, columnas: 1, filas: 1 },
  { columna: 1, fila: 2, columnas: 2, filas: 1 },
  { columna: 3, fila: 2, columnas: 1, filas: 1 },
];

interface Posicion {
  left: number;
  top: number;
  width: number;
  height: number;
}

function posicionesDe(total: number, ancho: number): { lista: Posicion[]; alto: number } {
  const separacion = galeria.separacion;
  const celda = (ancho - separacion * (galeria.columnas - 1)) / galeria.columnas;
  const paso = celda + separacion;
  const altoBloque = galeria.filasPorBloque * paso;
  let alto = 0;
  const lista = Array.from({ length: total }, (_, i) => {
    const forma = MOSAICO[i % galeria.fotosPorBloque];
    const bloque = Math.floor(i / galeria.fotosPorBloque);
    const posicion = {
      left: forma.columna * paso,
      top: bloque * altoBloque + forma.fila * paso,
      width: forma.columnas * celda + (forma.columnas - 1) * separacion,
      height: forma.filas * celda + (forma.filas - 1) * separacion,
    };
    alto = Math.max(alto, posicion.top + posicion.height);
    return posicion;
  });
  return { lista, alto };
}

/**
 * Galería del salón (DESIGN.md, piezas de marca): solo fotos reales de los servicios activos, en
 * mosaico editorial, con visor a pantalla completa. Sin fotos, estado vacío con monograma.
 */
export function GaleriaTrabajo({ fotos }: { fotos: FotoGaleria[] }) {
  const [ancho, setAncho] = useState(0);
  const [abierta, setAbierta] = useState<number | null>(null);

  if (fotos.length === 0) {
    return (
      <EmptyState
        titulo="Aún no hay fotos publicadas"
        mensaje="Cuando el salón publique fotos de sus servicios, las verás aquí."
      />
    );
  }

  const { lista, alto } = posicionesDe(fotos.length, ancho);
  const medir = (e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width);

  return (
    <>
      <View onLayout={medir} style={{ height: ancho > 0 ? alto : 0 }}>
        {ancho > 0
          ? lista.map((posicion, i) => (
              <Celda
                key={fotos[i].url}
                foto={fotos[i]}
                posicion={posicion}
                onPress={() => setAbierta(i)}
              />
            ))
          : null}
      </View>
      <VisorFoto fotos={fotos} indice={abierta} onCerrar={() => setAbierta(null)} />
    </>
  );
}

function Celda({
  foto,
  posicion,
  onPress,
}: {
  foto: FotoGaleria;
  posicion: Posicion;
  onPress: () => void;
}) {
  const { colores } = useTheme();
  const escala = useSharedValue(1);
  const animado = useAnimatedStyle(() => ({ transform: [{ scale: escala.get() }] }));
  const ajuste = { duration: duracion.presionar, easing: EASE_SALIDA };

  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={`Ver foto de ${foto.servicio} en grande`}
      onPress={onPress}
      onPressIn={() => escala.set(withTiming(escalaPresionado, ajuste))}
      onPressOut={() => escala.set(withTiming(1, ajuste))}
      style={[styles.celda, posicion]}
    >
      <Animated.View style={[styles.marco, { backgroundColor: colores.panel }, animado]}>
        <Monograma tamano="pequeno" />
        <Image
          source={{ uri: foto.url }}
          recyclingKey={foto.url}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={duracion.pestana}
        />
      </Animated.View>
    </Pressable>
  );
}

/** Esqueleto de la galería: un bloque del mosaico en arena con pulso suave. */
export function GaleriaEsqueleto() {
  const [ancho, setAncho] = useState(0);
  const { lista, alto } = posicionesDe(galeria.fotosPorBloque, ancho);
  const medir = (e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width);

  return (
    <View
      accessible
      accessibilityLabel="Cargando fotos del salón"
      onLayout={medir}
      style={{ height: ancho > 0 ? alto : 0 }}
    >
      {ancho > 0
        ? lista.map((posicion, i) => (
            <Skeleton
              key={MOSAICO[i].columna * galeria.columnas + MOSAICO[i].fila}
              estilo={[styles.celda, posicion, styles.esqueleto]}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  celda: {
    position: 'absolute',
  },
  marco: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.tarjeta,
    overflow: 'hidden',
  },
  esqueleto: {
    borderRadius: radio.tarjeta,
  },
});
