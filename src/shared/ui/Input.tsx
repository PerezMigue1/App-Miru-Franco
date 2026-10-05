import { Eye, EyeOff } from 'lucide-react-native';
import { useId, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { borde, espacio, fuente, icono, radio, tipo, toqueMinimo } from './tokens';
import { useTheme } from './useTheme';

export type TipoInput =
  | 'texto'
  | 'nombre'
  | 'correo'
  | 'telefono'
  | 'fecha'
  | 'claveActual'
  | 'claveNueva';

interface InputProps {
  etiqueta: string;
  valor: string;
  onCambiar: (texto: string) => void;
  tipo?: TipoInput;
  placeholder?: string;
  /** Texto de ayuda bajo el campo (se oculta si hay error). */
  ayuda?: string;
  /** Mensaje de error; listo para la validación de GP-05. */
  error?: string | null;
}

const LARGO_TELEFONO = 10;
const LARGO_FECHA = 10;
const DIGITOS_FECHA = 8;

const AJUSTES: Record<TipoInput, TextInputProps> = {
  texto: { autoCapitalize: 'sentences' },
  nombre: { autoComplete: 'name', textContentType: 'name', autoCapitalize: 'words' },
  correo: {
    autoComplete: 'email',
    textContentType: 'emailAddress',
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    autoCorrect: false,
  },
  telefono: {
    autoComplete: 'tel',
    textContentType: 'telephoneNumber',
    keyboardType: 'number-pad',
    maxLength: LARGO_TELEFONO,
  },
  fecha: { autoComplete: 'birthdate-full', keyboardType: 'number-pad', maxLength: LARGO_FECHA },
  claveActual: { autoComplete: 'current-password', textContentType: 'password', autoCapitalize: 'none' },
  claveNueva: { autoComplete: 'new-password', textContentType: 'newPassword', autoCapitalize: 'none' },
};

function soloDigitos(texto: string): string {
  return texto
    .split('')
    .filter((c) => c >= '0' && c <= '9')
    .join('');
}

/** DD/MM/AAAA mientras se escribe: solo da formato, no valida. */
function conFormatoFecha(texto: string): string {
  const digitos = soloDigitos(texto).slice(0, DIGITOS_FECHA);
  const partes = [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4)].filter(Boolean);
  return partes.join('/');
}

/**
 * Campo de formulario (DESIGN.md): etiqueta siempre visible, borde con contraste 3:1, foco vino u
 * oro, error en texto de peligro anunciado por el lector de pantalla y, en contraseñas, botón para
 * mostrar u ocultar.
 */
export function Input({
  etiqueta,
  valor,
  onCambiar,
  tipo = 'texto',
  placeholder,
  ayuda,
  error,
}: InputProps) {
  const { colores } = useTheme();
  const id = useId();
  const [enfocado, setEnfocado] = useState(false);
  const [claveVisible, setClaveVisible] = useState(false);

  const esClave = tipo === 'claveActual' || tipo === 'claveNueva';
  const hayError = Boolean(error);

  let colorBorde = colores.campoBorde;
  if (hayError) {
    colorBorde = colores.peligro;
  } else if (enfocado) {
    colorBorde = colores.foco;
  }

  const cambiar = (texto: string) => {
    if (tipo === 'fecha') {
      onCambiar(conFormatoFecha(texto));
    } else if (tipo === 'telefono') {
      onCambiar(soloDigitos(texto));
    } else {
      onCambiar(texto);
    }
  };

  const OjoIcono = claveVisible ? EyeOff : Eye;

  return (
    <View style={styles.campo}>
      <Text nativeID={`${id}-etiqueta`} style={[styles.etiqueta, { color: colores.texto }]}>
        {etiqueta}
      </Text>
      <View
        style={[
          styles.caja,
          { backgroundColor: colores.campoFondo, borderColor: colorBorde },
        ]}
      >
        <TextInput
          {...AJUSTES[tipo]}
          value={valor}
          onChangeText={cambiar}
          placeholder={placeholder}
          secureTextEntry={esClave && !claveVisible}
          accessibilityLabelledBy={`${id}-etiqueta`}
          accessibilityHint={hayError ? (error ?? undefined) : ayuda}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          selectionColor={colores.foco}
          cursorColor={colores.foco}
          placeholderTextColor={colores.campoPlaceholder}
          style={[styles.entrada, { color: colores.campoTexto }]}
        />
        {esClave ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={claveVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onPress={() => setClaveVisible((v) => !v)}
            style={styles.ojo}
          >
            <OjoIcono color={colores.campoPlaceholder} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          </Pressable>
        ) : null}
      </View>
      {hayError ? (
        <Text accessibilityLiveRegion="polite" style={[styles.nota, { color: colores.peligro }]}>
          {error}
        </Text>
      ) : null}
      {!hayError && ayuda ? (
        <Text style={[styles.nota, { color: colores.textoSuave }]}>{ayuda}</Text>
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
  caja: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radio.campo,
    borderWidth: borde.campo,
  },
  entrada: {
    flex: 1,
    minHeight: toqueMinimo,
    paddingHorizontal: espacio.l,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
  },
  ojo: {
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
});
