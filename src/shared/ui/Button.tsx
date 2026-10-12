import { useContext, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { DentroDeHoja } from './Hoja';
import { transicionSeleccion, usePresion } from './movimiento';
import { useMovimientoReducido } from './useMovimientoReducido';
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
 * Variantes como las del Button de la web (radio de control de 10, Geist 600):
 * - primario: vino con sombra; mientras se presiona pasa al vino claro (--hover).
 * - secundario: terracota con texto carbón (carbón con texto crema en oscuro). No cambia de fondo al
 *   presionar: la mezcla de hover de la web bajaría el texto a 3.8:1 en claro.
 * - acento: salvia con texto carbón (variante success de la web, la de operación).
 * - contorno: transparente con borde y texto de contorno.
 * - peligro: igual que contorno, pero en el color de peligro (acciones destructivas).
 */
type Variante = 'primario' | 'secundario' | 'acento' | 'contorno' | 'peligro';

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

/**
 * Botón de la marca: 48dp de alto mínimo y se hunde a 0.97 en 140 ms al presionar. El fondo del
 * primario cambia de color con una transición de 140 ms en el hilo de UI (se conserva con
 * movimiento reducido: es color, no desplazamiento).
 */
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
  const reducido = useMovimientoReducido();

  const primario = variante === 'primario';
  const acento = variante === 'acento';
  const peligro = variante === 'peligro';
  const contorno = variante === 'contorno' || peligro;
  // En una hoja (superficie modal) el secundario lleva filete: en oscuro la hoja y su relleno son
  // el mismo carbón claro y el botón quedaría como texto suelto.
  const dentroDeHoja = useContext(DentroDeHoja);
  const filete = variante === 'secundario' && dentroDeHoja;
  const colorContorno = peligro ? colores.peligro : colores.contorno;

  let fondo = colores.secundario;
  let colorTexto = colores.textoSobreSecundario;
  if (primario) {
    fondo = colores.accion;
    colorTexto = colores.textoSobreAccion;
  } else if (acento) {
    fondo = colores.acento;
    colorTexto = colores.textoSobreAcento;
  } else if (contorno) {
    fondo = colores.transparente;
    colorTexto = colorContorno;
  }

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
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.boton,
            primario && styles.sombra,
            contorno && [styles.contorno, { borderColor: colorContorno }],
            filete && [styles.filete, { borderColor: colores.hairlineFuerte }],
            // Solo el primario cambia de fondo al presionar: vino a vino claro (crema 4.9:1 y blanco
            // 5.5:1 encima). Sin animar desde cero: es una transición de color de 140 ms.
            primario && transicionSeleccion,
            {
              backgroundColor: primario && pressed ? colores.accionPresionado : fondo,
              shadowColor: colores.sombra,
            },
            // Con movimiento reducido el primario responde solo con el color de presionado (--hover): la opacidad
            // de usePresion encima bajaba su texto a 3:1.
            primario && reducido ? null : estiloPresion,
          ]}
        >
          {icono && posicionIcono === 'inicio' ? <View accessible={false}>{icono}</View> : null}
          <Text style={[styles.texto, { color: colorTexto }]}>{titulo}</Text>
          {icono && posicionIcono === 'fin' ? <View accessible={false}>{icono}</View> : null}
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boton: {
    minHeight: toqueMinimo,
    paddingHorizontal: espacio.xxl,
    // --mf-radio-control de la web (10): el botón ya no es pastilla.
    borderRadius: radio.campo,
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
