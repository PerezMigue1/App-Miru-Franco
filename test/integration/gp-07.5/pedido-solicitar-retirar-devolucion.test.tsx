/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { LIMITE_MS } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, sinTextos, tocar } from '../../helpers/pantallasReserva';
import { abrirTienda, ultimoCuerpo, veces } from '../../helpers/pantallasTienda';
import { RUTA_SOLICITAR_DEVOLUCION, rutaRetirarDevolucion, servidorDevoluciones } from '../../helpers/pedidosFicticios';
import { pedidoEnEstado, REGLAS_PEDIDO } from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.5: pedir un cambio y retirarlo de principio a fin con la app real (renderRouter), la sesión de
 * CLIENTA_CITAS, el reloj fijo y el servidor simulado de devoluciones (http://api.test, con estado:
 * lo que se crea aparece en la lista y lo retirado queda cancelado). Desde Mis pedidos se abre el
 * pedido entregado 706, se pide el cambio del shampoo sellado con su detalle (un solo POST aunque se
 * toque dos veces), aparece pendiente en la sección y se retira con confirmación. Datos ficticios:
 * nunca se crea ni se retira una devolución real.
 */

const t = (clave: Parameters<typeof obtenerTexto>[0], contexto = {}) => obtenerTexto(clave, contexto);
const PENDIENTE = `Estado: ${t('tienda.devoluciones.estado.pendiente')}`;
const CANCELADA = `Estado: ${t('tienda.devoluciones.estado.cancelada')}`;
const RETIRAR_FILA = `${t('tienda.devoluciones.retirar.boton')}: ${t('tienda.devoluciones.tipo.cambio')}`;

describe('Pedir y retirar un cambio desde Mis pedidos (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarConfiguracionPublica();
  });

  it(
    'pide el cambio, lo ve pendiente en la sección y lo retira con confirmación',
    async () => {
      const pedido = pedidoEnEstado('entregado', { id: 706 });
      const servidor = servidorDevoluciones(706, [], []);
      const abierta = await abrirTienda('/mis-pedidos', { pedidos: [pedido], rutas: servidor.rutas });
      await fireEvent.press(await screen.findByRole('button', { name: /^Pedido número 706,/ }));
      await esperarRuta(abierta.app, '/pedido/706');
      expect(await screen.findByText(t('pedidos.sinDevoluciones'))).toBeOnTheScreen();

      // Pedir: la política con los días del pedido, el producto, la confirmación y el detalle.
      await tocar(t('tienda.devoluciones.solicitar.boton'));
      expect(
        await screen.findByText(t('tienda.devoluciones.solicitar.politica', { diasCambioProducto: String(REGLAS_PEDIDO.diasCambioProducto) })),
      ).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('radio', { name: /^Shampoo hidratante \(250ml\)\./ }));
      await fireEvent.press(screen.getByRole('checkbox', { name: t('tienda.devoluciones.solicitar.sellado') }));
      await fireEvent.changeText(screen.getByLabelText(t('tienda.devoluciones.solicitar.motivo')), 'Quería otro tono');
      const enviar = screen.getByRole('button', { name: t('tienda.devoluciones.solicitar.enviar') });
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
      expect(await screen.findByLabelText(PENDIENTE)).toBeOnTheScreen();
      expect(screen.getByText('Quería otro tono')).toBeOnTheScreen();
      expect(servidor.lista()).toHaveLength(1);

      // Retirar: confirmación, una sola llamada y la solicitud queda cancelada en la sección.
      await tocar(RETIRAR_FILA);
      expect(await screen.findByText(t('tienda.devoluciones.retirar.texto'))).toBeOnTheScreen();
      const confirmar = screen.getByRole('button', { name: t('tienda.devoluciones.retirar.confirmar') });
      await fireEvent.press(confirmar);
      await fireEvent.press(confirmar);

      expect(await screen.findByText(t('tienda.devoluciones.retirar.listo'))).toBeOnTheScreen();
      const id = servidor.lista()[0].id;
      expect(veces(abierta, rutaRetirarDevolucion(id))).toBe(1);
      expect(servidor.lista()[0].estado).toBe('cancelada');
      expect(await screen.findByLabelText(CANCELADA)).toBeOnTheScreen();
      await waitFor(() => expect(screen.queryByRole('button', { name: RETIRAR_FILA })).not.toBeOnTheScreen());
      // Ya no hay solicitudes activas: se puede pedir otra.
      expect(screen.getByRole('button', { name: t('tienda.devoluciones.solicitar.boton') })).toBeOnTheScreen();
      sinTextos(t('pedidos.sinDevoluciones'));
      revisarConsola();
    },
    LIMITE_MS,
  );
});
