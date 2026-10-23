/// <reference types="jest" />

import * as SecureStore from 'expo-secure-store';

import { alExpirarSesion, esperarRenovacionEnCurso } from '@/shared/api/apiClient';
import type { SesionGuardada, UsuarioGuardado } from '@/shared/api/tokenStorage';

import { leerSecureStore } from './secureStore';
import { leerLlamada, type Llamada } from './servidorSimulado';
import { CLAVE_SESION, jwtFicticio } from './sesionGuardada';
import { sinRed } from './viewmodelsAuth';

/**
 * Piezas de las pruebas de sesión y seguridad de GP-07.6: sesiones ficticias con tokens únicos (un
 * refreshToken ya consumido en otra prueba nunca se repite), la entrada de la sesión en el
 * SecureStore simulado, fallas programadas de SecureStore, un servidor sin red que anota lo que se
 * intentó enviar y un espía de la expiración. Todo con datos falsos; nada sale a la red.
 */

export const RUTA_RENOVAR_MOVIL = '/api/auth/movil/renovar';
export const RUTA_RENOVAR_CLASICA = '/api/auth/refresh';
export const RUTA_LOGOUT = '/api/auth/logout';
export const RUTA_PERFIL = '/api/auth/me';
/** Vida del acceso de jwtFicticio: una sesión emitida hace este tiempo ya tiene el acceso vencido. */
export const QUINCE_MINUTOS_MS = 15 * 60_000;

export const CLIENTA_SESION: UsuarioGuardado = {
  id: 'clienta-ficticia-76',
  nombre: 'Clienta Ficticia',
  email: 'clienta76@ejemplo.test',
  rol: 'cliente',
};

let creadas = 0;

export interface OpcionesSesionFicticia {
  /** Sin refreshToken (sesión del camino anterior). */
  clasica?: boolean;
  emitidoEn?: number;
  usuario?: UsuarioGuardado;
}

/** Sesión ficticia con tokens únicos: móvil (con refreshToken) salvo que se pida clásica. */
export function sesionFicticia(opciones: OpcionesSesionFicticia = {}): SesionGuardada {
  creadas += 1;
  const sesion: SesionGuardada = {
    token: jwtFicticio(`limite-${creadas}`),
    emitidoEn: opciones.emitidoEn ?? Date.now(),
    usuario: opciones.usuario ?? CLIENTA_SESION,
  };
  if (!opciones.clasica) {
    sesion.refreshToken = `refresh-ficticio-limite-${creadas}`;
  }
  return sesion;
}

/** Escribe tal cual en la entrada de la sesión: un texto se guarda sin tocar; lo demás, en JSON. */
export async function guardarEnAlmacen(valor: unknown): Promise<void> {
  await SecureStore.setItemAsync(CLAVE_SESION, typeof valor === 'string' ? valor : JSON.stringify(valor));
}

/** Texto crudo de la entrada de la sesión, o undefined si no hay entrada. */
export function textoSesion(): string | undefined {
  return leerSecureStore()[CLAVE_SESION];
}

type FuncionSecureStore = 'setItemAsync' | 'deleteItemAsync';

function mockDe(funcion: FuncionSecureStore): jest.Mock {
  return SecureStore[funcion] as unknown as jest.Mock;
}

/** La función de SecureStore indicada rechaza las siguientes `veces` llamadas. */
export function fallarSecureStore(funcion: FuncionSecureStore, veces = 1): void {
  for (let i = 0; i < veces; i++) {
    mockDe(funcion).mockImplementationOnce(() => Promise.reject(new Error('Keystore ocupado')));
  }
}

/** Quita las fallas que no se usaron (conserva la implementación en memoria de test/setup.ts). */
export function quitarFallasSecureStore(): void {
  for (const funcion of ['setItemAsync', 'deleteItemAsync'] as const) {
    const mock = mockDe(funcion);
    const base = mock.getMockImplementation();
    mock.mockReset();
    mock.mockImplementation(base);
  }
}

/** fetch sin red: rechaza todo como en el teléfono y anota lo que se intentó enviar. */
export function servidorSinRed(): Llamada[] {
  const llamadas: Llamada[] = [];
  globalThis.fetch = jest.fn((entrada: unknown, init?: RequestInit) => {
    llamadas.push(leerLlamada(entrada, init));
    return sinRed();
  }) as unknown as typeof fetch;
  return llamadas;
}

/** Rutas a las que se intentó llamar, en orden ("MÉTODO /ruta"). */
export function rutasDe(llamadas: Llamada[]): string[] {
  return llamadas.map((llamada) => `${llamada.metodo} ${llamada.ruta}`);
}

let quitarEspia: (() => void) | null = null;

/** Registra un espía de la sesión expirada; cerrarEspiaExpiracion lo quita. */
export function espiarExpiracion(): jest.Mock {
  const manejador = jest.fn();
  quitarEspia = alExpirarSesion(manejador);
  return manejador;
}

/** Para el afterEach: ninguna renovación queda en vuelo, se quita el espía y las fallas sin usar. */
export async function cerrarPruebaSesion(): Promise<void> {
  await esperarRenovacionEnCurso();
  quitarEspia?.();
  quitarEspia = null;
  quitarFallasSecureStore();
}
