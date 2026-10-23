/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { useCheckoutViewModel, type CheckoutViewModel } from '@/features/tienda/viewmodels/useCheckoutViewModel';
import { avisarCambioCarrito } from '@/features/tienda/viewmodels/usePiezasCarrito';
import { refrescar, reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerDocumentoVigente, reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import {
  CONSENTIMIENTO_COMPRA,
  configuracionTienda,
  escriturasCompra,
  RUTAS_COMPRA_LEGAL,
  rutaConfiguracionTienda,
} from '../../helpers/checkoutFicticio';
import { CLIENTA_CITAS, usarRelojFijo } from '../../helpers/citasFicticias';
import { CLABE_FICTICIA } from '../../helpers/configuracionFicticia';
import { espiarConsola } from '../../helpers/consola';
import { documentoCrudo, rutaDocumento } from '../../helpers/documentosFicticios';
import { RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';
import { respuesta } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import {
  CARRITO_CRUDO,
  carritoSimulado,
  cuerpoMisPedidos,
  cuerpoPedido,
  ID_PEDIDO,
  pedidoDesdeCuerpo,
  RUTA_CREAR_PEDIDO,
  RUTA_MIS_PEDIDOS,
  rutasCatalogoTienda,
} from '../../helpers/tiendaFicticia';
import {
  cerrarConTemporizadores,
  diferida,
  enSecuencia,
  espiarAtras,
  errorServidor,
  reiniciarSimulaciones,
  routerSimulado,
  servidorVm,
  sinRed,
  type LlamadaVm,
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
 * GP-07.5: useCheckoutViewModel con renderHook, expo-router simulado y el servidor ficticio
 * (http://api.test). Formas de pago activas y apagadas desde la configuración pública (también si
 * cambia con el checkout abierto), plazos y avisos con las reglas ficticias, datos de transferencia,
 * casillas obligatorias, el registro de los consentimientos ANTES del pedido y sus fallas (sin red,
 * 401 y 400) sin crear el pedido, y el doble toque. Reloj fijo en AHORA.
 */

type Rutas = Record<string, ManejadorVm>;
type Cambios = Parameters<typeof configuracionTienda>[0];

const avisar = jest.mocked(avisarCambioCarrito);
const CONFIRMACION = `/pedido-confirmado/${ID_PEDIDO}`;
const NO_GUARDO =
  'No pudimos guardar tu aceptación de los Términos de venta y la Política de reembolsos, así que tu pedido no se creó.';
/** Total del carrito de ejemplo: $382.50 + 2 x $380. */
const TOTAL = '$1,142.50';

const crearComoServidor: ManejadorVm = (cuerpo) => respuesta(cuerpoPedido(pedidoDesdeCuerpo(cuerpo)), 201);

let atras: ReturnType<typeof espiarAtras>;

beforeEach(async () => {
  reiniciarSimulaciones();
  reiniciarConfiguracionPublica();
  reiniciarDocumentosLegales();
  limpiarArchivos();
  avisar.mockClear();
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

/** Deja correr las promesas pendientes (para revisar que algo NO pasó). */
const vaciar = () =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });

/**
 * Checkout con el carrito de ejemplo y la configuración ficticia con esos cambios (sin cambios, el
 * respaldo de la app). Espera a que esté listo.
 */
async function abrir(cambios?: Cambios, rutas: Rutas = {}) {
  const carrito = carritoSimulado({ items: CARRITO_CRUDO });
  const llamadas = servidorVm({
    ...RUTAS_COMPRA_LEGAL,
    ...rutasCatalogoTienda(),
    ...(cambios ? rutaConfiguracionTienda(configuracionTienda(cambios)) : {}),
    [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos([])),
    [RUTA_CREAR_PEDIDO]: crearComoServidor,
    ...carrito.rutas,
    ...rutas,
  });
  if (cambios) {
    await act(async () => {
      await refrescar();
    });
  }
  const hook = await renderHook(() => useCheckoutViewModel());
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  return { ...hook, llamadas, carrito };
}

/** Del paso 1 al 3 (eligiendo la forma de pago si se indica). */
async function alPaso3(vm: { current: CheckoutViewModel }, metodo?: 'mercado_pago' | 'pago_en_salon') {
  await hacer(() => vm.current.continuar());
  if (metodo) {
    await hacer(() => vm.current.elegirMetodo(metodo));
  }
  await hacer(() => vm.current.continuar());
  expect(vm.current.paso).toBe(3);
}

async function marcarAmbas(vm: { current: CheckoutViewModel }) {
  await hacer(() => {
    vm.current.cambiarCasilla('terminosVenta', true);
    vm.current.cambiarCasilla('reembolsos', true);
  });
}

/** Cambia la configuración pública con el checkout abierto (como al volver a primer plano). */
async function cambiarConfiguracion(llamadas: LlamadaVm[], cambios: Cambios, rutas: Rutas) {
  servidorVm({ ...rutas, ...rutaConfiguracionTienda(configuracionTienda(cambios)) });
  await act(async () => {
    await refrescar();
  });
  return llamadas;
}

describe('Formas de pago activas', () => {
  it('con las dos, empieza en pagar al recoger y dice que en los dos casos se recoge', async () => {
    const { result } = await abrir();
    expect(result.current.opciones.map((o) => o.metodo)).toEqual(['mercado_pago', 'pago_en_salon']);
    expect(result.current).toMatchObject({
      metodo: 'pago_en_salon',
      notaOpciones: 'En los dos casos recoges tu pedido en el salón.',
      sinMetodos: null,
      botonFinal: 'Apartar mi pedido',
    });
  });

  it.each<[string, Cambios, string, string]>([
    ['solo en línea', { pagos: { mercadoPagoTienda: true, metodosSalon: [] } }, 'mercado_pago', 'Ir a pagar con Mercado Pago'],
    ['solo al recoger', { pagos: { mercadoPagoTienda: false, metodosSalon: ['efectivo'] } }, 'pago_en_salon', 'Apartar mi pedido'],
  ])('%s: una sola opción, elegida, y la nota de una forma', async (_caso, cambios, metodo, boton) => {
    const { result } = await abrir(cambios);
    expect(result.current.opciones.map((o) => o.metodo)).toEqual([metodo]);
    expect(result.current).toMatchObject({ metodo, botonFinal: boton, notaOpciones: 'Recoges tu pedido en el salón.' });
  });

  it('sin ninguna: no avanza del paso 2, no envía nada y ofrece llamar al salón', async () => {
    const abrirUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { result, llamadas } = await abrir({ pagos: { mercadoPagoTienda: false, metodosSalon: [] } });
    expect(result.current).toMatchObject({ metodo: null, opciones: [], aviso: '', plazos: [], botonFinal: '' });
    expect(result.current.sinMetodos?.texto).toContain('+52 700 000 0000');
    await hacer(() => result.current.continuar());
    expect(result.current).toMatchObject({ paso: 2, puedeContinuar: false });
    await hacer(() => result.current.continuar());
    expect(result.current.paso).toBe(2);
    await hacer(() => result.current.confirmar());
    await vaciar();
    expect(escriturasCompra(llamadas)).toEqual([]);
    await hacer(() => result.current.llamarSalon());
    expect(abrirUrl).toHaveBeenCalledWith('tel:+527000000000');
    abrirUrl.mockRestore();
  });

  it('si la elegida se apaga con el checkout abierto pasa a la otra y lo avisa; al volver, regresa', async () => {
    const rutas: Rutas = { ...RUTAS_COMPRA_LEGAL, ...carritoSimulado({ items: CARRITO_CRUDO }).rutas };
    const { result, llamadas } = await abrir({ pagos: { mercadoPagoTienda: true } });
    await hacer(() => result.current.elegirMetodo('mercado_pago'));
    expect(result.current).toMatchObject({ metodo: 'mercado_pago', avisoMetodoCambiado: null });

    await cambiarConfiguracion(llamadas, { pagos: { mercadoPagoTienda: false } }, rutas);
    expect(result.current.metodo).toBe('pago_en_salon');
    expect(result.current.avisoMetodoCambiado).toBe(
      'La forma de pago que elegiste ya no está disponible y la cambiamos. Revísala antes de confirmar.',
    );

    await cambiarConfiguracion(llamadas, { pagos: { mercadoPagoTienda: true } }, rutas);
    expect(result.current).toMatchObject({ metodo: 'mercado_pago', avisoMetodoCambiado: null });
  });
});

describe('Avisos, plazos y transferencia con las reglas de la configuración', () => {
  it('al recoger: total y métodos del salón en el aviso, y los plazos del apartado', async () => {
    const { result } = await abrir({ pagos: { mercadoPagoTienda: true } });
    expect(result.current.aviso).toBe(
      `Tu pedido queda apartado. Pagas ${TOTAL} en el mostrador cuando pases por él (efectivo o transferencia).`,
    );
    expect(result.current.plazos).toEqual([
      'Preparamos tu apartado en un máximo de 4 días; si no lo logramos, se cancela y te avisamos.',
      'Cuando esté listo, el día 3 te recordamos pasar por él.',
      'Si no lo recoges en 10 días desde que te avisamos que está listo, el apartado se cancela.',
    ]);
    expect(result.current.recogesEn).toBe('Salón Ficticio de Prueba, Calle Inventada 123, Centro, Ciudad Ficticia, Estado');
  });

  it('en línea: plazo de 12 horas y resguardo de 20 días', async () => {
    const { result } = await abrir({ pagos: { mercadoPagoTienda: true } });
    await hacer(() => result.current.elegirMetodo('mercado_pago'));
    expect(result.current.aviso).toContain(`para pagar ${TOTAL}.`);
    expect(result.current.aviso).toContain('Tienes 12 horas para completar el pago.');
    expect(result.current.plazos).toEqual([
      'Si el pago no se completa en 12 horas, el pedido se cancela.',
      'Ya pagado, te guardamos tu pedido en el salón 20 días para que pases por él.',
    ]);
  });

  it('la transferencia solo se ve al recoger con la transferencia activa y sus datos', async () => {
    const { result } = await abrir({ pagos: { mercadoPagoTienda: true } });
    expect(result.current.transferencia).toEqual({ banco: 'Banco Ficticio', titular: 'Titular Ficticia', clabe: CLABE_FICTICIA });
    await hacer(() => result.current.elegirMetodo('mercado_pago'));
    expect(result.current.transferencia).toBeNull();
  });

  it.each<[string, Cambios]>([
    ['apagada (sin transferencia entre los métodos del salón)', { pagos: { mercadoPagoTienda: true, metodosSalon: ['efectivo'] } }],
    ['sin datos (null)', { pagos: { mercadoPagoTienda: true, transferencia: null } }],
  ])('transferencia %s: no se ve', async (_caso, cambios) => {
    const { result } = await abrir(cambios);
    expect(result.current).toMatchObject({ metodo: 'pago_en_salon', transferencia: null });
  });
});

describe('Casillas', () => {
  it('empiezan sin marcar; confirmar sin las dos no envía nada y marca el error junto a cada una', async () => {
    const { result, llamadas } = await abrir();
    await alPaso3(result);
    expect(result.current.casillas.map((c) => [c.id, c.marcada, c.error])).toEqual([
      ['terminosVenta', false, null],
      ['reembolsos', false, null],
    ]);
    await hacer(() => result.current.confirmar());
    expect(result.current.casillas.map((c) => c.error)).toEqual([
      'Para confirmar tu pedido acepta los Términos de venta.',
      'Para confirmar tu pedido marca que leíste la Política de reembolsos, cambios y cancelaciones.',
    ]);
    expect(result.current.avisoCasillas).toBe('Para confirmar tu pedido marca las casillas de "Antes de confirmar".');

    await hacer(() => result.current.cambiarCasilla('terminosVenta', true));
    expect(result.current.casillas.map((c) => c.error)).toEqual([
      null,
      'Para confirmar tu pedido marca que leíste la Política de reembolsos, cambios y cancelaciones.',
    ]);
    await hacer(() => result.current.confirmar());
    await vaciar();
    expect(escriturasCompra(llamadas)).toEqual([]);
    expect(routerSimulado.replace).not.toHaveBeenCalled();
  });

  it('el enlace abre el visor legal encima del checkout', async () => {
    const { result } = await abrir();
    await hacer(() => result.current.abrirDocumento('terminos'));
    await hacer(() => result.current.abrirDocumento('reembolsos'));
    expect(routerSimulado.push.mock.calls).toEqual([['/legal/terminos'], ['/legal/reembolsos']]);
    expect(result.current.paso).toBe(1);
  });

  it('si la versión de un documento cambia con su casilla marcada, se desmarca y lo explica', async () => {
    const { result } = await abrir();
    await alPaso3(result);
    await marcarAmbas(result);
    servidorVm({ ...RUTAS_COMPRA_LEGAL, ...rutaDocumento('terminos', { success: true, data: documentoCrudo('terminos', { version: '2.4' }) }) });
    await act(async () => {
      await obtenerDocumentoVigente('terminos', { forzarRed: true });
    });
    expect(result.current.casillas.map((c) => [c.marcada, c.error])).toEqual([
      [false, 'Este documento se actualizó. Revísalo y vuelve a marcar la casilla.'],
      [true, null],
    ]);
  });
});

describe('Confirmar: primero el consentimiento y luego el pedido', () => {
  it.each<[string, 'mercado_pago' | 'pago_en_salon', string]>([
    ['al recoger', 'pago_en_salon', CONFIRMACION],
    ['en línea', 'mercado_pago', `${CONFIRMACION}?pagar=1`],
  ])('%s: registra las dos aceptaciones, después crea el pedido y abre la confirmación', async (_caso, metodo, destino) => {
    const { result, llamadas, carrito } = await abrir();
    await alPaso3(result, metodo);
    await marcarAmbas(result);
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(routerSimulado.replace).toHaveBeenCalledWith(destino));
    expect(escriturasCompra(llamadas).slice(0, 2)).toEqual([RUTA_CONSENTIMIENTOS, RUTA_CREAR_PEDIDO]);
    expect(llamadas.find((l) => `${l.metodo} ${l.ruta}` === RUTA_CONSENTIMIENTOS)?.cuerpo).toEqual(CONSENTIMIENTO_COMPRA);
    expect(carrito.items()).toEqual([]);
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it.each<[string, ManejadorVm, string, boolean]>([
    ['sin red', () => sinRed(), `${NO_GUARDO} Revisa tu conexión a internet e intenta de nuevo.`, true],
    ['la versión cambió (400)', () => errorServidor(400, 'Hash ficticio distinto'), `${NO_GUARDO} Los documentos se actualizaron hace un momento: revísalos, vuelve a marcar las casillas y confirma de nuevo.`, false],
  ])('si el consentimiento falla (%s) no crea el pedido ni reintenta solo', async (_caso, falla, mensaje, siguenMarcadas) => {
    const { result, llamadas } = await abrir(undefined, { [RUTA_CONSENTIMIENTOS]: falla });
    await alPaso3(result);
    await marcarAmbas(result);
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(result.current.errorEnvio).toBe(mensaje));
    await vaciar();
    expect(escriturasCompra(llamadas)).toEqual([RUTA_CONSENTIMIENTOS]);
    expect(result.current.enviando).toBe(false);
    expect(result.current.casillas.map((c) => c.marcada)).toEqual([siguenMarcadas, siguenMarcadas]);
    expect(routerSimulado.replace).not.toHaveBeenCalled();
  });

  it('si la sesión terminó (401) no crea el pedido y pide iniciar sesión', async () => {
    const { result, llamadas } = await abrir(undefined, {
      [RUTA_CONSENTIMIENTOS]: () => errorServidor(401, 'Unauthorized'),
      'POST /api/auth/movil/renovar': () => errorServidor(401, 'Unauthorized'),
    });
    await alPaso3(result);
    await marcarAmbas(result);
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(result.current.errorEnvio).toContain(NO_GUARDO));
    expect(result.current.errorEnvio).not.toMatch(/Unauthorized/);
    expect(escriturasCompra(llamadas)).not.toContain(RUTA_CREAR_PEDIDO);
  });

  it('sin versión vigente de un documento no registra ni crea nada', async () => {
    const { result, llamadas } = await abrir(undefined, {
      ...rutaDocumento('reembolsos', { statusCode: 404, message: 'Sin versión ficticia' }, 404),
    });
    await alPaso3(result);
    await marcarAmbas(result);
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(result.current.errorEnvio).toMatch(/^No pudimos confirmar la versión vigente/));
    expect(escriturasCompra(llamadas)).toEqual([]);
  });

  it('si el pedido falla después del consentimiento, otro intento vuelve a registrar y nunca crea sin él', async () => {
    const { result, llamadas } = await abrir(undefined, {
      [RUTA_CREAR_PEDIDO]: enSecuencia(() => errorServidor(500, 'Error interno ficticio'), () => crearComoServidor({ items: [] })),
    });
    await alPaso3(result);
    await marcarAmbas(result);
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(result.current.errorEnvio).toBe('No pudimos crear tu pedido. Intenta de nuevo en un momento.'));
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(routerSimulado.replace).toHaveBeenCalledWith(CONFIRMACION));
    expect(escriturasCompra(llamadas)).toEqual([
      RUTA_CONSENTIMIENTOS,
      RUTA_CREAR_PEDIDO,
      RUTA_CONSENTIMIENTOS,
      RUTA_CREAR_PEDIDO,
    ]);
  });

  it('un doble toque registra y crea una sola vez', async () => {
    const consentimiento = diferida();
    const { result, llamadas } = await abrir(undefined, {
      [RUTA_CONSENTIMIENTOS]: enSecuencia(() => consentimiento.promesa),
    });
    await alPaso3(result);
    await marcarAmbas(result);
    await hacer(() => {
      result.current.confirmar();
      result.current.confirmar();
    });
    expect(result.current.enviando).toBe(true);
    await hacer(() => result.current.cambiarCasilla('terminosVenta', false));
    expect(result.current.casillas[0].marcada).toBe(true);
    await act(async () => {
      consentimiento.soltar(respuesta({ success: true, data: [] }, 201));
    });
    await waitFor(() => expect(routerSimulado.replace).toHaveBeenCalledTimes(1));
    expect(escriturasCompra(llamadas)).toEqual([RUTA_CONSENTIMIENTOS, RUTA_CREAR_PEDIDO]);
  });

  it('cerrar la pantalla mientras guarda la aceptación: no crea el pedido ni escribe', async () => {
    const consentimiento = diferida();
    const { result, llamadas, unmount } = await abrir(undefined, {
      [RUTA_CONSENTIMIENTOS]: enSecuencia(() => consentimiento.promesa),
    });
    await alPaso3(result);
    await marcarAmbas(result);
    await hacer(() => result.current.confirmar());
    await unmount();
    await act(async () => {
      consentimiento.soltar(errorServidor(500, 'Error interno ficticio'));
    });
    await vaciar();
    expect(escriturasCompra(llamadas)).toEqual([RUTA_CONSENTIMIENTOS]);
    expect(result.current.errorEnvio).toBeNull();
  });
});

describe('Carga, pasos y salida', () => {
  const router = routerSimulado as typeof routerSimulado & { canGoBack: jest.Mock<boolean, []> };

  beforeEach(() => {
    router.canGoBack.mockReset().mockReturnValue(true);
  });

  it('atrás (también el de Android) regresa un paso; en el primero sale al carrito o lo abre si no hay nada debajo', async () => {
    const { result } = await abrir();
    await alPaso3(result);
    await hacer(() => {
      expect(atras.pulsar()).toBe(true);
    });
    expect(result.current.paso).toBe(2);
    await hacer(() => result.current.atras());
    await hacer(() => result.current.atras());
    expect(router.back).toHaveBeenCalledTimes(1);
    router.canGoBack.mockReturnValue(false);
    await hacer(() => result.current.atras());
    expect(router.dismissTo).toHaveBeenCalledWith('/carrito');
  });

  it('con el carrito vacío regresa al carrito sin mostrar el checkout', async () => {
    servidorVm({ ...RUTAS_COMPRA_LEGAL, ...carritoSimulado({ items: [] }).rutas });
    const { result } = await renderHook(() => useCheckoutViewModel());
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(result.current.estado).toBe('cargando');
  });

  it('sin red al cargar muestra el error y recargar trae el carrito', async () => {
    const carrito = carritoSimulado({ items: CARRITO_CRUDO });
    servidorVm({ ...RUTAS_COMPRA_LEGAL, ...carrito.rutas, 'GET /api/carrito': enSecuencia(() => sinRed(), carrito.rutas['GET /api/carrito'] as () => Response) });
    const { result } = await renderHook(() => useCheckoutViewModel());
    await waitFor(() => expect(result.current.estado).toBe('error'));
    await hacer(() => result.current.recargar());
    await waitFor(() => expect(result.current.estado).toBe('listo'));
  });

  it('sin red al crear el pedido pero ya creado: lo encuentra en Mis pedidos y no crea otro', async () => {
    const creados: ReturnType<typeof pedidoDesdeCuerpo>[] = [];
    const { result, llamadas } = await abrir(undefined, {
      [RUTA_CREAR_PEDIDO]: (cuerpo) => {
        creados.push(pedidoDesdeCuerpo(cuerpo));
        return sinRed();
      },
      [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos(creados)),
    });
    await alPaso3(result);
    await marcarAmbas(result);
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(routerSimulado.replace).toHaveBeenCalledWith(CONFIRMACION));
    expect(escriturasCompra(llamadas)).toEqual([RUTA_CONSENTIMIENTOS, RUTA_CREAR_PEDIDO]);
  });

  it('cerrar la pantalla mientras crea el pedido con error: no escribe el error', async () => {
    const pedido = diferida();
    const { result, unmount } = await abrir(undefined, { [RUTA_CREAR_PEDIDO]: enSecuencia(() => pedido.promesa) });
    await alPaso3(result);
    await marcarAmbas(result);
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(result.current.enviando).toBe(true));
    await unmount();
    await act(async () => {
      pedido.soltar(errorServidor(400, 'Error ficticio'));
    });
    await vaciar();
    expect(result.current.errorEnvio).toBeNull();
    expect(routerSimulado.replace).not.toHaveBeenCalled();
  });
});
