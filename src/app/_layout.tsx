import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import {
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { HojaBienvenida } from '@/features/auth/components/HojaBienvenida';
import { sesionCabecera } from '@/features/auth/viewmodels/sesionCabecera';
import { AuthProvider, useAuth } from '@/features/auth/viewmodels/useAuth';
import { SesionRequeridaProvider } from '@/features/auth/viewmodels/useRequiereSesion';
import { AvisoEnPantalla } from '@/features/notificaciones/components/AvisoEnPantalla';
import { useNoLeidos } from '@/features/notificaciones/viewmodels/avisosEstado';
import { useAvisosEnVivo } from '@/features/notificaciones/viewmodels/useAvisosEnVivo';
import { useCargaConfiguracion, useConfiguracionPublica } from '@/shared/api/useConfiguracionPublica';
import { SesionCabeceraProvider, type SesionCabecera } from '@/shared/ui/AccionesCabecera';
import { AparienciaProvider, useApariencia } from '@/shared/ui/apariencia';
import { FondoBarraEstado } from '@/shared/ui/FondoBarraEstado';
import { IntroGrieta } from '@/shared/ui/IntroGrieta';
import { useTheme } from '@/shared/ui/useTheme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Si el splash ya se ocultó no hay nada que mantener.
});

/**
 * Lo que la cabecera compartida sabe de la sesión (auth) más el número de avisos sin leer de la
 * campana (notificaciones). Constante de módulo: el valor del contexto nunca cambia.
 */
const sesionConAvisos: SesionCabecera = { ...sesionCabecera, useNoLeidos };

export default function RootLayout() {
  const [fuentesCargadas, errorFuentes] = useFonts({
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GreatVibes_400Regular,
  });
  // Con error de carga la app sigue con la fuente del sistema en lugar de quedarse en el splash.
  const fuentesListas = fuentesCargadas || errorFuentes != null;

  // La sesión se restaura en paralelo a la carga de fuentes.
  return (
    <AuthProvider>
      {/* La raíz compone shared y features: la cabecera compartida recibe la sesión de auth y los
          avisos sin leer de notificaciones. */}
      <SesionCabeceraProvider sesion={sesionConAvisos}>
        <AparienciaProvider>
          <Navegacion fuentesListas={fuentesListas} />
        </AparienciaProvider>
      </SesionCabeceraProvider>
    </AuthProvider>
  );
}

function Navegacion({ fuentesListas }: { fuentesListas: boolean }) {
  const { colores } = useTheme();
  const { estado, sesionVencida } = useAuth();
  const { lista: aparienciaLista } = useApariencia();
  const { navigate } = useRouter();
  const [introTerminada, setIntroTerminada] = useState(false);
  const terminarIntro = useCallback(() => setIntroTerminada(true), []);
  // La configuración del salón espera a lo más TIEMPO_MAXIMO_CARGA_MS; luego sigue con lo guardado.
  const configuracionLista = useCargaConfiguracion();
  // Montado en la raíz para refrescar la configuración al volver a primer plano.
  useConfiguracionPublica();
  // Avisos internos en vivo (GP-07.2): una sola conexión para toda la app, solo con sesión y con la
  // app en primer plano. Se monta aquí y en ningún otro lugar.
  useAvisosEnVivo(estado === 'autenticado');
  // La apariencia guardada se aplica antes de mostrar nada: sin parpadeo de tema.
  const listo = fuentesListas && estado !== 'cargando' && aparienciaLista && configuracionLista;

  // Si la sesión vence o el servidor la rechaza, la app queda en Inicio (las pantallas que
  // necesitan sesión salen solas de la pila por su guard).
  useEffect(() => {
    if (sesionVencida) {
      navigate('/inicio');
    }
  }, [sesionVencida, navigate]);

  useEffect(() => {
    if (listo) {
      SplashScreen.hideAsync().catch(() => {
        // El splash ya estaba oculto.
      });
    }
  }, [listo]);

  if (!listo) {
    return null;
  }

  return (
    <GestureHandlerRootView style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      {/* Íconos claros de la barra de estado en toda la app: siempre van sobre el cromo carbón. */}
      <StatusBar style="light" />
      <SesionRequeridaProvider>
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.fondo } }}
        >
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          {/* Las pestañas se ven siempre, con o sin sesión. */}
          <Stack.Screen name="(cliente)" />
          {/* El detalle de un servicio es público: se abre encima de las pestañas con o sin sesión. */}
          <Stack.Screen name="servicio/[id]" />
          {/* Mis citas es pública: sin sesión muestra la invitación a iniciar sesión. */}
          <Stack.Screen name="mis-citas" />
          {/* Tienda (GP-06.4): el detalle de un producto y Mis pedidos son públicos; sin sesión, Mis
              pedidos muestra la invitación a iniciar sesión. El carrito es una pestaña. */}
          <Stack.Screen name="producto/[id]" />
          <Stack.Screen name="mis-pedidos" />
          {/* Notificaciones se abre con la campana de Inicio, encima de las pestañas; sin sesión
              muestra la invitación a iniciar sesión. */}
          <Stack.Screen name="notificaciones" />
          {/* Acceso se abre encima de las pestañas y solo sin sesión: al iniciar sesión el guard lo
              saca de la pila y queda a la vista la pestaña donde estaba la clienta. */}
          <Stack.Protected guard={estado !== 'autenticado'}>
            <Stack.Screen
              name="(auth)"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
          </Stack.Protected>
          <Stack.Protected guard={estado === 'autenticado'}>
            <Stack.Screen name="editar-perfil" />
            <Stack.Screen name="cambiar-contrasena" />
            {/* Reserva, anticipo y confirmación (GP-06.2): solo con sesión. */}
            <Stack.Screen name="reservar/[servicioId]" />
            <Stack.Screen name="anticipo/[citaId]" />
            {/* Detalle de una cita de Mis citas, con reprogramar y cancelar (GP-06.3). */}
            <Stack.Screen name="cita/[id]" />
            <Stack.Screen name="cita/[id]/reprogramar" />
            <Stack.Screen name="cita-confirmada/[citaId]" options={{ gestureEnabled: false }} />
            {/* Compra en la tienda (GP-06.4): checkout, confirmación y detalle de un pedido. */}
            <Stack.Screen name="checkout" />
            <Stack.Screen name="pedido/[id]" />
            <Stack.Screen name="pedido-confirmado/[pedidoId]" options={{ gestureEnabled: false }} />
          </Stack.Protected>
        </Stack>
        <HojaBienvenida introTerminada={introTerminada} />
      </SesionRequeridaProvider>
      {/* Encima del Stack y debajo de la intro de la grieta (que ya es carbón). */}
      <FondoBarraEstado />
      {/* Aviso interno que llega en vivo: arriba, bajo la barra de estado, encima del Stack y debajo
          de la intro. Solo la tarjeta recibe toques. */}
      <AvisoEnPantalla />
      <IntroGrieta onTerminar={terminarIntro} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
});
