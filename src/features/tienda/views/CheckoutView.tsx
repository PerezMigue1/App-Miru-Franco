import { CreditCard, Store } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { IndicadorPasos } from '@/features/citas/components/IndicadorPasos';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  borde,
  espacio,
  esqueleto,
  fuente,
  pantalla,
  radio,
  sombra,
  tipo,
  tracking,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

import { DatosRecogerSalon } from '../components/DatosRecogerSalon';
import { OpcionPago } from '../components/OpcionPago';
import { DatoCompra, ResumenCompra } from '../components/ResumenCompra';
import { SALON_RECOGER, etiquetaMetodoPago } from '../models/pedidoModel';
import { formatoPrecio } from '../models/productoModel';
import {
  PASOS_CHECKOUT,
  useCheckoutViewModel,
  type CheckoutViewModel,
} from '../viewmodels/useCheckoutViewModel';

/** Finalizar compra en tres pasos: recoger en el salón, forma de pago y revisar y confirmar. */
export default function CheckoutView() {
  const { colores } = useTheme();
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

  const enLinea = vm.metodo === 'mercado_pago';
  const tituloFinal = enLinea ? 'Ir a pagar con Mercado Pago' : 'Apartar mi pedido';

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo="Finalizar compra" onVolver={vm.atras} />

      {vm.estado === 'cargando' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Cargando tu compra"
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
            titulo="No pudimos cargar tu carrito"
            mensaje="Revisa tu conexión e intenta de nuevo."
            accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'listo' ? (
        <>
          <ScrollView
            ref={refScroll}
            contentContainerStyle={[styles.contenido, { paddingBottom: espacio.xxl }]}
          >
            <IndicadorPasos ref={refIndicador} pasos={PASOS_CHECKOUT} actual={vm.paso} />
            <Animated.View key={vm.paso} entering={entrada} style={styles.paso}>
              {vm.paso === 1 ? <PasoRecoger /> : null}
              {vm.paso === 2 ? <PasoFormaPago vm={vm} /> : null}
              {vm.paso === 3 ? <PasoConfirmar vm={vm} /> : null}
            </Animated.View>
          </ScrollView>

          <View
            style={[
              styles.pie,
              { borderTopColor: colores.hairline, paddingBottom: bottom + espacio.l },
            ]}
          >
            {/* Región en vivo siempre montada: el error se anuncia una vez al aparecer. */}
            <View collapsable={false} accessibilityLiveRegion="polite">
              {vm.paso === 3 && vm.errorEnvio ? (
                <Text style={[styles.error, { color: colores.peligro }]}>{vm.errorEnvio}</Text>
              ) : null}
            </View>
            {vm.paso === 3 && vm.revisarCarrito ? (
              <Button titulo="Revisar mi carrito" variante="secundario" onPress={vm.irAlCarrito} />
            ) : null}
            {vm.paso === 3 ? (
              <Button
                titulo={tituloFinal}
                onPress={vm.confirmar}
                cargando={vm.enviando}
                accessibilityHint={
                  enLinea ? 'Crea tu pedido y abre Mercado Pago en el navegador' : 'Crea tu pedido'
                }
              />
            ) : (
              <Button titulo="Continuar" onPress={vm.continuar} />
            )}
          </View>
        </>
      ) : null}
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
function PasoRecoger() {
  const { colores } = useTheme();
  return (
    <>
      <Subtitulo
        titulo="Recoges tu pedido en el salón"
        texto="Lo preparamos y te lo apartamos en el mostrador."
      />
      <View
        style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombra }]}
      >
        <DatosRecogerSalon conAviso />
      </View>
    </>
  );
}

/** Paso 2: pagar en línea o al recoger. */
function PasoFormaPago({ vm }: { vm: CheckoutViewModel }) {
  const { colores } = useTheme();
  const total = formatoPrecio(vm.total);
  const nota =
    vm.metodo === 'mercado_pago'
      ? `Al confirmar te llevamos a Mercado Pago para pagar ${total}. Tu tarjeta la escribes allá: la app no la ve ni la guarda. Tienes 24 horas para completar el pago.`
      : `Tu pedido queda apartado. Pagas ${total} en el mostrador cuando pases por él.`;
  return (
    <>
      <Subtitulo
        titulo="¿Cómo quieres pagar?"
        texto="En los dos casos recoges tu pedido en el salón."
      />
      <View accessibilityRole="radiogroup" style={styles.opciones}>
        <OpcionPago
          titulo="Pagar en línea con Mercado Pago"
          descripcion="Con tarjeta en la página segura de Mercado Pago."
          Icono={CreditCard}
          elegida={vm.metodo === 'mercado_pago'}
          onPress={() => vm.elegirMetodo('mercado_pago')}
        />
        <OpcionPago
          titulo="Pagar al recoger en el salón"
          descripcion="Te apartamos el pedido y lo pagas en el mostrador cuando pases por él."
          Icono={Store}
          elegida={vm.metodo === 'pago_en_salon'}
          onPress={() => vm.elegirMetodo('pago_en_salon')}
        />
      </View>
      <View collapsable={false} accessibilityLiveRegion="polite">
        <Text style={[styles.cuerpo, styles.cifra, { color: colores.texto }]}>{nota}</Text>
      </View>
    </>
  );
}

/** Paso 3: artículos, forma de pago, dónde se recoge y total. */
function PasoConfirmar({ vm }: { vm: CheckoutViewModel }) {
  const { colores } = useTheme();
  return (
    <>
      <Subtitulo
        titulo="Revisa y confirma"
        texto="Revisa tus productos antes de crear tu pedido."
      />
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
        <View style={[styles.datos, { borderTopColor: colores.hairline }]}>
          <DatoCompra etiqueta="Forma de pago" valor={etiquetaMetodoPago(vm.metodo)} />
          <DatoCompra
            etiqueta="Recoges en"
            valor={`${SALON_RECOGER.nombre}, ${SALON_RECOGER.direccion}`}
          />
        </View>
      </ResumenCompra>
      <Text style={[styles.nota, { color: colores.textoSuave }]}>
        Total estimado: el total final se confirma al crear tu pedido.
      </Text>
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
    letterSpacing: tracking.titulo,
  },
  cuerpo: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  cifra: {
    fontVariant: ['tabular-nums'],
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
