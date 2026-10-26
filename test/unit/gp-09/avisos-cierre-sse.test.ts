/// <reference types="jest" />

import {
  crearConexionAvisos,
  ESPERA_MAX_MS,
  esperaTrasFallo,
  type ConexionAvisos,
  type DepsConexionAvisos,
} from '@/features/notificaciones/models/conexionAvisos';
import { ApiError } from '@/shared/api/apiClient';

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
 * GP-09, Bloque C: conexión en vivo de avisos (src/features/notificaciones/models/conexionAvisos.ts)
 * ante el evento 'cierre' del servidor (30 minutos sin avisos) y ante un 429 al abrir (más de 5
 * conexiones por usuaria o 20 por IP). El flujo sale por el expo/fetch simulado
 * (test/helpers/streamSimulado.ts) y los tiempos se revisan con temporizadores falsos. avisoModel
 * se simula: su normalizador acepta cualquier objeto con id de texto. Datos ficticios.
 */

jest.mock('@/features/notificaciones/models/avisoModel', () => ({
  normalizarAviso: (crudo: unknown) => {
    const fila = crudo as { id?: unknown } | null;
    return fila && typeof fila.id === 'string'
      ? { id: fila.id, tipo: 'general', titulo: 'Aviso', mensaje: '', fecha: null, leida: false, destino: null }
      : null;
  },
}));

const TOKEN = 'token-ficticio-cierre';
const MINUTO = 60_000;

let conexion: ConexionAvisos | null = null;
let alAviso: jest.Mock;
let consultar: jest.Mock;

function crear(cambios: Partial<DepsConexionAvisos> = {}): ConexionAvisos {
  conexion = crearConexionAvisos({
    alAviso,
    consultar,
    obtenerToken: () => Promise.resolve(TOKEN),
    renovar: () => Promise.resolve('renovada'),
    ...cambios,
  });
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

/** Abre una conexión sana y le llega el 'cierre' del servidor: queda en pausa. */
async function enPausa(): Promise<ConexionAvisos> {
  const abierto = abrirFlujo();
  const vivo = crear();
  vivo.iniciar();
  (await abierto).enviarCierre();
  await vaciar();
  return vivo;
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  reiniciarFlujos();
  alAviso = jest.fn();
  consultar = jest.fn(() => Promise.resolve());
});

afterEach(async () => {
  conexion?.detener();
  conexion = null;
  await vaciar();
  jest.useRealTimers();
});

describe('evento cierre', () => {
  it('deja la conexión en pausa: sin reintentos ni consulta de respaldo aunque pasen muchos minutos', async () => {
    const vivo = await enPausa();

    expect(vivo.enPausa()).toBe(true);
    expect(vivo.activa()).toBe(true);
    expect(flujosVivos()).toBe(0);
    await avanzar(45 * MINUTO);

    expect(peticiones()).toBe(1);
    expect(consultar).not.toHaveBeenCalled();
    expect(alAviso).not.toHaveBeenCalled();
    expect(vivo.ultimoError()).toBeNull();
  });

  it('lo que llega después del cierre en el mismo trozo se descarta', async () => {
    const abierto = abrirFlujo();
    crear().iniciar();
    const flujo = await abierto;

    flujo.enviarTexto('event: cierre\ndata: {"motivo":"inactividad"}\n\nevent: notificacion\ndata: {"id":"aviso-ficticio-tarde"}\n\n');
    await vaciar();

    expect(alAviso).not.toHaveBeenCalled();
    expect(flujosVivos()).toBe(0);
  });

  it('un cierre que llega mientras el flujo sigue abierto lo corta del lado de la app', async () => {
    const abierto = abrirFlujo();
    const vivo = crear();
    vivo.iniciar();
    const flujo = await abierto;

    flujo.enviarTexto('id: 0\nevent: cierre\ndata: {"motivo":"inactividad"}\n\n');
    await vaciar();

    expect(vivo.enPausa()).toBe(true);
    expect(flujo.vivo()).toBe(false);
    await avanzar(10 * MINUTO);
    expect(peticiones()).toBe(1);
  });
});

describe('reanudar', () => {
  it('en pausa reabre una sola vez aunque se llame muchas veces seguidas, y pone al día la lista', async () => {
    const vivo = await enPausa();
    const otro = abrirFlujo();

    const resultados = Array.from({ length: 12 }, () => vivo.reanudar());
    await otro;
    await avanzar(5 * MINUTO);

    expect(resultados.filter(Boolean)).toHaveLength(1);
    expect(resultados[0]).toBe(true);
    expect(vivo.enPausa()).toBe(false);
    expect(peticiones()).toBe(2);
    expect(flujosVivos()).toBe(1);
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(llamadasFlujo()[1].cabeceras.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('el flujo reabierto entrega avisos', async () => {
    const vivo = await enPausa();
    const otro = abrirFlujo();
    vivo.reanudar();

    (await otro).enviarAviso({ id: 'aviso-ficticio-reanudado' });
    await vaciar();

    expect(alAviso.mock.calls.map(([aviso]) => aviso.id)).toEqual(['aviso-ficticio-reanudado']);
  });

  it('con una conexión sana no hace nada: no reinicia el flujo ni pide la lista', async () => {
    const abierto = abrirFlujo();
    const vivo = crear();
    vivo.iniciar();
    await abierto;

    expect(vivo.reanudar()).toBe(false);
    await avanzar(MINUTO);

    expect(peticiones()).toBe(1);
    expect(flujosVivos()).toBe(1);
    expect(consultar).not.toHaveBeenCalled();
  });

  it('mientras espera un reintento no adelanta la petición', async () => {
    fallarRed(true);
    const vivo = crear();
    vivo.iniciar();
    await vaciar();

    expect(vivo.reanudar()).toBe(false);
    await vaciar();
    expect(peticiones()).toBe(1);
    await esperarReintento(1000);
  });

  it('detenida (sin sesión, avisos apagados o segundo plano) no abre nada', async () => {
    const vivo = await enPausa();
    vivo.detener();

    expect(vivo.enPausa()).toBe(false);
    expect(vivo.reanudar()).toBe(false);
    await avanzar(MINUTO);

    expect(peticiones()).toBe(1);
    expect(vivo.activa()).toBe(false);
  });

  it('sin haber iniciado nunca no abre nada', async () => {
    const vivo = crear();

    expect(vivo.reanudar()).toBe(false);
    await vaciar();
    expect(peticiones()).toBe(0);
  });

  it('iniciar otra vez estando en pausa también la reanuda, una sola vez', async () => {
    const vivo = await enPausa();
    abrirFlujo();

    vivo.iniciar();
    vivo.iniciar();
    expect(vivo.reanudar()).toBe(false);
    await vaciar();

    expect(peticiones()).toBe(2);
    expect(flujosVivos()).toBe(1);
  });

  it('si al reanudar falla la red, sigue con los reintentos normales', async () => {
    const vivo = await enPausa();
    fallarRed();

    vivo.reanudar();
    await vaciar();
    expect(peticiones()).toBe(2);

    const otro = abrirFlujo();
    await esperarReintento(1000);
    await otro;
    expect(flujosVivos()).toBe(1);
    // Una consulta al volver: lo que llegó sin flujo no se repite.
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it('un segundo cierre vuelve a dejarla en pausa', async () => {
    const vivo = await enPausa();
    const otro = abrirFlujo();
    vivo.reanudar();
    (await otro).enviarCierre();
    await vaciar();

    expect(vivo.enPausa()).toBe(true);
    await avanzar(10 * MINUTO);
    expect(peticiones()).toBe(2);
    expect(flujosVivos()).toBe(0);
  });
});

describe('429 al abrir el flujo', () => {
  it('con Retry-After en segundos, el siguiente intento espera por lo menos esos segundos', async () => {
    responderEstado(429, 'application/json', { 'Retry-After': '45' });
    const vivo = crear();
    vivo.iniciar();
    await vaciar();

    const causa = vivo.ultimoError() as ApiError;
    expect(causa).toBeInstanceOf(ApiError);
    expect(causa.status).toBe(429);
    expect(causa.retryAfter).toBe(45);
    await esperarReintento(45_000);
  });

  it('sin Retry-After usa la espera creciente normal', async () => {
    responderEstado(429);
    const vivo = crear();
    vivo.iniciar();
    await vaciar();

    expect((vivo.ultimoError() as ApiError).retryAfter).toBeUndefined();
    await esperarReintento(1000);
  });

  it('con Retry-After menor que la espera creciente, gana la creciente', async () => {
    fallarRed();
    fallarRed();
    responderEstado(429, 'application/json', { 'Retry-After': '1' });
    crear().iniciar();
    await vaciar();
    await esperarReintento(1000);
    await esperarReintento(2000);

    // Tercer fallo (el 429): la creciente es de 4 s y gana a 1 s.
    await esperarReintento(4000);
  });

  it('con Retry-After en fecha HTTP espera hasta esa fecha', async () => {
    const ahora = Date.now();
    responderEstado(429, 'application/json', { 'Retry-After': new Date(ahora + 20_000).toUTCString() });
    const vivo = crear();
    vivo.iniciar();
    await vaciar();

    const segundos = (vivo.ultimoError() as ApiError).retryAfter ?? 0;
    expect(segundos).toBeGreaterThanOrEqual(19);
    expect(segundos).toBeLessThanOrEqual(20);
    await esperarReintento(segundos * 1000);
  });

  it('un 503 con Retry-After también lo respeta', async () => {
    responderEstado(503, 'application/json', { 'Retry-After': '12' });
    crear().iniciar();
    await vaciar();

    await esperarReintento(12_000);
  });

  it('un 500 con Retry-After no lo toma en cuenta', async () => {
    responderEstado(500, 'application/json', { 'Retry-After': '120' });
    crear().iniciar();
    await vaciar();

    await esperarReintento(1000);
  });
});

describe('esperaTrasFallo', () => {
  it.each([
    [1, undefined, 1000],
    [1, 45, 45_000],
    [3, 1, 4000],
    [8, 10, ESPERA_MAX_MS],
    [2, 600, 600_000],
  ])('fallo %p con retryAfter %p espera %p ms', (fallos, retryAfter, esperado) => {
    expect(esperaTrasFallo(fallos, retryAfter)).toBe(esperado);
  });

  it('nunca pasa de lo que acepta setTimeout (un valor mayor se dispararía al instante)', () => {
    expect(esperaTrasFallo(1, 10 ** 9)).toBe(2_147_483_647);
  });
});
