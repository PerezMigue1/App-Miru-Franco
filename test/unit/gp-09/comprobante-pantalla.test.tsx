/// <reference types="jest" />

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ComprobanteView from '@/features/comprobantes/views/ComprobanteView';
import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import { obtenerTexto as t } from '@/shared/api/textosSitio';
import { paleta, temaClaro, temaOscuro, type Colores } from '@/shared/ui/colores';
import { fuente } from '@/shared/ui/tokens';

import {
  comprobanteCompleto,
  comprobanteMinimo,
  CONCEPTO_LARGO,
  LEYENDAS_COMPROBANTE,
  respuestaMio,
  rutaMio,
} from '../../helpers/comprobantesFicticios';
import { limite429, MENSAJE_LIMITE } from '../../helpers/limitesRed';
import {
  diferida,
  enSecuencia,
  errorServidor,
  navegacionSimulada,
  reiniciarSimulaciones,
  routerSimulado,
  servidorVm,
  sinRed,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-09, Bloque A: la pantalla del comprobante (/comprobante?tipo=&id=) con su viewmodel real. El
 * ticket completo y el mínimo, los contrastes de sus colores en claro y en oscuro, la lista accesible
 * de conceptos y el TOTAL, y los estados: cargando, enlace inválido (sin pedir nada), 404, sin red
 * con Reintentar que recupera y 429 con Reintentar deshabilitado mientras corre la espera. expo-router
 * simulado; fetch simulado en http://api.test con datos ficticios.
 */

jest.mock('expo-router', () => {
  const simulado = require('../../helpers/viewmodelsAuth');
  simulado.routerSimulado.canGoBack = jest.fn(() => true);
  return simulado.expoRouterSimulado();
});
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

const esquema = jest.requireMock<{ default: jest.Mock<'light' | 'dark', []> }>(
  'react-native/Libraries/Utilities/useColorScheme',
).default;
const canGoBack = (routerSimulado as unknown as { canGoBack: jest.Mock }).canGoBack;

const MEDIDAS = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };

beforeEach(() => {
  reiniciarSimulaciones();
  canGoBack.mockReturnValue(true);
  esquema.mockReturnValue('light');
});

afterEach(async () => {
  await cleanup();
  jest.useRealTimers();
});

async function pintar(tipo: string | string[] | undefined, id: string | string[] | undefined): Promise<void> {
  navegacionSimulada.params = { tipo, id } as Record<string, string | undefined>;
  await render(
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <ComprobanteView />
    </SafeAreaProvider>,
  );
}

/** Contraste WCAG entre dos colores hex de 6 dígitos. */
function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

const estilo = (nodo: { props: { style?: unknown } }) => StyleSheet.flatten(nodo.props.style as never) as Record<string, unknown>;

/** Primer ancestro de `nodo` (o él mismo) que cumple la condición, o null. */
function ancestro(nodo: unknown, condicion: (props: Record<string, unknown>) => boolean): unknown {
  let actual = nodo as { parent: unknown; props: Record<string, unknown> } | null;
  while (actual) {
    if (actual.props && condicion(actual.props)) {
      return actual;
    }
    actual = actual.parent as typeof actual;
  }
  return null;
}

/**
 * La lista de conceptos: no es un elemento accesible (así TalkBack entra a cada fila) y se busca por
 * su etiqueta; tiene el rol de lista.
 */
function listaDeConceptos(nombre: string) {
  const lista = screen.getByLabelText(nombre);
  expect(lista.props.accessibilityRole).toBe('list');
  expect(lista.props.accessible).not.toBe(true);
  return lista;
}

/** Color de fondo del primer ancestro de `nodo` que lo pinta. */
function fondoDe(nodo: unknown): unknown {
  const conFondo = (props: Record<string, unknown>) => Boolean(props.style && estilo({ props }).backgroundColor);
  const pintado = ancestro(nodo, conFondo) as { props: { style?: unknown } } | null;
  return pintado ? estilo(pintado).backgroundColor : undefined;
}

describe('ComprobanteView: ticket', () => {
  it.each<[string, 'light' | 'dark', Colores]>([
    ['claro', 'light', temaClaro],
    ['oscuro', 'dark', temaOscuro],
  ])('(%s) ticket completo: datos, lista de conceptos, totales, leyendas y despedida', async (_tema, valor, colores) => {
    esquema.mockReturnValue(valor);
    const llamadas = servidorVm({ [rutaMio('venta', 45)]: () => respuestaMio(comprobanteCompleto()) });
    await pintar('venta', '45');

    expect(await screen.findByText('Salón Ficticio')).toBeOnTheScreen();
    expect(llamadas.map((llamada) => llamada.ruta)).toEqual(['/api/comprobantes/mio?tipo=venta&id=45']);
    // Título de la pantalla en la pila y título del ticket.
    expect(screen.getByRole('header', { name: 'Comprobante de compra' })).toBeOnTheScreen();
    expect(screen.getAllByText('Comprobante de compra')).toHaveLength(2);
    expect(screen.getByText('Calle Inventada 123, Ciudad Ficticia, C.P. 43000')).toBeOnTheScreen();
    expect(screen.getByText('Tel. +52 000 000 0000 · contacto@ejemplo.test')).toBeOnTheScreen();
    // El folio ya está en la compra ("Venta V-00045"): no se repite entre paréntesis.
    expect(screen.getByText('Folio: V-00045')).toBeOnTheScreen();
    expect(screen.queryByText(/\(Venta V-00045\)/)).not.toBeOnTheScreen();
    expect(screen.getByText('Fecha: 19 de octubre de 2026, 10:30 (hora del centro de México)')).toBeOnTheScreen();
    expect(screen.getByText('Atendió: Especialista Ficticia')).toBeOnTheScreen();
    expect(screen.getByText('Cliente: Clienta Ficticia')).toBeOnTheScreen();

    // La tabla se anuncia como lista; cada fila completa, con su descuento.
    expect(listaDeConceptos('Conceptos del comprobante: 2')).toBeOnTheScreen();
    expect(screen.getByLabelText(`${CONCEPTO_LARGO}: 1 por $1,200, importe $1,000, Descuento -$200`)).toBeOnTheScreen();
    expect(screen.getByLabelText('Shampoo ficticio: 2 por $149.50, importe $299')).toBeOnTheScreen();
    // El descuento de la línea va como segunda línea bajo el concepto.
    expect(screen.getByText('Descuento -$200')).toBeOnTheScreen();
    // El encabezado visual de la tabla no lo lee TalkBack.
    expect(screen.queryByText('Producto o servicio')).not.toBeOnTheScreen();
    const concepto = screen.getByText('Producto o servicio', { includeHiddenElements: true });
    expect(screen.getByText('Cant.', { includeHiddenElements: true })).toBeTruthy();

    expect(screen.getByText('Subtotal')).toBeOnTheScreen();
    expect(screen.getByText('$1,499')).toBeOnTheScreen();
    expect(screen.getByText('-$200')).toBeOnTheScreen();
    expect(screen.getByText('Anticipo ya pagado')).toBeOnTheScreen();
    expect(screen.getByText('-$300')).toBeOnTheScreen();
    const total = screen.getByLabelText('Total $999, IVA incluido');
    expect(total).toBeOnTheScreen();
    expect(screen.getByText('Método de pago: Tarjeta (terminal del salón)')).toBeOnTheScreen();
    expect(screen.getByText('Referencia: REF-FICTICIA-1')).toBeOnTheScreen();

    expect(screen.getByText(LEYENDAS_COMPROBANTE.iva)).toBeOnTheScreen();
    expect(screen.getByText(LEYENDAS_COMPROBANTE.cambios)).toBeOnTheScreen();
    const noEsFactura = screen.getByText(LEYENDAS_COMPROBANTE.noEsFactura);
    expect(estilo(noEsFactura).fontFamily).toBe(fuente.textoNegrita);
    expect(screen.getByText(`${LEYENDAS_COMPROBANTE.noEsFactura} ${LEYENDAS_COMPROBANTE.factura}`)).toBeOnTheScreen();
    const gracias = screen.getByText('Gracias por tu preferencia. Salón Ficticio');
    expect(estilo(gracias).color).toBe(colores.texto);
    expect(screen.getByText('También te lo enviamos por correo.')).toBeOnTheScreen();

    // Colores del ticket y contraste AA (4.5:1) de cada texto sobre su fondo.
    const salon = screen.getByText('Salón Ficticio');
    expect(fondoDe(salon)).toBe(colores.accion);
    expect(contraste(estilo(salon).color as string, colores.accion)).toBeGreaterThanOrEqual(4.5);
    expect(fondoDe(concepto)).toBe(colores.oroGrande);
    expect(estilo(concepto).color).toBe(colores.superficieElevada);
    expect(contraste(colores.superficieElevada, colores.oroGrande)).toBeGreaterThanOrEqual(5);
    const cifraTotal = screen.getByText('$999');
    expect(estilo(cifraTotal).color).toBe(colores.oroGrande);
    expect(fondoDe(cifraTotal)).toBe(colores.superficieElevada);
    expect(contraste(colores.oroGrande, colores.superficieElevada)).toBeGreaterThanOrEqual(5);
    expect(contraste(estilo(gracias).color as string, colores.superficieElevada)).toBeGreaterThanOrEqual(4.5);
    // Las cifras de la tabla y del total, tabulares y alineadas a la derecha.
    const importe = screen.getByText('$1,000', { includeHiddenElements: true });
    expect(estilo(importe)).toMatchObject({ fontVariant: ['tabular-nums'], textAlign: 'right' });
    expect(estilo(cifraTotal).fontVariant).toEqual(['tabular-nums']);
  });

  it('el oro de marca no sirve de fondo para texto pequeño blanco (por eso se usa el oro grande)', () => {
    expect(contraste(paleta.blanco, paleta.oro)).toBeLessThan(4.5);
    expect(temaClaro.oroGrande).not.toBe(temaClaro.oro);
  });

  it('ticket mínimo: la compra junto al folio y sin descuentos, anticipo, atendió, referencia ni correo', async () => {
    servidorVm({ [rutaMio('pedido', 7)]: () => respuestaMio(comprobanteMinimo()) });
    await pintar('pedido', '7');

    expect(await screen.findByText('Folio: P-000010 (Pedido #7)')).toBeOnTheScreen();
    expect(listaDeConceptos('Conceptos del comprobante: 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Acondicionador ficticio: 1 por $450, importe $450')).toBeOnTheScreen();
    expect(screen.getByLabelText('Total $450, IVA incluido')).toBeOnTheScreen();
    expect(screen.getByText('Todos los precios incluyen IVA.')).toBeOnTheScreen();
    for (const ausente of [/^Descuento/, /^Anticipo ya pagado/, /^Atendió/, /^Referencia/, /enviamos por correo/, /factura/]) {
      expect(screen.queryByText(ausente)).not.toBeOnTheScreen();
    }
    // Sin dirección ni contacto del salón, no hay líneas vacías.
    expect(screen.queryByText(/C\.P\./)).not.toBeOnTheScreen();
    expect(screen.queryByText(/^Tel\./)).not.toBeOnTheScreen();
  });

  it('solo la factura (sin "no es factura") se muestra sola', async () => {
    const leyendas = { factura: 'Si necesitas factura, pídela en el salón.' };
    servidorVm({ [rutaMio('pedido', 7)]: () => respuestaMio(comprobanteMinimo({ leyendas })) });
    await pintar('pedido', '7');

    expect(await screen.findByText('Si necesitas factura, pídela en el salón.')).toBeOnTheScreen();
    expect(screen.queryByText(LEYENDAS_COMPROBANTE.noEsFactura)).not.toBeOnTheScreen();
  });
});

describe('ComprobanteView: estados', () => {
  it('mientras carga muestra el skeleton anunciado y después el ticket', async () => {
    const espera = diferida();
    servidorVm({ [rutaMio('pedido', 7)]: () => espera.promesa });
    await pintar('pedido', '7');

    expect(screen.getByRole('progressbar', { name: 'Cargando tu comprobante' })).toBeOnTheScreen();
    await act(async () => {
      espera.soltar(respuestaMio(comprobanteMinimo()));
    });
    expect(await screen.findByText('Folio: P-000010 (Pedido #7)')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
  });

  it.each([
    ['tipo desconocido', 'factura', '7'],
    ['id cero', 'pedido', '0'],
    ['id con letras', 'cita', '12a'],
    ['sin parámetros', undefined, undefined],
    ['parámetros repetidos', ['pedido', 'cita'], ['7', '8']],
  ])('enlace inválido (%s): lo dice y no pide nada', async (_caso, tipo, id) => {
    const llamadas = servidorVm({});
    await pintar(tipo, id);

    expect(screen.getByText(t('comprobante.app.enlaceInvalido'))).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: t('comprobante.app.noEncontradoTitulo') })).toBeOnTheScreen();
    expect(llamadas).toHaveLength(0);
  });

  it('404: no lo encontramos en tu cuenta, sin Reintentar', async () => {
    servidorVm({ [rutaMio('venta', 5)]: () => errorServidor(404, 'Comprobante no encontrado') });
    await pintar('venta', '5');

    expect(await screen.findByText(t('comprobante.app.noEncontradoTexto'))).toBeOnTheScreen();
    expect(screen.queryByText('Comprobante no encontrado')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeOnTheScreen();
  });

  it('sin red: el mensaje común en una región en vivo y Reintentar recupera el ticket', async () => {
    const llamadas = servidorVm({
      [rutaMio('pedido', 7)]: enSecuencia(sinRed, () => respuestaMio(comprobanteMinimo())),
    });
    await pintar('pedido', '7');

    const mensaje = await screen.findByText(MENSAJE_SIN_CONEXION);
    expect(screen.getByRole('header', { name: t('comprobante.app.errorTitulo') })).toBeOnTheScreen();
    expect(ancestro(mensaje, (props) => props.accessibilityLiveRegion === 'polite')).not.toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Folio: P-000010 (Pedido #7)')).toBeOnTheScreen();
    expect(llamadas).toHaveLength(2);
  });

  it('un error del servidor y una respuesta que no es comprobante: mensaje para la clienta, nunca el técnico', async () => {
    servidorVm({
      [rutaMio('pedido', 7)]: enSecuencia(
        () => errorServidor(500, 'Prisma exploded'),
        () => respuestaMio({ folio: 'P-1' }),
      ),
    });
    await pintar('pedido', '7');

    expect(await screen.findByText(t('errores.servidor'))).toBeOnTheScreen();
    expect(screen.queryByText(/Prisma/)).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(t('errores.desconocido'))).toBeOnTheScreen();
  });

  it('429: el mensaje del backend y Reintentar deshabilitado con la cuenta regresiva; al terminar, recupera', async () => {
    jest.useFakeTimers();
    const llamadas = servidorVm({
      [rutaMio('pedido', 7)]: enSecuencia(() => limite429(2), () => respuestaMio(comprobanteMinimo())),
    });
    await pintar('pedido', '7');

    expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
    const enEspera = screen.getByRole('button', { name: 'Reintentar (2 s)' });
    expect(enEspera).toBeDisabled();
    await fireEvent.press(enEspera);
    expect(llamadas).toHaveLength(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole('button', { name: 'Reintentar (1 s)' })).toBeDisabled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    const listo = screen.getByRole('button', { name: 'Reintentar' });
    expect(listo).toBeEnabled();
    await fireEvent.press(listo);
    await waitFor(() => expect(screen.getByText('Folio: P-000010 (Pedido #7)')).toBeOnTheScreen());
    expect(llamadas).toHaveLength(2);
  });
});

describe('ComprobanteView: Volver', () => {
  it('con una pantalla debajo regresa a ella', async () => {
    servidorVm({});
    await pintar('factura', '1');
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(routerSimulado.back).toHaveBeenCalledTimes(1);
    expect(routerSimulado.replace).not.toHaveBeenCalled();
  });

  it.each([
    ['pedido', '/mis-pedidos'],
    ['cita', '/mis-citas'],
    ['venta', '/notificaciones'],
    ['factura', '/inicio'],
  ])('sin pantalla debajo, un comprobante de %s vuelve a %s', async (tipo, destino) => {
    canGoBack.mockReturnValue(false);
    servidorVm({});
    await pintar(tipo, '3');
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(routerSimulado.replace).toHaveBeenCalledWith(destino);
    expect(routerSimulado.back).not.toHaveBeenCalled();
  });
});
