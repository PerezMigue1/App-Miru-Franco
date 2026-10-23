/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { useDetallePedidoViewModel } from '@/features/tienda/viewmodels/useDetallePedidoViewModel';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';

import { CLIENTA_CITAS, usarRelojFijo } from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { respuesta } from '../../helpers/servidorSimulado';
import { estadoPagoPedidoCrudo, pedidoCrudo, rutaEstadoPagoPedido, rutasPedidos } from '../../helpers/tiendaFicticia';
import {
  authSimulada,
  cerrarConTemporizadores,
  diferida,
  reiniciarSimulaciones,
  servidorVm,
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
 * Revisión GP-07.5: el detalle de un pedido en línea pendiente consulta su pago al abrir. Mientras esa
 * consulta va en camino no se sabe si la clienta ya pagó (el backend aplica en esa misma consulta un
 * pago aprobado cuyo aviso no llegó): cancelar no se ofrece ni se manda hasta tener la respuesta.
 */

espiarConsola(cerrarConTemporizadores, true);
usarRelojFijo();

beforeEach(() => {
  reiniciarSimulaciones();
  reiniciarVerificacion();
  reiniciarConfiguracionPublica();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA_CITAS;
});

const hacer = (accion: () => void) =>
  act(async () => {
    accion();
  });

describe('cancelar con la consulta del pago en camino', () => {
  it('no se ofrece ni manda el PUT hasta saber el estado del pago; con sin_pago, sí', async () => {
    const pedido = pedidoCrudo();
    const estadoPago = diferida();
    const llamadas = servidorVm({ ...rutasPedidos([pedido]), [rutaEstadoPagoPedido(pedido.id)]: () => estadoPago.promesa });
    const { result } = await renderHook(() => useDetallePedidoViewModel(String(pedido.id)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));

    expect(result.current.detalle?.puedeCancelar).toBe(false);
    await hacer(() => result.current.abrirCancelar());
    await hacer(() => result.current.cancelar());
    expect(result.current.hojaCancelarVisible).toBe(false);
    expect(llamadas.filter((l) => l.metodo === 'PUT')).toHaveLength(0);

    await act(async () => estadoPago.soltar(respuesta(estadoPagoPedidoCrudo('sin_pago'))));
    await waitFor(() => expect(result.current.detalle?.puedeCancelar).toBe(true));
  });

  it('un apartado (pago en el salón) se puede cancelar sin esperar ninguna consulta', async () => {
    const pedido = pedidoCrudo({ id: 702, metodoPago: 'pago_en_salon' });
    servidorVm(rutasPedidos([pedido]));
    const { result } = await renderHook(() => useDetallePedidoViewModel(String(pedido.id)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.detalle?.puedeCancelar).toBe(true);
  });
});
