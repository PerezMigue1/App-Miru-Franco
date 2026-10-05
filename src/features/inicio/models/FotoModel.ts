import type { Servicio } from './inicioService';

/** Una foto de la galería: siempre sale de un servicio real (GET /api/servicios). */
export interface FotoGaleria {
  url: string;
  servicioId: string | number;
  servicio: string;
  categoria?: string;
}

/**
 * Fotos de trabajo del salón: la imagen de cada servicio activo, sin repetir. Sin fotos devuelve []
 * y la pantalla muestra un estado vacío; nunca imágenes de relleno.
 */
export function fotosDeServicios(servicios: Servicio[]): FotoGaleria[] {
  const vistas = new Set<string>();
  const fotos: FotoGaleria[] = [];
  for (const servicio of servicios) {
    const url = servicio.imagen;
    if (servicio.activo === false || !url || vistas.has(url)) {
      continue;
    }
    vistas.add(url);
    fotos.push({
      url,
      servicioId: servicio.id,
      servicio: servicio.nombre,
      categoria: servicio.categoria,
    });
  }
  return fotos;
}
