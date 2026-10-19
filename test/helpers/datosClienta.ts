import { CATALOGOS_VACIOS, respuesta, type Manejador } from './servidorSimulado';

/** Datos ficticios de la clienta en las pruebas de acceso y registro. */
export const CORREO = 'clienta@ejemplo.test';
export const CLAVE = 'ClaveFicticia1!';

/** Clienta ficticia que devuelve el servidor simulado. */
export const USUARIO = { id: 41, nombre: 'Clienta Ficticia', email: CORREO, rol: 'cliente' };

/** Lo que piden las pantallas de fondo (catálogos públicos, carrito y perfil con sesión). */
export const RUTAS_DE_FONDO: Record<string, Manejador> = {
  ...CATALOGOS_VACIOS,
  'GET /api/carrito': () => respuesta({ success: true, count: 0, data: [] }),
  'GET /api/auth/me': () => respuesta({ data: USUARIO }),
};

/** 403 del login para una cuenta que todavía no se activa con el código del correo. */
export function cuentaSinActivar(): Response {
  return respuesta(
    {
      statusCode: 403,
      message: 'Tu cuenta no está activada. Revisa tu correo para activar tu cuenta.',
    },
    403,
  );
}
