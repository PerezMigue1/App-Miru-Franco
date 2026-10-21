/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { screen, waitFor } from 'expo-router/testing-library';

import { conError, sinRedEnRuta } from '../../helpers/citasFicticias';
import { navegadorRegresa } from '../../helpers/google';
import { LIMITE_MS } from '../../helpers/pantallas';
import { deslizarParaActualizar } from '../../helpers/pantallasMisCitas';
import { prepararPruebasReserva, sinTextos, tocar, tocarYEsperar } from '../../helpers/pantallasReserva';
import { enSecuencia, errorDelServidor } from '../../helpers/pantallasServicios';
import {
  abrirHojaCancelarPedido,
  abrirTienda,
  conEstadoPago,
  conEtiquetas,
  conTextos,
  confirmarCancelacion,
  etiquetasConPista,
  fallaHastaArreglar,
  reintentarTrasError,
  fechaEnTarjeta,
  fechaEnTelefono,
  PISTA_PEDIDO,
  revisarMercadoPago,
  sinBotones,
  ultimoCuerpo,
  veces,
} from '../../helpers/pantallasTienda';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import {
  ACEITE_CON_GALERIA,
  cuerpoCancelarPedido,
  cuerpoMisPedidos,
  cuerpoPedido,
  deepLinkPedido,
  ERRORES_PEDIDOS,
  itemPedidoCrudo,
  MENSAJES_PEDIDOS,
  MIS_PEDIDOS_CRUDOS,
  pedidoEnEstado,
  reembolsoCrudo,
  RUTA_MIS_PEDIDOS,
  RUTA_PREFERENCIA_PEDIDO,
  rutaCancelarPedido,
  rutaEstadoPagoPedido,
  rutaPedido,
  type PedidoCrudo,
} from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-06.4: Mis pedidos con las pantallas reales, la sesión de la clienta, el reloj fijo el lunes 19
 * de octubre de 2026 a las 10:00 de México y el servidor simulado: la entrada desde Perfil, la
 * lista con sus insignias, el detalle con artículos, estado, forma de pago y qué sigue, cancelar un
 * apartado o un pedido pagado en línea (con el aviso de la devolución de Mercado Pago), completar
 * el pago desde el detalle y los estados vacío, sin sesión y de error. Los plazos de los apartados
 * los aplica el backend: la app no los muestra. La consulta del pago en proceso del detalle la
 * revisa correcciones-tienda (D3).
 */

/** Pedido de MIS_PEDIDOS_CRUDOS por id (falla si no está). */
function pedido(id: number): PedidoCrudo {
  const encontrado = MIS_PEDIDOS_CRUDOS.find((p) => p.id === id);
  if (!encontrado) {
    throw new Error(`No hay pedido ${id} en MIS_PEDIDOS_CRUDOS.`);
  }
  return encontrado;
}

/** Forma de pago corta e insignia que debe anunciar la tarjeta de cada pedido de la lista. */
const EN_LA_LISTA: [number, string, string][] = [
  [701, 'Pago en línea', 'Pendiente de pago'],
  [702, 'Pago en el salón', 'Apartado, pagas al recoger'],
  [703, 'Pago en línea', 'Pagado'],
  [704, 'Pago en línea', 'En preparación'],
  [705, 'Pago en el salón', 'Listo para recoger'],
  [706, 'Pago en línea', 'Entregado en el salón'],
  [707, 'Pago en línea', 'Cancelado'],
  [708, 'Efectivo', 'Entregado en el salón'],
];

/** Lo que anuncia la tarjeta del pedido: número, fecha, piezas, total, forma de pago y estado. */
function tarjeta(id: number, pago: string, estado: string): string {
  return `Pedido número ${id}, ${fechaEnTarjeta(pedido(id).creadoEn)}, 3 piezas, total $1,142.50, ${pago}, estado: ${estado}`;
}

const TARJETAS = EN_LA_LISTA.map(([id, pago, estado]) => tarjeta(id, pago, estado));

/** Los dos artículos de cada pedido ficticio, el total y las piezas. */
const ARTICULOS = [
  'Shampoo hidratante, 250ml, 2 piezas de $380, subtotal $760',
  'Acondicionador reparación, 300ml, 1 pieza de $382.50, subtotal $382.50',
  'Total: $1,142.50, 3 piezas',
];

const CANCELAR_BASE = 'Se cancela tu pedido y los productos vuelven a la tienda. Esta acción no se puede deshacer.';
const CANCELADO = 'Tu pedido quedó cancelado.';

/** Espera la lista de Mis pedidos con esas tarjetas, en ese orden. */
async function esperarLista(tarjetas: string[] = TARJETAS): Promise<void> {
  await waitFor(() => expect(etiquetasConPista(PISTA_PEDIDO)).toEqual(tarjetas));
}

/** Espera el detalle del pedido ya cargado (su título y su insignia). */
async function esperarDetalle(id: number, estado: string): Promise<void> {
  expect(await screen.findByRole('header', { name: `Pedido #${id}` })).toBeOnTheScreen();
  expect(await screen.findByLabelText(`Estado: ${estado}`)).toBeOnTheScreen();
}

describe('Mis pedidos con las pantallas reales (GP-06.4)', () => {
  const revisarConsola = prepararPruebasReserva();

  describe('Lista', () => {
    it(
      'de Perfil a Mis pedidos: cada pedido con su fecha, piezas, total, forma de pago e insignia; Volver regresa',
      async () => {
        const { app } = await abrirTienda('/perfil');
        await tocarYEsperar(app, 'Mis pedidos, Tus compras y cuándo puedes recogerlas.', '/mis-pedidos');
        expect(await screen.findByRole('header', { name: 'Mis pedidos' })).toBeOnTheScreen();
        conTextos('Consulta el estado de todos tus pedidos');
        await esperarLista();

        await tocarYEsperar(app, 'Volver', '/perfil');
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, Manejador, string]>([
      ['el servidor falla', errorDelServidor, 'Algo salió mal al traer tus pedidos. Intenta de nuevo en un momento.'],
      ['no hay internet', sinRedEnRuta, 'Sin conexión. Revisa tu internet e intenta de nuevo'],
    ])(
      'si %s lo dice y "Reintentar" muestra la lista',
      async (_caso, falla, mensaje) => {
        const ruta = fallaHastaArreglar(() => respuesta(cuerpoMisPedidos()), falla);
        await abrirTienda('/mis-pedidos', { rutas: { [RUTA_MIS_PEDIDOS]: ruta.manejador } });
        await reintentarTrasError(ruta, 'No pudimos cargar tus pedidos', mensaje);
        await esperarLista();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'si deslizar para actualizar falla, lo avisa y conserva la lista',
      async () => {
        const abierta = await abrirTienda('/mis-pedidos', {
          rutas: { [RUTA_MIS_PEDIDOS]: enSecuencia(() => respuesta(cuerpoMisPedidos()), errorDelServidor) },
        });
        await esperarLista();
        await deslizarParaActualizar();
        expect(
          await screen.findByText('No pudimos actualizar tus pedidos. Desliza hacia abajo para intentar de nuevo.'),
        ).toBeOnTheScreen();
        await esperarLista();

        // Abierta sin nada debajo (por ejemplo, desde un aviso): Volver lleva a Perfil.
        await tocarYEsperar(abierta.app, 'Volver', '/perfil');
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'sin pedidos lo dice y "Ver la tienda" abre la pestaña Productos',
      async () => {
        const { app } = await abrirTienda('/mis-pedidos', { pedidos: [] });
        expect(await screen.findByRole('header', { name: 'Aún no tienes pedidos' })).toBeOnTheScreen();
        conTextos('Cuando compres en la tienda, tus pedidos aparecerán aquí.');
        await tocarYEsperar(app, 'Ver la tienda', '/tienda');
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'sin sesión invita a iniciar sesión y no pide los pedidos',
      async () => {
        const abierta = await abrirTienda('/mis-pedidos', { sinSesion: true });
        expect(await screen.findByRole('header', { name: 'Tus pedidos' })).toBeOnTheScreen();
        conTextos('Inicia sesión para ver tus compras y saber cuándo puedes recogerlas.');
        expect(veces(abierta, RUTA_MIS_PEDIDOS)).toBe(0);
        await tocarYEsperar(abierta.app, 'Iniciar sesión', '/login');
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('Detalle', () => {
    it(
      'tocar un pedido abre su detalle: estado, qué sigue, artículos, total, forma de pago y dónde recogerlo',
      async () => {
        const { app } = await abrirTienda('/mis-pedidos');
        await esperarLista();
        await tocarYEsperar(app, tarjeta(705, 'Pago en el salón', 'Listo para recoger'), '/pedido/705');

        await esperarDetalle(705, 'Listo para recoger');
        conEtiquetas(`Pedido hecho el ${fechaEnTelefono(pedido(705).creadoEn)}`, ...ARTICULOS);
        conEtiquetas('Forma de pago: Pago al recoger en el salón');
        expect(screen.getByRole('header', { name: 'Qué sigue' })).toBeOnTheScreen();
        conTextos('Tu pedido está listo. Pasa por él al salón y págalo en el mostrador.');
        expect(screen.getByRole('header', { name: 'Recoger en el salón' })).toBeOnTheScreen();
        sinBotones('Cancelar pedido', 'Completar el pago');

        await tocarYEsperar(app, 'Volver', '/mis-pedidos');
        await esperarLista();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[number, string, string | null, boolean, boolean]>([
      [702, 'Apartado, pagas al recoger', 'Tu pedido está apartado. Lo preparamos y te avisamos cuando puedas pasar a pagarlo y recogerlo.', true, true],
      [703, 'Pagado', 'Pago recibido. Lo preparamos y te avisamos cuando esté listo para recoger.', true, true],
      [704, 'En preparación', 'Estamos preparando tu pedido. Te avisamos en la app y por correo cuando esté listo.', true, false],
      [706, 'Entregado en el salón', 'Recogiste tu pedido en el salón.', false, false],
      [707, 'Cancelado', null, false, false],
    ])(
      'pedido %i (%s): qué sigue, dónde recogerlo y si se puede cancelar',
      async (id, estado, queSigue, recoger, cancelar) => {
        await abrirTienda(`/pedido/${id}`);
        await esperarDetalle(id, estado);
        conEtiquetas(...ARTICULOS);
        if (queSigue) {
          conTextos(queSigue);
        }
        expect(Boolean(screen.queryByRole('header', { name: 'Qué sigue' }))).toBe(queSigue !== null);
        expect(Boolean(screen.queryByRole('header', { name: 'Recoger en el salón' }))).toBe(recoger);
        expect(Boolean(screen.queryByRole('button', { name: 'Cancelar pedido' }))).toBe(cancelar);
        sinTextos(/Paga antes del/);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'un artículo de una presentación sin tamaño se muestra con su nombre, piezas y precio',
      async () => {
        const sinTamanio = pedidoEnEstado('entregado', { id: 709, items: [itemPedidoCrudo(ACEITE_CON_GALERIA, 1)] });
        await abrirTienda('/pedido/709', { pedidos: [sinTamanio] });
        await esperarDetalle(709, 'Entregado en el salón');
        conEtiquetas('Aceite de argán, 1 pieza de $540, subtotal $540', 'Total: $540, 1 pieza');
        conTextos('1 × $540');
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      '"Completar el pago" de un pedido en línea por pagar abre Mercado Pago y al regresar dice que se recibió',
      async () => {
        navegadorRegresa(deepLinkPedido());
        const abierta = await abrirTienda('/pedido/701', {
          rutas: {
            [rutaEstadoPagoPedido()]: enSecuencia(
              conEstadoPago('sin_pago'),
              conEstadoPago('sin_pago'),
              conEstadoPago('aprobado'),
            ),
          },
        });
        await esperarDetalle(701, 'Pendiente de pago');
        conTextos('Falta completar tu pago en Mercado Pago. Tienes 24 horas desde que hiciste el pedido.');
        conTextos(/^Paga antes del /);
        conEtiquetas('Forma de pago: En línea con Mercado Pago');

        await tocarYEsperar(abierta.app, 'Completar el pago', '/pedido-confirmado/701');
        expect(await screen.findByRole('header', { name: '¡Pago recibido!' })).toBeOnTheScreen();
        revisarMercadoPago(1);
        expect(veces(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(1);

        await tocarYEsperar(abierta.app, 'Ver mis pedidos', '/mis-pedidos');
        await esperarLista();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, string, string | null]>([
      ['/pedido/999', 'Puede que ya no esté disponible. Revisa tus pedidos para ver su estado.', 'Pedido #999'],
      ['/pedido/abc', 'Puede que ya no esté disponible. Revisa tus pedidos para ver su estado.', 'Tu pedido'],
      ['/pedido-confirmado/999', 'Revisa tus pedidos para ver su estado.', null],
    ])(
      'un pedido que no existe (%s) lo dice y "Ver mis pedidos" lleva a la lista',
      async (ruta, mensaje, titulo) => {
        const { app } = await abrirTienda(ruta);
        expect(await screen.findByRole('header', { name: 'No encontramos este pedido' })).toBeOnTheScreen();
        conTextos(mensaje);
        if (titulo) {
          expect(screen.getByRole('header', { name: titulo })).toBeOnTheScreen();
        }
        sinTextos('Pedido no encontrado');
        await tocarYEsperar(app, 'Ver mis pedidos', '/mis-pedidos');
        await esperarLista();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, string]>([
      ['/pedido/705', 'Revisa tu conexión o intenta de nuevo en un momento.'],
      ['/pedido-confirmado/705', 'Tu pedido no se pierde. Revisa tu conexión e intenta de nuevo.'],
    ])(
      'si %s no carga lo dice y "Reintentar" muestra el pedido',
      async (ruta, mensaje) => {
        const falla = fallaHastaArreglar(() => respuesta(cuerpoPedido(pedido(705))));
        await abrirTienda(ruta, { rutas: { [rutaPedido(705)]: falla.manejador } });
        await reintentarTrasError(falla, 'No pudimos cargar tu pedido', mensaje);
        expect(await screen.findByLabelText('Estado: Listo para recoger')).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('Cancelar', () => {
    const PAGADO = pedido(703);

    it.each<[string, number, string, Record<string, Manejador>, string]>([
      ['un apartado sin pago en línea', 702, CANCELAR_BASE, {}, CANCELADO],
      [
        'un pedido pagado en línea',
        703,
        `${CANCELAR_BASE} Te devolvemos el pago completo al mismo medio con que pagaste en Mercado Pago.`,
        {},
        `${CANCELADO} Ya pedimos a Mercado Pago la devolución de $1,142.50 al mismo medio con que pagaste. Puede tardar unos días en reflejarse, según tu banco.`,
      ],
      [
        'un pedido pagado cuya devolución queda en revisión',
        703,
        `${CANCELAR_BASE} Te devolvemos el pago completo al mismo medio con que pagaste en Mercado Pago.`,
        { [rutaCancelarPedido(703)]: () => respuesta(cuerpoCancelarPedido(PAGADO, reembolsoCrudo('en_revision'))) },
        `${CANCELADO} La devolución de tu pago quedó en revisión: el salón la hará y te avisará.`,
      ],
    ])(
      '%s: la hoja lo explica, "No, conservarlo" la cierra y al confirmar queda cancelado con su aviso',
      async (_caso, id, textoHoja, rutas, aviso) => {
        const abierta = await abrirTienda(`/pedido/${id}`, { rutas });
        await esperarDetalle(id, id === 702 ? 'Apartado, pagas al recoger' : 'Pagado');

        await abrirHojaCancelarPedido(id, textoHoja);
        await tocar('No, conservarlo');
        await waitFor(() =>
          expect(screen.queryByRole('header', { name: `¿Cancelar el pedido #${id}?` })).not.toBeOnTheScreen(),
        );
        expect(veces(abierta, rutaCancelarPedido(id))).toBe(0);

        await abrirHojaCancelarPedido(id, textoHoja);
        await confirmarCancelacion();
        expect(await screen.findByText(aviso)).toBeOnTheScreen();
        conEtiquetas('Estado: Cancelado');
        sinBotones('Cancelar pedido');
        expect(screen.queryByRole('header', { name: 'Recoger en el salón' })).not.toBeOnTheScreen();
        expect(ultimoCuerpo(abierta, rutaCancelarPedido(id))).toEqual({ estado: 'cancelado' });
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, Manejador, () => void]>([
      [
        'ya se está preparando (403)',
        conError(ERRORES_PEDIDOS.soloPersonalCambiaEstado),
        () => {
          // El aviso queda en la hoja y ya no se puede confirmar.
          conTextos('Este pedido ya se está preparando y no se puede cancelar.');
          expect(screen.getByRole('button', { name: 'Sí, cancelar pedido' })).toBeDisabled();
        },
      ],
      [
        'cambió mientras se cancelaba (409)',
        conError(ERRORES_PEDIDOS.pedidoCambio),
        () => {
          conTextos('Tu pedido cambió. Lo actualizamos para que veas su estado.');
          expect(screen.queryByRole('header', { name: '¿Cancelar el pedido #703?' })).not.toBeOnTheScreen();
        },
      ],
    ])(
      'si el pedido %s lo dice con un texto de la app y muestra su estado nuevo',
      async (_caso, cancelar, revisar) => {
        const abierta = await abrirTienda('/pedido/703', {
          rutas: {
            [rutaCancelarPedido(703)]: cancelar,
            [rutaPedido(703)]: enSecuencia(
              () => respuesta(cuerpoPedido(PAGADO)),
              () => respuesta(cuerpoPedido(pedidoEnEstado('preparando', { id: 703 }))),
            ),
          },
        });
        await esperarDetalle(703, 'Pagado');
        await abrirHojaCancelarPedido(703, `${CANCELAR_BASE} Te devolvemos el pago completo al mismo medio con que pagaste en Mercado Pago.`);
        await confirmarCancelacion();

        expect(await screen.findByLabelText('Estado: En preparación')).toBeOnTheScreen();
        await waitFor(revisar);
        sinTextos(MENSAJES_PEDIDOS.soloPersonalCambiaEstado, MENSAJES_PEDIDOS.pedidoCambio);
        expect(veces(abierta, rutaCancelarPedido(703))).toBe(1);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });
});
