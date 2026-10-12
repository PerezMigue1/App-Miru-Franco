import { useContext, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { DentroDeHoja } from './Hoja';
import { usePresion } from './movimiento';
import {
  borde,
  espacio,
  fuente,
  opacidad,
  radio,
  sombra,
  tipo,
  toqueMinimo,
} from './tokens';
import { useTheme } from './useTheme';

/**
 * primario: vino con sombra. secundario: terracota. contorno: transparente con borde y texto de
 * contorno. peligro: igual que contorno, pero en el color de peligro (acciones destructivas).
 */
type Variante = 'primario' | 'secundario' | 'contorno' | 'peligro';

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
  /** Etiqueta para el lector de pantalla cuando el título solo no basta; por omisión, el título. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** Botón de la marca: 48dp de alto mínimo y se hunde 140 ms al presionar. */
export function Button({
  titulo,
  onPress,
  variante = 'primario',
  icono,
  posicionIcono = 'fin',
  deshabilitado = false,
  cargando = false,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const { colores } = useTheme();
  const { estilo: estiloPresion, hundir, soltar } = usePresion();

  const primario = variante === 'primario';
  const peligro = variante === 'peligro';
  const contorno = variante === 'contorno' || peligro;
  // En una hoja (superficie modal) el secundario lleva filete: en oscuro la hoja y su relleno son
  // el mismo carbón claro y el botón quedaría como texto suelto.
  const dentroDeHoja = useContext(DentroDeHoja);
  const filete = variante === 'secundario' && dentroDeHoja;
  const colorContorno = peligro ? colores.peligro : colores.contorno;
  const fondo = primario ? colores.accion : contorno ? colores.transparente : colores.secundario;
  const colorTexto = primario
    ? colores.textoSobreAccion
    : contorno
      ? colorContorno
      : colores.textoSobreSecundario;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: deshabilitado || cargando, busy: cargando }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      disabled={deshabilitado || cargando}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
      // La atenuación va afuera: la presión controla la opacidad de la vista de adentro.
      style={deshabilitado ? styles.deshabilitado : null}
    >
      <Animated.View
        style={[
          styles.boton,
          primario && styles.sombra,
          contorno && [styles.contorno, { borderColor: colorContorno }],
          filete && [styles.filete, { borderColor: colores.hairlineFuerte }],
          { backgroundColor: fondo, shadowColor: colores.sombra },
          estiloPresion,
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
  filete: {
    borderWidth: borde.hairline,
  },
  contorno: {
    borderWidth: borde.campo,
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
