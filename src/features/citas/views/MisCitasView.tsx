import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { InvitacionSesion } from '@/features/auth/components/InvitacionSesion';
import { useAuth } from '@/features/auth/viewmodels/useAuth';
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

type Segmento = 'proximas' | 'historial';

const SEGMENTOS: { valor: Segmento; etiqueta: string }[] = [
  { valor: 'proximas', etiqueta: 'Próximas' },
  { valor: 'historial', etiqueta: 'Historial' },
];

const EASE_ENTRADA_SALIDA = Easing.bezier(...curva.entradaSalida);

/** Mis citas: próximas e historial (las citas reales llegan en GP-06.3). */
export default function MisCitasView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const router = useRouter();
  const { estado } = useAuth();
  const [segmento, setSegmento] = useState<Segmento>('proximas');

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
      >
        {estado !== 'autenticado' ? (
          <InvitacionSesion
            titulo="Reserva y sigue tus citas"
            beneficio="Inicia sesión para agendar, pagar tu anticipo y ver tus próximas visitas."
          />
        ) : (
          <View style={styles.cuerpo}>
            <ControlSegmentado valor={segmento} onCambiar={setSegmento} />

            {segmento === 'proximas' ? (
              <EmptyState
                titulo="Aquí verás tus próximas citas"
                mensaje="Cada cita aparecerá con su fecha, su hora y el estado de su anticipo."
              />
            ) : (
              <EmptyState
                titulo="Aquí verás tus citas anteriores"
                mensaje="Tu historial de visitas al salón aparecerá en esta sección."
              />
            )}
          </View>
        )}
      </ScrollView>
    </View>
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
