import type { FotoGaleriaSalon } from '@/features/salon/models/contenidoSalonModel';

/**
 * Una foto de la galería "Nuestro trabajo" de Inicio, lista para pintar. Sale de GET /api/galeria
 * (Admin > Galería, ya normalizada por contenidoSalonModel): solo fotos reales, nunca relleno.
 */
export interface FotoGaleria {
  id: number;
  url: string;
  /** Texto alternativo: accessibilityLabel de la miniatura y de la foto en el visor. */
  alt: string;
  /** Nombre del servicio de la foto, o null si no está ligada a uno. */
  servicio: string | null;
  /** Categoría del servicio, o null. */
  categoria: string | null;
  /** Detalle del servicio en la app ("/servicio/12"), o null si la foto no tiene servicio. */
  rutaServicio: string | null;
}

/** Las fotos de la galería en su orden, con la ruta del servicio de cada una. */
export function fotosDeGaleria(fotos: FotoGaleriaSalon[]): FotoGaleria[] {
  return fotos.map(({ id, url, alt, servicio }) => ({
    id,
    url,
    alt,
    servicio: servicio?.nombre ?? null,
    categoria: servicio?.categoria ? servicio.categoria : null,
    rutaServicio: servicio ? `/servicio/${encodeURIComponent(String(servicio.id))}` : null,
  }));
}
