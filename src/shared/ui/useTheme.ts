import { useColorScheme } from 'react-native';

import { useApariencia } from './apariencia';
import { temaClaro, temaOscuro, type Colores } from './tokens';

export interface Tema {
  oscuro: boolean;
  colores: Colores;
}

/**
 * Tema activo: la apariencia elegida en Perfil (Claro u Oscuro) o, con Sistema, la preferencia del
 * teléfono (DESIGN.md: el modo oscuro la sigue).
 */
export function useTheme(): Tema {
  const sistema = useColorScheme();
  const { preferencia } = useApariencia();
  const oscuro = preferencia === 'oscuro' || (preferencia === 'sistema' && sistema === 'dark');
  return { oscuro, colores: oscuro ? temaOscuro : temaClaro };
}
