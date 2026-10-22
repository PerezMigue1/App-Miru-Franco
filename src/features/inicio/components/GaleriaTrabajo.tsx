import { Image } from 'expo-image';
import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';

import { Monograma } from '@/shared/ui/Monograma';
import { useEntradaContenido, usePresion } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import { duracion, escalaPresionadoTarjeta, galeria, radio, sombra } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { FotoGaleria } from '../models/FotoModel';
import { VisorFoto } from './VisorFoto';

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
 * Galería del salón (DESIGN.md, piezas de marca): solo fotos reales publicadas en Admin > Galería, en
 * su orden y en mosaico editorial, con visor a pantalla completa. La pantalla decide qué mostrar sin
 * fotos (estado vacío con monograma); aquí siempre llega al menos una.
 */
export function GaleriaTrabajo({ fotos, verServicio }: { fotos: FotoGaleria[]; verServicio: string }) {
  const [ancho, setAncho] = useState(0);
  const [abierta, setAbierta] = useState<number | null>(null);
  const entrada = useEntradaContenido();
  // Posiciones estables entre renders: así las celdas memoizadas no se repintan al abrir el visor.
  const { lista, alto } = useMemo(() => posicionesDe(fotos.length, ancho), [fotos.length, ancho]);

  const medir = (e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width);

  return (
    <>
      {/* Una sola aparición para todo el mosaico cuando llegan las fotos, no una por foto. */}
      <Animated.View entering={entrada} onLayout={medir} style={{ height: ancho > 0 ? alto : 0 }}>
        {ancho > 0
          ? lista.map((posicion, i) => (
              <Celda
                key={fotos[i].id}
                foto={fotos[i]}
                posicion={posicion}
                indice={i}
                onAbrir={setAbierta}
              />
            ))
          : null}
      </Animated.View>
      <VisorFoto
        fotos={fotos}
        indice={abierta}
        verServicio={verServicio}
        onCerrar={() => setAbierta(null)}
      />
    </>
  );
}

const Celda = memo(function Celda({
  foto,
  posicion,
  indice,
  onAbrir,
}: {
  foto: FotoGaleria;
  posicion: Posicion;
  indice: number;
  onAbrir: (indice: number) => void;
}) {
  const { colores } = useTheme();
  // La foto entera es tocable: se hunde como tarjeta (0.99), no como botón.
  const { estilo, hundir, soltar } = usePresion(escalaPresionadoTarjeta);

  return (
    <Pressable
      accessibilityRole="imagebutton"
      // El texto alternativo de Admin > Galería; la pista dice qué hace el toque.
      accessibilityLabel={foto.alt}
      accessibilityHint="Abre la foto en grande"
      onPress={() => onAbrir(indice)}
      onPressIn={hundir}
      onPressOut={soltar}
      style={[styles.celda, posicion]}
    >
      <Animated.View
        style={[
          styles.marco,
          { backgroundColor: colores.panel, shadowColor: colores.sombraTarjeta },
          estilo,
        ]}
      >
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
});

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
    // Sombra tintada de tarjeta, como .mf-foto de la web (--mf-sombra-1).
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  esqueleto: {
    borderRadius: radio.tarjeta,
  },
});
