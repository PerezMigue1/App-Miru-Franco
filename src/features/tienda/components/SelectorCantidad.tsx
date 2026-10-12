import { Minus, Plus, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import {
  borde,
  controles,
  fuente,
  icono,
  opacidad,
  radio,
  tipo,
  toqueMinimo,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface SelectorCantidadProps {
  valor: number;
  /** Mayor cantidad permitida (las existencias de la presentación). */
  maximo: number;
  minimo?: number;
  onCambiar: (cantidad: number) => void;
  deshabilitado?: boolean;
  /** Nombre para el lector de pantalla ("Cantidad de Shampoo Di Agave"). */
  etiqueta?: string;
}

/**
 * Cantidad como el carrito de la web: dos botones cuadrados con contorno ("Quitar uno" y "Agregar
 * uno") y la cifra en una caja aparte con el aspecto de .mf-campo, separados 6. Para el lector de
 * pantalla es un solo control ajustable: se sube y se baja deslizando.
 */
export function SelectorCantidad({
  valor,
  maximo,
  minimo = 1,
  onCambiar,
  deshabilitado = false,
  etiqueta = 'Cantidad',
}: SelectorCantidadProps) {
  const { colores } = useTheme();
  const puedeBajar = !deshabilitado && valor > minimo && Math.min(maximo, valor - 1) >= minimo;
  const puedeSubir = !deshabilitado && valor < maximo;

  const cambiar = (delta: number) => {
    // También con TalkBack: deshabilitado no cambia, y nunca baja de minimo.
    if (deshabilitado) {
      return;
    }
    const siguiente = Math.max(minimo, Math.min(maximo, valor + delta));
    if (siguiente !== valor) {
      onCambiar(siguiente);
    }
  };

  const alAccion = (evento: AccessibilityActionEvent) => {
    if (evento.nativeEvent.actionName === 'increment') {
      cambiar(1);
    } else if (evento.nativeEvent.actionName === 'decrement') {
      cambiar(-1);
    }
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={etiqueta}
      accessibilityValue={{ min: minimo, max: maximo, now: valor, text: `${valor}` }}
      accessibilityState={{ disabled: deshabilitado }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={alAccion}
      style={[styles.selector, deshabilitado ? styles.deshabilitado : null]}
    >
      <BotonPaso Icono={Minus} activo={puedeBajar} onPress={() => cambiar(-1)} />
      <View
        style={[
          styles.caja,
          { backgroundColor: colores.campoFondo, borderColor: colores.campoBorde },
        ]}
      >
        <Text style={[styles.valor, { color: colores.campoTexto }]}>{valor}</Text>
      </View>
      <BotonPaso Icono={Plus} activo={puedeSubir} onPress={() => cambiar(1)} />
    </View>
  );
}

/** Botón cuadrado con contorno (Button outline de la web): se hunde a 0.97 al tocarlo. */
function BotonPaso({ Icono, activo, onPress }: { Icono: LucideIcon; activo: boolean; onPress: () => void }) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    // El control completo es el elemento accesible: los botones no se anuncian por separado.
    <Pressable
      accessible={false}
      importantForAccessibility="no"
      disabled={!activo}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
      style={activo ? null : styles.pasoInactivo}
    >
      <Animated.View
        style={[
          styles.paso,
          { borderColor: colores.contorno, backgroundColor: colores.transparente },
          estilo,
        ]}
      >
        <Icono color={colores.contorno} size={controles.iconoCantidad} strokeWidth={icono.trazo} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  selector: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: controles.separacionCantidad,
  },
  // Mismo lenguaje que un campo deshabilitado (.mf-campo:disabled 0.55).
  deshabilitado: {
    opacity: opacidad.deshabilitadoCampo,
  },
  paso: {
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.campo,
    borderWidth: borde.campo,
  },
  // Tope alcanzado: como el Button deshabilitado de la web (opacidad 0.5).
  pasoInactivo: {
    opacity: opacidad.deshabilitado,
  },
  caja: {
    width: controles.cajaCantidad,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.campo,
    borderWidth: borde.entrada,
  },
  valor: {
    textAlign: 'center',
    fontFamily: fuente.textoNegrita,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
});
