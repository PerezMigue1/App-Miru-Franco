import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { cabeceraCompacta, cabeceraFoto, fuente, tipo } from './tokens';
import { useTheme } from './useTheme';

/**
 * Logotipo de la cabecera: la imagen real del logotipo de la web (public/logo-miru.jpg, copiada a
 * assets/) y, a su lado, "Mirú" en Playfair 700 con "Franco" en Great Vibes y "BEAUTY SALÓN" debajo,
 * en oro sobre carbón: en la imagen pequeña las letras no se leen. Solo va sobre el cromo carbón.
 * TalkBack lo lee como un solo elemento: "Mirú Franco Beauty Salón".
 */
export function Logotipo() {
  const { colores } = useTheme();
  const oro = { color: colores.oroTextoPequeno };
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Mirú Franco Beauty Salón"
      style={styles.logotipo}
    >
      <Image source={LOGO} contentFit="contain" accessible={false} style={styles.imagen} />
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

// Aunque se llama .jpg, es un PNG con transparencia (el mismo archivo de public/ de la web).
const LOGO = require('@/assets/logo-miru.jpg');

const styles = StyleSheet.create({
  logotipo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: cabeceraCompacta.separacion,
    flexShrink: 1,
    minWidth: 0,
  },
  imagen: {
    width: cabeceraFoto.logotipo,
    height: cabeceraFoto.logotipo,
    flexShrink: 0,
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
