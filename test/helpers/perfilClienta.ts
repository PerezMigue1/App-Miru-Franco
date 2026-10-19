/// <reference types="jest" />

import { CATALOGOS_VACIOS, respuesta, servidorConRutas, type Manejador } from './servidorSimulado';
import type { UsuarioSembrado } from './sesionGuardada';

/** Clienta ficticia de las pruebas de Perfil (GP-05.2), tal como queda guardada en la sesión. */
export const CLIENTA: UsuarioSembrado = {
  id: 'clienta-perfil-1',
  nombre: 'Clienta Perfil',
  email: 'perfil@ejemplo.test',
  rol: 'cliente',
};

/** Perfil completo ficticio que devuelve GET /api/auth/me (datos capilares planos, como la web). */
export const PERFIL_COMPLETO = {
  ...CLIENTA,
  telefono: '7710000000',
  fechaNacimiento: '1995-04-12T00:00:00.000Z',
  tipoCabello: 'ondulado',
  colorNatural: 'Castaño',
  colorActual: 'Castaño claro',
  productosUsados: 'Shampoo ficticio',
  alergias: '',
  tratamientosQuimicos: false,
  tratamientos: null,
  recibePromociones: false,
  foto: null,
  tienePassword: true,
};

/** GET /api/auth/me con el perfil indicado (por defecto, PERFIL_COMPLETO). */
export function respuestaPerfil(perfil: Record<string, unknown> = PERFIL_COMPLETO): Response {
  return respuesta({ data: perfil });
}

/** Lo que piden las pantallas con sesión de la clienta de Perfil: catálogos, carrito y /me. */
export const RUTAS_PERFIL: Record<string, Manejador> = {
  ...CATALOGOS_VACIOS,
  'GET /api/carrito': () => respuesta({ success: true, count: 0, data: [] }),
  'GET /api/auth/me': () => respuestaPerfil(),
};

/** Servidor simulado con las rutas de Perfil de fondo (ver servidorConRutas). */
export const simularServidorPerfil = servidorConRutas(RUTAS_PERFIL);
