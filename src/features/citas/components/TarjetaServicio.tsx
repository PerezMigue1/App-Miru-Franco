import { Image } from 'expo-image';
import { ChevronRight, Clock } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Monograma } from '@/shared/ui/Monograma';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  catalogo,
  curva,
  duracion,
  escalaPresionado,
  espacio,
  esqueleto,
  fuente,
  icono,
  radio,
  sombra,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { Servicio } from '../models/servicioModel';

const EASE_SALIDA = Easing.bezier(...curva.salida);
const SIN_PRECIO = 'Consulta el precio en el salón';

interface TarjetaServicioProps {
  servicio: Servicio;
  onPress: () => void;
}

/** Un servicio del catálogo: miniatura, nombre, categoría, duración y precio. Se hunde al tocarla. */
export function TarjetaServicio({ servicio, onPress }: TarjetaServicioProps) {
  const { colores } = useTheme();
  const escala = useSharedValue(1);
  const animado = useAnimatedStyle(() => ({ transform: [{ scale: escala.get() }] }));
  const ajuste = { duration: duracion.presionar, easing: EASE_SALIDA };

  const etiqueta = [servicio.nombre, servicio.duracion, servicio.precio ?? SIN_PRECIO]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityHint="Abre el detalle del servicio"
      onPress={onPress}
      onPressIn={() => escala.set(withTiming(escalaPresionado, ajuste))}
      onPressOut={() => escala.set(withTiming(1, ajuste))}
    >
      <Animated.View
        style={[
          styles.tarjeta,
          { backgroundColor: colores.superficie, shadowColor: colores.sombra },
          animado,
        ]}
      >
        <View style={[styles.miniatura, { backgroundColor: colores.panel }]}>
          <Monograma tamano="pequeno" />
          {servicio.imagen ? (
            <Image
              accessible={false}
              source={{ uri: servicio.imagen }}
              recyclingKey={servicio.imagen}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={duracion.pestana}
            />
          ) : null}
        </View>

        <View style={styles.datos}>
          <Text numberOfLines={2} style={[styles.nombre, { color: colores.texto }]}>
            {servicio.nombre}
          </Text>
          {servicio.categoria ? (
            // Texto principal y no el suave: el suave sobre terracota no llega a 4.5:1.
            <Text numberOfLines={1} style={[styles.categoria, { color: colores.texto }]}>
              {servicio.categoria}
            </Text>
          ) : null}
          <View style={styles.linea}>
            {servicio.duracion ? (
              <View style={styles.duracion}>
                <Clock color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
                <Text style={[styles.dato, { color: colores.texto }]}>{servicio.duracion}</Text>
              </View>
            ) : null}
            <Text
              style={[
                servicio.precio ? styles.precio : styles.dato,
                { color: colores.texto },
              ]}
            >
              {servicio.precio ?? SIN_PRECIO}
            </Text>
          </View>
        </View>

        <View accessible={false} importantForAccessibility="no-hide-descendants">
          <ChevronRight color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** Esqueleto con la forma de la tarjeta, para el estado de carga del catálogo. */
export function TarjetaServicioEsqueleto() {
  const { colores } = useTheme();
  return (
    <View
      style={[
        styles.tarjeta,
        { backgroundColor: colores.superficie, shadowColor: colores.sombra },
      ]}
    >
      <Skeleton estilo={styles.miniatura} />
      <View style={styles.datos}>
        <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoMedio }]} />
        <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoCorto }]} />
        <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoCorto }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.l,
    padding: espacio.m,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  miniatura: {
    width: catalogo.miniatura,
    height: catalogo.miniatura,
    borderRadius: radio.campo,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datos: {
    flex: 1,
    gap: espacio.xs,
  },
  nombre: {
    fontFamily: fuente.titulo,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    letterSpacing: tracking.titulo,
  },
  categoria: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  linea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: espacio.m,
    rowGap: espacio.xxs,
  },
  duracion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
  },
  dato: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  precio: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  lineaEsqueleto: {
    height: esqueleto.linea,
  },
});
