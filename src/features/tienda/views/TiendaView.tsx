import { useCallback } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItem,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { EmptyState } from '@/shared/ui/EmptyState';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import { Skeleton } from '@/shared/ui/Skeleton';
import { espacio, fuente, pantalla, radio, tienda, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { AccesoCarrito } from '../components/AccesoCarrito';
import { BuscadorProductos } from '../components/BuscadorProductos';
import { FiltroCategorias } from '../components/FiltroCategorias';
import { TarjetaProducto, TarjetaProductoEsqueleto } from '../components/TarjetaProducto';
import type { ProductoCatalogo } from '../models/productoModel';
import { useCatalogoViewModel } from '../viewmodels/useCatalogoViewModel';

/** Filas del skeleton: tarjetasEsqueleto repartidas en las columnas de la cuadrícula. */
const FILAS_ESQUELETO = Array.from(
  { length: Math.ceil(tienda.tarjetasEsqueleto / tienda.columnas) },
  (_, fila) => Array.from({ length: tienda.columnas }, (__, columna) => fila * tienda.columnas + columna),
);

function claveProducto(producto: ProductoCatalogo): string {
  return String(producto.id);
}

/** Pestaña Tienda (GP-06.4): catálogo público en dos columnas con búsqueda y categorías. */
export default function TiendaView() {
  const { colores } = useTheme();
  const { width } = useWindowDimensions();
  const vm = useCatalogoViewModel();
  // La cuadrícula aparece una sola vez al terminar de cargar (en el contenedor, no en cada fila).
  const entrada = useEntradaContenido();

  const anchoTarjeta =
    (width - pantalla.margen * 2 - espacio.m * (tienda.columnas - 1)) / tienda.columnas;

  const { abrirProducto } = vm;
  const renderProducto = useCallback<ListRenderItem<ProductoCatalogo>>(
    ({ item }) => <TarjetaProducto producto={item} ancho={anchoTarjeta} onAbrir={abrirProducto} />,
    [anchoTarjeta, abrirProducto],
  );

  const encabezadoPantalla = (
    <ScreenHeader titulo="Tienda" accion={<AccesoCarrito piezas={vm.piezas} onPress={vm.abrirCarrito} />} />
  );

  const refresco = (
    <RefreshControl
      refreshing={vm.refrescando}
      onRefresh={vm.refrescar}
      colors={[colores.foco]}
      progressBackgroundColor={colores.campoFondo}
    />
  );

  if (vm.estado === 'cargando') {
    return (
      <ScrollView
        style={{ backgroundColor: colores.fondo }}
        contentContainerStyle={styles.contenido}
        scrollEnabled={false}
      >
        {encabezadoPantalla}
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Cargando productos"
          style={styles.esqueleto}
        >
          <Skeleton estilo={styles.buscadorEsqueleto} />
          <View style={styles.chipsEsqueleto}>
            <Skeleton estilo={styles.chipEsqueleto} />
            <Skeleton estilo={styles.chipEsqueleto} />
            <Skeleton estilo={styles.chipEsqueleto} />
          </View>
          {FILAS_ESQUELETO.map((fila) => (
            <View key={fila[0]} style={styles.filaEsqueleto}>
              {fila.map((i) => (
                <TarjetaProductoEsqueleto key={i} ancho={anchoTarjeta} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  if (vm.estado === 'error' || !vm.hayProductos) {
    return (
      <ScrollView
        style={{ backgroundColor: colores.fondo }}
        contentContainerStyle={styles.contenido}
        refreshControl={vm.estado === 'error' ? undefined : refresco}
      >
        {encabezadoPantalla}
        <View style={styles.estado}>
          {vm.estado === 'error' ? (
            <EmptyState
              titulo={vm.errorRed ? 'Sin conexión' : 'No pudimos cargar la tienda'}
              mensaje={
                vm.errorRed
                  ? 'Revisa tu internet e intenta de nuevo.'
                  : 'Ocurrió un problema al traer los productos. Intenta de nuevo en un momento.'
              }
              accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
            />
          ) : (
            <EmptyState
              titulo="Aún no hay productos"
              mensaje="El salón todavía no publica productos en la app. Vuelve pronto."
            />
          )}
        </View>
      </ScrollView>
    );
  }

  // Elemento y no componente: si se definiera como componente en el render, el campo de búsqueda
  // se volvería a montar en cada letra y perdería el foco.
  const encabezadoLista = (
    <View>
      {encabezadoPantalla}
      <View style={styles.controles}>
        <BuscadorProductos valor={vm.busqueda} onCambiar={vm.setBusqueda} />
        <FiltroCategorias categorias={vm.categorias} elegida={vm.categoria} onElegir={vm.setCategoria} />
        {vm.errorRefresco ? (
          <Text accessibilityLiveRegion="polite" style={[styles.aviso, { color: colores.peligro }]}>
            No pudimos actualizar la tienda. Desliza hacia abajo para intentar de nuevo.
          </Text>
        ) : null}
      </View>
    </View>
  );

  const sinResultados = (
    <View style={styles.estado}>
      <EmptyState
        titulo="No encontramos productos"
        mensaje="Prueba con otra búsqueda o categoría."
        accion={{ titulo: 'Ver todos', onPress: vm.limpiarFiltros }}
      />
    </View>
  );

  return (
    <Animated.View entering={entrada} style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <FlatList
        data={vm.productosVisibles}
        keyExtractor={claveProducto}
        renderItem={renderProducto}
        numColumns={tienda.columnas}
        columnWrapperStyle={styles.filaProductos}
        ItemSeparatorComponent={SeparadorFilas}
        ListHeaderComponent={encabezadoLista}
        ListEmptyComponent={sinResultados}
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={refresco}
        initialNumToRender={tienda.tarjetasEsqueleto}
        maxToRenderPerBatch={tienda.tarjetasEsqueleto}
        windowSize={7}
      />
    </Animated.View>
  );
}

function SeparadorFilas() {
  return <View style={styles.separador} />;
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  contenido: {
    flexGrow: 1,
    paddingBottom: espacio.x3,
  },
  controles: {
    paddingHorizontal: pantalla.margen,
    paddingBottom: espacio.xl,
    gap: espacio.l,
  },
  aviso: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  // Las dos tarjetas de una fila se estiran al mismo alto (alignItems stretch por omisión).
  filaProductos: {
    paddingHorizontal: pantalla.margen,
    gap: espacio.m,
  },
  separador: {
    height: espacio.m,
  },
  estado: {
    paddingHorizontal: pantalla.margen,
  },
  esqueleto: {
    paddingHorizontal: pantalla.margen,
    gap: espacio.m,
  },
  buscadorEsqueleto: {
    height: toqueMinimo,
    borderRadius: radio.pastilla,
  },
  chipsEsqueleto: {
    flexDirection: 'row',
    gap: espacio.s,
    paddingTop: espacio.xs,
    paddingBottom: espacio.s,
  },
  chipEsqueleto: {
    width: toqueMinimo * 2,
    height: toqueMinimo,
    borderRadius: radio.pastilla,
  },
  filaEsqueleto: {
    flexDirection: 'row',
    gap: espacio.m,
  },
});
