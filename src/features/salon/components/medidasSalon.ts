import { espacio } from '@/shared/ui/tokens';

/**
 * Medidas propias de la pantalla El salón (GP-07.3). Sin colores: esos salen de useTheme().
 */
export const medidasSalon = {
  /** Imagen de Sobre nosotros en arco, como la de sobre-nosotros/page.tsx de la web (w-64, 4/5). */
  anchoArco: 256,
  proporcionArco: 4 / 5,
  /** Diámetro del punto que marca el día de hoy en el horario. */
  puntoHoy: espacio.s,
  /** Separación entre las secciones de la pantalla (32, como .mf-perfil de la web). */
  separacionSecciones: espacio.x3,
} as const;
