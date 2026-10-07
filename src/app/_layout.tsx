import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import {
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { HojaBienvenida } from '@/features/auth/components/HojaBienvenida';
import { AuthProvider, useAuth } from '@/features/auth/viewmodels/useAuth';
import { SesionRequeridaProvider } from '@/features/auth/viewmodels/useRequiereSesion';
import { AparienciaProvider, useApariencia } from '@/shared/ui/apariencia';
import { IntroGrieta } from '@/shared/ui/IntroGrieta';
import { useTheme } from '@/shared/ui/useTheme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Si el splash ya se ocultó no hay nada que mantener.
});

export default function RootLayout() {
  const [fuentesCargadas, errorFuentes] = useFonts({
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GreatVibes_400Regular,
  });
  // Con error de carga la app sigue con la fuente del sistema en lugar de quedarse en el splash.
  const fuentesListas = fuentesCargadas || errorFuentes != null;

  // La sesión se restaura en paralelo a la carga de fuentes.
  return (
    <AuthProvider>
      <AparienciaProvider>
        <Navegacion fuentesListas={fuentesListas} />
      </AparienciaProvider>
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
  // La apariencia guardada se aplica antes de mostrar nada: sin parpadeo de tema.
  const listo = fuentesListas && estado !== 'cargando' && aparienciaLista;

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
      <SesionRequeridaProvider>
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.fondo } }}
        >
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          {/* Las pestañas se ven siempre, con o sin sesión. */}
          <Stack.Screen name="(cliente)" />
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
          </Stack.Protected>
        </Stack>
        <HojaBienvenida introTerminada={introTerminada} />
      </SesionRequeridaProvider>
      <IntroGrieta onTerminar={terminarIntro} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
});
