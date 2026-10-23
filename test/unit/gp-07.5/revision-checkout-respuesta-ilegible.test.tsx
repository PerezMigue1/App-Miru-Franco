/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useCheckoutViewModel, type CheckoutViewModel } from '@/features/tienda/viewmodels/useCheckoutViewModel';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { escriturasCompra, RUTAS_COMPRA_LEGAL } from '../../helpers/checkoutFicticio';
import { CLIENTA_CITAS, usarRelojFijo } from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';
import { respuesta } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import {
  CARRITO_CRUDO,
  carritoSimulado,
  cuerpoMisPedidos,
  ID_PEDIDO,
  pedidoDesdeCuerpo,
  RUTA_CREAR_PEDIDO,
  RUTA_MIS_PEDIDOS,
  rutasCatalogoTienda,
} from '../../helpers/tiendaFicticia';
import {
  cerrarConTemporizadores,
  espiarAtras,
  reiniciarSimulaciones,
  routerSimulado,
  servidorVm,
  type ManejadorVm,
} from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => {
  const simulado = require('../../helpers/viewmodelsAuth');
  simulado.routerSimulado.canGoBack = jest.fn(() => true);
  return simulado.expoRouterSimulado();
});
jest.mock('@/features/tienda/viewmodels/usePiezasCarrito', () => ({
  avisarCambioCarrito: jest.fn(),
  publicarPiezasCarrito: jest.fn(),
}));
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * Revisión GP-07.5: POST /api/pedidos respondió 201 pero sin el pedido en el cuerpo (un proxy que
 * corta o cambia la respuesta). El pedido sí se creó: la app no debe tratarlo como un error común que
 * deja reintentar (crearía un segundo pedido y descontaría las existencias dos veces). Lo busca en
 * Mis pedidos; si no lo encuentra, bloquea confirmar y pide revisar Mis pedidos.
 */

let atras: ReturnType<typeof espiarAtras>;

beforeEach(async () => {
  reiniciarSimulaciones();
  reiniciarConfiguracionPublica();
  reiniciarDocumentosLegales();
  limpiarArchivos();
  atras = espiarAtras();
  await sembrarSesion(CLIENTA_CITAS);
});

afterEach(() => {
  atras.restaurar();
});

espiarConsola(cerrarConTemporizadores, true);
usarRelojFijo();

const hacer = (accion: () => void) =>
  act(async () => {
    accion();
  });

async function abrir(rutas: Record<string, ManejadorVm>) {
  const carrito = carritoSimulado({ items: CARRITO_CRUDO });
  const llamadas = servidorVm({ ...RUTAS_COMPRA_LEGAL, ...rutasCatalogoTienda(), ...carrito.rutas, ...rutas });
  const hook = await renderHook(() => useCheckoutViewModel());
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  return { ...hook, llamadas };
}

async function confirmarCompra(vm: { current: CheckoutViewModel }) {
  await hacer(() => vm.current.continuar());
  await hacer(() => vm.current.continuar());
  await hacer(() => {
    vm.current.cambiarCasilla('terminosVenta', true);
    vm.current.cambiarCasilla('reembolsos', true);
  });
  await hacer(() => vm.current.confirmar());
}

describe('201 sin el pedido en el cuerpo', () => {
  it('lo encuentra en Mis pedidos, sigue con él y no crea otro', async () => {
    const creados: ReturnType<typeof pedidoDesdeCuerpo>[] = [];
    const { result, llamadas } = await abrir({
      [RUTA_CREAR_PEDIDO]: (cuerpo) => {
        creados.push(pedidoDesdeCuerpo(cuerpo));
        return respuesta({ success: true }, 201);
      },
      [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos(creados)),
    });
    await confirmarCompra(result);
    await waitFor(() => expect(routerSimulado.replace).toHaveBeenCalledWith(`/pedido-confirmado/${ID_PEDIDO}`));
    expect(escriturasCompra(llamadas)).toEqual([RUTA_CONSENTIMIENTOS, RUTA_CREAR_PEDIDO]);
  });

  it('si no lo encuentra, bloquea confirmar y pide revisar Mis pedidos (nunca un segundo pedido)', async () => {
    const { result, llamadas } = await abrir({
      [RUTA_CREAR_PEDIDO]: () => respuesta({ success: true }, 201),
      [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos([])),
    });
    await confirmarCompra(result);
    await waitFor(() => expect(result.current.revisarMisPedidos).toBe(true));
    expect(result.current.errorEnvio).toMatch(/Mis pedidos/);
    await hacer(() => result.current.confirmar());
    expect(escriturasCompra(llamadas)).toEqual([RUTA_CONSENTIMIENTOS, RUTA_CREAR_PEDIDO]);
    expect(routerSimulado.replace).not.toHaveBeenCalled();
  });
});
