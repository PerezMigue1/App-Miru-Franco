import { espacio, monograma } from '@/shared/ui/tokens';

/**
 * Medidas propias de las secciones de contenido de Inicio (GP-07.3): promociones, equipo, preguntas
 * frecuentes y sobre nosotros. Sin colores: esos salen de useTheme().
 */
export const medidasInicio = {
  /** Ancho / alto de la imagen de una promoción. */
  proporcionPromocion: 16 / 9,
  /** Diámetro de la foto de una integrante del equipo: el del monograma mediano que la sustituye. */
  fotoEquipo: monograma.mediano,
  /** Imagen de Sobre nosotros en arco, como la de la web (aspect-[4/5], w-64). */
  anchoArco: 256,
  proporcionArco: 4 / 5,
  /** Alto del bloque del esqueleto de una sección mientras carga. */
  altoEsqueleto: 112,
  /** Separación entre el título de una sección y su descripción. */
  separacionDescripcion: espacio.s,
} as const;
