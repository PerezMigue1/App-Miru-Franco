import { Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { transicionBorde } from '@/shared/ui/movimiento';
import { borde, espacio, fuente, icono, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface BuscadorProductosProps {
  valor: string;
  onCambiar: (texto: string) => void;
}

/**
 * Campo de búsqueda del catálogo con el aspecto de los campos de la marca: el borde toma el color
 * de foco en 140 ms al escribir y aparece un botón para borrar cuando hay texto.
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
      {valor ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda"
          onPress={() => onCambiar('')}
          style={styles.borrar}
        >
          <X color={colores.campoTexto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  buscador: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingLeft: espacio.l,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
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
