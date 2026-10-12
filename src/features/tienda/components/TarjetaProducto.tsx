import { ArrowRight } from 'lucide-react-native';
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
  icono,
  radio,
  sombra,
  tarjetas,
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
const ACCION = 'Ver detalles';

interface TarjetaProductoProps {
  producto: ProductoCatalogo;
  /** Ancho de la columna de la cuadrícula (las dos tarjetas de una fila miden igual). */
  ancho: number;
  /** Recibe el id para que la función sea la misma en todas las tarjetas (no rompe el memo). */
  onAbrir: (id: number) => void;
}

/**
 * Producto de la cuadrícula de la Tienda con la estructura de TarjetaCatalogo de la web: foto
 * cuadrada arriba y cuerpo con categoría y marca en mayúsculas, nombre, descripción, precio (con el
 * original tachado si hay rebaja) y "Ver detalles". Toda la tarjeta es el área táctil y se hunde a
 * 0.99. Las tarjetas de una fila se estiran al mismo alto y el pie queda abajo en ambas.
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
  // Precio antes de la rebaja: solo con un precio único (con "Desde" no se sabe de qué tamaño es).
  const centavosOriginal =
    precio !== null && !desde
      ? producto.presentaciones.find(
          (p) => p.precioCentavos === centavos && p.precioOriginalCentavos !== null,
        )?.precioOriginalCentavos ?? null
      : null;
  const original = centavosOriginal !== null ? formatoPrecio(centavosOriginal) : null;
  // "SHAMPOO · AVYNA", como la web: la categoría o "Producto", y la marca si viene.
  const categoria = [producto.categoria || 'Producto', producto.marca].filter(Boolean).join(' · ');

  const etiqueta = [
    producto.nombre,
    categoria,
    precio ? (desde ? `desde ${precio}` : precio) : SIN_PRECIO,
    original ? `antes ${original}` : '',
    agotado ? 'agotado' : '',
    ACCION,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
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

        <View style={styles.cuerpo}>
          {/* Categoría y título en el secundario y el principal (4.8:1 y 4.7:1 sobre terracota). */}
          <Text numberOfLines={2} style={[styles.categoria, { color: colores.textoSuave }]}>
            {categoria}
          </Text>
          <Text numberOfLines={2} style={[styles.nombre, { color: colores.texto }]}>
            {producto.nombre}
          </Text>
          {producto.descripcion ? (
            <Text numberOfLines={2} style={[styles.descripcion, { color: colores.textoSuave }]}>
              {producto.descripcion}
            </Text>
          ) : null}

          {/* Precio y acción en una fila; si no caben a lo ancho, la acción baja a su propia línea. */}
          <View style={styles.pie}>
            <View style={styles.precios}>
              {original ? (
                <Text style={[styles.tachado, { color: colores.textoSuave }]}>{original}</Text>
              ) : null}
              {precio ? (
                <Text style={[styles.precio, { color: colores.texto }]}>
                  {desde ? <Text style={styles.desde}>Desde </Text> : null}
                  {precio}
                </Text>
              ) : (
                <Text style={[styles.sinPrecio, { color: colores.texto }]}>{SIN_PRECIO}</Text>
              )}
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
      <View style={[styles.cuerpo, styles.cuerpoEsqueleto]}>
        <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoCorto }]} />
        <Skeleton estilo={[styles.lineaGrandeEsqueleto, { width: esqueleto.anchoMedio }]} />
        <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoMedio }]} />
        <View style={styles.pie}>
          <Skeleton estilo={[styles.lineaGrandeEsqueleto, { width: esqueleto.anchoCorto }]} />
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
  cuerpo: {
    flex: 1,
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
    marginTop: tarjetas.separacionTitulo,
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.tituloTarjeta.tamano,
    lineHeight: tipo.tituloTarjeta.linea,
  },
  descripcion: {
    marginTop: tarjetas.separacionDescripcion,
    fontFamily: fuente.texto,
    fontSize: tipo.descripcion.tamano,
    lineHeight: tipo.descripcion.linea,
  },
  // Empuja el pie al fondo: en una fila, los precios de las dos tarjetas quedan alineados.
  pie: {
    marginTop: 'auto',
    paddingTop: tarjetas.separacionPie,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    columnGap: espacio.m,
    rowGap: espacio.s,
  },
  precios: {
    flexShrink: 1,
  },
  tachado: {
    fontFamily: fuente.texto,
    fontSize: tarjetas.tipoTachado.tamano,
    lineHeight: tarjetas.tipoTachado.linea,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  precio: {
    fontFamily: fuente.textoNegrita,
    fontSize: tipo.precio.tamano,
    lineHeight: tipo.precio.linea,
    fontVariant: ['tabular-nums'],
  },
  desde: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
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
