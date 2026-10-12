import { CalendarDays, ChevronRight } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  escalaPresionadoTarjeta,
  espacio,
  esqueleto,
  fuente,
  icono,
  insignia,
  radio,
  sombra,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { etiquetaEstadoPedido, fechaPedido, type Pedido } from '../models/pedidoModel';
import { formatoPrecio } from '../models/productoModel';
import { formaPagoCorta } from '../models/pedidoModel';
import { textoPiezas } from '../models/productoModel';
import { BadgePedido } from './BadgePedido';

interface TarjetaPedidoProps {
  pedido: Pedido;
  /** Recibe el id: así la referencia es estable y la tarjeta memoizada no se vuelve a dibujar. */
  onAbrir: (id: number) => void;
}

function conMayuscula(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/**
 * Un pedido de Mis pedidos: número, fecha, piezas, forma de pago, total y estado. Se hunde al
 * tocarla (tarjeta tocable completa: 0.99 en 140 ms; con movimiento reducido solo baja la opacidad).
 */
export const TarjetaPedido = memo(function TarjetaPedido({ pedido, onAbrir }: TarjetaPedidoProps) {
  const { colores } = useTheme();
  const { estilo: estiloPresion, hundir, soltar } = usePresion(escalaPresionadoTarjeta);

  const fecha = conMayuscula(fechaPedido(pedido));
  const piezas = textoPiezas(pedido.piezas);
  const pago = formaPagoCorta(pedido.metodoPago);
  const total = formatoPrecio(pedido.totalCentavos);
  const estado = etiquetaEstadoPedido(pedido).texto;

  const etiqueta = [
    `Pedido número ${pedido.id}`,
    fecha,
    piezas,
    `total ${total}`,
    pago,
    `estado: ${estado}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Animated.View
      style={[
        styles.tarjeta,
        { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta },
        estiloPresion,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        accessibilityHint="Abre el detalle del pedido"
        onPress={() => onAbrir(pedido.id)}
        onPressIn={hundir}
        onPressOut={soltar}
        style={styles.contenido}
      >
        {/* El Pressable ya anuncia todo en su etiqueta: el contenido no se lee por separado. */}
        <View importantForAccessibility="no-hide-descendants" style={styles.columnas}>
          <View style={styles.datos}>
            <View style={styles.encabezado}>
              <Text numberOfLines={1} style={[styles.numero, { color: colores.texto }]}>
                Pedido #{pedido.id}
              </Text>
              <Text style={[styles.total, { color: colores.texto }]}>{total}</Text>
            </View>

            {fecha ? (
              <View style={styles.dato}>
                <View style={styles.iconoDato}>
                  <CalendarDays color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
                </View>
                {/* Texto principal y no el suave: el suave sobre terracota no llega a 4.5:1. */}
                <Text style={[styles.textoDato, { color: colores.texto }]}>{fecha}</Text>
              </View>
            ) : null}

            <Text style={[styles.textoDato, { color: colores.texto }]}>
              {piezas} · {pago}
            </Text>

            <View style={styles.insignias}>
              <BadgePedido pedido={pedido} />
            </View>
          </View>

          <ChevronRight color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        </View>
      </Pressable>
    </Animated.View>
  );
});

/** Esqueleto con la forma de la tarjeta, para la carga de Mis pedidos. */
export function TarjetaPedidoEsqueleto() {
  const { colores } = useTheme();
  return (
    <View
      style={[
        styles.tarjeta,
        styles.contenido,
        { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta },
      ]}
    >
      <View style={styles.encabezado}>
        <Skeleton estilo={[styles.lineaTitulo, { width: esqueleto.anchoCorto }]} />
        <Skeleton estilo={styles.totalEsqueleto} />
      </View>
      <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoMedio }]} />
      <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoCorto }]} />
      <Skeleton estilo={styles.insigniaEsqueleto} />
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
  contenido: {
    minHeight: toqueMinimo,
    padding: espacio.l,
    gap: espacio.s,
  },
  columnas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
  },
  datos: {
    flex: 1,
    gap: espacio.s,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: espacio.m,
  },
  numero: {
    flexShrink: 1,
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
    fontVariant: ['tabular-nums'],
  },
  total: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
  dato: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.s,
  },
  iconoDato: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.pequeno.linea - icono.tamanoPequeno) / 2,
  },
  textoDato: {
    flexShrink: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  insignias: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacio.s,
  },
  lineaTitulo: {
    height: esqueleto.lineaGrande,
  },
  lineaEsqueleto: {
    height: esqueleto.linea,
  },
  totalEsqueleto: {
    width: toqueMinimo,
    height: esqueleto.linea,
  },
  insigniaEsqueleto: {
    width: toqueMinimo * 2,
    height: tipo.etiqueta.linea + insignia.rellenoVertical * 2,
    borderRadius: radio.pastilla,
  },
});
