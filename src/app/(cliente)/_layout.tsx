import { Tabs } from 'expo-router';
import {
  CalendarDays,
  House,
  ShoppingCart,
  Store,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { Easing, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePiezasCarrito } from '@/features/tienda/viewmodels/usePiezasCarrito';
import { BotonPestana, IconoPestana, estiloIconoPestana } from '@/shared/ui/PestanaFranja';
import { curva, duracion, franja, fuente, pestanas, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

function iconoDe(Icono: LucideIcon) {
  return function IconoDePestana({ focused }: { focused: boolean }) {
    return <IconoPestana Icono={Icono} activo={focused} />;
  };
}

const iconoInicio = iconoDe(House);
const iconoCitas = iconoDe(CalendarDays);
// Carrito con el carrito de súper y Tienda con el escaparate: siluetas distintas que no se confunden.
const iconoTienda = iconoDe(Store);
const iconoPerfil = iconoDe(UserRound);

export default function ClienteLayout() {
  const { colores } = useTheme();
  const insets = useSafeAreaInsets();
  // 0 sin sesión: la pestaña queda sin número.
  const piezas = usePiezasCarrito();

  return (
    // La barra de estado clara la fija el layout raíz para toda la app.
    <Tabs
      screenOptions={{
        headerShown: false,
        // Fundido corto, nunca deslizamiento: las pestañas son pares, no una jerarquía.
        animation: 'fade',
        transitionSpec: {
          animation: 'timing',
          config: { duration: duracion.pestana, easing: Easing.bezier(...curva.salida) },
        },
        sceneStyle: { backgroundColor: colores.fondo },
        // Franja vino de la web en los dos temas, con íconos y etiquetas en marfil (10.85:1).
        tabBarActiveTintColor: colores.iconoActivo,
        tabBarInactiveTintColor: colores.iconoInactivo,
        tabBarStyle: {
          backgroundColor: colores.barraFondo,
          // Sin filete arriba: el vino ya separa la barra del contenido en claro y en oscuro.
          borderTopWidth: 0,
          height: franja.altoBarra + insets.bottom,
        },
        tabBarItemStyle: { minHeight: pestanas.altoItem },
        tabBarIconStyle: estiloIconoPestana,
        // Pastilla rosa (--hover) en la activa y marfil al 12 % al presionar, sin onda de Android.
        tabBarButton: BotonPestana,
        // Una sola línea: si el sistema agranda la fuente, la etiqueta se encoge en lugar de cortarse.
        tabBarLabel: ({ focused, children }) => (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={pestanas.escalaMinimaEtiqueta}
            maxFontSizeMultiplier={franja.escalaMaximaEtiqueta}
            style={{
              color: focused ? colores.textoActivo : colores.iconoInactivo,
              // La pastilla rosa contra el vino da 2.22:1: la activa también se distingue por el peso.
              fontFamily: focused ? fuente.textoFuerte : fuente.textoMedio,
              fontSize: tipo.pestana.tamano,
              lineHeight: tipo.pestana.linea,
            }}
          >
            {children}
          </Text>
        ),
      }}
    >
      <Tabs.Screen name="inicio" options={{ title: 'Inicio', tabBarIcon: iconoInicio }} />
      {/* La ruta sigue siendo `citas`; la pestaña se llama Servicios, como la sección de la web. */}
      <Tabs.Screen
        name="citas"
        options={{
          title: 'Servicios',
          tabBarIcon: iconoCitas,
          tabBarAccessibilityLabel: 'Servicios',
        }}
      />
      <Tabs.Screen
        name="carrito"
        options={{
          title: 'Carrito',
          // Contador vino con contorno marfil sobre el ícono; sin número con 0 piezas o sin sesión.
          tabBarIcon: ({ focused }) => (
            <IconoPestana Icono={ShoppingCart} activo={focused} contador={piezas} />
          ),
          // TalkBack lee el número completo en la etiqueta de la pestaña, no en el contador.
          tabBarAccessibilityLabel:
            piezas > 0 ? `Carrito, ${piezas === 1 ? '1 pieza' : `${piezas} piezas`}` : 'Carrito',
        }}
      />
      <Tabs.Screen name="tienda" options={{ title: 'Tienda', tabBarIcon: iconoTienda }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: iconoPerfil }} />
    </Tabs>
  );
}
