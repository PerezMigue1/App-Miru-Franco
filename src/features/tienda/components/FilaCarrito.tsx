import { CircleAlert, Trash2 } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  espacio,
  esqueleto,
  fuente,
  icono,
  opacidad,
  radio,
  sombra,
  tarjetas,
  tienda,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { formatoPrecio, itemConProblema, type ItemCarrito } from '../viewmodels/presentacionTienda';
import { FotoProducto } from './FotoProducto';
import { SelectorCantidad } from './SelectorCantidad';

interface FilaCarritoProps {
  item: ItemCarrito;
  /** Hay una operación en curso en esta fila: se bloquea hasta que termine. */
  ocupado: boolean;
  /** Mensaje del último error de la fila, o undefined. */
  error?: string;
  onCambiar: (item: ItemCarrito, cantidad: number) => void;
  onQuitar: (item: ItemCarrito) => void;
}

/** Aviso del producto que hay que ajustar antes de comprar, o null si está bien. */
export function avisoProblema(item: ItemCarrito): { texto: string; grave: boolean } | null {
  if (!itemConProblema(item)) {
    return null;
  }
  if (!item.disponible || item.stock <= 0 || item.precioCentavos <= 0) {
    return { texto: 'Ya no está disponible', grave: true };
  }
  return {
    texto: item.stock === 1 ? 'Solo queda 1 pieza' : `Solo quedan ${item.stock} piezas`,
    grave: false,
  };
}

/**
 * Un producto del carrito: foto, nombre, tamaño, precio unitario, total de la línea, cantidad y
 * botón para quitarlo. Memoizada: solo se vuelve a pintar si cambia su ítem, su estado o su error.
 */
export const FilaCarrito = memo(function FilaCarrito({
  item,
  ocupado,
  error,
  onCambiar,
  onQuitar,
}: FilaCarritoProps) {
  const { colores } = useTheme();
  const aviso = avisoProblema(item);
  const totalLinea = formatoPrecio(item.precioCentavos * item.cantidad);
  const unitario = formatoPrecio(item.precioCentavos);
  // El máximo son las existencias: si la cantidad las pasa, "menos" la lleva directo a ellas (el
  // servidor rechaza cualquier cantidad mayor). Sin existencias o no disponible, solo se puede quitar.
  const sinExistencias = item.stock <= 0 || !item.disponible;
  const maximo = sinExistencias ? item.cantidad : item.stock;
  const nombre = item.nombre || 'Producto';

  return (
    <View
      style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}
    >
      <View style={styles.cabecera}>
        <FotoProducto
          uri={item.imagen}
          estilo={styles.foto}
          atenuada={aviso?.grave === true}
        />
        <View
          style={styles.datos}
          accessible
          accessibilityLabel={[
            nombre,
            item.marca,
            item.tamanio,
            `${unitario} cada uno`,
            `${item.cantidad} ${item.cantidad === 1 ? 'pieza' : 'piezas'}`,
            `total ${totalLinea}`,
            aviso?.texto,
          ]
            .filter(Boolean)
            .join(', ')}
        >
          {item.marca ? (
            // Marca en mayúsculas sobre el nombre, como la categoría de las tarjetas (4.8:1 sobre terracota).
            <Text numberOfLines={1} style={[styles.marca, { color: colores.textoSuave }]}>
              {item.marca}
            </Text>
          ) : null}
          <Text numberOfLines={2} style={[styles.nombre, { color: colores.texto }]}>
            {nombre}
          </Text>
          {item.tamanio ? (
            <Text style={[styles.detalle, { color: colores.textoSuave }]}>{item.tamanio}</Text>
          ) : null}
          <Text style={[styles.detalle, styles.cifra, { color: colores.textoSuave }]}>{unitario} c/u</Text>
          {aviso ? (
            <View style={styles.aviso}>
              <CircleAlert
                color={aviso.grave ? colores.peligro : colores.aviso}
                size={icono.tamanoPequeno}
                strokeWidth={icono.trazo}
              />
              <Text
                style={[styles.textoAviso, { color: aviso.grave ? colores.peligro : colores.aviso }]}
              >
                {aviso.texto}
              </Text>
            </View>
          ) : null}
        </View>
        <BotonQuitar nombre={nombre} deshabilitado={ocupado} onPress={() => onQuitar(item)} />
      </View>

      <View style={styles.pie}>
        <SelectorCantidad
          valor={item.cantidad}
          maximo={maximo}
          onCambiar={(cantidad) => onCambiar(item, cantidad)}
          deshabilitado={ocupado || sinExistencias}
          etiqueta={`Cantidad de ${nombre}`}
        />
        <Text style={[styles.total, { color: colores.texto }]}>{totalLinea}</Text>
      </View>

      {/* Región en vivo siempre montada: el error se anuncia una vez al aparecer. */}
      <View collapsable={false} accessibilityLiveRegion="polite">
        {error ? <Text style={[styles.error, { color: colores.peligro }]}>{error}</Text> : null}
      </View>
    </View>
  );
});

function BotonQuitar({
  nombre,
  deshabilitado,
  onPress,
}: {
  nombre: string;
  deshabilitado: boolean;
  onPress: () => void;
}) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Quitar ${nombre} del carrito`}
      accessibilityState={{ disabled: deshabilitado }}
      disabled={deshabilitado}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
      style={deshabilitado ? styles.deshabilitado : null}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.quitar,
            { backgroundColor: pressed ? colores.presionado : colores.transparente },
            estilo,
          ]}
        >
          <Trash2 color={colores.texto} size={icono.tamano} strokeWidth={icono.trazo} />
        </Animated.View>
      )}
    </Pressable>
  );
}

/** Esqueleto con la forma de la fila, mientras carga el carrito. */
export function FilaCarritoEsqueleto() {
  const { colores } = useTheme();
  return (
    <View
      style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}
    >
      <View style={styles.cabecera}>
        <Skeleton estilo={styles.foto} />
        <View style={styles.datos}>
          <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoMedio }]} />
          <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoCorto }]} />
        </View>
      </View>
      <Skeleton estilo={styles.selectorEsqueleto} />
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    gap: espacio.m,
    padding: espacio.l,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  foto: {
    width: tienda.miniatura,
    height: tienda.miniatura,
    borderRadius: radio.campo,
  },
  datos: {
    flex: 1,
    gap: espacio.xxs,
  },
  marca: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.categoria.tamano,
    lineHeight: tipo.categoria.linea,
    letterSpacing: tracking.categoria,
    textTransform: 'uppercase',
  },
  nombre: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  detalle: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  cifra: {
    fontVariant: ['tabular-nums'],
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    marginTop: espacio.xs,
  },
  textoAviso: {
    flexShrink: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  quitar: {
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  deshabilitado: {
    opacity: opacidad.deshabilitado,
  },
  pie: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacio.m,
  },
  // Total de la línea en Geist 700 18, como el carrito de la web.
  total: {
    fontFamily: fuente.textoNegrita,
    fontSize: tarjetas.tipoTotal.tamano,
    lineHeight: tarjetas.tipoTotal.linea,
    fontVariant: ['tabular-nums'],
  },
  error: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  lineaEsqueleto: {
    height: esqueleto.linea,
  },
  selectorEsqueleto: {
    width: toqueMinimo * 3,
    height: toqueMinimo,
    borderRadius: radio.pastilla,
  },
});
