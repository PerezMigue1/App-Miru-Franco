import { Stack } from 'expo-router';

import { useTheme } from '@/shared/ui/useTheme';

export default function AuthLayout() {
  const { colores } = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.fondo } }}
    />
  );
}
