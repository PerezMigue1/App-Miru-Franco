import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/** Medidas fijas de un teléfono ficticio, sin muescas. */
const MEDIDAS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Monta componentes sueltos que usan useSafeAreaInsets (por ejemplo, Hoja). */
export function ConAreaSegura({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={MEDIDAS}>{children}</SafeAreaProvider>;
}
