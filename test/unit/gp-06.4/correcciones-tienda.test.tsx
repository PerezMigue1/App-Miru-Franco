/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { mensajeErrorCarrito } from '@/features/tienda/models/carritoModel';
import {
  etiquetaEstadoPedido,
  mensajeCrearPedido,
  pideRevisarCarrito,
  type EstadoPagoPedido,
} from '@/features/tienda/models/pedidoModel';
import { ApiError } from '@/shared/api/apiClient';

import { AHORA, conError, cuerpoError, masMinutos } from '../../helpers/citasFicticias';
import { abrirSesionSimulada } from '../../helpers/google';
import { LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirReserva,
  esperarRuta,
  prepararPruebasReserva,
  sinTextos,
  tocar,
  vecesEn,
  type PantallaReserva,
} from '../../helpers/pantallasReserva';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-06.4: pruebas de regresión de las correcciones de la tienda, cada una en rojo con el código
 * anterior. Las del modelo llaman a los models directo; las de pantalla abren la app real con
 * renderRouter, la sesión de CLIENTA_CITAS, el reloj fijo en AHORA y fetch simulado
 * (http://api.test). La corrección D1 (vistas y componentes sin models/) la revisa reglas-tienda.
 *
 * D2. Con el pago en línea en proceso, la confirmación no pide pagar antes de un plazo, la insignia
 *     dice "Pago en proceso" y "Revisar de nuevo" solo consulta el pago (nunca abre otro).
 * D3. El detalle del pedido consulta el pago en línea: en proceso no pide completarlo y "Revisar mi
 *     pago" abre la confirmación sin pagar; aprobado o cancelado actualiza el estado mostrado.
 * D4. Al crear el pedido, el producto retirado o sin precio pide revisar el carrito, y la forma de
 *     pago apagada en el salón se explica con un texto de la app.
 * D5. Cambiar la cantidad de un producto que se desactivó dice que ya no está disponible.
 */

const error400 = (mensaje: string) => new ApiError(400, mensaje);

/** Mensajes reales del backend (pedidos.service y carrito.service). */
const DEL_SERVIDOR = {
  retirado: 'Este producto ya no está a la venta (Shampoo hidratante)',
  sinPrecio: 'Este producto no tiene precio válido (Shampoo hidratante)',
  sinStock: 'Stock insuficiente o presentación no disponible (producto Shampoo hidratante)',
  enLineaApagado: 'El pago en línea no está disponible por ahora. Elige pagar al recoger en el salón.',
  enSalonApagado: 'El pago al recoger no está disponible por ahora. Elige pagar en línea.',
  productoNoDisponible: 'Este producto ya no está disponible',
} as const;

const PARA_CLIENTA = {
  retirado: 'Uno de tus productos ya no está en la tienda. Revisa tu carrito.',
  sinStock: 'Uno de tus productos ya no tiene piezas suficientes. Revisa tu carrito.',
  enLineaApagado: 'El pago en línea no está disponible por ahora. Elige pagar al recoger en el salón.',
  enSalonApagado: 'El pago al recoger no está disponible por ahora. Elige pagar en línea.',
  generico: 'No pudimos crear tu pedido. Intenta de nuevo en un momento.',
} as const;

// ── D4 y D5. Modelo ──────────────────────────────────────────────────────────────────────────

describe('D4. Errores al crear el pedido (modelo)', () => {
  it.each<[string, ApiError, string, boolean]>([
    ['400 producto que ya no está a la venta', error400(DEL_SERVIDOR.retirado), PARA_CLIENTA.retirado, true],
    ['400 producto sin precio válido', error400(DEL_SERVIDOR.sinPrecio), PARA_CLIENTA.retirado, true],
    ['400 sin existencias', error400(DEL_SERVIDOR.sinStock), PARA_CLIENTA.sinStock, true],
    ['404 presentación no encontrada', new ApiError(404, 'Presentación 3011 no encontrada'), PARA_CLIENTA.retirado, true],
    ['400 pago en línea apagado', error400(DEL_SERVIDOR.enLineaApagado), PARA_CLIENTA.enLineaApagado, false],
    ['400 pago al recoger apagado', error400(DEL_SERVIDOR.enSalonApagado), PARA_CLIENTA.enSalonApagado, false],
    ['otro 400', error400('Elige cómo pagar el pedido: en línea o al recoger en el salón.'), PARA_CLIENTA.generico, false],
  ])('%s: mensaje propio y si pide revisar el carrito', (_caso, error, mensaje, revisar) => {
    expect(mensajeCrearPedido(error)).toBe(mensaje);
    expect(pideRevisarCarrito(error)).toBe(revisar);
  });
});

describe('D5. Producto desactivado en el carrito (modelo)', () => {
  it.each([
    ['producto desactivado', DEL_SERVIDOR.productoNoDisponible, 'Este producto ya no está disponible.'],
    ['presentación no disponible', 'Presentación no disponible', 'Esta presentación ya no está disponible.'],
    ['otro 400', 'Cantidad inválida', 'No pudimos actualizar tu carrito. Intenta de nuevo en un momento.'],
  ])('400 %s', (_caso, delServidor, esperado) => {
    expect(mensajeErrorCarrito(error400(delServidor))).toBe(esperado);
  });
});

describe('D2. Insignia del pedido con el pago en proceso (modelo)', () => {
  it.each([
    ['en línea pendiente con el pago en proceso', 'pendiente_pago', 'mercado_pago', true, 'Pago en proceso'],
    ['en línea pendiente sin pago en proceso', 'pendiente_pago', 'mercado_pago', false, 'Pendiente de pago'],
    ['apartado en el salón', 'pendiente_pago', 'pago_en_salon', true, 'Apartado, pagas al recoger'],
    ['en línea ya pagado', 'pagado', 'mercado_pago', true, 'Pagado'],
  ])('%s', (_caso, estado, metodoPago, enProceso, texto) => {
    expect(etiquetaEstadoPedido({ estado, metodoPago }, enProceso).texto).toBe(texto);
  });

  it('el pago en proceso usa el tono de aviso', () => {
    expect(etiquetaEstadoPedido({ estado: 'pendiente_pago', metodoPago: 'mercado_pago' }, true).tono).toBe('aviso');
  });
});

// ── Pantallas ────────────────────────────────────────────────────────────────────────────────

const ID_PEDIDO = 77;
const RUTA_PEDIDO = `GET /api/pedidos/${ID_PEDIDO}?propios=true`;
const RUTA_ESTADO_PAGO = `GET /api/pagos-en-linea/mercadopago/estado/${ID_PEDIDO}`;
const RUTA_PREFERENCIA = 'POST /api/pagos-en-linea/mercadopago/preferencia?origen=app';
const RUTA_CREAR_PEDIDO = 'POST /api/pedidos?propios=true';

/** Pedido en línea de la clienta, hecho hace 30 minutos y por pagar (forma del backend). */
function pedidoCrudo(cambios: Record<string, unknown> = {}) {
  return {
    id: ID_PEDIDO,
    estado: 'pendiente_pago',
    metodoPago: 'mercado_pago',
    moneda: 'MXN',
    subtotal: '760',
    total: '760',
    creadoEn: masMinutos(AHORA, -30).toISOString(),
    pagadoEn: null,
    items: [
      {
        id: 1,
        cantidad: 2,
        precioUnitario: '380',
        subtotal: '760',
        nombreProducto: 'Shampoo hidratante',
        tamanio: '250ml',
        productoId: 301,
        presentacionId: 3011,
      },
    ],
    ...cambios,
  };
}

/** Rutas del pedido 77 con ese estado del pago en línea (o el manejador indicado). */
function rutasPedido(pago: EstadoPagoPedido | Manejador, pedidoEstado = 'pendiente_pago'): Record<string, Manejador> {
  return {
    [RUTA_PEDIDO]: () => respuesta({ success: true, data: pedidoCrudo() }),
    [RUTA_ESTADO_PAGO]: typeof pago === 'function' ? pago : () => respuesta({ estado: pago, pedidoEstado }),
  };
}

/** Nunca se pidió otra preferencia ni se abrió Mercado Pago. */
function sinPagarOtraVez(abierta: PantallaReserva): void {
  expect(vecesEn(abierta, RUTA_PREFERENCIA)).toBe(0);
  expect(abrirSesionSimulada()).not.toHaveBeenCalled();
}

const PLAZO = /Paga antes del/;
const PAGO_EN_PROCESO = 'Estado: Pago en proceso';

describe('Pantallas de la tienda', () => {
  const revisarConsola = prepararPruebasReserva();

  describe('D2. Confirmación con el pago en proceso', () => {
    it(
      'sin plazo, con "Pago en proceso" y "Revisar de nuevo" solo vuelve a consultar',
      async () => {
        const abierta = await abrirReserva(`/pedido-confirmado/${ID_PEDIDO}`, { rutas: rutasPedido('pendiente') });
        expect(await screen.findByRole('header', { name: 'Tu pago se está procesando' })).toBeOnTheScreen();
        expect(screen.getByLabelText(PAGO_EN_PROCESO)).toBeOnTheScreen();
        sinTextos(PLAZO);
        expect(screen.queryByLabelText(PLAZO)).not.toBeOnTheScreen();
        for (const boton of ['Pagar con Mercado Pago', 'Reintentar pago', 'Pagar de nuevo']) {
          expect(screen.queryByRole('button', { name: boton })).not.toBeOnTheScreen();
        }

        await tocar('Revisar de nuevo');
        await waitFor(() => expect(vecesEn(abierta, RUTA_ESTADO_PAGO)).toBe(2));
        sinPagarOtraVez(abierta);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'sin pago todavía, sigue el plazo y la insignia "Pendiente de pago"',
      async () => {
        await abrirReserva(`/pedido-confirmado/${ID_PEDIDO}`, { rutas: rutasPedido('sin_pago') });
        expect(await screen.findByRole('button', { name: 'Reintentar pago' })).toBeOnTheScreen();
        expect(screen.getByLabelText('Estado: Pendiente de pago')).toBeOnTheScreen();
        expect(screen.getByText(PLAZO)).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('D3. Detalle del pedido según el pago en línea', () => {
    const EN_PROCESO =
      'Tu pago se está procesando en Mercado Pago. No pagues de nuevo: te avisamos en la app y por correo cuando se acredite.';
    const FALTA_PAGAR = 'Falta completar tu pago en Mercado Pago. Tienes 24 horas desde que hiciste el pedido.';

    it.each<[string, EstadoPagoPedido]>([
      ['pendiente en Mercado Pago', 'pendiente'],
      ['en revisión', 'revision'],
    ])(
      'pago %s: texto en proceso, sin plazo y "Revisar mi pago" abre la confirmación sin pagar',
      async (_caso, estadoPago) => {
        const abierta = await abrirReserva(`/pedido/${ID_PEDIDO}`, { rutas: rutasPedido(estadoPago) });
        expect(await screen.findByText(EN_PROCESO)).toBeOnTheScreen();
        expect(screen.getByLabelText(PAGO_EN_PROCESO)).toBeOnTheScreen();
        sinTextos(PLAZO, FALTA_PAGAR);
        expect(screen.queryByRole('button', { name: 'Completar el pago' })).not.toBeOnTheScreen();

        await tocar('Revisar mi pago');
        await esperarRuta(abierta.app, `/pedido-confirmado/${ID_PEDIDO}`);
        await waitFor(() => expect(vecesEn(abierta, RUTA_ESTADO_PAGO)).toBe(2));
        expect(await screen.findByLabelText(PAGO_EN_PROCESO)).toBeOnTheScreen();
        sinPagarOtraVez(abierta);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, EstadoPagoPedido | Manejador, string]>([
      ['sin pago', 'sin_pago', 'Estado: Pendiente de pago'],
      ['rechazado', 'rechazado', 'Estado: Pendiente de pago'],
      ['sin respuesta de la consulta', conError(cuerpoError(500, 'Error interno')), 'Estado: Pendiente de pago'],
    ])(
      'pago %s: queda como antes, con plazo y "Completar el pago"',
      async (_caso, pago, insignia) => {
        await abrirReserva(`/pedido/${ID_PEDIDO}`, { rutas: rutasPedido(pago) });
        expect(await screen.findByText(FALTA_PAGAR)).toBeOnTheScreen();
        expect(screen.getByLabelText(insignia)).toBeOnTheScreen();
        expect(screen.getByText(PLAZO)).toBeOnTheScreen();
        expect(screen.getByRole('button', { name: 'Completar el pago' })).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, EstadoPagoPedido, string, string]>([
      ['aprobado', 'aprobado', 'pagado', 'Estado: Pagado'],
      ['cancelado', 'cancelado', 'cancelado', 'Estado: Cancelado'],
    ])(
      'pago %s: el estado mostrado se actualiza con el del servidor',
      async (_caso, estadoPago, pedidoEstado, insignia) => {
        await abrirReserva(`/pedido/${ID_PEDIDO}`, { rutas: rutasPedido(estadoPago, pedidoEstado) });
        expect(await screen.findByLabelText(insignia)).toBeOnTheScreen();
        sinTextos(PLAZO, FALTA_PAGAR);
        expect(screen.queryByRole('button', { name: 'Completar el pago' })).not.toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('D4. Checkout con un 400 al crear el pedido', () => {
    const ITEM_CARRITO = {
      id: 83011,
      cantidad: 2,
      precioReferencia: null,
      activo: true,
      productoId: 301,
      presentacionId: 3011,
      producto: { id: 301, nombre: 'Shampoo hidratante', marca: 'Botánica Ficticia', activo: true },
      presentacion: { id: 3011, tamanio: '250ml', imagenes: [], precio: '380', stock: 10, disponible: true, productoId: 301 },
    };

    it.each<[string, string, boolean, string, boolean]>([
      ['producto retirado', DEL_SERVIDOR.retirado, false, PARA_CLIENTA.retirado, true],
      ['producto sin precio', DEL_SERVIDOR.sinPrecio, false, PARA_CLIENTA.retirado, true],
      ['pago en línea apagado', DEL_SERVIDOR.enLineaApagado, true, PARA_CLIENTA.enLineaApagado, false],
      ['pago al recoger apagado', DEL_SERVIDOR.enSalonApagado, false, PARA_CLIENTA.enSalonApagado, false],
    ])(
      '%s: mensaje de la app y "Revisar mi carrito" solo si se arregla en el carrito',
      async (_caso, delServidor, enLinea, mensaje, revisar) => {
        const abierta = await abrirReserva('/checkout', {
          rutas: {
            'GET /api/carrito': () => respuesta({ success: true, count: 1, data: [ITEM_CARRITO] }),
            [RUTA_CREAR_PEDIDO]: conError(cuerpoError(400, delServidor)),
          },
        });
        await tocar('Continuar');
        if (enLinea) {
          await fireEvent.press(await screen.findByRole('radio', { name: /^Pagar en línea con Mercado Pago/ }));
        }
        await tocar('Continuar');
        await tocar(enLinea ? 'Ir a pagar con Mercado Pago' : 'Apartar mi pedido');

        expect(await screen.findByText(mensaje)).toBeOnTheScreen();
        expect(vecesEn(abierta, RUTA_CREAR_PEDIDO)).toBe(1);
        if (mensaje !== delServidor) {
          sinTextos(delServidor);
        }
        sinTextos(PARA_CLIENTA.generico);
        expect(Boolean(screen.queryByRole('button', { name: 'Revisar mi carrito' }))).toBe(revisar);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });
});
