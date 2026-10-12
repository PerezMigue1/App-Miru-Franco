import type { BottomTabBarButtonProps } from 'expo-router/tabs';
import type { LucideIcon } from 'lucide-react-native';
import { createContext, useContext } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Contador } from './Contador';
import { borde, espacio, franja, icono, radio } from './tokens';
import { useTheme } from './useTheme';

/**
 * Pestañas de la barra inferior como la franja vino de navegación de la web (MenuHorizontal.tsx y
 * .mf-nav-pildora de cliente.css): la pestaña activa vive en una pastilla rosa (--hover, ícono
 * marfil encima a 4.88:1) y la presionada se aclara un poco. La pastilla envuelve solo al ícono,
 * como el indicador de las barras de Android: con cinco pestañas a 360 dp cada una mide 72 dp de
 * ancho y una pastilla horizontal con ícono y etiqueta (16 + 6 + "Servicios" en 14) pasaría de
 * 100 dp. La etiqueta queda debajo, marfil sobre el vino (10.85:1).
 */

/** Si el botón de la pestaña está presionado: lo lee la pastilla, que vive dentro del botón. */
const PresionPestana = createContext(false);

/**
 * Botón de cada pestaña (`tabBarButton`). Conserva todo lo que manda la barra (rol, selección,
 * etiqueta accesible, onPress) y solo cambia la respuesta al tocar: en lugar de la onda de
 * Android, la pastilla toma el marfil al 12 % mientras el dedo está encima.
 */
export function BotonPestana({
  children,
  style,
  onPress,
  // Propios de PlatformPressable (enlace web, onda, opacidad y hover): aquí no aplican.
  ref: _ref,
  href: _href,
  android_ripple: _ripple,
  pressColor: _pressColor,
  pressOpacity: _pressOpacity,
  hoverEffect: _hoverEffect,
  ...resto
}: BottomTabBarButtonProps) {
  return (
    <Pressable {...resto} onPress={onPress} style={[style, styles.boton]}>
      {({ pressed }) => (
        <PresionPestana.Provider value={pressed}>{children}</PresionPestana.Provider>
      )}
    </Pressable>
  );
}

interface IconoPestanaProps {
  Icono: LucideIcon;
  /** La barra pinta el ícono dos veces (activo e inactivo) y muestra uno: este dice cuál es. */
  activo: boolean;
  /** Número opcional sobre el ícono (piezas del carrito). */
  contador?: number;
}

/** Ícono de la pestaña dentro de su pastilla. Va en `tabBarIcon` junto con `tabBarIconStyle`. */
export function IconoPestana({ Icono, activo, contador = 0 }: IconoPestanaProps) {
  const { colores } = useTheme();
  const presionada = useContext(PresionPestana);

  const fondo = activo
    ? colores.franjaPastilla
    : presionada
      ? colores.franjaPresionada
      : colores.transparente;

  return (
    <View
      style={[
        styles.pastilla,
        {
          backgroundColor: fondo,
          // Anillo interior de 1px (box-shadow inset de la web) solo en la activa.
          borderColor: activo ? colores.franjaAnillo : colores.transparente,
        },
      ]}
    >
      <Icono
        color={activo ? colores.iconoActivo : colores.iconoInactivo}
        size={icono.tamano}
        strokeWidth={icono.trazo}
      />
      <Contador valor={contador} estilo={styles.contador} />
    </View>
  );
}

/** Medida del contenedor del ícono que arma la barra: la de la pastilla. */
export const estiloIconoPestana = { width: franja.pastillaAncho, height: franja.pastillaAlto };

const styles = StyleSheet.create({
  boton: {
    justifyContent: 'center',
    paddingVertical: espacio.xs,
    gap: franja.separacionEtiqueta,
  },
  pastilla: {
    width: franja.pastillaAncho,
    height: franja.pastillaAlto,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Arriba a la derecha del ícono, como en la cabecera de la web: se encima en la esquina del
  // trazo sin taparlo. Con "99+" crece hacia la derecha, dentro del ancho de la pestaña.
  contador: {
    position: 'absolute',
    top: franja.contadorArriba,
    left: '50%',
    marginLeft: franja.contadorDesfase,
  },
});
