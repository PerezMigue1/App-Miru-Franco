/// <reference types="jest" />

import * as SecureStore from 'expo-secure-store';

import { leerSecureStore } from './secureStore';

/** Entrada única de SecureStore donde tokenStorage guarda la sesión. */
export const CLAVE_SESION = 'auth_sesion';

function base64Url(texto: string): string {
  return btoa(texto).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** JWT armado a mano con datos falsos: 15 minutos de vida (exp menos iat). */
export function jwtFicticio(nombre: string): string {
  const cabecera = base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const datos = base64Url(JSON.stringify({ sub: nombre, iat: 1_000, exp: 1_000 + 15 * 60 }));
  return `${cabecera}.${datos}.firma-ficticia`;
}

export interface UsuarioSembrado {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

export interface SesionSembrada {
  token: string;
  refreshToken: string;
}

// apiClient recuerda en memoria el último refreshToken consumido (y los módulos se comparten entre
// las pruebas de un archivo): cada siembra usa uno distinto.
let sembradas = 0;

/**
 * Siembra en SecureStore una sesión móvil vigente, como la que deja un inicio de sesión anterior,
 * y marca la bienvenida como vista (la clienta ya abrió la app antes).
 */
export async function sembrarSesion(usuario: UsuarioSembrado): Promise<SesionSembrada> {
  sembradas += 1;
  const sesion = {
    token: jwtFicticio(`${usuario.id}-${sembradas}`),
    refreshToken: `refresh-ficticio-guardado-${sembradas}`,
    emitidoEn: Date.now(),
    usuario,
  };
  await SecureStore.setItemAsync(CLAVE_SESION, JSON.stringify(sesion));
  await SecureStore.setItemAsync('bienvenida_vista', '1');
  return { token: sesion.token, refreshToken: sesion.refreshToken };
}

export interface SesionLeida {
  token: string;
  refreshToken?: string;
  usuario: { nombre: string };
}

/** La sesión que quedó guardada en SecureStore, o null si no hay. */
export function sesionGuardada(): SesionLeida | null {
  const texto = leerSecureStore()[CLAVE_SESION];
  return texto === undefined ? null : (JSON.parse(texto) as SesionLeida);
}
