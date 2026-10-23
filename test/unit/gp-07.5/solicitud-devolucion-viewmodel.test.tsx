/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { Devolucion } from '@/features/tienda/models/devolucionesModel';
import type { Pedido } from '@/features/tienda/models/pedidoModel';
import { useSolicitudDevolucion } from '@/features/tienda/viewmodels/useSolicitudDevolucion';
import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { CLIENTA_CITAS, conPromesa, sinRedEnRuta, usarRelojFijo } from '../../helpers/citasFicticias';
import { CONFIGURACION_COMPLETA } from '../../helpers/configuracionFicticia';
import { RUTAS_DE_FONDO } from '../../helpers/datosClienta';
import { RUTA_SOLICITAR_DEVOLUCION, rutaRetirarDevolucion } from '../../helpers/pedidosFicticios';
import { respuesta, servidorConRutas } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { pedidoNormalizado, rutaDevolucionesPedido } from '../../helpers/tiendaFicticia';

/**
 * GP-07.5: useSolicitudDevolucion solo, con el servidor simulado (http://api.test): cambiar de tipo
 * elige la primera causa y el artículo único, nada cambia mientras envía, sin opciones no se abre, y
 * los errores de red sin la solicitud guardada (o sin poder revisarlo) se quedan en la hoja.
 */

usarRelojFijo();

const simular = servidorConRutas(RUTAS_DE_FONDO);
const VIGENTE = CONFIGURACION_COMPLETA;
const t = (clave: Parameters<typeof obtenerTexto>[0]) => obtenerTexto(clave, {}, VIGENTE);

const ENTREGADO: Pedido = { ...pedidoNormalizado(), id: 706, estado: 'entregado', pagadoEn: '2026-10-15T18:00:00.000Z' };

async function montar(pedido: Pedido | null, devoluciones: Devolucion[] = []) {
  const avisar = jest.fn();
  const agregarDevolucion = jest.fn();
  const marcarRetirada = jest.fn();
  const recargarDevoluciones = jest.fn();
  const hook = await renderHook(() =>
    useSolicitudDevolucion({ pedido, devoluciones, config: VIGENTE, avisar, agregarDevolucion, marcarRetirada, recargarDevoluciones }),
  );
  return { ...hook, avisar, agregarDevolucion, marcarRetirada, recargarDevoluciones };
}

beforeEach(async () => {
  await sembrarSesion(CLIENTA_CITAS);
});

describe('useSolicitudDevolucion', () => {
  it('cambiar de tipo elige su primera causa; con un solo artículo libre lo deja elegido', async () => {
    const unArticulo: Pedido = { ...ENTREGADO, items: [ENTREGADO.items[0]] };
    const { result } = await montar(unArticulo);
    await act(async () => result.current.abrir());
    expect(result.current.tipo).toBe('cambio');
    expect(result.current.articulo).toBe(ENTREGADO.items[0].id);

    await act(async () => result.current.elegirTipo('reembolso'));
    expect(result.current.causa).toBe('defecto_fabrica');
    expect(result.current.causas.map((causa) => causa.valor)).toEqual(['defecto_fabrica', 'producto_distinto']);
    expect(result.current.articulo).toBe(ENTREGADO.items[0].id);
    // Un artículo que piden todas sus causas: no se ofrece "Todo el pedido".
    expect(result.current.articulos.map((articulo) => articulo.valor)).toEqual([ENTREGADO.items[0].id]);
  });

  it('con dos artículos libres no elige ninguno, y un tipo sin causas deja todo vacío', async () => {
    const { result } = await montar(ENTREGADO);
    await act(async () => result.current.abrir());
    expect(result.current.articulo).toBeNull();
    await act(async () => result.current.elegirArticulo(ENTREGADO.items[1].id));
    await act(async () => result.current.elegirCausa('defecto_fabrica'));
    // El artículo elegido sigue libre: se conserva al cambiar de causa; el sellado se reinicia.
    expect(result.current.articulo).toBe(ENTREGADO.items[1].id);
    expect(result.current.pideSellado).toBe(false);

    const cancelado = { ...ENTREGADO, estado: 'cancelado', metodoPago: 'pago_en_salon' };
    const otro = await montar(cancelado);
    await act(async () => otro.result.current.elegirTipo('cambio'));
    expect(otro.result.current.causa).toBeNull();
    expect(otro.result.current.articulo).toBeNull();
  });

  it('sin pedido o sin opciones no se ofrece ni se abre, y enviar no hace nada', async () => {
    const sinPedido = await montar(null);
    expect(sinPedido.result.current.disponible).toBe(false);
    await act(async () => sinPedido.result.current.abrir());
    expect(sinPedido.result.current.hojaVisible).toBe(false);

    const llamadas = simular({});
    const pagado = await montar({ ...ENTREGADO, estado: 'pagado' });
    await act(async () => {
      pagado.result.current.abrir();
      pagado.result.current.enviar();
      pagado.result.current.confirmarRetiro();
    });
    expect(pagado.result.current.hojaVisible).toBe(false);
    expect(llamadas.filter((llamada) => llamada.metodo === 'POST')).toHaveLength(0);
  });

  it('mientras envía, nada de lo elegido cambia ni se cierra la hoja', async () => {
    let soltar: (valor: Response) => void = () => undefined;
    const pendiente = new Promise<Response>((resolve) => {
      soltar = resolve;
    });
    simular({ [RUTA_SOLICITAR_DEVOLUCION]: conPromesa(() => pendiente) });
    const { result, agregarDevolucion } = await montar(ENTREGADO);
    await act(async () => result.current.abrir());
    await act(async () => {
      result.current.elegirArticulo(ENTREGADO.items[0].id);
      result.current.cambiarSellado(true);
      result.current.cambiarMotivo('Otro tono');
    });
    await act(async () => result.current.enviar());
    expect(result.current.enviando).toBe(true);

    await act(async () => {
      result.current.elegirTipo('reembolso');
      result.current.elegirCausa('defecto_fabrica');
      result.current.elegirArticulo(null);
      result.current.cambiarSellado(false);
      result.current.cambiarMotivo('Cambié de opinión');
      result.current.cerrar();
    });
    expect(result.current).toMatchObject({
      hojaVisible: true,
      tipo: 'cambio',
      causa: 'sellado_sin_abrir',
      articulo: ENTREGADO.items[0].id,
      sellado: true,
      motivo: 'Otro tono',
    });

    await act(async () => {
      soltar(respuesta({ success: true, data: { id: 5101, estado: 'pendiente', tipo: 'cambio', causa: 'sellado_sin_abrir' } }, 201));
    });
    await waitFor(() => expect(result.current.hojaVisible).toBe(false));
    expect(agregarDevolucion).toHaveBeenCalledTimes(1);
  });

  it('sin red y sin poder revisar si se guardó, el aviso de sin conexión se queda en la hoja', async () => {
    simular({ [RUTA_SOLICITAR_DEVOLUCION]: sinRedEnRuta, [rutaDevolucionesPedido(706)]: sinRedEnRuta });
    const { result, avisar } = await montar(ENTREGADO);
    await act(async () => result.current.abrir());
    await act(async () => {
      result.current.elegirArticulo(ENTREGADO.items[0].id);
      result.current.cambiarSellado(true);
    });
    await act(async () => result.current.enviar());
    await waitFor(() => expect(result.current.error).toBe(MENSAJE_SIN_CONEXION));
    expect(result.current.hojaVisible).toBe(true);
    expect(avisar).not.toHaveBeenCalled();
  });

  it('retirar sin red ni forma de revisar: se queda en la hoja; un 500 también', async () => {
    simular({ [rutaRetirarDevolucion(5101)]: sinRedEnRuta, [rutaDevolucionesPedido(706)]: sinRedEnRuta });
    const { result, marcarRetirada } = await montar(ENTREGADO);
    await act(async () => result.current.abrir());
    await act(async () => result.current.cerrar());
    await act(async () => result.current.abrirRetiro(5101));
    await act(async () => result.current.confirmarRetiro());
    await waitFor(() => expect(result.current.errorRetiro).toBe(MENSAJE_SIN_CONEXION));
    expect(result.current.retiroPendiente).toBe(5101);

    simular({ [rutaRetirarDevolucion(5101)]: () => respuesta({ statusCode: 500, message: 'Error interno' }, 500), [rutaDevolucionesPedido(706)]: sinRedEnRuta });
    await act(async () => result.current.confirmarRetiro());
    await waitFor(() => expect(result.current.errorRetiro).toBe(t('tienda.devoluciones.retirar.generico')));
    await act(async () => result.current.cerrarRetiro());
    expect(result.current.retiroPendiente).toBeNull();
    expect(marcarRetirada).not.toHaveBeenCalled();
  });
});
