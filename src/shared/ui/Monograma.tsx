import { StyleSheet, Text, View } from 'react-native';

import { borde, fuente, monograma, paleta, tracking } from './tokens';

type Tamano = 'pequeno' | 'mediano' | 'grande';

interface MonogramaProps {
  tamano?: Tamano;
}

/** Monograma "MF" dorado sobre carbón con hairline de oro. Decorativo para lectores de pantalla. */
export function Monograma({ tamano = 'mediano' }: MonogramaProps) {
  const diametro = monograma[tamano];
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.circulo,
        { width: diametro, height: diametro, borderRadius: diametro / 2 },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[styles.letras, { fontSize: diametro * monograma.proporcionLetra }]}
      >
        MF
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circulo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: paleta.carbon,
    borderWidth: borde.hairline,
    borderColor: paleta.oro,
  },
  letras: {
    fontFamily: fuente.titulo,
    color: paleta.oro,
    letterSpacing: tracking.monograma,
  },
});
