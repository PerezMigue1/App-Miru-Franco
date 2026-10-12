import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { transicionSeleccion, usePresion } from '@/shared/ui/movimiento';
import { borde, espacio, fuente, icono, radio, tiendaCompra, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface OpcionPagoProps {
  titulo: string;
  descripcion: string;
  Icono: LucideIcon;
  elegida: boolean;
  onPress: () => void;
  deshabilitada?: boolean;
}

/**
 * Una forma de pago tipo radio: tarjeta que se hunde al tocarla (140 ms) y, elegida, toma el borde
 * de selección y llena su círculo en 140 ms. Sin sombra: la tarjeta lleva borde (nunca los dos).
 */
export function OpcionPago({
  titulo,
  descripcion,
  Icono,
  elegida,
  onPress,
  deshabilitada = false,
}: OpcionPagoProps) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: elegida, disabled: deshabilitada }}
      accessibilityLabel={`${titulo}. ${descripcion}`}
      disabled={deshabilitada}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      <Animated.View
        style={[
          styles.tarjeta,
          transicionSeleccion,
          {
            backgroundColor: colores.superficie,
            borderColor: elegida ? colores.seleccion : colores.hairline,
          },
          estilo,
        ]}
      >
        <Animated.View
          style={[
            styles.radio,
            transicionSeleccion,
            {
              borderColor: elegida ? colores.seleccion : colores.texto,
              backgroundColor: colores.superficie,
            },
          ]}
        >
          {elegida ? <View style={[styles.punto, { backgroundColor: colores.seleccion }]} /> : null}
        </Animated.View>
        <View style={styles.textos}>
          <Text style={[styles.titulo, { color: colores.texto }]}>{titulo}</Text>
          <Text style={[styles.descripcion, { color: colores.texto }]}>{descripcion}</Text>
        </View>
        <View accessible={false} importantForAccessibility="no-hide-descendants">
          <Icono color={colores.texto} size={icono.tamano} strokeWidth={icono.trazo} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    padding: espacio.l,
    borderRadius: radio.tarjeta,
    // El mismo grosor elegida o no: el cambio solo es de color y nada se recorre.
    borderWidth: borde.indicador,
  },
  radio: {
    width: tiendaCompra.radioOpcion,
    height: tiendaCompra.radioOpcion,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
    borderWidth: borde.indicador,
  },
  punto: {
    width: tiendaCompra.puntoOpcion,
    height: tiendaCompra.puntoOpcion,
    borderRadius: radio.pastilla,
  },
  textos: {
    flex: 1,
    gap: espacio.xxs,
  },
  titulo: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  descripcion: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
