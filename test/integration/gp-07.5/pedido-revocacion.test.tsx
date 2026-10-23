/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { fechaYHora } from '@/features/tienda/models/pedidoModel';
import { formatoPrecio } from '@/features/tienda/models/productoModel';
import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { AHORA_ISO } from '../../helpers/citasFicticias';
import { LIMITE_MS, ultimoBoton } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, sinTextos, tocar } from '../../helpers/pantallasReserva';
import { abrirTienda, conTextos, ultimoCuerpo, veces } from '../../helpers/pantallasTienda';
import {
  cuerpoRevocar,
  MONTO_TOTAL,
  pedidoRevocable,
  REVOCABLE_HASTA_ISO,
  rutaRevocar,
  rutasDevoluciones,
  type PedidoDetalleCrudo,
} from '../../helpers/pedidosFicticios';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import { isoMasMinutos, REGLAS_PEDIDO, type PedidoCrudo } from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.5: revocar la compra (art. 56 LFPC) de principio a fin con la app real (renderRouter), la
 * sesión de CLIENTA_CITAS, el reloj fijo (timers falsos en el lunes 19 de octubre de 2026, 10:00 en
 * México) y el servidor simulado (http://api.test). Desde Mis pedidos se abre el pedido pagado 703:
 * dentro del plazo (revocableHasta futura) la hoja muestra el monto y el aviso, se confirma y el
 * servidor recibe POST /api/pedidos/703/revocar; la pantalla da el resultado. Con el plazo vencido no
 * hay botón. Nunca se revoca ni se reembolsa nada real.
 */

const t = (clave: Parameters<typeof obtenerTexto>[0], contexto = {}) => obtenerTexto(clave, contexto);
const REVOCAR = t('tienda.revocar.boton');
const TITULO_HOJA = t('tienda.revocar.titulo', { pedido: 703 });
const MONTO = formatoPrecio(MONTO_TOTAL * 100);
const DIAS = { diasRevocacion: REGLAS_PEDIDO.diasHabilesRevocacion };

/** Abre Mis pedidos con ese pedido, toca su tarjeta y espera el detalle. */
async function abrirDesdeMisPedidos(pedido: PedidoDetalleCrudo, rutas: Record<string, Manejador> = {}) {
  const abierta = await abrirTienda('/mis-pedidos', {
    pedidos: [pedido as PedidoCrudo],
    rutas: { ...rutasDevoluciones(pedido.id), ...rutas },
  });
  await fireEvent.press(await screen.findByRole('button', { name: new RegExp(`^Pedido número ${pedido.id},`) }));
  await esperarRuta(abierta.app, `/pedido/${pedido.id}`);
  expect(await screen.findByRole('header', { name: `Pedido #${pedido.id}` })).toBeOnTheScreen();
  expect(await screen.findByLabelText('Estado: Pagado')).toBeOnTheScreen();
  return abierta;
}

describe('Revocar la compra desde Mis pedidos (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarConfiguracionPublica();
  });

  it(
    'dentro del plazo: la hoja da el monto y el aviso, se revoca con POST y la pantalla dice el resultado',
    async () => {
      const pedido = pedidoRevocable();
      expect(Date.parse(REVOCABLE_HASTA_ISO)).toBeGreaterThan(Date.parse(AHORA_ISO));
      const abierta = await abrirDesdeMisPedidos(pedido, {
        [rutaRevocar()]: () => respuesta(cuerpoRevocar(pedido, 'reembolsado')),
      });
      conTextos(t('pedidos.cancelarORevocar', DIAS));

      await tocar(REVOCAR);
      expect(await screen.findByRole('header', { name: TITULO_HOJA })).toBeOnTheScreen();
      conTextos(
        `${t('tienda.revocar.derecho', DIAS)} ${t('tienda.revocar.reintegroTotal', { monto: MONTO })}`,
        t('tienda.revocar.sinRecoger'),
        t('tienda.revocar.hasta', { fechaLimite: fechaYHora(REVOCABLE_HASTA_ISO) }),
      );
      expect(veces(abierta, rutaRevocar())).toBe(0);

      await fireEvent.press(ultimoBoton(t('tienda.revocar.confirmar')));
      expect(await screen.findByText(t('tienda.revocar.resultadoReembolsado', { monto: MONTO }))).toBeOnTheScreen();
      await waitFor(() => expect(screen.queryByRole('header', { name: TITULO_HOJA })).not.toBeOnTheScreen());
      expect(veces(abierta, rutaRevocar())).toBe(1);
      // Sin motivo escrito no se manda ninguno.
      expect(ultimoCuerpo(abierta, rutaRevocar())).toEqual({});
      expect(await screen.findByLabelText('Estado: Cancelado')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: REVOCAR })).not.toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'con revocableHasta vencida no hay botón para revocar ni la explicación, y no se envía nada',
    async () => {
      const abierta = await abrirDesdeMisPedidos(pedidoRevocable({ revocableHasta: isoMasMinutos(AHORA_ISO, -1) }));
      expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: REVOCAR })).not.toBeOnTheScreen();
      sinTextos(t('pedidos.cancelarORevocar', DIAS));
      expect(veces(abierta, rutaRevocar())).toBe(0);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
