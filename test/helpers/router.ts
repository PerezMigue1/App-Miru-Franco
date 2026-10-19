/// <reference types="jest" />

import { act, cleanup, renderRouter } from 'expo-router/testing-library';

/**
 * Arranque y cierre de renderRouter para las pruebas. renderRouter activa los temporizadores falsos:
 * al cerrar hay que desmontar con cleanup() y correr lo pendiente dentro de act, todavía con los
 * falsos, antes de volver a los reales. Si no, en Node 22 Jest se queda colgado (ver GP-02).
 */
export function iniciarRouter(...args: Parameters<typeof renderRouter>): ReturnType<typeof renderRouter> {
  return renderRouter(...args);
}

/** Cierre de cada prueba que usó iniciarRouter; va en afterEach. */
export async function cerrarRouter(): Promise<void> {
  await cleanup();
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
}
