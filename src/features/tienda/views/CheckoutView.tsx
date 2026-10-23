import { CircleAlert, CreditCard, Store } from 'lucide-react-native';
import { useEffect, useRef, type RefObject } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { IndicadorPasos } from '@/features/citas/components/IndicadorPasos';
import { Button } from '@/shared/ui/Button';
import { DatosTransferencia } from '@/shared/ui/DatosTransferencia';
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
  tipo,
  tracking,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

import { CasillasCompra } from '../components/CasillasCompra';
import { DatosRecogerSalon } from '../components/DatosRecogerSalon';
import { InformacionCompra } from '../components/InformacionCompra';
import { OpcionPago } from '../components/OpcionPago';
import { DatoCompra, ResumenCompra } from '../components/ResumenCompra';
import { etiquetaMetodoPago } from '../viewmodels/presentacionTienda';
import { useTextosTienda } from '../viewmodels/textosTienda';
import {
  PASOS_CHECKOUT,
  useCheckoutViewModel,
  type CheckoutViewModel,
} from '../viewmodels/useCheckoutViewModel';

/** Finalizar compra en tres pasos: recoger en el salón, forma de pago y revisar y confirmar. */
export default function CheckoutView() {
  const { colores } = useTheme();
  const textos = useTextosTienda();
  const { bottom } = useSafeAreaInsets();
  const vm = useCheckoutViewModel();
  const reducido = useMovimientoReducido();
  // Cada paso entra con opacidad y 8px hacia arriba (solo opacidad con movimiento reducido).
  const entrada = useEntradaContenido();
  const refIndicador = useRef<View>(null);
  const refScroll = useRef<ScrollView>(null);
  const pasoAnterior = useRef(vm.paso);

  // Al cambiar de paso, la pantalla vuelve arriba y el indicador recibe el foco de TalkBack.
  useEffect(() => {
    if (pasoAnterior.current === vm.paso) {
      return;
    }
    pasoAnterior.current = vm.paso;
    refScroll.current?.scrollTo({ y: 0, animated: !reducido });
    if (refIndicador.current) {
      AccessibilityInfo.sendAccessibilityEvent(refIndicador.current, 'focus');
    }
  }, [vm.paso, reducido]);

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo={textos.checkout.titulo} subtitulo={textos.checkout.subtitulo} onVolver={vm.atras} />

      {vm.estado === 'cargando' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={textos.checkout.cargando}
          style={styles.contenido}
        >
          <Skeleton estilo={styles.indicadorEsqueleto} />
          <Skeleton estilo={styles.subtituloEsqueleto} />
          <Skeleton estilo={styles.lineaEsqueleto} />
          <Skeleton estilo={styles.tarjetaEsqueleto} />
        </View>
      ) : null}

      {vm.estado === 'error' ? (
        <ScrollView contentContainerStyle={[styles.estado, { paddingBottom: bottom + espacio.x3 }]}>
          <EmptyState
            titulo={textos.carrito.errorTitulo}
            mensaje={vm.mensajeError ?? ''}
            accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'listo' ? (
        <ContenidoListo
          vm={vm}
          bottom={bottom}
          entrada={entrada}
          refScroll={refScroll}
          refIndicador={refIndicador}
        />
      ) : null}
    </View>
  );
}

/** Pasos del checkout con su indicador y el pie de acciones. */
function ContenidoListo({
  vm,
  bottom,
  entrada,
  refScroll,
  refIndicador,
}: {
  vm: CheckoutViewModel;
  bottom: number;
  entrada: ReturnType<typeof useEntradaContenido>;
  refScroll: RefObject<ScrollView | null>;
  refIndicador: RefObject<View | null>;
}) {
  return (
    <>
      <ScrollView
        ref={refScroll}
        contentContainerStyle={[styles.contenido, { paddingBottom: espacio.xxl }]}
      >
        <IndicadorPasos ref={refIndicador} pasos={PASOS_CHECKOUT} actual={vm.paso} />
        <Animated.View key={vm.paso} entering={entrada} style={styles.paso}>
          {vm.paso === 1 ? <PasoRecoger vm={vm} /> : null}
          {vm.paso === 2 ? <PasoFormaPago vm={vm} /> : null}
          {vm.paso === 3 ? <PasoConfirmar vm={vm} /> : null}
        </Animated.View>
      </ScrollView>

      <PieCheckout vm={vm} bottom={bottom} />
    </>
  );
}

/** Pie fijo: error de envío, casillas por marcar, revisar carrito y el botón para avanzar o confirmar. */
function PieCheckout({ vm, bottom }: { vm: CheckoutViewModel; bottom: number }) {
  const { colores } = useTheme();
  const textos = useTextosTienda();
  const enLinea = vm.metodo === 'mercado_pago';
  const mensaje = vm.paso === 3 ? (vm.errorEnvio ?? vm.avisoCasillas) : null;

  return (
    <View
      style={[
        styles.pie,
        { borderTopColor: colores.hairline, paddingBottom: bottom + espacio.l },
      ]}
    >
      {/* Región en vivo siempre montada: el error se anuncia una vez al aparecer. */}
      <View collapsable={false} accessibilityLiveRegion="polite">
        {mensaje ? <Text style={[styles.error, { color: colores.peligro }]}>{mensaje}</Text> : null}
      </View>
      {vm.paso === 3 && vm.revisarCarrito ? (
        <Button titulo={textos.checkout.revisarCarrito} variante="secundario" onPress={vm.irAlCarrito} />
      ) : null}
      {/* No se sabe si el pedido se creó: en lugar de confirmar otra vez, revisar Mis pedidos. */}
      {vm.paso === 3 && vm.revisarMisPedidos ? (
        <Button titulo={vm.textoVerMisPedidos} onPress={vm.verMisPedidos} />
      ) : null}
      {vm.paso === 3 && !vm.revisarMisPedidos ? (
        <Button
          titulo={vm.botonFinal || textos.checkout.confirmarPedido}
          onPress={vm.confirmar}
          cargando={vm.enviando}
          deshabilitado={vm.metodo === null}
          accessibilityHint={enLinea ? textos.checkout.ayudaLinea : textos.checkout.ayudaSalon}
        />
      ) : null}
      {vm.paso === 3 ? null : (
        <Button titulo="Continuar" onPress={vm.continuar} deshabilitado={!vm.puedeContinuar} />
      )}
    </View>
  );
}

function Subtitulo({ titulo, texto }: { titulo: string; texto: string }) {
  const { colores } = useTheme();
  return (
    <View style={styles.encabezadoPaso}>
      <Text accessibilityRole="header" style={[styles.subtitulo, { color: colores.texto }]}>
        {titulo}
      </Text>
      <Text style={[styles.cuerpo, { color: colores.textoSuave }]}>{texto}</Text>
    </View>
  );
}

/** Paso 1: se recoge en el salón. Sin dirección de envío ni costo de envío. */
function PasoRecoger({ vm }: { vm: CheckoutViewModel }) {
  const { colores } = useTheme();
  return (
    <>
      <Subtitulo titulo={vm.textos.recogerTitulo} texto={vm.textos.recogerTexto} />
      <View
        style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}
      >
        <DatosRecogerSalon conAviso />
      </View>
    </>
  );
}

/** Paso 2: solo las formas de pago activas para la tienda; sin ninguna, que llame al salón. */
function PasoFormaPago({ vm }: { vm: CheckoutViewModel }) {
  const textos = useTextosTienda();
  if (vm.sinMetodos) {
    return (
      <EmptyState
        titulo={vm.sinMetodos.titulo}
        mensaje={vm.sinMetodos.texto}
        accion={{ titulo: textos.checkout.llamarSalon, onPress: vm.llamarSalon }}
      />
    );
  }
  return (
    <>
      <Subtitulo titulo={textos.checkout.comoPagar} texto={vm.notaOpciones} />
      <View accessibilityRole="radiogroup" style={styles.opciones}>
        {vm.opciones.map((opcion) => (
          <OpcionPago
            key={opcion.metodo}
            titulo={opcion.titulo}
            descripcion={opcion.descripcion}
            Icono={opcion.metodo === 'mercado_pago' ? CreditCard : Store}
            elegida={vm.metodo === opcion.metodo}
            onPress={() => vm.elegirMetodo(opcion.metodo)}
          />
        ))}
      </View>
      <DetalleMetodo vm={vm} />
    </>
  );
}

/** Aviso de la forma de pago con el total, sus plazos y, al recoger, los datos de transferencia. */
function DetalleMetodo({ vm }: { vm: CheckoutViewModel }) {
  const { colores } = useTheme();
  return (
    <>
      <View collapsable={false} accessibilityLiveRegion="polite" style={styles.detalle}>
        {vm.avisoMetodoCambiado ? (
          <View style={styles.filaAviso}>
            <CircleAlert color={colores.aviso} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            <Text style={[styles.cuerpo, styles.flexible, { color: colores.texto }]}>{vm.avisoMetodoCambiado}</Text>
          </View>
        ) : null}
        <View style={[styles.panel, { backgroundColor: colores.superficieSecundaria }]}>
          <Text style={[styles.parrafo, styles.cifra, { color: colores.texto }]}>{vm.aviso}</Text>
        </View>
      </View>
      <Plazos vm={vm} />
      {vm.transferencia ? <DatosTransferencia datos={vm.transferencia} /> : null}
    </>
  );
}

/** Lista de plazos de la forma de pago elegida (de las reglas de la tienda). */
function Plazos({ vm }: { vm: CheckoutViewModel }) {
  const { colores } = useTheme();
  if (vm.plazos.length === 0) {
    return null;
  }
  return (
    <View style={styles.plazos}>
      <Text accessibilityRole="header" style={[styles.etiquetaSeccion, { color: colores.texto }]}>
        {vm.textos.plazosTitulo}
      </Text>
      {vm.plazos.map((plazo) => (
        <Text key={plazo} style={[styles.cuerpo, styles.cifra, { color: colores.textoSuave }]}>
          {plazo}
        </Text>
      ))}
    </View>
  );
}

/** Paso 3: artículos y total con IVA, forma de pago, plazos, información de la compra y casillas. */
function PasoConfirmar({ vm }: { vm: CheckoutViewModel }) {
  const { colores } = useTheme();
  const textos = useTextosTienda();
  return (
    <>
      <Subtitulo titulo={textos.checkout.revisaTitulo} texto={textos.checkout.revisaTexto} />
      <ResumenCompra
        lineas={vm.items.map((item) => ({
          clave: item.id,
          nombre: item.nombre,
          tamanio: item.tamanio,
          cantidad: item.cantidad,
          subtotalCentavos: item.precioCentavos * item.cantidad,
        }))}
        totalCentavos={vm.total}
      >
        <Text style={[styles.nota, { color: colores.textoSuave }]}>{vm.textos.leyendaPrecios}</Text>
        <View style={[styles.datos, { borderTopColor: colores.hairline }]}>
          {vm.metodo ? <DatoCompra etiqueta={textos.checkout.formaPago} valor={etiquetaMetodoPago(vm.metodo)} /> : null}
          <DatoCompra etiqueta={textos.checkout.recogesEn} valor={vm.recogesEn} />
        </View>
      </ResumenCompra>
      <Plazos vm={vm} />
      <InformacionCompra />
      <CasillasCompra
        titulo={vm.textos.casillasTitulo}
        casillas={vm.casillas}
        onCambiar={vm.cambiarCasilla}
        onAbrir={vm.abrirDocumento}
        deshabilitadas={vm.enviando}
      />
    </>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  contenido: {
    paddingHorizontal: pantalla.margen,
    gap: espacio.xxl,
  },
  estado: {
    flexGrow: 1,
    paddingHorizontal: pantalla.margen,
  },
  paso: {
    gap: espacio.xl,
  },
  encabezadoPaso: {
    gap: espacio.xs,
  },
  subtitulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  cuerpo: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  // Aviso extenso de la forma de pago: interlineado de párrafo largo.
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  cifra: {
    fontVariant: ['tabular-nums'],
  },
  flexible: {
    flex: 1,
  },
  detalle: {
    gap: espacio.m,
  },
  filaAviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.s,
  },
  // Aviso de la forma de pago sobre la superficie secundaria (fondos suaves de la web), sin borde.
  panel: {
    padding: espacio.l,
    borderRadius: radio.campo,
  },
  plazos: {
    gap: espacio.xs,
  },
  etiquetaSeccion: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  tarjeta: {
    padding: espacio.xl,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  opciones: {
    gap: espacio.m,
  },
  datos: {
    gap: espacio.m,
    paddingTop: espacio.m,
    borderTopWidth: borde.hairline,
  },
  pie: {
    gap: espacio.m,
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.l,
    borderTopWidth: borde.hairline,
  },
  error: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  indicadorEsqueleto: {
    height: esqueleto.lineaGrande,
  },
  subtituloEsqueleto: {
    width: esqueleto.anchoMedio,
    height: tipo.subtitulo.linea,
  },
  lineaEsqueleto: {
    width: esqueleto.anchoCorto,
    height: esqueleto.linea,
  },
  tarjetaEsqueleto: {
    height: tipo.titulo.linea * 5,
    borderRadius: radio.tarjeta,
  },
});
