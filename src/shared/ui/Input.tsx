import { CircleAlert, CircleCheck, CircleDashed, Eye, EyeOff } from 'lucide-react-native';
import { useId, useState, type ReactNode, type Ref } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, { Easing, FadeIn, ReduceMotion } from 'react-native-reanimated';

import { borde, curva, duracion, espacio, fuente, icono, radio, tipo, toqueMinimo } from './tokens';
import { useTheme } from './useTheme';

export type TipoInput =
  | 'texto'
  | 'nombre'
  | 'correo'
  | 'telefono'
  | 'fecha'
  | 'claveActual'
  | 'claveNueva';

/** Estado del campo que no es un error de validación (por ejemplo, verificar un correo). */
export interface EstadoCampo {
  tipo: 'verificando' | 'exito' | 'error';
  texto: string;
}

interface InputProps {
  etiqueta: string;
  valor: string;
  onCambiar: (texto: string) => void;
  /** Al salir del campo (validación al perder el foco). */
  onSalir?: () => void;
  tipo?: TipoInput;
  placeholder?: string;
  /** Texto de ayuda bajo el campo (se oculta si hay error o estado). */
  ayuda?: string;
  /** Mensaje de error de validación; tiene prioridad sobre el estado. */
  error?: string | null;
  estado?: EstadoCampo | null;
  /** Contenido extra bajo el campo (enlaces, requisitos). */
  debajo?: ReactNode;
  ref?: Ref<TextInput>;
}

const LARGO_TELEFONO = 10;
const LARGO_FECHA = 10;
const DIGITOS_FECHA = 8;
const EASE_SALIDA = Easing.bezier(...curva.salida);
// Solo opacidad: DESIGN.md la conserva también con movimiento reducido.
const APARECER = FadeIn.duration(duracion.estadoCampo).easing(EASE_SALIDA).reduceMotion(ReduceMotion.Never);

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
 * oro, error en texto de peligro anunciado por el lector de pantalla, estado opcional (verificando,
 * correcto o error) y, en contraseñas, botón para mostrar u ocultar.
 */
export function Input({
  etiqueta,
  valor,
  onCambiar,
  onSalir,
  tipo = 'texto',
  placeholder,
  ayuda,
  error,
  estado,
  debajo,
  ref,
}: InputProps) {
  const { colores } = useTheme();
  const id = useId();
  const [enfocado, setEnfocado] = useState(false);
  const [claveVisible, setClaveVisible] = useState(false);

  const esClave = tipo === 'claveActual' || tipo === 'claveNueva';
  const hayError = Boolean(error);
  // El error de validación manda; si no hay, se muestra el estado del campo.
  const estadoVisible = hayError ? null : (estado ?? null);
  const estadoEsError = estadoVisible?.tipo === 'error';

  let colorBorde = colores.campoBorde;
  if (hayError || estadoEsError) {
    colorBorde = colores.peligro;
  } else if (enfocado) {
    colorBorde = colores.foco;
  }

  let pista = ayuda;
  if (hayError) {
    pista = error ?? undefined;
  } else if (estadoVisible) {
    pista = estadoVisible.texto;
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

  const salir = () => {
    setEnfocado(false);
    onSalir?.();
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
          ref={ref}
          value={valor}
          onChangeText={cambiar}
          placeholder={placeholder}
          secureTextEntry={esClave && !claveVisible}
          accessibilityLabelledBy={`${id}-etiqueta`}
          accessibilityHint={pista}
          onFocus={() => setEnfocado(true)}
          onBlur={salir}
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
        <Animated.Text
          entering={APARECER}
          accessibilityLiveRegion="polite"
          style={[styles.nota, { color: colores.peligro }]}
        >
          {error}
        </Animated.Text>
      ) : null}
      {estadoVisible ? (
        <Animated.View
          key={`${estadoVisible.tipo}-${estadoVisible.texto}`}
          entering={APARECER}
          accessible
          accessibilityLiveRegion="polite"
          style={styles.estado}
        >
          <IconoEstado tipo={estadoVisible.tipo} />
          <Text
            style={[
              styles.nota,
              styles.textoEstado,
              { color: estadoEsError ? colores.peligro : colores.textoSuave },
            ]}
          >
            {estadoVisible.texto}
          </Text>
        </Animated.View>
      ) : null}
      {!hayError && !estadoVisible && ayuda ? (
        <Text style={[styles.nota, { color: colores.textoSuave }]}>{ayuda}</Text>
      ) : null}
      {debajo ?? null}
    </View>
  );
}

function IconoEstado({ tipo: tipoEstado }: { tipo: EstadoCampo['tipo'] }) {
  const { colores } = useTheme();
  if (tipoEstado === 'exito') {
    return <CircleCheck color={colores.foco} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />;
  }
  if (tipoEstado === 'error') {
    return <CircleAlert color={colores.peligro} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />;
  }
  // Mismo lugar que los otros íconos: el texto no se desplaza al cambiar de estado.
  return <CircleDashed color={colores.textoSuave} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />;
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
  estado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
  },
  textoEstado: {
    flexShrink: 1,
  },
});
