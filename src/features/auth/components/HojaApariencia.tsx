import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Hoja } from '@/shared/ui/Hoja';
import type { PreferenciaApariencia } from '@/shared/ui/preferencias';
import { espacio, fuente, icono, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { useTextosAuth, type TextosAuth } from '../viewmodels/textosAuth';

/** Las tres opciones con sus textos del catálogo. */
function opciones({ apariencia }: TextosAuth): { valor: PreferenciaApariencia; etiqueta: string; detalle: string }[] {
  return [
    { valor: 'sistema', etiqueta: apariencia.sistema, detalle: apariencia.sistemaDetalle },
    { valor: 'claro', etiqueta: apariencia.claro, detalle: apariencia.claroDetalle },
    { valor: 'oscuro', etiqueta: apariencia.oscuro, detalle: apariencia.oscuroDetalle },
  ];
}

interface HojaAparienciaProps {
  visible: boolean;
  preferencia: PreferenciaApariencia;
  onElegir: (preferencia: PreferenciaApariencia) => void;
  onCerrar: () => void;
}

/** Apariencia: Sistema, Claro u Oscuro. Se aplica al instante. */
export function HojaApariencia({ visible, preferencia, onElegir, onCerrar }: HojaAparienciaProps) {
  const { colores } = useTheme();
  const textos = useTextosAuth();
  return (
    <Hoja visible={visible} onCerrar={onCerrar} titulo={textos.apariencia.titulo}>
      <View accessibilityRole="radiogroup" accessibilityLabel={textos.apariencia.titulo} style={styles.lista}>
        {opciones(textos).map((opcion) => {
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
                { backgroundColor: pressed ? colores.presionado : colores.transparente },
              ]}
            >
              <View style={styles.textos}>
                <Text style={[styles.etiqueta, { color: colores.texto }]}>{opcion.etiqueta}</Text>
                <Text style={[styles.detalle, { color: colores.textoCuerpo }]}>{opcion.detalle}</Text>
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
