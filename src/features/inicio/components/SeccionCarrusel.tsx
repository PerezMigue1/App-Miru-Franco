import { ArrowRight } from 'lucide-react-native';
import { memo, useCallback, type ReactElement } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItem,
} from 'react-native';
import Animated from 'react-native-reanimated';

import type { Servicio } from '@/features/citas/models/servicioModel';
import { TarjetaServicio, TarjetaServicioEsqueleto } from '@/features/citas/components/TarjetaServicio';
import { TarjetaProducto, TarjetaProductoEsqueleto } from '@/features/tienda/components/TarjetaProducto';
import type { ProductoCatalogo } from '@/features/tienda/models/productoModel';
import { usePresion } from '@/shared/ui/movimiento';
import {
  carruselInicio,
  espacio,
  fuente,
  icono,
  pantalla,
  radio,
  tarjetas,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

/**
 * Ancho de una tarjeta para que quepan `visibles` en la pantalla (sin el margen de la izquierda):
 * con una fracción siempre asoma parte de la siguiente.
 */
function useAnchoTarjeta(visibles: number): number {
  const { width } = useWindowDimensions();
  return Math.round((width - pantalla.margen) / visibles - carruselInicio.separacion);
}

/* ── Productos ─────────────────────────────────────────────────────────────────────────────── */

interface CarruselProductosProps {
  cargando: boolean;
  /** Párrafo bajo el título (contenido.inicio.productosDescripcion); null no lo pinta. */
  descripcion: string | null;
  productos: ProductoCatalogo[];
  onAbrir: (id: number) => void;
  onVerTodos: () => void;
}

/** "Productos" de Inicio: tarjetas de la Tienda a ancho fijo en una fila horizontal. */
export function CarruselProductos({
  cargando,
  descripcion,
  productos,
  onAbrir,
  onVerTodos,
}: CarruselProductosProps) {
  const ancho = useAnchoTarjeta(carruselInicio.productosVisibles);
  const renderItem = useCallback<ListRenderItem<ProductoCatalogo>>(
    ({ item }) => <TarjetaProducto producto={item} ancho={ancho} onAbrir={onAbrir} />,
    [ancho, onAbrir],
  );
  return (
    <SeccionCarrusel
      titulo="Productos"
      descripcion={descripcion}
      etiquetaVerTodos="Ver todos los productos"
      pistaVerTodos="Abre la tienda"
      etiquetaCargando="Cargando productos"
      onVerTodos={onVerTodos}
      cargando={cargando}
      elementos={productos}
      ancho={ancho}
      claveDe={claveProducto}
      renderItem={renderItem}
      esqueleto={<TarjetaProductoEsqueleto ancho={ancho} />}
    />
  );
}

const claveProducto = (producto: ProductoCatalogo) => String(producto.id);

/* ── Servicios ─────────────────────────────────────────────────────────────────────────────── */

interface CarruselServiciosProps {
  cargando: boolean;
  /** Párrafo bajo el título (contenido.inicio.serviciosDescripcion); null no lo pinta. */
  descripcion: string | null;
  servicios: Servicio[];
  onAbrir: (id: Servicio['id']) => void;
  onVerTodos: () => void;
}

/** "Servicios" de Inicio: tarjetas del catálogo de servicios dentro de un contenedor de ancho fijo. */
export function CarruselServicios({
  cargando,
  descripcion,
  servicios,
  onAbrir,
  onVerTodos,
}: CarruselServiciosProps) {
  const ancho = useAnchoTarjeta(carruselInicio.serviciosVisibles);
  const renderItem = useCallback<ListRenderItem<Servicio>>(
    ({ item }) => <CeldaServicio servicio={item} ancho={ancho} onAbrir={onAbrir} />,
    [ancho, onAbrir],
  );
  return (
    <SeccionCarrusel
      titulo="Servicios"
      descripcion={descripcion}
      etiquetaVerTodos="Ver todos los servicios"
      pistaVerTodos="Abre la pestaña Servicios"
      etiquetaCargando="Cargando servicios"
      onVerTodos={onVerTodos}
      cargando={cargando}
      elementos={servicios}
      ancho={ancho}
      claveDe={claveServicio}
      renderItem={renderItem}
      esqueleto={
        <View style={{ width: ancho }}>
          <TarjetaServicioEsqueleto />
        </View>
      }
    />
  );
}

const claveServicio = (servicio: Servicio) => String(servicio.id);

/**
 * TarjetaServicio se estira al ancho de su contenedor: aquí se le da el del carrusel. La función que
 * recibe la tarjeta se arma una vez por servicio y no en cada pintado de la lista.
 */
const CeldaServicio = memo(function CeldaServicio({
  servicio,
  ancho,
  onAbrir,
}: {
  servicio: Servicio;
  ancho: number;
  onAbrir: (id: Servicio['id']) => void;
}) {
  const abrir = useCallback(() => onAbrir(servicio.id), [onAbrir, servicio.id]);
  return (
    <View style={{ width: ancho }}>
      <TarjetaServicio servicio={servicio} onPress={abrir} />
    </View>
  );
});

/* ── Sección genérica ──────────────────────────────────────────────────────────────────────── */

interface SeccionCarruselProps<T> {
  titulo: string;
  descripcion: string | null;
  etiquetaVerTodos: string;
  pistaVerTodos: string;
  etiquetaCargando: string;
  onVerTodos: () => void;
  cargando: boolean;
  elementos: T[];
  /** Ancho de cada tarjeta: con la separación da el paso del imán al soltar. */
  ancho: number;
  claveDe: (elemento: T) => string;
  renderItem: ListRenderItem<T>;
  esqueleto: ReactElement;
}

/**
 * Título con "Ver todos" y una fila horizontal de tarjetas. Mientras carga pinta skeletons con la
 * forma de las tarjetas; si falló o no hay elementos, la sección no se muestra (nunca relleno).
 */
function SeccionCarrusel<T>({
  titulo,
  descripcion,
  etiquetaVerTodos,
  pistaVerTodos,
  etiquetaCargando,
  onVerTodos,
  cargando,
  elementos,
  ancho,
  claveDe,
  renderItem,
  esqueleto,
}: SeccionCarruselProps<T>) {
  if (!cargando && elementos.length === 0) {
    return null;
  }
  return (
    <View style={styles.seccion}>
      <Encabezado
        titulo={titulo}
        descripcion={descripcion}
        etiqueta={etiquetaVerTodos}
        pista={pistaVerTodos}
        onPress={onVerTodos}
      />
      {cargando ? (
        // Una fila quieta (no se desliza) con las tarjetas que llenan el ancho; se anuncia una vez.
        <View
          accessible
          accessibilityLabel={etiquetaCargando}
          style={[styles.fila, styles.filaEsqueleto]}
        >
          {Array.from({ length: carruselInicio.esqueletos }, (_, i) => (
            <View key={i}>{esqueleto}</View>
          ))}
        </View>
      ) : (
        <FlatList
          horizontal
          data={elementos}
          keyExtractor={claveDe}
          renderItem={renderItem}
          ItemSeparatorComponent={Separador}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.fila}
          // Al soltar, la fila se detiene con una tarjeta pegada al margen de la pantalla.
          snapToInterval={ancho + carruselInicio.separacion}
          snapToAlignment="start"
          decelerationRate="fast"
        />
      )}
    </View>
  );
}

function Separador() {
  return <View style={styles.separador} />;
}

/**
 * Título de sección como los de la home de la web, con su acción a la derecha (sin eyebrow) y, si
 * hay, la descripción debajo a todo el ancho.
 */
function Encabezado({
  titulo,
  descripcion,
  etiqueta,
  pista,
  onPress,
}: {
  titulo: string;
  descripcion: string | null;
  etiqueta: string;
  pista: string;
  onPress: () => void;
}) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <View style={styles.cabeza}>
      <View style={styles.encabezado}>
        {/* --encabezados-alterno como la web: 8.8:1 sobre lino y 6.0:1 sobre carbón. */}
        <Text accessibilityRole="header" style={[styles.titulo, { color: colores.textoSuave }]}>
          {titulo}
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={etiqueta}
          accessibilityHint={pista}
          onPress={onPress}
          onPressIn={hundir}
          onPressOut={soltar}
          style={styles.toqueVerTodos}
        >
          {({ pressed }) => (
            <Animated.View
              style={[
                styles.verTodos,
                { backgroundColor: pressed ? colores.presionado : colores.transparente },
                estilo,
              ]}
            >
              {/* --menu-texto-principal como el enlace de la web: 8.6:1 sobre lino y 18:1 sobre carbón. */}
              <Text style={[styles.textoVerTodos, { color: colores.texto }]}>Ver todos</Text>
              <ArrowRight color={colores.texto} size={carruselInicio.iconoVerTodos} strokeWidth={icono.trazo} />
            </Animated.View>
          )}
        </Pressable>
      </View>
      {descripcion ? (
        <Text style={[styles.descripcion, { color: colores.textoSuave }]}>{descripcion}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: {
    paddingTop: espacio.x5,
  },
  cabeza: {
    gap: espacio.s,
    paddingHorizontal: pantalla.margen,
    // Con el relleno de la fila (16) quedan 20 entre el título y las tarjetas, como en la galería.
    marginBottom: espacio.xl - carruselInicio.rellenoSombra,
  },
  encabezado: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: espacio.l,
  },
  descripcion: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  titulo: {
    flexShrink: 1,
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.tituloPagina,
  },
  // El área táctil sobresale a la derecha lo mismo que su relleno: el texto queda en el margen.
  toqueVerTodos: {
    marginRight: -espacio.s,
  },
  verTodos: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tarjetas.separacionIcono,
    paddingHorizontal: espacio.s,
    borderRadius: radio.campo,
  },
  textoVerTodos: {
    fontFamily: fuente.textoFuerte,
    fontSize: tarjetas.tipoAccion.tamano,
    lineHeight: tarjetas.tipoAccion.linea,
    letterSpacing: carruselInicio.trackingVerTodos,
    textTransform: 'uppercase',
  },
  fila: {
    paddingHorizontal: pantalla.margen,
    paddingVertical: carruselInicio.rellenoSombra,
  },
  filaEsqueleto: {
    flexDirection: 'row',
    gap: carruselInicio.separacion,
    overflow: 'hidden',
  },
  separador: {
    width: carruselInicio.separacion,
  },
});
