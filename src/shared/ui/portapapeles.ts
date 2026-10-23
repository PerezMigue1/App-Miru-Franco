import { setStringAsync } from 'expo-clipboard';

/**
 * Copia un texto al portapapeles del teléfono con expo-clipboard. Nunca lanza: devuelve false si el
 * teléfono no lo permitió (o el módulo nativo no está), y quien la usa deja el texto a la vista para
 * copiarlo a mano.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    return await setStringAsync(texto);
  } catch {
    return false;
  }
}
