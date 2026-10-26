/**
 * Android 13 (API 33) trae el selector de fotos del sistema (Photo Picker): la clienta elige una
 * foto sin dar a la app acceso a toda su galería, así que no se pide ningún permiso.
 */
export const API_SELECTOR_SIN_PERMISO = 33;

/**
 * true si la galería se abre directo, sin pedir permiso (Android 13 o más nuevo). Recibe el sistema y
 * su versión (Platform.OS y Platform.Version): el modelo no depende de react-native.
 */
export function galeriaSinPermiso(sistema: string, version: number | string): boolean {
  return sistema === 'android' && Number(version) >= API_SELECTOR_SIN_PERMISO;
}

/**
 * Qué pasó al pedir el permiso de fotos: concedido; negado para siempre (el teléfono ya no lo vuelve
 * a preguntar y solo queda abrir los ajustes); o negado esta vez (se puede volver a pedir).
 */
export type ResultadoPermisoGaleria = 'concedido' | 'negadoParaSiempre' | 'negado';

export function resultadoPermisoGaleria(permiso: { granted: boolean; canAskAgain: boolean }): ResultadoPermisoGaleria {
  if (permiso.granted) {
    return 'concedido';
  }
  return permiso.canAskAgain ? 'negado' : 'negadoParaSiempre';
}
