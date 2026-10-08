import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Hoja } from '@/shared/ui/Hoja';
import type { PreferenciaApariencia } from '@/shared/ui/preferencias';
import { espacio, fuente, icono, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

const OPCIONES: { valor: PreferenciaApariencia; etiqueta: string; detalle: string }[] = [
  { valor: 'sistema', etiqueta: 'Sistema', detalle: 'Sigue la configuración del teléfono' },
  { valor: 'claro', etiqueta: 'Claro', detalle: 'Lino y vino' },
  { valor: 'oscuro', etiqueta: 'Oscuro', detalle: 'Carbón y oro' },
];

interface HojaAparienciaProps {
  visible: boolean;
  preferencia: PreferenciaApariencia;
  onElegir: (preferencia: PreferenciaApariencia) => void;
  onCerrar: () => void;
}

/** Apariencia: Sistema, Claro u Oscuro. Se aplica al instante. */
export function HojaApariencia({ visible, preferencia, onElegir, onCerrar }: HojaAparienciaProps) {
  const { colores } = useTheme();
  return (
    <Hoja visible={visible} onCerrar={onCerrar} titulo="Apariencia">
      <View accessibilityRole="radiogroup" accessibilityLabel="Apariencia" style={styles.lista}>
        {OPCIONES.map((opcion) => {
          const elegida = opcion.valor === preferencia;
          return (
            <Pressable
              key={opcion.valor}
              accessibilityRole="radio"
              accessibilityLabel={`${opcion.etiqueta}. ${opcion.detalle}`}
              accessibilityState={{ checked: elegida }}
              onPress={() => onElegir(opcion.valor)}
              style={({ pressed }) => [
                styles.opcion,
                { backgroundColor: pressed ? colores.presionado : 'transparent' },
              ]}
            >
              <View style={styles.textos}>
                <Text style={[styles.etiqueta, { color: colores.texto }]}>{opcion.etiqueta}</Text>
                <Text style={[styles.detalle, { color: colores.textoSuave }]}>{opcion.detalle}</Text>
              </View>
              {elegida ? (
                <Check color={colores.foco} size={icono.tamanoPequeno} strokeWidth={icono.trazoMarca} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Hoja>
  );
}

const styles = StyleSheet.create({
  lista: {
    gap: espacio.xs,
  },
  opcion: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    paddingHorizontal: espacio.s,
    paddingVertical: espacio.s,
    borderRadius: radio.campo,
  },
  textos: {
    flex: 1,
  },
  etiqueta: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  detalle: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
});
