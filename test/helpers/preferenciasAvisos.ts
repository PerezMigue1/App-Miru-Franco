/// <reference types="jest" />

import { respuesta } from './servidorSimulado';

/**
 * Datos ficticios de Preferencias de avisos (Ronda 9 del backend) con la forma de
 * GET y PATCH /api/notificaciones/preferencias ({ success, data: [{ tipo, etiqueta, canal, activo }] }).
 * Etiquetas tomadas del contrato; los valores de activo son inventados.
 */

export const RUTA_PREFERENCIAS = '/api/notificaciones/preferencias';

/** Una entrada cruda del servidor. */
export function preferencia(tipo: string, etiqueta: string, canal: string, activo = true): Record<string, unknown> {
  return { tipo, etiqueta, canal, activo };
}

/** Cuatro tipos: uno solo en la app, uno con correo apagado y dos más, en el orden del backend. */
export const PREFERENCIAS = [
  preferencia('cita_creada', 'Cita agendada', 'in_app'),
  preferencia('cita_recordatorio', 'Recordatorio de tu cita', 'in_app'),
  preferencia('cita_recordatorio', 'Recordatorio de tu cita', 'email', false),
  preferencia('pedido_listo_recoger', 'Pedido listo para recoger', 'in_app'),
  preferencia('pedido_listo_recoger', 'Pedido listo para recoger', 'email'),
  preferencia('factura_emitida', 'Factura emitida', 'in_app', false),
];

/** 200 de GET o PATCH con la lista. */
export function respuestaPreferencias(lista: unknown[] = PREFERENCIAS): Response {
  return respuesta({ success: true, data: lista });
}

/** La lista con un par cambiado (lo que respondería el PATCH). */
export function conCambio(tipo: string, canal: string, activo: boolean, lista = PREFERENCIAS): Record<string, unknown>[] {
  return lista.map((p) => (p.tipo === tipo && p.canal === canal ? { ...p, activo } : p));
}

/** 400 PREFERENCIA_NO_DISPONIBLE (tipo y canal válidos que no van juntos). */
export function preferenciaNoDisponible400(): Response {
  return respuesta(
    {
      success: false,
      statusCode: 400,
      code: 'PREFERENCIA_NO_DISPONIBLE',
      message: 'El aviso cita_creada no se puede configurar por el canal email',
    },
    400,
  );
}

/** 404: el backend todavía no tiene la función. */
export function sinFuncion404(): Response {
  return respuesta({ success: false, statusCode: 404, message: 'Cannot GET /api/notificaciones/preferencias' }, 404);
}
