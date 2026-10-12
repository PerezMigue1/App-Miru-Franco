import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logotipo } from './Logotipo';
import { usePresion } from './movimiento';
import {
  cabeceraCompacta,
  fuente,
  icono,
  pantalla,
  radio,
  tipo,
  toqueMinimo,
  tracking,
} from './tokens';
import { useTheme } from './useTheme';

interface CabeceraCompactaProps {
  /** Botón a la izquierda del logotipo (Volver, en las pantallas de la pila). */
  izquierda?: ReactNode;
  /** Acciones a la derecha: botones de 48 sobre el cromo (ver BotonCromo). */
  derecha?: ReactNode;
  /** Fila extra dentro del mismo cromo, bajo la principal (el buscador de Inicio). */
  debajo?: ReactNode;
  /** Estilo del contenedor (Inicio la fija arriba con sombra). */
  style?: StyleProp<ViewStyle>;
}

/**
 * Cabecera compacta común a todas las pantallas (Header.tsx de la web en móvil): cromo carbón desde
 * arriba, con 56 de contenido bajo el área segura, el logotipo a la izquierda y las acciones a la
 * derecha. Empieza en y = 0 con el mismo carbón de FondoBarraEstado, así que no deja hueco con la
 * barra de estado. El título de la pantalla no va aquí: va en el lienzo con TituloPagina.
 */
export function CabeceraCompacta({
  izquierda,
  derecha,
  debajo,
  style,
}: CabeceraCompactaProps) {
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();
  return (
    <View style={[{ paddingTop: top, backgroundColor: colores.panel }, style]}>
      <View
        style={[
          styles.fila,
          {
            paddingLeft: izquierda ? cabeceraCompacta.rellenoVolver : pantalla.margen,
            paddingRight: derecha ? cabeceraCompacta.rellenoDerecho : pantalla.margen,
          },
        ]}
      >
        {izquierda ?? null}
        <View style={styles.marca}>
          <Logotipo />
        </View>
        {derecha ? <View style={styles.acciones}>{derecha}</View> : null}
      </View>
      {debajo ?? null}
    </View>
  );
}

interface BotonCromoProps {
  icono: LucideIcon;
  etiqueta: string;
  onPress: () => void;
  accessibilityHint?: string;
}

/**
 * Botón de ícono de 48 sobre el cromo carbón: ícono marfil y, al presionar, el círculo se tiñe
 * (presionadoCromo) y se hunde en 140 ms (solo baja la opacidad con movimiento reducido).
 */
export function BotonCromo({ icono: Icono, etiqueta, onPress, accessibilityHint }: BotonCromoProps) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.botonCromo,
            { backgroundColor: pressed ? colores.presionadoCromo : colores.transparente },
            estilo,
          ]}
        >
          <Icono color={colores.textoSobrePanel} size={icono.tamano} strokeWidth={icono.trazo} />
        </Animated.View>
      )}
    </Pressable>
  );
}

interface TituloPaginaProps {
  titulo: string;
  subtitulo?: string;
}

/**
 * Título de la pantalla en el lienzo, como PageHeader y .mf-titulo-pagina de la web: Playfair 700 de
 * 30 en el color del texto principal (vino en claro, blanco en oscuro) y subtítulo opcional en el
 * texto secundario a 8 de separación.
 */
export function TituloPagina({ titulo, subtitulo }: TituloPaginaProps) {
  const { colores } = useTheme();
  return (
    <View style={styles.bloqueTitulo}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={cabeceraCompacta.escalaMaximaTitulo}
        style={[styles.titulo, { color: colores.texto }]}
      >
        {titulo}
      </Text>
      {subtitulo ? (
        <Text
          maxFontSizeMultiplier={cabeceraCompacta.escalaMaximaTitulo}
          style={[styles.subtitulo, { color: colores.textoSuave }]}
        >
          {subtitulo}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    minHeight: cabeceraCompacta.alto,
    flexDirection: 'row',
    alignItems: 'center',
    gap: cabeceraCompacta.separacion,
  },
  marca: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  acciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: cabeceraCompacta.separacionAcciones,
    flexShrink: 0,
  },
  botonCromo: {
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  bloqueTitulo: {
    paddingHorizontal: pantalla.margen,
    paddingTop: cabeceraCompacta.tituloArriba,
    marginBottom: cabeceraCompacta.tituloAbajo,
  },
  titulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.tituloPagina,
  },
  subtitulo: {
    marginTop: cabeceraCompacta.separacionSubtitulo,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
});
