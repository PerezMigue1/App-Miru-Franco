import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Children, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from './movimiento';
import { borde, espacio, fuente, icono, opacidad, pantalla, perfil, radio, sombra, tipo } from './tokens';
import { useTheme } from './useTheme';

/**
 * Sección de filas del perfil, como el portal de clientas de la web (.mf-perfil-fila): título de
 * sección opcional y una tarjeta sin relleno con divisores de 1px entre filas.
 */
export function SeccionFilas({
  titulo,
  estilo,
  children,
}: {
  titulo?: string;
  /** Separación respecto a lo de arriba (la pantalla decide el ritmo entre secciones). */
  estilo?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { colores } = useTheme();
  // Las filas condicionales llegan como null: solo se cuentan las que se pintan.
  const filas = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.seccion, estilo]}>
      {titulo ? (
        <Text accessibilityRole="header" style={[styles.tituloSeccion, { color: colores.textoSuave }]}>
          {titulo}
        </Text>
      ) : null}
      <View
        style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}
      >
        {filas.map((fila, indice) => (
          <View key={fila.key ?? indice}>
            {indice > 0 ? <View style={[styles.divisor, { backgroundColor: colores.hairline }]} /> : null}
            {fila}
          </View>
        ))}
      </View>
    </View>
  );
}

interface FilaTarjetaProps {
  icono: LucideIcon;
  titulo: string;
  /** Una línea que dice qué hay detrás de la fila. */
  descripcion: string;
  onPress?: () => void;
  /** Acción destructiva (Cerrar sesión): título e ícono en color de peligro, sin flecha. */
  destructiva?: boolean;
  /** No disponible: atenuada, sin flecha y anunciada como deshabilitada. */
  deshabilitada?: boolean;
  accessibilityHint?: string;
}

/**
 * Fila de la tarjeta: ícono en un cuadrito, título, descripción y flecha. Al presionarla, su
 * contenido se hunde como un botón (140 ms); no se tiñe el fondo porque el título sobre la
 * terracota teñida baja de 4.5:1.
 */
export function FilaTarjeta({
  icono: Icono,
  titulo,
  descripcion,
  onPress,
  destructiva = false,
  deshabilitada = false,
  accessibilityHint,
}: FilaTarjetaProps) {
  const { colores } = useTheme();
  const { estilo: estiloPresion, hundir, soltar } = usePresion();
  const colorTitulo = destructiva ? colores.peligro : colores.texto;
  const colorIcono = destructiva ? colores.peligro : colores.oroTexto;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titulo}, ${descripcion}`}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: deshabilitada }}
      disabled={deshabilitada}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
      style={[styles.fila, deshabilitada ? styles.deshabilitada : null]}
    >
      <Animated.View style={[styles.contenido, estiloPresion]}>
        <IconoYTextos icono={Icono} titulo={titulo} descripcion={descripcion} colorTitulo={colorTitulo} colorIcono={colorIcono} />
        {destructiva || deshabilitada ? null : (
          <ChevronRight color={colores.textoSuave} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        )}
      </Animated.View>
    </Pressable>
  );
}

/** Cuadrito con el ícono, título y descripción: lo comparten las filas de la tarjeta. */
function IconoYTextos({
  icono: Icono,
  titulo,
  descripcion,
  colorTitulo,
  colorIcono,
}: {
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
  colorTitulo: string;
  colorIcono: string;
}) {
  const { colores } = useTheme();
  return (
    <>
      <View style={[styles.cuadrito, { backgroundColor: colores.cuadritoIcono }]}>
        <Icono color={colorIcono} size={perfil.icono} strokeWidth={icono.trazo} />
      </View>
      <View style={styles.textos}>
        <Text style={[styles.titulo, { color: colorTitulo }]}>{titulo}</Text>
        <Text style={[styles.descripcion, { color: colores.textoSuave }]}>{descripcion}</Text>
      </View>
    </>
  );
}

interface FilaInterruptorProps {
  icono: LucideIcon;
  titulo: string;
  /** Una línea que dice qué pasa con el interruptor como está. */
  descripcion: string;
  encendido: boolean;
  onCambiar: (encendido: boolean) => void;
  /** Aún no se puede cambiar (por ejemplo, mientras se lee): atenuada y anunciada como deshabilitada. */
  deshabilitada?: boolean;
}

/**
 * Fila con un interruptor nativo (Switch) a la derecha. Toda la fila es el objetivo táctil (48dp o
 * más) y se anuncia como un solo "switch" con su estado; el Switch no recibe el foco aparte. Colores
 * con 3:1 o más contra la tarjeta en claro y oscuro: encendido en el color de foco (vino u oro),
 * apagado en el texto suave y la perilla en el fondo de los campos.
 */
export function FilaInterruptor({
  icono: Icono,
  titulo,
  descripcion,
  encendido,
  onCambiar,
  deshabilitada = false,
}: FilaInterruptorProps) {
  const { colores } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={titulo}
      accessibilityHint={descripcion}
      accessibilityState={{ checked: encendido, disabled: deshabilitada }}
      disabled={deshabilitada}
      onPress={() => onCambiar(!encendido)}
      style={[styles.fila, deshabilitada ? styles.deshabilitada : null]}
    >
      <View style={styles.contenido}>
        <IconoYTextos
          icono={Icono}
          titulo={titulo}
          descripcion={descripcion}
          colorTitulo={colores.texto}
          colorIcono={colores.oroTexto}
        />
        <Switch
          value={encendido}
          onValueChange={onCambiar}
          disabled={deshabilitada}
          trackColor={{ false: colores.textoSuave, true: colores.foco }}
          thumbColor={colores.campoFondo}
          ios_backgroundColor={colores.textoSuave}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  seccion: {
    gap: espacio.m,
    marginHorizontal: pantalla.margen,
  },
  tituloSeccion: {
    fontFamily: fuente.textoFuerte,
    fontSize: perfil.tituloSeccion.tamano,
    lineHeight: perfil.tituloSeccion.linea,
  },
  tarjeta: {
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  divisor: {
    height: borde.hairline,
  },
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
  deshabilitada: {
    opacity: opacidad.deshabilitado,
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
  },
  titulo: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  descripcion: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
