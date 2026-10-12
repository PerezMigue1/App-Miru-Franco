import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { InvitacionSesion } from '@/features/auth/components/InvitacionSesion';
import { useAuth } from '@/features/auth/viewmodels/useAuth';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import { espacio, fuente, pantalla, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { TarjetaPedido, TarjetaPedidoEsqueleto } from '../components/TarjetaPedido';
import type { Pedido } from '../models/pedidoModel';
import { useMisPedidosViewModel, type MisPedidosViewModel } from '../viewmodels/useMisPedidosViewModel';

/** Tarjetas que dibuja el skeleton mientras carga la lista. */
const ESQUELETOS = [0, 1, 2];

function claveDe(pedido: Pedido): string {
  return String(pedido.id);
}

function Separador() {
  return <View style={styles.separador} />;
}

/**
 * Mis pedidos (GP-06.4): compras de la clienta en sesión, con pull to refresh y recarga silenciosa
 * al volver a la pantalla. Cada tarjeta abre el detalle de su pedido.
 */
export default function MisPedidosView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const router = useRouter();
  const { estado } = useAuth();
  const vm = useMisPedidosViewModel();
  const conSesion = estado === 'autenticado';

  const regresar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/perfil' as Href);
    }
  };

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo="Mis pedidos" onVolver={regresar} />
      {conSesion ? (
        <Contenido vm={vm} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: bottom + espacio.x3 }}>
          <InvitacionSesion
            titulo="Tus pedidos"
            beneficio="Inicia sesión para ver tus compras y saber cuándo puedes recogerlas."
          />
        </ScrollView>
      )}
    </View>
  );
}

/** Skeleton, error con Reintentar, vacío o la lista de pedidos. */
function Contenido({ vm }: { vm: MisPedidosViewModel }) {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  // Entrada única de la lista al terminar de cargar: en el contenedor, nunca en cada tarjeta.
  const entrada = useEntradaContenido();
  const { abrirPedido } = vm;

  const renderItem = useCallback<ListRenderItem<Pedido>>(
    ({ item }) => <TarjetaPedido pedido={item} onAbrir={abrirPedido} />,
    [abrirPedido],
  );

  const relleno = { paddingBottom: bottom + espacio.x3 };
  const refresco = (
    <RefreshControl
      refreshing={vm.refrescando}
      onRefresh={vm.refrescar}
      colors={[colores.foco]}
      tintColor={colores.foco}
      progressBackgroundColor={colores.superficie}
    />
  );

  if (vm.estado === 'cargando') {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Cargando tus pedidos"
        style={[styles.cuerpo, styles.lista]}
      >
        {ESQUELETOS.map((i) => (
          <TarjetaPedidoEsqueleto key={i} />
        ))}
      </View>
    );
  }

  if (vm.estado === 'error') {
    return (
      <ScrollView contentContainerStyle={[styles.cuerpo, relleno]}>
        <EmptyState
          titulo="No pudimos cargar tus pedidos"
          mensaje={vm.mensajeError ?? 'Intenta de nuevo en un momento.'}
          accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
        />
      </ScrollView>
    );
  }

  const aviso = vm.avisoRefresco ? (
    <Text accessibilityRole="alert" style={[styles.aviso, { color: colores.texto }]}>
      {vm.avisoRefresco}
    </Text>
  ) : null;

  if (vm.pedidos.length === 0) {
    return (
      <ScrollView contentContainerStyle={[styles.cuerpo, relleno]} refreshControl={refresco}>
        {aviso}
        <EmptyState
          titulo="Aún no tienes pedidos"
          mensaje="Cuando compres en la tienda, tus pedidos aparecerán aquí."
          accion={{ titulo: 'Ver la tienda', onPress: vm.verTienda }}
        />
      </ScrollView>
    );
  }

  return (
    <Animated.View entering={entrada} style={styles.raiz}>
      <FlatList
        data={vm.pedidos}
        keyExtractor={claveDe}
        renderItem={renderItem}
        ItemSeparatorComponent={Separador}
        ListHeaderComponent={aviso}
        ListHeaderComponentStyle={aviso ? styles.cabeceraLista : undefined}
        contentContainerStyle={[styles.cuerpo, relleno]}
        refreshControl={refresco}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  cuerpo: {
    paddingHorizontal: pantalla.margen,
    // Margen para que la sombra de la primera tarjeta no se recorte bajo el encabezado.
    paddingTop: espacio.xs,
  },
  lista: {
    gap: espacio.l,
  },
  separador: {
    height: espacio.l,
  },
  cabeceraLista: {
    marginBottom: espacio.l,
  },
  aviso: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
