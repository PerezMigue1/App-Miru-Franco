/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { screen } from 'expo-router/testing-library';

import { reiniciarMemoriaCarrito } from '@/features/tienda/models/carritoModel';
import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { configuracionTienda, marcarCasillasCompra, rutaConfiguracionTienda } from '../../helpers/checkoutFicticio';
import { LIMITE_MS } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, tocar } from '../../helpers/pantallasReserva';
import {
  abrirTienda,
  APARTAR,
  esperarPasoCompra,
  IR_A_PAGAR,
  OPCION_EN_LINEA,
  OPCION_EN_SALON,
  PASO_CONFIRMAR,
  PASO_PAGO,
  PASO_RECOGER,
  sinBotones,
  ultimoCuerpo,
} from '../../helpers/pantallasTienda';
import { CARRITO_CRUDO, METODO_EN_LINEA, METODO_EN_SALON, RUTA_CREAR_PEDIDO } from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.5: el checkout solo ofrece las formas de pago activas en la configuración ficticia, con la
 * app real (renderRouter), la sesión de CLIENTA_CITAS, el reloj fijo y el servidor simulado
 * (http://api.test). Con Mercado Pago de la tienda apagado solo queda pagar al recoger; sin métodos
 * en el salón solo queda pagar en línea. En los dos casos la única opción ya viene elegida, el botón
 * final es el de esa forma y el pedido se crea con ella.
 */

type Cambios = Parameters<typeof configuracionTienda>[0];

describe('Checkout con una forma de pago apagada (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarMemoriaCarrito();
    reiniciarConfiguracionPublica();
    reiniciarDocumentosLegales();
    limpiarArchivos();
  });

  it.each<[string, Cambios, RegExp, RegExp, string, string, string]>([
    [
      'Mercado Pago de la tienda apagado: solo pagar al recoger',
      { pagos: { mercadoPagoTienda: false } },
      OPCION_EN_SALON,
      OPCION_EN_LINEA,
      APARTAR,
      IR_A_PAGAR,
      METODO_EN_SALON,
    ],
    [
      'sin métodos en el salón: solo pagar en línea',
      { pagos: { mercadoPagoTienda: true, metodosSalon: [] } },
      OPCION_EN_LINEA,
      OPCION_EN_SALON,
      IR_A_PAGAR,
      APARTAR,
      METODO_EN_LINEA,
    ],
  ])(
    '%s',
    async (_caso, cambios, ofrecida, apagada, boton, otroBoton, metodo) => {
      const abierta = await abrirTienda('/carrito', {
        items: CARRITO_CRUDO,
        rutas: rutaConfiguracionTienda(configuracionTienda(cambios)),
      });
      await tocar('Continuar compra');
      await esperarRuta(abierta.app, '/checkout');
      await esperarPasoCompra(PASO_RECOGER);
      await tocar('Continuar');
      await esperarPasoCompra(PASO_PAGO);

      expect(screen.getAllByRole('radio')).toHaveLength(1);
      expect(screen.getByRole('radio', { name: ofrecida })).toBeChecked();
      expect(screen.queryByRole('radio', { name: apagada })).not.toBeOnTheScreen();

      await tocar('Continuar');
      await esperarPasoCompra(PASO_CONFIRMAR);
      sinBotones(otroBoton);
      await marcarCasillasCompra();
      await tocar(boton);

      await esperarRuta(abierta.app, '/pedido-confirmado/701');
      expect(ultimoCuerpo(abierta, RUTA_CREAR_PEDIDO)).toMatchObject({ metodoPago: metodo });
      revisarConsola();
    },
    LIMITE_MS,
  );
});
