/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { router } from 'expo-router';
import { act, screen, waitFor } from 'expo-router/testing-library';

import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { conError, ERRORES } from '../../helpers/citasFicticias';
import { navegadorRegresa } from '../../helpers/google';
import { LIMITE_MS } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, sinTextos, tocar } from '../../helpers/pantallasReserva';
import { enSecuencia } from '../../helpers/pantallasServicios';
import {
  APARTAR,
  comprarHastaConfirmar,
  conEstadoPago,
  conEtiquetas,
  IR_A_PAGAR,
  revisarMercadoPago,
  veces,
  type PantallaTienda,
} from '../../helpers/pantallasTienda';
import type { Manejador } from '../../helpers/servidorSimulado';
import {
  CARRITO_CRUDO,
  deepLinkPedido,
  ERRORES_PEDIDOS,
  idItemCarrito,
  RUTA_CREAR_PEDIDO,
  RUTA_PREFERENCIA_PEDIDO,
  rutaCambiarCantidad,
  rutaEstadoPagoPedido,
} from '../../helpers/tiendaFicticia';
import {
  conPiezasAgotadas,
  lecturasCarritoDespuesDe,
  MENSAJE_PIEZAS_AGOTADAS,
  MENSAJE_STOCK_TECNICO,
  preferenciaCreada,
  TEXTOS_STOCK,
} from '../../helpers/tiendaStock409';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-09, bloque B: el 409 de piezas agotadas (ronda 8 del backend) con las pantallas reales y el
 * servidor simulado (http://api.test). Al crear el pedido, la clienta ve el message del backend tal
 * cual, el checkout relee el carrito (una lectura de GET /api/carrito) y ofrece revisarlo; al pedir el
 * pago del pedido ya creado, la confirmación muestra el mismo message y un reintento solo vuelve a
 * pedir la preferencia: nunca un segundo POST /api/pedidos.
 */

const VOLVER_AL_CARRITO = 'Volver al carrito';
const PISTA_VOLVER_AL_CARRITO = 'Abre tu carrito con las piezas que hay ahora';
const PAGAR = 'Pagar con Mercado Pago';
const REINTENTAR_PAGO = 'Reintentar pago';

/** El botón de pagar a la vista: "Pagar con Mercado Pago" o, tras un intento, "Reintentar pago". */
async function nombrePagar(): Promise<string> {
  await screen.findByRole('button', { name: new RegExp(`^(${PAGAR}|${REINTENTAR_PAGO})$`) });
  return screen.queryByRole('button', { name: PAGAR }) ? PAGAR : REINTENTAR_PAGO;
}

/**
 * La preferencia responde primero el 409 de piezas agotadas y luego se crea; el estado del pago es
 * sin_pago hasta que se creó una preferencia y aprobado al regresar de Mercado Pago.
 */
function pagoTrasPiezasAgotadas(): Record<string, Manejador> {
  let preferencias = 0;
  return {
    [RUTA_PREFERENCIA_PEDIDO]: (cuerpo) => {
      preferencias += 1;
      return preferencias === 1 ? conPiezasAgotadas()(cuerpo) : preferenciaCreada(cuerpo);
    },
    [rutaEstadoPagoPedido()]: (cuerpo) => conEstadoPago(preferencias >= 2 ? 'aprobado' : 'sin_pago')(cuerpo),
  };
}

const POST_PEDIDOS = { metodo: 'POST', ruta: '/api/pedidos?propios=true' } as const;
const POST_PREFERENCIA = { metodo: 'POST', ruta: '/api/pagos-en-linea/mercadopago/preferencia?origen=app' } as const;

describe('Tienda: 409 de piezas agotadas (GP-09)', () => {
  const revisarConsola = prepararPruebasReserva();

  it(
    'al crear el pedido muestra el message del backend, relee el carrito una vez y ofrece revisarlo',
    async () => {
      let abierta: PantallaTienda | null = null;
      // Mientras la app crea el pedido, en el servidor el shampoo bajó a una pieza en el carrito.
      const sinPiezas: Manejador = (cuerpo) => {
        abierta?.carrito.rutas[rutaCambiarCantidad(idItemCarrito(3011))]({ cantidad: 1 });
        return conPiezasAgotadas()(cuerpo);
      };
      abierta = await comprarHastaConfirmar(false, { items: CARRITO_CRUDO, rutas: { [RUTA_CREAR_PEDIDO]: sinPiezas } });
      conEtiquetas('Total: $1,142.50');

      await tocar(APARTAR);

      expect(await screen.findByText(MENSAJE_PIEZAS_AGOTADAS)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Revisar mi carrito' })).toBeOnTheScreen();
      // El resumen quedó con lo que hay ahora en el carrito: una sola lectura después del 409.
      await waitFor(() => conEtiquetas('Total: $762.50'));
      expect(lecturasCarritoDespuesDe(abierta.llamadas, POST_PEDIDOS.metodo, POST_PEDIDOS.ruta)).toBe(1);
      expect(veces(abierta, RUTA_CREAR_PEDIDO)).toBe(1);
      await esperarRuta(abierta.app, '/checkout');
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, Manejador, string]>([
    ['un 409 técnico de stock', conPiezasAgotadas(MENSAJE_STOCK_TECNICO), TEXTOS_STOCK.crearSinPiezas],
    ['un 409 de otro conflicto', conError(ERRORES_PEDIDOS.pedidoCambio), TEXTOS_STOCK.crearGenerico],
  ])(
    'con %s al crear el pedido cae al texto de la app',
    async (_caso, manejador, esperado) => {
      const abierta = await comprarHastaConfirmar(false, { items: CARRITO_CRUDO, rutas: { [RUTA_CREAR_PEDIDO]: manejador } });
      await tocar(APARTAR);

      expect(await screen.findByText(esperado)).toBeOnTheScreen();
      sinTextos(/Exception/, /presentacion 3011/, /cambió mientras lo editabas/);
      expect(veces(abierta, RUTA_CREAR_PEDIDO)).toBe(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'al pedir el pago del pedido ya creado muestra el message y cambia Pagar por Volver al carrito',
    async () => {
      navegadorRegresa(deepLinkPedido());
      const abierta = await comprarHastaConfirmar(true, {
        items: CARRITO_CRUDO,
        rutas: {
          ...pagoTrasPiezasAgotadas(),
        },
      });
      await tocar(IR_A_PAGAR);
      await esperarRuta(abierta.app, '/pedido-confirmado/701');

      expect(await screen.findByText(MENSAJE_PIEZAS_AGOTADAS)).toBeOnTheScreen();
      revisarMercadoPago(0);
      // Tras el 409 se relee el carrito con la misma lectura del Carrito.
      await waitFor(() =>
        expect(lecturasCarritoDespuesDe(abierta.llamadas, POST_PREFERENCIA.metodo, POST_PREFERENCIA.ruta)).toBeGreaterThanOrEqual(1),
      );
      // Pagar de nuevo daría el mismo 409: donde iba "Pagar" ahora va "Volver al carrito".
      const volver = await screen.findByRole('button', { name: VOLVER_AL_CARRITO });
      expect(volver.props.accessibilityHint).toBe(PISTA_VOLVER_AL_CARRITO);
      expect(screen.queryByRole('button', { name: PAGAR })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: REINTENTAR_PAGO })).not.toBeOnTheScreen();

      await tocar(VOLVER_AL_CARRITO);
      await esperarRuta(abierta.app, '/carrito');
      expect(veces(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(1);

      // Al volver a entrar al pedido se ofrece pagar otra vez (el stock pudo cambiar).
      await act(async () => {
        router.push('/pedido-confirmado/701');
      });
      await esperarRuta(abierta.app, '/pedido-confirmado/701');
      expect(screen.queryByRole('button', { name: VOLVER_AL_CARRITO })).not.toBeOnTheScreen();
      await tocar(await nombrePagar());
      expect(await screen.findByRole('header', { name: '¡Pago recibido!' })).toBeOnTheScreen();
      revisarMercadoPago(1);
      expect(veces(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(2);
      // Un solo pedido: el reintento solo pidió otra preferencia del mismo.
      expect(veces(abierta, RUTA_CREAR_PEDIDO)).toBe(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, Manejador, string]>([
    ['un 503 de Mercado Pago', conError(ERRORES.servicioNoDisponible), RESPALDO_TEXTOS['tienda.pedido.pago.noDisponible']],
    ['un 500', conError(ERRORES.interno), TEXTOS_STOCK.pagoGenerico],
  ])(
    'con %s al pedir el pago, Pagar sigue a la vista y no aparece Volver al carrito',
    async (_caso, manejador, aviso) => {
      const abierta = await comprarHastaConfirmar(true, {
        items: CARRITO_CRUDO,
        rutas: {
          [RUTA_PREFERENCIA_PEDIDO]: manejador,
          [rutaEstadoPagoPedido()]: conEstadoPago('sin_pago'),
        },
      });
      await tocar(IR_A_PAGAR);
      await esperarRuta(abierta.app, '/pedido-confirmado/701');

      expect(await screen.findByText(aviso)).toBeOnTheScreen();
      expect(await screen.findByRole('button', { name: await nombrePagar() })).toBeEnabled();
      expect(screen.queryByRole('button', { name: VOLVER_AL_CARRITO })).not.toBeOnTheScreen();
      expect(veces(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(1);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
