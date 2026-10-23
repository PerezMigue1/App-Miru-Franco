/// <reference types="jest" />

import { configurarVigilancia, reiniciarVerificacion, verificarPago } from '@/features/tienda/models/verificacionPago';
import { nuevaGeneracion } from '@/shared/api/tokenStorage';

import { llamadasDeRuta, usarRelojFijo } from '../../helpers/citasFicticias';
import { respuesta, type Llamada } from '../../helpers/servidorSimulado';
import { estadoPagoPedidoCrudo, ID_PEDIDO, rutaEstadoPagoPedido } from '../../helpers/tiendaFicticia';
import { servidorVm } from '../../helpers/viewmodelsAuth';

/**
 * Revisión GP-07.5: con el pago pendiente, la verificación deja programado su siguiente reintento. Si
 * la clienta cierra sesión (o entra otra) antes de que llegue, el reintento ya no consulta el pago:
 * sería una petición con la sesión de otra persona por un pedido que no es suyo.
 */

const RUTA_ESTADO = rutaEstadoPagoPedido();
let llamadas: Llamada[] = [];

async function correr(ms = 0): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
  }
}

usarRelojFijo();

beforeEach(() => {
  reiniciarVerificacion();
  configurarVigilancia(null);
  llamadas = servidorVm({ [RUTA_ESTADO]: () => respuesta(estadoPagoPedidoCrudo('pendiente')) });
});

afterEach(() => {
  reiniciarVerificacion();
});

describe('reintento programado y cambio de sesión', () => {
  it('después del cambio de sesión el reintento no consulta y la verificación termina detenida', async () => {
    const promesa = verificarPago(ID_PEDIDO, { motivo: 'revisar' });
    await correr();
    expect(llamadasDeRuta(llamadas, RUTA_ESTADO)).toHaveLength(1);
    nuevaGeneracion();
    await correr(60_000);
    expect(llamadasDeRuta(llamadas, RUTA_ESTADO)).toHaveLength(1);
    expect(await promesa).toMatchObject({ detenida: true });
  });
});
