import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Bell,
  CalendarDays,
  House,
  ShoppingBag,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { Easing, type ColorValue } from 'react-native';

import { borde, curva, duracion, fuente, icono, pestanas, tipo } from '@/shared/ui/tokens';
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
const iconoTienda = iconoDe(ShoppingBag);
const iconoNotificaciones = iconoDe(Bell);
const iconoPerfil = iconoDe(UserRound);

export default function ClienteLayout() {
  const { colores } = useTheme();

  return (
    <>
      <StatusBar style="auto" />
      <Tabs
        screenOptions={{
          headerShown: false,
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
          tabBarLabelStyle: {
            fontFamily: fuente.textoMedio,
            fontSize: tipo.pestana.tamano,
            lineHeight: tipo.pestana.linea,
          },
        }}
      >
        <Tabs.Screen name="inicio" options={{ title: 'Inicio', tabBarIcon: iconoInicio }} />
        <Tabs.Screen name="citas" options={{ title: 'Citas', tabBarIcon: iconoCitas }} />
        <Tabs.Screen name="tienda" options={{ title: 'Tienda', tabBarIcon: iconoTienda }} />
        <Tabs.Screen
          name="notificaciones"
          options={{ title: 'Notificaciones', tabBarIcon: iconoNotificaciones }}
        />
        <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: iconoPerfil }} />
      </Tabs>
    </>
  );
}
