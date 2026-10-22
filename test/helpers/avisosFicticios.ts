/// <reference types="jest" />

import type { Aviso } from '@/features/notificaciones/models/avisoModel';

import { respuesta, type Manejador } from './servidorSimulado';

/**
 * Avisos internos ficticios (GET /api/notificaciones) para las pruebas de GP-07.2: unitarias,
 * de integración y de conexión en vivo. Cada aviso crudo tiene la forma de una fila de Prisma en
 * camelCase, como la manda el backend; los UUID son fijos e inventados y ningún dato es real.
 *
 * Uso típico:
 *   simularServidor(rutasAvisos());                       // GET, PUT, PATCH y DELETE que responden bien
 *   respuestaAvisos([avisoCrudo({ titulo: 'Otro' })]);    // { success, count, data } a la medida
 *   enSnakeCase(AVISO_CITA);                               // la misma fila con url_accion, creado_en...
 */

export const RUTA_AVISOS = '/api/notificaciones';
export const RUTA_AVISOS_LEIDOS = '/api/notificaciones/leidas';

/** Ruta de un aviso (PUT para marcarlo leído y DELETE para borrarlo). */
export function rutaAviso(id: string): string {
  return `${RUTA_AVISOS}/${id}`;
}

/** UUID ficticios fijos (versión 4 válida, como los que acepta ParseUUIDPipe). */
export const ID_AVISO_CITA = '00000000-0000-4000-8000-000000000001';
export const ID_AVISO_PEDIDO = '00000000-0000-4000-8000-000000000002';
export const ID_AVISO_SIN_DESTINO = '00000000-0000-4000-8000-000000000003';
export const ID_CLIENTA_AVISOS = '00000000-0000-4000-8000-0000000000c1';

/** Fechas de creación, del más reciente al más viejo (el orden en que responde el backend). */
export const FECHA_AVISO_CITA = '2026-10-20T18:30:00.000Z';
export const FECHA_AVISO_PEDIDO = '2026-10-19T16:00:00.000Z';
export const FECHA_AVISO_SIN_DESTINO = '2026-10-18T15:00:00.000Z';

/** Aviso crudo con todos los campos de la fila; los que no trae `parcial` toman un valor neutro. */
export function avisoCrudo(parcial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID_AVISO_SIN_DESTINO,
    tipo: 'general',
    titulo: 'Aviso ficticio',
    mensaje: 'Mensaje ficticio de prueba.',
    leida: false,
    metadata: null,
    creadoEn: FECHA_AVISO_SIN_DESTINO,
    prioridad: 'normal',
    entidadTipo: null,
    entidadId: null,
    urlAccion: null,
    programadaPara: null,
    leidaEn: null,
    usuarioId: ID_CLIENTA_AVISOS,
    ...parcial,
  };
}

/** Aviso de una cita: abre '/cita/12' en la app. */
export const AVISO_CITA = avisoCrudo({
  id: ID_AVISO_CITA,
  tipo: 'cita_confirmada',
  titulo: 'Tu cita está confirmada',
  mensaje: 'Te esperamos en el salón.',
  creadoEn: FECHA_AVISO_CITA,
  entidadTipo: 'cita',
  entidadId: 12,
  urlAccion: '/cliente/servicios-citas/mis-citas/12',
});

/** Aviso de un pedido, ya leído: abre '/pedido/7' en la app. */
export const AVISO_PEDIDO = avisoCrudo({
  id: ID_AVISO_PEDIDO,
  tipo: 'pedido_listo',
  titulo: 'Tu pedido está listo',
  mensaje: 'Ya puedes pasar por él al salón.',
  leida: true,
  leidaEn: '2026-10-19T17:00:00.000Z',
  creadoEn: FECHA_AVISO_PEDIDO,
  entidadTipo: 'pedido',
  entidadId: '7',
  urlAccion: '/cliente/tienda-online/mis-pedidos/7',
});

/** Aviso general sin ruta ni entidad: no abre nada. */
export const AVISO_SIN_DESTINO = avisoCrudo({ tipo: 'general', titulo: 'Horario de fin de año' });

/** Los tres avisos en el orden del backend (creadoEn desc). */
export const AVISOS_FICTICIOS: readonly Record<string, unknown>[] = [AVISO_CITA, AVISO_PEDIDO, AVISO_SIN_DESTINO];

/** Lo que la app debe quedarse de AVISOS_FICTICIOS después de normalizarlos, en el mismo orden. */
export const AVISOS_NORMALIZADOS: readonly Aviso[] = [
  {
    id: ID_AVISO_CITA,
    tipo: 'cita_confirmada',
    titulo: 'Tu cita está confirmada',
    mensaje: 'Te esperamos en el salón.',
    fecha: FECHA_AVISO_CITA,
    leida: false,
    destino: '/cita/12',
  },
  {
    id: ID_AVISO_PEDIDO,
    tipo: 'pedido_listo',
    titulo: 'Tu pedido está listo',
    mensaje: 'Ya puedes pasar por él al salón.',
    fecha: FECHA_AVISO_PEDIDO,
    leida: true,
    destino: '/pedido/7',
  },
  {
    id: ID_AVISO_SIN_DESTINO,
    tipo: 'general',
    titulo: 'Horario de fin de año',
    mensaje: 'Mensaje ficticio de prueba.',
    fecha: FECHA_AVISO_SIN_DESTINO,
    leida: false,
    destino: null,
  },
];

/** Cuerpo de GET /api/notificaciones: { success: true, count, data }. */
export function respuestaAvisos(lista: readonly unknown[] = AVISOS_FICTICIOS): {
  success: true;
  count: number;
  data: unknown[];
} {
  return { success: true, count: lista.length, data: [...lista] };
}

/** Campos que el backend podría mandar en snake_case. */
const CAMPOS_SNAKE: Readonly<Record<string, string>> = {
  urlAccion: 'url_accion',
  entidadTipo: 'entidad_tipo',
  entidadId: 'entidad_id',
  creadoEn: 'creado_en',
};

/** El mismo aviso crudo con urlAccion, entidadTipo, entidadId y creadoEn en snake_case. */
export function enSnakeCase(crudo: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(crudo).map(([clave, valor]) => [CAMPOS_SNAKE[clave] ?? clave, valor]));
}

/**
 * Rutas para servidorConRutas con respuestas como las del backend: GET con `lista`, PATCH de todos
 * leídos, y PUT y DELETE de cada aviso de `lista` que traiga id en texto (los demás dan 404).
 */
export function rutasAvisos(lista: readonly Record<string, unknown>[] = AVISOS_FICTICIOS): Record<string, Manejador> {
  const rutas: Record<string, Manejador> = {
    [`GET ${RUTA_AVISOS}`]: () => respuesta(respuestaAvisos(lista)),
    [`PATCH ${RUTA_AVISOS_LEIDOS}`]: () => respuesta({ success: true, count: lista.length }),
  };
  for (const aviso of lista) {
    if (typeof aviso.id === 'string') {
      rutas[`PUT ${rutaAviso(aviso.id)}`] = () => respuesta({ success: true, data: { ...aviso, leida: true } });
      rutas[`DELETE ${rutaAviso(aviso.id)}`] = () =>
        respuesta({ success: true, message: 'Notificación eliminada correctamente' });
    }
  }
  return rutas;
}
