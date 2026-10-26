import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConexionLenta } from '@/shared/api/useConexionLenta';
import { useTextos } from '@/shared/api/useTextos';

import { borde, duracion, espacio, fuente, radio, sombra, tipo } from './tokens';
import { useMovimientoReducido } from './useMovimientoReducido';
import { useTheme } from './useTheme';

/**
 * Franja "Conectando con el salón…" (GP-09): mientras alguna petición al salón lleva más de 3 s sin
 * respuesta (Render despertando tras 15 minutos sin uso), una pastilla discreta aparece arriba, bajo
 * la barra de estado y encima del contenido, sin moverlo y sin recibir toques. Lino con texto vino en
 * claro (8.6:1) y carbón claro con texto blanco en oscuro (14:1), con filete para separarse del
 * cromo carbón. Entra y sale con un fundido corto; con movimiento reducido aparece y se va sin
 * animación. El lector de pantalla la anuncia sin interrumpir. Va montada una sola vez en
 * src/app/_layout.tsx.
 */
export function FranjaConexion() {
  const lenta = useConexionLenta();
  const texto = useTextos();
  const reducido = useMovimientoReducido();
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();
  const etiqueta = texto('red.conectando');

  return (
    // La región viva va en la capa, que siempre está montada: en Android se anuncia el cambio de su
    // contenido de forma confiable; una vista que apenas se monta puede no anunciarse.
    <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.capa, { top: top + espacio.xs }]}>
      {lenta ? (
        <Animated.View
          entering={reducido ? undefined : FadeIn.duration(duracion.aparecer)}
          exiting={reducido ? undefined : FadeOut.duration(duracion.reducido)}
          accessible
          accessibilityLabel={etiqueta}
          style={[
            styles.pastilla,
            {
              backgroundColor: colores.superficieModal,
              borderColor: colores.hairlineFuerte,
              shadowColor: colores.sombraTarjeta,
            },
          ]}
        >
          <ActivityIndicator size="small" color={colores.texto} />
          <Text style={[styles.texto, { color: colores.texto }]}>{etiqueta}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Capa sin alto propio: solo ocupa lo que la pastilla, centrada; nunca empuja el contenido.
  capa: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pastilla: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingVertical: espacio.xs,
    paddingHorizontal: espacio.m,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  texto: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
});
