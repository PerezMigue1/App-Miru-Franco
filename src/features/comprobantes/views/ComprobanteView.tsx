import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { BotonCromo, CabeceraCompacta, TituloPagina } from '@/shared/ui/CabeceraCompacta';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import { espacio, esqueleto, fuente, pantalla, radio, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { TicketComprobante } from '../components/TicketComprobante';
import { useTextosComprobante } from '../viewmodels/textosComprobante';
import { useComprobanteViewModel, type TicketVisible } from '../viewmodels/useComprobanteViewModel';

/**
 * Comprobante de una compra de la clienta (GP-09): /comprobante?tipo=pedido|cita|venta&id=N. Se abre
 * desde "Ver comprobante" del detalle del pedido o de la cita y desde el aviso "Te enviamos tu
 * comprobante". Encabezado de la pila con Volver y el ticket; mientras carga, su skeleton.
 */
export default function ComprobanteView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { tipo, id } = useLocalSearchParams<{ tipo?: string; id?: string }>();
  const vm = useComprobanteViewModel(tipo, id);
  const textos = useTextosComprobante();
  const contenido = [styles.contenido, { paddingBottom: bottom + espacio.x3 }];

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <CabeceraCompacta izquierda={<BotonCromo icono={ArrowLeft} etiqueta="Volver" onPress={vm.regresar} />} />
      <TituloPagina titulo={textos.titulo} />

      {vm.estado === 'listo' && vm.ticket ? (
        <ScrollView contentContainerStyle={contenido}>
          <Ticket ticket={vm.ticket} />
        </ScrollView>
      ) : null}

      {vm.estado === 'cargando' ? <Esqueleto etiqueta={textos.cargando} /> : null}

      {vm.estado === 'noEncontrado' || vm.estado === 'invalido' ? (
        <ScrollView contentContainerStyle={contenido}>
          <EmptyState
            titulo={textos.noEncontradoTitulo}
            mensaje={vm.estado === 'invalido' ? textos.enlaceInvalido : textos.noEncontradoTexto}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'error' ? (
        <ScrollView contentContainerStyle={contenido}>
          {/* El motivo (sin red, límite de solicitudes...) se anuncia al aparecer. */}
          <View collapsable={false} accessibilityLiveRegion="polite">
            <EmptyState titulo={textos.errorTitulo} mensaje={vm.mensajeError ?? ''} />
          </View>
          <Button
            titulo={vm.textoReintentar}
            variante="secundario"
            deshabilitado={vm.reintentarDeshabilitado}
            onPress={vm.reintentar}
          />
        </ScrollView>
      ) : null}
    </View>
  );
}

/** El ticket con su aparición (solo opacidad con movimiento reducido) y la nota del correo. */
function Ticket({ ticket }: Readonly<{ ticket: TicketVisible }>) {
  const { colores } = useTheme();
  const entrada = useEntradaContenido();
  return (
    <Animated.View entering={entrada} style={styles.bloques}>
      <TicketComprobante ticket={ticket} />
      {ticket.enviado ? <Text style={[styles.nota, { color: colores.textoSuave }]}>{ticket.enviado}</Text> : null}
    </Animated.View>
  );
}

/** Skeleton con la forma del ticket: encabezado, datos, filas de la tabla y total. */
function Esqueleto({ etiqueta }: Readonly<{ etiqueta: string }>) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={etiqueta} style={styles.contenido}>
      <Skeleton estilo={styles.encabezadoEsqueleto} />
      <Skeleton estilo={styles.lineaMedia} />
      <Skeleton estilo={styles.lineaCorta} />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} estilo={styles.linea} />
      ))}
      <Skeleton estilo={styles.lineaCorta} />
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  contenido: {
    flexGrow: 1,
    paddingHorizontal: pantalla.margen,
    gap: espacio.l,
  },
  bloques: {
    gap: espacio.l,
  },
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    textAlign: 'center',
  },
  encabezadoEsqueleto: {
    height: tipo.subtitulo.linea * 2 + espacio.m * 2,
    borderRadius: radio.tarjeta,
  },
  linea: {
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
});
