import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { fondoHero } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface Elipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * Fondo del hero de Inicio, como .hero-bg-gradient de la web: en claro un degradado vertical
 * lino, arena, lino; en oscuro la base carbón. Encima, dos resplandores elípticos (arriba y abajo)
 * que se apagan a transparente al 60 % de su radio. Es estático y no recibe toques: va detrás del
 * escenario con posición absoluta, así que no cambia su alto ni su layout.
 */
export function FondoHero() {
  const { oscuro } = useTheme();
  const [tamano, setTamano] = useState({ ancho: 0, alto: 0 });
  const tema = oscuro ? fondoHero.oscuro : fondoHero.claro;

  const medir = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setTamano((previo) =>
      previo.ancho === width && previo.alto === height ? previo : { ancho: width, alto: height },
    );
  };

  const { ancho, alto } = tamano;
  // Radios y centros en dp: el degradado elíptico de CSS (rx en % del ancho, ry en % del alto).
  const elipse = (e: Elipse) => ({
    cx: e.cx * ancho,
    cy: e.cy * alto,
    rx: e.rx * ancho,
    ry: e.ry * alto,
  });

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={medir}
      style={[StyleSheet.absoluteFill, { backgroundColor: tema.base }]}
    >
      {ancho > 0 && alto > 0 ? (
        <Svg width={ancho} height={alto}>
          <Defs>
            {tema.lineal ? (
              <LinearGradient id="fondo-hero-lineal" x1="0" y1="0" x2="0" y2="1">
                {tema.lineal.map((parada) => (
                  <Stop key={parada.posicion} offset={parada.posicion} stopColor={parada.color} />
                ))}
              </LinearGradient>
            ) : null}
            <Resplandor
              id="fondo-hero-abajo"
              color={tema.radialAbajo.color}
              opacidad={tema.radialAbajo.opacidad}
              {...elipse(fondoHero.abajo)}
            />
            <Resplandor
              id="fondo-hero-arriba"
              color={tema.radialArriba.color}
              opacidad={tema.radialArriba.opacidad}
              {...elipse(fondoHero.arriba)}
            />
          </Defs>
          {tema.lineal ? (
            <Rect x={0} y={0} width={ancho} height={alto} fill="url(#fondo-hero-lineal)" />
          ) : null}
          {/* Mismo orden de capas que la web: el resplandor de arriba queda encima del de abajo. */}
          <Rect x={0} y={0} width={ancho} height={alto} fill="url(#fondo-hero-abajo)" />
          <Rect x={0} y={0} width={ancho} height={alto} fill="url(#fondo-hero-arriba)" />
        </Svg>
      ) : null}
    </View>
  );
}

/** Degradado radial elíptico: el color con su opacidad en el centro y transparente desde `apagado`. */
function Resplandor({
  id,
  color,
  opacidad,
  cx,
  cy,
  rx,
  ry,
}: { id: string; color: string; opacidad: number } & Elipse) {
  return (
    <RadialGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      cx={cx}
      cy={cy}
      fx={cx}
      fy={cy}
      rx={rx}
      ry={ry}
    >
      {/* react-native-svg ignora el alfa del color en stopColor: la opacidad va en stopOpacity. */}
      <Stop offset={0} stopColor={color} stopOpacity={opacidad} />
      {/* El mismo color con opacidad 0: se apaga sin virar a gris como pasaría con "transparent". */}
      <Stop offset={fondoHero.apagado} stopColor={color} stopOpacity={0} />
    </RadialGradient>
  );
}
