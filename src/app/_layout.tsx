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

import { IntroGrieta } from '@/shared/ui/IntroGrieta';
import { useTheme } from '@/shared/ui/useTheme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Si el splash ya se ocultó no hay nada que mantener.
});

export default function RootLayout() {
  const { colores } = useTheme();
  const [fuentesCargadas, errorFuentes] = useFonts({
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GreatVibes_400Regular,
  });
  // Con error de carga la app sigue con la fuente del sistema en lugar de quedarse en el splash.
  const listo = fuentesCargadas || errorFuentes != null;

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
      />
      <IntroGrieta />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
});
