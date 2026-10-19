/// <reference types="jest" />

import { screen } from 'expo-router/testing-library';

import { abrirApp, cerrarIntroSiAparece, type App } from './pantallas';
import { CLIENTA, simularServidorPerfil } from './perfilClienta';
import type { Llamada, Manejador } from './servidorSimulado';
import { sembrarSesion } from './sesionGuardada';

export interface PerfilAbierto {
  app: App;
  /** Peticiones que recibió el servidor simulado (se van agregando durante la prueba). */
  llamadas: Llamada[];
}

/**
 * Abre la app real en Perfil con la sesión de CLIENTA guardada y el servidor de Perfil simulado
 * (las rutas de la prueba encima de las de fondo). Espera a que Perfil muestre el nombre de /me.
 */
export async function abrirPerfilConSesion(rutas: Record<string, Manejador> = {}): Promise<PerfilAbierto> {
  await sembrarSesion(CLIENTA);
  const llamadas = simularServidorPerfil(rutas);
  const app = await abrirApp('/perfil');
  await cerrarIntroSiAparece();
  expect(await screen.findByText(CLIENTA.nombre)).toBeOnTheScreen();
  expect(app.getPathname()).toBe('/perfil');
  return { app, llamadas };
}
