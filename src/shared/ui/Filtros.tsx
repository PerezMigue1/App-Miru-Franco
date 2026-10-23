import { Check, SlidersHorizontal } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from './Button';
import { Contador } from './Contador';
import { soloDigitos } from './digitos';
import { Input } from './Input';
import { transicionSeleccion, usePresion } from './movimiento';
import { PastillaFiltro } from './PastillaFiltro';
import { borde, casilla, espacio, fuente, icono, radio, tipo, toqueMinimo } from './tokens';
import { useTheme } from './useTheme';

/**
 * Piezas comunes del panel de filtros de Servicios y de Tienda (como el panel de filtros de la
 * web): el botón que lo abre, las secciones, los rangos mínimo y máximo, las casillas, las opciones
 * de selección múltiple y el pie con "Limpiar filtros" y "Aplicar".
 */

interface BotonFiltrosProps {
  /** Filtros aplicados: se muestran en un contador junto al texto. */
  activos: number;
  onPress: () => void;
}

/** Botón "Filtros" junto al buscador, con el mismo marco que el campo (.mf-campo). */
export function BotonFiltros({ activos, onPress }: BotonFiltrosProps) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={activos > 0 ? `Filtros, ${activos} activos` : 'Filtros'}
      accessibilityHint="Abre los filtros"
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      <Animated.View
        style={[
          styles.boton,
          { backgroundColor: colores.campoFondo, borderColor: colores.campoBorde },
          estilo,
        ]}
      >
        <SlidersHorizontal color={colores.campoTexto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        <Text style={[styles.textoBoton, { color: colores.campoTexto }]}>Filtros</Text>
        {activos > 0 ? <Contador valor={activos} /> : null}
      </Animated.View>
    </Pressable>
  );
}

/** Grupo de un filtro dentro de la hoja: título y su control. */
export function SeccionFiltro({ titulo, children }: { titulo: string; children: ReactNode }) {
  const { colores } = useTheme();
  return (
    <View style={styles.seccion}>
      <Text accessibilityRole="header" style={[styles.tituloSeccion, { color: colores.texto }]}>
        {titulo}
      </Text>
      {children}
    </View>
  );
}

interface RangoFiltroProps {
  etiquetaMinimo: string;
  etiquetaMaximo: string;
  /** Texto del campo (solo dígitos; '' sin límite). */
  minimo: string;
  maximo: string;
  onCambiarMinimo: (valor: string) => void;
  onCambiarMaximo: (valor: string) => void;
  placeholderMinimo?: string;
  placeholderMaximo?: string;
}

/** Mínimo y máximo lado a lado (precio, duración): campos numéricos que solo aceptan dígitos. */
export function RangoFiltro({
  etiquetaMinimo,
  etiquetaMaximo,
  minimo,
  maximo,
  onCambiarMinimo,
  onCambiarMaximo,
  placeholderMinimo = 'Mín',
  placeholderMaximo = 'Máx',
}: RangoFiltroProps) {
  return (
    <View style={styles.rango}>
      <View style={styles.mitad}>
        <Input
          etiqueta={etiquetaMinimo}
          tipo="numero"
          valor={minimo}
          placeholder={placeholderMinimo}
          onCambiar={(texto) => onCambiarMinimo(soloDigitos(texto))}
        />
      </View>
      <View style={styles.mitad}>
        <Input
          etiqueta={etiquetaMaximo}
          tipo="numero"
          valor={maximo}
          placeholder={placeholderMaximo}
          onCambiar={(texto) => onCambiarMaximo(soloDigitos(texto))}
        />
      </View>
    </View>
  );
}

interface CasillaFiltroProps {
  texto: string;
  activo: boolean;
  onCambiar: (activo: boolean) => void;
}

/** Casilla de verificación de una fila (48dp), como el checkbox del panel de filtros de la web. */
export function CasillaFiltro({ texto, activo, onCambiar }: CasillaFiltroProps) {
  const { colores } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: activo }}
      accessibilityLabel={texto}
      onPress={() => onCambiar(!activo)}
      style={({ pressed }) => [
        styles.casillaFila,
        { backgroundColor: pressed ? colores.presionado : colores.transparente },
      ]}
    >
      <Animated.View
        style={[
          styles.casilla,
          transicionSeleccion,
          activo
            ? { backgroundColor: colores.seleccion, borderColor: colores.seleccion }
            : { backgroundColor: colores.transparente, borderColor: colores.contorno },
        ]}
      >
        {activo ? (
          <Check color={colores.textoSobreSeleccion} size={icono.tamanoPequeno} strokeWidth={icono.trazoMarca} />
        ) : null}
      </Animated.View>
      <Text style={[styles.textoCasilla, { color: colores.texto }]}>{texto}</Text>
    </Pressable>
  );
}

interface OpcionesFiltroProps {
  opciones: readonly string[];
  /** Opciones elegidas (selección múltiple). */
  seleccionadas: readonly string[];
  onAlternar: (opcion: string) => void;
  /** Texto si no hay opciones en los datos cargados (por ejemplo, "Sin marcas en catálogo"). */
  vacio?: string;
}

/** Opciones de selección múltiple con las pastillas de filtro, en renglones que se acomodan solos. */
export function OpcionesFiltro({ opciones, seleccionadas, onAlternar, vacio }: OpcionesFiltroProps) {
  const { colores } = useTheme();
  if (opciones.length === 0) {
    return vacio ? <Text style={[styles.vacio, { color: colores.textoSuave }]}>{vacio}</Text> : null;
  }
  return (
    <View style={styles.opciones}>
      {opciones.map((opcion) => (
        <PastillaFiltro
          key={opcion}
          texto={opcion}
          activo={seleccionadas.includes(opcion)}
          onPress={() => onAlternar(opcion)}
        />
      ))}
    </View>
  );
}

interface PieFiltrosProps {
  /** Filtros elegidos en la hoja: con 0, "Limpiar filtros" se deshabilita. */
  activos: number;
  onLimpiar: () => void;
  onAplicar: () => void;
}

/** "Limpiar filtros" (secundario) y "Aplicar" (el único primario de la hoja). */
export function PieFiltros({ activos, onLimpiar, onAplicar }: PieFiltrosProps) {
  return (
    <View style={styles.pie}>
      <View style={styles.mitad}>
        <Button titulo="Limpiar filtros" variante="secundario" onPress={onLimpiar} deshabilitado={activos === 0} />
      </View>
      <View style={styles.mitad}>
        <Button titulo="Aplicar" onPress={onAplicar} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  boton: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingHorizontal: espacio.m,
    borderRadius: radio.campo,
    borderWidth: borde.entrada,
  },
  textoBoton: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  seccion: {
    gap: espacio.s,
  },
  tituloSeccion: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  rango: {
    flexDirection: 'row',
    gap: espacio.m,
  },
  mitad: {
    flex: 1,
  },
  casillaFila: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    borderRadius: radio.campo,
  },
  casilla: {
    width: casilla.tamano,
    height: casilla.tamano,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.casilla,
    borderWidth: borde.campo,
  },
  textoCasilla: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  opciones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacio.s,
  },
  vacio: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  pie: {
    flexDirection: 'row',
    gap: espacio.m,
  },
});
