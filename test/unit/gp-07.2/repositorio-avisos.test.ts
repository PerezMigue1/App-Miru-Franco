/// <reference types="jest" />

import {
  borrarAviso,
  listarAvisos,
  marcarAvisoLeido,
  marcarTodosLeidos,
  mensajeErrorAvisos,
  type AccionAvisos,
} from '@/features/notificaciones/models/avisoModel';
import { ApiError, crearErrorApi, ErrorDeRed } from '@/shared/api/apiClient';

import {
  AVISO_CITA,
  AVISOS_NORMALIZADOS,
  ID_AVISO_CITA,
  ID_AVISO_PEDIDO,
  respuestaAvisos,
  RUTA_AVISOS,
  RUTA_AVISOS_LEIDOS,
  rutaAviso,
  rutasAvisos,
} from '../../helpers/avisosFicticios';
import { espiarConsola } from '../../helpers/consola';
import { sembrarSesion, type SesionSembrada } from '../../helpers/sesionGuardada';
import { API, respuesta, servidorConRutas } from '../../helpers/servidorSimulado';

/**
 * GP-07.2 (avisos internos): repositorio de avisos en src/features/notificaciones/models/avisoModel.ts.
 * Cada llamada sale por apiClient (el real) con la sesión guardada: método, ruta, cuerpo y
 * Authorization; y mensajeErrorAvisos nunca muestra el texto técnico del servidor. fetch va simulado
 * (test/helpers/servidorSimulado.ts) y la sesión es ficticia (test/helpers/sesionGuardada.ts).
 */

const simularServidor = servidorConRutas({});
const CLIENTA = { id: 'clienta-avisos', nombre: 'Clienta Ficticia', email: 'clienta@ejemplo.test', rol: 'cliente' };
const ACCIONES: readonly AccionAvisos[] = ['cargar', 'marcar', 'marcarTodas', 'borrar'];

let sesion: SesionSembrada;

beforeEach(async () => {
  sesion = await sembrarSesion(CLIENTA);
});

// El repositorio nunca escribe en consola, ni con errores de red o del servidor.
espiarConsola(() => Promise.resolve(), true);

/** fetch que rechaza como sin red. */
function sinRed(): void {
  globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
}

describe('peticiones con sesión', () => {
  it.each([
    ['listarAvisos', () => listarAvisos(), 'GET', RUTA_AVISOS, undefined],
    ['marcarAvisoLeido', () => marcarAvisoLeido(ID_AVISO_CITA), 'PUT', rutaAviso(ID_AVISO_CITA), { leida: true }],
    ['marcarTodosLeidos', () => marcarTodosLeidos(), 'PATCH', RUTA_AVISOS_LEIDOS, undefined],
    ['borrarAviso', () => borrarAviso(ID_AVISO_PEDIDO), 'DELETE', rutaAviso(ID_AVISO_PEDIDO), undefined],
  ])('%s: %s %s con Authorization de la sesión', async (_nombre, llamar, metodo, ruta, cuerpo) => {
    const llamadas = simularServidor(rutasAvisos());

    await llamar();

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({ metodo, url: `${API}${ruta}`, cuerpo });
    expect(llamadas[0].cabeceras.Authorization).toBe(`Bearer ${sesion.token}`);
  });

  it('listarAvisos devuelve los avisos normalizados en el orden del servidor', async () => {
    simularServidor(rutasAvisos());

    await expect(listarAvisos()).resolves.toEqual(AVISOS_NORMALIZADOS);
  });

  it('listarAvisos descarta lo inválido de la respuesta', async () => {
    simularServidor({ [`GET ${RUTA_AVISOS}`]: () => respuesta(respuestaAvisos([AVISO_CITA, { titulo: 'Sin id' }, null])) });

    await expect(listarAvisos()).resolves.toEqual([AVISOS_NORMALIZADOS[0]]);
  });

  it.each([
    ['marcarAvisoLeido', marcarAvisoLeido, 'PUT'],
    ['borrarAviso', borrarAviso, 'DELETE'],
  ])('%s resuelve sin valor y codifica el id en la ruta', async (_nombre, accion, metodo) => {
    const raro = 'a/b?c#d';
    const llamadas = simularServidor({ [`${metodo} ${rutaAviso('a%2Fb%3Fc%23d')}`]: () => respuesta({ success: true }) });

    await expect(accion(raro)).resolves.toBeUndefined();
    expect(llamadas[0].url).toBe(`${API}${RUTA_AVISOS}/a%2Fb%3Fc%23d`);
  });

  it('marcarTodosLeidos resuelve sin valor', async () => {
    simularServidor(rutasAvisos());

    await expect(marcarTodosLeidos()).resolves.toBeUndefined();
  });
});

describe('errores del servidor llegan como ApiError o ErrorDeRed', () => {
  it('404 "Notificación no encontrada" al borrar: ApiError 404 y el mensaje de que ya no existe', async () => {
    simularServidor({});

    const error = await borrarAviso(ID_AVISO_CITA).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect(mensajeErrorAvisos(error, 'borrar')).toBe('Ese aviso ya no existe.');
  });

  it('sin red al cargar: ErrorDeRed y el mensaje de sin conexión', async () => {
    sinRed();

    const error = await listarAvisos().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorDeRed);
    expect(mensajeErrorAvisos(error, 'cargar')).toMatch(/^Sin conexión/);
  });
});

describe('mensajeErrorAvisos', () => {
  const GENERICOS: Record<AccionAvisos, string> = {
    cargar: 'No pudimos cargar tus avisos. Intenta de nuevo.',
    marcar: 'No pudimos marcar el aviso como leído. Intenta de nuevo.',
    marcarTodas: 'No pudimos marcar tus avisos como leídos. Intenta de nuevo.',
    borrar: 'No pudimos borrar el aviso. Intenta de nuevo.',
  };
  const TECNICO = 'Internal server error: PrismaClientKnownRequestError P2025 at notificaciones.service';
  const SESION_TERMINADA = crearErrorApi({ tipo: 'sesionTerminada' });

  it('el 401 es el de sesión terminada (code SESION_VENCIDA)', () => {
    expect(SESION_TERMINADA).toMatchObject({ status: 401, code: 'SESION_VENCIDA' });
  });

  it.each(ACCIONES)('%s: sin red → mensaje de sin conexión', (accion) => {
    expect(mensajeErrorAvisos(crearErrorApi({ tipo: 'red' }), accion)).toBe(
      'Sin conexión. Revisa tu internet e intenta de nuevo',
    );
  });

  it.each(ACCIONES)('%s: 401 → mensaje fijo de sesión terminada', (accion) => {
    expect(mensajeErrorAvisos(SESION_TERMINADA, accion)).toBe(SESION_TERMINADA.message);
  });

  it.each([
    ['marcar', 'Ese aviso ya no existe.'],
    ['borrar', 'Ese aviso ya no existe.'],
    ['cargar', GENERICOS.cargar],
    ['marcarTodas', GENERICOS.marcarTodas],
  ] as const)('%s: 404 → %s', (accion, esperado) => {
    expect(mensajeErrorAvisos(new ApiError(404, 'Notificación no encontrada'), accion)).toBe(esperado);
  });

  it.each(ACCIONES)('%s: 500 con mensaje técnico → mensaje amable sin el texto del servidor', (accion) => {
    const mensaje = mensajeErrorAvisos(new ApiError(500, TECNICO, 'ERROR_INTERNO'), accion);

    expect(mensaje).toBe(GENERICOS[accion]);
    expect(mensaje).not.toContain('Internal');
    expect(mensaje).not.toContain('Prisma');
  });

  it.each([
    ['Error común', new Error(TECNICO)],
    ['texto', TECNICO],
    ['undefined', undefined],
  ])('error desconocido (%s) → mensaje de la acción', (_caso, error) => {
    for (const accion of ACCIONES) {
      expect(mensajeErrorAvisos(error, accion)).toBe(GENERICOS[accion]);
    }
  });
});
