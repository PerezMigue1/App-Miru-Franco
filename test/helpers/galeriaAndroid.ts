/// <reference types="jest" />

import type { PermissionResponse } from 'expo-image-picker';
import { Platform } from 'react-native';

/**
 * Simula un Android con esa versión de API (32 = Android 12L, 33 = Android 13) cambiando
 * Platform.OS y el getter de Platform.Version. Devuelve con qué restaurarlo; jest.restoreAllMocks
 * también lo deshace.
 */
export function simularAndroid(version: number): () => void {
  const os = jest.replaceProperty(Platform as { OS: string }, 'OS', 'android');
  const api = jest
    .spyOn(Platform as unknown as { Version: number | string }, 'Version', 'get')
    .mockReturnValue(version);
  return () => {
    api.mockRestore();
    os.restore();
  };
}

/**
 * Respuesta ficticia de getMediaLibraryPermissionsAsync (la consulta sin preguntar) o de
 * requestMediaLibraryPermissionsAsync: concedido, negado esta vez (el teléfono lo vuelve a
 * preguntar; en la consulta, también "aún no se ha preguntado") o negado para siempre.
 */
export function permisoGaleria(caso: 'concedido' | 'negado' | 'negadoParaSiempre'): PermissionResponse {
  const concedido = caso === 'concedido';
  return {
    granted: concedido,
    status: (concedido ? 'granted' : 'denied') as PermissionResponse['status'],
    canAskAgain: caso !== 'negadoParaSiempre',
    expires: 'never',
  };
}
