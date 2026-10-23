/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { fechaYHora } from '@/features/tienda/models/pedidoModel';
import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { configuracionTienda, rutaConfiguracionTienda } from '../../helpers/checkoutFicticio';
import { AHORA, HORA_MS } from '../../helpers/citasFicticias';
import { DATOS_TRANSFERENCIA } from '../../helpers/configuracionFicticia';
import { LIMITE_MS, ultimoBoton } from '../../helpers/pantallas';
import { prepararPruebasReserva, sinTextos, tocar } from '../../helpers/pantallasReserva';
import { abrirTienda, conTextos } from '../../helpers/pantallasTienda';
import { rutasDevoluciones } from '../../helpers/pedidosFicticios';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import {
  cuerpoCancelarPedido,
  cuerpoMisPedidos,
  pedidoApartado,
  pedidoCrudo,
  pedidoPagado,
  reembolsoCrudo,
  RUTA_MIS_PEDIDOS,
  rutaCancelarPedido,
  type PedidoCrudo,
} from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.5: el detalle del pedido y Mis pedidos con la configuración ficticia del servidor simulado
 * (plazo de pago de 12 horas, 6 días hábiles para revocar, efectivo y transferencia en el salón con
 * sus datos): el qué sigue con las reglas guardadas en cada pedido y no con las vigentes, el apartado
 * listo para pagar con los métodos del salón y la cuenta para transferir, los textos de cancelar y
 * su resultado y la lista de pedidos, todo desde el catálogo de textos.
 */

const t = (clave: Parameters<typeof obtenerTexto>[0], contexto = {}) => obtenerTexto(clave, contexto);

type Cambios = Parameters<typeof configuracionTienda>[0];

/** Abre el detalle con la configuración ficticia (con los cambios) y espera su título. */
async function abrirDetalle(pedido: PedidoCrudo, rutas: Record<string, Manejador> = {}, cambios: Cambios = {}) {
  const abierta = await abrirTienda(`/pedido/${pedido.id}`, {
    pedidos: [pedido],
    rutas: { ...rutaConfiguracionTienda(configuracionTienda(cambios)), ...rutasDevoluciones(pedido.id, [], []), ...rutas },
  });
  expect(await screen.findByRole('header', { name: `Pedido #${pedido.id}` })).toBeOnTheScreen();
  // La configuración de la red ya llegó: el nombre del salón ficticio lo confirma.
  expect(await screen.findByText('Salón Ficticio de Prueba')).toBeOnTheScreen();
  return abierta;
}

describe('Detalle del pedido con las reglas guardadas y la configuración (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarConfiguracionPublica();
    limpiarArchivos();
  });

  it.each<[string, PedidoCrudo, number]>([
    ['el pedido con sus reglas dice las 24 horas con que se creó (no las 12 vigentes)', pedidoCrudo(), 24],
    ['un pedido viejo sin reglas usa el plazo vigente', pedidoCrudo({ reglas: null }), 12],
  ])(
    '%s',
    async (_caso, pedido, horas) => {
      await abrirDetalle(pedido);
      expect(await screen.findByText(t('pedidos.estado.faltaPago', { plazoPago: horas }))).toBeOnTheScreen();
      conTextos(t('tienda.pago.plazo', { limite: fechaYHora(new Date(AHORA.getTime() + horas * HORA_MS)) }));
      expect(screen.getByRole('button', { name: 'Completar el pago' })).toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'apartado listo para recoger: estado real, métodos del salón y la cuenta para transferir',
    async () => {
      await abrirDetalle(pedidoApartado({ id: 705, estado: 'listo_recoger' }));
      expect(await screen.findByLabelText('Estado: Listo para recoger')).toBeOnTheScreen();
      conTextos(
        'Tu pedido está listo. Pasa por él al salón y págalo en el mostrador (efectivo o transferencia).',
        ...DATOS_TRANSFERENCIA,
      );
      sinTextos(/Huejutla/);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'sin transferencia entre los métodos del salón no se muestra ninguna cuenta',
    async () => {
      await abrirDetalle(pedidoApartado({ id: 705, estado: 'listo_recoger' }), {}, { pagos: { metodosSalon: ['efectivo'] } });
      expect(await screen.findByText('Tu pedido está listo. Pasa por él al salón y págalo en el mostrador (efectivo).')).toBeOnTheScreen();
      sinTextos(...DATOS_TRANSFERENCIA);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, string, Parameters<typeof obtenerTexto>[0], Record<string, string>]>([
    ['reembolsado: con el monto', 'reembolsado', 'tienda.pedido.cancelado.reembolsado', { monto: ' de $1,142.50' }],
    ['en revisión: el salón lo hará', 'en_revision', 'tienda.pedido.cancelado.enRevision', {}],
  ])(
    'cancelar un pedido pagado en línea avisa del reembolso completo y del resultado (%s)',
    async (_caso, estado, clave, contexto) => {
      const pagado = pedidoPagado();
      await abrirDetalle(pagado, {
        [rutaCancelarPedido(703)]: () => respuesta(cuerpoCancelarPedido(pagado, reembolsoCrudo(estado))),
      });
      await tocar('Cancelar pedido');
      expect(await screen.findByText(`${t('tienda.pedido.cancelar.texto')} ${t('tienda.pedido.cancelar.reembolso')}`)).toBeOnTheScreen();
      await fireEvent.press(ultimoBoton('Sí, cancelar pedido'));
      expect(await screen.findByText(t(clave, contexto))).toBeOnTheScreen();
      expect(await screen.findByLabelText('Estado: Cancelado')).toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );
});

describe('Mis pedidos con los textos del catálogo (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarConfiguracionPublica();
    limpiarArchivos();
  });

  it(
    'la lista vacía usa el texto del servidor y el resto de la pantalla, los del catálogo',
    async () => {
      const textos = { 'pedidos.lista.vacia': 'Todavía no compras nada' };
      await abrirTienda('/mis-pedidos', {
        pedidos: [],
        rutas: { ...rutaConfiguracionTienda(configuracionTienda({ textos })), [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos([])) },
      });
      expect(await screen.findByRole('header', { name: 'Todavía no compras nada' })).toBeOnTheScreen();
      conTextos(t('tienda.pedido.lista.vaciaTexto'));
      expect(screen.getByRole('header', { name: t('tienda.pedido.lista.titulo') })).toBeOnTheScreen();
      await waitFor(() => expect(screen.getByRole('button', { name: t('tienda.pedido.lista.verTienda') })).toBeOnTheScreen());
      revisarConsola();
    },
    LIMITE_MS,
  );
});
