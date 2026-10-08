import { Pressable, StyleSheet, Text } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';
import { borde, espacio, fuente, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface HojaConfirmacionProps {
  visible: boolean;
  titulo: string;
  texto: string;
  /** Texto de la acción destructiva (por ejemplo, "Quitar foto"). */
  accion: string;
  /** Texto de la opción que deja todo como estaba (por omisión, "Cancelar"). */
  cancelar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/**
 * Confirmación antes de una acción destructiva: la acción va en el color de peligro y "Cancelar"
 * deja todo como estaba.
 */
export function HojaConfirmacion({
  visible,
  titulo,
  texto,
  accion,
  cancelar = 'Cancelar',
  onConfirmar,
  onCancelar,
}: HojaConfirmacionProps) {
  const { colores } = useTheme();
  return (
    <Hoja visible={visible} onCerrar={onCancelar} titulo={titulo} texto={texto}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accion}
        onPress={onConfirmar}
        style={({ pressed }) => [
          styles.peligro,
          { borderColor: colores.peligro, backgroundColor: pressed ? colores.presionado : 'transparent' },
        ]}
      >
        <Text style={[styles.textoPeligro, { color: colores.peligro }]}>{accion}</Text>
      </Pressable>
      <Button titulo={cancelar} variante="secundario" onPress={onCancelar} />
    </Hoja>
  );
}

const styles = StyleSheet.create({
  peligro: {
    minHeight: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espacio.xxl,
    borderRadius: radio.pastilla,
    borderWidth: borde.campo,
  },
  textoPeligro: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
});
