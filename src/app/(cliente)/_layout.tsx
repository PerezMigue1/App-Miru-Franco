import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  CalendarDays,
  House,
  ShoppingCart,
  Store,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { Easing, Text, type ColorValue } from 'react-native';

import { usePiezasCarrito } from '@/features/tienda/viewmodels/usePiezasCarrito';
import {
  borde,
  curva,
  duracion,
  fuente,
  icono,
  pestanas,
  tiendaCatalogo,
  tipo,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

function iconoDe(Icono: LucideIcon) {
  return function IconoPestana({ color }: { color: ColorValue }) {
    return (
      <Icono
        color={typeof color === 'string' ? color : undefined}
        size={icono.tamano}
        strokeWidth={icono.trazo}
      />
    );
  };
}

const iconoInicio = iconoDe(House);
const iconoCitas = iconoDe(CalendarDays);
// Carrito con el carrito de súper y Tienda con el escaparate: siluetas distintas que no se confunden.
const iconoCarrito = iconoDe(ShoppingCart);
const iconoTienda = iconoDe(Store);
const iconoPerfil = iconoDe(UserRound);

/** Cifra del número del Carrito: sin número con 0 piezas o sin sesión; "99+" arriba de 99. */
function cifraPiezas(piezas: number): string | undefined {
  if (piezas <= 0) {
    return undefined;
  }
  return piezas > tiendaCatalogo.maximoPiezasVisibles
    ? `${tiendaCatalogo.maximoPiezasVisibles}+`
    : String(piezas);
}

export default function ClienteLayout() {
  const { colores } = useTheme();
  // 0 sin sesión: la pestaña queda sin número.
  const piezas = usePiezasCarrito();

  return (
    <>
      <StatusBar style="auto" />
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
          tabBarActiveTintColor: colores.iconoActivo,
          tabBarInactiveTintColor: colores.iconoInactivo,
          tabBarStyle: {
            backgroundColor: colores.barraFondo,
            borderTopColor: colores.hairline,
            borderTopWidth: borde.hairline,
          },
          tabBarItemStyle: { minHeight: pestanas.altoItem, paddingVertical: pestanas.relleno },
          // Una sola línea: si el sistema agranda la fuente, la etiqueta se encoge en lugar de cortarse.
          tabBarLabel: ({ focused, children }) => (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={pestanas.escalaMinimaEtiqueta}
              style={{
                // Etiqueta activa como --nav-activo-texto de la web (vino en claro, blanco en oscuro).
                color: focused ? colores.textoActivo : colores.iconoInactivo,
                // La pestaña activa no depende solo del color: también sube de peso.
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
        <Tabs.Screen name="citas" options={{ title: 'Citas', tabBarIcon: iconoCitas }} />
        <Tabs.Screen
          name="carrito"
          options={{
            title: 'Carrito',
            tabBarIcon: iconoCarrito,
            tabBarBadge: cifraPiezas(piezas),
            // Colores de la barra: lino sobre vino (7.6:1) en claro y carbón medio sobre oro (6:1) en oscuro.
            tabBarBadgeStyle: {
              backgroundColor: colores.iconoActivo,
              color: colores.barraFondo,
              fontFamily: fuente.textoFuerte,
              fontSize: tiendaCatalogo.cifraPastilla.tamano,
              fontVariant: ['tabular-nums'],
            },
            // El número vive en un círculo de alto fijo: no crece con la fuente del sistema para no
            // cortarse. TalkBack lo lee completo en la etiqueta de la pestaña.
            tabBarAllowFontScaling: false,
            tabBarAccessibilityLabel:
              piezas > 0 ? `Carrito, ${piezas === 1 ? '1 pieza' : `${piezas} piezas`}` : 'Carrito',
          }}
        />
        <Tabs.Screen name="tienda" options={{ title: 'Tienda', tabBarIcon: iconoTienda }} />
        <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: iconoPerfil }} />
      </Tabs>
    </>
  );
}
