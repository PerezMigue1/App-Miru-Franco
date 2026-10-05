import { useColorScheme } from 'react-native';

import { temaClaro, temaOscuro, type Colores } from './tokens';

export interface Tema {
  oscuro: boolean;
  colores: Colores;
}

/** Tema activo según la preferencia del sistema (DESIGN.md: el modo oscuro la sigue). */
export function useTheme(): Tema {
  const oscuro = useColorScheme() === 'dark';
  return { oscuro, colores: oscuro ? temaOscuro : temaClaro };
}
