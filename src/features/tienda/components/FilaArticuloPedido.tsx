import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { espacio, fuente, radio, tienda, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { ItemPedido } from '../models/pedidoModel';
import { formatoPrecio } from '../models/productoModel';
import { textoPiezas } from '../models/productoModel';
import { FotoProducto } from './FotoProducto';

/**
 * Un artículo del pedido: miniatura, nombre, tamaño, "cantidad × precio" y subtotal. Nombre y
 * subtotal en el principal; tamaño y cantidad en el secundario (4.8:1 sobre terracota).
 */
export const FilaArticuloPedido = memo(function FilaArticuloPedido({ item }: { item: ItemPedido }) {
  const { colores } = useTheme();
  const nombre = item.nombre || 'Producto';
  const precio = formatoPrecio(item.precioUnitarioCentavos);
  const subtotal = formatoPrecio(item.subtotalCentavos);
  const piezas = textoPiezas(item.cantidad);

  const etiqueta = [nombre, item.tamanio, `${piezas} de ${precio}`, `subtotal ${subtotal}`]
    .filter(Boolean)
    .join(', ');

  return (
    <View accessible accessibilityLabel={etiqueta} style={styles.fila}>
      <FotoProducto uri={item.imagen} estilo={styles.foto} />
      <View style={styles.textos}>
        <Text numberOfLines={2} style={[styles.nombre, { color: colores.texto }]}>
          {nombre}
        </Text>
        {item.tamanio ? (
          <Text style={[styles.detalle, { color: colores.textoSuave }]}>{item.tamanio}</Text>
        ) : null}
        <Text style={[styles.detalle, { color: colores.textoSuave }]}>
          {item.cantidad} × {precio}
        </Text>
      </View>
      <Text style={[styles.subtotal, { color: colores.texto }]}>{subtotal}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  foto: {
    width: tienda.miniatura,
    height: tienda.miniatura,
    borderRadius: radio.campo,
  },
  textos: {
    flex: 1,
    gap: espacio.xxs,
  },
  nombre: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  detalle: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  subtotal: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
});
