import { useLocalSearchParams } from 'expo-router';
import { CalendarDays, CircleCheck, Hourglass, Info } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  borde,
  espacio,
  esqueleto,
  fuente,
  icono,
  pantalla,
  radio,
  sombra,
  tienda,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { BadgePedido } from '../components/BadgePedido';
import { DatosRecogerSalon } from '../components/DatosRecogerSalon';
import { FilaArticuloPedido } from '../components/FilaArticuloPedido';
import { HojaCancelarPedido } from '../components/HojaCancelarPedido';
import {
  etiquetaMetodoPago,
  fechaPedido,
  limitePagoPedido,
  pidePagoEnLinea,
  puedeCancelar,
  textoCancelarPedido,
  textoQueSigue,
  type Pedido,
} from '../models/pedidoModel';
import { formatoPrecio } from '../models/productoModel';
import { textoPiezas } from '../models/productoModel';
import { useDetallePedidoViewModel, type AvisoPedido } from '../viewmodels/useDetallePedidoViewModel';

/** Estados en los que ya no hay nada que recoger en el salón. */
const SIN_RECOGER: readonly string[] = ['cancelado', 'entregado', 'enviado'];

/** Detalle de un pedido de la clienta: estado, qué sigue, artículos, pago, dónde recoger y cancelar. */
export default function DetallePedidoView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useDetallePedidoViewModel(id);

  const numero = vm.pedido ? String(vm.pedido.id) : vm.numero;
  const titulo = numero ? `Pedido #${numero}` : 'Tu pedido';

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo={titulo} onVolver={vm.regresar} />

      {vm.estado === 'listo' && vm.pedido ? (
        <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: bottom + espacio.x3 }]}>
          <Contenido
            pedido={vm.pedido}
            aviso={vm.aviso}
            onPagar={vm.completarPago}
            onCancelar={vm.abrirCancelar}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'cargando' ? <Esqueleto /> : null}

      {vm.estado === 'error' ? (
        <ScrollView contentContainerStyle={[styles.estado, { paddingBottom: bottom + espacio.x3 }]}>
          <EmptyState
            titulo="No pudimos cargar tu pedido"
            mensaje="Revisa tu conexión o intenta de nuevo en un momento."
            accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'noEncontrado' ? (
        <ScrollView contentContainerStyle={[styles.estado, { paddingBottom: bottom + espacio.x3 }]}>
          <EmptyState
            titulo="No encontramos este pedido"
            mensaje="Puede que ya no esté disponible. Revisa tus pedidos para ver su estado."
            accion={{ titulo: 'Ver mis pedidos', onPress: vm.verMisPedidos }}
          />
        </ScrollView>
      ) : null}

      <HojaCancelarPedido
        visible={vm.hojaCancelarVisible}
        onCerrar={vm.cerrarCancelar}
        numero={numero ?? ''}
        texto={vm.pedido ? textoCancelarPedido(vm.pedido) : ''}
        cancelando={vm.cancelando}
        error={vm.errorCancelacion}
        puedeConfirmar={vm.pedido ? puedeCancelar(vm.pedido) : false}
        onCancelar={vm.cancelar}
      />
    </View>
  );
}

function Contenido({
  pedido,
  aviso,
  onPagar,
  onCancelar,
}: {
  pedido: Pedido;
  aviso: AvisoPedido | null;
  onPagar: () => void;
  onCancelar: () => void;
}) {
  const { colores } = useTheme();
  // Aparece una vez al terminar de cargar; las recargas al enfocar no la repiten.
  const entrada = useEntradaContenido();

  const fecha = fechaPedido(pedido);
  const queSigue = textoQueSigue(pedido);
  const pagar = pidePagoEnLinea(pedido);
  const limite = pagar ? limitePagoPedido(pedido) : null;
  const total = formatoPrecio(pedido.totalCentavos);
  const recoger = !SIN_RECOGER.includes(pedido.estado);

  return (
    <Animated.View entering={entrada} style={styles.bloques}>
      {/* Aviso tras cancelar (o si el pedido cambió): la hoja se cierra y TalkBack lo anuncia. */}
      <View collapsable={false} accessibilityLiveRegion="polite">
        {aviso ? (
          <View style={styles.filaIcono}>
            <View style={styles.iconoLinea}>
              {aviso.tipo === 'exito' ? (
                <CircleCheck color={colores.exito} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
              ) : (
                <Info color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
              )}
            </View>
            <Text style={[styles.textoFuerte, { color: colores.texto }]}>{aviso.texto}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.resumen}>
        <View style={styles.insignias}>
          <BadgePedido pedido={pedido} />
        </View>
        {fecha ? (
          <View style={styles.filaIcono} accessible accessibilityLabel={`Pedido hecho el ${fecha}`}>
            <View style={styles.iconoLinea}>
              <CalendarDays color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            </View>
            <Text style={[styles.cuerpo, { color: colores.texto }]}>Hecho el {fecha}</Text>
          </View>
        ) : null}
      </View>

      {queSigue ? (
        <Tarjeta>
          <Text accessibilityRole="header" style={[styles.tituloTarjeta, { color: colores.texto }]}>
            Qué sigue
          </Text>
          <Text style={[styles.cuerpo, { color: colores.texto }]}>{queSigue}</Text>
          {pagar ? (
            <>
              {limite ? (
                <View style={styles.filaIcono}>
                  <View style={styles.iconoLinea}>
                    <Hourglass color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
                  </View>
                  <Text style={[styles.textoFuerte, { color: colores.texto }]}>Paga antes del {limite}.</Text>
                </View>
              ) : null}
              <Button titulo="Completar el pago" onPress={onPagar} />
            </>
          ) : null}
        </Tarjeta>
      ) : null}

      <Tarjeta>
        <Text accessibilityRole="header" style={[styles.tituloTarjeta, { color: colores.texto }]}>
          Artículos
        </Text>
        {/* Un pedido trae pocos artículos y va dentro de este ScrollView: map en lugar de FlatList. */}
        <View style={styles.articulos}>
          {pedido.items.map((item, indice) => (
            <View key={item.id} style={styles.articulos}>
              {indice > 0 ? <View style={[styles.linea, { backgroundColor: colores.hairline }]} /> : null}
              <FilaArticuloPedido item={item} />
            </View>
          ))}
        </View>
        <View style={[styles.linea, { backgroundColor: colores.hairline }]} />
        <View
          style={styles.monto}
          accessible
          accessibilityLabel={`Total: ${total}, ${textoPiezas(pedido.piezas)}`}
        >
          <View>
            <Text style={[styles.etiquetaMonto, { color: colores.texto }]}>Total</Text>
            <Text style={[styles.detalle, { color: colores.texto }]}>{textoPiezas(pedido.piezas)}</Text>
          </View>
          <Text style={[styles.cifra, { color: colores.texto }]}>{total}</Text>
        </View>
        <View
          style={styles.pago}
          accessible
          accessibilityLabel={`Forma de pago: ${etiquetaMetodoPago(pedido.metodoPago)}`}
        >
          <Text style={[styles.etiquetaMonto, { color: colores.texto }]}>Forma de pago</Text>
          <Text style={[styles.cuerpo, { color: colores.texto }]}>{etiquetaMetodoPago(pedido.metodoPago)}</Text>
        </View>
      </Tarjeta>

      {recoger ? (
        <Tarjeta>
          <Text accessibilityRole="header" style={[styles.tituloTarjeta, { color: colores.texto }]}>
            Recoger en el salón
          </Text>
          <DatosRecogerSalon />
        </Tarjeta>
      ) : null}

      {puedeCancelar(pedido) ? (
        <View style={styles.acciones}>
          <Button titulo="Cancelar pedido" variante="peligro" onPress={onCancelar} />
        </View>
      ) : null}
    </Animated.View>
  );
}

function Tarjeta({ children }: { children: ReactNode }) {
  const { colores } = useTheme();
  return (
    <View style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombra }]}>
      {children}
    </View>
  );
}

/** Skeleton con la forma del detalle: insignia, fecha, qué sigue y artículos. */
function Esqueleto() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Cargando tu pedido" style={styles.contenido}>
      <Skeleton estilo={styles.badgeEsqueleto} />
      <Skeleton estilo={styles.lineaMedia} />
      <View style={styles.bloqueEsqueleto}>
        <Skeleton estilo={styles.tituloEsqueleto} />
        <Skeleton estilo={styles.lineaEsqueleto} />
        <Skeleton estilo={styles.lineaCorta} />
      </View>
      <View style={styles.bloqueEsqueleto}>
        <Skeleton estilo={styles.tituloEsqueleto} />
        {[0, 1].map((i) => (
          <View key={i} style={styles.filaEsqueleto}>
            <Skeleton estilo={styles.miniaturaEsqueleto} />
            <View style={styles.textosEsqueleto}>
              <Skeleton estilo={styles.lineaMedia} />
              <Skeleton estilo={styles.lineaCorta} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  contenido: {
    paddingHorizontal: pantalla.margen,
    gap: espacio.xl,
  },
  bloques: {
    gap: espacio.xl,
  },
  resumen: {
    gap: espacio.m,
  },
  insignias: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacio.s,
  },
  tarjeta: {
    padding: espacio.xl,
    gap: espacio.m,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  tituloTarjeta: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
  },
  articulos: {
    gap: espacio.m,
  },
  linea: {
    height: borde.hairline,
  },
  monto: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: espacio.m,
  },
  pago: {
    gap: espacio.xxs,
  },
  etiquetaMonto: {
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
  cifra: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    fontVariant: ['tabular-nums'],
  },
  filaIcono: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  iconoLinea: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.cuerpo.linea - icono.tamanoPequeno) / 2,
  },
  textoFuerte: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
  cuerpo: {
    flexShrink: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
  acciones: {
    marginTop: espacio.s,
    gap: espacio.m,
  },
  estado: {
    flexGrow: 1,
    paddingHorizontal: pantalla.margen,
  },
  bloqueEsqueleto: {
    gap: espacio.m,
  },
  tituloEsqueleto: {
    width: esqueleto.anchoCorto,
    height: tipo.subtitulo.linea,
  },
  lineaEsqueleto: {
    height: esqueleto.linea,
  },
  lineaCorta: {
    width: esqueleto.anchoCorto,
    height: esqueleto.linea,
  },
  lineaMedia: {
    width: esqueleto.anchoMedio,
    height: esqueleto.linea,
  },
  badgeEsqueleto: {
    width: toqueMinimo * 2,
    height: tipo.etiqueta.linea + espacio.s,
    borderRadius: radio.pastilla,
  },
  filaEsqueleto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
  },
  miniaturaEsqueleto: {
    width: tienda.miniatura,
    height: tienda.miniatura,
    borderRadius: radio.campo,
  },
  textosEsqueleto: {
    flex: 1,
    gap: espacio.s,
  },
});
