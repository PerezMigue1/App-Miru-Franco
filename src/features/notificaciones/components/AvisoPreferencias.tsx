import { CircleAlert, CircleCheck } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { espacio, fuente, icono, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

/**
 * Resultado de cargar o guardar las preferencias de avisos: un error (color de peligro) o la
 * confirmación (color de éxito), con su ícono. La región en vivo queda siempre montada para que
 * TalkBack anuncie el texto cuando aparece, sin interrumpir.
 */
export function AvisoPreferencias({ tono, texto }: Readonly<{ tono: 'peligro' | 'exito'; texto: string | null }>) {
  const { colores } = useTheme();
  const Icono = tono === 'peligro' ? CircleAlert : CircleCheck;
  const color = tono === 'peligro' ? colores.peligro : colores.exito;
  return (
    <View collapsable={false} accessibilityLiveRegion="polite">
      {texto ? (
        <View accessible style={styles.fila}>
          <View style={styles.icono} importantForAccessibility="no-hide-descendants">
            <Icono color={color} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          </View>
          <Text style={[styles.texto, { color }]}>{texto}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  icono: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.parrafo.linea - icono.tamanoPequeno) / 2,
  },
  texto: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
});
