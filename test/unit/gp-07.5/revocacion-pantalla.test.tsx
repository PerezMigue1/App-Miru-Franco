/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import { fechaYHora } from '@/features/tienda/models/pedidoModel';
import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { obtenerConfiguracion, reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { AHORA_ISO, conError, sinRedEnRuta, type CuerpoError } from '../../helpers/citasFicticias';
import { LIMITE_MS, ultimoBoton } from '../../helpers/pantallas';
import { prepararPruebasReserva, retener, sinTextos, tocar } from '../../helpers/pantallasReserva';
import { enSecuencia } from '../../helpers/pantallasServicios';
import { abrirTienda, conTextos, ultimoCuerpo, veces } from '../../helpers/pantallasTienda';
import {
  cuerpoDetalle,
  cuerpoRevocar,
  ERRORES_REVOCAR,
  pedidoEntregadoRevocable,
  pedidoRevocable,
  REVOCABLE_HASTA_ISO,
  revocacionCruda,
  rutaRevocar,
  rutasDevoluciones,
  type EstadoRevocacionCrudo,
  type PedidoDetalleCrudo,
} from '../../helpers/pedidosFicticios';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import { cuerpoListaTienda, isoMasMinutos, rutaDevolucionesPedido, rutaPedido, type PedidoCrudo } from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.5: revocar la compra (art. 56 LFPC) desde el detalle del pedido con las pantallas reales, la
 * sesión de CLIENTA_CITAS, el reloj fijo (lunes 19 de octubre de 2026, 10:00 en México) y el servidor
 * simulado (http://api.test). El botón solo se ve dentro del plazo; la hoja avisa el derecho con los
 * días guardados en el pedido, cuánto se reintegra, qué pasa con el pedido y hasta cuándo; el motivo
 * es opcional; un candado evita el doble envío; cada resultado y cada error tiene su mensaje propio.
 * Nunca se revoca ni se reembolsa nada real.
 */

const t = (clave: Parameters<typeof obtenerTexto>[0], contexto = {}) => obtenerTexto(clave, contexto);
const REVOCAR = 'Revocar compra';
const CONFIRMAR = 'Sí, revocar mi compra';
const TITULO = (id: number) => `¿Revocar tu compra del pedido #${id}?`;

/** Abre el detalle del pedido con su GET de detalle y sus devoluciones y pagos (más las rutas de la prueba). */
async function abrirDetalle(pedido: PedidoDetalleCrudo, rutas: Record<string, Manejador> = {}) {
  const abierta = await abrirTienda(`/pedido/${pedido.id}`, {
    pedidos: [pedido as PedidoCrudo],
    rutas: { ...rutasDevoluciones(pedido.id), ...rutas },
  });
  expect(await screen.findByRole('header', { name: `Pedido #${pedido.id}` })).toBeOnTheScreen();
  return abierta;
}

/** Abre la hoja de revocar y espera su título. */
async function abrirHoja(id: number): Promise<void> {
  await tocar(REVOCAR);
  expect(await screen.findByRole('header', { name: TITULO(id) })).toBeOnTheScreen();
}

/** Espera que la hoja ya no esté (su salida tiene animación). */
async function hojaCerrada(id: number): Promise<void> {
  await waitFor(() => expect(screen.queryByRole('header', { name: TITULO(id) })).not.toBeOnTheScreen());
}

describe('Revocar la compra desde el detalle (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarConfiguracionPublica();
    jest.mocked(Linking.openURL).mockReset().mockResolvedValue(true);
  });

  it(
    'dentro del plazo: aviso completo, motivo opcional y, al revocar, el reembolso y la revocación en la lista',
    async () => {
      const pedido = pedidoRevocable();
      const abierta = await abrirDetalle(pedido, {
        [rutaRevocar()]: () => respuesta(cuerpoRevocar(pedido, 'reembolsado')),
        [rutaDevolucionesPedido(703)]: enSecuencia(
          () => respuesta(cuerpoListaTienda([])),
          () => respuesta(cuerpoListaTienda([revocacionCruda({ estado: 'aprobada' })])),
        ),
      });
      // Con las dos acciones a la vista, la diferencia entre cancelar y revocar (5 días del pedido).
      conTextos(t('pedidos.cancelarORevocar', { diasRevocacion: 5 }));
      expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeOnTheScreen();

      await abrirHoja(703);
      conTextos(
        `${t('tienda.revocar.derecho', { diasRevocacion: 5 })} ${t('tienda.revocar.reintegroTotal', { monto: '$1,142.50' })}`,
        t('tienda.revocar.sinRecoger'),
        t('tienda.revocar.hasta', { fechaLimite: fechaYHora(REVOCABLE_HASTA_ISO) }),
      );
      await fireEvent.changeText(screen.getByLabelText(t('tienda.revocar.motivo')), '  Ya no lo necesito  ');
      await fireEvent.press(ultimoBoton(CONFIRMAR));

      expect(await screen.findByText(t('tienda.revocar.resultadoReembolsado', { monto: '$1,142.50' }))).toBeOnTheScreen();
      await hojaCerrada(703);
      expect(ultimoCuerpo(abierta, rutaRevocar())).toEqual({ motivo: 'Ya no lo necesito' });
      expect(await screen.findByLabelText('Estado: Cancelado')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: REVOCAR })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeOnTheScreen();
      // La revocación queda consultable en la sección de devoluciones.
      expect(await screen.findByText(t('tienda.devoluciones.revocacion'))).toBeOnTheScreen();
      conTextos('Ya no lo necesito');
      expect(veces(abierta, rutaRevocar())).toBe(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, PedidoDetalleCrudo, EstadoRevocacionCrudo, string, 'tienda.revocar.yaRecogido' | 'tienda.revocar.sinRecoger']>([
    ['ya recogido: entregarlo en el salón', pedidoEntregadoRevocable(), 'pendiente_entrega', 'Estado: Entregado en el salón', 'tienda.revocar.yaRecogido'],
    ['sin recoger y el salón reembolsa a mano', pedidoRevocable(), 'en_revision', 'Estado: Cancelado', 'tienda.revocar.sinRecoger'],
  ])(
    '%s: el resultado dice qué pasa con el dinero',
    async (_caso, pedido, estado, insignia, queHacer) => {
      await abrirDetalle(pedido, { [rutaRevocar(pedido.id)]: () => respuesta(cuerpoRevocar(pedido, estado)) });
      await abrirHoja(pedido.id);
      conTextos(t(queHacer));
      await fireEvent.press(ultimoBoton(CONFIRMAR));
      const clave = estado === 'pendiente_entrega' ? 'tienda.revocar.resultadoPendienteEntrega' : 'tienda.revocar.resultadoEnRevision';
      expect(await screen.findByText(t(clave, { monto: '$1,142.50' }))).toBeOnTheScreen();
      expect(await screen.findByLabelText(insignia)).toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, Partial<PedidoDetalleCrudo>]>([
    ['el backend dice que no se puede (puedeRevocar en false)', { puedeRevocar: false }],
    ['el plazo ya pasó (revocableHasta antes de ahora)', { revocableHasta: isoMasMinutos(AHORA_ISO, -1) }],
    ['sin fecha límite', { revocableHasta: null }],
  ])(
    'fuera de plazo: %s, no hay botón ni explicación',
    async (_caso, cambios) => {
      await abrirDetalle(pedidoRevocable(cambios));
      expect(await screen.findByLabelText('Estado: Pagado')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: REVOCAR })).not.toBeOnTheScreen();
      sinTextos(t('pedidos.cancelarORevocar', { diasRevocacion: 5 }));
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'con parte ya devuelta, la hoja dice que se reintegra lo que falta por devolver',
    async () => {
      await abrirDetalle(pedidoEntregadoRevocable({ montoRevocable: 500 }));
      await abrirHoja(706);
      expect(screen.getByText(new RegExp(t('tienda.revocar.reintegroParcial', { monto: '$500' }).replace(/[.$]/g, '\\$&')))).toBeOnTheScreen();
      await fireEvent.press(ultimoBoton(t('tienda.revocar.conservar')));
      await hojaCerrada(706);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'un doble toque manda una sola revocación (candado) y la hoja no se cierra mientras revoca',
    async () => {
      const pedido = pedidoRevocable();
      const retenida = retener();
      const abierta = await abrirDetalle(pedido, {
        [rutaRevocar()]: retenida.envolver(() => respuesta(cuerpoRevocar(pedido, 'reembolsado'))),
      });
      await abrirHoja(703);
      await fireEvent.press(ultimoBoton(CONFIRMAR));
      await fireEvent.press(ultimoBoton(t('tienda.revocar.revocando')));
      await waitFor(() => expect(ultimoBoton(t('tienda.revocar.revocando'))).toBeBusy());
      await fireEvent.press(ultimoBoton(t('tienda.revocar.conservar')));
      expect(screen.getByRole('header', { name: TITULO(703) })).toBeOnTheScreen();
      expect(veces(abierta, rutaRevocar())).toBe(1);
      await retenida.soltar();
      expect(await screen.findByText(t('tienda.revocar.resultadoReembolsado', { monto: '$1,142.50' }))).toBeOnTheScreen();
      expect(veces(abierta, rutaRevocar())).toBe(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, CuerpoError, Parameters<typeof obtenerTexto>[0], boolean]>([
    ['ya revocada', ERRORES_REVOCAR.yaRevocada, 'tienda.revocar.yaRevocada', false],
    ['plazo terminado', ERRORES_REVOCAR.plazoTerminado, 'tienda.revocar.plazoTerminado', true],
    ['devolución activa', ERRORES_REVOCAR.devolucionActiva, 'tienda.revocar.devolucionActiva', true],
    ['ya reembolsado', ERRORES_REVOCAR.yaReembolsado, 'tienda.revocar.yaReembolsado', false],
    ['el pedido cambió', ERRORES_REVOCAR.cambio, 'tienda.revocar.cambio', false],
    ['pedido ajeno (404)', ERRORES_REVOCAR.noEncontrado, 'tienda.pedido.noEncontrado', false],
  ])(
    '409 o 404 (%s): cierra la hoja, lo explica sin el texto del servidor y vuelve a leer el pedido',
    async (_caso, cuerpo, clave, conSalon) => {
      const abierta = await abrirDetalle(pedidoRevocable(), { [rutaRevocar()]: conError(cuerpo) });
      const lecturas = veces(abierta, rutaPedido(703));
      await abrirHoja(703);
      await fireEvent.press(ultimoBoton(CONFIRMAR));
      expect(await screen.findByText(t(clave))).toBeOnTheScreen();
      await hojaCerrada(703);
      sinTextos(String(cuerpo.message));
      await waitFor(() => expect(veces(abierta, rutaPedido(703))).toBe(lecturas + 1));
      const telefono = obtenerConfiguracion().salon.telefono;
      expect(Boolean(screen.queryByRole('link', { name: `Llamar al ${telefono}` }))).toBe(conSalon);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'un motivo con caracteres no permitidos (400) se avisa en la hoja, que sigue abierta',
    async () => {
      await abrirDetalle(pedidoRevocable(), { [rutaRevocar()]: conError(ERRORES_REVOCAR.motivoInvalido) });
      await abrirHoja(703);
      await fireEvent.changeText(screen.getByLabelText(t('tienda.revocar.motivo')), 'motivo ficticio');
      await fireEvent.press(ultimoBoton(CONFIRMAR));
      expect(await screen.findByText(t('tienda.revocar.motivoInvalido'))).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: TITULO(703) })).toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'sin red: relee el pedido y, si la revocación sí quedó, lo dice en lugar de decir que no se pudo',
    async () => {
      const pedido = pedidoRevocable();
      const abierta = await abrirDetalle(pedido, {
        [rutaRevocar()]: sinRedEnRuta,
        [rutaPedido(703)]: enSecuencia(
          () => respuesta(cuerpoDetalle(pedido)),
          () => respuesta(cuerpoDetalle({ ...pedido, estado: 'cancelado', puedeRevocar: false })),
        ),
        [rutaDevolucionesPedido(703)]: enSecuencia(
          () => respuesta(cuerpoListaTienda([])),
          () => respuesta(cuerpoListaTienda([revocacionCruda()])),
        ),
      });
      await abrirHoja(703);
      await fireEvent.press(ultimoBoton(CONFIRMAR));
      expect(await screen.findByText(t('tienda.revocar.registrada'))).toBeOnTheScreen();
      await hojaCerrada(703);
      sinTextos(MENSAJE_SIN_CONEXION);
      expect(await screen.findByLabelText('Estado: Cancelado')).toBeOnTheScreen();
      expect(veces(abierta, rutaRevocar())).toBe(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'sin red y sin revocación al releer: la hoja dice que no hay conexión y se puede intentar de nuevo',
    async () => {
      const pedido = pedidoRevocable();
      const abierta = await abrirDetalle(pedido, {
        [rutaRevocar()]: enSecuencia(sinRedEnRuta, () => respuesta(cuerpoRevocar(pedido, 'reembolsado'))),
      });
      await abrirHoja(703);
      await fireEvent.press(ultimoBoton(CONFIRMAR));
      expect(await screen.findByText(MENSAJE_SIN_CONEXION)).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: TITULO(703) })).toBeOnTheScreen();
      await fireEvent.press(ultimoBoton(CONFIRMAR));
      expect(await screen.findByText(t('tienda.revocar.resultadoReembolsado', { monto: '$1,142.50' }))).toBeOnTheScreen();
      expect(veces(abierta, rutaRevocar())).toBe(2);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
