import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  escalaPresionadoTarjeta,
  esqueleto,
  espacio,
  fuente,
  radio,
  sombra,
  tienda,
  tipo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import {
  estaAgotado,
  formatoPrecio,
  precioDesdeCentavos,
  tienePreciosDistintos,
  type ProductoCatalogo,
} from '../models/productoModel';
import { FotoProducto } from './FotoProducto';

const SIN_PRECIO = 'Consulta el precio en el salón';

interface TarjetaProductoProps {
  producto: ProductoCatalogo;
  /** Ancho de la columna de la cuadrícula (las dos tarjetas de una fila miden igual). */
  ancho: number;
  /** Recibe el id para que la función sea la misma en todas las tarjetas (no rompe el memo). */
  onAbrir: (id: number) => void;
}

/**
 * Producto de la cuadrícula de la Tienda: foto cuadrada arriba, nombre, marca y precio. Se hunde a
 * 0.99 al tocarla. Las tarjetas de una fila se estiran al mismo alto y el precio queda abajo en ambas.
 */
export const TarjetaProducto = memo(function TarjetaProducto({
  producto,
  ancho,
  onAbrir,
}: TarjetaProductoProps) {
  const { colores } = useTheme();
  // Tarjeta tocable completa: se hunde a 0.99 (.mf-tarjeta-tocable), no a 0.97 como un botón.
  const { estilo, hundir, soltar } = usePresion(escalaPresionadoTarjeta);

  const agotado = estaAgotado(producto);
  const centavos = precioDesdeCentavos(producto);
  const precio = centavos > 0 ? formatoPrecio(centavos) : null;
  const desde = precio !== null && tienePreciosDistintos(producto);
  const secundario = producto.marca || producto.categoria;

  const etiqueta = [
    producto.nombre,
    secundario,
    precio ? (desde ? `desde ${precio}` : precio) : SIN_PRECIO,
    agotado ? 'agotado' : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityHint="Abre el detalle del producto"
      onPress={() => onAbrir(producto.id)}
      onPressIn={hundir}
      onPressOut={soltar}
      style={{ width: ancho }}
    >
      <Animated.View
        style={[
          styles.tarjeta,
          { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta },
          estilo,
        ]}
      >
        <View>
          <FotoProducto uri={producto.imagen} estilo={styles.foto} atenuada={agotado} />
          {agotado ? (
            // Con texto y no solo con la foto atenuada: el estado se lee sin depender del color.
            <View style={[styles.agotado, { backgroundColor: colores.panel }]}>
              <Text style={[styles.textoAgotado, { color: colores.textoSobrePanel }]}>Agotado</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.datos}>
          <Text numberOfLines={2} style={[styles.nombre, { color: colores.texto }]}>
            {producto.nombre}
          </Text>
          {secundario ? (
            // Texto principal y no el suave: el suave sobre terracota no llega a 4.5:1.
            <Text numberOfLines={1} style={[styles.secundario, { color: colores.texto }]}>
              {secundario}
            </Text>
          ) : null}
          <View style={styles.pie}>
            {precio ? (
              <Text style={[styles.precio, { color: colores.texto }]}>
                {desde ? <Text style={styles.desde}>Desde </Text> : null}
                {precio}
              </Text>
            ) : (
              <Text style={[styles.sinPrecio, { color: colores.texto }]}>{SIN_PRECIO}</Text>
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});

/** Esqueleto con la forma de la tarjeta, para el estado de carga de la cuadrícula. */
export function TarjetaProductoEsqueleto({ ancho }: { ancho: number }) {
  const { colores } = useTheme();
  return (
    <View
      style={[
        styles.tarjeta,
        { width: ancho, backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta },
      ]}
    >
      <Skeleton estilo={styles.foto} />
      <View style={styles.datos}>
        <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoMedio }]} />
        <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoCorto }]} />
        <View style={styles.pie}>
          <Skeleton estilo={[styles.precioEsqueleto, { width: esqueleto.anchoCorto }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    flex: 1,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  // La foto llega al borde de la tarjeta y comparte sus esquinas de arriba.
  foto: {
    width: '100%',
    aspectRatio: tienda.proporcionFoto,
    borderTopLeftRadius: radio.tarjeta,
    borderTopRightRadius: radio.tarjeta,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  agotado: {
    position: 'absolute',
    left: espacio.s,
    bottom: espacio.s,
    paddingHorizontal: espacio.s,
    paddingVertical: espacio.xxs,
    borderRadius: radio.pastilla,
  },
  textoAgotado: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  datos: {
    flex: 1,
    gap: espacio.xs,
    padding: espacio.m,
  },
  nombre: {
    fontFamily: fuente.titulo,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    letterSpacing: tracking.tituloTarjeta,
  },
  secundario: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  // Empuja el precio al fondo: en una fila, los precios de las dos tarjetas quedan alineados.
  pie: {
    marginTop: 'auto',
    paddingTop: espacio.s,
  },
  precio: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
  desde: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
  },
  sinPrecio: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  lineaEsqueleto: {
    height: esqueleto.linea,
  },
  precioEsqueleto: {
    height: esqueleto.lineaGrande,
  },
});
