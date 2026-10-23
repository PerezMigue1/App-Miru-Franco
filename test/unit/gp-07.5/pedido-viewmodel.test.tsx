/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { useDetallePedidoViewModel } from '@/features/tienda/viewmodels/useDetallePedidoViewModel';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { tiendaCompra } from '@/shared/ui/tokens';

import { CLIENTA_CITAS, cuerpoError, llamadasDeRuta, respuestaError, usarRelojFijo } from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { cuerpoDetalle, cuerpoRevocar, pedidoRevocable, rutaRevocar } from '../../helpers/pedidosFicticios';
import { respuesta } from '../../helpers/servidorSimulado';
import {
  cuerpoListaTienda,
  estadoPagoPedidoCrudo,
  pedidoApartado,
  pedidoCrudo,
  pedidoEnEstado,
  rutaDevolucionesPedido,
  rutaEstadoPagoPedido,
  rutaPedido,
  rutasPedidos,
  type PedidoCrudo,
} from '../../helpers/tiendaFicticia';
import {
  authSimulada,
  cerrarConTemporizadores,
  diferida,
  reiniciarSimulaciones,
  routerSimulado,
  servidorVm,
  type ManejadorVm,
} from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => {
  const react = require('react');
  const simulado = require('../../helpers/viewmodelsAuth');
  simulado.routerSimulado.canGoBack = jest.fn(() => true);
  return {
    useRouter: () => simulado.routerSimulado,
    useFocusEffect: (efecto: () => unknown) => {
      react.useEffect(() => efecto(), [efecto]);
    },
  };
});
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());

/**
 * GP-07.5: useDetallePedidoViewModel en caja negra (renderHook, models y apiClient reales, fetch
 * simulado en http://api.test): las acciones que no deben hacer nada (cancelar un pedido que ya se
 * prepara, revocar uno que no se puede, completar el pago con un pago en proceso, cerrar la hoja o
 * cambiar el motivo mientras revoca), el tope del motivo y las recargas de devoluciones que ya no son
 * la última (no pisan a la más nueva).
 */

// Sin avisos de act() ni errores en consola; al final se desmonta con los temporizadores falsos y
// después usarRelojFijo vuelve a los reales.
espiarConsola(cerrarConTemporizadores, true);
usarRelojFijo();

const hacer = (accion: () => void) =>
  act(async () => {
    accion();
  });

function servidor(pedidos: PedidoCrudo[], rutas: Record<string, ManejadorVm> = {}) {
  return servidorVm({ ...rutasPedidos(pedidos), ...rutas });
}

async function abrir(id: number) {
  const hook = await renderHook(() => useDetallePedidoViewModel(String(id)));
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  await waitFor(() => expect(hook.result.current.estadoDevoluciones).toBe('listo'));
  return hook;
}

beforeEach(() => {
  reiniciarSimulaciones();
  reiniciarVerificacion();
  reiniciarConfiguracionPublica();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA_CITAS;
});

describe('acciones que no deben hacer nada', () => {
  it('un pedido que ya se prepara: abrir o confirmar cancelar no hacen nada', async () => {
    const llamadas = servidor([pedidoEnEstado('preparando', { id: 704 })]);
    const { result } = await abrir(704);
    await hacer(() => result.current.abrirCancelar());
    await hacer(() => result.current.cancelar());
    expect(result.current.hojaCancelarVisible).toBe(false);
    expect(llamadas.filter((l) => l.metodo === 'PUT')).toHaveLength(0);
  });

  it('un pedido que no se puede revocar: abrir o confirmar la revocación no hacen nada', async () => {
    const llamadas = servidor([pedidoApartado()]);
    const { result } = await abrir(702);
    await hacer(() => result.current.abrirRevocar());
    await hacer(() => result.current.revocar());
    expect(result.current.hojaRevocarVisible).toBe(false);
    expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(0);
  });

  it('con el pago en proceso, completar el pago no abre la confirmación para pagar', async () => {
    servidor([pedidoCrudo()], { [rutaEstadoPagoPedido()]: () => respuesta(estadoPagoPedidoCrudo('pendiente')) });
    const { result } = await abrir(701);
    await waitFor(() => expect(result.current.pagoEnProceso).toBe(true));
    await hacer(() => result.current.completarPago());
    expect(routerSimulado.push).not.toHaveBeenCalled();
    expect(result.current.detalle?.accionPago).toBe('revisar');
    expect(result.current.detalle?.puedeCancelar).toBe(false);
  });

  it('mientras revoca, el motivo no cambia y la hoja no se cierra; el motivo se corta a su tope', async () => {
    const pedido = pedidoRevocable();
    const pendiente = diferida();
    servidor([pedido as PedidoCrudo], { [rutaRevocar()]: () => pendiente.promesa });
    const { result } = await abrir(703);
    await hacer(() => result.current.abrirRevocar());
    await hacer(() => result.current.cambiarMotivoRevocacion('x'.repeat(tiendaCompra.largoMotivoRevocacion + 10)));
    expect(result.current.motivoRevocacion).toHaveLength(tiendaCompra.largoMotivoRevocacion);
    await hacer(() => result.current.revocar());
    expect(result.current.revocando).toBe(true);
    await hacer(() => result.current.cambiarMotivoRevocacion('otro'));
    await hacer(() => result.current.cerrarRevocar());
    expect(result.current.hojaRevocarVisible).toBe(true);
    expect(result.current.motivoRevocacion).toHaveLength(tiendaCompra.largoMotivoRevocacion);
    await act(async () => pendiente.soltar(respuesta(cuerpoRevocar(pedido, 'reembolsado'))));
    await waitFor(() => expect(result.current.hojaRevocarVisible).toBe(false));
    expect(result.current.motivoRevocacion).toBe('');
    expect(result.current.aviso?.tipo).toBe('exito');
  });

  it('cerrar la hoja de revocar sin revocar no manda nada', async () => {
    const llamadas = servidor([pedidoRevocable() as PedidoCrudo]);
    const { result } = await abrir(703);
    await hacer(() => result.current.abrirRevocar());
    expect(result.current.hojaRevocarVisible).toBe(true);
    await hacer(() => result.current.cerrarRevocar());
    expect(result.current.hojaRevocarVisible).toBe(false);
    expect(llamadasDeRuta(llamadas, rutaRevocar())).toHaveLength(0);
  });

  it('sin pedido, reintentar las devoluciones no pide nada', async () => {
    const llamadas = servidor([], { [rutaPedido(703)]: () => respuestaError(cuerpoError(404, 'Pedido no encontrado')) });
    const hook = await renderHook(() => useDetallePedidoViewModel('703'));
    await waitFor(() => expect(hook.result.current.estado).toBe('noEncontrado'));
    await hacer(() => hook.result.current.reintentarDevoluciones());
    expect(llamadasDeRuta(llamadas, rutaDevolucionesPedido(703))).toHaveLength(0);
  });
});

describe('recargas de devoluciones que ya no son la última', () => {
  it.each<[string, ManejadorVm, string]>([
    ['que responden bien', () => respuesta(cuerpoListaTienda([])), 'listo'],
    ['que fallan', () => respuestaError(cuerpoError(500, 'Error interno ficticio')), 'error'],
  ])('dos reintentos seguidos %s: solo cuenta el último', async (_caso, manejador, final) => {
    const pedido = pedidoRevocable();
    let lecturas = 0;
    const llamadas = servidor([pedido as PedidoCrudo], {
      [rutaPedido(703)]: () => respuesta(cuerpoDetalle(pedido)),
      [rutaDevolucionesPedido(703)]: (cuerpo) => {
        lecturas += 1;
        return lecturas === 1 ? respuesta(cuerpoListaTienda([])) : manejador(cuerpo);
      },
    });
    const { result } = await abrir(703);
    await hacer(() => {
      result.current.reintentarDevoluciones();
      result.current.reintentarDevoluciones();
    });
    await waitFor(() => expect(result.current.estadoDevoluciones).toBe(final));
    expect(llamadasDeRuta(llamadas, rutaDevolucionesPedido(703))).toHaveLength(3);
  });
});
