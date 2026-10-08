import { File as ArchivoLocal } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { CALIDAD_FOTO, LADO_MAXIMO_FOTO } from './PerfilModel';

export interface FotoPreparada {
  uri: string;
  /** Peso en bytes del JPEG resultante. */
  tamano: number;
}

/**
 * Deja la foto lista para subir: recorte cuadrado al centro (por si el recorte del sistema no
 * fue exacto), máximo 1024 px de lado y JPEG.
 */
export async function prepararFoto(uri: string, ancho: number, alto: number): Promise<FotoPreparada> {
  const contexto = ImageManipulator.manipulate(uri);
  try {
    const lado = Math.min(ancho, alto);
    if (ancho !== alto) {
      contexto.crop({
        originX: Math.floor((ancho - lado) / 2),
        originY: Math.floor((alto - lado) / 2),
        width: lado,
        height: lado,
      });
    }
    if (lado > LADO_MAXIMO_FOTO) {
      contexto.resize({ width: LADO_MAXIMO_FOTO, height: LADO_MAXIMO_FOTO });
    }
    const imagen = await contexto.renderAsync();
    try {
      const resultado = await imagen.saveAsync({ compress: CALIDAD_FOTO, format: SaveFormat.JPEG });
      return { uri: resultado.uri, tamano: new ArchivoLocal(resultado.uri).size };
    } finally {
      // La imagen decodificada vive en memoria nativa hasta liberarla.
      imagen.release();
    }
  } finally {
    contexto.release();
  }
}

/** Borra la copia temporal de la foto (no hace falta conservarla en el teléfono). */
export function borrarFotoTemporal(uri: string): void {
  try {
    const archivo = new ArchivoLocal(uri);
    if (archivo.exists) {
      archivo.delete();
    }
  } catch {
    // La caché del sistema la limpiará de todos modos.
  }
}
