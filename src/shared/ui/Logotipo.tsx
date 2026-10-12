import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { cabeceraFoto } from './tokens';

/**
 * Logotipo de la cabecera: la imagen real del logotipo de la web (public/logo-miru.jpg, copiada a
 * assets/), con el monograma y "Mirú Franco / Beauty Salón" en oro sobre fondo transparente. Va sola,
 * sin texto armado al lado, y solo sobre el cromo carbón. TalkBack la lee como "Mirú Franco Beauty Salón".
 */
export function Logotipo() {
  return (
    <Image
      source={LOGO}
      contentFit="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Mirú Franco Beauty Salón"
      style={styles.imagen}
    />
  );
}

// Aunque se llama .jpg, es un PNG con transparencia (el mismo archivo de public/ de la web).
const LOGO = require('@/assets/logo-miru.jpg');

const styles = StyleSheet.create({
  imagen: {
    width: cabeceraFoto.logotipo,
    height: cabeceraFoto.logotipo,
    flexShrink: 0,
  },
});
