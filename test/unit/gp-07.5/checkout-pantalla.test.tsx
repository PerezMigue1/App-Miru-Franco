/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import {
  casillaReembolsos,
  casillaTerminos,
  configuracionTienda,
  escriturasCompra,
  rutaConfiguracionTienda,
} from '../../helpers/checkoutFicticio';
import { LIMITE_MS } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, sinTextos, tocar } from '../../helpers/pantallasReserva';
import { abrirTienda, conTextos, esperarPasoCompra, PASO_CONFIRMAR, PASO_PAGO, PASO_RECOGER } from '../../helpers/pantallasTienda';
import { CARRITO_CRUDO } from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.5: el checkout con las pantallas reales y la configuración ficticia del servidor simulado
 * (http://api.test). Los datos para recoger salen de la configuración (nunca los fijos de antes), la
 * forma de pago muestra solo las activas con sus plazos y, al recoger, los datos de transferencia si
 * está activa; el último paso trae la información de la compra con Profeco y las casillas
 * obligatorias, cuyo enlace abre el visor legal sin perder lo que la clienta ya marcó.
 */

type Cambios = Parameters<typeof configuracionTienda>[0];

/** Abre el checkout con el carrito de ejemplo y la configuración ficticia con esos cambios. */
async function abrirCheckout(cambios: Cambios = {}) {
  const abierta = await abrirTienda('/checkout', {
    items: CARRITO_CRUDO,
    rutas: rutaConfiguracionTienda(configuracionTienda(cambios)),
  });
  // La configuración de la red llega al abrir la app: el nombre del salón lo confirma.
  expect(await screen.findByText('Salón Ficticio de Prueba')).toBeOnTheScreen();
  await esperarPasoCompra(PASO_RECOGER);
  return abierta;
}

describe('Checkout con la configuración del sitio (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarConfiguracionPublica();
    reiniciarDocumentosLegales();
    limpiarArchivos();
    jest.mocked(Linking.openURL).mockReset().mockResolvedValue(true);
  });

  it(
    'recoger, forma de pago y confirmar con los datos, reglas y textos de la configuración',
    async () => {
      const abierta = await abrirCheckout();

      // Paso 1: salón, horario, mapa y teléfono de la configuración.
      conTextos(
        'Calle Inventada 123, Centro, Ciudad Ficticia, Estado',
        'Martes a jueves de 10:00 a 18:00 h.',
        'Domingos cerrado.',
        'Listo en un día hábil. Te avisamos en la app y por correo cuando puedas pasar por él.',
      );
      sinTextos(/Huejutla/);
      await fireEvent.press(screen.getByRole('link', { name: 'Ver cómo llegar en el mapa, Salón Ficticio de Prueba' }));
      await fireEvent.press(screen.getByRole('link', { name: 'Llamar al salón, +52 700 000 0000' }));
      expect(jest.mocked(Linking.openURL).mock.calls).toEqual([['https://maps.app.goo.gl/ficticio'], ['tel:+527000000000']]);

      // Paso 2: Mercado Pago está apagado para la tienda en la configuración ficticia.
      await tocar('Continuar');
      await esperarPasoCompra(PASO_PAGO);
      expect(screen.getAllByRole('radio')).toHaveLength(1);
      expect(screen.getByRole('radio', { name: /^Pagar al recoger en el salón/ })).toBeChecked();
      conTextos(
        'Recoges tu pedido en el salón.',
        'Tu pedido queda apartado. Pagas $1,142.50 en el mostrador cuando pases por él (efectivo o transferencia).',
        'Preparamos tu apartado en un máximo de 4 días; si no lo logramos, se cancela y te avisamos.',
        'Si no lo recoges en 10 días desde que te avisamos que está listo, el apartado se cancela.',
        'Banco Ficticio',
        'Titular Ficticia',
      );

      // Paso 3: total con IVA, información de la compra y Profeco.
      await tocar('Continuar');
      await esperarPasoCompra(PASO_CONFIRMAR);
      conTextos('Precios en pesos mexicanos con IVA incluido.', 'Información de tu compra', 'Quién te vende');
      conTextos(
        'Aceptamos cambios de producto dentro de los 5 días naturales siguientes a que lo recojas.',
        /dentro de los 6 días hábiles siguientes a que recojas tu pedido/,
      );
      sinTextos(/Responsable Ficticia/, /privacidad@salon\.test/);
      await fireEvent.press(screen.getByRole('link', { name: 'Escribir a contacto@salon.test' }));
      await fireEvent.press(screen.getByRole('link', { name: 'Llamar a Profeco, 55 5568 8722 (CDMX y zona metropolitana)' }));
      await fireEvent.press(screen.getByRole('link', { name: 'Sitio de Profeco, www.gob.mx/profeco' }));
      expect(jest.mocked(Linking.openURL).mock.calls.slice(2)).toEqual([
        ['mailto:contacto@salon.test'],
        ['tel:+525555688722'],
        ['https://www.gob.mx/profeco'],
      ]);

      // Sin las casillas no se envía nada y el error queda junto a cada una.
      await tocar('Apartar mi pedido');
      conTextos(
        'Para confirmar tu pedido acepta los Términos de venta.',
        'Para confirmar tu pedido marca que leíste la Política de reembolsos, cambios y cancelaciones.',
        'Para confirmar tu pedido marca las casillas de "Antes de confirmar".',
      );
      expect(escriturasCompra(abierta.llamadas)).toEqual([]);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'el enlace de la casilla abre el visor legal y al volver el checkout sigue igual',
    async () => {
      const abierta = await abrirCheckout({ pagos: { mercadoPagoTienda: true } });
      await tocar('Continuar');
      await tocar('Continuar');
      await esperarPasoCompra(PASO_CONFIRMAR);
      await fireEvent.press(screen.getByRole('checkbox', { name: casillaReembolsos() }));

      await fireEvent.press(screen.getByRole('link', { name: 'Términos de venta' }));
      await esperarRuta(abierta.app, '/legal/terminos');
      await act(async () => {
        router.back();
      });
      await esperarRuta(abierta.app, '/checkout');
      expect(await screen.findByRole('header', { name: PASO_CONFIRMAR })).toBeOnTheScreen();
      expect(screen.getByRole('checkbox', { name: casillaReembolsos() })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: casillaTerminos() })).not.toBeChecked();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, Cambios]>([
    ['apagada', { pagos: { metodosSalon: ['efectivo'] } }],
    ['sin datos', { pagos: { transferencia: null } }],
  ])(
    'con la transferencia %s no se muestran datos para transferir',
    async (_caso, cambios) => {
      await abrirCheckout(cambios);
      await tocar('Continuar');
      await esperarPasoCompra(PASO_PAGO);
      expect(screen.queryByText('Banco Ficticio')).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Copiar CLABE' })).not.toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'sin formas de pago activas explica que llame al salón y no deja continuar',
    async () => {
      await abrirCheckout({ pagos: { mercadoPagoTienda: false, metodosSalon: [] } });
      await tocar('Continuar');
      expect(await screen.findByRole('header', { name: 'Por ahora no podemos recibir pedidos en la app' })).toBeOnTheScreen();
      conTextos('Las formas de pago de la tienda están en pausa. Llámanos al +52 700 000 0000 y te ayudamos con tu compra.');
      expect(screen.queryByRole('radio')).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
      await tocar('Llamar al salón');
      await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith('tel:+527000000000'));
      revisarConsola();
    },
    LIMITE_MS,
  );
});
