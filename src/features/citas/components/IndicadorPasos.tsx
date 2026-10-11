import { Check } from 'lucide-react-native';
import { Fragment, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { borde, espacio, fuente, icono, pasoFlujo, radio, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface IndicadorPasosProps {
  /** Nombres de los pasos, en orden. */
  pasos: readonly string[];
  /** Paso actual, desde 1. */
  actual: number;
  ref?: Ref<View>;
}

/**
 * Indicador de pasos de un flujo con el mismo lenguaje que el del registro: el paso actual en vino
 * con anillo de oro, el hecho en vino con palomita y el pendiente solo con contorno. Con tres pasos
 * la etiqueta va bajo el círculo para caber a 360dp sin cortarse.
 */
export function IndicadorPasos({ pasos, actual, ref }: IndicadorPasosProps) {
  const { colores } = useTheme();
  const etiquetaActual = pasos[actual - 1] ?? '';
  return (
    <View
      ref={ref}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`Paso ${actual} de ${pasos.length}: ${etiquetaActual}`}
      style={styles.pasos}
    >
      {pasos.map((etiqueta, indice) => {
        const numero = indice + 1;
        const hecho = numero < actual;
        const esActual = numero === actual;
        const marcado = hecho || esActual;
        return (
          <Fragment key={etiqueta}>
            {indice > 0 ? (
              <View
                style={[styles.conector, { backgroundColor: marcado ? colores.foco : colores.hairline }]}
              />
            ) : null}
            <View style={styles.item}>
              <View
                style={[
                  styles.circulo,
                  marcado
                    ? {
                        backgroundColor: colores.accion,
                        borderColor: esActual ? colores.oro : colores.accion,
                        borderWidth: borde.indicador,
                      }
                    : { borderColor: colores.textoSuave, borderWidth: borde.campo },
                ]}
              >
                {hecho ? (
                  <Check
                    color={colores.textoSobreAccion}
                    size={icono.tamanoPequeno}
                    strokeWidth={icono.trazoMarca}
                  />
                ) : (
                  <Text
                    style={[
                      styles.numero,
                      { color: marcado ? colores.textoSobreAccion : colores.textoSuave },
                    ]}
                  >
                    {numero}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.etiqueta,
                  { color: marcado ? colores.texto : colores.textoSuave },
                  esActual ? styles.etiquetaActual : null,
                ]}
              >
                {etiqueta}
              </Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pasos: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  item: {
    alignItems: 'center',
    gap: espacio.xs,
  },
  // A la altura del centro de los círculos.
  conector: {
    flex: 1,
    height: borde.hairline,
    marginTop: pasoFlujo.circulo / 2,
    marginHorizontal: espacio.s,
  },
  circulo: {
    width: pasoFlujo.circulo,
    height: pasoFlujo.circulo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  numero: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  etiqueta: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
    textAlign: 'center',
  },
  etiquetaActual: {
    fontFamily: fuente.textoMedio,
  },
});
