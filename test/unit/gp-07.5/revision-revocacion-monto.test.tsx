/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { formatoPrecio } from '@/features/tienda/models/productoModel';
import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { useDetallePedidoViewModel } from '@/features/tienda/viewmodels/useDetallePedidoViewModel';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';

import { CLIENTA_CITAS, usarRelojFijo } from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { cuerpoRevocar, MONTO_TOTAL, pedidoRevocable, rutaRevocar } from '../../helpers/pedidosFicticios';
import { respuesta } from '../../helpers/servidorSimulado';
import { rutasPedidos, type PedidoCrudo } from '../../helpers/tiendaFicticia';
import { authSimulada, cerrarConTemporizadores, reiniciarSimulaciones, servidorVm } from '../../helpers/viewmodelsAuth';

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
 * Revisión GP-07.5: si la respuesta de revocar llega sin un monto válido, el aviso nunca dice "$0"
 * (sería falso: se revocó un pedido con saldo por reintegrar). Usa lo que el detalle ya decía que se
 * reintegraría (montoRevocable, que el backend solo da con saldo mayor que cero).
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

describe('aviso de la revocación sin monto en la respuesta', () => {
  it.each(['reembolsado', 'en_revision', 'pendiente_entrega'])('%s: dice el monto revocable, nunca $0', async (estado) => {
    const pedido = pedidoRevocable();
    servidorVm({
      ...rutasPedidos([pedido as PedidoCrudo]),
      [rutaRevocar(pedido.id)]: () => respuesta(cuerpoRevocar(pedido, estado, 0)),
    });
    const { result } = await renderHook(() => useDetallePedidoViewModel(String(pedido.id)));
    await waitFor(() => expect(result.current.detalle?.puedeRevocar).toBe(true));
    await act(async () => {
      result.current.abrirRevocar();
    });
    await act(async () => {
      result.current.revocar();
    });
    await waitFor(() => expect(result.current.aviso).not.toBeNull());
    expect(result.current.aviso?.texto).not.toContain('$0');
    expect(result.current.aviso?.texto).toContain(formatoPrecio(Math.round(MONTO_TOTAL * 100)));
  });
});
