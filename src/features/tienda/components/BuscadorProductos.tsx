import { Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { transicionBorde, usePresion } from '@/shared/ui/movimiento';
import { borde, espacio, fuente, icono, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface BuscadorProductosProps {
  valor: string;
  onCambiar: (texto: string) => void;
}

/**
 * Campo de búsqueda del catálogo con el aspecto de .mf-campo de la web: borde de 1px, esquinas de
 * 10, y al enfocar el borde toma el color de foco en 140 ms con su halo de 3px. Aparece un botón
 * para borrar cuando hay texto.
 */
export function BuscadorProductos({ valor, onCambiar }: BuscadorProductosProps) {
  const { colores } = useTheme();
  // Solo apariencia del campo: el texto buscado vive en el viewmodel.
  const [enfocado, setEnfocado] = useState(false);

  return (
    <Animated.View
      style={[
        styles.buscador,
        transicionBorde,
        {
          backgroundColor: colores.campoFondo,
          borderColor: enfocado ? colores.foco : colores.campoBorde,
        },
        // Halo del foco como .mf-campo:focus (3px de --mf-foco al 22 %).
        enfocado ? { boxShadow: `0 0 0 3px ${colores.focoHalo}` } : null,
      ]}
    >
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Search color={colores.campoPlaceholder} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </View>
      <TextInput
        value={valor}
        onChangeText={onCambiar}
        placeholder="Buscar productos"
        placeholderTextColor={colores.campoPlaceholder}
        accessibilityLabel="Buscar productos por nombre, marca o categoría"
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        selectionColor={colores.foco}
        cursorColor={colores.foco}
        style={[styles.entrada, { color: colores.campoTexto }, valor ? null : styles.entradaSinBorrar]}
      />
      {valor ? <BotonBorrar onPress={() => onCambiar('')} /> : null}
    </Animated.View>
  );
}

/** Borra la búsqueda: se hunde a 0.97 al tocarlo como cualquier botón. */
function BotonBorrar({ onPress }: { onPress: () => void }) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Borrar búsqueda"
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      <Animated.View style={[styles.borrar, estilo]}>
        <X color={colores.campoTexto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buscador: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingLeft: espacio.l,
    borderRadius: radio.campo,
    borderWidth: borde.entrada,
  },
  entrada: {
    flex: 1,
    minHeight: toqueMinimo,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
  },
  entradaSinBorrar: {
    paddingRight: espacio.l,
  },
  borrar: {
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
