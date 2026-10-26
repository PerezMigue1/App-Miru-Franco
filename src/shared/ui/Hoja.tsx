import { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { EASE_HOJA, EASE_SALIDA } from './movimiento';
import { borde, duracion, espacio, fuente, pantalla, radio, tipo, tracking } from './tokens';
import { useMovimientoReducido } from './useMovimientoReducido';
import { useTheme } from './useTheme';

interface HojaProps {
  visible: boolean;
  /** Tocar el velo o el botón Atrás de Android la cierra. */
  onCerrar: () => void;
  titulo: string;
  /** Texto de apoyo bajo el título. */
  texto?: string;
  /**
   * Avisa una vez por cierre que la hoja ya terminó de irse: al acabar la salida (cuando el Modal deja
   * de pintarse), o en cuanto se cierra con movimiento reducido. Si la Hoja misma se desmonta antes,
   * no avisa. Sirve para abrir otra hoja sin cruzarlas.
   */
  alCerrarse?: () => void;
  children: ReactNode;
}

/**
 * Hoja inferior sobre un velo carbón (Modal de React Native): título, texto y acciones. Si lleva un
 * campo de texto, sube sobre el teclado y, si no cabe, se encoge bajo la barra de estado (el
 * contenido largo va en un ScrollView dentro de children).
 *
 * Sube desde abajo en 240 ms mientras el velo se funde, y al cerrarse baja en 200 ms (salir es más
 * rápido que entrar). Con movimiento reducido, solo se funde. Mientras sale no recibe toques.
 * alCerrarse avisa cuando ya se fue (para encadenar otra hoja).
 */
/** true dentro de una Hoja: el botón secundario se dibuja con filete para no perderse en ella. */
export const DentroDeHoja = createContext(false);

export function Hoja({ visible, onCerrar, titulo, texto, alCerrarse, children }: HojaProps) {
  const { colores } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { height: altoVentana } = useWindowDimensions();
  const reducido = useMovimientoReducido();

  // El Modal sigue montado después de cerrar, hasta que termina la salida.
  const [montada, setMontada] = useState(visible);
  if (visible && !montada) {
    setMontada(true);
  }

  const progreso = useSharedValue(0);
  const altoHoja = useSharedValue(0);

  // El aviso más reciente (se lee al terminar la salida) y si hay un cierre por avisar: solo después
  // de haberse abierto, así una hoja que nunca se abrió no avisa nada.
  const avisoCierre = useRef(alCerrarse);
  const cierrePorAvisar = useRef(false);
  useEffect(() => {
    avisoCierre.current = alCerrarse;
  });
  // Si la Hoja se desmonta a mitad de la salida, ya no avisa a un dueño que tampoco está.
  useEffect(
    () => () => {
      cierrePorAvisar.current = false;
    },
    [],
  );

  useEffect(() => {
    if (visible) {
      cierrePorAvisar.current = true;
      // Al abrir desde cerrada se vuelve a medir: el contenido pudo cambiar de alto.
      if (progreso.get() === 0) {
        altoHoja.set(0);
      }
      progreso.set(
        withTiming(1, {
          duration: reducido ? duracion.reducido : duracion.hojaEntrada,
          easing: EASE_HOJA,
          reduceMotion: ReduceMotion.Never,
        }),
      );
      return;
    }
    const avisarCierre = () => {
      if (cierrePorAvisar.current) {
        cierrePorAvisar.current = false;
        avisoCierre.current?.();
      }
    };
    const terminarSalida = () => {
      setMontada(false);
      avisarCierre();
    };
    if (reducido) {
      // Con movimiento reducido solo hay un fundido breve: no hace falta esperarlo.
      avisarCierre();
    }
    progreso.set(
      withTiming(
        0,
        {
          duration: reducido ? duracion.reducido : duracion.hojaSalida,
          easing: EASE_SALIDA,
          reduceMotion: ReduceMotion.Never,
        },
        (terminada) => {
          if (terminada) {
            scheduleOnRN(terminarSalida);
          }
        },
      ),
    );
  }, [visible, progreso, altoHoja]);

  const estiloVelo = useAnimatedStyle(() => ({ opacity: progreso.get() }));
  const estiloHoja = useAnimatedStyle(() => {
    if (reducido) {
      return { opacity: progreso.get(), transform: [{ translateY: 0 }] };
    }
    // Antes de medirse, el alto de la ventana basta para empezar fuera de la pantalla.
    const recorrido = altoHoja.get() > 0 ? altoHoja.get() : altoVentana;
    return { opacity: 1, transform: [{ translateY: (1 - progreso.get()) * recorrido }] };
  });

  return (
    <Modal
      visible={montada}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        if (visible) {
          onCerrar();
        }
      }}
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.modal, { paddingTop: top + espacio.l, pointerEvents: visible ? 'auto' : 'none' }]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, estiloVelo]}>
          {/* El velo cierra al tocarlo; para TalkBack basta Atrás, así el foco empieza en el título. */}
          <Pressable
            accessible={false}
            importantForAccessibility="no"
            onPress={onCerrar}
            style={[StyleSheet.absoluteFill, { backgroundColor: colores.velo }]}
          />
        </Animated.View>
        <Animated.View
          // Mientras sale se conserva el alto medido: si el contenido cambia, la salida no salta.
          onLayout={(e) => {
            if (visible) {
              altoHoja.set(e.nativeEvent.layout.height);
            }
          }}
          style={[
            styles.hoja,
            { backgroundColor: colores.superficieModal, borderColor: colores.oro, paddingBottom: bottom + espacio.xl },
            estiloHoja,
          ]}
        >
          <View style={styles.encabezado}>
            <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
              {titulo}
            </Text>
            {/* Texto de cuerpo de la web (--texto-cuerpo, como .mf-dialogo): 8.9:1 en claro y 10.2:1 en oscuro. */}
            {texto ? <Text style={[styles.texto, { color: colores.textoCuerpo }]}>{texto}</Text> : null}
          </View>
          <DentroDeHoja.Provider value>{children}</DentroDeHoja.Provider>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  hoja: {
    flexShrink: 1,
    gap: espacio.m,
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.xxl,
    borderTopLeftRadius: radio.tarjeta,
    borderTopRightRadius: radio.tarjeta,
    // Hairline de oro: el borde de la hoja se ve también sobre el velo carbón del modo oscuro.
    borderTopWidth: borde.hairline,
  },
  encabezado: {
    gap: espacio.xs,
    marginBottom: espacio.s,
  },
  titulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  texto: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
});
