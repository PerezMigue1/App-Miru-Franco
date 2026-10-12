import { Image } from 'expo-image';
import { ArrowRight, Clock } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Monograma } from '@/shared/ui/Monograma';
import { usePresion } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  catalogo,
  duracion,
  escalaPresionadoTarjeta,
  espacio,
  esqueleto,
  fuente,
  icono,
  radio,
  sombra,
  tarjetas,
  tipo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { Servicio } from '../models/servicioModel';

const SIN_PRECIO = 'Consulta el precio en el salón';
const ACCION = 'Ver y agendar';

interface TarjetaServicioProps {
  servicio: Servicio;
  onPress: () => void;
}

/**
 * Un servicio del catálogo con la estructura de TarjetaServicio de la web: foto 4:3 arriba y cuerpo
 * con categoría en mayúsculas, nombre, descripción, duración, precio y "Ver y agendar". Toda la
 * tarjeta es el área táctil y se hunde a 0.99 al tocarla.
 */
export const TarjetaServicio = memo(function TarjetaServicio({ servicio, onPress }: TarjetaServicioProps) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion(escalaPresionadoTarjeta);

  const etiqueta = [
    servicio.nombre,
    servicio.categoria,
    servicio.duracion,
    servicio.precio ?? SIN_PRECIO,
    ACCION,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      <Animated.View
        style={[
          styles.tarjeta,
          { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta },
          estilo,
        ]}
      >
        {/* Placeholder de la marca: monograma dorado sobre carbón mientras carga o si no hay foto. */}
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[styles.foto, { backgroundColor: colores.panel }]}
        >
          <Monograma tamano="mediano" />
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

        <View style={styles.cuerpo}>
          {/* Categoría y título en el secundario y el principal (4.8:1 y 4.7:1 sobre terracota). */}
          {servicio.categoria ? (
            <Text numberOfLines={1} style={[styles.categoria, { color: colores.textoSuave }]}>
              {servicio.categoria}
            </Text>
          ) : null}
          <Text
            numberOfLines={2}
            style={[
              styles.nombre,
              servicio.categoria ? styles.nombreConCategoria : null,
              { color: colores.texto },
            ]}
          >
            {servicio.nombre}
          </Text>
          {servicio.descripcion ? (
            <Text numberOfLines={2} style={[styles.descripcion, { color: colores.textoSuave }]}>
              {servicio.descripcion}
            </Text>
          ) : null}

          <View style={styles.pie}>
            <View style={styles.datos}>
              {servicio.duracion ? (
                <View style={styles.duracion}>
                  {/* Reloj en el secundario: el oro de marca no llega a 3:1 sobre terracota. */}
                  <Clock color={colores.textoSuave} size={tarjetas.iconoDato} strokeWidth={icono.trazo} />
                  <Text style={[styles.textoDuracion, { color: colores.textoSuave }]}>
                    {servicio.duracion}
                  </Text>
                </View>
              ) : null}
              <Text
                style={[
                  servicio.precio ? styles.precio : styles.sinPrecio,
                  servicio.duracion ? styles.precioConDuracion : null,
                  { color: colores.texto },
                ]}
              >
                {servicio.precio ?? SIN_PRECIO}
              </Text>
            </View>
            <View style={styles.accion}>
              <Text style={[styles.textoAccion, { color: colores.texto }]}>{ACCION}</Text>
              <ArrowRight color={colores.texto} size={tarjetas.iconoAccion} strokeWidth={icono.trazo} />
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});

/** Esqueleto con la forma de la tarjeta, para el estado de carga del catálogo. */
export function TarjetaServicioEsqueleto() {
  const { colores } = useTheme();
  return (
    <View
      style={[
        styles.tarjeta,
        { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta },
      ]}
    >
      <Skeleton estilo={styles.foto} />
      <View style={[styles.cuerpo, styles.cuerpoEsqueleto]}>
        <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoCorto }]} />
        <Skeleton estilo={[styles.lineaGrandeEsqueleto, { width: esqueleto.anchoMedio }]} />
        <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoMedio }]} />
        <Skeleton estilo={[styles.lineaGrandeEsqueleto, { width: esqueleto.anchoCorto }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  // La foto llega al borde de la tarjeta y comparte sus esquinas de arriba.
  foto: {
    width: '100%',
    aspectRatio: catalogo.proporcionImagen,
    borderTopLeftRadius: radio.tarjeta,
    borderTopRightRadius: radio.tarjeta,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cuerpo: {
    padding: tarjetas.rellenoCuerpo,
  },
  cuerpoEsqueleto: {
    gap: espacio.s,
  },
  categoria: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.categoria.tamano,
    lineHeight: tipo.categoria.linea,
    letterSpacing: tracking.categoria,
    textTransform: 'uppercase',
  },
  nombre: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.tituloTarjeta.tamano,
    lineHeight: tipo.tituloTarjeta.linea,
  },
  nombreConCategoria: {
    marginTop: tarjetas.separacionTitulo,
  },
  descripcion: {
    marginTop: tarjetas.separacionDescripcion,
    fontFamily: fuente.texto,
    fontSize: tipo.descripcion.tamano,
    lineHeight: tipo.descripcion.linea,
  },
  // Duración y precio a la izquierda, acción a la derecha; si no caben, la acción baja de línea.
  pie: {
    paddingTop: tarjetas.separacionPie,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    columnGap: espacio.m,
    rowGap: espacio.s,
  },
  datos: {
    flexShrink: 1,
  },
  duracion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tarjetas.separacionIcono,
  },
  textoDuracion: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  precio: {
    fontFamily: fuente.textoNegrita,
    fontSize: tipo.precio.tamano,
    lineHeight: tipo.precio.linea,
    fontVariant: ['tabular-nums'],
  },
  precioConDuracion: {
    marginTop: tarjetas.separacionPrecio,
  },
  sinPrecio: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  accion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tarjetas.separacionIcono,
  },
  textoAccion: {
    flexShrink: 1,
    fontFamily: fuente.textoFuerte,
    fontSize: tarjetas.tipoAccion.tamano,
    lineHeight: tarjetas.tipoAccion.linea,
  },
  lineaEsqueleto: {
    height: esqueleto.linea,
  },
  lineaGrandeEsqueleto: {
    height: esqueleto.lineaGrande,
  },
});
