/// <reference types="jest" />

import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import {
  obtenerEquipo,
  obtenerGaleria,
  obtenerPreguntasFrecuentes,
  obtenerPromociones,
} from '@/features/salon/models/contenidoSalonModel';

import {
  EQUIPO_ESPERADO,
  GALERIA_ESPERADA,
  PREGUNTAS_ESPERADAS,
  PROMOCIONES_ESPERADAS,
  RUTA_EQUIPO,
  RUTA_GALERIA,
  RUTA_PREGUNTAS,
  RUTA_PROMOCIONES,
  rutasContenido,
} from '../../helpers/contenidoFicticio';
import { espiarConsola } from '../../helpers/consola';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { API, servidorConRutas } from '../../helpers/servidorSimulado';

/**
 * GP-07.3: lecturas públicas del contenido del salón (obtener* de contenidoSalonModel.ts). Cada una
 * pide su ruta con GET y sin sesión (aunque haya una guardada) y rechaza con el error de apiClient.
 * fetch va simulado (API en http://api.test); apiClient es el real.
 */

const simularServidor = servidorConRutas({});

const LECTURAS: [string, () => Promise<unknown[]>, string, unknown[]][] = [
  ['obtenerPromociones', obtenerPromociones, RUTA_PROMOCIONES, PROMOCIONES_ESPERADAS],
  ['obtenerPreguntasFrecuentes', obtenerPreguntasFrecuentes, RUTA_PREGUNTAS, PREGUNTAS_ESPERADAS],
  ['obtenerEquipo', obtenerEquipo, RUTA_EQUIPO, EQUIPO_ESPERADO],
  ['obtenerGaleria', obtenerGaleria, RUTA_GALERIA, GALERIA_ESPERADA],
];

espiarConsola(() => Promise.resolve(), true);

describe.each(LECTURAS)('%s', (_nombre, obtener, ruta, esperado) => {
  it('pide su ruta con GET, sin Authorization aunque haya sesión, y devuelve la lista normalizada', async () => {
    await sembrarSesion({ id: 'clienta-1', nombre: 'Clienta Ficticia', email: 'clienta@prueba.test', rol: 'cliente' });
    const llamadas = simularServidor(rutasContenido());

    await expect(obtener()).resolves.toEqual(esperado);

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].metodo).toBe('GET');
    expect(llamadas[0].url).toBe(`${API}${ruta}`);
    expect(llamadas[0].cabeceras).not.toHaveProperty('Authorization');
  });

  it('una lista vacía del servidor da []', async () => {
    simularServidor(rutasContenido('vacias'));
    await expect(obtener()).resolves.toEqual([]);
  });

  it('rechaza con ApiError ante un error HTTP', async () => {
    simularServidor(rutasContenido('error'));
    const error: unknown = await obtener().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, message: 'Fallo ficticio del servidor' });
  });

  it('rechaza con ErrorDeRed sin red', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
    await expect(obtener()).rejects.toBeInstanceOf(ErrorDeRed);
  });
});
