/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen } from 'expo-router/testing-library';

import { fechaYHora } from '@/features/tienda/models/pedidoModel';
import { formatoPrecio } from '@/features/tienda/models/productoModel';
import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { LIMITE_MS } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, sinTextos } from '../../helpers/pantallasReserva';
import { abrirTienda, conTextos, veces } from '../../helpers/pantallasTienda';
import { devolucionCruda, MONTO_TOTAL, pagoCrudo, rutasDevoluciones } from '../../helpers/pedidosFicticios';
import type { Llamada } from '../../helpers/servidorSimulado';
import {
  isoMasMinutos,
  pedidoEnEstado,
  rutaCancelarPedido,
  rutaDevolucionesPedido,
  rutaPagosPedido,
} from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.5: devoluciones y reembolsos de un pedido cancelado que ya estaba pagado, con la app real
 * (renderRouter), la sesión de CLIENTA_CITAS, el reloj fijo y el servidor simulado
 * (http://api.test). Desde Mis pedidos se abre el pedido 703 y, sin pasar por cancelar, el detalle
 * ya muestra su devolución y el reembolso de su pago (o el pago en revisión), con los textos del
 * catálogo y sin los datos internos del pago (payload, referencia ni error técnico).
 */

const t = (clave: Parameters<typeof obtenerTexto>[0], contexto = {}) => obtenerTexto(clave, contexto);
const MONTO = formatoPrecio(MONTO_TOTAL * 100);
const PEDIDO = pedidoEnEstado('cancelado');
const DATOS_INTERNOS = /nunca-se-muestra|ref-ficticia|error-tecnico/;

/** Abre Mis pedidos, toca el pedido cancelado y espera su detalle con la sección de devoluciones. */
async function abrirPedidoCancelado(devoluciones: unknown[], pagos: unknown[]) {
  const abierta = await abrirTienda('/mis-pedidos', {
    pedidos: [PEDIDO],
    rutas: rutasDevoluciones(PEDIDO.id, devoluciones, pagos),
  });
  await fireEvent.press(await screen.findByRole('button', { name: /^Pedido número 703,/ }));
  await esperarRuta(abierta.app, '/pedido/703');
  expect(await screen.findByRole('header', { name: 'Pedido #703' })).toBeOnTheScreen();
  expect(await screen.findByLabelText('Estado: Cancelado')).toBeOnTheScreen();
  expect(await screen.findByRole('header', { name: t('tienda.devoluciones.titulo') })).toBeOnTheScreen();
  return abierta;
}

/** Se leyeron las devoluciones y los pagos, y no se envió nada para cancelar ni reembolsar. */
function soloLecturas(abierta: { llamadas: Llamada[] }): void {
  expect(veces(abierta, rutaDevolucionesPedido(703))).toBeGreaterThanOrEqual(1);
  expect(veces(abierta, rutaPagosPedido(703))).toBeGreaterThanOrEqual(1);
  expect(veces(abierta, rutaCancelarPedido(703))).toBe(0);
  expect(abierta.llamadas.filter((llamada) => llamada.metodo !== 'GET')).toEqual([]);
}

describe('Devoluciones y reembolsos de un pedido cancelado (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarConfiguracionPublica();
  });

  it(
    'al abrirlo se ven la devolución aprobada y el pago reembolsado con su fecha',
    async () => {
      const resuelta = isoMasMinutos(PEDIDO.creadoEn, 24 * 60);
      const reembolsado = isoMasMinutos(PEDIDO.creadoEn, 2 * 24 * 60);
      const abierta = await abrirPedidoCancelado(
        [devolucionCruda({ estado: 'aprobada', metodoReembolso: 'metodo_original', resueltoEn: resuelta })],
        [pagoCrudo({ estado: 'reembolsado', reembolsadoEn: reembolsado })],
      );

      expect(await screen.findByLabelText(`Estado: ${t('tienda.devoluciones.estado.aprobada')}`)).toBeOnTheScreen();
      conTextos(
        t('tienda.devoluciones.tipo.reembolso'),
        t('tienda.devoluciones.monto', { monto: MONTO }),
        'El frasco llegó roto',
        t('tienda.devoluciones.metodo.original'),
        t('tienda.devoluciones.resuelta', { fecha: fechaYHora(resuelta) }),
        t('tienda.devoluciones.pagosTitulo'),
        t('tienda.devoluciones.pago.reembolsadoEl', { fecha: fechaYHora(reembolsado) }),
      );
      expect(screen.getByLabelText(`Estado: ${t('tienda.devoluciones.pago.reembolsado')}`)).toBeOnTheScreen();
      sinTextos(t('pedidos.sinDevoluciones'), DATOS_INTERNOS);
      soloLecturas(abierta);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'un pago en revisión dice que el salón lo revisa, sin devoluciones registradas',
    async () => {
      const abierta = await abrirPedidoCancelado([], [pagoCrudo({ estado: 'en_revision' })]);

      expect(await screen.findByLabelText(`Estado: ${t('tienda.devoluciones.pago.enRevision')}`)).toBeOnTheScreen();
      conTextos(t('tienda.devoluciones.pago.revisando'), t('tienda.devoluciones.pagosTitulo'), t('pedidos.sinDevoluciones'));
      sinTextos(DATOS_INTERNOS);
      soloLecturas(abierta);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
