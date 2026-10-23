/// <reference types="jest" />

import { obtenerCarritoRevisado, reiniciarMemoriaCarrito, tomarAvisosCarrito } from '@/features/tienda/models/carritoModel';
import {
  guardarReservaPendiente,
  reiniciarReservaPendiente,
  tomarReservaPendiente,
  type ReservaPendiente,
} from '@/features/citas/models/reservaPendiente';
import {
  configurarVigilancia,
  estadoPagoConocido,
  pedidosConPagoPendiente,
  reiniciarVerificacion,
  suscribir,
  verificarPago,
  type EventoVerificacion,
} from '@/features/tienda/models/verificacionPago';
import { alCerrarSesion, avisarCierreSesion, type MotivoCierreSesion } from '@/shared/api/eventosSesion';

import { respuesta } from '../../helpers/servidorSimulado';
import { CLIENTA_SESION, guardarEnAlmacen, sesionFicticia } from '../../helpers/sesionLimites';
import {
  ID_PEDIDO,
  RUTA_CARRITO,
  SHAMPOO,
  cuerpoListaTienda,
  estadoPagoPedidoCrudo,
  idItemCarrito,
  itemCarritoCrudo,
  presentacionCruda,
  rutaEstadoPagoPedido,
  rutaQuitarDelCarrito,
} from '../../helpers/tiendaFicticia';
import { servidorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-07.6, aviso de cierre de sesión (src/shared/api/eventosSesion.ts, Observer). Quien guarda en
 * memoria datos de la clienta se suscribe y los borra en ese momento, sin esperar a que alguien
 * vuelva a consultar: la verificación del pago de la tienda, la memoria del carrito y la reserva
 * pendiente (esta solo si la clienta salió a propósito o cambió la contraseña; con la sesión vencida
 * se conserva para retomarla). Aquí el aviso se da sin cambiar la generación de la sesión, para ver
 * que el borrado lo hace el aviso y no la revisión perezosa. Solo fetch es simulado.
 */

const MOTIVOS: MotivoCierreSesion[] = ['salida', 'vencida', 'cambioContrasena'];

beforeEach(async () => {
  reiniciarVerificacion();
  configurarVigilancia(null);
  reiniciarMemoriaCarrito();
  reiniciarReservaPendiente();
  await guardarEnAlmacen(sesionFicticia());
});

afterEach(() => {
  reiniciarVerificacion();
});

describe('alCerrarSesion y avisarCierreSesion', () => {
  it('cada oyente recibe el motivo una vez; uno que falla no impide avisar a los demás', () => {
    const falla = jest.fn(() => {
      throw new Error('oyente con error');
    });
    const oyente = jest.fn();
    const quitarFalla = alCerrarSesion(falla);
    const quitar = alCerrarSesion(oyente);
    expect(() => avisarCierreSesion('salida')).not.toThrow();
    expect(falla).toHaveBeenCalledTimes(1);
    expect(oyente).toHaveBeenCalledTimes(1);
    expect(oyente).toHaveBeenCalledWith('salida');
    quitarFalla();
    quitar();
    avisarCierreSesion('vencida');
    expect(oyente).toHaveBeenCalledTimes(1);
  });
});

describe('verificación del pago de la tienda', () => {
  it.each(MOTIVOS)('al cerrar sesión (%s) se borra: los oyentes reciben conocido null y la verificación en curso termina detenida', async (motivo) => {
    servidorVm({ [rutaEstadoPagoPedido()]: () => respuesta(estadoPagoPedidoCrudo('pendiente')) });
    const eventos: EventoVerificacion[] = [];
    const dejar = suscribir((evento) => eventos.push(evento));
    // 'revisar' deja programado otro intento mientras el pago siga pendiente.
    const enCurso = verificarPago(ID_PEDIDO, { motivo: 'revisar' });
    await new Promise((resolver) => {
      setTimeout(resolver, 0);
    });
    expect(estadoPagoConocido(ID_PEDIDO)).toMatchObject({ estado: 'pendiente' });

    avisarCierreSesion(motivo);

    expect(eventos.at(-1)).toEqual({ pedidoId: ID_PEDIDO, conocido: null, transicion: null });
    expect(estadoPagoConocido(ID_PEDIDO)).toBeNull();
    expect(pedidosConPagoPendiente()).toEqual([]);
    await expect(enCurso).resolves.toMatchObject({ detenida: true });
    dejar();
  });
});

describe('memoria del carrito', () => {
  const apagado = itemCarritoCrudo(SHAMPOO, 1, {
    presentacion: presentacionCruda({ ...SHAMPOO.presentaciones[0], disponible: false }),
  });

  beforeEach(() => {
    servidorVm({
      [RUTA_CARRITO]: () => respuesta(cuerpoListaTienda([apagado])),
      [rutaQuitarDelCarrito(idItemCarrito(SHAMPOO.presentaciones[0].id))]: () => respuesta({ success: true }),
    });
  });

  it('sin cerrar sesión, el aviso de lo retirado sigue pendiente', async () => {
    await obtenerCarritoRevisado();
    expect(tomarAvisosCarrito()).toHaveLength(1);
  });

  it.each(MOTIVOS)('al cerrar sesión (%s) se olvidan los avisos y la última lista vista', async (motivo) => {
    await obtenerCarritoRevisado();
    avisarCierreSesion(motivo);
    expect(tomarAvisosCarrito()).toEqual([]);
  });
});

describe('reserva pendiente', () => {
  const reserva: ReservaPendiente = {
    usuarioId: CLIENTA_SESION.id,
    servicioId: '3',
    especialistaId: '7',
    fecha: '2026-10-27',
    inicio: '2026-10-27T17:00:00.000Z',
    notas: '',
  };

  it.each([
    ['salida', null],
    ['cambioContrasena', null],
    ['vencida', reserva],
  ] as [MotivoCierreSesion, ReservaPendiente | null][])('al cerrar sesión (%s) queda %p', (motivo, esperado) => {
    guardarReservaPendiente(reserva);
    avisarCierreSesion(motivo);
    expect(tomarReservaPendiente(reserva.usuarioId, reserva.servicioId)).toEqual(esperado);
  });
});
