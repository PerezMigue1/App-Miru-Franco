import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { borde, espacio, fuente, pantalla, radio, tipo, tracking } from './tokens';
import { useTheme } from './useTheme';

interface HojaProps {
  visible: boolean;
  /** Tocar el velo o el botón Atrás de Android la cierra. */
  onCerrar: () => void;
  titulo: string;
  /** Texto de apoyo bajo el título. */
  texto?: string;
  children: ReactNode;
}

/** Hoja inferior sobre un velo carbón (Modal de React Native): título, texto y acciones. */
export function Hoja({ visible, onCerrar, titulo, texto, children }: HojaProps) {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCerrar}
    >
      <View style={styles.modal}>
        {/* El velo cierra al tocarlo; para TalkBack basta Atrás, así el foco empieza en el título. */}
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onCerrar}
          style={[StyleSheet.absoluteFill, { backgroundColor: colores.velo }]}
        />
        <View
          style={[
            styles.hoja,
            { backgroundColor: colores.fondo, borderColor: colores.oro, paddingBottom: bottom + espacio.xl },
          ]}
        >
          <View style={styles.encabezado}>
            <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
              {titulo}
            </Text>
            {texto ? <Text style={[styles.texto, { color: colores.textoSuave }]}>{texto}</Text> : null}
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  hoja: {
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
    letterSpacing: tracking.titulo,
  },
  texto: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
});
