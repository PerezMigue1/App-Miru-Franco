/// <reference types="jest" />

import { screen, waitFor } from 'expo-router/testing-library';

import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { sinRedEnRuta } from './citasFicticias';
import { sinTextos, tocar } from './pantallasReserva';
import { conTextos, type RutaQueFalla } from './pantallasTienda';
import { respuesta, type Manejador } from './servidorSimulado';
import { TEXTO_DEMASIADAS_SOLICITUDES, TEXTO_SERVIDOR, TEXTO_SIN_CONEXION } from './textosError';

/**
 * GP-07.6, fallas de carga con las pantallas reales: el 500 con referencia (con el texto técnico en
 * inglés que manda el backend), sin red y el 429 del ThrottlerException, con el texto que debe ver la
 * clienta, y la revisión de la pantalla de error con su "Reintentar". Datos ficticios.
 */

/** Texto técnico del cuerpo de un 500: nunca debe llegar a la pantalla. */
export const TECNICO = 'Internal server error: PrismaClientKnownRequestError ficticio en citas.service.ts';
const TECNICO_429 = 'ThrottlerException: Too Many Requests';
export const REFERENCIA = 'C0FFEE12';
/** El texto general del servidor con la frase de la referencia del 500. */
export const TEXTO_SERVIDOR_CON_REFERENCIA = `${TEXTO_SERVIDOR} ${RESPALDO_TEXTOS['errores.referencia'].replace('{referencia}', REFERENCIA)}`;

/** 500 del backend con su referencia y el texto técnico. */
export const falla500: Manejador = () => respuesta({ statusCode: 500, message: TECNICO, referencia: REFERENCIA }, 500);

export type Falla = [nombre: string, manejador: Manejador, texto: string];

export const FALLA_500: Falla = ['un 500 con referencia', falla500, TEXTO_SERVIDOR_CON_REFERENCIA];
export const FALLA_SIN_RED: Falla = ['sin red', sinRedEnRuta, TEXTO_SIN_CONEXION];

/** Cada falla con el texto que debe verse en la pantalla. */
export const FALLAS: Falla[] = [
  FALLA_500,
  FALLA_SIN_RED,
  ['un 429 (ThrottlerException)', () => respuesta({ statusCode: 429, message: TECNICO_429 }, 429), TEXTO_DEMASIADAS_SOLICITUDES],
];

/** Ningún texto técnico del servidor (ni el viejo "Revisa tu conexión" para todo) a la vista. */
export function sinTextoTecnico(): void {
  sinTextos(TECNICO, TECNICO_429, /Internal server error/, /Revisa tu conexión/);
}

/** Ve el título y el texto de la falla (sin el técnico), arregla la ruta y toca Reintentar. */
export async function revisarYReintentar(ruta: RutaQueFalla, titulo: string, texto: string): Promise<void> {
  expect(await screen.findByRole('header', { name: titulo })).toBeOnTheScreen();
  conTextos(texto);
  sinTextoTecnico();
  ruta.arreglar();
  await tocar('Reintentar');
  await waitFor(() => expect(screen.queryByRole('header', { name: titulo })).not.toBeOnTheScreen());
}
