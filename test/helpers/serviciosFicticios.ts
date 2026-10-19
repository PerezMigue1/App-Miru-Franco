/// <reference types="jest" />

import type { Servicio } from '@/features/citas/models/servicioModel';

import {
  CATALOGOS_VACIOS,
  respuesta,
  servidorConRutas,
  type Manejador,
} from './servidorSimulado';

/**
 * Servicios ficticios de GP-06 con la forma real de GET /api/servicios y GET /api/servicios/:id
 * (backend: src/servicios/servicios.service.ts): precio y anticipo como texto decimal, imagen como
 * arreglo de URLs y especialistas como filas de servicio_especialistas con su usuario (sin correo).
 * Los usan las pruebas del modelo, de los viewmodels y de integración.
 */

/** Persona que atiende servicios: el usuarioId es el que usan las citas como especialistaId. */
export interface PersonaFicticia {
  usuarioId: string;
  nombre: string;
}

/** Fila de servicio_especialistas tal como la incluye la lista de servicios. */
export interface EspecialistaCruda {
  id: number;
  servicioId: number;
  usuarioId: string;
  usuario: { id: string; nombre: string };
}

/** Servicio crudo como lo manda el backend. El detalle por id no trae especialistas. */
export interface ServicioCrudo {
  id: number;
  nombre: string;
  descripcion: string | null;
  descripcionLarga: string | null;
  categoria: string;
  precio: string;
  anticipoMonto: string | null;
  anticipoAplica: boolean;
  duracionMinutos: number;
  imagen: string[];
  incluye: string[];
  recomendaciones: string[];
  requiereEvaluacion: boolean;
  activo: boolean;
  productosAsociados: unknown[];
  especialistas?: EspecialistaCruda[];
}

/** Primera especialista ficticia. */
export const ESPECIALISTA_UNO: PersonaFicticia = {
  usuarioId: 'especialista-ficticia-1',
  nombre: 'Especialista Ficticia Uno',
};

/** Segunda especialista ficticia. */
export const ESPECIALISTA_DOS: PersonaFicticia = {
  usuarioId: 'especialista-ficticia-2',
  nombre: 'Especialista Ficticia Dos',
};

/** URL https ficticia de la foto de un servicio. */
export function imagenServicio(nombre: string): string {
  return `https://img.test/servicios/${nombre}.jpg`;
}

/**
 * Fila de servicio_especialistas: `fila` es el id de la tabla intermedia (distinto del usuarioId,
 * que es el que la app debe usar).
 */
export function especialistaCruda(fila: number, servicioId: number, persona: PersonaFicticia): EspecialistaCruda {
  return {
    id: fila,
    servicioId,
    usuarioId: persona.usuarioId,
    usuario: { id: persona.usuarioId, nombre: persona.nombre },
  };
}

/** Servicio crudo completo y válido (id 900) con los cambios indicados. */
export function servicioCrudo(cambios: Partial<ServicioCrudo> = {}): ServicioCrudo {
  return {
    id: 900,
    nombre: 'Servicio ficticio',
    descripcion: 'Descripción corta ficticia',
    descripcionLarga: 'Descripción larga ficticia del servicio.',
    categoria: 'Cabello',
    precio: '400.00',
    anticipoMonto: null,
    anticipoAplica: false,
    duracionMinutos: 60,
    imagen: [imagenServicio('ficticio')],
    incluye: ['Lavado'],
    recomendaciones: ['Llegar puntual'],
    requiereEvaluacion: false,
    activo: true,
    productosAsociados: [],
    especialistas: [],
    ...cambios,
  };
}

/**
 * Catálogo ficticio: corte con anticipoMonto pero anticipoAplica en false, alaciado con anticipo
 * que aplica y dos especialistas, uñas sin precio ni foto, balayage con evaluación y precio con
 * centavos, y un peinado inactivo.
 */
export const CATALOGO_CRUDO: ServicioCrudo[] = [
  servicioCrudo({
    id: 1,
    nombre: 'Corte de dama',
    descripcion: 'Corte a la medida',
    descripcionLarga: 'Corte con lavado y secado.',
    categoria: 'Cabello',
    precio: '350.00',
    anticipoMonto: '105.00',
    anticipoAplica: false,
    duracionMinutos: 45,
    imagen: [imagenServicio('corte')],
    incluye: ['Lavado', 'Corte', 'Secado'],
    recomendaciones: ['Llegar con el cabello limpio'],
    especialistas: [especialistaCruda(11, 1, ESPECIALISTA_UNO)],
  }),
  servicioCrudo({
    id: 2,
    nombre: 'Alaciado keratínico',
    descripcion: 'Cabello liso y sin frizz',
    descripcionLarga: 'Tratamiento con keratina para alaciar.',
    categoria: 'Tratamientos',
    precio: '1200.00',
    anticipoMonto: '360.00',
    anticipoAplica: true,
    duracionMinutos: 150,
    imagen: [imagenServicio('alaciado'), imagenServicio('alaciado-2')],
    incluye: ['Diagnóstico', 'Aplicación de keratina'],
    recomendaciones: ['No lavar el cabello en 72 horas'],
    especialistas: [especialistaCruda(21, 2, ESPECIALISTA_UNO), especialistaCruda(22, 2, ESPECIALISTA_DOS)],
  }),
  servicioCrudo({
    id: 3,
    nombre: 'Uñas acrílicas',
    descripcion: 'Uñas esculpidas',
    descripcionLarga: '',
    categoria: 'Uñas',
    precio: '0.00',
    duracionMinutos: 60,
    imagen: [],
    incluye: [],
    recomendaciones: [],
    especialistas: [],
  }),
  servicioCrudo({
    id: 4,
    nombre: 'Balayage',
    descripcion: 'Iluminación natural',
    descripcionLarga: 'Color a mano alzada con matiz.',
    categoria: 'Color',
    precio: '1800.50',
    duracionMinutos: 180,
    imagen: [imagenServicio('balayage')],
    incluye: ['Decoloración', 'Matiz'],
    recomendaciones: ['Traer fotos de referencia'],
    requiereEvaluacion: true,
    especialistas: [especialistaCruda(41, 4, ESPECIALISTA_DOS)],
  }),
  servicioCrudo({
    id: 5,
    nombre: 'Peinado de evento',
    descripcion: 'Peinado para fiesta',
    descripcionLarga: 'Peinado con fijación.',
    categoria: 'Peinados',
    precio: '500.00',
    duracionMinutos: 90,
    imagen: [imagenServicio('peinado')],
    incluye: ['Peinado'],
    recomendaciones: [],
    activo: false,
    especialistas: [especialistaCruda(51, 5, ESPECIALISTA_UNO)],
  }),
];

/** Especialista ya normalizada: el id es el usuarioId de la persona. */
function especialistaNormalizada(persona: PersonaFicticia): Servicio['especialistas'][number] {
  return { id: persona.usuarioId, nombre: persona.nombre, foto: undefined };
}

/** CATALOGO_CRUDO tal como debe quedar después de obtenerServicios (escrito a mano). */
export const CATALOGO_NORMALIZADO: Servicio[] = [
  {
    id: 1,
    nombre: 'Corte de dama',
    categoria: 'Cabello',
    descripcion: 'Corte a la medida',
    descripcionLarga: 'Corte con lavado y secado.',
    precio: '$350',
    anticipo: null,
    duracion: '45 min',
    requiereEvaluacion: false,
    activo: true,
    imagen: imagenServicio('corte'),
    incluye: ['Lavado', 'Corte', 'Secado'],
    recomendaciones: ['Llegar con el cabello limpio'],
    especialistas: [especialistaNormalizada(ESPECIALISTA_UNO)],
  },
  {
    id: 2,
    nombre: 'Alaciado keratínico',
    categoria: 'Tratamientos',
    descripcion: 'Cabello liso y sin frizz',
    descripcionLarga: 'Tratamiento con keratina para alaciar.',
    precio: '$1,200',
    anticipo: '$360',
    duracion: '2 h 30 min',
    requiereEvaluacion: false,
    activo: true,
    imagen: imagenServicio('alaciado'),
    incluye: ['Diagnóstico', 'Aplicación de keratina'],
    recomendaciones: ['No lavar el cabello en 72 horas'],
    especialistas: [especialistaNormalizada(ESPECIALISTA_UNO), especialistaNormalizada(ESPECIALISTA_DOS)],
  },
  {
    id: 3,
    nombre: 'Uñas acrílicas',
    categoria: 'Uñas',
    descripcion: 'Uñas esculpidas',
    descripcionLarga: '',
    precio: null,
    anticipo: null,
    duracion: '1 h',
    requiereEvaluacion: false,
    activo: true,
    imagen: undefined,
    incluye: [],
    recomendaciones: [],
    especialistas: [],
  },
  {
    id: 4,
    nombre: 'Balayage',
    categoria: 'Color',
    descripcion: 'Iluminación natural',
    descripcionLarga: 'Color a mano alzada con matiz.',
    precio: '$1,800.50',
    anticipo: null,
    duracion: '3 h',
    requiereEvaluacion: true,
    activo: true,
    imagen: imagenServicio('balayage'),
    incluye: ['Decoloración', 'Matiz'],
    recomendaciones: ['Traer fotos de referencia'],
    especialistas: [especialistaNormalizada(ESPECIALISTA_DOS)],
  },
  {
    id: 5,
    nombre: 'Peinado de evento',
    categoria: 'Peinados',
    descripcion: 'Peinado para fiesta',
    descripcionLarga: 'Peinado con fijación.',
    precio: '$500',
    anticipo: null,
    duracion: '1 h 30 min',
    requiereEvaluacion: false,
    activo: false,
    imagen: imagenServicio('peinado'),
    incluye: ['Peinado'],
    recomendaciones: [],
    especialistas: [especialistaNormalizada(ESPECIALISTA_UNO)],
  },
];

/** Busca en CATALOGO_NORMALIZADO el servicio con ese id (falla si no existe). */
export function servicioEsperado(id: number): Servicio {
  const servicio = CATALOGO_NORMALIZADO.find((s) => s.id === id);
  if (!servicio) {
    throw new Error(`No hay servicio ficticio con id ${id}.`);
  }
  return servicio;
}

/** Servicio ya normalizado (como lo entrega el modelo) con los cambios indicados. */
export function servicioNormalizado(cambios: Partial<Servicio> = {}): Servicio {
  return {
    id: 900,
    nombre: 'Servicio ficticio',
    descripcion: '',
    descripcionLarga: '',
    precio: null,
    anticipo: null,
    duracion: null,
    requiereEvaluacion: false,
    incluye: [],
    recomendaciones: [],
    especialistas: [],
    ...cambios,
  };
}

/** Cuerpo de GET /api/servicios: { success, count, data }. */
export function cuerpoLista(lista: unknown[] = CATALOGO_CRUDO): unknown {
  return { success: true, count: lista.length, data: lista };
}

/** El servicio como lo manda GET /api/servicios/:id: igual que en la lista pero sin especialistas. */
export function sinEspecialistas(servicio: ServicioCrudo): Omit<ServicioCrudo, 'especialistas'> {
  const detalle = { ...servicio };
  delete detalle.especialistas;
  return detalle;
}

/** Cuerpo de GET /api/servicios/:id: { success, data } sin especialistas. */
export function cuerpoDetalle(servicio: ServicioCrudo): unknown {
  return { success: true, data: sinEspecialistas(servicio) };
}

/** 404 del backend para un servicio que no existe o que está inactivo. */
export function servicioNoEncontrado(): Response {
  return respuesta({ statusCode: 404, message: 'Servicio no encontrado', error: 'Not Found' }, 404);
}

/**
 * Rutas de servicios para servidorConRutas: la lista tal cual y el detalle de cada servicio por id.
 * Como el backend, el detalle de un servicio inactivo responde 404 a la clienta.
 */
export function rutasServicios(lista: ServicioCrudo[] = CATALOGO_CRUDO): Record<string, Manejador> {
  const rutas: Record<string, Manejador> = {
    'GET /api/servicios': () => respuesta(cuerpoLista(lista)),
  };
  for (const servicio of lista) {
    rutas[`GET /api/servicios/${servicio.id}`] = () =>
      servicio.activo ? respuesta(cuerpoDetalle(servicio)) : servicioNoEncontrado();
  }
  return rutas;
}

/**
 * Servidor simulado con CATALOGO_CRUDO de fondo (y el catálogo de productos vacío). Las rutas que
 * pase cada prueba van encima; lo demás responde 404. Devuelve las llamadas recibidas.
 */
export const simularServidorServicios = servidorConRutas({ ...CATALOGOS_VACIOS, ...rutasServicios() });
