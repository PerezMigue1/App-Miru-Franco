import { useCallback, type ReactNode } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';

import { InvitacionSesion } from '@/features/auth/components/InvitacionSesion';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Hoja } from '@/shared/ui/Hoja';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import { TituloPagina } from '@/shared/ui/CabeceraCompacta';
import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import { borde, espacio, fuente, pantalla, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { FilaCarrito, FilaCarritoEsqueleto } from '../components/FilaCarrito';
import type { ItemCarrito } from '../models/carritoModel';
import { formatoPrecio } from '../models/productoModel';
import { useCarritoViewModel } from '../viewmodels/useCarritoViewModel';

const ESQUELETOS = [0, 1, 2];
const TITULO = 'Carrito';
const SUBTITULO = 'Revisa tus productos antes de finalizar la compra';

/**
 * Pestaña Carrito: productos con su cantidad, total y el paso a finalizar la compra. Como pestaña
 * no lleva Volver; el pie del total queda justo arriba de la barra inferior.
 */
export default function CarritoView() {
  const { colores } = useTheme();
  const vm = useCarritoViewModel();
  // La lista aparece una vez al terminar de cargar (en el contenedor, nunca en cada fila).
  const entrada = useEntradaContenido();

  const { ocupados, errores, cambiarCantidad, pedirQuitar } = vm;
  const renderItem = useCallback<ListRenderItem<ItemCarrito>>(
    ({ item }) => (
      <FilaCarrito
        item={item}
        ocupado={ocupados.has(item.id)}
        error={errores[item.id]}
        onCambiar={cambiarCantidad}
        onQuitar={pedirQuitar}
      />
    ),
    [ocupados, errores, cambiarCantidad, pedirQuitar],
  );

  const porQuitar = vm.porQuitar;
  const conItems = vm.estado === 'listo' && vm.items.length > 0;
  // Con la lista a la vista, el título va dentro de ella y se desplaza (el pie del total es fijo).
  const conLista = vm.conSesion && conItems;

  let cuerpo: ReactNode;
  if (vm.sesionCargando || (vm.conSesion && vm.estado === 'cargando')) {
    cuerpo = (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Cargando tu carrito"
        style={styles.lista}
      >
        {ESQUELETOS.map((i) => (
          <FilaCarritoEsqueleto key={i} />
        ))}
      </View>
    );
  } else if (!vm.conSesion) {
    cuerpo = (
      <ScrollView contentContainerStyle={styles.relleno}>
        <InvitacionSesion
          titulo="Tu carrito te espera"
          beneficio="Inicia sesión para guardar tus productos y apartarlos en el salón."
        />
      </ScrollView>
    );
  } else if (vm.estado === 'error') {
    cuerpo = (
      <ScrollView contentContainerStyle={[styles.estado, styles.relleno]}>
        <EmptyState
          titulo="No pudimos cargar tu carrito"
          mensaje="Revisa tu conexión e intenta de nuevo."
          accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
        />
      </ScrollView>
    );
  } else if (vm.items.length === 0) {
    cuerpo = (
      <ScrollView contentContainerStyle={[styles.estado, styles.relleno]}>
        <EmptyState
          titulo="Tu carrito está vacío"
          mensaje="Agrega productos desde la tienda y aparecerán aquí."
          accion={{ titulo: 'Ver la tienda', onPress: vm.verTienda }}
        />
      </ScrollView>
    );
  } else {
    cuerpo = (
      <Animated.View entering={entrada} style={styles.flex}>
        <FlatList
          data={vm.items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.lista}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.tituloEnLista}>
              <TituloPagina titulo={TITULO} subtitulo={SUBTITULO} />
            </View>
          }
        />
      </Animated.View>
    );
  }

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <ScreenHeader titulo={TITULO} subtitulo={SUBTITULO} tituloEnContenido={conLista} />
      <View style={styles.flex}>{cuerpo}</View>

      {vm.conSesion && conItems ? (
        <View
          style={[styles.pie, { borderTopColor: colores.hairline, backgroundColor: colores.fondo }]}
        >
          <View
            style={styles.filaTotal}
            accessible
            accessibilityLabel={`Total: ${formatoPrecio(vm.total)}`}
          >
            <Text style={[styles.etiquetaTotal, { color: colores.texto }]}>Total</Text>
            <Text style={[styles.cifraTotal, { color: colores.texto }]}>{formatoPrecio(vm.total)}</Text>
          </View>
          <Text style={[styles.nota, { color: colores.textoSuave }]}>
            Recoges tu pedido en el salón. Pagas en línea o al recogerlo.
          </Text>
          <View collapsable={false} accessibilityLiveRegion="polite">
            {vm.hayProblemas ? (
              <Text style={[styles.nota, styles.notaFuerte, { color: colores.texto }]}>
                Ajusta los productos marcados para continuar.
              </Text>
            ) : null}
          </View>
          <Button
            titulo="Continuar compra"
            onPress={vm.continuar}
            deshabilitado={vm.hayProblemas || vm.ocupados.size > 0}
          />
        </View>
      ) : null}

      <Hoja
        visible={porQuitar !== null}
        onCerrar={vm.cancelarQuitar}
        titulo="¿Quitar este producto?"
        texto={porQuitar ? [porQuitar.nombre, porQuitar.tamanio].filter(Boolean).join(', ') : undefined}
      >
        <View style={styles.accionesHoja}>
          <Button titulo="Quitar" variante="peligro" onPress={vm.confirmarQuitar} cargando={vm.quitando} />
          <Button
            titulo="Conservar"
            variante="secundario"
            onPress={vm.cancelarQuitar}
            deshabilitado={vm.quitando}
          />
        </View>
      </Hoja>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  lista: {
    gap: espacio.m,
    paddingHorizontal: pantalla.margen,
    paddingBottom: espacio.xxl,
  },
  // TituloPagina ya trae el margen lateral de la pantalla: dentro de la lista se compensa.
  tituloEnLista: {
    marginHorizontal: -pantalla.margen,
  },
  estado: {
    flexGrow: 1,
    paddingHorizontal: pantalla.margen,
  },
  // La barra inferior ya ocupa el área segura de abajo: solo el aire propio del contenido.
  relleno: {
    paddingBottom: espacio.x3,
  },
  pie: {
    gap: espacio.s,
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.l,
    paddingBottom: espacio.l,
    borderTopWidth: borde.hairline,
  },
  filaTotal: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: espacio.m,
  },
  etiquetaTotal: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  cifraTotal: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    fontVariant: ['tabular-nums'],
  },
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  notaFuerte: {
    fontFamily: fuente.textoMedio,
  },
  accionesHoja: {
    gap: espacio.m,
  },
});
