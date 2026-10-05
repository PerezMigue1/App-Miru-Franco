import { Image } from 'expo-image';
import { DeviceMotion } from 'expo-sensors';
import { ArrowRight } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Image as ImagenNativa,
  PixelRatio,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type LayoutRectangle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  clamp,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Button } from '@/shared/ui/Button';
import {
  borde,
  capaHero,
  colorFluido,
  curva,
  duracion,
  espacio,
  fuente,
  hero,
  icono,
  intervaloSensor,
  pantalla,
  radio,
  stickers,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { CAPAS, ORDEN_CAPAS, type ClaveFluido, type FluidoHero } from '../models/FluidoModel';
import { EsqueletoPulso } from './GaleriaTrabajo';
import { MOTIVOS, Sticker } from './StickersSalon';

/** Renders propios de la marca (no las imágenes del API), en dos tamaños. */
const RENDERS: Record<ClaveFluido, { chico: number; grande: number }> = {
  goji: {
    chico: require('@/assets/images/hero/goji-240.webp'),
    grande: require('@/assets/images/hero/goji-420.webp'),
  },
  argan: {
    chico: require('@/assets/images/hero/argan-240.webp'),
    grande: require('@/assets/images/hero/argan-420.webp'),
  },
  platino: {
    chico: require('@/assets/images/hero/platino-240.webp'),
    grande: require('@/assets/images/hero/platino-420.webp'),
  },
  hialuronico: {
    chico: require('@/assets/images/hero/hialuronico-240.webp'),
    grande: require('@/assets/images/hero/hialuronico-420.webp'),
  },
};

/** Secuencia de giro del Fluido Di Goji (24 cuadros). */
const GIRO: number[] = [
  require('@/assets/images/hero/giro-00.webp'),
  require('@/assets/images/hero/giro-01.webp'),
  require('@/assets/images/hero/giro-02.webp'),
  require('@/assets/images/hero/giro-03.webp'),
  require('@/assets/images/hero/giro-04.webp'),
  require('@/assets/images/hero/giro-05.webp'),
  require('@/assets/images/hero/giro-06.webp'),
  require('@/assets/images/hero/giro-07.webp'),
  require('@/assets/images/hero/giro-08.webp'),
  require('@/assets/images/hero/giro-09.webp'),
  require('@/assets/images/hero/giro-10.webp'),
  require('@/assets/images/hero/giro-11.webp'),
  require('@/assets/images/hero/giro-12.webp'),
  require('@/assets/images/hero/giro-13.webp'),
  require('@/assets/images/hero/giro-14.webp'),
  require('@/assets/images/hero/giro-15.webp'),
  require('@/assets/images/hero/giro-16.webp'),
  require('@/assets/images/hero/giro-17.webp'),
  require('@/assets/images/hero/giro-18.webp'),
  require('@/assets/images/hero/giro-19.webp'),
  require('@/assets/images/hero/giro-20.webp'),
  require('@/assets/images/hero/giro-21.webp'),
  require('@/assets/images/hero/giro-22.webp'),
  require('@/assets/images/hero/giro-23.webp'),
];

const EASE_SALIDA = Easing.bezier(...curva.salida);
const CURVA_VIAJE = Easing.bezierFn(...curva.entradaSalida);
const GRADOS_A_RADIANES = Math.PI / 180;

interface HeroFluidosProps {
  fluidos: FluidoHero[];
  cargando: boolean;
  /** Desplazamiento vertical del ScrollView del inicio. */
  desplazamiento: SharedValue<number>;
  /** Alto visible del ScrollView (pantalla sin la barra de pestañas). */
  altoVisible: number;
  /** La pestaña Inicio está enfocada: solo entonces se escucha el giroscopio. */
  enfocada: boolean;
  reducido: boolean;
  onVerGoji: () => void;
}

/** Trayectoria del Goji entre la composición y la tipografía grande, en coordenadas del escenario. */
interface Viaje {
  ancho: number;
  alto: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  escala: number;
}

/**
 * Hero de fluidos (DESIGN.md, piezas de marca): los cuatro fluidos AVYNA flotan en capas con
 * parallax amortiguado que sigue la inclinación del teléfono y el scroll, con stickers que
 * aparecen escalonados. Al hacer scroll el escenario queda fijo y el Fluido Di Goji viaja girando
 * (24 cuadros) hasta quedar junto a la tipografía grande. Con movimiento reducido todo queda en su
 * composición estática.
 */
export function HeroFluidos({
  fluidos,
  cargando,
  desplazamiento,
  altoVisible,
  enfocada,
  reducido,
  onVerGoji,
}: HeroFluidosProps) {
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();
  const altoEscenario = altoVisible - top;
  const recorrido = reducido ? 0 : altoVisible * hero.recorrido;
  const altoAncla = altoEscenario * hero.altoGojiDestino;

  const inclinacionX = useSharedValue(0);
  const inclinacionY = useSharedValue(0);
  const [caja, setCaja] = useState<LayoutRectangle | null>(null);
  const [ancla, setAncla] = useState<LayoutRectangle | null>(null);
  const [cuadro, setCuadro] = useState(0);

  const progreso = useDerivedValue(() =>
    recorrido > 0 ? clamp(desplazamiento.get() / recorrido, 0, 1) : 0,
  );

  // Giroscopio a 50 ms, solo con la pestaña enfocada y sin movimiento reducido.
  useEffect(() => {
    if (!enfocada || reducido) {
      return;
    }
    let activo = true;
    let suscripcion: ReturnType<typeof DeviceMotion.addListener> | null = null;
    const rango = hero.rangoInclinacion * GRADOS_A_RADIANES;
    const reposo = hero.inclinacionReposo * GRADOS_A_RADIANES;
    const amortiguado = { duration: duracion.parallax, easing: EASE_SALIDA };
    DeviceMotion.isAvailableAsync()
      .then((disponible) => {
        if (!activo || !disponible) {
          return;
        }
        DeviceMotion.setUpdateInterval(intervaloSensor);
        suscripcion = DeviceMotion.addListener(({ rotation }) => {
          if (!rotation) {
            return;
          }
          inclinacionX.set(withTiming(clamp(rotation.gamma / rango, -1, 1), amortiguado));
          inclinacionY.set(withTiming(clamp((rotation.beta - reposo) / rango, -1, 1), amortiguado));
        });
      })
      .catch(() => {
        // Sin sensor disponible la composición queda estática.
      });
    return () => {
      activo = false;
      suscripcion?.remove();
      inclinacionX.set(withTiming(0, amortiguado));
      inclinacionY.set(withTiming(0, amortiguado));
    };
  }, [enfocada, reducido, inclinacionX, inclinacionY]);

  // Precarga de la secuencia de giro después del primer pintado: no bloquea la pantalla.
  useEffect(() => {
    if (reducido) {
      return;
    }
    const uris = GIRO.map((modulo) => ImagenNativa.resolveAssetSource(modulo).uri);
    Image.prefetch(uris, 'memory-disk').catch(() => {
      // Si la precarga falla, cada cuadro se carga al mostrarse.
    });
  }, [reducido]);

  // El cuadro de la secuencia solo cambia de React cuando cruza a otro índice (máximo 24 veces).
  useAnimatedReaction(
    () => Math.round(progreso.get() * (hero.cuadros - 1)),
    (actual, previo) => {
      if (actual !== previo) {
        scheduleOnRN(setCuadro, actual);
      }
    },
  );

  const estiloEscenario = useAnimatedStyle(() => ({
    transform: [{ translateY: clamp(desplazamiento.get(), 0, recorrido) }],
  }));
  const estiloSalida = useAnimatedStyle(() => {
    const salida = clamp(progreso.get() / hero.finSalida, 0, 1);
    return { opacity: 1 - salida, transform: [{ translateY: -salida * hero.salidaY }] };
  });
  const estiloDestino = useAnimatedStyle(() => {
    const rango = [hero.destinoDesde, hero.destinoHasta];
    const p = progreso.get();
    return {
      opacity: interpolate(p, rango, [0, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(p, rango, [hero.escalaDestino, 1], Extrapolation.CLAMP) }],
    };
  });

  const viaje = caja && ancla ? calcularViaje(caja, ancla) : null;
  const estiloViaje = useAnimatedStyle(() => {
    if (!viaje) {
      return { opacity: 0 };
    }
    const p = progreso.get();
    const e = CURVA_VIAJE(p);
    return {
      opacity: p > hero.umbralViaje ? 1 : 0,
      transform: [
        { translateX: viaje.x0 + (viaje.x1 - viaje.x0) * e - viaje.ancho / 2 },
        { translateY: viaje.y0 + (viaje.y1 - viaje.y0) * e - viaje.alto / 2 },
        { scale: 1 + (viaje.escala - 1) * e },
        { rotate: `${CAPAS.goji.giro * (1 - e)}deg` },
      ],
    };
  });

  const medirCaja = (e: LayoutChangeEvent) => setCaja(e.nativeEvent.layout);
  const medirAncla = (e: LayoutChangeEvent) => setAncla(e.nativeEvent.layout);
  const compartidos = { inclinacionX, inclinacionY, progreso };

  return (
    <View style={{ height: top + altoEscenario + recorrido }}>
      <Animated.View style={[styles.escenario, { top, height: altoEscenario }, estiloEscenario]}>
        <Animated.View
          accessible
          accessibilityRole="header"
          accessibilityLabel="Mirú Franco Beauty Salón"
          style={[styles.marca, estiloSalida]}
        >
          <Text style={[styles.miru, { color: colores.texto }]}>MIRÚ</Text>
          <Text style={[styles.franco, { color: colores.oro }]}>Franco</Text>
          <Text style={[styles.lema, { color: colores.textoSuave }]}>BEAUTY SALÓN</Text>
        </Animated.View>

        <View style={styles.composicion} onLayout={medirCaja}>
          {caja ? (
            <>
              {MOTIVOS.map((motivo, indice) => {
                const posicion = stickers[motivo];
                return (
                  <CapaParallax
                    key={motivo}
                    {...compartidos}
                    profundidad={posicion.prof}
                    giro={posicion.giro}
                    sale
                    estilo={{
                      position: 'absolute',
                      left: (caja.width * posicion.x) / 100,
                      top: (caja.height * posicion.y) / 100,
                      width: posicion.ancho,
                      zIndex: capaHero.stickers,
                    }}
                  >
                    <Sticker motivo={motivo} indice={indice} reducido={reducido} />
                  </CapaParallax>
                );
              })}
              {ORDEN_CAPAS.map((clave) => (
                <Frasco key={clave} clave={clave} caja={caja} compartidos={compartidos} />
              ))}
            </>
          ) : null}
        </View>

        <Animated.View style={estiloSalida}>
          <Leyenda fluidos={fluidos} cargando={cargando} reducido={reducido} />
        </Animated.View>

        <View style={styles.accion}>
          <Button
            titulo="Ver Fluido Di Goji"
            onPress={onVerGoji}
            icono={
              <ArrowRight
                color={colores.textoSobreAccion}
                size={icono.tamanoPequeno}
                strokeWidth={icono.trazo}
              />
            }
          />
        </View>

        {!reducido && caja ? (
          <Animated.View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[styles.destino, { top: caja.y, height: caja.height }, estiloDestino]}
          >
            {/* Texto PROVISIONAL (DESIGN.md). */}
            <Text style={[styles.gigante, { color: colores.texto }]}>{'Brillo\nque se\nnota'}</Text>
            <View
              onLayout={medirAncla}
              style={{ width: altoAncla * hero.proporcionGiro, height: altoAncla }}
            />
          </Animated.View>
        ) : null}

        {viaje ? (
          <Animated.View
            pointerEvents="none"
            accessible={false}
            style={[styles.viaje, { width: viaje.ancho, height: viaje.alto }, estiloViaje]}
          >
            <Image
              source={GIRO[cuadro]}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

/** Centro de partida (Goji de la composición) y de llegada (ancla junto a la tipografía). */
function calcularViaje(caja: LayoutRectangle, ancla: LayoutRectangle): Viaje {
  const capa = CAPAS.goji;
  const alto = (caja.height * capa.height) / 100;
  const anchoFrasco = alto * hero.proporcionFrasco;
  const izquierda = caja.x + (caja.width * capa.left) / 100;
  const arriba = caja.y + caja.height - (caja.height * capa.bottom) / 100 - alto;
  return {
    ancho: alto * hero.proporcionGiro,
    alto,
    x0: izquierda + anchoFrasco / 2,
    y0: arriba + alto / 2,
    x1: ancla.x + ancla.width / 2,
    y1: caja.y + ancla.y + ancla.height / 2,
    escala: ancla.height / alto,
  };
}

interface Compartidos {
  inclinacionX: SharedValue<number>;
  inclinacionY: SharedValue<number>;
  progreso: SharedValue<number>;
}

interface CapaParallaxProps extends Compartidos {
  profundidad: number;
  giro: number;
  /** Sale hacia arriba al hacer scroll (todas menos el Goji). */
  sale?: boolean;
  /** El Goji fijo se oculta mientras viaja la secuencia de giro. */
  ocultaAlViajar?: boolean;
  estilo: ViewStyle;
  children: ReactNode;
}

/** Capa de la composición: sigue al giroscopio según su profundidad y sale con el scroll. */
function CapaParallax({
  inclinacionX,
  inclinacionY,
  progreso,
  profundidad,
  giro,
  sale = false,
  ocultaAlViajar = false,
  estilo,
  children,
}: CapaParallaxProps) {
  const animado = useAnimatedStyle(() => {
    const p = progreso.get();
    // El parallax vuelve a cero en cuanto empieza el recorrido del scroll.
    const enReposo = 1 - clamp(p / hero.reposo, 0, 1);
    const salida = sale ? clamp(p / hero.finSalida, 0, 1) : 0;
    const nx = inclinacionX.get() * enReposo;
    const ny = inclinacionY.get() * enReposo;
    let opacidad = 1 - salida;
    if (ocultaAlViajar && p > hero.umbralViaje) {
      opacidad = 0;
    }
    return {
      opacity: opacidad,
      transform: [
        { translateX: nx * hero.parallaxX * profundidad },
        { translateY: ny * hero.parallaxY * profundidad - salida * hero.salidaY * profundidad },
        { rotate: `${giro + nx * hero.parallaxGiro * profundidad}deg` },
      ],
    };
  });
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[estilo, animado]}
    >
      {children}
    </Animated.View>
  );
}

function Frasco({
  clave,
  caja,
  compartidos,
}: {
  clave: ClaveFluido;
  caja: LayoutRectangle;
  compartidos: Compartidos;
}) {
  const capa = CAPAS[clave];
  const alto = (caja.height * capa.height) / 100;
  const ancho = alto * hero.proporcionFrasco;
  const render =
    PixelRatio.getPixelSizeForLayoutSize(alto) > hero.altoRenderChico
      ? RENDERS[clave].grande
      : RENDERS[clave].chico;
  return (
    <CapaParallax
      {...compartidos}
      profundidad={capa.profundidad}
      giro={capa.giro}
      sale={clave !== 'goji'}
      ocultaAlViajar={clave === 'goji'}
      estilo={{
        position: 'absolute',
        left: (caja.width * capa.left) / 100,
        bottom: (caja.height * capa.bottom) / 100,
        width: ancho,
        height: alto,
        zIndex: capa.zIndex,
      }}
    >
      <Resplandor clave={clave} ancho={ancho} alto={alto} />
      <Image
        source={render}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        priority={clave === 'goji' ? 'high' : 'normal'}
      />
    </CapaParallax>
  );
}

/** Resplandor del color del fluido detrás de cada frasco. */
function Resplandor({ clave, ancho, alto }: { clave: ClaveFluido; ancho: number; alto: number }) {
  const color = colorFluido[clave];
  const id = `resplandor-${clave}`;
  const anchoResplandor = ancho * hero.resplandorAncho;
  return (
    <Svg
      width={anchoResplandor}
      height={alto * hero.resplandorAlto}
      style={{
        position: 'absolute',
        left: (ancho - anchoResplandor) / 2,
        top: alto * hero.resplandorArriba,
      }}
    >
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={color} stopOpacity={hero.resplandor} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** Leyenda con nombre y precio del catálogo real; sin dato del API, el fluido no se anuncia. */
function Leyenda({
  fluidos,
  cargando,
  reducido,
}: {
  fluidos: FluidoHero[];
  cargando: boolean;
  reducido: boolean;
}) {
  const { colores } = useTheme();

  if (cargando) {
    return (
      <EsqueletoPulso reducido={reducido} estilo={styles.leyenda}>
        {ORDEN_CAPAS.map((clave) => (
          <View
            key={clave}
            style={[styles.chip, styles.chipEsqueleto, { backgroundColor: colores.superficieSecundaria }]}
          />
        ))}
      </EsqueletoPulso>
    );
  }

  const visibles = [...ORDEN_CAPAS]
    .reverse()
    .map((clave) => fluidos.find((f) => f.clave === clave))
    .filter((f): f is FluidoHero => Boolean(f && (f.nombre || f.precio)));
  if (visibles.length === 0) {
    return null;
  }

  return (
    <View style={styles.leyenda} accessibilityLabel="Fluidos AVYNA en la tienda">
      {visibles.map((f) => (
        <View
          key={f.clave}
          accessible
          accessibilityLabel={[f.nombre, f.precio].filter(Boolean).join(', ')}
          style={[styles.chip, { borderColor: colores.hairline }]}
        >
          <View style={[styles.punto, { backgroundColor: f.color }]} />
          {f.nombre ? (
            <Text numberOfLines={1} style={[styles.chipNombre, { color: colores.texto }]}>
              {f.nombre}
            </Text>
          ) : null}
          {f.precio ? (
            <Text style={[styles.chipPrecio, { color: colores.texto }]}>{f.precio}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  escenario: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  marca: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.l,
  },
  miru: {
    fontFamily: fuente.tituloFuerte,
    fontSize: tipo.marca.tamano,
    lineHeight: tipo.marca.linea,
    letterSpacing: tracking.titulo,
  },
  franco: {
    fontFamily: fuente.manuscrita,
    fontSize: tipo.marcaManuscrita.tamano,
    lineHeight: tipo.marcaManuscrita.linea,
    marginTop: -espacio.m,
    marginLeft: espacio.xxl,
  },
  lema: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
    letterSpacing: tracking.lema,
  },
  composicion: {
    flex: 1,
    marginHorizontal: pantalla.margen,
    marginTop: espacio.s,
  },
  leyenda: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacio.s,
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.m,
  },
  chip: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    minHeight: toqueMinimo - espacio.s,
    paddingHorizontal: espacio.m,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
  },
  chipEsqueleto: {
    borderWidth: 0,
  },
  punto: {
    width: hero.puntoLeyenda,
    height: hero.puntoLeyenda,
    borderRadius: hero.puntoLeyenda / 2,
  },
  chipNombre: {
    flexShrink: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  chipPrecio: {
    marginLeft: 'auto',
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  accion: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.l,
    paddingBottom: espacio.l,
  },
  destino: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: pantalla.margen,
    zIndex: capaHero.destino,
  },
  gigante: {
    flexShrink: 1,
    fontFamily: fuente.tituloFuerte,
    fontSize: tipo.gigante.tamano,
    lineHeight: tipo.gigante.linea,
    letterSpacing: tracking.gigante,
  },
  viaje: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: capaHero.viaje,
  },
});
