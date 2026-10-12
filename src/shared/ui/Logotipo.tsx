import { StyleSheet, Text, View } from 'react-native';

import { Monograma } from './Monograma';
import { cabeceraCompacta, fuente, tipo } from './tokens';
import { useTheme } from './useTheme';

interface LogotipoProps {
  /** Muestra el monograma a la izquierda (la web lo quita cuando no cabe junto a las acciones). */
  conMonograma?: boolean;
}

/**
 * Logotipo de la cabecera, como Header.tsx de la web: monograma "MF" y, a su lado, "Mirú" en
 * Playfair 700 con "Franco" en Great Vibes y "BEAUTY SALÓN" debajo, todo en oro sobre carbón.
 * Solo va sobre el cromo carbón. TalkBack lo lee como un solo elemento: "Mirú Franco Beauty Salón".
 */
export function Logotipo({ conMonograma = true }: LogotipoProps) {
  const { colores } = useTheme();
  const oro = { color: colores.oroTextoPequeno };
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Mirú Franco Beauty Salón"
      style={styles.logotipo}
    >
      {conMonograma ? <Monograma tamano="pequeno" /> : null}
      <View style={styles.texto}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={cabeceraCompacta.escalaMaximaLogotipo}
          style={[styles.nombre, oro]}
        >
          Mirú <Text style={styles.franco}>Franco</Text>
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={cabeceraCompacta.escalaMaximaLogotipo}
          style={[styles.salon, oro]}
        >
          Beauty Salón
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logotipo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: cabeceraCompacta.separacion,
    flexShrink: 1,
    minWidth: 0,
  },
  texto: {
    flexShrink: 1,
    minWidth: 0,
  },
  nombre: {
    fontFamily: fuente.titulo,
    fontSize: tipo.logotipo.tamano,
    // La línea la marca "Franco", que es más alto: así las dos palabras comparten base.
    lineHeight: tipo.logotipoFranco.linea,
  },
  franco: {
    fontFamily: fuente.manuscrita,
    fontSize: tipo.logotipoFranco.tamano,
  },
  salon: {
    fontFamily: fuente.textoFuerte,
    fontSize: cabeceraCompacta.salon.tamano,
    lineHeight: cabeceraCompacta.salon.linea,
    letterSpacing: cabeceraCompacta.trackingSalon,
    textTransform: 'uppercase',
  },
});
