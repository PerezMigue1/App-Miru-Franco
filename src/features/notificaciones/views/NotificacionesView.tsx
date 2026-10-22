import { CheckCheck } from 'lucide-react-native';
import { useCallback } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { InvitacionSesion } from '@/features/auth/components/InvitacionSesion';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import {
  avisosInternos,
  espacio,
  fuente,
  icono,
  opacidad,
  pantalla,
  radio,
  tipo,
  toqueMinimo,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { FilaAviso, FilaAvisoEsqueleto } from '../components/FilaAviso';
import {
  useNotificaciones,
  type Aviso,
  type NotificacionesViewModel,
} from '../viewmodels/useNotificaciones';

/** Filas que dibuja el skeleton mientras carga la bandeja. */
const ESQUELETOS = Array.from({ length: avisosInternos.esqueletos }, (_, i) => i);

function claveDe(aviso: Aviso): string {
  return aviso.id;
}

function Separador() {
  return <View style={styles.separador} />;
}

/**
 * Notificaciones: pantalla propia encima de las pestañas (se abre con la campana). Solo pinta; todo
 * sale de useNotificaciones. Son avisos internos: llegan en vivo mientras la app está abierta y en
 * primer plano (no hay notificaciones push), y se quedan aquí para leerlos después.
 */
export default function NotificacionesView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const vm = useNotificaciones();

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver
        titulo="Notificaciones"
        subtitulo="Avisos del sistema sobre pedidos y tu cuenta"
        onVolver={vm.regresar}
      />
      {vm.conSesion ? (
        <Contenido vm={vm} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: bottom + espacio.x3 }}>
          <InvitacionSesion
            titulo="Tus avisos en un solo lugar"
            beneficio="Inicia sesión para recibir los recordatorios de tus citas y el estado de tus pedidos."
          />
        </ScrollView>
      )}
    </View>
  );
}

/** Skeleton, error con Reintentar, vacío o la lista de avisos. */
function Contenido({ vm }: { vm: NotificacionesViewModel }) {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  // Entrada única de la lista al terminar de cargar: en el contenedor, nunca en cada fila.
  const entrada = useEntradaContenido();
  const { abrirAviso, borrarAviso, ahora } = vm;

  const renderItem = useCallback<ListRenderItem<Aviso>>(
    ({ item }) => <FilaAviso aviso={item} ahora={ahora} onAbrir={abrirAviso} onBorrar={borrarAviso} />,
    [ahora, abrirAviso, borrarAviso],
  );

  const relleno = { paddingBottom: bottom + espacio.x3 };

  if (vm.vista === 'cargando') {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Cargando tus avisos"
        style={[styles.cuerpo, styles.lista]}
      >
        {ESQUELETOS.map((i) => (
          <FilaAvisoEsqueleto key={i} />
        ))}
      </View>
    );
  }

  if (vm.vista === 'error') {
    return (
      <ScrollView contentContainerStyle={[styles.cuerpo, relleno]}>
        <EmptyState
          titulo="No pudimos cargar tus avisos"
          mensaje={vm.mensajeError ?? 'Intenta de nuevo en un momento.'}
          accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
        />
      </ScrollView>
    );
  }

  const refresco = (
    <RefreshControl
      refreshing={vm.refrescando}
      onRefresh={vm.refrescar}
      colors={[colores.foco]}
      tintColor={colores.foco}
      progressBackgroundColor={colores.superficie}
    />
  );
  const cabecera = <CabeceraBandeja vm={vm} />;

  if (vm.vista === 'vacio') {
    return (
      <ScrollView contentContainerStyle={[styles.cuerpo, relleno]} refreshControl={refresco}>
        {cabecera}
        <EmptyState
          titulo="Aquí verás tus avisos"
          mensaje="Los recordatorios de tus citas y el estado de tus pedidos llegarán aquí."
        />
      </ScrollView>
    );
  }

  return (
    <Animated.View entering={entrada} style={styles.raiz}>
      <FlatList
        data={vm.avisos}
        keyExtractor={claveDe}
        renderItem={renderItem}
        ItemSeparatorComponent={Separador}
        ListHeaderComponent={cabecera}
        ListHeaderComponentStyle={styles.cabeceraLista}
        contentContainerStyle={[styles.cuerpo, relleno]}
        refreshControl={refresco}
      />
    </Animated.View>
  );
}

/** "Marcar todas como leídas" y, si falló algo, la línea de error con el mensaje amable. */
function CabeceraBandeja({ vm }: { vm: NotificacionesViewModel }) {
  const { colores } = useTheme();
  const sinNoLeidos = vm.noLeidos === 0;
  return (
    <View style={styles.cabecera}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: sinNoLeidos }}
        disabled={sinNoLeidos}
        onPress={vm.marcarTodas}
        style={({ pressed }) => [
          styles.accion,
          { backgroundColor: pressed ? colores.presionado : colores.transparente },
          sinNoLeidos ? styles.deshabilitada : null,
        ]}
      >
        <CheckCheck color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        <Text style={[styles.textoAccion, { color: colores.texto }]}>Marcar todas como leídas</Text>
      </Pressable>
      {vm.avisoError ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colores.peligro }]}>
          {vm.avisoError}
        </Text>
      ) : null}
    </View>
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
    marginBottom: espacio.s,
  },
  cabecera: {
    gap: espacio.s,
  },
  accion: {
    alignSelf: 'flex-end',
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingHorizontal: espacio.s,
    borderRadius: radio.pastilla,
  },
  deshabilitada: {
    opacity: opacidad.deshabilitado,
  },
  textoAccion: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  error: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
