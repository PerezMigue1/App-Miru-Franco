import { Image } from 'expo-image';
import { Check, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Monograma } from '@/shared/ui/Monograma';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  curva,
  duracion,
  escalaPresionado,
  espacio,
  esqueleto,
  fuente,
  icono,
  monograma,
  radio,
  sombra,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { Especialista } from '../models/citaModel';

const EASE_SALIDA = Easing.bezier(...curva.salida);

interface TarjetaEspecialistaProps {
  especialista: Especialista;
  /** Es la especialista ya elegida (al regresar al paso 1). */
  seleccionada: boolean;
  onPress: () => void;
}

/** Una especialista para elegir: foto en círculo (o monograma), nombre y puesto. Se hunde al tocarla. */
export function TarjetaEspecialista({ especialista, seleccionada, onPress }: TarjetaEspecialistaProps) {
  const { colores } = useTheme();
  const escala = useSharedValue(1);
  const animado = useAnimatedStyle(() => ({ transform: [{ scale: escala.get() }] }));
  const ajuste = { duration: duracion.presionar, easing: EASE_SALIDA };

  const etiqueta = [especialista.nombre, especialista.puesto].filter(Boolean).join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ selected: seleccionada }}
      accessibilityHint="Elige día y hora con ella"
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
        <View style={[styles.foto, { backgroundColor: colores.panel }]}>
          <Monograma tamano="mediano" />
          {especialista.foto ? (
            <Image
              accessible={false}
              source={{ uri: especialista.foto }}
              recyclingKey={especialista.foto}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={duracion.pestana}
            />
          ) : null}
        </View>

        <View style={styles.datos}>
          <Text numberOfLines={2} style={[styles.nombre, { color: colores.texto }]}>
            {especialista.nombre}
          </Text>
          {especialista.puesto ? (
            // Texto principal y no el suave: el suave sobre terracota no llega a 4.5:1.
            <Text numberOfLines={2} style={[styles.puesto, { color: colores.texto }]}>
              {especialista.puesto}
            </Text>
          ) : null}
        </View>

        <View accessible={false} importantForAccessibility="no-hide-descendants">
          {seleccionada ? (
            <Check color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazoMarca} />
          ) : (
            <ChevronRight color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** Esqueleto con la forma de la tarjeta, mientras cargan las especialistas. */
export function TarjetaEspecialistaEsqueleto() {
  const { colores } = useTheme();
  return (
    <View
      style={[
        styles.tarjeta,
        { backgroundColor: colores.superficie, shadowColor: colores.sombra },
      ]}
    >
      <Skeleton estilo={styles.foto} />
      <View style={styles.datos}>
        <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoMedio }]} />
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
  foto: {
    width: monograma.mediano,
    height: monograma.mediano,
    borderRadius: radio.pastilla,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datos: {
    flex: 1,
    gap: espacio.xxs,
  },
  nombre: {
    fontFamily: fuente.titulo,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    letterSpacing: tracking.titulo,
  },
  puesto: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  lineaEsqueleto: {
    height: esqueleto.linea,
  },
});
