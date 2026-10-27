/// <reference types="jest" />

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react-native';

import type { TipoComprobante } from '@/shared/api/comprobantesDeCompra';
import { useComprobantesDeCompra } from '@/shared/api/useComprobantesDeCompra';
import { BotonesComprobante } from '@/shared/ui/BotonesComprobante';

import { compraCruda, conMios, respuestaMios, rutaMios } from '../../helpers/comprobantesFicticios';
import { limite429 } from '../../helpers/limitesRed';
import { diferida, errorServidor, reiniciarSimulaciones, routerSimulado, servidorVm, sinRed } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, Bloque A: "Ver comprobante" compartido por el detalle del pedido y el de la cita. El hook
 * (shared/api/useComprobantesDeCompra) pide GET /api/comprobantes/mios con la compra cargada, arma un
 * botón por comprobante (texto simple con uno, con su etiqueta con varios) y abre /comprobante con el
 * tipo y el id del elemento; cualquier falla deja la lista vacía. El componente (shared/ui/
 * BotonesComprobante) solo los pinta. expo-router simulado; fetch simulado con datos ficticios.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());

beforeEach(() => {
  reiniciarSimulaciones();
});

afterEach(async () => {
  await cleanup();
});

interface Props {
  tipo: TipoComprobante;
  id: number | null;
  refresco?: string;
}

async function montar(inicial: Props) {
  return renderHook((props: Props) => useComprobantesDeCompra(props.tipo, props.id, props.refresco), {
    initialProps: inicial,
  });
}

/** Deja correr las promesas pendientes del fetch simulado. */
async function vaciar(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useComprobantesDeCompra', () => {
  it('sin compra cargada no pide nada y no hay botones', async () => {
    const llamadas = servidorVm({});
    const { result } = await montar({ tipo: 'pedido', id: null });
    await vaciar();
    expect(result.current).toEqual([]);
    expect(llamadas).toHaveLength(0);
  });

  it('con un comprobante: "Ver comprobante" con su ayuda, y abre /comprobante una sola vez', async () => {
    const llamadas = servidorVm({ [rutaMios('pedido', 7)]: conMios(compraCruda('pedido', 7, 'Pedido #7')) });
    const { result } = await montar({ tipo: 'pedido', id: 7 });
    await vaciar();

    expect(llamadas.map((llamada) => llamada.ruta)).toEqual(['/api/comprobantes/mios?tipo=pedido&id=7']);
    expect(result.current.map(({ clave, titulo, ayuda }) => ({ clave, titulo, ayuda }))).toEqual([
      { clave: 'pedido-7', titulo: 'Ver comprobante', ayuda: 'Abre el comprobante de tu pago' },
    ]);
    await act(async () => {
      result.current[0].onPress();
      result.current[0].onPress();
    });
    expect(routerSimulado.push).toHaveBeenCalledTimes(1);
    expect(routerSimulado.push).toHaveBeenCalledWith('/comprobante?tipo=pedido&id=7');
  });

  it('con varios (anticipo y venta): uno por cada uno con su etiqueta; la venta abre con tipo=venta', async () => {
    servidorVm({
      [rutaMios('cita', 12)]: conMios(compraCruda('cita', 12, 'Anticipo de la cita #12'), compraCruda('venta', 45, 'Venta V-00045')),
    });
    const { result } = await montar({ tipo: 'cita', id: 12 });
    await vaciar();

    expect(result.current.map((boton) => boton.titulo)).toEqual([
      'Ver comprobante: Anticipo de la cita #12',
      'Ver comprobante: Venta V-00045',
    ]);
    await act(async () => {
      result.current[1].onPress();
    });
    expect(routerSimulado.push).toHaveBeenCalledWith('/comprobante?tipo=venta&id=45');
  });

  it.each([
    ['sin red', sinRed],
    ['404', () => errorServidor(404)],
    ['429', () => limite429(30)],
    ['500', () => errorServidor(500)],
  ])('con %s no hay botones', async (_caso, manejador) => {
    servidorVm({ [rutaMios('pedido', 7)]: manejador });
    const { result } = await montar({ tipo: 'pedido', id: 7 });
    await vaciar();
    expect(result.current).toEqual([]);
  });

  it('vuelve a pedir cuando cambia el refresco (por ejemplo, el pedido se pagó)', async () => {
    let lista: Record<string, unknown>[] = [];
    const llamadas = servidorVm({ [rutaMios('pedido', 7)]: () => respuestaMios(lista) });
    const { result, rerender } = await montar({ tipo: 'pedido', id: 7, refresco: 'pendiente_pago' });
    await vaciar();
    expect(result.current).toEqual([]);

    lista = [compraCruda('pedido', 7, 'Pedido #7')];
    await rerender({ tipo: 'pedido', id: 7, refresco: 'pagado' });
    await vaciar();
    expect(llamadas).toHaveLength(2);
    expect(result.current.map((boton) => boton.titulo)).toEqual(['Ver comprobante']);
  });

  it('una respuesta vieja de otra compra no se muestra ni pisa la nueva', async () => {
    const vieja = diferida();
    servidorVm({
      [rutaMios('pedido', 7)]: () => vieja.promesa,
      [rutaMios('pedido', 8)]: conMios(compraCruda('pedido', 8, 'Pedido #8')),
    });
    const { result, rerender } = await montar({ tipo: 'pedido', id: 7 });
    await rerender({ tipo: 'pedido', id: 8 });
    await vaciar();
    expect(result.current.map((boton) => boton.clave)).toEqual(['pedido-8']);

    await act(async () => {
      vieja.soltar(respuestaMios([compraCruda('pedido', 7, 'Pedido #7')]));
    });
    await vaciar();
    expect(result.current.map((boton) => boton.clave)).toEqual(['pedido-8']);
  });

  it('una falla vieja tampoco pisa la lista nueva', async () => {
    const vieja = diferida();
    servidorVm({
      [rutaMios('cita', 1)]: () => vieja.promesa,
      [rutaMios('cita', 2)]: conMios(compraCruda('cita', 2, 'Anticipo de la cita #2')),
    });
    const { result, rerender } = await montar({ tipo: 'cita', id: 1 });
    await rerender({ tipo: 'cita', id: 2 });
    await vaciar();
    await act(async () => {
      vieja.soltar(errorServidor(500));
    });
    await vaciar();
    expect(result.current.map((boton) => boton.clave)).toEqual(['cita-2']);
  });

  it('al quitar la compra (id null) deja de mostrar los botones', async () => {
    servidorVm({ [rutaMios('pedido', 7)]: conMios(compraCruda('pedido', 7, 'Pedido #7')) });
    const { result, rerender } = await montar({ tipo: 'pedido', id: 7 });
    await vaciar();
    expect(result.current).toHaveLength(1);
    await rerender({ tipo: 'pedido', id: null });
    expect(result.current).toEqual([]);
  });
});

describe('BotonesComprobante', () => {
  it('sin botones no pinta nada', async () => {
    await render(<BotonesComprobante botones={[]} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('pinta un botón secundario por cada uno, con su ayuda, y lo toca', async () => {
    const abrir = jest.fn();
    await render(
      <BotonesComprobante
        botones={[
          { clave: 'cita-12', titulo: 'Ver comprobante: Anticipo de la cita #12', ayuda: 'Abre el comprobante de tu pago', onPress: abrir },
          { clave: 'venta-45', titulo: 'Ver comprobante: Venta V-00045', ayuda: 'Abre el comprobante de tu pago', onPress: jest.fn() },
        ]}
      />,
    );
    const boton = screen.getByRole('button', { name: 'Ver comprobante: Anticipo de la cita #12' });
    expect(boton.props.accessibilityHint).toBe('Abre el comprobante de tu pago');
    expect(screen.getAllByRole('button')).toHaveLength(2);
    await fireEvent.press(boton);
    expect(abrir).toHaveBeenCalledTimes(1);
  });
});
