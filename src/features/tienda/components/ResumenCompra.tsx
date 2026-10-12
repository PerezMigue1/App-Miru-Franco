import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { borde, espacio, fuente, radio, sombra, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { formatoPrecio, textoPiezas } from '../models/productoModel';

export interface LineaResumen {
  clave: string | number;
  nombre: string;
  /** "500ml"; vacío si no viene. */
  tamanio: string;
  cantidad: number;
  subtotalCentavos: number;
}

interface ResumenCompraProps {
  lineas: LineaResumen[];
  totalCentavos: number;
  /** Contenido antes de los artículos (número de pedido, estado, fecha). */
  encabezado?: ReactNode;
  /** Contenido después del total (forma de pago, plazo). */
  children?: ReactNode;
}

/**
 * Tarjeta con los artículos de una compra (nombre, tamaño por cantidad y subtotal) y el total. La
 * usan el último paso del checkout y la confirmación del pedido. Nombre, subtotal y total en el
 * principal; tamaño, cantidad y etiquetas en el secundario (4.8:1 sobre terracota).
 */
export function ResumenCompra({ lineas, totalCentavos, encabezado, children }: ResumenCompraProps) {
  const { colores } = useTheme();
  return (
    <View
      style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}
    >
      {encabezado}
      <View style={styles.lineas}>
        {lineas.map((linea) => {
          const subtotal = formatoPrecio(linea.subtotalCentavos);
          const detalle = [linea.tamanio, `× ${linea.cantidad}`].filter(Boolean).join(' ');
          return (
            <View
              key={linea.clave}
              style={styles.linea}
              accessible
              accessibilityLabel={[linea.nombre, linea.tamanio, textoPiezas(linea.cantidad), subtotal]
                .filter(Boolean)
                .join(', ')}
            >
              <View style={styles.textos}>
                <Text style={[styles.nombre, { color: colores.texto }]}>{linea.nombre || 'Producto'}</Text>
                <Text style={[styles.detalle, styles.cifra, { color: colores.textoSuave }]}>{detalle}</Text>
              </View>
              <Text style={[styles.subtotal, styles.cifra, { color: colores.texto }]}>{subtotal}</Text>
            </View>
          );
        })}
      </View>
      <View
        style={[styles.total, { borderTopColor: colores.hairline }]}
        accessible
        accessibilityLabel={`Total: ${formatoPrecio(totalCentavos)}`}
      >
        <Text style={[styles.etiquetaTotal, { color: colores.texto }]}>Total</Text>
        <Text style={[styles.cifraTotal, { color: colores.texto }]}>{formatoPrecio(totalCentavos)}</Text>
      </View>
      {children}
    </View>
  );
}

/** Una línea etiqueta y valor dentro de la tarjeta (forma de pago, recoger en). */
export function DatoCompra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const { colores } = useTheme();
  return (
    <View style={styles.dato} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <Text style={[styles.etiquetaDato, { color: colores.textoSuave }]}>{etiqueta}</Text>
      <Text style={[styles.valorDato, { color: colores.texto }]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    gap: espacio.l,
    padding: espacio.xl,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  lineas: {
    gap: espacio.m,
  },
  linea: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: espacio.l,
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
  },
  subtotal: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  cifra: {
    fontVariant: ['tabular-nums'],
  },
  total: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: espacio.m,
    paddingTop: espacio.m,
    borderTopWidth: borde.hairline,
  },
  etiquetaTotal: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  cifraTotal: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    fontVariant: ['tabular-nums'],
  },
  dato: {
    gap: espacio.xxs,
  },
  etiquetaDato: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  valorDato: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
});
