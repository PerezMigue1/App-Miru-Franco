import { Bell } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, Keyframe, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EASE_SALIDA, usePresion } from '@/shared/ui/movimiento';
import {
  avisosInternos,
  duracion,
  escalaPresionadoTarjeta,
  espacio,
  fuente,
  icono,
  movimiento,
  pantalla,
  radio,
  sombra,
  tipo,
  toqueMinimo,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

import { useAvisoEnPantalla } from '../viewmodels/useAvisoEnPantalla';

/**
 * Entrada y salida del aviso: baja 8 desde arriba con opacidad en 220 ms y sale subiendo en 160 ms.
 * Con movimiento reducido solo se funde, sin desplazamiento. Solo opacity y translateY.
 */
function useTransiciones() {
  const reducido = useMovimientoReducido();
  return useMemo(() => {
    if (reducido) {
      return {
        entrada: FadeIn.duration(duracion.aparecer).reduceMotion(ReduceMotion.Never),
        salida: FadeOut.duration(duracion.reducido).reduceMotion(ReduceMotion.Never),
      };
    }
    return {
      entrada: new Keyframe({
        0: { opacity: 0, transform: [{ translateY: -movimiento.desplazamiento }] },
        100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE_SALIDA },
      }).duration(duracion.aparecer),
      salida: new Keyframe({
        0: { opacity: 1, transform: [{ translateY: 0 }] },
        100: { opacity: 0, transform: [{ translateY: -movimiento.desplazamiento }], easing: EASE_SALIDA },
      }).duration(duracion.reducido),
    };
  }, [reducido]);
}

/**
 * Aviso interno en pantalla (GP-07.2): cuando llega un aviso en vivo, una tarjeta breve con su
 * título aparece arriba, bajo la barra de estado, durante unos segundos. Tocarla lo marca como
 * leído y abre su destino (o la bandeja). La capa mide lo que la tarjeta y no recibe toques propios
 * (box-none): no tapa la navegación y nunca llega a la barra de pestañas. Va montada una sola vez en
 * src/app/_layout.tsx.
 */
export function AvisoEnPantalla() {
  const { top } = useSafeAreaInsets();
  const { aviso, abrir } = useAvisoEnPantalla();
  const { entrada, salida } = useTransiciones();

  return (
    <View pointerEvents="box-none" style={[styles.capa, { top: top + avisosInternos.separacionArriba }]}>
      {aviso ? (
        // La llave cambia con cada aviso: el nuevo entra y el anterior sale.
        <Animated.View key={aviso.id} entering={entrada} exiting={salida}>
          <TarjetaAviso titulo={aviso.titulo} onPress={abrir} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function TarjetaAviso({ titulo, onPress }: { titulo: string; onPress: () => void }) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion(escalaPresionadoTarjeta);
  return (
    <Animated.View
      style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }, estilo]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Aviso nuevo: ${titulo}. Toca para abrirlo`}
        accessibilityLiveRegion="polite"
        onPress={onPress}
        onPressIn={hundir}
        onPressOut={soltar}
        style={styles.contenido}
      >
        <View style={[styles.circulo, { backgroundColor: colores.accion }]}>
          <Bell color={colores.textoSobreAccion} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        </View>
        <View style={styles.textos}>
          <Text style={[styles.etiqueta, { color: colores.textoSuave }]}>Aviso nuevo</Text>
          <Text numberOfLines={2} style={[styles.titulo, { color: colores.texto }]}>
            {titulo}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Capa del alto de la tarjeta: arriba, con los márgenes de la pantalla, lejos de las pestañas. Al
  // reemplazar un aviso, el que sale ya no ocupa lugar (Reanimated lo quita del layout).
  capa: {
    position: 'absolute',
    left: pantalla.margen,
    right: pantalla.margen,
  },
  tarjeta: {
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  contenido: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    paddingVertical: espacio.m,
    paddingHorizontal: espacio.l,
  },
  circulo: {
    width: toqueMinimo - espacio.s * 2,
    height: toqueMinimo - espacio.s * 2,
    borderRadius: radio.pastilla,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: {
    flex: 1,
  },
  etiqueta: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  titulo: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
});
