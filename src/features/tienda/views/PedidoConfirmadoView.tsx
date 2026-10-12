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
import { esPagoEnSalon, etiquetaMetodoPago, fechaPedido, type Pedido } from '../models/pedidoModel';
import { formatoPrecio } from '../models/productoModel';
import {
  usePedidoConfirmadoViewModel,
  type PedidoConfirmadoViewModel,
} from '../viewmodels/usePedidoConfirmadoViewModel';

/** Primera letra en mayúscula ("Sábado 18 de octubre"). */
function conMayuscula(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** Título y mensaje del estado del pedido y de su pago (textos de la web). */
function textosEstado(vm: PedidoConfirmadoViewModel, pedido: Pedido): { titulo: string; mensaje: string } {
  switch (vm.vista) {
    case 'aprobado':
      return {
        titulo: '¡Pago recibido!',
        mensaje:
          'Tu pedido quedó pagado. Te avisamos en la app y por correo cuando esté listo para recoger en el salón.',
      };
    case 'revision':
      return {
        titulo: 'Recibimos tu pago',
        mensaje:
          'Necesitamos revisarlo antes de preparar tu pedido. El salón te contactará; no tienes que pagar otra vez.',
      };
    case 'noCompletado': {
      const motivo = vm.rechazado
        ? 'Mercado Pago no aprobó el pago y no se hizo ningún cargo.'
        : 'Todavía no recibimos tu pago.';
      const plazo = vm.limite ? ` Tu pedido sigue apartado hasta el ${vm.limite}.` : '';
      const aviso = vm.pagoPorConfirmar
        ? ' Si ya pagaste, puede tardar unos minutos en verse: no pagues de nuevo, toca Revisar mi pago.'
        : '';
      return { titulo: 'Tu pago no se completó', mensaje: `${motivo}${plazo}${aviso}` };
    }
    case 'pendiente':
      return {
        titulo: 'Tu pago se está procesando',
        mensaje: vm.consultando
          ? 'Mercado Pago aún no lo confirma. Esta pantalla se actualiza sola.'
          : 'Mercado Pago aún no lo confirma. Te avisamos en la app y por correo en cuanto se acredite.',
      };
    case 'consultando':
      return { titulo: 'Consultando el estado de tu pago', mensaje: '' };
    case 'porPagar':
      return {
        titulo: 'Completa tu pago',
        mensaje: 'Tu pedido está apartado. Págalo en Mercado Pago para que lo preparemos.',
      };
    case 'cancelado':
      return { titulo: 'Pedido cancelado', mensaje: 'Este pedido está cancelado.' };
    default:
      return {
        titulo: '¡Gracias por tu compra!',
        mensaje: esPagoEnSalon(pedido)
          ? 'Te apartamos tu pedido. Te avisamos en la app y por correo cuando esté listo para recogerlo y pagarlo en el salón.'
          : 'Te avisamos en la app y por correo cuando tu pedido esté listo para recoger en el salón.',
      };
  }
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
  // Mercado Pago en arranque en frío: consulta el estado del pago. Nada de esto decide el estado.
  const vm = usePedidoConfirmadoViewModel(pedidoId, pagar === '1', retorno === 'mp', origen === 'pedido');

  const relleno = { paddingTop: top + espacio.x4, paddingBottom: bottom + espacio.xxl };

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <ScrollView contentContainerStyle={[styles.contenido, relleno]}>
        {vm.estado === 'listo' && vm.pedido ? <Contenido vm={vm} pedido={vm.pedido} /> : null}

        {vm.estado === 'cargando' ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Cargando tu pedido"
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
              titulo="No pudimos cargar tu pedido"
              mensaje="Tu pedido no se pierde. Revisa tu conexión e intenta de nuevo."
              accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
            />
            <Button titulo="Ver mis pedidos" variante="contorno" onPress={vm.verMisPedidos} />
          </>
        ) : null}

        {vm.estado === 'noEncontrado' ? (
          <>
            <EmptyState
              titulo="No encontramos este pedido"
              mensaje="Revisa tus pedidos para ver su estado."
              accion={{ titulo: 'Ver mis pedidos', onPress: vm.verMisPedidos }}
            />
            <Button titulo="Seguir comprando" variante="contorno" onPress={vm.seguirComprando} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Contenido({ vm, pedido }: { vm: PedidoConfirmadoViewModel; pedido: Pedido }) {
  const { titulo, mensaje } = textosEstado(vm, pedido);
  // El bloque del estado entra una vez cada que el estado cambia (opacidad y 8px; solo opacidad
  // con movimiento reducido).
  const entrada = useEntradaContenido();
  const apartadoPendiente = esPagoEnSalon(pedido) && pedido.estado === 'pendiente_pago';
  const mostrarRecoger = esPagoEnSalon(pedido) && vm.vista !== 'cancelado';

  return (
    <>
      {/* Región en vivo: los cambios de estado del pago se anuncian solos. */}
      <View collapsable={false} accessibilityLiveRegion="polite">
        <MomentoEstado
          key={vm.vista}
          vista={vm.vista}
          entrada={entrada}
          titulo={titulo}
          mensaje={mensaje}
          apartadoPendiente={apartadoPendiente}
          total={formatoPrecio(pedido.totalCentavos)}
        />
        <AvisosPago abriendo={vm.abriendo} errorPago={vm.errorPago} errorConsulta={vm.errorConsulta} />
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
        encabezado={<EncabezadoPedido pedido={pedido} />}
      >
        <DatosPago pedido={pedido} limite={vm.limite} />
      </ResumenCompra>

      {mostrarRecoger ? <TarjetaRecoger /> : null}

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
  apartadoPendiente,
  total,
}: {
  vista: PedidoConfirmadoViewModel['vista'];
  entrada: ReturnType<typeof useEntradaContenido>;
  titulo: string;
  mensaje: string;
  apartadoPendiente: boolean;
  total: string;
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
      {vista === 'consultando' ? <Skeleton estilo={styles.iconoEsqueleto} /> : null}
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
        {titulo}
      </Text>
      {vista === 'consultando' ? (
        <View style={styles.lineasConsulta}>
          <Skeleton estilo={styles.lineaMensaje} />
          <Skeleton estilo={styles.lineaCorta} />
        </View>
      ) : null}
      {mensaje ? <Text style={[styles.mensaje, { color: colores.textoSuave }]}>{mensaje}</Text> : null}
      {apartadoPendiente ? (
        <Text style={[styles.mensaje, styles.cifra, { color: colores.texto }]}>
          Pagas {total} en el mostrador cuando pases por él.
        </Text>
      ) : null}
    </Animated.View>
  );
}

function AvisosPago({
  abriendo,
  errorPago,
  errorConsulta,
}: Pick<PedidoConfirmadoViewModel, 'abriendo' | 'errorPago' | 'errorConsulta'>) {
  const { colores } = useTheme();
  return (
    <>
      {abriendo ? (
        <Text style={[styles.aviso, { color: colores.textoSuave }]}>Abriendo Mercado Pago</Text>
      ) : null}
      {errorPago ? <FilaAviso texto={errorPago} /> : null}
      {errorConsulta ? <FilaAviso texto={errorConsulta} /> : null}
    </>
  );
}

function EncabezadoPedido({ pedido }: { pedido: Pedido }) {
  const { colores } = useTheme();
  const fecha = conMayuscula(fechaPedido(pedido));
  return (
    <View style={styles.encabezadoPedido}>
      <View style={styles.filaPedido}>
        <Text style={[styles.numeroPedido, { color: colores.texto }]}>Pedido #{pedido.id}</Text>
        <BadgePedido pedido={pedido} />
      </View>
      {fecha ? <Text style={[styles.fecha, { color: colores.textoSuave }]}>{fecha}</Text> : null}
    </View>
  );
}

function DatosPago({ pedido, limite }: { pedido: Pedido; limite: PedidoConfirmadoViewModel['limite'] }) {
  const { colores } = useTheme();
  return (
    <View style={[styles.datos, { borderTopColor: colores.hairline }]}>
      <DatoCompra etiqueta="Forma de pago" valor={etiquetaMetodoPago(pedido.metodoPago)} />
      {limite ? (
        <View style={styles.plazo} accessible accessibilityLabel={`Paga antes del ${limite}.`}>
          <View style={styles.iconoLinea}>
            <Hourglass color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          </View>
          <Text style={[styles.textoPlazo, { color: colores.texto }]}>
            Paga antes del {limite}.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function TarjetaRecoger() {
  const { colores } = useTheme();
  return (
    <View
      style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}
    >
      <Text accessibilityRole="header" style={[styles.subtitulo, { color: colores.texto }]}>
        Dónde lo recoges
      </Text>
      <DatosRecogerSalon />
    </View>
  );
}

/**
 * Un solo botón primario: pagar o revisar el pago cuando aplica; si no, Mis pedidos.
 * Tras volver de Mercado Pago sin ver el pago, revisar va primero y pagar otra vez queda atrás.
 */
function botonesPedido(vm: PedidoConfirmadoViewModel) {
  const primarioRevisar = vm.errorConsulta !== null || vm.pagoPorConfirmar;
  const primarioPagar = !primarioRevisar && vm.puedePagar;
  const pagarSecundario = vm.pagoPorConfirmar && vm.puedePagar;
  const revisarSecundario =
    !primarioRevisar && vm.vista === 'pendiente' && !vm.consultando && !vm.abriendo;
  return { primarioRevisar, primarioPagar, pagarSecundario, revisarSecundario };
}

function AccionesPedido({ vm }: { vm: PedidoConfirmadoViewModel }) {
  const { primarioRevisar, primarioPagar, pagarSecundario, revisarSecundario } = botonesPedido(vm);
  const conPrimario = primarioRevisar || primarioPagar;

  return (
    <View style={styles.acciones}>
      <BotonPrimario vm={vm} primarioRevisar={primarioRevisar} primarioPagar={primarioPagar} />
      {pagarSecundario ? (
        <Button
          titulo="Pagar de nuevo"
          variante="contorno"
          onPress={vm.pagar}
          cargando={vm.abriendo}
          accessibilityHint="Abre Mercado Pago en el navegador. Si ya pagaste, no lo hagas."
        />
      ) : null}
      {revisarSecundario ? (
        <Button titulo="Revisar de nuevo" variante="secundario" onPress={vm.revisarDeNuevo} />
      ) : null}
      <Button
        titulo="Ver mis pedidos"
        variante={conPrimario ? 'secundario' : 'primario'}
        onPress={vm.verMisPedidos}
        deshabilitado={vm.abriendo}
      />
      <Button
        titulo="Seguir comprando"
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
    return <Button titulo="Revisar mi pago" onPress={vm.revisarDeNuevo} cargando={vm.consultando} />;
  }
  if (!primarioPagar) {
    return null;
  }
  return (
    <Button
      titulo={vm.vista === 'porPagar' ? 'Pagar con Mercado Pago' : 'Reintentar pago'}
      onPress={vm.pagar}
      cargando={vm.abriendo}
      accessibilityHint="Abre Mercado Pago en el navegador"
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
  lineasConsulta: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: espacio.s,
  },
  aviso: {
    marginTop: espacio.m,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    textAlign: 'center',
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
  lineaMensaje: {
    width: esqueleto.anchoMedio,
    height: esqueleto.linea,
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
