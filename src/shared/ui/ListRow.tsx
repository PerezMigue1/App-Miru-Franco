import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { espacio, fila, fuente, icono, pantalla, tipo } from './tokens';
import { useTheme } from './useTheme';

interface ListRowProps {
  icono: LucideIcon;
  titulo: string;
  onPress?: () => void;
  /** Acción destructiva (Cerrar sesión): texto e ícono en color de peligro, sin flecha. */
  destructiva?: boolean;
  accessibilityHint?: string;
}

/** Fila de lista con ícono lucide y flecha; el fondo se tiñe mientras se presiona. */
export function ListRow({
  icono: Icono,
  titulo,
  onPress,
  destructiva = false,
  accessibilityHint,
}: ListRowProps) {
  const { colores } = useTheme();
  const color = destructiva ? colores.peligro : colores.texto;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fila,
        { backgroundColor: pressed ? colores.presionado : 'transparent' },
      ]}
    >
      <Icono color={color} size={icono.tamano} strokeWidth={icono.trazo} />
      <Text style={[styles.titulo, { color }]}>{titulo}</Text>
      {destructiva ? null : (
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
  },
  titulo: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
});
