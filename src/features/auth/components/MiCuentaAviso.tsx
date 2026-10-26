import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useEntradaContenido } from '@/shared/ui/movimiento';
import { borde, espacio, fuente, icono, insignia, radio, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

/** peligro: un error; exito: algo salió bien; irreversible: lo que pasa al confirmar la baja. */
export type TonoMiCuenta = 'peligro' | 'exito' | 'irreversible';

const ICONOS: Record<TonoMiCuenta, LucideIcon> = {
  peligro: CircleAlert,
  exito: CircleCheck,
  irreversible: TriangleAlert,
};

interface MiCuentaAvisoProps {
  tono: TonoMiCuenta;
  texto: string | null;
}

/**
 * Aviso de Mi cuenta con el lenguaje de las insignias (.mf-badge): base teñida del color del estado,
 * filete del mismo color al 30 % y texto oscuro de su familia (peligro: 8.9:1 en claro y 5.6:1 en
 * oscuro; éxito: 7:1 o más y 4.7:1 o más). Los de error y éxito viven en una región en vivo cortés
 * siempre montada, para que TalkBack los anuncie al aparecer; el irreversible es fijo y se lee en
 * orden, sin anunciarse.
 */
export function MiCuentaAviso({ tono, texto }: MiCuentaAvisoProps) {
  const { oscuro } = useTheme();
  const entrada = useEntradaContenido();
  const familia = tono === 'exito' ? 'exito' : 'peligro';
  const colores = (oscuro ? insignia.oscuro : insignia.claro)[familia];
  const Icono = ICONOS[tono];
  const panel = texto ? (
    <Animated.View
      accessible
      entering={entrada}
      style={[styles.panel, { backgroundColor: colores.fondo, borderColor: insignia.borde[familia] }]}
    >
      <View style={styles.icono} importantForAccessibility="no-hide-descendants">
        <Icono color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </View>
      <Text style={[styles.texto, { color: colores.texto }]}>{texto}</Text>
    </Animated.View>
  ) : null;

  if (tono === 'irreversible') {
    return panel;
  }
  return (
    <View collapsable={false} accessibilityLiveRegion="polite" style={texto ? null : styles.fueraDeFlujo}>
      {panel}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
    padding: espacio.l,
    borderRadius: radio.campo,
    borderWidth: borde.hairline,
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
  // La región en vivo vacía queda fuera del flujo: no suma espacio.
  fueraDeFlujo: {
    position: 'absolute',
  },
});
