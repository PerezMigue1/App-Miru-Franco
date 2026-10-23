/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen } from 'expo-router/testing-library';

import { reiniciarMemoriaCarrito } from '@/features/tienda/models/carritoModel';
import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import {
  CONSENTIMIENTO_COMPRA,
  configuracionTienda,
  escriturasCompra,
  marcarCasillasCompra,
  rutaConfiguracionTienda,
} from '../../helpers/checkoutFicticio';
import { navegadorRegresa } from '../../helpers/google';
import { LIMITE_MS } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, retener, tocar } from '../../helpers/pantallasReserva';
import { enSecuencia, errorDelServidor } from '../../helpers/pantallasServicios';
import {
  abrirTienda,
  conEstadoPago,
  conTextos,
  esperarPasoCompra,
  IR_A_PAGAR,
  OPCION_EN_LINEA,
  PASO_CONFIRMAR,
  PASO_PAGO,
  PASO_RECOGER,
  revisarMercadoPago,
  ultimoCuerpo,
  veces,
} from '../../helpers/pantallasTienda';
import { consentimientosEnviados, RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';
import type { Manejador } from '../../helpers/servidorSimulado';
import {
  CARRITO_CRUDO,
  deepLinkPedido,
  RUTA_CREAR_PEDIDO,
  RUTA_PREFERENCIA_PEDIDO,
  rutaEstadoPagoPedido,
} from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.5: la compra en línea completa con la app real (renderRouter), la sesión de CLIENTA_CITAS, el
 * reloj fijo y el servidor simulado (http://api.test) con Mercado Pago de la tienda activo en la
 * configuración ficticia. Del carrito al checkout: sin las casillas no se envía nada; con ellas, el
 * servidor recibe primero los consentimientos (Términos de venta y Política de reembolsos con la
 * versión y el hash del documento ficticio) y después el pedido; luego la preferencia y el navegador
 * simulado; al volver, "Verificando tu pago" y luego Pagado. Si el consentimiento no se guarda, no hay
 * pedido. Mercado Pago nunca se abre de verdad.
 */

const t = (clave: Parameters<typeof obtenerTexto>[0]) => obtenerTexto(clave);
const EN_LINEA = configuracionTienda({ pagos: { mercadoPagoTienda: true } });

/** Del carrito al último paso del checkout eligiendo pagar en línea, sin marcar las casillas. */
async function llegarAConfirmarEnLinea(rutas: Record<string, Manejador>) {
  const abierta = await abrirTienda('/carrito', {
    items: CARRITO_CRUDO,
    rutas: { ...rutaConfiguracionTienda(EN_LINEA), ...rutas },
  });
  await tocar('Continuar compra');
  await esperarRuta(abierta.app, '/checkout');
  await esperarPasoCompra(PASO_RECOGER);
  await tocar('Continuar');
  await esperarPasoCompra(PASO_PAGO);
  await fireEvent.press(screen.getByRole('radio', { name: OPCION_EN_LINEA }));
  await tocar('Continuar');
  await esperarPasoCompra(PASO_CONFIRMAR);
  return abierta;
}

describe('Compra con pago en línea de principio a fin (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarMemoriaCarrito();
    reiniciarConfiguracionPublica();
    reiniciarDocumentosLegales();
    limpiarArchivos();
  });

  it(
    'las casillas bloquean; al marcarlas: consentimientos, pedido, preferencia, Mercado Pago y "Verificando tu pago" hasta Pagado',
    async () => {
      const pagoAlVolver = retener();
      navegadorRegresa(deepLinkPedido());
      const abierta = await llegarAConfirmarEnLinea({
        [rutaEstadoPagoPedido()]: enSecuencia(conEstadoPago('sin_pago'), pagoAlVolver.envolver(conEstadoPago('aprobado'))),
      });

      // Sin marcar las casillas no se envía nada.
      await tocar(IR_A_PAGAR);
      conTextos(t('tienda.checkout.faltaTerminos'), t('tienda.checkout.faltaReembolsos'), t('tienda.checkout.faltanCasillas'));
      expect(escriturasCompra(abierta.llamadas)).toEqual([]);

      await marcarCasillasCompra();
      await tocar(IR_A_PAGAR);
      await esperarRuta(abierta.app, '/pedido-confirmado/701');
      expect(await screen.findByRole('header', { name: t('tienda.pago.verificandoTitulo') })).toBeOnTheScreen();
      conTextos(t('tienda.pago.verificandoTexto'));

      // Primero el consentimiento, después el pedido y al final la preferencia de Mercado Pago.
      expect(escriturasCompra(abierta.llamadas)).toEqual([
        RUTA_CONSENTIMIENTOS,
        RUTA_CREAR_PEDIDO,
        RUTA_PREFERENCIA_PEDIDO,
      ]);
      expect(consentimientosEnviados(abierta.llamadas)).toEqual([CONSENTIMIENTO_COMPRA]);
      expect(ultimoCuerpo(abierta, RUTA_CREAR_PEDIDO)).toMatchObject({ metodoPago: 'mercado_pago' });
      expect(ultimoCuerpo(abierta, RUTA_PREFERENCIA_PEDIDO)).toEqual({ pedidoId: 701 });
      revisarMercadoPago(1);

      await pagoAlVolver.soltar();
      expect(await screen.findByRole('header', { name: t('tienda.pago.aprobadoTitulo') })).toBeOnTheScreen();
      expect(screen.getByLabelText('Estado: Pagado')).toBeOnTheScreen();
      expect(abierta.carrito.items()).toEqual([]);
      expect(veces(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'si el consentimiento no se guarda, lo dice sin el texto del servidor y no crea el pedido ni abre Mercado Pago',
    async () => {
      const abierta = await llegarAConfirmarEnLinea({ [RUTA_CONSENTIMIENTOS]: errorDelServidor });
      await marcarCasillasCompra();
      await tocar(IR_A_PAGAR);

      expect(
        await screen.findByText(`${t('tienda.checkout.consentimientoNoGuardado')} ${t('tienda.checkout.consentimientoGenerico')}`),
      ).toBeOnTheScreen();
      expect(screen.queryByText('Error interno ficticio')).not.toBeOnTheScreen();
      expect(escriturasCompra(abierta.llamadas)).toEqual([RUTA_CONSENTIMIENTOS]);
      expect(veces(abierta, RUTA_CREAR_PEDIDO)).toBe(0);
      revisarMercadoPago(0);
      expect(abierta.app.getPathname()).toBe('/checkout');
      expect(abierta.carrito.items()).toHaveLength(CARRITO_CRUDO.length);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
