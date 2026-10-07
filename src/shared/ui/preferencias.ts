import * as SecureStore from 'expo-secure-store';

/**
 * Preferencias del dispositivo, con claves propias (aparte de la sesión): no se borran al cerrar
 * sesión. Si SecureStore falla, la app sigue con el valor predeterminado.
 */
const CLAVE_APARIENCIA = 'preferencia_apariencia';
const CLAVE_BIENVENIDA = 'bienvenida_vista';

export type PreferenciaApariencia = 'sistema' | 'claro' | 'oscuro';

function esPreferencia(valor: string | null): valor is PreferenciaApariencia {
  return valor === 'sistema' || valor === 'claro' || valor === 'oscuro';
}

export async function leerApariencia(): Promise<PreferenciaApariencia> {
  try {
    const valor = await SecureStore.getItemAsync(CLAVE_APARIENCIA);
    return esPreferencia(valor) ? valor : 'sistema';
  } catch {
    return 'sistema';
  }
}

export async function guardarApariencia(preferencia: PreferenciaApariencia): Promise<void> {
  try {
    await SecureStore.setItemAsync(CLAVE_APARIENCIA, preferencia);
  } catch {
    // Se aplica igual en esta sesión; al reabrir volverá a la anterior.
  }
}

export async function bienvenidaVista(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(CLAVE_BIENVENIDA)) === '1';
  } catch {
    // Sin poder leerla, no se insiste con la hoja.
    return true;
  }
}

export async function marcarBienvenidaVista(): Promise<void> {
  try {
    await SecureStore.setItemAsync(CLAVE_BIENVENIDA, '1');
  } catch {
    // Se volvería a mostrar en la próxima apertura; no bloquea nada.
  }
}
