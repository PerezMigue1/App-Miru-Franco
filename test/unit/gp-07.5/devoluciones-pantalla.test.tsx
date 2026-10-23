/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { screen, waitFor } from 'expo-router/testing-library';

import { fechaYHora } from '@/features/tienda/models/pedidoModel';
import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { sinRedEnRuta } from '../../helpers/citasFicticias';
import { LIMITE_MS } from '../../helpers/pantallas';
import { prepararPruebasReserva, sinTextos, tocar } from '../../helpers/pantallasReserva';
import { errorDelServidor } from '../../helpers/pantallasServicios';
import { abrirTienda, conTextos, fallaHastaArreglar, veces } from '../../helpers/pantallasTienda';
import {
  devolucionCruda,
  pagoCrudo,
  pedidoEntregadoRevocable,
  revocacionCruda,
  rutasDevoluciones,
  type DevolucionCruda,
  type PedidoDetalleCrudo,
} from '../../helpers/pedidosFicticios';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import {
  cuerpoListaTienda,
  pedidoEnEstado,
  pedidoPagado,
  rutaDevolucionesPedido,
  rutaPagosPedido,
  rutaPedido,
  type PedidoCrudo,
} from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.5: devoluciones y reembolsos en el detalle del pedido con las pantallas reales: cada
 * devolución con su estado (pendiente, aprobada, rechazada, cancelada), tipo, monto, motivo sin la
 * etiqueta del backend y la respuesta del salón; el estado del reembolso del pago (reembolsado con su
 * fecha y en revisión); el encabezado de un pedido recogido y revocado; sin devoluciones, el texto
 * del catálogo; y si la consulta falla, el detalle se sigue viendo y la sección deja reintentar.
 */

const t = (clave: Parameters<typeof obtenerTexto>[0], contexto = {}) => obtenerTexto(clave, contexto);
const TITULO = t('tienda.devoluciones.titulo');

async function abrirDetalle(pedido: PedidoDetalleCrudo | PedidoCrudo, rutas: Record<string, Manejador>) {
  const abierta = await abrirTienda(`/pedido/${pedido.id}`, { pedidos: [pedido as PedidoCrudo], rutas });
  expect(await screen.findByRole('header', { name: `Pedido #${pedido.id}` })).toBeOnTheScreen();
  expect(await screen.findByRole('header', { name: TITULO })).toBeOnTheScreen();
  return abierta;
}

describe('Devoluciones y reembolsos en el detalle del pedido (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarConfiguracionPublica();
  });

  it.each<[string, Partial<DevolucionCruda>, string[], string[]]>([
    [
      'pendiente',
      {},
      [t('tienda.devoluciones.tipo.reembolso'), t('tienda.devoluciones.monto', { monto: '$1,142.50' }), 'El frasco llegó roto'],
      [],
    ],
    [
      'aprobada al mismo medio, con la respuesta del salón',
      { estado: 'aprobada', metodoReembolso: 'metodo_original', notaResolucion: 'Te reembolsamos completo.', resueltoEn: '2026-10-20T17:00:00.000Z' },
      [
        t('tienda.devoluciones.metodo.original'),
        t('tienda.devoluciones.notaTitulo'),
        'Te reembolsamos completo.',
        t('tienda.devoluciones.resuelta', { fecha: fechaYHora('2026-10-20T17:00:00.000Z') }),
      ],
      [],
    ],
    [
      'rechazada',
      { estado: 'rechazada', notaResolucion: 'El producto ya estaba abierto.' },
      ['El producto ya estaba abierto.'],
      [t('tienda.devoluciones.metodo.original')],
    ],
    ['cancelada', { estado: 'cancelada' }, [t('tienda.devoluciones.tipo.reembolso')], []],
    ['un cambio (sin monto)', { tipo: 'cambio', monto: null, motivo: '[Cambio · Sellado] Otro tono' }, [t('tienda.devoluciones.tipo.cambio'), 'Otro tono'], ['Monto: $1,142.50']],
  ])(
    'una devolución %s se ve con su estado y sus datos',
    async (_caso, cambios, visibles, ocultos) => {
      const devolucion = devolucionCruda(cambios);
      await abrirDetalle(pedidoPagado(), rutasDevoluciones(703, [devolucion]));
      const insignia = `Estado: ${t(`tienda.devoluciones.estado.${devolucion.estado}` as Parameters<typeof obtenerTexto>[0])}`;
      expect(await screen.findByLabelText(insignia)).toBeOnTheScreen();
      conTextos(...visibles);
      sinTextos(...ocultos, '[Reembolso · Defecto de fábrica] El frasco llegó roto', t('pedidos.sinDevoluciones'));
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, Parameters<typeof pagoCrudo>[0], string, string]>([
    [
      'reembolsado con su fecha',
      { estado: 'reembolsado', reembolsadoEn: '2026-10-21T18:00:00.000Z' },
      t('tienda.devoluciones.pago.reembolsado'),
      t('tienda.devoluciones.pago.reembolsadoEl', { fecha: fechaYHora('2026-10-21T18:00:00.000Z') }),
    ],
    ['en revisión: el salón lo revisa', { estado: 'en_revision' }, t('tienda.devoluciones.pago.enRevision'), t('tienda.devoluciones.pago.revisando')],
  ])(
    'el pago %s',
    async (_caso, cambios, insignia, detalle) => {
      await abrirDetalle(pedidoEnEstado('cancelado'), rutasDevoluciones(703, [], [pagoCrudo(cambios), pagoCrudo({ id: 2, estado: 'rechazado' })]));
      expect(await screen.findByLabelText(`Estado: ${insignia}`)).toBeOnTheScreen();
      conTextos(detalle, t('tienda.devoluciones.pagosTitulo'), t('pedidos.sinDevoluciones'));
      // Un intento rechazado de Mercado Pago no es información del reembolso: solo se ve el total del
      // pedido y el pago que importa.
      expect(screen.getAllByText('$1,142.50')).toHaveLength(2);
      sinTextos(/nunca-se-muestra|ref-ficticia|error-tecnico/);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, string, string]>([
    ['pendiente de entregar', 'pendiente', t('pedidos.revocacion.pendiente', { monto: ' $1,142.50' })],
    ['aprobada', 'aprobada', t('pedidos.revocacion.aprobada', { monto: ' $1,142.50' })],
    ['rechazada', 'rechazada', t('pedidos.revocacion.rechazada')],
  ])(
    'recogido y revocado (%s): el encabezado dice en qué va la revocación',
    async (_caso, estado, encabezado) => {
      await abrirDetalle(pedidoEntregadoRevocable({ puedeRevocar: false }), rutasDevoluciones(706, [revocacionCruda({ pedidoId: 706, estado })]));
      expect(await screen.findByText(encabezado)).toBeOnTheScreen();
      sinTextos(t('pedidos.estado.entregado'));
      conTextos(t('tienda.devoluciones.revocacion'), 'Ya no lo necesito');
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'sin devoluciones lo dice con el texto del catálogo',
    async () => {
      await abrirDetalle(pedidoPagado(), rutasDevoluciones(703, [], []));
      expect(await screen.findByText(t('pedidos.sinDevoluciones'))).toBeOnTheScreen();
      sinTextos(t('tienda.devoluciones.pagosTitulo'));
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, Manejador]>([
    ['el servidor falla', errorDelServidor],
    ['no hay internet', sinRedEnRuta],
  ])(
    'si %s, el detalle se sigue viendo y la sección deja reintentar',
    async (_caso, falla) => {
      const ruta = fallaHastaArreglar(() => respuesta(cuerpoListaTienda([devolucionCruda()])), falla);
      const abierta = await abrirDetalle(pedidoPagado(), {
        ...rutasDevoluciones(703),
        [rutaDevolucionesPedido(703)]: ruta.manejador,
      });
      expect(await screen.findByText(t('tienda.devoluciones.error'))).toBeOnTheScreen();
      expect(screen.getByLabelText('Estado: Pagado')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeOnTheScreen();
      ruta.arreglar();
      await tocar(t('tienda.devoluciones.reintentar'));
      expect(await screen.findByText('El frasco llegó roto')).toBeOnTheScreen();
      sinTextos(t('tienda.devoluciones.error'));
      expect(veces(abierta, rutaPagosPedido(703))).toBeGreaterThanOrEqual(2);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'se consulta solo con el pedido ya cargado: si el pedido no carga, no se piden devoluciones',
    async () => {
      const abierta = await abrirTienda('/pedido/703', {
        pedidos: [pedidoPagado()],
        rutas: { ...rutasDevoluciones(703), [rutaPedido(703)]: errorDelServidor },
      });
      expect(await screen.findByText('No pudimos cargar tu pedido')).toBeOnTheScreen();
      await waitFor(() => expect(veces(abierta, rutaPedido(703))).toBe(1));
      expect(veces(abierta, rutaDevolucionesPedido(703))).toBe(0);
      expect(veces(abierta, rutaPagosPedido(703))).toBe(0);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
