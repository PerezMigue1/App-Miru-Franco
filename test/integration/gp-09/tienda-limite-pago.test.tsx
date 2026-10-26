/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, fireEvent, screen } from 'expo-router/testing-library';

import { navegadorRegresa } from '../../helpers/google';
import { MENSAJE_LIMITE } from '../../helpers/limitesRed';
import { LIMITE_MS } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, tocar, tocarYEsperar } from '../../helpers/pantallasReserva';
import {
  abrirTienda,
  comprarHastaConfirmar,
  conEstadoPago,
  IR_A_PAGAR,
  revisarMercadoPago,
  veces,
  type PantallaTienda,
} from '../../helpers/pantallasTienda';
import type { Manejador } from '../../helpers/servidorSimulado';
import { CARRITO_CRUDO, deepLinkPedido, RUTA_CREAR_PEDIDO, RUTA_PREFERENCIA_PEDIDO, rutaEstadoPagoPedido } from '../../helpers/tiendaFicticia';
import { conLimitePago, preferenciaCreada } from '../../helpers/tiendaStock409';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-09, bloque B: el límite de la preferencia de pago (10 por minuto, 429 con message en español y
 * retryAfter) con las pantallas reales y el servidor simulado (http://api.test). La confirmación
 * muestra el message, el botón de pagar queda deshabilitado con "Intenta de nuevo en N s", que baja
 * cada segundo con el reloj falso, y al terminar regresa a su texto normal y vuelve a pedir el pago.
 * Pasa igual al llegar desde el checkout y desde "Completar el pago" del detalle del pedido.
 */

const PAGAR = 'Pagar con Mercado Pago';

/**
 * La preferencia responde primero el 429 de `segundos` y luego se crea; el estado del pago es
 * sin_pago hasta que se creó una preferencia (las revisiones del detalle y las previas al pago) y
 * aprobado al regresar de Mercado Pago.
 */
function pagoConLimite(segundos: number): Record<string, Manejador> {
  let preferencias = 0;
  return {
    [RUTA_PREFERENCIA_PEDIDO]: (cuerpo) => {
      preferencias += 1;
      return preferencias === 1 ? conLimitePago(segundos)(cuerpo) : preferenciaCreada(cuerpo);
    },
    [rutaEstadoPagoPedido()]: (cuerpo) => conEstadoPago(preferencias >= 2 ? 'aprobado' : 'sin_pago')(cuerpo),
  };
}

/** Adelanta el reloj falso un segundo. */
async function unSegundo(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1000);
  });
}

/**
 * Con el 429 de `segundos`: el message a la vista y el botón deshabilitado con la cuenta, que baja
 * cada segundo; tocarlo en la espera no pide otro pago. Al terminar, el botón regresa a "Pagar con
 * Mercado Pago" y tocarlo abre Mercado Pago con la segunda preferencia.
 */
async function revisarEsperaYPagar(abierta: PantallaTienda, segundos: number): Promise<void> {
  expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
  for (let restantes = segundos; restantes > 0; restantes--) {
    const boton = screen.getByRole('button', { name: `Intenta de nuevo en ${restantes} s` });
    expect(boton).toBeDisabled();
    await fireEvent.press(boton);
    expect(screen.queryByRole('button', { name: PAGAR })).not.toBeOnTheScreen();
    // Un 429 no es falta de piezas: no cambia la acción a volver al carrito.
    expect(screen.queryByRole('button', { name: 'Volver al carrito' })).not.toBeOnTheScreen();
    await unSegundo();
  }
  expect(veces(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(1);
  revisarMercadoPago(0);

  const boton = await screen.findByRole('button', { name: PAGAR });
  expect(boton).toBeEnabled();
  expect(screen.queryByRole('button', { name: /^Intenta de nuevo en/ })).not.toBeOnTheScreen();
  await tocar(PAGAR);
  expect(await screen.findByRole('header', { name: '¡Pago recibido!' })).toBeOnTheScreen();
  revisarMercadoPago(1);
  expect(veces(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(2);
}

describe('Tienda: límite de la preferencia de pago (GP-09)', () => {
  const revisarConsola = prepararPruebasReserva();

  it(
    'desde el checkout: 429 al abrir el pago, espera con la cuenta y luego paga sin crear otro pedido',
    async () => {
      navegadorRegresa(deepLinkPedido());
      const abierta = await comprarHastaConfirmar(true, {
        items: CARRITO_CRUDO,
        rutas: pagoConLimite(3),
      });
      await tocar(IR_A_PAGAR);
      await esperarRuta(abierta.app, '/pedido-confirmado/701');

      await revisarEsperaYPagar(abierta, 3);
      expect(veces(abierta, RUTA_CREAR_PEDIDO)).toBe(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'desde "Completar el pago" del detalle del pedido: la misma espera antes de volver a pedir el pago',
    async () => {
      navegadorRegresa(deepLinkPedido());
      const abierta = await abrirTienda('/pedido/701', { rutas: pagoConLimite(2) });
      await tocarYEsperar(abierta.app, 'Completar el pago', '/pedido-confirmado/701');

      await revisarEsperaYPagar(abierta, 2);
      expect(veces(abierta, RUTA_CREAR_PEDIDO)).toBe(0);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
