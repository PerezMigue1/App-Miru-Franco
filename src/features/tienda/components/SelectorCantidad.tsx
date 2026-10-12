import { Minus, Plus, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import { borde, espacio, fuente, icono, opacidad, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
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
 * Cantidad con botones de menos y más de 48dp, en el mismo lenguaje que los campos (fondo y borde de
 * campo). Para el lector de pantalla es un control ajustable: se sube y se baja deslizando.
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
      style={[
        styles.selector,
        { backgroundColor: colores.campoFondo, borderColor: colores.campoBorde },
        deshabilitado ? styles.deshabilitado : null,
      ]}
    >
      <BotonPaso Icono={Minus} activo={puedeBajar} onPress={() => cambiar(-1)} />
      <Text style={[styles.valor, { color: colores.campoTexto }]}>{valor}</Text>
      <BotonPaso Icono={Plus} activo={puedeSubir} onPress={() => cambiar(1)} />
    </View>
  );
}

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
      <Animated.View style={[styles.paso, estilo]}>
        <Icono color={colores.campoTexto} size={icono.tamanoPequeno} strokeWidth={icono.trazoMarca} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  selector: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: borde.entrada,
    borderRadius: radio.pastilla,
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
  },
  pasoInactivo: {
    opacity: opacidad.deshabilitado,
  },
  valor: {
    minWidth: espacio.x3,
    textAlign: 'center',
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
});
