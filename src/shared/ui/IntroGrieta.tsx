import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { borde, curva, fuente, intro, paleta, tracking } from './tokens';
import { useMovimientoReducido } from './useMovimientoReducido';

/**
 * Línea de la grieta en unidades de pantalla (0–1): baja en diagonal suave con dientes de papel
 * rasgado. Es la misma que usa el sitio web.
 */
const GRIETA: [number, number][] = [
  [0.535, 0], [0.52, 0.05], [0.548, 0.1], [0.515, 0.15], [0.53, 0.2], [0.498, 0.26], [0.524, 0.31],
  [0.492, 0.37], [0.51, 0.42], [0.482, 0.47], [0.506, 0.52], [0.474, 0.58], [0.496, 0.63],
  [0.468, 0.68], [0.49, 0.73], [0.462, 0.79], [0.484, 0.84], [0.458, 0.9], [0.478, 0.95], [0.466, 1],
];

const EASE_SALIDA = Easing.bezier(...curva.salida);
const EASE_ENTRADA_SALIDA = Easing.bezier(...curva.entradaSalida);

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Una sola reproducción por apertura en frío: el proceso de JS vive mientras la app está abierta. */
let introMostrada = false;

type Lado = 'izq' | 'der';

/**
 * Intro de la grieta (DESIGN.md, piezas de marca): el monograma "MF" dorado sobre carbón se parte
 * por una grieta de papel rasgado y las dos mitades se separan para revelar la app. Dura menos de
 * 1.3 s, se salta tocando la pantalla y se omite con movimiento reducido.
 */
export function IntroGrieta({ onTerminar }: { onTerminar?: () => void } = {}) {
  const reducido = useMovimientoReducido();
  const [visible, setVisible] = useState(() => !introMostrada && !reducido);

  // Avisa cuando la intro ya no cubre la pantalla (o si no se mostró): lo que va encima de la app,
  // como la hoja de bienvenida, espera a este momento.
  useEffect(() => {
    if (!visible) {
      onTerminar?.();
    }
  }, [visible, onTerminar]);
  const [tamano, setTamano] = useState<{ ancho: number; alto: number } | null>(null);

  const trazo = useSharedValue(0);
  const apertura = useSharedValue(0);
  const opacidad = useSharedValue(1);

  useEffect(() => {
    introMostrada = true;
  }, []);

  // Arranca cuando se conoce el tamaño de la pantalla (una sola vez por apertura).
  useEffect(() => {
    if (!tamano || !visible) {
      return;
    }
    trazo.set(withTiming(1, { duration: intro.trazo, easing: EASE_SALIDA }));
    apertura.set(
      withDelay(
        intro.trazo,
        withTiming(1, { duration: intro.apertura, easing: EASE_ENTRADA_SALIDA }, (terminado) => {
          if (terminado) {
            scheduleOnRN(setVisible, false);
          }
        }),
      ),
    );
  }, [tamano, visible, trazo, apertura]);

  const saltar = () => {
    opacidad.set(
      withTiming(0, { duration: intro.desvanecer, easing: EASE_SALIDA }, (terminado) => {
        if (terminado) {
          scheduleOnRN(setVisible, false);
        }
      }),
    );
  };

  const medir = (e: LayoutChangeEvent) => {
    if (!tamano) {
      const { width, height } = e.nativeEvent.layout;
      setTamano({ ancho: width, alto: height });
    }
  };

  const estiloRaiz = useAnimatedStyle(() => ({ opacity: opacidad.get() }));
  const ancho = tamano?.ancho ?? 0;
  const estiloIzq = useAnimatedStyle(() => ({
    transform: [
      { translateX: -apertura.get() * intro.separacion * ancho },
      { rotate: `${-apertura.get() * intro.giro}deg` },
    ],
  }));
  const estiloDer = useAnimatedStyle(() => ({
    transform: [
      { translateX: apertura.get() * intro.separacion * ancho },
      { rotate: `${apertura.get() * intro.giro}deg` },
    ],
  }));
  const estiloTrazo = useAnimatedStyle(() => ({ opacity: 1 - apertura.get() }));

  const largoGrieta = tamano ? largoDe(tamano.ancho, tamano.alto) : 0;
  const propsTrazo = useAnimatedProps(() => ({
    strokeDashoffset: (1 - trazo.get()) * largoGrieta,
  }));

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.raiz, estiloRaiz]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={medir}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={saltar}>
        {tamano ? (
          <>
            <Animated.View style={[StyleSheet.absoluteFill, estiloIzq]}>
              <Mitad lado="izq" ancho={tamano.ancho} alto={tamano.alto} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, estiloDer]}>
              <Mitad lado="der" ancho={tamano.ancho} alto={tamano.alto} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, estiloTrazo]}>
              <Svg width={tamano.ancho} height={tamano.alto}>
                <AnimatedPath
                  d={trazoDe(tamano.ancho, tamano.alto)}
                  stroke={paleta.oro}
                  strokeWidth={intro.trazoGrosor}
                  strokeLinejoin="round"
                  fill="none"
                  strokeDasharray={largoGrieta}
                  animatedProps={propsTrazo}
                />
              </Svg>
            </Animated.View>
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.lienzo]} />
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Media pantalla carbón con su mitad del monograma, recortada por la grieta. */
function Mitad({ lado, ancho, alto }: { lado: Lado; ancho: number; alto: number }) {
  const idRecorte = `grieta-${lado}`;
  const cx = ancho / 2;
  const cy = alto / 2;
  return (
    <Svg width={ancho} height={alto}>
      <Defs>
        <ClipPath id={idRecorte}>
          <Polygon points={poligonoDe(lado, ancho, alto)} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${idRecorte})`}>
        <Rect x={0} y={0} width={ancho} height={alto} fill={paleta.carbon} />
        <Circle
          cx={cx}
          cy={cy}
          r={intro.letra}
          stroke={paleta.oro}
          strokeWidth={borde.hairline}
          fill="none"
        />
        <SvgText
          x={cx}
          y={cy}
          dy={intro.letra * intro.ajusteBase}
          textAnchor="middle"
          fontFamily={fuente.titulo}
          fontSize={intro.letra}
          letterSpacing={tracking.monograma}
          fill={paleta.oro}
        >
          MF
        </SvgText>
      </G>
    </Svg>
  );
}

function poligonoDe(lado: Lado, ancho: number, alto: number): string {
  const orilla = lado === 'izq' ? 0 : 1;
  const puntos: [number, number][] = [[orilla, 0], ...GRIETA, [orilla, 1]];
  return puntos.map(([x, y]) => `${x * ancho},${y * alto}`).join(' ');
}

function trazoDe(ancho: number, alto: number): string {
  return GRIETA.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x * ancho} ${y * alto}`).join(' ');
}

function largoDe(ancho: number, alto: number): number {
  let largo = 0;
  for (let i = 1; i < GRIETA.length; i++) {
    const [x0, y0] = GRIETA[i - 1];
    const [x1, y1] = GRIETA[i];
    largo += Math.hypot((x1 - x0) * ancho, (y1 - y0) * alto);
  }
  return largo;
}

const styles = StyleSheet.create({
  raiz: {
    zIndex: intro.capa,
    elevation: intro.capa,
  },
  lienzo: {
    backgroundColor: paleta.carbon,
  },
});
