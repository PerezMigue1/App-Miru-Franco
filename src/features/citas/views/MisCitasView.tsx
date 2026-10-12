import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { InvitacionSesion } from '@/features/auth/components/InvitacionSesion';
import { useAuth } from '@/features/auth/viewmodels/useAuth';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import {
  curva,
  duracion,
  espacio,
  fuente,
  pantalla,
  radio,
  sombra,
  tipo,
  toqueMinimo,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

import { TarjetaCita, TarjetaCitaEsqueleto } from '../components/TarjetaCita';
import type { Cita } from '../models/citaModel';
import { useMisCitasViewModel, type MisCitasViewModel } from '../viewmodels/useMisCitasViewModel';

type Segmento = 'proximas' | 'historial';

const SEGMENTOS: { valor: Segmento; etiqueta: string }[] = [
  { valor: 'proximas', etiqueta: 'Próximas' },
  { valor: 'historial', etiqueta: 'Historial' },
];

const EASE_ENTRADA_SALIDA = Easing.bezier(...curva.entradaSalida);

/** Tarjetas que dibuja el skeleton mientras carga la lista. */
const ESQUELETOS = [0, 1, 2];

/**
 * Mis citas (GP-06.3): próximas e historial de la clienta en sesión, con pull to refresh y recarga
 * silenciosa al volver a la pantalla. Cada tarjeta abre el detalle de su cita.
 */
export default function MisCitasView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const router = useRouter();
  const { estado } = useAuth();
  const vm = useMisCitasViewModel();
  const [segmento, setSegmento] = useState<Segmento>('proximas');
  const conSesion = estado === 'autenticado';

  const regresar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/citas');
    }
  };

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo="Mis citas" onVolver={regresar} />
      <ScrollView
        style={{ backgroundColor: colores.fondo }}
        contentContainerStyle={{ paddingBottom: bottom + espacio.x3 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          conSesion ? (
            <RefreshControl
              refreshing={vm.refrescando}
              onRefresh={vm.refrescar}
              colors={[colores.foco]}
              tintColor={colores.foco}
              progressBackgroundColor={colores.superficie}
            />
          ) : undefined
        }
      >
        {!conSesion ? (
          <InvitacionSesion
            titulo="Reserva y sigue tus citas"
            beneficio="Inicia sesión para agendar, pagar tu anticipo y ver tus próximas visitas."
          />
        ) : (
          <View style={styles.cuerpo}>
            <ControlSegmentado valor={segmento} onCambiar={setSegmento} />
            <ListaMisCitas
              vm={vm}
              segmento={segmento}
              onReservar={() => router.navigate('/citas')}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** Contenido del segmento: skeleton, error con Reintentar, vacío o la lista de tarjetas. */
function ListaMisCitas({
  vm,
  segmento,
  onReservar,
}: {
  vm: MisCitasViewModel;
  segmento: Segmento;
  onReservar: () => void;
}) {
  const { colores } = useTheme();

  if (vm.estado === 'cargando') {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Cargando tus citas"
        style={styles.lista}
      >
        {ESQUELETOS.map((i) => (
          <TarjetaCitaEsqueleto key={i} />
        ))}
      </View>
    );
  }

  if (vm.estado === 'error') {
    return (
      <EmptyState
        titulo="No pudimos cargar tus citas"
        mensaje={vm.mensajeError ?? 'Intenta de nuevo en un momento.'}
        accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
      />
    );
  }

  const citas: Cita[] = segmento === 'proximas' ? vm.proximas : vm.historial;
  const aviso = vm.avisoRefresco ? (
    <Text accessibilityRole="alert" style={[styles.aviso, { color: colores.texto }]}>
      {vm.avisoRefresco}
    </Text>
  ) : null;

  if (citas.length === 0) {
    return (
      <>
        {aviso}
        {segmento === 'proximas' ? (
          <EmptyState
            titulo="Aquí verás tus próximas citas"
            mensaje="Cada cita aparecerá con su fecha, su hora y el estado de su anticipo."
            accion={{ titulo: 'Reservar una cita', onPress: onReservar }}
          />
        ) : (
          <EmptyState
            titulo="Aquí verás tus citas anteriores"
            mensaje="Tu historial de visitas al salón aparecerá en esta sección."
          />
        )}
      </>
    );
  }

  return (
    <View style={styles.lista}>
      {aviso}
      {citas.map((cita) => (
        <TarjetaCita
          key={String(cita.id)}
          cita={cita}
          onPress={() => vm.abrirCita(cita)}
          accion={
            segmento === 'historial' && vm.puedeReservarIgual(cita) ? (
              <BotonReservarIgual cita={cita} onPress={() => vm.reservarIgual(cita)} />
            ) : undefined
          }
        />
      ))}
    </View>
  );
}

/** "Reservar lo mismo": el mismo servicio con la misma especialista, desde el historial. */
function BotonReservarIgual({ cita, onPress }: { cita: Cita; onPress: () => void }) {
  const servicio = cita.servicioNombre || 'este servicio';
  const etiqueta = cita.especialistaNombre
    ? `Reservar ${servicio} otra vez con ${cita.especialistaNombre}`
    : `Reservar ${servicio} otra vez`;
  return (
    <Button
      titulo="Reservar lo mismo"
      variante="contorno"
      onPress={onPress}
      accessibilityLabel={etiqueta}
    />
  );
}

/** Control segmentado con indicador que se desliza 240 ms (inmediato con movimiento reducido). */
function ControlSegmentado({
  valor,
  onCambiar,
}: {
  valor: Segmento;
  onCambiar: (segmento: Segmento) => void;
}) {
  const { colores } = useTheme();
  const reducido = useMovimientoReducido();
  const [ancho, setAncho] = useState(0);
  const posicion = useSharedValue(SEGMENTOS.findIndex((s) => s.valor === valor));
  const anchoIndicador = (ancho - espacio.xs * 2) / SEGMENTOS.length;

  const estiloIndicador = useAnimatedStyle(() => ({
    transform: [{ translateX: posicion.get() * anchoIndicador }],
  }));

  const elegir = (segmento: Segmento) => {
    const indice = SEGMENTOS.findIndex((s) => s.valor === segmento);
    posicion.set(
      reducido ? indice : withTiming(indice, { duration: duracion.pestana, easing: EASE_ENTRADA_SALIDA }),
    );
    onCambiar(segmento);
  };

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width)}
      style={[styles.segmentado, { backgroundColor: colores.superficieSecundaria }]}
    >
      {ancho > 0 ? (
        <Animated.View
          style={[
            styles.indicador,
            { width: anchoIndicador, backgroundColor: colores.fondo, shadowColor: colores.sombra },
            estiloIndicador,
          ]}
        />
      ) : null}
      {SEGMENTOS.map((s) => {
        const activo = s.valor === valor;
        return (
          <Pressable
            key={s.valor}
            accessibilityRole="tab"
            accessibilityState={{ selected: activo }}
            onPress={() => elegir(s.valor)}
            style={styles.segmento}
          >
            <Text
              style={[
                styles.textoSegmento,
                { color: activo ? colores.texto : colores.textoSuave },
              ]}
            >
              {s.etiqueta}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  cuerpo: {
    paddingHorizontal: pantalla.margen,
    gap: espacio.xxl,
  },
  lista: {
    gap: espacio.l,
  },
  aviso: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  segmentado: {
    flexDirection: 'row',
    padding: espacio.xs,
    borderRadius: radio.pastilla,
  },
  indicador: {
    position: 'absolute',
    top: espacio.xs,
    bottom: espacio.xs,
    left: espacio.xs,
    borderRadius: radio.pastilla,
    shadowOpacity: sombra.boton.opacidad,
    shadowRadius: sombra.boton.radio,
    shadowOffset: { width: 0, height: sombra.boton.desplazamientoY },
    elevation: sombra.boton.elevacion,
  },
  segmento: {
    flex: 1,
    minHeight: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoSegmento: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
