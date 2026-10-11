import { StyleSheet, Text, View } from 'react-native';

import { fuente, insignia, radio, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

export type TonoBadge = 'aviso' | 'exito' | 'neutro';

interface BadgeEstadoProps {
  texto: string;
  tono: TonoBadge;
}

/**
 * Insignia de estado (pendiente de pago, anticipo pagado...): base clara teñida del color del
 * estado y texto oscuro de su familia, en claro y en oscuro (DESIGN.md).
 */
export function BadgeEstado({ texto, tono }: BadgeEstadoProps) {
  const { oscuro } = useTheme();
  const colores = (oscuro ? insignia.oscuro : insignia.claro)[tono];
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Estado: ${texto}`}
      style={[styles.badge, { backgroundColor: colores.fondo }]}
    >
      <Text style={[styles.texto, { color: colores.texto }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: insignia.rellenoHorizontal,
    paddingVertical: insignia.rellenoVertical,
    borderRadius: radio.pastilla,
  },
  texto: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
});
