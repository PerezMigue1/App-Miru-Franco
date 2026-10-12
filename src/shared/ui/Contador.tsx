import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { borde, espacio, franja, fuente, radio, tiendaCatalogo, tipo } from './tokens';
import { useTheme } from './useTheme';

interface ContadorProps {
  /** Número a mostrar. Con 0 o menos no se pinta nada. */
  valor: number;
  /** Cifra más alta que se escribe completa; arriba de ella se lee "99+". */
  maximo?: number;
  /** Solo para colocarlo (por ejemplo, posición absoluta sobre un ícono). */
  estilo?: StyleProp<ViewStyle>;
}

/** Texto del contador: "99+" arriba del máximo. */
export function cifraContador(valor: number, maximo: number = tiendaCatalogo.maximoPiezasVisibles) {
  return valor > maximo ? `${maximo}+` : String(valor);
}

/**
 * Contador de piezas y avisos, como el del carrito y la campana de la cabecera de la web
 * (Header.tsx): círculo vino de 18 dp como mínimo, número claro en Geist 700 12/16 con cifras
 * tabulares y un contorno marfil fino que lo separa de la franja vino y del carbón.
 *
 * Es solo visual: los lectores de pantalla no lo leen por separado. Quien lo usa pone el número
 * en la etiqueta accesible del botón que lo contiene (por ejemplo, `tabBarAccessibilityLabel`
 * "Carrito, 3 piezas" o el `accessibilityLabel` de la campana "Notificaciones, 2 sin leer").
 *
 * No escala con la fuente del sistema: el círculo tiene alto fijo y el número se cortaría.
 */
export function Contador({ valor, maximo, estilo }: ContadorProps) {
  const { colores } = useTheme();

  if (valor <= 0) {
    return null;
  }

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      pointerEvents="none"
      style={[
        styles.circulo,
        { backgroundColor: colores.contadorFondo, borderColor: colores.contadorContorno },
        estilo,
      ]}
    >
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[styles.numero, { color: colores.contadorTexto }]}
      >
        {cifraContador(valor, maximo)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circulo: {
    minWidth: franja.contadorMinimo,
    height: franja.contadorMinimo,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
    // Con dos o tres cifras crece a lo ancho y queda como pastilla (px-1 de la web).
    paddingHorizontal: espacio.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numero: {
    fontFamily: fuente.textoNegrita,
    fontSize: tipo.contador.tamano,
    lineHeight: tipo.contador.linea,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    // Sin el relleno de fuente de Android el número queda centrado de verdad en el círculo.
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
