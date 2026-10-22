/// <reference types="jest" />

import {
  crearConexionAvisos,
  ESPERA_MAX_MS,
  esperaReconexion,
  INTERVALO_RESPALDO_MS,
  MAX_REINTENTOS,
  type ConexionAvisos,
  type DepsConexionAvisos,
  type RespuestaFlujo,
  type Temporizadores,
} from '@/features/notificaciones/models/conexionAvisos';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';

import { sembrarSesion } from '../../helpers/sesionGuardada';
import {
  abrirFlujo,
  fallarRed,
  flujosVivos,
  llamadasFlujo,
  reiniciarFlujos,
  responderEstado,
  vaciar,
} from '../../helpers/streamSimulado';

/**
 * GP-07.2: conexión en vivo de avisos (src/features/notificaciones/models/conexionAvisos.ts). El
 * flujo SSE sale por el expo/fetch simulado (test/helpers/streamSimulado.ts) y los tiempos se revisan
 * con temporizadores falsos. avisoModel se simula para no depender de la otra tarea: su normalizador
 * acepta cualquier objeto con id de texto.
 */

jest.mock('@/features/notificaciones/models/avisoModel', () => ({
  normalizarAviso: (crudo: unknown) => {
    const fila = crudo as { id?: unknown; titulo?: unknown } | null;
    if (!fila || typeof fila.id !== 'string') {
      return null;
    }
    return { id: fila.id, tipo: 'general', titulo: String(fila.titulo), mensaje: '', fecha: null, leida: false, destino: null };
  },
}));

const URL_FLUJO = 'http://api.test/api/notificaciones/stream';
const TOKEN = 'token-ficticio-avisos';
const TOKEN_NUEVO = 'token-ficticio-avisos-renovado';
const FILA = { id: 'aviso-ficticio-1', titulo: 'Tu cita está confirmada' };

let conexion: ConexionAvisos | null = null;
let alAviso: jest.Mock;
let consultar: jest.Mock;
let obtenerToken: jest.Mock;
let renovar: jest.Mock;

function crear(cambios: Partial<DepsConexionAvisos> = {}): ConexionAvisos {
  conexion = crearConexionAvisos({ alAviso, consultar, obtenerToken, renovar, ...cambios });
  return conexion;
}

async function avanzar(ms: number): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
  await vaciar();
}

const peticiones = () => llamadasFlujo().length;

/** Avanza `espera - 1` ms sin petición nueva y 1 ms más con exactamente una. */
async function esperarReintento(espera: number): Promise<void> {
  const antes = peticiones();
  await avanzar(espera - 1);
  expect(peticiones()).toBe(antes);
  await avanzar(1);
  expect(peticiones()).toBe(antes + 1);
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  reiniciarFlujos();
  alAviso = jest.fn();
  consultar = jest.fn(() => Promise.resolve());
  obtenerToken = jest.fn(() => Promise.resolve(TOKEN));
  renovar = jest.fn(() => Promise.resolve('renovada'));
});

afterEach(async () => {
  conexion?.detener();
  conexion = null;
  await vaciar();
  jest.useRealTimers();
});

describe('apertura del flujo', () => {
  it('abre GET /api/notificaciones/stream con el token solo en Authorization', async () => {
    const flujo = abrirFlujo();
    const vivo = crear();
    expect(vivo.ultimoError()).toBeNull();
    vivo.iniciar();
    await flujo;

    expect(llamadasFlujo()).toEqual([
      {
        url: URL_FLUJO,
        metodo: 'GET',
        cabeceras: { Authorization: `Bearer ${TOKEN}`, Accept: 'text/event-stream' },
      },
    ]);
    expect(llamadasFlujo()[0].url).not.toContain(TOKEN);
    expect(vivo.activa()).toBe(true);
  });

  it('por omisión toma el token de la sesión guardada', async () => {
    const { token } = await sembrarSesion({ id: 'clienta-ficticia-1', nombre: 'Clienta', email: 'clienta@ejemplo.test', rol: 'cliente' });
    const flujo = abrirFlujo();
    conexion = crearConexionAvisos({ alAviso, consultar });
    conexion.iniciar();
    await flujo;

    expect(llamadasFlujo()[0].cabeceras.Authorization).toBe(`Bearer ${token}`);
  });

  it.each([
    ['sin token', () => Promise.resolve(null)],
    ['si leer el token falla', () => Promise.reject(new Error('SecureStore ficticio'))],
  ])('%s no abre nada y queda apagada', async (_caso, leerToken) => {
    const vivo = crear({ obtenerToken: jest.fn(leerToken) });
    vivo.iniciar();
    await avanzar(60_000);

    expect(peticiones()).toBe(0);
    expect(vivo.activa()).toBe(false);
  });
});

describe('eventos', () => {
  it('solo entrega avisos válidos: ignora keep-alive, otros eventos, data no JSON y avisos inválidos', async () => {
    const abierto = abrirFlujo();
    crear().iniciar();
    const flujo = await abierto;

    flujo.enviarKeepAlive();
    flujo.enviarTexto('event: otra-cosa\ndata: {"id":"aviso-ficticio-x"}\n\n');
    flujo.enviarTexto('event: notificacion\ndata: no es json\n\n');
    flujo.enviarTexto('event: notificacion\ndata: {"sinId":true}\n\n');
    flujo.enviarAviso(FILA);
    flujo.enviarTexto('data: {"id":"aviso-ficticio-2","titulo":"Sin event"}\n\n');
    await vaciar();

    expect(alAviso.mock.calls.map(([aviso]) => aviso.id)).toEqual(['aviso-ficticio-1', 'aviso-ficticio-2']);
    expect(alAviso).toHaveBeenCalledWith(expect.objectContaining({ titulo: FILA.titulo }));
  });

  it('decodifica UTF-8 aunque un carácter llegue partido entre dos trozos', async () => {
    const abierto = abrirFlujo();
    crear().iniciar();
    const flujo = await abierto;
    const bytes = new TextEncoder().encode(`event: notificacion\ndata: ${JSON.stringify({ id: 'aviso-ficticio-3', titulo: 'Diseño de uñas' })}\n\n`);
    const corte = bytes.indexOf(0xc3) + 1;

    flujo.enviarBytes(bytes.slice(0, corte));
    flujo.enviarBytes(bytes.slice(corte));
    await vaciar();

    expect(alAviso).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Diseño de uñas' }));
  });

  it('un oyente que falla no corta el flujo', async () => {
    alAviso.mockImplementationOnce(() => {
      throw new Error('oyente ficticio');
    });
    const abierto = abrirFlujo();
    crear().iniciar();
    const flujo = await abierto;

    flujo.enviarAviso(FILA);
    flujo.enviarAviso({ ...FILA, id: 'aviso-ficticio-2' });
    await vaciar();

    expect(alAviso).toHaveBeenCalledTimes(2);
    expect(flujosVivos()).toBe(1);
  });

  it('si al recibir un aviso se detiene, el resto del mismo trozo se descarta', async () => {
    const abierto = abrirFlujo();
    const vivo = crear({ alAviso: jest.fn(() => vivo.detener()) });
    vivo.iniciar();
    const flujo = await abierto;

    flujo.enviarTexto(`data: ${JSON.stringify(FILA)}\n\ndata: ${JSON.stringify({ ...FILA, id: 'aviso-ficticio-2' })}\n\n`);
    await vaciar();

    expect(vivo.activa()).toBe(false);
    expect(flujosVivos()).toBe(0);
  });

  it('un trozo que llega justo al detener no entrega avisos', async () => {
    const abierto = abrirFlujo();
    const vivo = crear();
    vivo.iniciar();
    const flujo = await abierto;
    // La lectura queda esperando: el trozo la resuelve justo antes de detener.
    await vaciar();

    flujo.enviarAviso(FILA);
    vivo.detener();
    await vaciar();

    expect(alAviso).not.toHaveBeenCalled();
    expect(flujosVivos()).toBe(0);
  });
});

describe('un solo flujo a la vez', () => {
  it('iniciar dos veces no abre dos flujos', async () => {
    const abierto = abrirFlujo();
    const vivo = crear();
    vivo.iniciar();
    vivo.iniciar();
    await abierto;
    await vaciar();

    expect(peticiones()).toBe(1);
    expect(flujosVivos()).toBe(1);
  });

  it('detener aborta el flujo y no programa reintentos', async () => {
    const abierto = abrirFlujo();
    const vivo = crear();
    vivo.iniciar();
    await abierto;

    vivo.detener();
    await avanzar(10 * 60_000);

    expect(vivo.activa()).toBe(false);
    expect(flujosVivos()).toBe(0);
    expect(peticiones()).toBe(1);
  });

  it('detener durante la espera de un reintento lo cancela', async () => {
    fallarRed(true);
    const vivo = crear();
    vivo.iniciar();
    await vaciar();

    vivo.detener();
    await avanzar(10 * 60_000);

    expect(peticiones()).toBe(1);
  });

  it('iniciar, detener e iniciar seguidos dejan una sola conexión', async () => {
    const vivo = crear();
    vivo.iniciar();
    vivo.detener();
    vivo.iniciar();
    await vaciar();
    // La primera nunca pidió el flujo: su token llegó con otra generación.
    expect(peticiones()).toBe(1);

    // La petición pendiente (sin respuesta) se aborta al detener; la nueva abre.
    vivo.detener();
    const abierto = abrirFlujo();
    vivo.iniciar();
    await abierto;
    await avanzar(10_000);

    expect(peticiones()).toBe(2);
    expect(flujosVivos()).toBe(1);
  });

  it('una respuesta que llega después de detener se cancela sin leerse', async () => {
    let responder: (respuesta: RespuestaFlujo) => void = () => undefined;
    const cancelar = jest.fn(() => Promise.resolve());
    const vivo = crear({
      abrirFlujo: () =>
        new Promise<RespuestaFlujo>((resolver) => {
          responder = resolver;
        }),
    });
    vivo.iniciar();
    await vaciar();
    vivo.detener();

    responder({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      body: { getReader: () => ({ read: jest.fn(), cancel: cancelar }) },
    });
    await vaciar();

    expect(cancelar).toHaveBeenCalledTimes(1);
  });
});

describe('reconexión', () => {
  it('reintenta con espera creciente (1 s, 2 s, 4 s... tope 30 s) y se detiene tras 8 reintentos', async () => {
    const esperas: number[] = [];
    const temporizadores: Temporizadores = {
      setTimeout: (fn, ms) => {
        esperas.push(ms);
        return setTimeout(fn, ms);
      },
      clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    };
    fallarRed(true);
    crear({ temporizadores }).iniciar();
    await vaciar();

    for (const espera of [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000]) {
      await esperarReintento(espera);
    }
    await avanzar(10 * 60_000);

    expect(esperas).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000]);
    expect(peticiones()).toBe(1 + MAX_REINTENTOS);
    expect(conexion?.ultimoError()).toBeInstanceOf(ErrorDeRed);
    expect(esperaReconexion(20)).toBe(ESPERA_MAX_MS);
  });

  it.each(['cortar', 'fallar'] as const)('si el servidor hace %s el flujo, reconecta en 1 s', async (accion) => {
    const primero = abrirFlujo();
    const vivo = crear();
    vivo.iniciar();
    (await primero)[accion]();
    await vaciar();

    const segundo = abrirFlujo();
    await esperarReintento(1000);
    await segundo;

    expect(vivo.ultimoError()).toBeInstanceOf(ErrorDeRed);
    expect(flujosVivos()).toBe(1);
  });

  it('al abrir bien reinicia el contador: el siguiente corte vuelve a esperar 1 s', async () => {
    fallarRed();
    fallarRed();
    crear().iniciar();
    await vaciar();
    await esperarReintento(1000);
    const abierto = abrirFlujo();
    await esperarReintento(2000);
    (await abierto).cortar();
    await vaciar();

    await esperarReintento(1000);
  });

  it.each([
    ['un 500', 500, 'application/json'],
    ['un 200 que no es text/event-stream', 200, 'text/html'],
  ])('%s es un error de respuesta y se reintenta', async (_caso, status, tipo) => {
    responderEstado(status, tipo);
    const vivo = crear();
    vivo.iniciar();
    await vaciar();

    expect(vivo.ultimoError()).toBeInstanceOf(ApiError);
    expect((vivo.ultimoError() as ApiError).status).toBe(status);
    await esperarReintento(1000);
  });
});

describe('consulta de respaldo', () => {
  it('arranca desde 3 fallos seguidos, consulta cada 30 s y se detiene al volver el flujo', async () => {
    consultar.mockImplementation(() => Promise.reject(new Error('lista ficticia sin red')));
    fallarRed(true);
    crear().iniciar();
    await vaciar();
    await avanzar(1000);
    await avanzar(2000);
    // Tercer fallo: todavía no consulta, la primera consulta llega a los 30 s.
    expect(peticiones()).toBe(3);
    await avanzar(INTERVALO_RESPALDO_MS - 1);
    expect(consultar).not.toHaveBeenCalled();
    await avanzar(1);
    expect(consultar).toHaveBeenCalledTimes(1);
    await avanzar(INTERVALO_RESPALDO_MS);
    expect(consultar).toHaveBeenCalledTimes(2);

    // El siguiente reintento (a los 88 s del tercer fallo) abre: una consulta para ponerse al día.
    const abierto = abrirFlujo();
    await avanzar(INTERVALO_RESPALDO_MS);
    await abierto;
    expect(consultar).toHaveBeenCalledTimes(3);

    await avanzar(3 * INTERVALO_RESPALDO_MS);
    expect(consultar).toHaveBeenCalledTimes(3);
    expect(flujosVivos()).toBe(1);
  });
});

describe('401 al abrir', () => {
  it('renueva una vez y reabre con el token nuevo en Authorization', async () => {
    responderEstado(401);
    obtenerToken.mockResolvedValueOnce(TOKEN).mockResolvedValue(TOKEN_NUEVO);
    const abierto = abrirFlujo();
    crear().iniciar();
    await abierto;

    expect(renovar).toHaveBeenCalledTimes(1);
    expect(renovar).toHaveBeenCalledWith(TOKEN);
    expect(llamadasFlujo().map((llamada) => llamada.cabeceras.Authorization)).toEqual([
      `Bearer ${TOKEN}`,
      `Bearer ${TOKEN_NUEVO}`,
    ]);
  });

  it('si la sesión fue rechazada, corta del todo', async () => {
    responderEstado(401);
    renovar.mockResolvedValue('rechazada');
    const vivo = crear();
    vivo.iniciar();
    await avanzar(10 * 60_000);

    expect(renovar).toHaveBeenCalledTimes(1);
    expect(peticiones()).toBe(1);
    expect(vivo.activa()).toBe(false);
  });

  it('un segundo 401 seguido tras renovar corta del todo', async () => {
    responderEstado(401);
    responderEstado(401);
    const vivo = crear();
    vivo.iniciar();
    await avanzar(10 * 60_000);

    expect(renovar).toHaveBeenCalledTimes(1);
    expect(peticiones()).toBe(2);
    expect(vivo.activa()).toBe(false);
  });

  it.each(['fallida', 'descartada'])('una renovación %s cuenta como fallo y reintenta con espera', async (resultado) => {
    responderEstado(401);
    renovar.mockResolvedValue(resultado);
    const vivo = crear();
    vivo.iniciar();
    await vaciar();

    expect(vivo.ultimoError()).toEqual(expect.objectContaining({ status: 401 }));
    const abierto = abrirFlujo();
    await esperarReintento(1000);
    await abierto;
    expect(vivo.activa()).toBe(true);
  });

  it('si se detiene mientras renueva, no reabre', async () => {
    responderEstado(401);
    let terminar: (resultado: string) => void = () => undefined;
    renovar.mockImplementation(
      () =>
        new Promise((resolver) => {
          terminar = resolver;
        }),
    );
    const vivo = crear();
    vivo.iniciar();
    await vaciar();
    vivo.detener();
    terminar('renovada');
    await avanzar(60_000);

    expect(peticiones()).toBe(1);
  });
});
