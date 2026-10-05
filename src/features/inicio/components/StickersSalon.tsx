import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { colorSticker, curva, duracion, hero, radio, stickers } from '@/shared/ui/tokens';

export type Motivo = 'tijeras' | 'destello' | 'gota' | 'peine';

/** Orden de aparición escalonada. */
export const MOTIVOS: Motivo[] = ['tijeras', 'destello', 'gota', 'peine'];

const EASE_SALIDA = Easing.bezier(...curva.salida);

interface StickerProps {
  motivo: Motivo;
  indice: number;
  reducido: boolean;
}

/**
 * Sticker vectorial troquelado (borde de papel crema) en la paleta de la marca. Aparece escalonado
 * 60 ms desde escala 0.9; con movimiento reducido ya está en su lugar. Decorativo.
 */
export function Sticker({ motivo, indice, reducido }: StickerProps) {
  const entrada = useSharedValue(reducido ? 1 : 0);

  useEffect(() => {
    if (reducido) {
      entrada.set(1);
      return;
    }
    entrada.set(
      withDelay(
        indice * duracion.escalonado,
        withTiming(1, { duration: duracion.entrada, easing: EASE_SALIDA }),
      ),
    );
  }, [entrada, indice, reducido]);

  const estilo = useAnimatedStyle(() => {
    const t = entrada.get();
    return {
      opacity: t,
      transform: [
        { translateY: (1 - t) * hero.stickerDesde },
        { scale: hero.stickerEscala + (1 - hero.stickerEscala) * t },
      ],
    };
  });

  const { fondo, tinta } = colorSticker[motivo];
  const papel = colorSticker.papel;

  return (
    <Animated.View
      style={[styles.sticker, estilo]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Svg viewBox="0 0 64 64" width="100%" height="100%">
        {motivo === 'destello' ? (
          <Path
            d="M32 4c2.2 12.6 6.8 18.6 28 28-21.2 9.4-25.8 15.4-28 28-2.2-12.6-6.8-18.6-28-28 21.2-9.4 25.8-15.4 28-28Z"
            fill={fondo}
            stroke={papel}
            strokeWidth={stickers.trazo}
            strokeLinejoin="round"
          />
        ) : null}
        {motivo === 'gota' ? (
          <>
            <Path
              d="M32 5C24 18 12 29 12 41a20 20 0 0 0 40 0C52 29 40 18 32 5Z"
              fill={fondo}
              stroke={papel}
              strokeWidth={stickers.trazo}
              strokeLinejoin="round"
            />
            <Path
              d="M23 41a9 9 0 0 0 6 8.5"
              fill="none"
              stroke={tinta}
              strokeWidth={stickers.trazoInterior}
              strokeLinecap="round"
            />
          </>
        ) : null}
        {motivo === 'tijeras' || motivo === 'peine' ? (
          <Rect
            x={5}
            y={5}
            width={54}
            height={54}
            rx={radio.sticker}
            fill={fondo}
            stroke={papel}
            strokeWidth={stickers.trazo}
          />
        ) : null}
        {motivo === 'tijeras' ? (
          <G
            fill="none"
            stroke={tinta}
            strokeWidth={stickers.trazoInterior}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Circle cx={22} cy={42} r={6} />
            <Circle cx={42} cy={42} r={6} />
            <Path d="M26.5 38 44 17M37.5 38 20 17" />
          </G>
        ) : null}
        {motivo === 'peine' ? (
          <G fill="none" stroke={tinta} strokeWidth={stickers.trazoInterior} strokeLinecap="round">
            <Path d="M15 24h34a3 3 0 0 1 3 3v2H12v-2a3 3 0 0 1 3-3Z" fill={tinta} />
            <Path d="M16 29v13M22 29v15M28 29v13M34 29v15M40 29v13M46 29v15" />
          </G>
        ) : null}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sticker: {
    width: '100%',
    aspectRatio: 1,
  },
});
