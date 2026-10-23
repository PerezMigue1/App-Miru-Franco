/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { mantenerVerificacion, reiniciarVerificacion, verificacionEnCurso } from '@/features/tienda/models/verificacionPago';
import { abrirPagoEnNavegador } from '@/features/tienda/viewmodels/pagoPedido';
import {
  useEstadoPagoConocido,
  verificarPago,
  vigilarAppState,
} from '@/features/tienda/viewmodels/useVerificacionPago';

import { usarRelojFijo } from '../../helpers/citasFicticias';
import { abrirSesionSimulada } from '../../helpers/google';
import { respuesta } from '../../helpers/servidorSimulado';
import { estadoPagoPedidoCrudo, ID_PEDIDO, INIT_POINT_PEDIDO, rutaEstadoPagoPedido } from '../../helpers/tiendaFicticia';
import { diferida, servidorVm } from '../../helpers/viewmodelsAuth';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.5: la capa viewmodel del registro de la verificación: la vigilancia del primer plano con
 * AppState, el hook useEstadoPagoConocido y el candado de pagoPedido que nunca abre dos pagos a la
 * vez. AppState y expo-web-browser están simulados; fetch responde con datos ficticios.
 */

let oyentes: ((estado: AppStateStatus) => void)[] = [];
let espia: jest.SpyInstance;
const quitar = jest.fn();

usarRelojFijo();

beforeEach(() => {
  oyentes = [];
  quitar.mockClear();
  espia = jest.spyOn(AppState, 'addEventListener').mockImplementation((_evento, oyente) => {
    oyentes.push(oyente as (estado: AppStateStatus) => void);
    return { remove: quitar };
  });
  reiniciarVerificacion();
  abrirSesionSimulada().mockReset().mockResolvedValue({ type: 'cancel' });
});

afterEach(() => {
  reiniciarVerificacion();
  espia.mockRestore();
});

describe('vigilarAppState', () => {
  it.each<[AppStateStatus, boolean[]]>([
    ['active', [true]],
    ['background', [false]],
    ['inactive', [false]],
    ['unknown', []],
  ])('con la app en %s avisa %p', (estado, avisos) => {
    const alCambiar = jest.fn();
    const soltar = vigilarAppState(alCambiar);
    oyentes.forEach((oyente) => oyente(estado));
    expect(alCambiar.mock.calls.map(([valor]) => valor)).toEqual(avisos);
    soltar();
    expect(quitar).toHaveBeenCalledTimes(1);
  });

  it('el registro la conecta mientras verifica y la suelta al terminar sin nada pendiente', async () => {
    const pausa = diferida();
    servidorVm({ [rutaEstadoPagoPedido()]: () => pausa.promesa });
    const promesa = verificarPago(ID_PEDIDO);
    expect(oyentes).toHaveLength(1);
    pausa.soltar(respuesta(estadoPagoPedidoCrudo('aprobado')));
    await promesa;
    expect(quitar).toHaveBeenCalledTimes(1);
  });
});

describe('useEstadoPagoConocido', () => {
  it('sin pedido es null; con pedido se vuelve a pintar con cada cambio del registro', async () => {
    servidorVm({ [rutaEstadoPagoPedido()]: () => respuesta(estadoPagoPedidoCrudo('pendiente')) });
    const sinPedido = await renderHook(() => useEstadoPagoConocido(null));
    expect(sinPedido.result.current).toBeNull();

    const { result } = await renderHook(() => useEstadoPagoConocido(ID_PEDIDO));
    expect(result.current).toBeNull();
    await act(async () => {
      await verificarPago(ID_PEDIDO);
    });
    expect(result.current).toMatchObject({ pedidoId: ID_PEDIDO, estado: 'pendiente', verificando: false });
  });
});

describe('mantenerVerificacion', () => {
  it('la verificación sigue mientras quede una pantalla que la siga y se detiene con la última', async () => {
    const pausa = diferida();
    servidorVm({ [rutaEstadoPagoPedido()]: () => pausa.promesa });
    const primera = mantenerVerificacion(ID_PEDIDO);
    const segunda = mantenerVerificacion(ID_PEDIDO);
    const promesa = verificarPago(ID_PEDIDO);
    primera();
    primera();
    expect(verificacionEnCurso(ID_PEDIDO)).toBe(true);
    segunda();
    expect(verificacionEnCurso(ID_PEDIDO)).toBe(false);
    expect(await promesa).toMatchObject({ detenida: true });
    // Un id no válido no registra nada.
    mantenerVerificacion('no-es-id')();
  });
});

describe('abrirPagoEnNavegador', () => {
  it('con un pago ya abierto en el navegador no abre otro (evita un doble cobro)', async () => {
    abrirSesionSimulada().mockReturnValueOnce(new Promise(() => undefined));
    let soltar: (() => void) | null = null;
    const primera = abrirPagoEnNavegador(INIT_POINT_PEDIDO, (funcion) => {
      soltar ??= funcion;
    });
    expect(await abrirPagoEnNavegador(INIT_POINT_PEDIDO, () => undefined)).toBe('ocupado');
    expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1);
    // Al soltar la espera (pantalla que se cierra) se puede volver a abrir.
    (soltar as (() => void) | null)?.();
    expect(await primera).toBe('regreso');
    expect(await abrirPagoEnNavegador(INIT_POINT_PEDIDO, () => undefined)).toBe('regreso');
    expect(abrirSesionSimulada()).toHaveBeenCalledTimes(2);
  });
});
