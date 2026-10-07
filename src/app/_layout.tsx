import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import {
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/features/auth/viewmodels/useAuth';
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
      <Navegacion fuentesListas={fuentesListas} />
    </AuthProvider>
  );
}

function Navegacion({ fuentesListas }: { fuentesListas: boolean }) {
  const { colores } = useTheme();
  const { estado } = useAuth();
  const listo = fuentesListas && estado !== 'cargando';

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
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.fondo } }}
      >
        <Stack.Screen name="index" />
        {/* Acceso solo sin sesión; las pestañas solo con sesión. */}
        <Stack.Protected guard={estado === 'anonimo'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={estado === 'autenticado'}>
          <Stack.Screen name="(cliente)" />
        </Stack.Protected>
      </Stack>
      <IntroGrieta />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
});
