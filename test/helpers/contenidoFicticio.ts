/// <reference types="jest" />

import type {
  FotoGaleriaSalon,
  IntegranteEquipo,
  PreguntaFrecuente,
  Promocion,
} from '@/features/salon/models/contenidoSalonModel';

import { respuesta, type Manejador } from './servidorSimulado';

/**
 * Contenido público ficticio del salón para las pruebas de GP-07.3: respuestas completas del
 * servidor (con la misma forma que contenido.service.ts y galeria.service.ts del backend:
 * { success: true, data: [...] }), lo que la app debe quedarse después de normalizarlas y las rutas
 * del servidor simulado (servidorConRutas). Todos los datos son inventados.
 */

export const RUTA_PROMOCIONES = '/api/contenido/promociones';
export const RUTA_PREGUNTAS = '/api/contenido/preguntas-frecuentes';
export const RUTA_EQUIPO = '/api/contenido/equipo';
export const RUTA_GALERIA = '/api/galeria';

/** Las cuatro listas de contenido público del salón. */
export type SeccionContenido = 'promociones' | 'preguntas' | 'equipo' | 'galeria';
/** Cómo responde una ruta: lista llena, lista vacía o error del servidor (500). */
export type ModoContenido = 'llenas' | 'vacias' | 'error';

/** Cuerpo de una lectura pública exitosa del backend. */
export function cuerpoLista(data: unknown[]): { success: true; data: unknown[] } {
  return { success: true, data };
}

// ── Promociones ──────────────────────────────────────────────────────────────────────────────

/** Promociones crudas: una completa y destacada, otra sin imagen, enlace ni fechas. */
export function promocionesCrudas(): Record<string, unknown>[] {
  return [
    {
      id: 11,
      titulo: '  Promoción ficticia de otoño  ',
      descripcion: ' Descuento inventado en servicios de prueba. ',
      imagenUrl: 'https://imagenes.test/promocion-otono.jpg',
      enlace: '/cliente/servicios-citas',
      vigenteDesde: '2026-10-01',
      vigenteHasta: '2026-11-30',
      destacada: true,
    },
    {
      id: 12,
      titulo: 'Promoción ficticia sin imagen',
      descripcion: 'Texto de prueba.',
      imagenUrl: null,
      enlace: null,
      vigenteDesde: null,
      vigenteHasta: null,
      destacada: false,
    },
  ];
}

export const PROMOCIONES_ESPERADAS: Promocion[] = [
  {
    id: 11,
    titulo: 'Promoción ficticia de otoño',
    descripcion: 'Descuento inventado en servicios de prueba.',
    imagenUrl: 'https://imagenes.test/promocion-otono.jpg',
    enlace: '/cliente/servicios-citas',
    vigenteDesde: '2026-10-01',
    vigenteHasta: '2026-11-30',
    destacada: true,
  },
  {
    id: 12,
    titulo: 'Promoción ficticia sin imagen',
    descripcion: 'Texto de prueba.',
    imagenUrl: null,
    enlace: null,
    vigenteDesde: null,
    vigenteHasta: null,
    destacada: false,
  },
];

// ── Preguntas frecuentes ─────────────────────────────────────────────────────────────────────

export function preguntasCrudas(): Record<string, unknown>[] {
  return [
    { id: 21, pregunta: ' ¿Pregunta ficticia uno? ', respuesta: ' Respuesta ficticia uno. ' },
    { id: 22, pregunta: '¿Pregunta ficticia dos?', respuesta: 'Respuesta ficticia dos.' },
  ];
}

export const PREGUNTAS_ESPERADAS: PreguntaFrecuente[] = [
  { id: 21, pregunta: '¿Pregunta ficticia uno?', respuesta: 'Respuesta ficticia uno.' },
  { id: 22, pregunta: '¿Pregunta ficticia dos?', respuesta: 'Respuesta ficticia dos.' },
];

// ── Equipo ───────────────────────────────────────────────────────────────────────────────────

export function equipoCrudo(): Record<string, unknown>[] {
  return [
    {
      nombre: ' Integrante Ficticia Uno ',
      puesto: 'Estilista de prueba',
      foto: 'https://imagenes.test/equipo-uno.jpg',
      bio: ' Presentación inventada. ',
    },
    { nombre: 'Integrante Ficticio Dos', puesto: 'Colorista de prueba', foto: null, bio: null },
  ];
}

export const EQUIPO_ESPERADO: IntegranteEquipo[] = [
  {
    nombre: 'Integrante Ficticia Uno',
    puesto: 'Estilista de prueba',
    foto: 'https://imagenes.test/equipo-uno.jpg',
    bio: 'Presentación inventada.',
  },
  { nombre: 'Integrante Ficticio Dos', puesto: 'Colorista de prueba', foto: null, bio: null },
];

// ── Galería ──────────────────────────────────────────────────────────────────────────────────

/** Fotos crudas en el orden del servidor: con servicio, sin servicio y una sin texto alternativo. */
export function galeriaCruda(): Record<string, unknown>[] {
  return [
    {
      id: 31,
      url: 'https://imagenes.test/galeria-uno.jpg',
      alt: ' Corte ficticio terminado ',
      servicio: { id: 1, nombre: 'Corte de prueba', categoria: 'Cortes' },
    },
    { id: 32, url: 'https://imagenes.test/galeria-dos.jpg', alt: 'Peinado ficticio', servicio: null },
    {
      id: 33,
      url: 'https://imagenes.test/galeria-tres.jpg',
      alt: '',
      servicio: { id: 2, nombre: 'Color de prueba', categoria: 'Color' },
    },
  ];
}

export const GALERIA_ESPERADA: FotoGaleriaSalon[] = [
  {
    id: 31,
    url: 'https://imagenes.test/galeria-uno.jpg',
    alt: 'Corte ficticio terminado',
    servicio: { id: 1, nombre: 'Corte de prueba', categoria: 'Cortes' },
  },
  { id: 32, url: 'https://imagenes.test/galeria-dos.jpg', alt: 'Peinado ficticio', servicio: null },
  {
    id: 33,
    url: 'https://imagenes.test/galeria-tres.jpg',
    alt: 'Foto de Color de prueba',
    servicio: { id: 2, nombre: 'Color de prueba', categoria: 'Color' },
  },
];

// ── Rutas del servidor simulado ──────────────────────────────────────────────────────────────

const SECCIONES: Record<SeccionContenido, { ruta: string; crudos: () => Record<string, unknown>[] }> = {
  promociones: { ruta: RUTA_PROMOCIONES, crudos: promocionesCrudas },
  preguntas: { ruta: RUTA_PREGUNTAS, crudos: preguntasCrudas },
  equipo: { ruta: RUTA_EQUIPO, crudos: equipoCrudo },
  galeria: { ruta: RUTA_GALERIA, crudos: galeriaCruda },
};

/** Respuesta de una sección según el modo (el error es un 500 con mensaje ficticio). */
export function respuestaSeccion(seccion: SeccionContenido, modo: ModoContenido): Response {
  if (modo === 'error') {
    return respuesta({ statusCode: 500, message: 'Fallo ficticio del servidor' }, 500);
  }
  return respuesta(cuerpoLista(modo === 'llenas' ? SECCIONES[seccion].crudos() : []));
}

/**
 * Rutas de las cuatro listas para servidorConRutas. Con un modo, todas responden igual; con un
 * objeto, cada sección toma su modo y las que falten responden llenas.
 */
export function rutasContenido(
  modo: ModoContenido | Partial<Record<SeccionContenido, ModoContenido>> = 'llenas',
): Record<string, Manejador> {
  const modos: Partial<Record<SeccionContenido, ModoContenido>> =
    typeof modo === 'string' ? { promociones: modo, preguntas: modo, equipo: modo, galeria: modo } : modo;
  return Object.fromEntries(
    (Object.keys(SECCIONES) as SeccionContenido[]).map((seccion) => [
      `GET ${SECCIONES[seccion].ruta}`,
      () => respuestaSeccion(seccion, modos[seccion] ?? 'llenas'),
    ]),
  );
}
