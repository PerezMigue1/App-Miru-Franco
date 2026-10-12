import { ShoppingBag } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import { borde, espacio, fuente, icono, radio, tiendaCatalogo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface AccesoCarritoProps {
  /** Piezas en el carrito; null o 0 no muestran número. */
  piezas: number | null;
  onPress: () => void;
}

/**
 * Botón del carrito en el encabezado de la Tienda: bolsa de 48dp con las piezas en una pastilla.
 * La pastilla usa el color de selección (no el de acción): el único botón vino es el de la pantalla.
 */
export function AccesoCarrito({ piezas, onPress }: AccesoCarritoProps) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  const hayPiezas = piezas !== null && piezas > 0;
  const cifra =
    hayPiezas && piezas > tiendaCatalogo.maximoPiezasVisibles
      ? `${tiendaCatalogo.maximoPiezasVisibles}+`
      : String(piezas ?? 0);
  const etiqueta = hayPiezas ? `Carrito, ${piezas === 1 ? '1 pieza' : `${piezas} piezas`}` : 'Carrito';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityHint="Abre tu carrito"
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
      style={styles.pulsable}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.circulo,
            { backgroundColor: pressed ? colores.presionado : colores.fondo },
            estilo,
          ]}
        >
          <ShoppingBag color={colores.texto} size={icono.tamano} strokeWidth={icono.trazo} />
          {hayPiezas ? (
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={[styles.pastilla, { backgroundColor: colores.seleccion, borderColor: colores.fondo }]}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.cifra, { color: colores.textoSobreSeleccion }]}
              >
                {cifra}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // El ícono queda alineado con el margen derecho de la pantalla; el área táctil sigue de 48dp.
  pulsable: {
    width: toqueMinimo,
    height: toqueMinimo,
    marginRight: -(toqueMinimo - icono.tamano) / 2,
  },
  circulo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  pastilla: {
    position: 'absolute',
    top: espacio.xxs,
    right: 0,
    minWidth: tiendaCatalogo.pastillaCarrito,
    minHeight: tiendaCatalogo.pastillaCarrito,
    paddingHorizontal: espacio.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
    // Anillo del color del fondo: separa la pastilla del trazo de la bolsa.
    borderWidth: borde.indicador,
  },
  cifra: {
    fontFamily: fuente.textoFuerte,
    fontSize: tiendaCatalogo.cifraPastilla.tamano,
    lineHeight: tiendaCatalogo.cifraPastilla.linea,
    fontVariant: ['tabular-nums'],
  },
});
