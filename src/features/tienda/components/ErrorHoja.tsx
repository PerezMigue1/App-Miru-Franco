import { CircleAlert } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { espacio, fuente, icono, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

/**
 * Mensaje de error dentro de una hoja de la tienda (revocar, pedir o retirar una solicitud). La región
 * en vivo queda siempre montada para que TalkBack anuncie el mensaje cuando aparece.
 */
export function ErrorHoja({ mensaje }: { mensaje: string | null }) {
  const { colores } = useTheme();
  return (
    <View collapsable={false} accessibilityLiveRegion="polite">
      {mensaje ? (
        <View style={styles.error}>
          <View style={styles.iconoLinea}>
            <CircleAlert color={colores.peligro} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          </View>
          <Text style={[styles.texto, { color: colores.peligro }]}>{mensaje}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  iconoLinea: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.cuerpo.linea - icono.tamanoPequeno) / 2,
  },
  texto: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
});
