import { useId, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { borde, codigo, espacio, fuente, radio, tipo } from './tokens';
import { useTheme } from './useTheme';

interface OtpInputProps {
  etiqueta: string;
  valor: string;
  onCambiar: (texto: string) => void;
  largo?: number;
  error?: string | null;
}

/**
 * Código de verificación: un campo numérico real (autocompletado del sistema y lector de pantalla)
 * dibujado como casillas. La casilla siguiente se marca con el color de foco.
 */
export function OtpInput({ etiqueta, valor, onCambiar, largo = 6, error }: OtpInputProps) {
  const { colores } = useTheme();
  const id = useId();
  const [enfocado, setEnfocado] = useState(false);
  const hayError = Boolean(error);
  const casillas = Array.from({ length: largo }, (_, i) => i);

  const colorBorde = (indice: number) => {
    if (hayError) {
      return colores.peligro;
    }
    const activa = enfocado && indice === Math.min(valor.length, largo - 1);
    return activa ? colores.foco : colores.campoBorde;
  };

  return (
    <View style={styles.campo}>
      <Text nativeID={`${id}-etiqueta`} style={[styles.etiqueta, { color: colores.texto }]}>
        {etiqueta}
      </Text>
      <View>
        <View
          style={styles.fila}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {casillas.map((indice) => (
            <View
              key={indice}
              style={[
                styles.casilla,
                { backgroundColor: colores.campoFondo, borderColor: colorBorde(indice) },
              ]}
            >
              <Text style={[styles.digito, { color: colores.campoTexto }]}>{valor[indice] ?? ''}</Text>
            </View>
          ))}
        </View>
        <TextInput
          value={valor}
          onChangeText={onCambiar}
          maxLength={largo}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          caretHidden
          accessibilityLabelledBy={`${id}-etiqueta`}
          accessibilityHint={hayError ? (error ?? undefined) : `${largo} dígitos`}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          style={[StyleSheet.absoluteFill, styles.entrada]}
        />
      </View>
      {hayError ? (
        <Text accessibilityLiveRegion="polite" style={[styles.nota, { color: colores.peligro }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  campo: {
    gap: espacio.s,
  },
  etiqueta: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: espacio.s,
  },
  casilla: {
    flex: 1,
    maxWidth: codigo.ancho,
    height: codigo.alto,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.campo,
    borderWidth: borde.campo,
  },
  digito: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    fontVariant: ['tabular-nums'],
  },
  // El campo real queda encima de las casillas, invisible, para recibir el toque y el teclado.
  entrada: {
    opacity: 0,
  },
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
});
