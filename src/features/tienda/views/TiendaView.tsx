import { useCallback, useRef } from 'react';
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

import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { BotonFiltros } from '@/shared/ui/Filtros';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  controles,
  espacio,
  filtrosTienda,
  fuente,
  pantalla,
  radio,
  tienda,
  tipo,
  toqueMinimo,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { BuscadorProductos } from '../components/BuscadorProductos';
import { FiltroCategorias } from '../components/FiltroCategorias';
import { HojaFiltrosTienda } from '../components/HojaFiltrosTienda';
import { TarjetaProducto, TarjetaProductoEsqueleto } from '../components/TarjetaProducto';
import { useCatalogoViewModel, type ProductoCatalogo } from '../viewmodels/useCatalogoViewModel';
import { useTextosTienda } from '../viewmodels/textosTienda';

/** Filas del skeleton: tarjetasEsqueleto repartidas en las columnas de la cuadrícula. */
const FILAS_ESQUELETO = Array.from(
  { length: Math.ceil(tienda.tarjetasEsqueleto / tienda.columnas) },
  (_, fila) => Array.from({ length: tienda.columnas }, (__, columna) => fila * tienda.columnas + columna),
);

function claveProducto(producto: ProductoCatalogo): string {
  return String(producto.id);
}

/** Pestaña Productos (ruta tienda): catálogo público en dos columnas con búsqueda, categorías, filtros y páginas. */
export default function TiendaView() {
  const { colores } = useTheme();
  const { width } = useWindowDimensions();
  const vm = useCatalogoViewModel();
  const { catalogo: textos } = useTextosTienda();
  const refLista = useRef<FlatList<ProductoCatalogo>>(null);
  // La cuadrícula aparece una sola vez al terminar de cargar (en el contenedor, no en cada fila).
  const entrada = useEntradaContenido();

  const anchoTarjeta =
    (width - pantalla.margen * 2 - espacio.m * (tienda.columnas - 1)) / tienda.columnas;

  const { abrirProducto } = vm;
  const renderProducto = useCallback<ListRenderItem<ProductoCatalogo>>(
    ({ item }) => <TarjetaProducto producto={item} ancho={anchoTarjeta} onAbrir={abrirProducto} />,
    [anchoTarjeta, abrirProducto],
  );

  // El carrito tiene su propia pestaña: la cabecera de Productos solo lleva el título.
  const encabezadoPantalla = (
    <ScreenHeader titulo={textos.titulo} subtitulo={textos.subtitulo} />
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
          accessibilityLabel={textos.cargando}
          style={styles.esqueleto}
        >
          <View style={styles.filaBuscador}>
            <Skeleton estilo={[styles.buscadorEsqueleto, styles.buscador]} />
            <Skeleton estilo={[styles.buscadorEsqueleto, styles.botonFiltrosEsqueleto]} />
          </View>
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
              titulo={vm.errorRed ? textos.sinRedTitulo : textos.errorTitulo}
              mensaje={vm.errorRed ? textos.sinRedTexto : textos.errorTexto}
              accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
            />
          ) : (
            <EmptyState
              titulo={textos.vacioTitulo}
              mensaje={textos.vacioTexto}
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
        <View style={styles.filaBuscador}>
          <View style={styles.buscador}>
            <BuscadorProductos valor={vm.busqueda} onCambiar={vm.setBusqueda} />
          </View>
          <BotonFiltros activos={vm.filtrosActivos} onPress={vm.abrirFiltros} />
        </View>
        <FiltroCategorias categorias={vm.categorias} elegida={vm.categoria} onElegir={vm.setCategoria} />
        {vm.errorRefresco ? (
          <Text accessibilityLiveRegion="polite" style={[styles.aviso, { color: colores.peligro }]}>
            {textos.refresco}
          </Text>
        ) : null}
      </View>
    </View>
  );

  const sinResultados = (
    <View style={styles.estado}>
      <EmptyState
        titulo={textos.sinResultadosTitulo}
        mensaje={textos.sinResultadosTexto}
        accion={{ titulo: textos.verTodos, onPress: vm.limpiarFiltros }}
      />
    </View>
  );

  // Al cambiar de página la lista vuelve arriba, al encabezado.
  const irAPagina = (cambiar: () => void) => {
    cambiar();
    refLista.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const paginador =
    vm.totalPaginas > 1 ? (
      <View style={styles.paginador}>
        <Text style={[styles.textoPaginador, { color: colores.textoSuave }]}>{vm.textoRango}</Text>
        <View style={styles.botonesPaginador}>
          <View style={styles.botonPaginador}>
            <Button
              titulo="Anterior"
              variante="secundario"
              onPress={() => irAPagina(vm.paginaAnterior)}
              deshabilitado={vm.pagina <= 1}
              accessibilityLabel="Página anterior"
            />
          </View>
          <View style={styles.botonPaginador}>
            <Button
              titulo="Siguiente"
              variante="secundario"
              onPress={() => irAPagina(vm.paginaSiguiente)}
              deshabilitado={vm.pagina >= vm.totalPaginas}
              accessibilityLabel="Página siguiente"
            />
          </View>
        </View>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.textoPaginador, { color: colores.texto }]}
        >
          Página {vm.pagina} de {vm.totalPaginas}
        </Text>
      </View>
    ) : null;

  return (
    <Animated.View entering={entrada} style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <FlatList
        ref={refLista}
        data={vm.productosPagina}
        keyExtractor={claveProducto}
        renderItem={renderProducto}
        numColumns={tienda.columnas}
        columnWrapperStyle={styles.filaProductos}
        ItemSeparatorComponent={SeparadorFilas}
        ListHeaderComponent={encabezadoLista}
        ListEmptyComponent={sinResultados}
        ListFooterComponent={paginador}
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={refresco}
        initialNumToRender={tienda.tarjetasEsqueleto}
        maxToRenderPerBatch={tienda.tarjetasEsqueleto}
        windowSize={7}
      />
      <HojaFiltrosTienda
        visible={vm.hojaFiltros}
        onCerrar={vm.cerrarFiltros}
        categoria={vm.categoria}
        borrador={vm.borrador}
        borradorActivos={vm.borradorActivos}
        grupos={vm.gruposFiltro}
        onCambiarPrecioMinimo={vm.setPrecioMinimo}
        onCambiarPrecioMaximo={vm.setPrecioMaximo}
        onAlternar={vm.alternarOpcion}
        onLimpiar={vm.limpiarBorrador}
        onAplicar={vm.aplicarFiltros}
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
  // Buscador y botón "Filtros" en la misma fila: el buscador toma el ancho que sobra.
  filaBuscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: filtrosTienda.separacionBoton,
  },
  buscador: {
    flex: 1,
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
  paginador: {
    alignItems: 'center',
    gap: espacio.m,
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.xxl,
  },
  botonesPaginador: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: espacio.m,
  },
  botonPaginador: {
    flex: 1,
  },
  textoPaginador: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
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
    borderRadius: radio.campo,
  },
  botonFiltrosEsqueleto: {
    width: filtrosTienda.anchoBotonEsqueleto,
  },
  chipsEsqueleto: {
    flexDirection: 'row',
    gap: espacio.s,
    paddingTop: espacio.xs,
    paddingBottom: espacio.s,
  },
  chipEsqueleto: {
    width: toqueMinimo * 2,
    height: controles.pastillaAlto,
    borderRadius: radio.campo,
  },
  filaEsqueleto: {
    flexDirection: 'row',
    gap: espacio.m,
  },
});
