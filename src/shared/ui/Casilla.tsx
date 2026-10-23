import { CircleAlert, Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { transicionSeleccion } from './movimiento';
import { borde, casilla, espacio, fuente, icono, opacidad, radio, tipo, toqueMinimo } from './tokens';
import { useTheme } from './useTheme';

interface CasillaProps {
  /** El padre controla el estado: empieza sin marcar si así lo pasa. */
  marcada: boolean;
  onCambiar: (marcada: boolean) => void;
  /** Texto que lee el lector de pantalla para la casilla (la etiqueta completa, sin formato). */
  etiquetaAccesible: string;
  /**
   * La etiqueta visible. Va en un Text y puede traer un enlace dentro (EnlaceEnTexto); tocar el
   * texto marca o desmarca, tocar el enlace solo abre el enlace.
   */
  children: ReactNode;
  /** Mensaje de error debajo (por ejemplo, falta marcarla); se anuncia al aparecer. */
  error?: string | null;
  deshabilitada?: boolean;
}

/**
 * Casilla de verificación compartida: el cuadro es un Pressable con rol checkbox y área táctil de
 * 48dp; la etiqueta va al lado, fuera del cuadro, para que un enlace dentro de ella sea su propio
 * elemento para TalkBack. Al marcarla, el relleno y el borde cambian en 140 ms. El error vive en una
 * región en vivo siempre montada (TalkBack lo anuncia al aparecer) y también va como pista de la
 * casilla.
 */
export function Casilla({
  marcada,
  onCambiar,
  etiquetaAccesible,
  children,
  error,
  deshabilitada = false,
}: CasillaProps) {
  const { colores } = useTheme();
  let colorBorde = colores.campoBorde;
  if (marcada) {
    colorBorde = colores.foco;
  } else if (error) {
    colorBorde = colores.peligro;
  }
  const alternar = () => onCambiar(!marcada);

  return (
    <View style={deshabilitada ? styles.deshabilitada : null}>
      <View style={styles.fila}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={etiquetaAccesible}
          accessibilityState={{ checked: marcada, disabled: deshabilitada }}
          accessibilityHint={error ?? undefined}
          disabled={deshabilitada}
          onPress={alternar}
          style={styles.area}
        >
          <Animated.View
            style={[
              styles.cuadro,
              transicionSeleccion,
              { borderColor: colorBorde, backgroundColor: marcada ? colores.accion : colores.campoFondo },
            ]}
          >
            {marcada ? (
              <Check color={colores.textoSobreAccion} size={icono.tamanoPequeno} strokeWidth={icono.trazoMarca} />
            ) : null}
          </Animated.View>
        </Pressable>
        {/* Tocar la etiqueta también alterna; para TalkBack la casilla ya la lee, así que este
            contenedor no es un elemento: solo el texto (y su enlace) lo son. */}
        <Pressable accessible={false} disabled={deshabilitada} onPress={alternar} style={styles.etiqueta}>
          <Text style={[styles.texto, { color: colores.texto }]}>{children}</Text>
        </Pressable>
      </View>
      <View collapsable={false} accessibilityLiveRegion="polite" style={error ? styles.error : styles.fueraDeFlujo}>
        {error ? (
          <>
            <CircleAlert color={colores.peligro} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            <Text style={[styles.textoError, { color: colores.peligro }]}>{error}</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

interface EnlaceEnTextoProps {
  texto: string;
  onPress: () => void;
  accessibilityHint?: string;
}

/** Enlace dentro de un texto (la etiqueta de una Casilla): subrayado, en el color de enlace y con rol link. */
export function EnlaceEnTexto({ texto, onPress, accessibilityHint }: EnlaceEnTextoProps) {
  const { colores } = useTheme();
  return (
    <Text
      accessibilityRole="link"
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={[styles.enlace, { color: colores.enlace }]}
    >
      {texto}
    </Text>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // 48 x 48 con el cuadro de 24 al centro: el toque no depende de atinarle al cuadro.
  area: {
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cuadro: {
    width: casilla.tamano,
    height: casilla.tamano,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.casilla,
    borderWidth: borde.campo,
  },
  etiqueta: {
    flex: 1,
    minHeight: toqueMinimo,
    justifyContent: 'center',
    paddingVertical: espacio.s,
  },
  texto: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  enlace: {
    fontFamily: fuente.textoFuerte,
    textDecorationLine: 'underline',
  },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.s,
    paddingLeft: toqueMinimo,
  },
  textoError: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  // La región en vivo vacía queda fuera del flujo: no suma espacio.
  fueraDeFlujo: {
    position: 'absolute',
  },
  deshabilitada: {
    opacity: opacidad.deshabilitado,
  },
});
