import { CircleAlert, CircleCheck, CircleDashed, Eye, EyeOff, Info } from 'lucide-react-native';
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
  tipo: 'verificando' | 'exito' | 'aviso' | 'error';
  texto: string;
}

interface InputProps {
  etiqueta: string;
  valor: string;
  onCambiar: (texto: string) => void;
  /** Al salir del campo (validación al perder el foco). */
  onSalir?: () => void;
  /** Tecla "siguiente" del teclado: lleva el foco al campo que sigue. */
  siguiente?: () => void;
  /** Tecla "listo" del teclado en el último campo: envía el formulario. */
  alEnviar?: () => void;
  tipo?: TipoInput;
  placeholder?: string;
  /** Texto de ayuda bajo el campo (se oculta si hay error o estado). */
  ayuda?: string;
  /** Mensaje de error de validación; tiene prioridad sobre el estado. */
  error?: string | null;
  estado?: EstadoCampo | null;
  /** Reserva el alto de una línea de mensaje para que el formulario no salte al cambiar de estado. */
  reservarMensaje?: boolean;
  /** Contenido extra bajo el campo (enlaces, requisitos). */
  debajo?: ReactNode;
  ref?: Ref<TextInput>;
}

const LARGO_TELEFONO = 10;
const LARGO_TELEFONO_CON_52 = 12;
const LARGO_TELEFONO_CON_521 = 13;
const LARGO_FECHA = 10;
const DIGITOS_FECHA = 8;
const EASE_SALIDA = Easing.bezier(...curva.salida);
// Solo el ícono (decorativo) se funde; el texto queda fuera para que TalkBack lo anuncie.
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
  // Sin maxLength: el límite nativo recortaría lo pegado ("+52 771…") antes de limpiarlo.
  telefono: {
    autoComplete: 'tel',
    textContentType: 'telephoneNumber',
    keyboardType: 'number-pad',
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

/**
 * Teléfono escrito o pegado: solo dígitos; si quedan 12 que empiezan con 52 o 13 que empiezan con
 * 521, se quita esa lada; después se limita a 10. Solo da formato: la validación vive en AuthModel.
 */
function telefonoEscrito(texto: string): string {
  let digitos = soloDigitos(texto);
  if (digitos.length === LARGO_TELEFONO_CON_52 && digitos.startsWith('52')) {
    digitos = digitos.slice(2);
  } else if (digitos.length === LARGO_TELEFONO_CON_521 && digitos.startsWith('521')) {
    digitos = digitos.slice(3);
  }
  return digitos.slice(0, LARGO_TELEFONO);
}

/** DD/MM/AAAA mientras se escribe: solo da formato, no valida. */
function conFormatoFecha(texto: string): string {
  const digitos = soloDigitos(texto).slice(0, DIGITOS_FECHA);
  const partes = [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4)].filter(Boolean);
  return partes.join('/');
}

/**
 * Campo de formulario (DESIGN.md): etiqueta siempre visible, borde con contraste 3:1, foco vino u
 * oro, mensajes de error y de estado en una región en vivo que siempre está montada (TalkBack los
 * anuncia una vez; la pista del campo solo lleva la ayuda) y, en contraseñas, botón para mostrar u
 * ocultar.
 */
export function Input({
  etiqueta,
  valor,
  onCambiar,
  onSalir,
  siguiente,
  alEnviar,
  tipo = 'texto',
  placeholder,
  ayuda,
  error,
  estado,
  reservarMensaje = false,
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
  const hayMensaje = hayError || estadoVisible !== null;

  let colorBorde = colores.campoBorde;
  if (hayError || estadoEsError) {
    colorBorde = colores.peligro;
  } else if (enfocado) {
    colorBorde = colores.foco;
  }

  const cambiar = (texto: string) => {
    if (tipo === 'fecha') {
      onCambiar(conFormatoFecha(texto));
    } else if (tipo === 'telefono') {
      onCambiar(telefonoEscrito(texto));
    } else {
      onCambiar(texto);
    }
  };

  const salir = () => {
    setEnfocado(false);
    onSalir?.();
  };

  let teclado: Pick<TextInputProps, 'returnKeyType' | 'submitBehavior' | 'onSubmitEditing'> = {};
  if (alEnviar) {
    teclado = { returnKeyType: 'done', submitBehavior: 'blurAndSubmit', onSubmitEditing: alEnviar };
  } else if (siguiente) {
    teclado = { returnKeyType: 'next', submitBehavior: 'submit', onSubmitEditing: siguiente };
  }

  const OjoIcono = claveVisible ? EyeOff : Eye;

  return (
    <View>
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
          {...teclado}
          ref={ref}
          value={valor}
          onChangeText={cambiar}
          placeholder={placeholder}
          secureTextEntry={esClave && !claveVisible}
          accessibilityLabelledBy={`${id}-etiqueta`}
          accessibilityHint={ayuda}
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
      {/*
        Región en vivo siempre montada (collapsable={false}: Fabric aplanaría la vista y con ella la
        región). Que aparezca o cambie un mensaje es un cambio de contenido: se anuncia una vez.
      */}
      <View
        collapsable={false}
        accessibilityLiveRegion="polite"
        style={hayMensaje || reservarMensaje ? styles.mensajes : null}
      >
        {hayError ? (
          <Text style={[styles.nota, { color: colores.peligro }]}>{error}</Text>
        ) : null}
        {estadoVisible ? (
          <View accessible style={styles.estado}>
            {/* La clave vuelve a montar solo el ícono en cada estado para que se funda otra vez. */}
            <Animated.View
              key={estadoVisible.tipo}
              entering={APARECER}
              importantForAccessibility="no-hide-descendants"
            >
              <IconoEstado tipo={estadoVisible.tipo} />
            </Animated.View>
            <Text
              style={[styles.nota, styles.textoEstado, { color: colorDeEstado(estadoVisible.tipo, colores) }]}
            >
              {estadoVisible.texto}
            </Text>
          </View>
        ) : null}
      </View>
      {!hayMensaje && ayuda ? (
        <Text style={[styles.nota, styles.ayuda, { color: colores.textoSuave }]}>{ayuda}</Text>
      ) : null}
      {debajo ? <View style={styles.debajo}>{debajo}</View> : null}
    </View>
  );
}

function colorDeEstado(
  tipoEstado: EstadoCampo['tipo'],
  colores: { peligro: string; exito: string; aviso: string; textoSuave: string },
): string {
  if (tipoEstado === 'error') {
    return colores.peligro;
  }
  if (tipoEstado === 'exito') {
    return colores.exito;
  }
  if (tipoEstado === 'aviso') {
    return colores.aviso;
  }
  // Verificar es una espera, no un problema: color neutro, no el de aviso.
  return colores.textoSuave;
}

function IconoEstado({ tipo: tipoEstado }: { tipo: EstadoCampo['tipo'] }) {
  const { colores } = useTheme();
  if (tipoEstado === 'exito') {
    return <CircleCheck color={colores.exito} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />;
  }
  if (tipoEstado === 'error') {
    return <CircleAlert color={colores.peligro} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />;
  }
  // Forma distinta a la del error: el aviso no se reconoce solo por el color.
  if (tipoEstado === 'aviso') {
    return <Info color={colores.aviso} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />;
  }
  // Mismo lugar que los otros íconos: el texto no se desplaza al cambiar de estado.
  return <CircleDashed color={colores.textoSuave} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />;
}

const styles = StyleSheet.create({
  etiqueta: {
    marginBottom: espacio.s,
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
  mensajes: {
    marginTop: espacio.s,
    minHeight: tipo.etiqueta.linea,
  },
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  ayuda: {
    marginTop: espacio.s,
  },
  debajo: {
    marginTop: espacio.s,
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
