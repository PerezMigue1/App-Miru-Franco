import { Receipt } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { espacio, icono } from './tokens';
import { useTheme } from './useTheme';

/** Un botón "Ver comprobante" ya listo: su texto, la ayuda para el lector y qué hace al tocarlo. */
export interface BotonComprobante {
  /** Única en la lista ('pedido-7', 'venta-45'). */
  clave: string;
  titulo: string;
  ayuda: string;
  onPress: () => void;
}

/**
 * Botones "Ver comprobante" del detalle de un pedido y de una cita (GP-09): secundarios, uno debajo
 * del otro. Sin botones no pinta nada.
 */
export function BotonesComprobante({ botones }: Readonly<{ botones: readonly BotonComprobante[] }>) {
  const { colores } = useTheme();
  if (botones.length === 0) {
    return null;
  }
  return (
    <View style={styles.lista}>
      {botones.map((boton) => (
        <Button
          key={boton.clave}
          titulo={boton.titulo}
          variante="secundario"
          posicionIcono="inicio"
          icono={<Receipt color={colores.textoSobreSecundario} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />}
          accessibilityHint={boton.ayuda}
          onPress={boton.onPress}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  lista: {
    gap: espacio.m,
  },
});
