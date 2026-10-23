/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { mensajeErrorCarrito } from '@/features/tienda/models/carritoModel';
import { buscarPedidoRecienCreado, crearPreferenciaPedido, fechaYHora } from '@/features/tienda/models/pedidoModel';
import { reiniciarVerificacion, verificarPago } from '@/features/tienda/models/verificacionPago';
import { ApiError, crearErrorApi } from '@/shared/api/apiClient';
import { obtenerConfiguracion, reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { conError, errorDe, llamadasDeRuta, usarRelojFijo, type CuerpoError } from '../../helpers/citasFicticias';
import { RUTAS_DE_FONDO } from '../../helpers/datosClienta';
import { LIMITE_MS, ultimoBoton } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, sinTextos, tocar } from '../../helpers/pantallasReserva';
import {
  abrirTienda,
  APARTAR,
  comprarHastaConfirmar,
  conTextos,
  etiquetasConPista,
  veces,
} from '../../helpers/pantallasTienda';
import { pagoCrudo, rutasDevoluciones } from '../../helpers/pedidosFicticios';
import { importacionesProhibidas, src } from '../../helpers/reglasCodigo';
import { respuesta, servidorConRutas, type Manejador } from '../../helpers/servidorSimulado';
import {
  CARRITO_CRUDO,
  cuerpoMisPedidos,
  ERRORES_PEDIDOS,
  ERRORES_TIENDA,
  MENSAJES_PEDIDOS,
  estadoPagoPedidoCrudo,
  ID_PEDIDO,
  LINEAS_PEDIDO,
  METODO_EN_LINEA,
  MIS_PEDIDOS_CRUDOS,
  pedidoCrudo,
  pedidoEnEstado,
  RUTA_CREAR_PEDIDO,
  RUTA_MIS_PEDIDOS,
  RUTA_PREFERENCIA_PEDIDO,
  rutaCancelarPedido,
  rutaEstadoPagoPedido,
  rutaPagosPedido,
  type PedidoCrudo,
} from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.5: cada defecto detectado de la tienda con su prueba propia, con lo que ve la clienta en las
 * pantallas reales (renderRouter, sesión de CLIENTA_CITAS, reloj fijo y servidor simulado en
 * http://api.test) o en caja blanca cuando el defecto es del modelo:
 * D1 cancelar con el pago en proceso, D2 el 409 de una devolución en proceso, D3 la tarjeta de Mis
 * pedidos con el pago en proceso, D4 el pedido recién creado ambiguo, D5 la preferencia con un id
 * inválido, D6 el filtro de "presentación" del carrito, D7 Mis pedidos sin router ni sesión en la
 * vista y D8 el reembolso visible días después de cancelar.
 */

const t = (clave: Parameters<typeof obtenerTexto>[0], contexto = {}) => obtenerTexto(clave, contexto);
const pago = (estado: string): Manejador => () => respuesta(estadoPagoPedidoCrudo(estado));
const apiErrorDe = (cuerpo: CuerpoError) =>
  crearErrorApi({ tipo: 'respuesta', status: cuerpo.statusCode, cuerpo });

/** Espera el detalle del pedido ya cargado con esa insignia. */
async function esperarDetalle(id: number, estado: string): Promise<void> {
  expect(await screen.findByRole('header', { name: `Pedido #${id}` })).toBeOnTheScreen();
  expect(await screen.findByLabelText(`Estado: ${estado}`)).toBeOnTheScreen();
}

describe('Defectos de la tienda (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarConfiguracionPublica();
    jest.mocked(Linking.openURL).mockReset().mockResolvedValue(true);
  });

  describe('D1. "Cancelar pedido" no se ofrece con el pago en línea en proceso', () => {
    it.each<[string, string, boolean]>([
      ['pendiente en Mercado Pago: sin cancelar, solo revisar', 'pendiente', false],
      ['en revisión: sin cancelar, solo revisar', 'revision', false],
      ['sin pago: se puede cancelar y completar el pago', 'sin_pago', true],
    ])(
      '%s',
      async (_caso, estado, cancelable) => {
        await abrirTienda(`/pedido/${ID_PEDIDO}`, { rutas: { [rutaEstadoPagoPedido()]: pago(estado) } });
        await esperarDetalle(ID_PEDIDO, cancelable ? 'Pendiente de pago' : 'Pago en proceso');
        expect(Boolean(screen.queryByRole('button', { name: 'Cancelar pedido' }))).toBe(cancelable);
        expect(Boolean(screen.queryByRole('button', { name: 'Completar el pago' }))).toBe(cancelable);
        expect(Boolean(screen.queryByRole('button', { name: 'Revisar mi pago' }))).toBe(!cancelable);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('D2. El 409 de una devolución en proceso no dice "Tu pedido cambió"', () => {
    it(
      'explica que se comunique con el salón, con su teléfono para llamar, y no recarga a ciegas',
      async () => {
        const abierta = await abrirTienda('/pedido/703', {
          rutas: {
            [rutaCancelarPedido(703)]: conError(ERRORES_PEDIDOS.devolucionEnProceso),
            ...rutasDevoluciones(703, [], [pagoCrudo()]),
          },
        });
        await esperarDetalle(703, 'Pagado');
        await tocar('Cancelar pedido');
        await fireEvent.press(ultimoBoton('Sí, cancelar pedido'));

        expect(await screen.findByText(t('tienda.pedido.cancelar.devolucionEnProceso'))).toBeOnTheScreen();
        sinTextos(t('tienda.pedido.cancelar.cambio'), MENSAJES_PEDIDOS.devolucionEnProceso);
        await waitFor(() => expect(screen.queryByRole('header', { name: '¿Cancelar el pedido #703?' })).not.toBeOnTheScreen());
        const telefono = obtenerConfiguracion().salon.telefono;
        await fireEvent.press(screen.getByRole('link', { name: `Llamar al ${telefono}` }));
        expect(Linking.openURL).toHaveBeenCalledWith(`tel:+${telefono.replace(/\D/g, '')}`);
        expect(veces(abierta, rutaCancelarPedido(703))).toBe(1);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('D3. En Mis pedidos la tarjeta dice "Pago en proceso" con el pago en proceso', () => {
    it(
      'con lo que ya sabe el registro de la verificación, sin una consulta por pedido',
      async () => {
        const abierta = await abrirTienda('/mis-pedidos', { rutas: { [rutaEstadoPagoPedido()]: pago('pendiente') } });
        await waitFor(() => expect(etiquetasConPista('Abre el detalle del pedido')).toHaveLength(MIS_PEDIDOS_CRUDOS.length));
        expect(etiquetasConPista('Abre el detalle del pedido')[0]).toMatch(/estado: Pendiente de pago$/);
        // La lista sola nunca consulta el pago de cada pedido.
        expect(abierta.llamadas.filter((l) => l.ruta.includes('/mercadopago/estado/'))).toHaveLength(0);

        // Otra pantalla (la confirmación o el detalle) supo que el pago está en proceso.
        await act(() => verificarPago(ID_PEDIDO));
        await waitFor(() =>
          expect(etiquetasConPista('Abre el detalle del pedido')[0]).toMatch(/estado: Pago en proceso$/),
        );
        expect(etiquetasConPista('Abre el detalle del pedido').filter((e) => e.endsWith('Pago en proceso'))).toHaveLength(1);
        expect(veces(abierta, rutaEstadoPagoPedido())).toBe(1);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('D4. El checkout con el pedido recién creado ambiguo', () => {
    it(
      'el checkout no deja reintentar a ciegas: pide revisar Mis pedidos y no crea otro pedido',
      async () => {
        const sinRespuesta = (comoServidor: Manejador): Manejador => (cuerpo) => {
          comoServidor(cuerpo);
          return Promise.reject(new TypeError('Network request failed')) as unknown as Response;
        };
        const iguales: PedidoCrudo[] = [pedidoCrudo({ id: 709 }), pedidoCrudo({ id: 710 })];
        const abierta = await comprarHastaConfirmar(false, {
          items: CARRITO_CRUDO,
          crear: sinRespuesta,
          rutas: { [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos(iguales.map((p) => ({ ...p, metodoPago: 'pago_en_salon' })))) },
        });
        await tocar(APARTAR);

        expect(await screen.findByText(t('tienda.pedido.crear.revisarMisPedidos'))).toBeOnTheScreen();
        expect(screen.queryByRole('button', { name: APARTAR })).not.toBeOnTheScreen();
        expect(veces(abierta, RUTA_CREAR_PEDIDO)).toBe(1);
        expect(abierta.carrito.items()).toHaveLength(CARRITO_CRUDO.length);

        await tocar(t('tienda.pedido.crear.verMisPedidos'));
        await esperarRuta(abierta.app, '/mis-pedidos');
        expect(veces(abierta, RUTA_CREAR_PEDIDO)).toBe(1);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('D8. El reembolso se ve en el detalle también días después de cancelar', () => {
    it(
      'un pedido cancelado con su pago reembolsado lo dice con la fecha, al abrirlo y al volver a él',
      async () => {
        const cancelado = pedidoEnEstado('cancelado', { id: 707 });
        const reembolsadoEn = '2026-10-10T18:30:00.000Z';
        const abierta = await abrirTienda('/pedido/707', {
          pedidos: [cancelado],
          rutas: rutasDevoluciones(707, [], [pagoCrudo({ pedidoId: 707, estado: 'reembolsado', reembolsadoEn })]),
        });
        await esperarDetalle(707, 'Cancelado');
        expect(await screen.findByLabelText(`Estado: ${t('tienda.devoluciones.pago.reembolsado')}`)).toBeOnTheScreen();
        conTextos(t('tienda.devoluciones.pago.reembolsadoEl', { fecha: fechaYHora(reembolsadoEn) }));
        expect(veces(abierta, rutaPagosPedido(707))).toBe(1);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });
});

describe('Defectos de la tienda en el modelo (GP-07.5)', () => {
  usarRelojFijo();
  const simular = servidorConRutas(RUTAS_DE_FONDO);

  describe('D4. El pedido recién creado se busca con poco margen y sin adivinar entre dos', () => {

    it('dos pedidos iguales recién creados son "ambiguo"; uno de hace dos minutos no cuenta', async () => {
      const desde = Date.now();
      const dos = [pedidoCrudo({ id: 709 }), pedidoCrudo()];
      simular({ [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos(dos)) });
      await expect(buscarPedidoRecienCreado(LINEAS_PEDIDO, METODO_EN_LINEA, desde)).resolves.toEqual({ estado: 'ambiguo' });
      const viejo = [pedidoCrudo({ creadoEn: new Date(desde - 2 * 60_000).toISOString() })];
      simular({ [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos(viejo)) });
      await expect(buscarPedidoRecienCreado(LINEAS_PEDIDO, METODO_EN_LINEA, desde)).resolves.toEqual({ estado: 'ninguno' });
    });
  });

  describe('D5. La preferencia con un id inválido no llama al servidor', () => {

    it.each([['texto', 'abc'], ['cero', 0], ['vacío', '  ']])('id %s: ApiError 404, como obtenerPedido', async (_caso, id) => {
      const llamadas = simular({});
      expect(await errorDe(crearPreferenciaPedido(id))).toEqual(new ApiError(404, 'Pedido no encontrado'));
      expect(llamadasDeRuta(llamadas, RUTA_PREFERENCIA_PEDIDO)).toHaveLength(0);
    });
  });

  describe('D6. "Presentación" en un error del carrito solo cuenta con los textos exactos del backend', () => {
    it.each<[string, CuerpoError, string]>([
      ['"Presentación no encontrada"', ERRORES_TIENDA.presentacionNoEncontrada, 'Esta presentación ya no está disponible.'],
      ['"Presentación no disponible"', ERRORES_TIENDA.presentacionNoDisponible, 'Esta presentación ya no está disponible.'],
      [
        'otro 400 que menciona la presentación',
        { statusCode: 400, message: 'La presentación tiene datos que no se pudieron leer' },
        'No pudimos actualizar tu carrito. Intenta de nuevo en un momento.',
      ],
    ])('%s', (_caso, cuerpo, mensaje) => {
      expect(mensajeErrorCarrito(apiErrorDe(cuerpo))).toBe(mensaje);
    });
  });

  describe('D7. Mis pedidos no usa el router ni la sesión desde la vista', () => {
    it('MisPedidosView no importa expo-router ni useAuth: todo pasa por useMisPedidosViewModel', () => {
      const ruta = src('features', 'tienda', 'views', 'MisPedidosView.tsx');
      expect(
        importacionesProhibidas(ruta, ({ modulo }) => modulo === 'expo-router' || /useAuth$/.test(modulo)),
      ).toEqual([]);
    });
  });
});
