import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Check, Info, Rabbit, ShoppingBag } from 'lucide-react-native';
import { memo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { transicionSeleccion, useEntradaContenido, usePresion } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  borde,
  esqueleto,
  espacio,
  fuente,
  icono,
  opacidad,
  pantalla,
  radio,
  tienda,
  tiendaCatalogo,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { GaleriaProducto } from '../components/GaleriaProducto';
import { SelectorCantidad } from '../components/SelectorCantidad';
import {
  formatoPrecio,
  presentacionComprable,
  type Presentacion,
  type ProductoCatalogo,
} from '../models/productoModel';
import {
  useDetalleProductoViewModel,
  type ConfirmacionCarrito,
  type DetalleProductoViewModel,
} from '../viewmodels/useDetalleProductoViewModel';

/** Detalle público de un producto: fotos, precio, presentación, cantidad y agregar al carrito. */
export default function DetalleProductoView() {
  const { colores } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useDetalleProductoViewModel(id);

  const listo = vm.estado === 'listo' && vm.producto != null;
  // Sin foto arriba, el estado deja libre el espacio del botón Regresar.
  const rellenoSuperior = top + espacio.s + toqueMinimo + espacio.l;

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      {listo && vm.producto ? (
        <>
          <StatusBar style="light" />
          <ScrollView
            contentContainerStyle={{ paddingBottom: bottom + espacio.x3 }}
            keyboardShouldPersistTaps="handled"
          >
            <Contenido producto={vm.producto} vm={vm} />
          </ScrollView>
        </>
      ) : null}

      {vm.estado === 'cargando' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Cargando producto"
          style={styles.raiz}
        >
          <Skeleton estilo={styles.fotoEsqueleto} />
          <View style={styles.bloque}>
            <Skeleton estilo={styles.lineaCorta} />
            <Skeleton estilo={styles.tituloEsqueleto} />
            <Skeleton estilo={styles.precioEsqueleto} />
            <View style={styles.chips}>
              <Skeleton estilo={styles.chipEsqueleto} />
              <Skeleton estilo={styles.chipEsqueleto} />
            </View>
            <Skeleton estilo={styles.botonEsqueleto} />
          </View>
        </View>
      ) : null}

      {vm.estado === 'error' ? (
        <ScrollView
          contentContainerStyle={[
            styles.estado,
            { paddingTop: rellenoSuperior, paddingBottom: bottom + espacio.x3 },
          ]}
        >
          <EmptyState
            titulo={vm.errorRed ? 'Sin conexión' : 'No pudimos cargar este producto'}
            mensaje={
              vm.errorRed
                ? 'Revisa tu internet e intenta de nuevo.'
                : 'Ocurrió un problema al traer el producto. Intenta de nuevo en un momento.'
            }
            accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'noEncontrado' ? (
        <ScrollView
          contentContainerStyle={[
            styles.estado,
            { paddingTop: rellenoSuperior, paddingBottom: bottom + espacio.x3 },
          ]}
        >
          <EmptyState
            titulo="No encontramos este producto"
            mensaje="Puede que el salón lo haya retirado. Mira los demás productos en la Tienda."
            accion={{ titulo: 'Ir a la Tienda', onPress: vm.irATienda }}
          />
        </ScrollView>
      ) : null}

      <BotonRegresar sobreImagen={listo || vm.estado === 'cargando'} top={top + espacio.s} onPress={vm.volver} />
    </View>
  );
}

function Contenido({ producto, vm }: { producto: ProductoCatalogo; vm: DetalleProductoViewModel }) {
  const { colores } = useTheme();
  const { presentacion, comprable } = vm;
  const descripcion = producto.descripcionLarga.trim() || producto.descripcion.trim();
  const precio = presentacion && presentacion.precioCentavos > 0 ? formatoPrecio(presentacion.precioCentavos) : null;
  const original =
    presentacion?.precioOriginalCentavos != null ? formatoPrecio(presentacion.precioOriginalCentavos) : null;
  const mostrarPresentaciones =
    producto.presentaciones.length > 1 || Boolean(producto.presentaciones[0]?.tamanio);

  return (
    <>
      <GaleriaProducto fotos={vm.fotos} nombre={producto.nombre} atenuada={!comprable} />

      <View style={styles.bloque}>
        {producto.marca ? (
          <Text style={[styles.marca, { color: colores.textoSuave }]}>{producto.marca}</Text>
        ) : null}
        <Text accessibilityRole="header" style={[styles.nombre, { color: colores.texto }]}>
          {producto.nombre}
        </Text>
        {producto.categoria ? (
          <Text style={[styles.dato, { color: colores.textoSuave }]}>{producto.categoria}</Text>
        ) : null}

        {precio ? (
          <View
            style={styles.precios}
            accessible
            accessibilityLabel={[
              `Precio: ${precio}`,
              original ? `antes ${original}` : '',
              producto.descuento > 0 ? `${producto.descuento} por ciento de descuento` : '',
            ]
              .filter(Boolean)
              .join(', ')}
          >
            <Text style={[styles.precio, { color: colores.texto }]}>{precio}</Text>
            {original ? (
              <Text style={[styles.precioOriginal, { color: colores.textoSuave }]}>{original}</Text>
            ) : null}
            {producto.descuento > 0 ? (
              <Text style={[styles.descuento, { color: colores.texto }]}>-{producto.descuento}%</Text>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.sinPrecio, { color: colores.texto }]}>Consulta el precio en el salón</Text>
        )}

        {producto.crueltyFree ? (
          <View style={styles.crueltyFree}>
            <View accessible={false} importantForAccessibility="no-hide-descendants">
              <Rabbit color={colores.oro} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            </View>
            <Text style={[styles.dato, { color: colores.texto }]}>Cruelty free</Text>
          </View>
        ) : null}
      </View>

      {mostrarPresentaciones ? (
        <View style={styles.grupo}>
          <Text style={[styles.etiquetaGrupo, { color: colores.texto }]}>Presentación</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {producto.presentaciones.map((p, i) => (
              <ChipPresentacion
                key={p.id}
                presentacion={p}
                respaldo={`Presentación ${i + 1}`}
                activa={p.id === presentacion?.id}
                onElegir={vm.elegirPresentacion}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.grupoCompacto}>
        <Text style={[styles.dato, { color: colores.texto }]}>{vm.textoExistencias}</Text>
      </View>

      {comprable && presentacion ? (
        <View style={styles.grupo}>
          <Text style={[styles.etiquetaGrupo, { color: colores.texto }]}>Cantidad</Text>
          <SelectorCantidad
            valor={vm.cantidad}
            maximo={presentacion.stock}
            onCambiar={vm.setCantidad}
            deshabilitado={vm.agregando}
            etiqueta={`Cantidad de ${producto.nombre}`}
          />
        </View>
      ) : null}

      <View style={styles.accion}>
        <Button
          titulo="Agregar al carrito"
          onPress={vm.agregar}
          deshabilitado={!comprable}
          cargando={vm.agregando}
          icono={
            <ShoppingBag color={colores.textoSobreAccion} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          }
          posicionIcono="inicio"
        />
        {vm.confirmacion ? (
          <Confirmacion key={vm.confirmacion.clave} confirmacion={vm.confirmacion} onVerCarrito={vm.verCarrito} />
        ) : null}
        {vm.errorAgregar ? (
          <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colores.peligro }]}>
            {vm.errorAgregar}
          </Text>
        ) : null}
      </View>

      {descripcion ? (
        <Seccion titulo="Descripción">
          <Text style={[styles.cuerpo, { color: colores.texto }]}>{descripcion}</Text>
        </Seccion>
      ) : null}

      {producto.caracteristicas.length > 0 ? (
        <Seccion titulo="Características">
          <ListaVinetas elementos={producto.caracteristicas} />
        </Seccion>
      ) : null}

      {producto.modoUso.length > 0 ? (
        <Seccion titulo="Modo de uso">
          <Parrafos lineas={producto.modoUso} />
        </Seccion>
      ) : null}

      {producto.ingredientes.length > 0 ? (
        <Seccion titulo="Ingredientes">
          <Parrafos lineas={producto.ingredientes} />
        </Seccion>
      ) : null}

      {producto.resultado.length > 0 ? (
        <Seccion titulo="Resultado">
          <Parrafos lineas={producto.resultado} />
        </Seccion>
      ) : null}
    </>
  );
}

/** Aviso en línea tras agregar: aparece con el fundido corto de la app y lo lee el lector de pantalla. */
function Confirmacion({
  confirmacion,
  onVerCarrito,
}: {
  confirmacion: ConfirmacionCarrito;
  onVerCarrito: () => void;
}) {
  const { colores } = useTheme();
  const entrada = useEntradaContenido();
  const Icono = confirmacion.tipo === 'agregado' ? Check : Info;
  return (
    <Animated.View entering={entrada} style={styles.confirmacion}>
      <View style={styles.mensajeConfirmacion} accessibilityLiveRegion="polite">
        <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.iconoLinea}>
          <Icono
            color={confirmacion.tipo === 'agregado' ? colores.exito : colores.texto}
            size={icono.tamanoPequeno}
            strokeWidth={icono.trazoMarca}
          />
        </View>
        <Text style={[styles.textoConfirmacion, { color: colores.texto }]}>{confirmacion.mensaje}</Text>
      </View>
      <Button titulo="Ver carrito" variante="secundario" onPress={onVerCarrito} />
    </Animated.View>
  );
}

/** Tamaño de una presentación: se elige como opción; la que no se puede comprar queda apagada. */
const ChipPresentacion = memo(function ChipPresentacion({
  presentacion,
  respaldo,
  activa,
  onElegir,
}: {
  presentacion: Presentacion;
  /** Texto si la presentación no trae tamaño. */
  respaldo: string;
  activa: boolean;
  onElegir: (id: number) => void;
}) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  const disponible = presentacionComprable(presentacion);
  const texto = presentacion.tamanio || respaldo;
  const colorTexto = activa ? colores.textoSobreSeleccion : colores.texto;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={disponible ? texto : `${texto}, agotado`}
      accessibilityState={{ selected: activa, checked: activa, disabled: !disponible }}
      disabled={!disponible}
      onPress={() => onElegir(presentacion.id)}
      onPressIn={hundir}
      onPressOut={soltar}
      // La atenuación va afuera: la presión controla la opacidad de la vista de adentro.
      style={disponible ? null : styles.deshabilitado}
    >
      <Animated.View
        style={[
          styles.chip,
          transicionSeleccion,
          {
            backgroundColor: activa ? colores.seleccion : colores.fondo,
            borderColor: activa ? colores.seleccion : colores.campoBorde,
          },
          estilo,
        ]}
      >
        <Text style={[styles.textoChip, { color: colorTexto }]}>{texto}</Text>
        {disponible ? null : <Text style={[styles.agotadoChip, { color: colorTexto }]}>Agotado</Text>}
      </Animated.View>
    </Pressable>
  );
});

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  const { colores } = useTheme();
  return (
    <View style={styles.seccion}>
      <Text accessibilityRole="header" style={[styles.tituloSeccion, { color: colores.texto }]}>
        {titulo}
      </Text>
      {children}
    </View>
  );
}

/** Lista con viñeta dibujada (un punto de oro), no con un carácter de texto. */
function ListaVinetas({ elementos }: { elementos: string[] }) {
  const { colores } = useTheme();
  return (
    <View style={styles.lista}>
      {elementos.map((elemento, i) => (
        <View key={`${i}-${elemento}`} style={styles.elemento}>
          <View accessible={false} style={styles.contenedorVineta}>
            <View style={[styles.vineta, { backgroundColor: colores.oro }]} />
          </View>
          <Text style={[styles.cuerpoFlexible, { color: colores.texto }]}>{elemento}</Text>
        </View>
      ))}
    </View>
  );
}

function Parrafos({ lineas }: { lineas: string[] }) {
  const { colores } = useTheme();
  return (
    <View style={styles.lista}>
      {lineas.map((linea, i) => (
        <Text key={`${i}-${linea}`} style={[styles.cuerpo, { color: colores.texto }]}>
          {linea}
        </Text>
      ))}
    </View>
  );
}

/** Botón circular para regresar, fijo bajo la barra de estado y por encima de la foto. */
function BotonRegresar({ sobreImagen, top, onPress }: { sobreImagen: boolean; top: number; onPress: () => void }) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  const colorIcono = sobreImagen ? colores.textoSobrePanel : colores.texto;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Regresar"
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
      style={[styles.regresar, { top }]}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.circuloRegresar,
            {
              backgroundColor: sobreImagen ? colores.velo : pressed ? colores.presionado : colores.fondo,
            },
            estilo,
          ]}
        >
          <ArrowLeft color={colorIcono} size={icono.tamano} strokeWidth={icono.trazo} />
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  bloque: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.xl,
    gap: espacio.xs,
  },
  marca: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  nombre: {
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.titulo,
  },
  dato: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  precios: {
    marginTop: espacio.m,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: espacio.m,
    rowGap: espacio.xxs,
  },
  precio: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    fontVariant: ['tabular-nums'],
  },
  precioOriginal: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
    textDecorationLine: 'line-through',
  },
  descuento: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
  sinPrecio: {
    marginTop: espacio.m,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  crueltyFree: {
    marginTop: espacio.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
  },
  grupo: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.xl,
    gap: espacio.s,
  },
  grupoCompacto: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.s,
  },
  etiquetaGrupo: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacio.s,
  },
  chip: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingHorizontal: espacio.l,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
  },
  textoChip: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  agotadoChip: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  deshabilitado: {
    opacity: opacidad.deshabilitado,
  },
  accion: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.xxl,
    gap: espacio.l,
  },
  confirmacion: {
    gap: espacio.m,
  },
  mensajeConfirmacion: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.s,
  },
  iconoLinea: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.cuerpo.linea - icono.tamanoPequeno) / 2,
  },
  textoConfirmacion: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  error: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  seccion: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.x3,
    gap: espacio.m,
  },
  tituloSeccion: {
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
  cuerpoFlexible: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  lista: {
    gap: espacio.s,
  },
  elemento: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  // Alto de una línea de texto: la viñeta queda centrada con la primera línea.
  contenedorVineta: {
    height: tipo.cuerpo.linea,
    justifyContent: 'center',
  },
  vineta: {
    width: tiendaCatalogo.vineta,
    height: tiendaCatalogo.vineta,
    borderRadius: radio.pastilla,
  },
  regresar: {
    position: 'absolute',
    left: pantalla.margen - espacio.s,
    width: toqueMinimo,
    height: toqueMinimo,
  },
  circuloRegresar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  estado: {
    flexGrow: 1,
    paddingHorizontal: pantalla.margen,
  },
  fotoEsqueleto: {
    width: '100%',
    aspectRatio: tienda.proporcionFoto,
    borderRadius: 0,
  },
  lineaCorta: {
    width: esqueleto.anchoCorto,
    height: esqueleto.linea,
  },
  tituloEsqueleto: {
    width: esqueleto.anchoMedio,
    height: tipo.titulo.linea,
  },
  precioEsqueleto: {
    marginTop: espacio.m,
    width: esqueleto.anchoCorto,
    height: tipo.titulo.linea,
  },
  chipEsqueleto: {
    marginTop: espacio.l,
    width: toqueMinimo * 2,
    height: toqueMinimo,
    borderRadius: radio.pastilla,
  },
  botonEsqueleto: {
    marginTop: espacio.l,
    height: toqueMinimo,
    borderRadius: radio.pastilla,
  },
});
