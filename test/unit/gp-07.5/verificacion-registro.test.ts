/// <reference types="jest" />

import * as pedidoModel from '@/features/tienda/models/pedidoModel';
import {
  cambiarPlano,
  configurarVigilancia,
  detener,
  esperaAntesDe,
  estadoPagoConocido,
  limpiarVerificacion,
  MAXIMO_CONSULTAS_PAGO,
  MAXIMO_CONSULTAS_SIN_PAGO,
  pedidosConPagoPendiente,
  reiniciarVerificacion,
  suscribir,
  verificacionEnCurso,
  verificarPago,
  type EventoVerificacion,
  type MotivoVerificacion,
  type ResultadoVerificacion,
} from '@/features/tienda/models/verificacionPago';
import { nuevaGeneracion } from '@/shared/api/tokenStorage';
import { duracion } from '@/shared/ui/tokens';

import { llamadasDeRuta, usarRelojFijo } from '../../helpers/citasFicticias';
import { abrirSesionSimulada } from '../../helpers/google';
import { respuesta, type Llamada } from '../../helpers/servidorSimulado';
import {
  estadoPagoPedidoCrudo,
  ID_PEDIDO,
  RUTA_PREFERENCIA_PEDIDO,
  rutaEstadoPagoPedido,
} from '../../helpers/tiendaFicticia';
import { diferida, enSecuencia, servidorVm, sinRed, type Salida } from '../../helpers/viewmodelsAuth';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.5: registro de la verificación del pago de los pedidos (models/verificacionPago.ts), sin
 * React. Solo se simula fetch (http://api.test, datos ficticios de tiendaFicticia) y la vigilancia
 * del primer plano (una fábrica falsa en lugar de AppState). Reloj fijo con temporizadores falsos.
 * El registro nunca pide preferencia ni abre Mercado Pago: cada prueba lo revisa al final.
 */

const RUTA_ESTADO = rutaEstadoPagoPedido();

let llamadas: Llamada[] = [];
let alCambiarPlano: ((enPrimerPlano: boolean) => void) | null = null;
const soltarVigilancia = jest.fn();
const fabrica = jest.fn((avisar: (enPrimerPlano: boolean) => void) => {
  alCambiarPlano = avisar;
  return () => {
    alCambiarPlano = null;
    soltarVigilancia();
  };
});

/** El servidor responde el estado del pago con cada salida en orden (la última se repite). */
function servidor(...salidas: (() => Salida)[]): void {
  llamadas = servidorVm({ [RUTA_ESTADO]: enSecuencia(...salidas) });
}

const pago = (estado: string) => () => respuesta(estadoPagoPedidoCrudo(estado));
const consultas = () => llamadasDeRuta(llamadas, RUTA_ESTADO).length;

/** Avanza el reloj y deja correr las promesas pendientes. */
async function correr(ms = 0): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
  }
}

/** Los eventos que recibe un oyente durante la prueba. */
function escuchar(): EventoVerificacion[] {
  const eventos: EventoVerificacion[] = [];
  suscribir((evento) => eventos.push(evento));
  return eventos;
}

const transiciones = (eventos: EventoVerificacion[]) =>
  eventos.flatMap((evento) => (evento.transicion ? [evento.transicion] : []));

usarRelojFijo();

beforeEach(() => {
  reiniciarVerificacion();
  fabrica.mockClear();
  soltarVigilancia.mockClear();
  alCambiarPlano = null;
  configurarVigilancia(fabrica);
  abrirSesionSimulada().mockClear();
});

afterEach(() => {
  // Nunca se pidió preferencia ni se abrió Mercado Pago.
  expect(llamadasDeRuta(llamadas, RUTA_PREFERENCIA_PEDIDO)).toHaveLength(0);
  expect(abrirSesionSimulada()).not.toHaveBeenCalled();
  configurarVigilancia(null);
  reiniciarVerificacion();
  llamadas = [];
});

describe('verificarPago: resultado de cada estado', () => {
  it('aprobado: una consulta, el estado queda guardado y la transición llega una sola vez', async () => {
    servidor(pago('aprobado'));
    const eventos = escuchar();
    const resultado = await verificarPago(ID_PEDIDO, { motivo: 'regreso' });
    expect(resultado).toEqual<ResultadoVerificacion>({
      pedidoId: ID_PEDIDO,
      estado: 'aprobado',
      pedidoEstado: 'pagado',
      error: null,
      agotada: false,
      detenida: false,
      consultas: 1,
    });
    expect(estadoPagoConocido(ID_PEDIDO)).toMatchObject({ estado: 'aprobado', verificando: false, porConfirmar: false, respuestas: 1 });
    expect(transiciones(eventos)).toEqual([{ anterior: null, estado: 'aprobado', pedidoEstado: 'pagado' }]);
    expect(pedidosConPagoPendiente()).toEqual([]);
  });

  it.each<[string, string, number, boolean]>([
    ['pendiente: reintenta hasta el tope y termina agotada', 'pendiente', MAXIMO_CONSULTAS_PAGO, true],
    ['en revisión: no reintenta (lo revisa el salón)', 'revision', 1, false],
  ])('en proceso, %s', async (_caso, estado, total, agotada) => {
    servidor(pago(estado));
    const promesa = verificarPago(ID_PEDIDO, { motivo: 'revisar' });
    await correr(60_000);
    expect(await promesa).toMatchObject({ estado, agotada, consultas: total, detenida: false });
    expect(consultas()).toBe(total);
    expect(pedidosConPagoPendiente()).toEqual([ID_PEDIDO]);
  });

  it('rechazado tras volver de Mercado Pago: una consulta, nada por confirmar ni pendiente', async () => {
    servidor(pago('rechazado'));
    expect(await verificarPago(ID_PEDIDO, { motivo: 'regreso' })).toMatchObject({ estado: 'rechazado', agotada: false });
    expect(consultas()).toBe(1);
    expect(estadoPagoConocido(ID_PEDIDO)).toMatchObject({ porConfirmar: false });
    expect(pedidosConPagoPendiente()).toEqual([]);
  });

  it('sin pago tras volver: tres consultas con espera creciente y queda por confirmar', async () => {
    servidor(pago('sin_pago'));
    const eventos = escuchar();
    const promesa = verificarPago(ID_PEDIDO, { motivo: 'regreso' });
    expect(estadoPagoConocido(ID_PEDIDO)).toMatchObject({ estado: null, verificando: true, porConfirmar: true });
    await correr();
    expect(consultas()).toBe(1);
    await correr(duracion.verificacionPagoEspera - 1);
    expect(consultas()).toBe(1);
    await correr(1);
    expect(consultas()).toBe(2);
    await correr(2 * duracion.verificacionPagoEspera - 1);
    expect(consultas()).toBe(2);
    await correr(1);
    expect(consultas()).toBe(MAXIMO_CONSULTAS_SIN_PAGO);
    await correr(60_000);
    expect(consultas()).toBe(MAXIMO_CONSULTAS_SIN_PAGO);
    expect(await promesa).toMatchObject({ estado: 'sin_pago', agotada: true, consultas: MAXIMO_CONSULTAS_SIN_PAGO });
    expect(estadoPagoConocido(ID_PEDIDO)).toMatchObject({ porConfirmar: true, verificando: false, agotada: true });
    expect(pedidosConPagoPendiente()).toEqual([ID_PEDIDO]);
    // Tres respuestas iguales: una sola transición.
    expect(transiciones(eventos)).toHaveLength(1);
  });

  it.each<[MotivoVerificacion]>([['apertura'], ['previoAlPago']])('sin pago con motivo %s: una sola consulta, sin agotar', async (motivo) => {
    servidor(pago('sin_pago'));
    expect(await verificarPago(String(ID_PEDIDO), { motivo })).toMatchObject({ estado: 'sin_pago', agotada: false, consultas: 1 });
    await correr(60_000);
    expect(consultas()).toBe(1);
  });

  it('la espera entre consultas crece desde la base hasta el tope', () => {
    expect([2, 3, 4, 5, 6, 7].map(esperaAntesDe)).toEqual([
      duracion.verificacionPagoEspera,
      2 * duracion.verificacionPagoEspera,
      duracion.verificacionPagoEsperaMaxima,
      duracion.verificacionPagoEsperaMaxima,
      duracion.verificacionPagoEsperaMaxima,
      duracion.verificacionPagoEsperaMaxima,
    ]);
  });

  it('pendiente y luego aprobado: dos transiciones y deja de reintentar', async () => {
    servidor(pago('pendiente'), pago('pendiente'), pago('aprobado'));
    const eventos = escuchar();
    const promesa = verificarPago(ID_PEDIDO, { motivo: 'revisar' });
    await correr(60_000);
    expect(await promesa).toMatchObject({ estado: 'aprobado', consultas: 3, agotada: false });
    expect(transiciones(eventos)).toEqual([
      { anterior: null, estado: 'pendiente', pedidoEstado: 'pendiente_pago' },
      { anterior: 'pendiente', estado: 'aprobado', pedidoEstado: 'pagado' },
    ]);
    // Otra verificación con el mismo resultado no vuelve a avisar la transición.
    await verificarPago(ID_PEDIDO);
    expect(transiciones(eventos)).toHaveLength(2);
  });
});

describe('verificarPago: errores', () => {
  it.each<[string, () => Salida]>([
    ['sin red', sinRed],
    ['un 500', () => respuesta({ statusCode: 500, message: 'Error interno ficticio' }, 500)],
  ])('%s: nunca rechaza, guarda el error y no reintenta', async (_caso, salida) => {
    servidor(salida);
    const resultado = await verificarPago(ID_PEDIDO, { motivo: 'revisar' });
    expect(resultado).toMatchObject({ estado: null, agotada: false, detenida: false, consultas: 1 });
    expect(resultado.error).not.toBeNull();
    await correr(60_000);
    expect(consultas()).toBe(1);
    expect(estadoPagoConocido(ID_PEDIDO)?.error).toBe(resultado.error);
  });

  it('una consulta que rechaza sin error también deja un error', async () => {
    const espia = jest.spyOn(pedidoModel, 'obtenerEstadoPagoPedido').mockRejectedValueOnce(undefined);
    const resultado = await verificarPago(ID_PEDIDO);
    expect(resultado.error).toBeInstanceOf(Error);
    espia.mockRestore();
  });

  it('un pedido no válido se resuelve con error sin consultar', async () => {
    servidor(pago('aprobado'));
    const resultado = await verificarPago('no-es-id');
    expect(resultado).toMatchObject({ pedidoId: 0, estado: null, consultas: 0 });
    expect(resultado.error).toBeInstanceOf(Error);
    expect(consultas()).toBe(0);
    expect(estadoPagoConocido('no-es-id')).toBeNull();
    expect(verificacionEnCurso('no-es-id')).toBe(false);
    detener('no-es-id');
    detener(999);
  });
});

describe('verificarPago: una sola verificación por pedido', () => {
  it('dos llamadas a la vez comparten la misma promesa y una sola petición', async () => {
    const pausa = diferida();
    servidor(() => pausa.promesa);
    const primera = verificarPago(ID_PEDIDO, { motivo: 'regreso' });
    const segunda = verificarPago(ID_PEDIDO, { motivo: 'regreso' });
    expect(segunda).toBe(primera);
    expect(verificacionEnCurso(ID_PEDIDO)).toBe(true);
    await correr();
    expect(consultas()).toBe(1);
    pausa.soltar(respuesta(estadoPagoPedidoCrudo('aprobado')));
    await correr();
    expect(await primera).toMatchObject({ estado: 'aprobado', consultas: 1 });
    expect(verificacionEnCurso(ID_PEDIDO)).toBe(false);
  });

  it('una llamada tras volver de Mercado Pago amplía la que iba en curso: también reintenta sin pago', async () => {
    const pausa = diferida();
    servidor(() => pausa.promesa, pago('sin_pago'));
    const eventos = escuchar();
    const apertura = verificarPago(ID_PEDIDO);
    const regreso = verificarPago(ID_PEDIDO, { motivo: 'regreso' });
    expect(regreso).toBe(apertura);
    expect(eventos.at(-1)?.conocido).toMatchObject({ porConfirmar: true });
    pausa.soltar(respuesta(estadoPagoPedidoCrudo('sin_pago')));
    await correr(60_000);
    expect(await apertura).toMatchObject({ agotada: true, consultas: MAXIMO_CONSULTAS_SIN_PAGO });
  });

  it('la respuesta vieja que llega tarde no pisa a una más nueva', async () => {
    const vieja = diferida();
    servidor(() => vieja.promesa, pago('aprobado'));
    const primera = verificarPago(ID_PEDIDO, { motivo: 'revisar' });
    await correr();
    detener(ID_PEDIDO);
    expect(await primera).toMatchObject({ detenida: true });
    expect(await verificarPago(ID_PEDIDO)).toMatchObject({ estado: 'aprobado' });
    vieja.soltar(respuesta(estadoPagoPedidoCrudo('pendiente')));
    await correr();
    expect(estadoPagoConocido(ID_PEDIDO)).toMatchObject({ estado: 'aprobado' });
  });

  it('un oyente que falla no detiene a los demás; al desuscribirse ya no recibe nada', async () => {
    servidor(pago('aprobado'));
    const quitarRoto = suscribir(() => {
      throw new Error('Oyente ficticio roto');
    });
    const eventos = escuchar();
    const otro = jest.fn();
    const quitarOtro = suscribir(otro);
    quitarOtro();
    expect(await verificarPago(ID_PEDIDO)).toMatchObject({ estado: 'aprobado' });
    expect(eventos.length).toBeGreaterThan(0);
    expect(otro).not.toHaveBeenCalled();
    quitarRoto();
  });
});

describe('Primer plano, segundo plano y cierre de sesión', () => {
  it('segundo plano detiene el reintento programado; la promesa se resuelve como detenida', async () => {
    servidor(pago('pendiente'));
    const promesa = verificarPago(ID_PEDIDO, { motivo: 'revisar' });
    await correr();
    expect(fabrica).toHaveBeenCalledTimes(1);
    alCambiarPlano?.(false);
    expect(await promesa).toMatchObject({ detenida: true, estado: 'pendiente', consultas: 1 });
    await correr(60_000);
    expect(consultas()).toBe(1);
    expect(estadoPagoConocido(ID_PEDIDO)).toMatchObject({ verificando: false });
  });

  it.each<[string, () => Response | Promise<Response>, Record<string, unknown>]>([
    ['respondió: la respuesta cuenta', () => respuesta(estadoPagoPedidoCrudo('pendiente')), { estado: 'pendiente', error: null }],
    ['falló: no deja error', () => Promise.reject(new TypeError('Network request failed')), { estado: null, error: null }],
  ])('segundo plano con la consulta en camino que luego %s, sin reintentar', async (_caso, salida, esperado) => {
    const enCamino = diferida();
    servidor(() => enCamino.promesa);
    const promesa = verificarPago(ID_PEDIDO, { motivo: 'revisar' });
    await correr();
    alCambiarPlano?.(false);
    expect(await promesa).toMatchObject({ detenida: true });
    enCamino.soltar(salida() as Response);
    await correr(60_000);
    expect(consultas()).toBe(1);
    expect(estadoPagoConocido(ID_PEDIDO)).toMatchObject(esperado);
  });

  it('al volver a primer plano con un pago pendiente lo verifica una vez, con sus reintentos', async () => {
    servidor(pago('pendiente'));
    await verificarPago(ID_PEDIDO);
    expect(consultas()).toBe(1);
    alCambiarPlano?.(true);
    expect(verificacionEnCurso(ID_PEDIDO)).toBe(true);
    // Otro aviso de primer plano mientras verifica no abre otra verificación.
    alCambiarPlano?.(true);
    await correr(60_000);
    expect(consultas()).toBe(1 + MAXIMO_CONSULTAS_PAGO);
  });

  it('al volver a primer plano sin nada pendiente no consulta y la vigilancia ya se soltó', async () => {
    servidor(pago('aprobado'));
    await verificarPago(ID_PEDIDO);
    expect(soltarVigilancia).toHaveBeenCalledTimes(1);
    expect(alCambiarPlano).toBeNull();
    cambiarPlano(true);
    await correr();
    expect(consultas()).toBe(1);
  });

  it('un pago por confirmar se revisa una vez al volver; si sigue sin aparecer, deja de estar pendiente', async () => {
    servidor(pago('sin_pago'));
    const regreso = verificarPago(ID_PEDIDO, { motivo: 'regreso' });
    await correr(60_000);
    await regreso;
    expect(pedidosConPagoPendiente()).toEqual([ID_PEDIDO]);
    alCambiarPlano?.(true);
    await correr(60_000);
    expect(consultas()).toBe(MAXIMO_CONSULTAS_SIN_PAGO + 1);
    expect(estadoPagoConocido(ID_PEDIDO)).toMatchObject({ porConfirmar: false, agotada: false });
    expect(pedidosConPagoPendiente()).toEqual([]);
    expect(soltarVigilancia).toHaveBeenCalledTimes(1);
  });

  it('sin vigilancia conectada, cambiarPlano también verifica los pendientes', async () => {
    configurarVigilancia(null);
    servidor(pago('revision'));
    await verificarPago(ID_PEDIDO);
    expect(fabrica).not.toHaveBeenCalled();
    cambiarPlano(true);
    await correr();
    expect(consultas()).toBe(2);
  });

  it('si cambia la sesión, la respuesta en camino se descarta y lo guardado se borra', async () => {
    const enCamino = diferida();
    servidor(() => enCamino.promesa, pago('pendiente'));
    const eventos = escuchar();
    const promesa = verificarPago(ID_PEDIDO, { motivo: 'revisar' });
    await correr();
    nuevaGeneracion();
    expect(estadoPagoConocido(ID_PEDIDO)).toBeNull();
    expect(pedidosConPagoPendiente()).toEqual([]);
    enCamino.soltar(respuesta(estadoPagoPedidoCrudo('aprobado')));
    await correr(60_000);
    expect(await promesa).toMatchObject({ detenida: true });
    expect(consultas()).toBe(1);
    expect(eventos.at(-1)).toEqual({ pedidoId: ID_PEDIDO, conocido: null, transicion: null });
    expect(transiciones(eventos)).toEqual([]);
  });

  it('con un pago pendiente de la sesión anterior, volver a primer plano no consulta nada', async () => {
    servidor(pago('pendiente'));
    await verificarPago(ID_PEDIDO);
    nuevaGeneracion();
    cambiarPlano(true);
    await correr(60_000);
    expect(consultas()).toBe(1);
  });

  it('limpiarVerificacion (cierre de sesión) suelta el reintento programado, avisa y deja de vigilar', async () => {
    servidor(pago('pendiente'));
    const eventos = escuchar();
    const promesa = verificarPago(ID_PEDIDO, { motivo: 'revisar' });
    await correr();
    limpiarVerificacion();
    expect(await promesa).toMatchObject({ detenida: true });
    await correr(60_000);
    expect(consultas()).toBe(1);
    expect(eventos.at(-1)?.conocido).toBeNull();
    expect(soltarVigilancia).toHaveBeenCalledTimes(1);
    expect(estadoPagoConocido(ID_PEDIDO)).toBeNull();
  });
});
