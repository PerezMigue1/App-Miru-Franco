import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Monograma } from '@/shared/ui/Monograma';
import { duracion, opacidad } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface FotoProductoProps {
  /** URL https de Cloudinary; sin ella queda el monograma. */
  uri?: string;
  /** Tamaño y radio del marco (la foto lo llena). */
  estilo?: StyleProp<ViewStyle>;
  tamanoMonograma?: 'pequeno' | 'mediano' | 'grande';
  /** Producto o presentación sin existencias: la foto se atenúa. */
  atenuada?: boolean;
}

/**
 * Foto de un producto con el placeholder de la marca: monograma dorado sobre carbón mientras carga
 * o si no hay foto (DESIGN.md). Decorativa: el nombre ya lo lee la tarjeta o la fila.
 */
export function FotoProducto({ uri, estilo, tamanoMonograma = 'pequeno', atenuada = false }: FotoProductoProps) {
  const { colores } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.marco, { backgroundColor: colores.panel }, estilo, atenuada ? styles.atenuada : null]}
    >
      <Monograma tamano={tamanoMonograma} />
      {uri ? (
        <Image
          accessible={false}
          source={{ uri }}
          recyclingKey={uri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={duracion.pestana}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  marco: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  atenuada: {
    opacity: opacidad.deshabilitado,
  },
});
