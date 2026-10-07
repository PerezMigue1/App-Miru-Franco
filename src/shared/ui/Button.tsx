import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import {
  curva,
  duracion,
  escalaPresionado,
  espacio,
  fuente,
  opacidad,
  radio,
  sombra,
  tipo,
  toqueMinimo,
} from './tokens';
import { useTheme } from './useTheme';

type Variante = 'primario' | 'secundario';

interface ButtonProps {
  titulo: string;
  onPress?: () => void;
  variante?: Variante;
  /** Ícono a la derecha del texto (o a la izquierda con posicionIcono="inicio"). */
  icono?: ReactNode;
  posicionIcono?: 'inicio' | 'fin';
  deshabilitado?: boolean;
  /** Operación en curso: no responde al toque y se anuncia como ocupado, sin atenuarse. */
  cargando?: boolean;
  accessibilityHint?: string;
}

const EASE_SALIDA = Easing.bezier(...curva.salida);

/** Botón de la marca: 48dp de alto mínimo y se hunde 140 ms al presionar. */
export function Button({
  titulo,
  onPress,
  variante = 'primario',
  icono,
  posicionIcono = 'fin',
  deshabilitado = false,
  cargando = false,
  accessibilityHint,
}: ButtonProps) {
  const { colores } = useTheme();
  const escala = useSharedValue(1);
  const estiloAnimado = useAnimatedStyle(() => ({ transform: [{ scale: escala.get() }] }));

  const primario = variante === 'primario';
  const fondo = primario ? colores.accion : colores.secundario;
  const colorTexto = primario ? colores.textoSobreAccion : colores.textoSobreSecundario;

  const hundir = () => {
    escala.set(withTiming(escalaPresionado, { duration: duracion.presionar, easing: EASE_SALIDA }));
  };
  const soltar = () => {
    escala.set(withTiming(1, { duration: duracion.presionar, easing: EASE_SALIDA }));
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: deshabilitado || cargando, busy: cargando }}
      accessibilityHint={accessibilityHint}
      disabled={deshabilitado || cargando}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      <Animated.View
        style={[
          styles.boton,
          primario && styles.sombra,
          { backgroundColor: fondo, shadowColor: colores.sombra },
          deshabilitado && styles.deshabilitado,
          estiloAnimado,
        ]}
      >
        {icono && posicionIcono === 'inicio' ? <View accessible={false}>{icono}</View> : null}
        <Text style={[styles.texto, { color: colorTexto }]}>{titulo}</Text>
        {icono && posicionIcono === 'fin' ? <View accessible={false}>{icono}</View> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boton: {
    minHeight: toqueMinimo,
    paddingHorizontal: espacio.xxl,
    borderRadius: radio.pastilla,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.s,
  },
  sombra: {
    shadowOpacity: sombra.boton.opacidad,
    shadowRadius: sombra.boton.radio,
    shadowOffset: { width: 0, height: sombra.boton.desplazamientoY },
    elevation: sombra.boton.elevacion,
  },
  texto: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  deshabilitado: {
    opacity: opacidad.deshabilitado,
  },
});
