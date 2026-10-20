import { StyleSheet, Text, View } from 'react-native';

import { borde, fuente, insignia, radio, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { TonoBadge } from '../models/citaModel';

export type { TonoBadge };

interface BadgeEstadoProps {
  texto: string;
  tono: TonoBadge;
}

/**
 * Insignia de estado (pendiente de pago, anticipo pagado...): base clara teñida del color del
 * estado, texto oscuro de su familia y filete interior de 1px del mismo color al 30 %, en claro y
 * en oscuro (.mf-badge de la web).
 */
export function BadgeEstado({ texto, tono }: BadgeEstadoProps) {
  const { oscuro } = useTheme();
  const colores = (oscuro ? insignia.oscuro : insignia.claro)[tono];
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Estado: ${texto}`}
      style={[styles.badge, { backgroundColor: colores.fondo, borderColor: insignia.borde[tono] }]}
    >
      <Text style={[styles.texto, { color: colores.texto }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // El filete va por dentro (en la web es un box-shadow inset): el relleno descuenta su grosor
  // para que la insignia mida lo mismo que antes y que su esqueleto.
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: insignia.rellenoHorizontal - borde.hairline,
    paddingVertical: insignia.rellenoVertical - borde.hairline,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
  },
  texto: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
});
