/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { conError, cuerpoError } from '../../helpers/citasFicticias';
import { LIMITE_MS } from '../../helpers/pantallas';
import { prepararPruebasReserva, sinTextos, tocar } from '../../helpers/pantallasReserva';
import { abrirTienda, ultimoCuerpo, veces } from '../../helpers/pantallasTienda';
import {
  devolucionCruda,
  MENSAJES_DEVOLUCION,
  revocacionCruda,
  RUTA_SOLICITAR_DEVOLUCION,
  rutaRetirarDevolucion,
  servidorDevoluciones,
  type DevolucionCruda,
} from '../../helpers/pedidosFicticios';
import { rutaDevolucionesPedido, pedidoEnEstado, type PedidoCrudo } from '../../helpers/tiendaFicticia';
import type { Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.5: pedir una solicitud de cambio o reembolso y retirar una pendiente desde el detalle del
 * pedido, con las pantallas reales y el servidor simulado (http://api.test): cuándo se ofrece, qué
 * pide (tipo, causa, producto, sellado y detalle), lo que falta antes de enviar, el mensaje propio de
 * cada error del backend, que la nueva aparece en la sección al terminar, sin doble envío, y que
 * retirar pide confirmación. Datos ficticios; nunca se crea una devolución real.
 */

const t = (clave: Parameters<typeof obtenerTexto>[0], contexto = {}) => obtenerTexto(clave, contexto);
const BOTON = t('tienda.devoluciones.solicitar.boton');
const ENVIAR = t('tienda.devoluciones.solicitar.enviar');
const RETIRAR = t('tienda.devoluciones.retirar.boton');
const CONFIRMAR_RETIRO = t('tienda.devoluciones.retirar.confirmar');
const SHAMPOO = /^Shampoo hidratante \(250ml\)\./;
const SELLADO = t('tienda.devoluciones.solicitar.sellado');

const ENTREGADO: PedidoCrudo = pedidoEnEstado('entregado', { id: 706 });
const CANCELADO_PAGADO: PedidoCrudo = pedidoEnEstado('cancelado', { id: 707 });

async function abrirDetalle(pedido: PedidoCrudo, rutas: Record<string, Manejador>) {
  const abierta = await abrirTienda(`/pedido/${pedido.id}`, { pedidos: [pedido], rutas });
  expect(await screen.findByRole('header', { name: `Pedido #${pedido.id}` })).toBeOnTheScreen();
  expect(await screen.findByRole('header', { name: t('tienda.devoluciones.titulo') })).toBeOnTheScreen();
  return abierta;
}

/** Abre la hoja, elige el shampoo y marca que está sellado (cambio por producto sellado, lo primero). */
async function llenarCambioSellado() {
  await tocar(BOTON);
  expect(await screen.findByText(t('tienda.devoluciones.solicitar.politica', { diasCambioProducto: '7' }))).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('radio', { name: SHAMPOO }));
  await fireEvent.press(screen.getByRole('checkbox', { name: SELLADO }));
}

describe('Pedir y retirar una solicitud de cambio o reembolso (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarConfiguracionPublica();
  });

  it(
    'pedido entregado: pide lo que falta, envía una sola vez y la solicitud aparece en la sección',
    async () => {
      const servidor = servidorDevoluciones(706, [], []);
      const abierta = await abrirDetalle(ENTREGADO, servidor.rutas);
      expect(await screen.findByText(t('pedidos.sinDevoluciones'))).toBeOnTheScreen();

      await tocar(BOTON);
      // Cambio por producto sellado viene elegido; sin producto ni confirmación no se envía nada.
      expect(screen.getByRole('radio', { name: /^Cambio de producto\./ })).toBeChecked();
      expect(screen.getByRole('radio', { name: /^Producto sellado y sin abrir\./ })).toBeChecked();
      await tocar(ENVIAR);
      expect(await screen.findByText(t('tienda.devoluciones.solicitar.faltaArticulo'))).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('radio', { name: SHAMPOO }));
      await tocar(ENVIAR);
      expect(await screen.findByText(t('tienda.devoluciones.solicitar.faltaSellado'))).toBeOnTheScreen();
      expect(veces(abierta, RUTA_SOLICITAR_DEVOLUCION)).toBe(0);

      await fireEvent.press(screen.getByRole('checkbox', { name: SELLADO }));
      await fireEvent.changeText(screen.getByLabelText(t('tienda.devoluciones.solicitar.motivo')), '  Quería otro tono ');
      const enviar = screen.getByRole('button', { name: ENVIAR });
      await fireEvent.press(enviar);
      await fireEvent.press(enviar);

      expect(await screen.findByText(t('devoluciones.toastRegistrada'))).toBeOnTheScreen();
      expect(veces(abierta, RUTA_SOLICITAR_DEVOLUCION)).toBe(1);
      expect(ultimoCuerpo(abierta, RUTA_SOLICITAR_DEVOLUCION)).toEqual({
        pedidoId: 706,
        tipo: 'cambio',
        causa: 'sellado_sin_abrir',
        pedidoItemId: 93011,
        sellado: true,
        motivo: 'Quería otro tono',
      });
      expect(await screen.findByLabelText(`Estado: ${t('tienda.devoluciones.estado.pendiente')}`)).toBeOnTheScreen();
      expect(screen.getByText('Quería otro tono')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: `${RETIRAR}: ${t('tienda.devoluciones.tipo.cambio')}` })).toBeOnTheScreen();
      sinTextos(t('pedidos.sinDevoluciones'));
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'pedido cancelado y pagado: reembolso por el pedido completo, sin producto en el cuerpo',
    async () => {
      const servidor = servidorDevoluciones(707, [], []);
      const abierta = await abrirDetalle(CANCELADO_PAGADO, servidor.rutas);
      await tocar(BOTON);
      expect(screen.queryByRole('radio', { name: /^Cambio de producto\./ })).not.toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: /^Falta de existencias\./ })).toBeChecked();
      expect(screen.getByRole('radio', { name: /^Todo el pedido\./ })).toBeChecked();
      await fireEvent.press(screen.getByRole('radio', { name: /^Cancelado antes de estar listo\./ }));
      await tocar(ENVIAR);
      expect(await screen.findByText(t('devoluciones.toastRegistrada'))).toBeOnTheScreen();
      expect(ultimoCuerpo(abierta, RUTA_SOLICITAR_DEVOLUCION)).toEqual({ pedidoId: 707, tipo: 'reembolso', causa: 'cancelacion_antes_listo' });
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, PedidoCrudo, DevolucionCruda[]]>([
    ['un pedido pagado que aún no se recoge (se cancela o se revoca)', pedidoEnEstado('pagado', { id: 706 }), []],
    ['con una solicitud activa del pedido completo', ENTREGADO, [devolucionCruda({ pedidoId: 706, pedidoItemId: null, estado: 'aprobada' })]],
  ])(
    'no se ofrece con %s',
    async (_caso, pedido, iniciales) => {
      await abrirDetalle(pedido, servidorDevoluciones(706, iniciales, []).rutas);
      await waitFor(() => expect(screen.queryByText(t('tienda.devoluciones.cargando'))).not.toBeOnTheScreen());
      expect(screen.queryByRole('button', { name: BOTON })).not.toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, keyof typeof MENSAJES_DEVOLUCION, number, string, boolean]>([
    ['ya hay una activa', 'yaActiva', 409, t('tienda.devoluciones.error.yaActiva'), false],
    ['pasó el plazo de cambios (con el enlace para llamar)', 'plazoCambio', 400, t('tienda.devoluciones.error.plazoCambio', { diasCambioProducto: '7' }), true],
  ])(
    'si %s, la hoja se cierra, se avisa con el texto propio y se vuelve a leer la sección',
    async (_caso, mensaje, status, aviso, conLlamada) => {
      const servidor = servidorDevoluciones(706, [], []);
      const abierta = await abrirDetalle(ENTREGADO, {
        ...servidor.rutas,
        [RUTA_SOLICITAR_DEVOLUCION]: conError(cuerpoError(status, MENSAJES_DEVOLUCION[mensaje])),
      });
      const antes = veces(abierta, rutaDevolucionesPedido(706));
      await llenarCambioSellado();
      await tocar(ENVIAR);
      expect(await screen.findByText(aviso)).toBeOnTheScreen();
      sinTextos(MENSAJES_DEVOLUCION[mensaje]);
      await waitFor(() => expect(screen.queryByRole('button', { name: ENVIAR })).not.toBeOnTheScreen());
      expect(Boolean(screen.queryByRole('link', { name: /^Llamar al/ }))).toBe(conLlamada);
      await waitFor(() => expect(veces(abierta, rutaDevolucionesPedido(706))).toBeGreaterThan(antes));
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'si el salón no acepta la causa, el mensaje propio se queda en la hoja para corregir',
    async () => {
      const servidor = servidorDevoluciones(706, [], []);
      await abrirDetalle(ENTREGADO, {
        ...servidor.rutas,
        [RUTA_SOLICITAR_DEVOLUCION]: conError(cuerpoError(400, MENSAJES_DEVOLUCION.causaNoAplica)),
      });
      await llenarCambioSellado();
      await tocar(ENVIAR);
      expect(await screen.findByText(t('tienda.devoluciones.error.causaNoAplica'))).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: ENVIAR })).toBeOnTheScreen();
      sinTextos(MENSAJES_DEVOLUCION.causaNoAplica);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'sin respuesta pero guardada en el servidor: se muestra registrada y no se manda otra',
    async () => {
      const servidor = servidorDevoluciones(706, [], []);
      const crear = servidor.rutas[RUTA_SOLICITAR_DEVOLUCION];
      const perdida: Manejador = (cuerpo) => {
        crear(cuerpo);
        return Promise.reject(new TypeError('Network request failed')) as unknown as Response;
      };
      const abierta = await abrirDetalle(ENTREGADO, { ...servidor.rutas, [RUTA_SOLICITAR_DEVOLUCION]: perdida });
      await llenarCambioSellado();
      await tocar(ENVIAR);
      expect(await screen.findByText(t('devoluciones.toastRegistrada'))).toBeOnTheScreen();
      expect(veces(abierta, RUTA_SOLICITAR_DEVOLUCION)).toBe(1);
      expect(await screen.findByLabelText(`Estado: ${t('tienda.devoluciones.estado.pendiente')}`)).toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'retirar pide confirmación: Conservar no manda nada y Retirar la cancela una sola vez',
    async () => {
      const servidor = servidorDevoluciones(706, [devolucionCruda({ pedidoId: 706, pedidoItemId: 93011, tipo: 'cambio', causa: 'sellado_sin_abrir', monto: null })], []);
      const abierta = await abrirDetalle(ENTREGADO, servidor.rutas);
      const fila = `${RETIRAR}: ${t('tienda.devoluciones.tipo.cambio')}`;

      await tocar(fila);
      expect(await screen.findByText(t('tienda.devoluciones.retirar.texto'))).toBeOnTheScreen();
      await tocar(t('tienda.devoluciones.retirar.conservar'));
      await waitFor(() => expect(screen.queryByText(t('tienda.devoluciones.retirar.texto'))).not.toBeOnTheScreen());
      expect(veces(abierta, rutaRetirarDevolucion(5001))).toBe(0);

      await tocar(fila);
      const confirmar = await screen.findByRole('button', { name: CONFIRMAR_RETIRO });
      await fireEvent.press(confirmar);
      await fireEvent.press(confirmar);
      expect(await screen.findByText(t('tienda.devoluciones.retirar.listo'))).toBeOnTheScreen();
      expect(veces(abierta, rutaRetirarDevolucion(5001))).toBe(1);
      expect(await screen.findByLabelText(`Estado: ${t('tienda.devoluciones.estado.cancelada')}`)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: fila })).not.toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'si el salón ya la revisó (409), se cierra, se avisa y se muestra cómo quedó',
    async () => {
      const servidor = servidorDevoluciones(706, [devolucionCruda({ pedidoId: 706 })], []);
      await abrirDetalle(ENTREGADO, {
        ...servidor.rutas,
        [rutaRetirarDevolucion(5001)]: () => {
          servidor.lista()[0].estado = 'rechazada';
          return conError(cuerpoError(409, MENSAJES_DEVOLUCION.yaNoPendiente))(null);
        },
      });
      await tocar(`${RETIRAR}: ${t('tienda.devoluciones.tipo.reembolso')}`);
      await tocar(CONFIRMAR_RETIRO);
      expect(await screen.findByText(t('tienda.devoluciones.retirar.yaNoPendiente'))).toBeOnTheScreen();
      expect(await screen.findByLabelText(`Estado: ${t('tienda.devoluciones.estado.rechazada')}`)).toBeOnTheScreen();
      sinTextos(MENSAJES_DEVOLUCION.yaNoPendiente);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'sin respuesta al retirar: si ya quedó retirada se muestra así; si no, se queda en la hoja con el aviso',
    async () => {
      const servidor = servidorDevoluciones(706, [devolucionCruda({ pedidoId: 706 })], []);
      const retirar = servidor.rutas[rutaRetirarDevolucion(5001)];
      let perderRespuesta = false;
      await abrirDetalle(ENTREGADO, {
        ...servidor.rutas,
        [rutaRetirarDevolucion(5001)]: (cuerpo) => {
          if (perderRespuesta) {
            retirar(cuerpo);
          }
          return Promise.reject(new TypeError('Network request failed')) as unknown as Response;
        },
      });
      await tocar(`${RETIRAR}: ${t('tienda.devoluciones.tipo.reembolso')}`);
      await tocar(CONFIRMAR_RETIRO);
      // No se guardó: el aviso de sin conexión queda en la hoja para intentarlo de nuevo.
      expect(await screen.findByRole('button', { name: CONFIRMAR_RETIRO })).toBeOnTheScreen();
      expect(screen.queryByText(t('tienda.devoluciones.retirar.listo'))).not.toBeOnTheScreen();
      perderRespuesta = true;
      await tocar(CONFIRMAR_RETIRO);
      expect(await screen.findByText(t('tienda.devoluciones.retirar.listo'))).toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'una revocación pendiente no trae botón para retirarla (se retira con el salón)',
    async () => {
      await abrirDetalle(ENTREGADO, servidorDevoluciones(706, [revocacionCruda({ pedidoId: 706 })], []).rutas);
      expect(await screen.findByText(t('tienda.devoluciones.revocacion'))).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: new RegExp(`^${RETIRAR}`) })).not.toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );
});
