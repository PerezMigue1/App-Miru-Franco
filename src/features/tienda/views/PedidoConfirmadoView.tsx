import { useLocalSearchParams } from 'expo-router';
import { CircleAlert, CircleCheck, Hourglass } from 'lucide-react-native';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, Keyframe, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { EASE_SALIDA, useEntradaContenido } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  borde,
  confirmacion,
  duracion,
  escalaEntrada,
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

import { BadgePedido } from '../components/BadgePedido';
import { DatosRecogerSalon } from '../components/DatosRecogerSalon';
import { DatoCompra, ResumenCompra } from '../components/ResumenCompra';
import { esPagoEnSalon, etiquetaMetodoPago, fechaPedido } from '../viewmodels/presentacionTienda';
import {
  usePedidoConfirmadoViewModel,
  type Pedido,
  type PedidoConfirmadoViewModel,
} from '../viewmodels/usePedidoConfirmadoViewModel';

/** Primera letra en mayúscula ("Sábado 18 de octubre"). */
function conMayuscula(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** Confirmación del pedido: estado del pago (o del apartado), detalle y qué sigue. */
export default function PedidoConfirmadoView() {
  const { colores } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { pedidoId, pagar, retorno, origen } = useLocalSearchParams<{
    pedidoId: string;
    pagar?: string;
    retorno?: string;
    origen?: string;
  }>();
  // pagar=1 llega del checkout: abre Mercado Pago una vez. retorno=mp llega del regreso de
  // Mercado Pago en arranque en frío: verifica el pago. Nada de esto decide el estado.
  const vm = usePedidoConfirmadoViewModel(pedidoId, pagar === '1', retorno === 'mp', origen === 'pedido');
  const { textos } = vm;

  const relleno = { paddingTop: top + espacio.x4, paddingBottom: bottom + espacio.xxl };

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <ScrollView contentContainerStyle={[styles.contenido, relleno]}>
        {vm.estado === 'listo' && vm.pedido ? <Contenido vm={vm} pedido={vm.pedido} /> : null}

        {vm.estado === 'cargando' ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={textos.cargando}
            style={styles.esqueleto}
          >
            <Skeleton estilo={styles.iconoEsqueleto} />
            <Skeleton estilo={styles.tituloEsqueleto} />
            <Skeleton estilo={styles.lineaCorta} />
            <Skeleton estilo={styles.tarjetaEsqueleto} />
          </View>
        ) : null}

        {vm.estado === 'error' ? (
          <>
            <EmptyState
              titulo={textos.errorCargaTitulo}
              mensaje={vm.mensajeError ?? textos.errorCargaTexto}
              accion={{ titulo: textos.botonReintentarCarga, onPress: vm.recargar }}
            />
            <Button titulo={textos.botonMisPedidos} variante="contorno" onPress={vm.verMisPedidos} />
          </>
        ) : null}

        {vm.estado === 'noEncontrado' ? (
          <>
            <EmptyState
              titulo={textos.noEncontradoTitulo}
              mensaje={textos.noEncontradoTexto}
              accion={{ titulo: textos.botonMisPedidos, onPress: vm.verMisPedidos }}
            />
            <Button titulo={textos.botonSeguirComprando} variante="contorno" onPress={vm.seguirComprando} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Contenido({ vm, pedido }: { vm: PedidoConfirmadoViewModel; pedido: Pedido }) {
  const { textos } = vm;
  // El bloque del estado entra una vez cada que el estado cambia (opacidad y 8px; solo opacidad
  // con movimiento reducido).
  const entrada = useEntradaContenido();
  const mostrarRecoger = esPagoEnSalon(pedido) && vm.vista !== 'cancelado';
  // La verificación en curso sobre un estado ya conocido (por ejemplo, pago en proceso) se ve aparte.
  const verificandoAparte = vm.consultando && vm.vista !== 'consultando';

  return (
    <>
      {/* Región en vivo: los cambios de estado del pago se anuncian solos. */}
      <View collapsable={false} accessibilityLiveRegion="polite">
        <MomentoEstado
          key={vm.vista}
          vista={vm.vista}
          entrada={entrada}
          titulo={textos.titulo}
          mensaje={textos.mensaje}
          pagoEnMostrador={textos.pagoEnMostrador}
          verificando={textos.verificando}
        />
        {verificandoAparte ? <IndicadorVerificando texto={textos.verificando} /> : null}
        <AvisosPago
          abriendo={vm.abriendo}
          textoAbriendo={textos.abriendo}
          errorPago={vm.errorPago}
          errorConsulta={vm.errorConsulta}
        />
      </View>

      <ResumenCompra
        lineas={pedido.items.map((item) => ({
          clave: item.id,
          nombre: item.nombre,
          tamanio: item.tamanio,
          cantidad: item.cantidad,
          subtotalCentavos: item.subtotalCentavos,
        }))}
        totalCentavos={pedido.totalCentavos}
        encabezado={<EncabezadoPedido pedido={pedido} pagoEnProceso={vm.pagoEnProceso} />}
      >
        <DatosPago pedido={pedido} etiqueta={textos.formaPago} plazo={textos.plazo} />
      </ResumenCompra>

      {mostrarRecoger ? <TarjetaRecoger titulo={textos.dondeRecoges} /> : null}

      <AccionesPedido vm={vm} />
    </>
  );
}

/** Ícono, título y mensaje del estado; entra de nuevo cada que cambia la vista. */
function MomentoEstado({
  vista,
  entrada,
  titulo,
  mensaje,
  pagoEnMostrador,
  verificando,
}: {
  vista: PedidoConfirmadoViewModel['vista'];
  entrada: ReturnType<typeof useEntradaContenido>;
  titulo: string;
  mensaje: string;
  pagoEnMostrador: string | null;
  verificando: string;
}) {
  const { colores } = useTheme();
  const conMomento = vista === 'aprobado' || vista === 'apartado';
  return (
    <Animated.View entering={entrada} style={styles.momento}>
      {conMomento ? <IconoConfirmacion /> : null}
      {vista === 'noCompletado' || vista === 'cancelado' ? (
        <View accessible={false} importantForAccessibility="no-hide-descendants">
          <CircleAlert color={colores.texto} size={confirmacion.icono} strokeWidth={icono.trazo} />
        </View>
      ) : null}
      {vista === 'pendiente' || vista === 'porPagar' ? (
        <View accessible={false} importantForAccessibility="no-hide-descendants">
          <Hourglass color={colores.texto} size={confirmacion.icono} strokeWidth={icono.trazo} />
        </View>
      ) : null}
      {vista === 'consultando' ? (
        // Indicador de la verificación: el pulso del skeleton (fijo con movimiento reducido).
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={verificando}
          accessibilityState={{ busy: true }}
        >
          <Skeleton estilo={styles.iconoEsqueleto} />
        </View>
      ) : null}
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
        {titulo}
      </Text>
      {mensaje ? <Text style={[styles.mensaje, { color: colores.textoSuave }]}>{mensaje}</Text> : null}
      {pagoEnMostrador ? (
        <Text style={[styles.mensaje, styles.cifra, { color: colores.texto }]}>{pagoEnMostrador}</Text>
      ) : null}
    </Animated.View>
  );
}

/** "Verificando tu pago" debajo de un estado ya conocido mientras se vuelve a consultar. */
function IndicadorVerificando({ texto }: { texto: string }) {
  const { colores } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={texto}
      accessibilityState={{ busy: true }}
      style={styles.verificando}
    >
      <View style={styles.iconoLinea}>
        <Skeleton estilo={styles.puntoVerificando} />
      </View>
      <Text style={[styles.textoVerificando, { color: colores.textoSuave }]}>{texto}</Text>
    </View>
  );
}

function AvisosPago({
  abriendo,
  textoAbriendo,
  errorPago,
  errorConsulta,
}: Pick<PedidoConfirmadoViewModel, 'abriendo' | 'errorPago' | 'errorConsulta'> & { textoAbriendo: string }) {
  const { colores } = useTheme();
  return (
    <>
      {abriendo ? <Text style={[styles.aviso, { color: colores.textoSuave }]}>{textoAbriendo}</Text> : null}
      {errorPago ? <FilaAviso texto={errorPago} /> : null}
      {errorConsulta ? <FilaAviso texto={errorConsulta} /> : null}
    </>
  );
}

function EncabezadoPedido({ pedido, pagoEnProceso }: { pedido: Pedido; pagoEnProceso: boolean }) {
  const { colores } = useTheme();
  const fecha = conMayuscula(fechaPedido(pedido));
  return (
    <View style={styles.encabezadoPedido}>
      <View style={styles.filaPedido}>
        <Text style={[styles.numeroPedido, { color: colores.texto }]}>Pedido #{pedido.id}</Text>
        <BadgePedido pedido={pedido} pagoEnProceso={pagoEnProceso} />
      </View>
      {fecha ? <Text style={[styles.fecha, { color: colores.textoSuave }]}>{fecha}</Text> : null}
    </View>
  );
}

function DatosPago({ pedido, etiqueta, plazo }: { pedido: Pedido; etiqueta: string; plazo: string | null }) {
  const { colores } = useTheme();
  return (
    <View style={[styles.datos, { borderTopColor: colores.hairline }]}>
      <DatoCompra etiqueta={etiqueta} valor={etiquetaMetodoPago(pedido.metodoPago)} />
      {plazo ? (
        <View style={styles.plazo} accessible accessibilityLabel={plazo}>
          <View style={styles.iconoLinea}>
            <Hourglass color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          </View>
          <Text style={[styles.textoPlazo, { color: colores.texto }]}>{plazo}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TarjetaRecoger({ titulo }: { titulo: string }) {
  const { colores } = useTheme();
  return (
    <View
      style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}
    >
      <Text accessibilityRole="header" style={[styles.subtitulo, { color: colores.texto }]}>
        {titulo}
      </Text>
      <DatosRecogerSalon />
    </View>
  );
}

/** "Volver al carrito" en el lugar de pagar, con la misma variante que tendría pagar ahí. */
function BotonVolverCarrito({ vm, variante }: { vm: PedidoConfirmadoViewModel; variante: 'primario' | 'contorno' }) {
  return (
    <Button
      titulo={vm.textos.botonVolverCarrito}
      variante={variante}
      onPress={vm.irAlCarrito}
      accessibilityHint={vm.textos.pistaVolverCarrito}
    />
  );
}

/**
 * Un solo botón primario: pagar o revisar el pago cuando aplica; si no, Mis pedidos.
 * Tras volver de Mercado Pago sin ver el pago, revisar va primero y pagar otra vez queda atrás.
 * Con el pago en proceso nunca se ofrece pagar: solo revisar de nuevo.
 */
function botonesPedido(vm: PedidoConfirmadoViewModel) {
  const primarioRevisar = vm.errorConsulta !== null || vm.pagoPorConfirmar;
  // Tras un 409 de piezas agotadas, "Volver al carrito" ocupa el lugar de pagar (el viewmodel lo dice).
  const primarioPagar = !primarioRevisar && (vm.puedePagar || vm.volverAlCarrito);
  const pagarSecundario = vm.pagoPorConfirmar && (vm.puedePagar || vm.volverAlCarrito);
  const revisarSecundario =
    !primarioRevisar && vm.vista === 'pendiente' && !vm.consultando && !vm.abriendo;
  return { primarioRevisar, primarioPagar, pagarSecundario, revisarSecundario };
}

function AccionesPedido({ vm }: { vm: PedidoConfirmadoViewModel }) {
  const { textos } = vm;
  const { primarioRevisar, primarioPagar, pagarSecundario, revisarSecundario } = botonesPedido(vm);
  const conPrimario = primarioRevisar || primarioPagar;

  return (
    <View style={styles.acciones}>
      <BotonPrimario vm={vm} primarioRevisar={primarioRevisar} primarioPagar={primarioPagar} />
      {pagarSecundario && vm.volverAlCarrito ? (
        <BotonVolverCarrito vm={vm} variante="contorno" />
      ) : null}
      {pagarSecundario && !vm.volverAlCarrito ? (
        <Button
          titulo={textos.botonPagarDeNuevo}
          variante="contorno"
          onPress={vm.pagar}
          cargando={vm.abriendo}
          deshabilitado={vm.pagoEnEspera}
          accessibilityHint={textos.pistaPagarDeNuevo}
        />
      ) : null}
      {revisarSecundario ? (
        <Button titulo={textos.botonRevisarDeNuevo} variante="secundario" onPress={vm.revisarDeNuevo} />
      ) : null}
      <Button
        titulo={textos.botonMisPedidos}
        variante={conPrimario ? 'secundario' : 'primario'}
        onPress={vm.verMisPedidos}
        deshabilitado={vm.abriendo}
      />
      <Button
        titulo={textos.botonSeguirComprando}
        variante={conPrimario || revisarSecundario ? 'contorno' : 'secundario'}
        onPress={vm.seguirComprando}
        deshabilitado={vm.abriendo}
      />
    </View>
  );
}

function BotonPrimario({
  vm,
  primarioRevisar,
  primarioPagar,
}: {
  vm: PedidoConfirmadoViewModel;
  primarioRevisar: boolean;
  primarioPagar: boolean;
}) {
  if (primarioRevisar) {
    return <Button titulo={vm.textos.botonRevisarMiPago} onPress={vm.revisarDeNuevo} cargando={vm.consultando} />;
  }
  if (!primarioPagar) {
    return null;
  }
  if (vm.volverAlCarrito) {
    return <BotonVolverCarrito vm={vm} variante="primario" />;
  }
  return (
    <Button
      titulo={vm.textos.botonPagar}
      onPress={vm.pagar}
      cargando={vm.abriendo}
      deshabilitado={vm.pagoEnEspera}
      accessibilityHint={vm.textos.pistaPagar}
    />
  );
}

/**
 * Momento de confirmación: el check entra desde 0.9 con opacidad en 220 ms (nunca desde escala 0);
 * con movimiento reducido, solo opacidad.
 */
function IconoConfirmacion() {
  const { colores } = useTheme();
  const reducido = useMovimientoReducido();
  const entrada = useMemo(
    () =>
      reducido
        ? FadeIn.duration(duracion.aparecer).reduceMotion(ReduceMotion.Never)
        : new Keyframe({
            0: { opacity: 0, transform: [{ scale: escalaEntrada }] },
            100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE_SALIDA },
          }).duration(duracion.aparecer),
    [reducido],
  );
  return (
    <Animated.View entering={entrada} accessible={false} importantForAccessibility="no-hide-descendants">
      <CircleCheck color={colores.exito} size={confirmacion.icono} strokeWidth={icono.trazo} />
    </Animated.View>
  );
}

function FilaAviso({ texto }: { texto: string }) {
  const { colores } = useTheme();
  return (
    <View style={styles.filaAviso}>
      <View style={styles.iconoLinea}>
        <CircleAlert color={colores.peligro} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </View>
      <Text style={[styles.textoAviso, { color: colores.peligro }]}>{texto}</Text>
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
    gap: espacio.xxl,
  },
  momento: {
    alignItems: 'center',
    gap: espacio.m,
  },
  titulo: {
    marginTop: espacio.s,
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.tituloPagina,
    textAlign: 'center',
  },
  mensaje: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    textAlign: 'center',
  },
  cifra: {
    fontFamily: fuente.textoMedio,
    fontVariant: ['tabular-nums'],
  },
  aviso: {
    marginTop: espacio.m,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    textAlign: 'center',
  },
  verificando: {
    marginTop: espacio.m,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: espacio.s,
  },
  puntoVerificando: {
    width: icono.tamanoPequeno,
    height: icono.tamanoPequeno,
    borderRadius: radio.pastilla,
  },
  textoVerificando: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  filaAviso: {
    marginTop: espacio.m,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  iconoLinea: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.cuerpo.linea - icono.tamanoPequeno) / 2,
  },
  textoAviso: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  encabezadoPedido: {
    gap: espacio.xs,
  },
  filaPedido: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacio.s,
  },
  numeroPedido: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
    fontVariant: ['tabular-nums'],
  },
  fecha: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  datos: {
    gap: espacio.m,
    paddingTop: espacio.m,
    borderTopWidth: borde.hairline,
  },
  plazo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  textoPlazo: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
  tarjeta: {
    gap: espacio.m,
    padding: espacio.xl,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  subtitulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  acciones: {
    gap: espacio.m,
  },
  esqueleto: {
    alignItems: 'center',
    gap: espacio.m,
  },
  iconoEsqueleto: {
    width: confirmacion.icono,
    height: confirmacion.icono,
    borderRadius: radio.pastilla,
  },
  tituloEsqueleto: {
    marginTop: espacio.s,
    width: esqueleto.anchoMedio,
    height: tipo.titulo.linea,
  },
  lineaCorta: {
    width: esqueleto.anchoCorto,
    height: esqueleto.linea,
  },
  tarjetaEsqueleto: {
    alignSelf: 'stretch',
    marginTop: espacio.xl,
    height: tipo.titulo.linea * 5,
    borderRadius: radio.tarjeta,
  },
});
