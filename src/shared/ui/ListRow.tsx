import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { espacio, fila, fuente, icono, opacidad, pantalla, tipo } from './tokens';
import { useTheme } from './useTheme';

interface ListRowProps {
  icono: LucideIcon;
  titulo: string;
  /** Texto secundario bajo el título (por ejemplo, "Disponible pronto"). */
  detalle?: string;
  onPress?: () => void;
  /** Acción destructiva (Cerrar sesión): texto e ícono en color de peligro, sin flecha. */
  destructiva?: boolean;
  /** No disponible todavía: atenuada, sin flecha y anunciada como deshabilitada. */
  deshabilitada?: boolean;
  accessibilityHint?: string;
}

/** Fila de lista con ícono lucide y flecha; el fondo se tiñe mientras se presiona. */
export function ListRow({
  icono: Icono,
  titulo,
  detalle,
  onPress,
  destructiva = false,
  deshabilitada = false,
  accessibilityHint,
}: ListRowProps) {
  const { colores } = useTheme();
  const color = destructiva ? colores.peligro : colores.texto;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detalle ? `${titulo}, ${detalle}` : titulo}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: deshabilitada }}
      disabled={deshabilitada}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fila,
        { backgroundColor: pressed ? colores.presionado : 'transparent' },
      ]}
    >
      <View style={deshabilitada ? styles.deshabilitada : null}>
        <Icono color={color} size={icono.tamano} strokeWidth={icono.trazo} />
      </View>
      <View style={styles.textos}>
        <Text style={[styles.titulo, { color }, deshabilitada ? styles.deshabilitada : null]}>{titulo}</Text>
        {detalle ? <Text style={[styles.detalle, { color: colores.textoSuave }]}>{detalle}</Text> : null}
      </View>
      {destructiva || deshabilitada ? null : (
        <ChevronRight color={colores.textoSuave} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: {
    minHeight: fila.alto,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.l,
    paddingHorizontal: pantalla.margen,
    paddingVertical: espacio.s,
  },
  deshabilitada: {
    opacity: opacidad.deshabilitado,
  },
  textos: {
    flex: 1,
  },
  titulo: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  detalle: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
});
