/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { ID_CITA, llamadasDeRuta } from '../../helpers/citasFicticias';
import {
  compraCruda,
  comprobanteCompleto,
  comprobanteMinimo,
  conMios,
  respuestaMio,
  rutaMio,
  rutaMios,
} from '../../helpers/comprobantesFicticios';
import { LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import { abrirConCitas, abrirSinSesion, esperarDetalle } from '../../helpers/pantallasMisCitas';
import { esperarRuta } from '../../helpers/pantallasReserva';
import { abrirTienda } from '../../helpers/pantallasTienda';
import { ID_PEDIDO } from '../../helpers/tiendaFicticia';
import { errorServidor } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, Bloque A, con las pantallas reales (renderRouter sobre src/app) y el servidor simulado:
 * "Ver comprobante" en el detalle del pedido y en el de la cita. Sin comprobante (o si la consulta
 * falla) no hay botón y el detalle sigue igual; con uno abre /comprobante con el tipo y el id del
 * elemento de GET /api/comprobantes/mios; una cita con anticipo y venta muestra dos botones y la venta
 * se abre con tipo=venta. Sin sesión, la pantalla del comprobante regresa a Inicio sin pedir nada.
 * Datos ficticios; nada sale a la red.
 */

const PEDIDO = `Pedido #${ID_PEDIDO}`;
const VER = 'Ver comprobante';

async function esperarPedido(): Promise<void> {
  expect(await screen.findByRole('header', { name: PEDIDO })).toBeOnTheScreen();
  expect(await screen.findByText('Artículos')).toBeOnTheScreen();
}

describe('Ver comprobante en los detalles (GP-09)', () => {
  const revisarConsola = prepararPruebasDePantalla();

  it(
    'pedido sin comprobante (/mios responde 404): no hay botón y el detalle sigue',
    async () => {
      const { llamadas } = await abrirTienda(`/pedido/${ID_PEDIDO}`);
      await esperarPedido();
      await waitFor(() => expect(llamadasDeRuta(llamadas, rutaMios('pedido', ID_PEDIDO))).toHaveLength(1));
      expect(screen.queryByRole('button', { name: new RegExp(VER) })).not.toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'pedido con un comprobante: "Ver comprobante" abre /comprobante?tipo=pedido&id=N y Volver regresa',
    async () => {
      const { app, llamadas } = await abrirTienda(`/pedido/${ID_PEDIDO}`, {
        rutas: {
          [rutaMios('pedido', ID_PEDIDO)]: conMios(compraCruda('pedido', ID_PEDIDO, PEDIDO)),
          [rutaMio('pedido', ID_PEDIDO)]: () => respuestaMio(comprobanteMinimo({ compra: PEDIDO })),
        },
      });
      await esperarPedido();

      const boton = await screen.findByRole('button', { name: VER });
      expect(boton.props.accessibilityHint).toBe('Abre el comprobante de tu pago');
      await fireEvent.press(boton);

      await esperarRuta(app, '/comprobante');
      expect(await screen.findByText(`Folio: P-000010 (${PEDIDO})`)).toBeOnTheScreen();
      expect(llamadasDeRuta(llamadas, rutaMio('pedido', ID_PEDIDO))).toHaveLength(1);

      await fireEvent.press(screen.getAllByRole('button', { name: 'Volver' }).at(-1)!);
      await esperarRuta(app, `/pedido/${ID_PEDIDO}`);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'cita con anticipo y venta: dos botones con su etiqueta y la venta abre con tipo=venta',
    async () => {
      const { app, llamadas } = await abrirConCitas(`/cita/${ID_CITA}`, {
        rutas: {
          [rutaMios('cita', ID_CITA)]: conMios(
            compraCruda('cita', ID_CITA, `Anticipo de la cita #${ID_CITA}`),
            compraCruda('venta', 45, 'Venta V-00045'),
          ),
          [rutaMio('venta', 45)]: () => respuestaMio(comprobanteCompleto()),
        },
      });
      await esperarDetalle(app, ID_CITA);

      expect(await screen.findByRole('button', { name: `${VER}: Anticipo de la cita #${ID_CITA}` })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: `${VER}: Venta V-00045` }));

      await esperarRuta(app, '/comprobante');
      expect(await screen.findByLabelText('Total $999, IVA incluido')).toBeOnTheScreen();
      expect(llamadasDeRuta(llamadas, rutaMio('venta', 45))).toHaveLength(1);
      expect(llamadasDeRuta(llamadas, rutaMio('cita', ID_CITA))).toHaveLength(0);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'cita cuya consulta de comprobantes falla: sin botones y el detalle sigue',
    async () => {
      const { app, llamadas } = await abrirConCitas(`/cita/${ID_CITA}`, {
        rutas: { [rutaMios('cita', ID_CITA)]: () => errorServidor(500) },
      });
      await esperarDetalle(app, ID_CITA);
      await waitFor(() => expect(llamadasDeRuta(llamadas, rutaMios('cita', ID_CITA))).toHaveLength(1));
      expect(screen.queryByRole('button', { name: new RegExp(VER) })).not.toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Tu cita' })).toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'sin sesión, /comprobante regresa a Inicio y no pide el comprobante',
    async () => {
      const { app, llamadas } = await abrirSinSesion('/comprobante?tipo=pedido&id=7');
      await esperarRuta(app, '/inicio');
      expect(llamadas.filter((llamada) => llamada.ruta.startsWith('/api/comprobantes'))).toHaveLength(0);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
