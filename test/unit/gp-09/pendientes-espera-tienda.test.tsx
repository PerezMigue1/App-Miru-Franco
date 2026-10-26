/// <reference types="jest" />

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import { HojaCancelarPedido } from '@/features/tienda/components/HojaCancelarPedido';
import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { useCheckoutViewModel, type CheckoutViewModel } from '@/features/tienda/viewmodels/useCheckoutViewModel';
import { useDetallePedidoViewModel } from '@/features/tienda/viewmodels/useDetallePedidoViewModel';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { ConAreaSegura } from '../../helpers/areaSegura';
import { RUTAS_COMPRA_LEGAL } from '../../helpers/checkoutFicticio';
import { CLIENTA_CITAS, llamadasDeRuta, usarRelojFijo } from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { limite429, MENSAJE_LIMITE } from '../../helpers/limitesRed';
import { RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';
import { respuesta } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import {
  CARRITO_CRUDO,
  carritoSimulado,
  cuerpoCancelarPedido,
  cuerpoMisPedidos,
  cuerpoPedido,
  ID_PEDIDO,
  pedidoApartado,
  pedidoDesdeCuerpo,
  RUTA_CREAR_PEDIDO,
  RUTA_MIS_PEDIDOS,
  rutaCancelarPedido,
  rutasCatalogoTienda,
  rutasPedidos,
} from '../../helpers/tiendaFicticia';
import {
  authSimulada,
  cerrarConTemporizadores,
  enSecuencia,
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
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('@/features/tienda/viewmodels/usePiezasCarrito', () => ({
  avisarCambioCarrito: jest.fn(),
  publicarPiezasCarrito: jest.fn(),
  releerCarrito: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-09, pendientes del prompt 3 (bloque E1): un 429 al cancelar un pedido (PUT /api/pedidos/:id) y al
 * crearlo en el checkout (POST /api/pedidos, o el registro de sus casillas) muestra el message del
 * backend y deja el botón deshabilitado con "Intenta de nuevo en N s"; en la espera no se envía nada
 * otra vez y al terminar se puede reintentar. Un 429 al crear el pedido no es "sin respuesta": no se
 * busca en Mis pedidos. fetch simulado (http://api.test), datos ficticios y reloj falso.
 */

const ESPERA = RESPALDO_TEXTOS['errores.esperaLimite'];
const esperaDe = (segundos: number) => ESPERA.replace('{segundos}', String(segundos));

const hacer = (accion: () => void) =>
  act(async () => {
    accion();
  });
const avanzar = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

let atras: ReturnType<typeof espiarAtras>;

beforeEach(async () => {
  reiniciarSimulaciones();
  reiniciarVerificacion();
  reiniciarConfiguracionPublica();
  reiniciarDocumentosLegales();
  limpiarArchivos();
  atras = espiarAtras();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA_CITAS;
  await sembrarSesion(CLIENTA_CITAS);
});

afterEach(() => {
  atras.restaurar();
});

espiarConsola(cerrarConTemporizadores, true);
usarRelojFijo();

describe('cancelar un pedido con un 429', () => {
  const APARTADO = pedidoApartado();
  const PUT = rutaCancelarPedido(APARTADO.id);

  it('el message en la hoja, el botón en espera y sin segundo PUT; al terminar cancela', async () => {
    const llamadas = servidorVm({
      ...rutasPedidos([APARTADO]),
      [PUT]: enSecuencia(
        () => limite429(25),
        () => respuesta(cuerpoCancelarPedido(APARTADO)),
      ),
    });
    const { result } = await renderHook(() => useDetallePedidoViewModel(String(APARTADO.id)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    await hacer(() => result.current.abrirCancelar());
    expect(result.current).toMatchObject({ hojaCancelarVisible: true, cancelarEnEspera: false, textoEsperaCancelar: null });

    await hacer(() => result.current.cancelar());
    await waitFor(() => expect(result.current.errorCancelacion).toBe(MENSAJE_LIMITE));
    expect(result.current).toMatchObject({
      cancelarEnEspera: true,
      textoEsperaCancelar: esperaDe(25),
      cancelando: false,
      hojaCancelarVisible: true,
    });
    await hacer(() => result.current.cancelar());
    expect(llamadasDeRuta(llamadas, PUT)).toHaveLength(1);

    await avanzar(25_000);
    expect(result.current).toMatchObject({ cancelarEnEspera: false, textoEsperaCancelar: null });
    await hacer(() => result.current.cancelar());
    await waitFor(() => expect(result.current.pedido?.estado).toBe('cancelado'));
    expect(llamadasDeRuta(llamadas, PUT)).toHaveLength(2);
  });
});

describe('HojaCancelarPedido con la espera', () => {
  it('muestra "Intenta de nuevo en N s" en lugar de confirmar y no responde al toque', async () => {
    const onCancelar = jest.fn();
    await render(
      <HojaCancelarPedido
        visible
        onCerrar={jest.fn()}
        numero={702}
        texto="Tu pedido se cancela."
        cancelando={false}
        textoEspera={esperaDe(7)}
        error={MENSAJE_LIMITE}
        puedeConfirmar={false}
        onCancelar={onCancelar}
      />,
      { wrapper: ConAreaSegura },
    );
    const boton = screen.getByRole('button', { name: esperaDe(7) });
    expect(boton).toBeDisabled();
    expect(screen.getByText(MENSAJE_LIMITE)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: RESPALDO_TEXTOS['tienda.pedido.cancelar.confirmar'] })).toBeNull();
    await fireEvent.press(boton);
    expect(onCancelar).not.toHaveBeenCalled();
  });
});

describe('crear el pedido en el checkout con un 429', () => {
  const crearComoServidor: ManejadorVm = (cuerpo) => respuesta(cuerpoPedido(pedidoDesdeCuerpo(cuerpo)), 201);

  async function abrir(rutas: Record<string, ManejadorVm>) {
    const carrito = carritoSimulado({ items: CARRITO_CRUDO });
    const llamadas = servidorVm({
      ...RUTAS_COMPRA_LEGAL,
      ...rutasCatalogoTienda(),
      [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos([])),
      [RUTA_CREAR_PEDIDO]: crearComoServidor,
      ...carrito.rutas,
      ...rutas,
    });
    const hook = await renderHook(() => useCheckoutViewModel());
    await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
    const vm = hook.result;
    await hacer(() => vm.current.continuar());
    await hacer(() => vm.current.continuar());
    expect(vm.current.paso).toBe(3);
    await hacer(() => {
      vm.current.cambiarCasilla('terminosVenta', true);
      vm.current.cambiarCasilla('reembolsos', true);
    });
    return { result: vm, llamadas };
  }

  const confirmar = (vm: { current: CheckoutViewModel }) => hacer(() => vm.current.confirmar());

  it('al crear el pedido: el message, el botón en espera, sin buscar en Mis pedidos ni segundo POST; al terminar lo crea', async () => {
    const { result, llamadas } = await abrir({
      [RUTA_CREAR_PEDIDO]: enSecuencia(() => limite429(40), () => respuesta(cuerpoPedido(pedidoDesdeCuerpo({})), 201)),
    });
    const textoNormal = result.current.botonFinal;

    await confirmar(result);
    await waitFor(() => expect(result.current.errorEnvio).toBe(MENSAJE_LIMITE));
    expect(result.current).toMatchObject({
      enEspera: true,
      botonFinal: esperaDe(40),
      enviando: false,
      revisarMisPedidos: false,
    });
    expect(llamadasDeRuta(llamadas, RUTA_MIS_PEDIDOS)).toHaveLength(0);
    const casillas = llamadasDeRuta(llamadas, RUTA_CONSENTIMIENTOS).length;

    await confirmar(result);
    expect(llamadasDeRuta(llamadas, RUTA_CREAR_PEDIDO)).toHaveLength(1);
    expect(llamadasDeRuta(llamadas, RUTA_CONSENTIMIENTOS)).toHaveLength(casillas);

    await avanzar(40_000);
    expect(result.current).toMatchObject({ enEspera: false, botonFinal: textoNormal });
    await confirmar(result);
    await waitFor(() => expect(routerSimulado.replace).toHaveBeenCalledWith(`/pedido-confirmado/${ID_PEDIDO}`));
    expect(llamadasDeRuta(llamadas, RUTA_CREAR_PEDIDO)).toHaveLength(2);
  });

  it('al registrar las casillas: el message y la espera, sin crear el pedido', async () => {
    const { result, llamadas } = await abrir({ [RUTA_CONSENTIMIENTOS]: () => limite429(12) });
    await confirmar(result);
    await waitFor(() => expect(result.current.errorEnvio).toBe(MENSAJE_LIMITE));
    expect(result.current).toMatchObject({ enEspera: true, botonFinal: esperaDe(12) });
    expect(llamadasDeRuta(llamadas, RUTA_CREAR_PEDIDO)).toHaveLength(0);
    await confirmar(result);
    expect(llamadasDeRuta(llamadas, RUTA_CONSENTIMIENTOS)).toHaveLength(1);
  });
});
