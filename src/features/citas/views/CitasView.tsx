import { CalendarPlus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import {
  curva,
  duracion,
  espacio,
  fuente,
  icono,
  pantalla,
  radio,
  sombra,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

type Segmento = 'proximas' | 'historial';

const SEGMENTOS: { valor: Segmento; etiqueta: string }[] = [
  { valor: 'proximas', etiqueta: 'Próximas' },
  { valor: 'historial', etiqueta: 'Historial' },
];

const EASE_ENTRADA_SALIDA = Easing.bezier(...curva.entradaSalida);

/** Mis citas: solo presentación; las citas reales llegan en GP-06. */
export default function CitasView() {
  const { colores } = useTheme();
  const [segmento, setSegmento] = useState<Segmento>('proximas');

  return (
    <ScrollView
      style={{ backgroundColor: colores.fondo }}
      contentContainerStyle={styles.contenido}
    >
      <ScreenHeader titulo="Mis citas" />
      <View style={styles.cuerpo}>
        <View style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombra }]}>
          <Text accessibilityRole="header" style={[styles.tituloTarjeta, { color: colores.texto }]}>
            Reserva tu próxima visita
          </Text>
          <Text style={[styles.texto, { color: colores.texto }]}>
            Elige el servicio, el día y la hora que mejor te acomoden.
          </Text>
          {/* TODO(GP-06): abrir el flujo de reserva. */}
          <Button
            titulo="Reservar cita"
            accessibilityHint="Disponible próximamente"
            icono={
              <CalendarPlus
                color={colores.textoSobreAccion}
                size={icono.tamanoPequeno}
                strokeWidth={icono.trazo}
              />
            }
            posicionIcono="inicio"
          />
        </View>

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
    </ScrollView>
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
  contenido: {
    flexGrow: 1,
    paddingBottom: espacio.x3,
  },
  cuerpo: {
    paddingHorizontal: pantalla.margen,
    gap: espacio.xxl,
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
  tituloTarjeta: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
  },
  texto: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    marginBottom: espacio.xs,
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
