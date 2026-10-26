import { CalendarDays, ChevronRight, CircleAlert, Package, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import { espacio, fuente, icono, perfil, radio, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { PendienteVista } from '../viewmodels/useMiCuentaViewModel';

const ICONOS: Record<'cita' | 'pedido' | 'otro', LucideIcon> = {
  cita: CalendarDays,
  pedido: Package,
  otro: CircleAlert,
};

/**
 * Una cita o un pedido de la revisión de Mi cuenta, dentro de una SeccionFilas. Si se puede abrir,
 * toda la fila es un botón de 48dp o más que dice a dónde lleva (pista visible y accessibilityHint)
 * y se hunde al presionarla (140 ms); si no, es solo texto.
 */
export function PendienteFila({ pendiente }: { pendiente: PendienteVista }) {
  const { colores } = useTheme();
  const { estilo: estiloPresion, hundir, soltar } = usePresion();
  const { mensaje, entidad, destino } = pendiente;
  const Icono = ICONOS[entidad ?? 'otro'];
  const cuadrito = (
    <View style={[styles.cuadrito, { backgroundColor: colores.cuadritoIcono }]}>
      <Icono color={colores.oroTexto} size={perfil.icono} strokeWidth={icono.trazo} />
    </View>
  );

  if (!destino) {
    return (
      <View accessible style={[styles.fila, styles.contenido]}>
        {cuadrito}
        <View style={styles.textos}>
          <Text style={[styles.mensaje, { color: colores.texto }]}>{mensaje}</Text>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={mensaje}
      accessibilityHint={destino.pista}
      onPress={destino.abrir}
      onPressIn={hundir}
      onPressOut={soltar}
      style={styles.fila}
    >
      <Animated.View style={[styles.contenido, estiloPresion]}>
        {cuadrito}
        <View style={styles.textos}>
          <Text style={[styles.mensaje, { color: colores.texto }]}>{mensaje}</Text>
          <Text style={[styles.pista, { color: colores.textoSuave }]}>{destino.pista}</Text>
        </View>
        <ChevronRight color={colores.textoSuave} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: {
    minHeight: perfil.altoFila,
    justifyContent: 'center',
    paddingVertical: perfil.rellenoFila,
    paddingHorizontal: espacio.xl,
  },
  contenido: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.l,
  },
  cuadrito: {
    width: perfil.cuadrito,
    height: perfil.cuadrito,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.campo,
  },
  textos: {
    flex: 1,
    gap: espacio.xxs,
  },
  mensaje: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  pista: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
