/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { MENSAJE_SIN_CONEXION } from '@/features/auth/models/AuthModel';
import { MENSAJE_SESION_TERMINADA } from '@/features/tienda/models/carritoModel';
import { REDIRECCION_PEDIDO, type MetodoPago } from '@/features/tienda/models/pedidoModel';
import { MENSAJE_SIN_NAVEGADOR } from '@/features/tienda/viewmodels/pagoPedido';
import { limitePagoPedido } from '@/features/tienda/viewmodels/presentacionTienda';
import { useCarritoViewModel, type CarritoViewModel } from '@/features/tienda/viewmodels/useCarritoViewModel';
import { useCatalogoViewModel, type CatalogoViewModel } from '@/features/tienda/viewmodels/useCatalogoViewModel';
import { PASOS_CHECKOUT, useCheckoutViewModel } from '@/features/tienda/viewmodels/useCheckoutViewModel';
import {
  useDetallePedidoViewModel,
  type AvisoPedido,
  type DetallePedidoViewModel,
} from '@/features/tienda/viewmodels/useDetallePedidoViewModel';
import {
  useDetalleProductoViewModel,
  type ConfirmacionCarrito,
  type DetalleProductoViewModel,
} from '@/features/tienda/viewmodels/useDetalleProductoViewModel';
import { useMisPedidosViewModel } from '@/features/tienda/viewmodels/useMisPedidosViewModel';
import {
  usePedidoConfirmadoViewModel,
  type PedidoConfirmadoViewModel,
  type VistaPedido,
} from '@/features/tienda/viewmodels/usePedidoConfirmadoViewModel';
import { avisarCambioCarrito, publicarPiezasCarrito } from '@/features/tienda/viewmodels/usePiezasCarrito';

import {
  CLIENTA_CITAS,
  cuerpoError,
  ERRORES,
  llamadasDeRuta,
  respuestaError,
  usarRelojFijo,
  type CuerpoError,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { abrirSesionSimulada } from '../../helpers/google';
import { respuesta, type Llamada } from '../../helpers/servidorSimulado';
import {
  ACONDICIONADOR,
  CARRITO_CRUDO,
  carritoSimulado,
  catalogoLargo,
  CREMA_FACIAL,
  cuerpoCancelarPedido,
  cuerpoDatoTienda,
  cuerpoListaTienda,
  cuerpoMisPedidos,
  cuerpoPedido,
  deepLinkPedido,
  ERRORES_PAGO_PEDIDO,
  ERRORES_PEDIDOS,
  ERRORES_TIENDA,
  ESMALTE,
  estadoPagoPedidoCrudo,
  GEL_PIEL_GRASA,
  ID_PEDIDO,
  idItemCarrito,
  imagenProducto,
  INIT_POINT_PEDIDO,
  itemCarritoCrudo,
  LINEAS_PEDIDO,
  MASCARILLA_AGOTADA,
  MIS_PEDIDOS_CRUDOS,
  pedidoApartado,
  pedidoCrudo,
  pedidoDesdeCuerpo,
  pedidoNormalizado,
  pedidoPagado,
  preferenciaPedidoCruda,
  PRODUCTO_INACTIVO,
  PRODUCTO_NO_DISPONIBLE,
  PRODUCTO_SIN_PRESENTACIONES,
  PRODUCTO_UNA_PIEZA,
  productosActivos,
  reembolsoCrudo,
  RUTA_AGREGAR_CARRITO,
  RUTA_CARRITO,
  RUTA_CATALOGO_TIENDA,
  RUTA_CREAR_PEDIDO,
  RUTA_MIS_PEDIDOS,
  RUTA_PREFERENCIA_PEDIDO,
  rutaCambiarCantidad,
  rutaCancelarPedido,
  rutaEstadoPagoPedido,
  rutaPedido,
  rutaProducto,
  rutaQuitarDelCarrito,
  rutasPedidos,
  rutasCatalogoTienda,
  SERUM_SIN_PRECIO,
  SHAMPOO,
  type ItemCarritoCrudo,
  type PedidoCrudo,
  type ProductoCrudo,
} from '../../helpers/tiendaFicticia';
import {
  authSimulada,
  cerrarConTemporizadores,
  diferida,
  enSecuencia,
  espiarAtras,
  reiniciarSimulaciones,
  routerSimulado,
  servidorVm,
  sinRed,
  type ManejadorVm,
  type Salida,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-06.4 (tienda), viewmodels con renderHook: catálogo, detalle de producto, carrito, checkout,
 * Mis pedidos, detalle del pedido y confirmación del pedido con el pago en línea (pagoPedido). Solo
 * se simulan fetch (http://api.test, con los datos de tiendaFicticia), expo-router, useAuth,
 * useRequiereSesion, el contador del carrito (usePiezasCarrito guarda estado de módulo: aquí es un
 * mock que se limpia en cada prueba; su lógica la prueba carrito.test.ts), expo-web-browser,
 * AppState y BackHandler. Los models y apiClient son los reales. Reloj fijo en AHORA (lunes 19 de
 * octubre de 2026, 10:00 en México).
 */

jest.mock('expo-router', () => {
  const react = require('react');
  const simulado = require('../../helpers/viewmodelsAuth');
  simulado.routerSimulado.canGoBack = jest.fn(() => true);
  return {
    useRouter: () => simulado.routerSimulado,
    // Como el real: corre al enfocar y limpia al salir de la pantalla; reenfocar() repite las dos cosas.
    useFocusEffect: (efecto: () => unknown) => {
      react.useEffect(() => {
        mockEnfoques.set(efecto, efecto());
        return () => mockDesenfocar(efecto);
      }, [efecto]);
    },
  };
});
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('@/features/auth/viewmodels/useRequiereSesion', () => ({ useRequiereSesion: () => mockRequiereSesion }));
jest.mock('@/features/tienda/viewmodels/usePiezasCarrito', () => ({
  avisarCambioCarrito: jest.fn(),
  publicarPiezasCarrito: jest.fn(),
}));
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/** Efectos de enfoque de las pantallas montadas, cada uno con su limpieza. */
const mockEnfoques = new Map<() => unknown, unknown>();

function mockDesenfocar(efecto: () => unknown): void {
  const limpiar = mockEnfoques.get(efecto);
  mockEnfoques.delete(efecto);
  if (typeof limpiar === 'function') {
    limpiar();
  }
}

/** Acciones que esperan a que la clienta inicie sesión (la app abriría la hoja de acceso). */
const mockEsperanSesion: (() => void)[] = [];

/** useRequiereSesion simulado: con sesión hace la acción; sin sesión la deja esperando. */
function mockRequiereSesion(accion?: () => void): void {
  if (authSimulada.estado === 'autenticado') {
    accion?.();
  } else if (accion) {
    mockEsperanSesion.push(accion);
  }
}

const router = routerSimulado as typeof routerSimulado & { canGoBack: jest.Mock<boolean, []> };
const avisar = jest.mocked(avisarCambioCarrito);
const publicar = jest.mocked(publicarPiezasCarrito);
const navegador = (): jest.Mock => abrirSesionSimulada();

// ── Andamiaje ────────────────────────────────────────────────────────────────────────────────

type Rutas = Record<string, ManejadorVm>;
type Turno = () => Salida;
type Ref<T> = { current: T };

/** Servidor de la tienda (catálogo, pedidos y pago en línea de tiendaFicticia); las rutas de la prueba van encima. */
function servidor(rutas: Rutas = {}): Llamada[] {
  return servidorVm({ ...rutasCatalogoTienda(), ...rutasPedidos(), ...rutas });
}

const veces = (llamadas: Llamada[], ruta: string) => llamadasDeRuta(llamadas, ruta).length;
const cuerposEn = (llamadas: Llamada[], ruta: string) => llamadasDeRuta(llamadas, ruta).map((l) => l.cuerpo);
const idsDe = (lista: readonly { id: number }[]) => lista.map((elemento) => elemento.id);

/** Cada llamada a la ruta toma el siguiente turno (el último se repite). */
const turnos = (...salidas: Turno[]): ManejadorVm => enSecuencia(...salidas);
const falla = (cuerpo: CuerpoError): Turno => () => respuestaError(cuerpo);
const productosComo = (lista: ProductoCrudo[]): Turno => () => respuesta(cuerpoListaTienda(lista));
const carritoCon = (items: ItemCarritoCrudo[]): Turno => () => respuesta(cuerpoListaTienda(items));
const pedidosComo = (lista: PedidoCrudo[]): Turno => () => respuesta(cuerpoMisPedidos(lista));
const pedidoComo = (pedido: PedidoCrudo): Turno => () => respuesta(cuerpoPedido(pedido));
const pagoComo = (estado: string, pedidoEstado?: string): Turno => () =>
  respuesta(estadoPagoPedidoCrudo(estado, pedidoEstado));

/** Un turno que no responde hasta que la prueba lo suelta. */
function enPausa(): { turno: Turno; soltar: (r: Response) => Promise<void> } {
  const pendiente = diferida();
  return { turno: () => pendiente.promesa, soltar: (r) => act(async () => pendiente.soltar(r)) };
}

/** Corre una acción del viewmodel dentro de act. */
const hacer = (accion: () => void) =>
  act(async () => {
    accion();
  });

/** Avanza el reloj falso `ms` en cada uno de `pasos` (cada paso deja correr las promesas). */
async function avanzar(ms: number, pasos = 1): Promise<void> {
  for (let i = 0; i < pasos; i++) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  }
}

/** Deja que terminen las promesas pendientes (para revisar que algo NO cambió). */
const vaciar = () => avanzar(10, 2);

/** Las pantallas montadas pierden el foco y lo recuperan (al regresar de otra). */
const reenfocar = () =>
  hacer(() =>
    [...mockEnfoques.keys()].forEach((efecto) => {
      mockDesenfocar(efecto);
      mockEnfoques.set(efecto, efecto());
    }),
  );

const esperarEstado = (r: Ref<{ estado: string }>, estado: string) =>
  waitFor(() => expect(r.current.estado).toBe(estado));

// AppState (respaldo del regreso del navegador y consultas del pago) y el Atrás de Android.
let oyentesApp: ((estado: AppStateStatus) => void)[] = [];
let espiaApp: jest.SpyInstance;
let atras: ReturnType<typeof espiarAtras>;
const ESTADO_APP_ORIGINAL: unknown = AppState.currentState;

function fijarEstadoApp(estado: unknown): void {
  (AppState as { currentState: unknown }).currentState = estado;
}

const emitirApp = (estado: AppStateStatus) => hacer(() => [...oyentesApp].forEach((oyente) => oyente(estado)));

beforeEach(() => {
  reiniciarSimulaciones();
  router.canGoBack.mockReset();
  router.canGoBack.mockReturnValue(true);
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA_CITAS;
  mockEsperanSesion.length = 0;
  avisar.mockClear();
  publicar.mockClear();
  navegador().mockReset();
  navegador().mockResolvedValue({ type: 'cancel' });
  oyentesApp = [];
  espiaApp = jest.spyOn(AppState, 'addEventListener').mockImplementation((_evento, oyente) => {
    const registrado = oyente as (estado: AppStateStatus) => void;
    oyentesApp.push(registrado);
    return {
      remove: () => {
        oyentesApp = oyentesApp.filter((otro) => otro !== registrado);
      },
    };
  });
  fijarEstadoApp('active');
  atras = espiarAtras();
});

afterEach(() => {
  espiaApp.mockRestore();
  fijarEstadoApp(ESTADO_APP_ORIGINAL);
  atras.restaurar();
});

// Sin avisos de act() ni errores en consola; al final se desmonta con los temporizadores falsos y
// después usarRelojFijo vuelve a los reales.
espiarConsola(cerrarConTemporizadores, true);
usarRelojFijo();

const PIEZAS_INSUFICIENTES = 'Ya no hay suficientes piezas de este producto.';
const GENERICO_CARRITO = 'No pudimos actualizar tu carrito. Intenta de nuevo en un momento.';

// ── useCatalogoViewModel ─────────────────────────────────────────────────────────────────────

async function abrirCatalogo(rutas: Rutas = {}) {
  const llamadas = servidor(rutas);
  const hook = await renderHook(() => useCatalogoViewModel());
  return { ...hook, llamadas };
}

async function catalogoListo(rutas: Rutas = {}) {
  const abierto = await abrirCatalogo(rutas);
  await esperarEstado(abierto.result, 'listo');
  return abierto;
}

/** Orden del catálogo de ejemplo: primero lo que se puede comprar, después el agotado y el sin precio. */
const ORDEN_CATALOGO = [301, 302, 305, 306, 303, 304];
const visibles = (vm: CatalogoViewModel) => idsDe(vm.productosVisibles);

describe('useCatalogoViewModel: carga', () => {
  it('pide el catálogo público y queda listo con lo comprable primero, categorías y rango', async () => {
    const lista = enPausa();
    const { result, llamadas } = await abrirCatalogo({ [RUTA_CATALOGO_TIENDA]: turnos(lista.turno) });
    expect(result.current).toMatchObject({ estado: 'cargando', hayProductos: false, productosVisibles: [] });
    await lista.soltar(respuesta(cuerpoListaTienda(productosActivos())));
    await esperarEstado(result, 'listo');
    expect(idsDe(result.current.productosPagina)).toEqual(ORDEN_CATALOGO);
    expect(result.current).toMatchObject({
      categorias: ['Cabello', 'Facial', 'Tratamientos', 'Uñas'],
      hayProductos: true,
      errorRed: false,
      pagina: 1,
      totalPaginas: 1,
      textoRango: 'Mostrando 1 a 6 de 6 productos',
    });
    expect(llamadas.map((l) => [`${l.metodo} ${l.ruta}`, l.cabeceras.Authorization])).toEqual([
      [RUTA_CATALOGO_TIENDA, undefined],
    ]);
  });

  it('catálogo vacío: listo, sin productos, rango en cero y grupos sin opciones con su texto', async () => {
    const { result } = await catalogoListo({ [RUTA_CATALOGO_TIENDA]: turnos(productosComo([])) });
    expect(result.current).toMatchObject({
      hayProductos: false,
      productosVisibles: [],
      categorias: [],
      textoRango: 'Mostrando 0 a 0 de 0 productos',
    });
    expect(result.current.gruposFiltro.map((g) => (g.opciones.length > 0 ? g.titulo : g.vacio))).toEqual([
      'Descuentos',
      'Sin marcas en catálogo',
      'Sin características en catálogo',
    ]);
  });

  it.each<[string, Turno, boolean]>([
    ['sin red', sinRed, true],
    ['un 500', falla(ERRORES.interno), false],
  ])('%s: error (errorRed %s) y recargar lo trae', async (_caso, error, red) => {
    const { result } = await abrirCatalogo({ [RUTA_CATALOGO_TIENDA]: turnos(error, productosComo(productosActivos())) });
    await esperarEstado(result, 'error');
    expect(result.current.errorRed).toBe(red);
    await hacer(() => result.current.recargar());
    await esperarEstado(result, 'listo');
    expect(visibles(result.current)).toEqual(ORDEN_CATALOGO);
  });

  it('refrescar conserva la lista; si falla avisa con errorRefresco y el siguiente refresco lo quita', async () => {
    const refresco = enPausa();
    const { result } = await catalogoListo({
      [RUTA_CATALOGO_TIENDA]: turnos(productosComo(productosActivos()), refresco.turno, productosComo([SHAMPOO])),
    });
    await hacer(() => result.current.refrescar());
    expect(result.current).toMatchObject({ estado: 'listo', refrescando: true });
    await refresco.soltar(respuestaError(ERRORES.interno));
    await waitFor(() => expect(result.current.refrescando).toBe(false));
    expect(result.current).toMatchObject({ estado: 'listo', errorRefresco: true });
    expect(visibles(result.current)).toEqual(ORDEN_CATALOGO);
    await hacer(() => result.current.refrescar());
    await waitFor(() => expect(result.current.errorRefresco).toBe(false));
    expect(visibles(result.current)).toEqual([301]);
  });
});

describe('useCatalogoViewModel: búsqueda, categoría y filtros', () => {
  it('busca sin acentos ni mayúsculas, filtra por categoría y "Ver todos" lo quita todo', async () => {
    const { result } = await catalogoListo();
    await hacer(() => result.current.setBusqueda('BOTANICA'));
    expect(visibles(result.current)).toEqual([301, 302]);
    await hacer(() => result.current.setCategoria('Tratamientos'));
    expect(result.current.productosVisibles).toEqual([]);
    expect(result.current.textoRango).toBe('Mostrando 0 a 0 de 0 productos');
    await hacer(() => result.current.setBusqueda(''));
    expect(visibles(result.current)).toEqual([303, 304]);
    await hacer(() => result.current.limpiarFiltros());
    expect(result.current).toMatchObject({ busqueda: '', categoria: null, filtrosActivos: 0 });
    expect(visibles(result.current)).toEqual(ORDEN_CATALOGO);
  });

  const COMUNES = ['descuento', 'marca', 'otrasCaracteristicas'];
  it.each<[string, string | null, string[]]>([
    ['todas', null, COMUNES],
    ['Facial (grupos de piel)', 'Facial', ['descuento', 'marca', 'tipoPiel', 'textura', 'spf', 'otrasCaracteristicas']],
    [
      'Maquillaje (grupos de maquillaje)',
      'Maquillaje',
      ['descuento', 'marca', 'color', 'acabado', 'formatoLabial', 'unidadesPack', 'otrasCaracteristicas'],
    ],
  ])('grupos de la hoja con la categoría %s', async (_caso, categoria, claves) => {
    const { result } = await catalogoListo();
    await hacer(() => result.current.setCategoria(categoria));
    expect(result.current.gruposFiltro.map((g) => g.clave)).toEqual(claves);
    const opciones = (clave: string) => result.current.gruposFiltro.find((g) => g.clave === clave)?.opciones;
    expect(opciones('marca')).toEqual(['Botánica Ficticia', 'Uñas Ficticias', 'Piel Ficticia', 'Óleo Ficticio']);
    expect(opciones('otrasCaracteristicas')).toEqual(['Sin sulfatos', 'Uso diario']);
  });

  it('la hoja edita un borrador: cerrar sin aplicar lo descarta; aplicar filtra, cuenta y cierra', async () => {
    const { result } = await catalogoListo();
    await hacer(() => result.current.abrirFiltros());
    await hacer(() => result.current.alternarOpcion('marca', 'Botánica Ficticia'));
    expect(result.current).toMatchObject({ hojaFiltros: true, borradorActivos: 1, filtrosActivos: 0 });
    expect(visibles(result.current)).toEqual(ORDEN_CATALOGO);
    await hacer(() => result.current.cerrarFiltros());
    await hacer(() => result.current.abrirFiltros());
    expect(result.current.borradorActivos).toBe(0);

    await hacer(() => {
      result.current.alternarOpcion('marca', 'Botánica Ficticia');
      result.current.alternarOpcion('descuento', '20% o más');
      result.current.alternarOpcion('descuento', 'Con descuento');
      // Tocar otra vez la misma opción la quita.
      result.current.alternarOpcion('descuento', 'Con descuento');
    });
    await hacer(() => result.current.aplicarFiltros());
    expect(result.current).toMatchObject({ hojaFiltros: false, filtrosActivos: 2 });
    expect(visibles(result.current)).toEqual([302]);
  });

  it.each<[string, (vm: CatalogoViewModel) => void, number[]]>([
    [
      'de $400 a $1,000 (sin precio no pasa el mínimo)',
      (vm) => {
        vm.setPrecioMinimo('400');
        vm.setPrecioMaximo('1000');
      },
      [303],
    ],
    ['hasta $300 (sin precio sí pasa el máximo)', (vm) => vm.setPrecioMaximo('300'), [306, 304]],
    ['otra característica', (vm) => vm.alternarOpcion('otrasCaracteristicas', 'Sin sulfatos'), [301]],
    ['una marca', (vm) => vm.alternarOpcion('marca', 'Óleo Ficticio'), [303, 304]],
  ])('aplicar el filtro %s cuenta uno', async (_caso, elegir, ids) => {
    const { result } = await catalogoListo();
    await hacer(() => result.current.abrirFiltros());
    await hacer(() => elegir(result.current));
    await hacer(() => result.current.aplicarFiltros());
    expect(visibles(result.current)).toEqual(ids);
    expect(result.current.filtrosActivos).toBe(1);
  });

  it('los grupos de piel buscan en el texto del producto, dejan de contar fuera de su categoría y limpiar los quita', async () => {
    const { result } = await catalogoListo({ [RUTA_CATALOGO_TIENDA]: turnos(productosComo([CREMA_FACIAL, GEL_PIEL_GRASA])) });
    await hacer(() => result.current.setCategoria('Facial'));
    await hacer(() => result.current.abrirFiltros());
    await hacer(() => result.current.alternarOpcion('tipoPiel', 'Grasa'));
    await hacer(() => result.current.aplicarFiltros());
    expect(visibles(result.current)).toEqual([309]);
    expect(result.current.filtrosActivos).toBe(1);

    await hacer(() => result.current.setCategoria(null));
    expect(result.current.filtrosActivos).toBe(0);
    expect(visibles(result.current)).toEqual([306, 309]);

    await hacer(() => result.current.setCategoria('Facial'));
    expect(result.current.filtrosActivos).toBe(1);
    await hacer(() => result.current.abrirFiltros());
    await hacer(() => result.current.limpiarBorrador());
    expect(result.current).toMatchObject({ hojaFiltros: false, filtrosActivos: 0, borradorActivos: 0 });
    expect(visibles(result.current)).toEqual([306, 309]);
  });
});

describe('useCatalogoViewModel: páginas y navegación', () => {
  it('pagina de 16 en 16 con su rango; buscar vuelve a la 1 y un refresco más corto la ajusta', async () => {
    const largo = catalogoLargo(20);
    const { result } = await catalogoListo({
      [RUTA_CATALOGO_TIENDA]: turnos(productosComo(largo), productosComo(largo.slice(0, 5))),
    });
    expect(result.current).toMatchObject({ pagina: 1, totalPaginas: 2, textoRango: 'Mostrando 1 a 16 de 20 productos' });
    expect(result.current.productosPagina).toHaveLength(16);
    await hacer(() => result.current.paginaAnterior());
    expect(result.current.pagina).toBe(1);
    await hacer(() => result.current.paginaSiguiente());
    await hacer(() => result.current.paginaSiguiente());
    expect(result.current).toMatchObject({ pagina: 2, textoRango: 'Mostrando 17 a 20 de 20 productos' });
    expect(idsDe(result.current.productosPagina)).toEqual([417, 418, 419, 420]);

    await hacer(() => result.current.setBusqueda('producto'));
    expect(result.current.pagina).toBe(1);
    await hacer(() => result.current.paginaSiguiente());
    expect(result.current.pagina).toBe(2);
    await hacer(() => result.current.refrescar());
    await waitFor(() => expect(result.current.totalPaginas).toBe(1));
    expect(result.current).toMatchObject({ pagina: 1, textoRango: 'Mostrando 1 a 5 de 5 productos' });
  });

  it('abrirProducto abre el detalle', async () => {
    const { result } = await catalogoListo();
    await hacer(() => result.current.abrirProducto(301));
    expect(router.push).toHaveBeenCalledWith('/producto/301');
  });
});

// ── useDetalleProductoViewModel ──────────────────────────────────────────────────────────────

/** Con id null abre la ruta sin id. */
async function abrirDetalleProducto(id: string | null = String(SHAMPOO.id), rutas: Rutas = {}) {
  const llamadas = servidor(rutas);
  const hook = await renderHook(() => useDetalleProductoViewModel(id ?? undefined));
  await waitFor(() => expect(hook.result.current.estado).not.toBe('cargando'));
  return { ...hook, llamadas };
}

const conProducto = (producto: ProductoCrudo): Rutas => ({
  [rutaProducto(producto.id)]: () => respuesta(cuerpoDatoTienda(producto)),
});

describe('useDetalleProductoViewModel: carga', () => {
  it('carga el producto con su primera presentación comprable, cantidad 1, existencias y fotos', async () => {
    const { result, llamadas } = await abrirDetalleProducto(' 301 ');
    expect(result.current).toMatchObject({
      estado: 'listo',
      cantidad: 1,
      comprable: true,
      textoExistencias: '10 piezas disponibles',
      fotos: [imagenProducto('shampoo-250')],
      agregando: false,
      confirmacion: null,
      errorAgregar: null,
    });
    expect(result.current.producto?.id).toBe(301);
    expect(result.current.presentacion?.id).toBe(3011);
    expect(llamadas.map((l) => `${l.metodo} ${l.ruta}`)).toEqual([rutaProducto(301)]);
  });

  it.each<[string, string | null, number]>([
    ['desactivado (404 del servidor)', String(PRODUCTO_INACTIVO.id), 1],
    ['con id no numérico', 'abc', 0],
    ['sin id', null, 0],
  ])('producto %s: noEncontrado y agregar no hace nada', async (_caso, id, pedidas) => {
    const { result, llamadas } = await abrirDetalleProducto(id);
    expect(result.current).toMatchObject({
      estado: 'noEncontrado',
      producto: null,
      presentacion: null,
      comprable: false,
      textoExistencias: 'Sin existencias',
      fotos: [],
    });
    await hacer(() => result.current.agregar());
    await vaciar();
    expect(llamadas).toHaveLength(pedidas);
    expect(mockEsperanSesion).toHaveLength(0);
  });

  it.each<[string, Turno, boolean]>([
    ['sin red', sinRed, true],
    ['un 500', falla(ERRORES.interno), false],
  ])('%s: error (errorRed %s) y recargar lo trae', async (_caso, error, red) => {
    const { result } = await abrirDetalleProducto('301', {
      [rutaProducto(301)]: turnos(error, () => respuesta(cuerpoDatoTienda(SHAMPOO))),
    });
    expect(result.current).toMatchObject({ estado: 'error', errorRed: red, producto: null });
    await hacer(() => result.current.recargar());
    await esperarEstado(result, 'listo');
    expect(result.current.producto?.id).toBe(301);
  });

  it.each<[string, ProductoCrudo, Partial<DetalleProductoViewModel>, number | null]>([
    ['agotado', MASCARILLA_AGOTADA, { textoExistencias: 'Sin existencias', comprable: false }, 3031],
    ['sin precio', SERUM_SIN_PRECIO, { textoExistencias: 'Consulta el precio en el salón', comprable: false, fotos: [] }, 3041],
    [
      'con la primera presentación agotada y una pieza en la otra (sin fotos propias)',
      PRODUCTO_UNA_PIEZA,
      { textoExistencias: '1 pieza disponible', comprable: true, fotos: [imagenProducto('presentacion-ficticia')] },
      3112,
    ],
    ['no disponible', PRODUCTO_NO_DISPONIBLE, { textoExistencias: 'Sin existencias', comprable: false }, 3121],
    ['sin presentaciones', PRODUCTO_SIN_PRESENTACIONES, { textoExistencias: 'Sin existencias', comprable: false, fotos: [] }, null],
  ])('producto %s: presentación elegida, existencias y fotos', async (_caso, producto, esperado, presentacionId) => {
    const { result } = await abrirDetalleProducto(String(producto.id), conProducto(producto));
    expect(result.current).toMatchObject({ estado: 'listo', ...esperado });
    expect(result.current.presentacion?.id ?? null).toBe(presentacionId);
  });

  it('un producto que no se puede comprar no pide sesión ni lee el carrito al agregar', async () => {
    const { result, llamadas } = await abrirDetalleProducto(String(MASCARILLA_AGOTADA.id));
    await hacer(() => result.current.agregar());
    await vaciar();
    expect(veces(llamadas, RUTA_CARRITO)).toBe(0);
    expect(result.current.agregando).toBe(false);
  });
});

describe('useDetalleProductoViewModel: presentación y carrito', () => {
  it('elegir otra presentación reinicia la cantidad y los avisos; la misma no cambia nada', async () => {
    const { result } = await abrirDetalleProducto('301', carritoSimulado().rutas);
    await hacer(() => result.current.agregar());
    await waitFor(() => expect(result.current.confirmacion).not.toBeNull());
    await hacer(() => result.current.setCantidad(3));
    await hacer(() => result.current.elegirPresentacion(3011));
    expect(result.current.cantidad).toBe(3);
    expect(result.current.confirmacion).not.toBeNull();
    await hacer(() => result.current.elegirPresentacion(3012));
    expect(result.current).toMatchObject({
      cantidad: 1,
      confirmacion: null,
      errorAgregar: null,
      textoExistencias: '4 piezas disponibles',
      fotos: [imagenProducto('shampoo-500')],
    });
    expect(result.current.presentacion?.id).toBe(3012);
  });

  it.each<[string, number, number, number | null, ConfirmacionCarrito['tipo'], string]>([
    ['con el carrito vacío', 0, 1, 1, 'agregado', 'Agregamos 1 pieza a tu carrito. Ahora tienes 1.'],
    ['sumando a lo que había', 2, 3, 5, 'agregado', 'Agregamos 3 piezas a tu carrito. Ahora tienes 5.'],
    ['pidiendo más que las existencias', 0, 15, 10, 'agregado', 'Agregamos 10 piezas a tu carrito. Ahora tienes 10.'],
    ['topado a las existencias', 8, 5, 10, 'agregado', 'Agregamos las piezas disponibles: tienes 10 en tu carrito.'],
    ['con todas las existencias ya en el carrito', 10, 1, null, 'completo', 'Ya tienes en tu carrito todas las piezas disponibles.'],
  ])('agregar %s: confirmación y aviso al contador', async (_caso, enCarrito, cantidad, enviada, tipo, mensaje) => {
    const carrito = carritoSimulado({ items: enCarrito > 0 ? [itemCarritoCrudo(SHAMPOO, enCarrito)] : [] });
    const { result, llamadas } = await abrirDetalleProducto('301', carrito.rutas);
    await hacer(() => result.current.setCantidad(cantidad));
    await hacer(() => result.current.agregar());
    await waitFor(() => expect(result.current.confirmacion).toMatchObject({ tipo, mensaje }));
    expect(result.current).toMatchObject({ agregando: false, errorAgregar: null });
    expect(cuerposEn(llamadas, RUTA_AGREGAR_CARRITO)).toEqual(
      enviada === null ? [] : [{ productoId: 301, presentacionId: 3011, cantidad: enviada }],
    );
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it('sin sesión deja la acción esperando sin tocar el carrito y, al iniciar sesión, agrega lo elegido', async () => {
    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    const carrito = carritoSimulado();
    const { result, llamadas } = await abrirDetalleProducto('301', carrito.rutas);
    await hacer(() => result.current.setCantidad(2));
    await hacer(() => result.current.agregar());
    await vaciar();
    expect(mockEsperanSesion).toHaveLength(1);
    expect(veces(llamadas, RUTA_CARRITO)).toBe(0);
    expect(result.current.confirmacion).toBeNull();

    authSimulada.estado = 'autenticado';
    authSimulada.usuario = CLIENTA_CITAS;
    await hacer(() => mockEsperanSesion[0]());
    await waitFor(() => expect(result.current.confirmacion?.tipo).toBe('agregado'));
    expect(carrito.items().map((item) => [item.presentacionId, item.cantidad])).toEqual([[3011, 2]]);
  });

  it.each<[string, Rutas, string]>([
    ['la presentación ya no está disponible (400)', { [RUTA_AGREGAR_CARRITO]: turnos(falla(ERRORES_TIENDA.presentacionNoDisponible)) }, 'Esta presentación ya no está disponible.'],
    ['sin red al leer el carrito', { [RUTA_CARRITO]: turnos(sinRed) }, MENSAJE_SIN_CONEXION],
  ])('error al agregar (%s): mensaje legible sin avisar al contador; cambiar la cantidad lo borra', async (_caso, rutas, mensaje) => {
    const { result } = await abrirDetalleProducto('301', { ...carritoSimulado().rutas, ...rutas });
    await hacer(() => result.current.agregar());
    await waitFor(() => expect(result.current.errorAgregar).toBe(mensaje));
    expect(result.current).toMatchObject({ agregando: false, confirmacion: null });
    expect(avisar).not.toHaveBeenCalled();
    await hacer(() => result.current.setCantidad(2));
    expect(result.current.errorAgregar).toBeNull();
  });

  it('doble toque agrega una sola vez (agregando mientras tanto)', async () => {
    const lectura = enPausa();
    const { result, llamadas } = await abrirDetalleProducto('301', {
      ...carritoSimulado().rutas,
      [RUTA_CARRITO]: turnos(lectura.turno),
    });
    await hacer(() => {
      result.current.agregar();
      result.current.agregar();
    });
    expect(result.current.agregando).toBe(true);
    await lectura.soltar(respuesta(cuerpoListaTienda([])));
    await waitFor(() => expect(result.current.agregando).toBe(false));
    expect(veces(llamadas, RUTA_CARRITO)).toBe(1);
    expect(veces(llamadas, RUTA_AGREGAR_CARRITO)).toBe(1);
  });

  it.each<[string, () => Response, number]>([
    ['con éxito', () => respuesta(cuerpoListaTienda([])), 1],
    ['con error', () => respuestaError(ERRORES.interno), 0],
  ])('cerrar la pantalla mientras agrega (%s): solo avisa al contador si agregó y no escribe nada', async (_caso, salida, avisos) => {
    const lectura = enPausa();
    const { result, unmount } = await abrirDetalleProducto('301', {
      ...carritoSimulado().rutas,
      [RUTA_CARRITO]: turnos(lectura.turno),
    });
    await hacer(() => result.current.agregar());
    await unmount();
    await lectura.soltar(salida());
    await vaciar();
    expect(avisar).toHaveBeenCalledTimes(avisos);
    expect(result.current).toMatchObject({ agregando: true, confirmacion: null, errorAgregar: null });
  });

  it.each<[string, boolean, number, string[][]]>([
    ['con pantalla anterior regresa', true, 1, [['/carrito'], ['/tienda']]],
    ['sin pantalla anterior va a la Tienda', false, 0, [['/carrito'], ['/tienda'], ['/tienda']]],
  ])('volver %s; verCarrito e irATienda cambian de pestaña', async (_caso, hayAnterior, regresos, destinos) => {
    router.canGoBack.mockReturnValue(hayAnterior);
    const { result } = await abrirDetalleProducto();
    await hacer(() => result.current.verCarrito());
    await hacer(() => result.current.irATienda());
    await hacer(() => result.current.volver());
    expect(router.back).toHaveBeenCalledTimes(regresos);
    expect(router.dismissTo.mock.calls).toEqual(destinos);
  });
});

// ── useCarritoViewModel ──────────────────────────────────────────────────────────────────────

const ID_SHAMPOO = idItemCarrito(3011);
const ID_ACONDICIONADOR = idItemCarrito(3021);

async function abrirCarrito(rutas: Rutas = {}) {
  const llamadas = servidor(rutas);
  const hook = await renderHook(() => useCarritoViewModel());
  return { ...hook, llamadas };
}

/** Carrito con CARRITO_CRUDO (o los ítems indicados) ya cargado. */
async function carritoListo(items: ItemCarritoCrudo[] = CARRITO_CRUDO, rutas: Rutas = {}) {
  const carrito = carritoSimulado({ items });
  const abierto = await abrirCarrito({ ...carrito.rutas, ...rutas });
  await esperarEstado(abierto.result, 'listo');
  return { ...abierto, carrito };
}

function fila(r: Ref<CarritoViewModel>, id: number) {
  const item = r.current.items.find((i) => i.id === id);
  if (!item) throw new Error(`Sin ítem ${id}`);
  return item;
}

const cantidadGuardada = (carrito: ReturnType<typeof carritoSimulado>, id: number) =>
  carrito.items().find((item) => item.id === id)?.cantidad;

describe('useCarritoViewModel: carga y sesión', () => {
  it.each<['anonimo' | 'cargando', boolean]>([
    ['anonimo', false],
    ['cargando', true],
  ])('sin sesión (%s) no lee nada y muestra la invitación', async (estado, sesionCargando) => {
    authSimulada.estado = estado;
    authSimulada.usuario = null;
    const { result, llamadas } = await abrirCarrito();
    await vaciar();
    expect(llamadas).toHaveLength(0);
    expect(result.current).toMatchObject({ conSesion: false, sesionCargando, estado: 'cargando', items: [] });
  });

  it('carga los ítems con su total y publica las piezas al contador sin otra lectura', async () => {
    const { result, llamadas } = await carritoListo();
    expect(idsDe(result.current.items)).toEqual([ID_ACONDICIONADOR, ID_SHAMPOO]);
    expect(result.current).toMatchObject({
      conSesion: true,
      sesionCargando: false,
      total: 38_250 + 2 * 38_000,
      hayProblemas: false,
      errores: {},
      porQuitar: null,
      quitando: false,
    });
    expect(result.current.ocupados.size).toBe(0);
    expect(publicar).toHaveBeenCalledWith(3);
    expect(veces(llamadas, RUTA_CARRITO)).toBe(1);
  });

  it('carrito vacío: listo con total 0', async () => {
    const { result } = await carritoListo([]);
    expect(result.current).toMatchObject({ items: [], total: 0, hayProblemas: false });
    expect(publicar).toHaveBeenCalledWith(0);
  });

  it.each<[string, Turno]>([
    ['sin red', sinRed],
    ['un 500', falla(ERRORES.interno)],
  ])('%s: error y recargar lo trae', async (_caso, error) => {
    const { result } = await abrirCarrito({ [RUTA_CARRITO]: turnos(error, carritoCon(CARRITO_CRUDO)) });
    await esperarEstado(result, 'error');
    await hacer(() => result.current.recargar());
    await esperarEstado(result, 'listo');
    expect(result.current.items).toHaveLength(2);
  });

  it('al volver a enfocar lee en silencio; si esa lectura falla, la lista se queda', async () => {
    const silenciosa = enPausa();
    const { result } = await abrirCarrito({
      [RUTA_CARRITO]: turnos(carritoCon(CARRITO_CRUDO), silenciosa.turno, sinRed),
    });
    await esperarEstado(result, 'listo');
    await reenfocar();
    expect(result.current.estado).toBe('listo');
    await silenciosa.soltar(respuesta(cuerpoListaTienda([CARRITO_CRUDO[1]])));
    await waitFor(() => expect(idsDe(result.current.items)).toEqual([ID_SHAMPOO]));
    await reenfocar();
    await vaciar();
    expect(result.current.estado).toBe('listo');
    expect(idsDe(result.current.items)).toEqual([ID_SHAMPOO]);
  });

  it('al cerrar sesión limpia la lista y descarta la lectura en camino; al volver a entrar la lee de nuevo', async () => {
    const lectura = enPausa();
    const { result, rerender, llamadas } = await abrirCarrito({
      [RUTA_CARRITO]: turnos(carritoCon(CARRITO_CRUDO), lectura.turno, carritoCon([CARRITO_CRUDO[1]])),
    });
    await esperarEstado(result, 'listo');
    await reenfocar();
    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    await rerender({});
    await lectura.soltar(respuesta(cuerpoListaTienda(CARRITO_CRUDO)));
    await vaciar();
    expect(result.current).toMatchObject({ conSesion: false, estado: 'cargando', items: [], errores: {} });

    authSimulada.estado = 'autenticado';
    authSimulada.usuario = CLIENTA_CITAS;
    await rerender({});
    await esperarEstado(result, 'listo');
    expect(idsDe(result.current.items)).toEqual([ID_SHAMPOO]);
    expect(veces(llamadas, RUTA_CARRITO)).toBe(3);
  });
});

describe('useCarritoViewModel: cantidades', () => {
  it('cambiar la cantidad se ve al instante y ocupa la fila; mientras guarda, la fila no acepta otros cambios', async () => {
    const put = enPausa();
    const { result, llamadas, carrito } = await carritoListo(CARRITO_CRUDO, {
      [rutaCambiarCantidad(ID_SHAMPOO)]: turnos(put.turno),
    });
    await hacer(() => result.current.cambiarCantidad(fila(result, ID_SHAMPOO), 3));
    expect(fila(result, ID_SHAMPOO).cantidad).toBe(3);
    expect([...result.current.ocupados]).toEqual([ID_SHAMPOO]);
    expect(result.current.total).toBe(38_250 + 3 * 38_000);

    await hacer(() => {
      result.current.cambiarCantidad(fila(result, ID_SHAMPOO), 4);
      result.current.pedirQuitar(fila(result, ID_SHAMPOO));
      result.current.continuar();
    });
    // Una lectura al volver a enfocar trae la cantidad vieja: la fila ocupada conserva la nueva.
    await reenfocar();
    await vaciar();
    expect(fila(result, ID_SHAMPOO).cantidad).toBe(3);
    expect(result.current.porQuitar).toBeNull();
    expect(router.push).not.toHaveBeenCalled();

    await put.soltar(respuesta(cuerpoDatoTienda({ id: ID_SHAMPOO, cantidad: 3 })));
    await waitFor(() => expect(result.current.ocupados.size).toBe(0));
    expect(fila(result, ID_SHAMPOO).cantidad).toBe(3);
    expect(cuerposEn(llamadas, rutaCambiarCantidad(ID_SHAMPOO))).toEqual([{ cantidad: 3 }]);
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(cantidadGuardada(carrito, ID_SHAMPOO)).toBe(2);
  });

  it('si el servidor no acepta la cantidad (403 sin existencias) regresa al valor anterior con un mensaje; el siguiente cambio lo borra', async () => {
    const { result, carrito } = await carritoListo();
    await hacer(() => result.current.cambiarCantidad(fila(result, ID_SHAMPOO), 11));
    await waitFor(() => expect(result.current.errores[ID_SHAMPOO]).toBe(PIEZAS_INSUFICIENTES));
    expect(fila(result, ID_SHAMPOO).cantidad).toBe(2);
    expect(result.current.ocupados.size).toBe(0);
    expect(avisar).not.toHaveBeenCalled();

    await hacer(() => result.current.cambiarCantidad(fila(result, ID_SHAMPOO), 3));
    await waitFor(() => expect(result.current.errores).toEqual({}));
    expect(cantidadGuardada(carrito, ID_SHAMPOO)).toBe(3);
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['la misma cantidad', 2],
    ['menos de una pieza', 0],
  ])('cambiar a %s no envía nada', async (_caso, cantidad) => {
    const { result, llamadas } = await carritoListo();
    await hacer(() => result.current.cambiarCantidad(fila(result, ID_SHAMPOO), cantidad));
    await vaciar();
    expect(veces(llamadas, rutaCambiarCantidad(ID_SHAMPOO))).toBe(0);
    expect(fila(result, ID_SHAMPOO).cantidad).toBe(2);
  });
});

describe('useCarritoViewModel: quitar y continuar', () => {
  it('quitar pide confirmación: cancelar no envía nada y confirmar lo quita y avisa al contador', async () => {
    const { result, llamadas, carrito } = await carritoListo();
    await hacer(() => result.current.confirmarQuitar());
    await hacer(() => result.current.pedirQuitar(fila(result, ID_ACONDICIONADOR)));
    expect(result.current.porQuitar?.id).toBe(ID_ACONDICIONADOR);
    await hacer(() => result.current.cancelarQuitar());
    expect(result.current.porQuitar).toBeNull();
    expect(veces(llamadas, rutaQuitarDelCarrito(ID_ACONDICIONADOR))).toBe(0);

    await hacer(() => result.current.pedirQuitar(fila(result, ID_ACONDICIONADOR)));
    await hacer(() => result.current.confirmarQuitar());
    await waitFor(() => expect(idsDe(result.current.items)).toEqual([ID_SHAMPOO]));
    expect(result.current).toMatchObject({ porQuitar: null, quitando: false });
    expect(idsDe(carrito.items())).toEqual([ID_SHAMPOO]);
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it.each<[string, CuerpoError, number[], Record<number, string>, number]>([
    ['404 (ya no estaba): lo quita igual', ERRORES_TIENDA.itemNoEncontrado, [ID_SHAMPOO], {}, 1],
    ['500: lo deja con un mensaje', ERRORES.interno, [ID_ACONDICIONADOR, ID_SHAMPOO], { [ID_ACONDICIONADOR]: GENERICO_CARRITO }, 0],
  ])('quitar con %s', async (_caso, cuerpo, ids, errores, avisos) => {
    const { result } = await carritoListo(CARRITO_CRUDO, {
      [rutaQuitarDelCarrito(ID_ACONDICIONADOR)]: turnos(falla(cuerpo)),
    });
    await hacer(() => result.current.pedirQuitar(fila(result, ID_ACONDICIONADOR)));
    await hacer(() => result.current.confirmarQuitar());
    await waitFor(() => expect(result.current.quitando).toBe(false));
    expect(idsDe(result.current.items)).toEqual(ids);
    expect(result.current).toMatchObject({ errores, porQuitar: null });
    expect(avisar).toHaveBeenCalledTimes(avisos);
  });

  it('mientras quita, cerrar la hoja o confirmar otra vez no hacen nada', async () => {
    const borrado = enPausa();
    const { result, llamadas } = await carritoListo(CARRITO_CRUDO, {
      [rutaQuitarDelCarrito(ID_ACONDICIONADOR)]: turnos(borrado.turno),
    });
    await hacer(() => result.current.pedirQuitar(fila(result, ID_ACONDICIONADOR)));
    await hacer(() => result.current.confirmarQuitar());
    await hacer(() => {
      result.current.confirmarQuitar();
      result.current.cancelarQuitar();
    });
    expect(result.current).toMatchObject({ quitando: true });
    expect(result.current.porQuitar?.id).toBe(ID_ACONDICIONADOR);
    await borrado.soltar(respuesta({ success: true }));
    await waitFor(() => expect(result.current.porQuitar).toBeNull());
    expect(veces(llamadas, rutaQuitarDelCarrito(ID_ACONDICIONADOR))).toBe(1);
    expect(idsDe(result.current.items)).toEqual([ID_SHAMPOO]);
  });

  it('cerrar la pantalla con un cambio y un quitado en camino que fallan no escribe nada', async () => {
    const put = enPausa();
    const borrado = enPausa();
    const { result, unmount } = await carritoListo(CARRITO_CRUDO, {
      [rutaCambiarCantidad(ID_SHAMPOO)]: turnos(put.turno),
      [rutaQuitarDelCarrito(ID_ACONDICIONADOR)]: turnos(borrado.turno),
    });
    await hacer(() => result.current.pedirQuitar(fila(result, ID_ACONDICIONADOR)));
    await hacer(() => {
      result.current.confirmarQuitar();
      result.current.cambiarCantidad(fila(result, ID_SHAMPOO), 3);
    });
    await unmount();
    await put.soltar(respuestaError(ERRORES_TIENDA.stockInsuficiente));
    await borrado.soltar(respuestaError(ERRORES_TIENDA.itemNoEncontrado));
    await vaciar();
    expect(avisar).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ errores: {}, quitando: true });
  });

  it.each<[string, ItemCarritoCrudo[], boolean]>([
    ['con todo en orden va al checkout', CARRITO_CRUDO, false],
    ['con un producto que pide más piezas de las que hay se bloquea', [itemCarritoCrudo(ESMALTE, 5), ...CARRITO_CRUDO], true],
    ['vacío se bloquea', [], false],
  ])('continuar %s', async (_caso, items, hayProblemas) => {
    const { result } = await carritoListo(items);
    expect(result.current.hayProblemas).toBe(hayProblemas);
    await hacer(() => result.current.continuar());
    expect(router.push.mock.calls).toEqual(items === CARRITO_CRUDO ? [['/checkout']] : []);
  });

  it('verTienda cambia a la pestaña Tienda', async () => {
    const { result } = await carritoListo();
    await hacer(() => result.current.verTienda());
    expect(router.navigate).toHaveBeenCalledWith('/tienda');
  });
});

// ── useCheckoutViewModel ─────────────────────────────────────────────────────────────────────

/** Las líneas de CARRITO_CRUDO en el orden del carrito (el acondicionador es el más reciente). */
const LINEAS_CARRITO = [LINEAS_PEDIDO[1], LINEAS_PEDIDO[0]];
const CONFIRMACION = `/pedido-confirmado/${ID_PEDIDO}`;
const CREAR_GENERICO = 'No pudimos crear tu pedido. Intenta de nuevo en un momento.';

/** Checkout sobre el carrito con `items`; Mis pedidos vacío salvo que la prueba diga otra cosa. */
async function abrirCheckout(rutas: Rutas = {}, items: ItemCarritoCrudo[] = CARRITO_CRUDO) {
  const carrito = carritoSimulado({ items });
  const llamadas = servidor({ [RUTA_MIS_PEDIDOS]: pedidosComo([]), ...carrito.rutas, ...rutas });
  const hook = await renderHook(() => useCheckoutViewModel());
  return { ...hook, llamadas, carrito };
}

/** Checkout listo en el paso 3 con el método indicado. */
async function enPaso3(rutas: Rutas = {}, metodo: MetodoPago = 'pago_en_salon') {
  const abierto = await abrirCheckout(rutas);
  await esperarEstado(abierto.result, 'listo');
  await hacer(() => {
    abierto.result.current.elegirMetodo(metodo);
    abierto.result.current.continuar();
  });
  await hacer(() => abierto.result.current.continuar());
  return abierto;
}

describe('useCheckoutViewModel: carga y pasos', () => {
  it('carga el carrito en el paso 1 con pago al recoger por omisión y los tres pasos', async () => {
    const { result } = await abrirCheckout();
    await esperarEstado(result, 'listo');
    expect(idsDe(result.current.items)).toEqual([ID_ACONDICIONADOR, ID_SHAMPOO]);
    expect(result.current).toMatchObject({
      total: 38_250 + 2 * 38_000,
      paso: 1,
      metodo: 'pago_en_salon',
      enviando: false,
      errorEnvio: null,
      revisarCarrito: false,
    });
    expect(PASOS_CHECKOUT).toHaveLength(3);
  });

  it.each<[string, ItemCarritoCrudo[], boolean]>([
    ['vacío, con el carrito debajo: regresa', [], true],
    ['con un producto por ajustar, sin pantalla debajo: abre el carrito', [itemCarritoCrudo(MASCARILLA_AGOTADA, 1)], false],
  ])('carrito %s', async (_caso, items, hayAnterior) => {
    router.canGoBack.mockReturnValue(hayAnterior);
    const { result } = await abrirCheckout({}, items);
    await waitFor(() => expect(router.back.mock.calls.length + router.dismissTo.mock.calls.length).toBe(1));
    expect(router.dismissTo.mock.calls).toEqual(hayAnterior ? [] : [['/carrito']]);
    expect(result.current.estado).toBe('cargando');
  });

  it('sin red al cargar: error, confirmar no envía nada y recargar lo trae', async () => {
    const { result, llamadas } = await abrirCheckout({ [RUTA_CARRITO]: turnos(sinRed, carritoCon(CARRITO_CRUDO)) });
    await esperarEstado(result, 'error');
    await hacer(() => result.current.confirmar());
    await vaciar();
    expect(veces(llamadas, RUTA_CREAR_PEDIDO)).toBe(0);
    await hacer(() => result.current.recargar());
    await esperarEstado(result, 'listo');
  });

  it('avanza hasta el paso 3 sin pasarse; atrás (también el de Android) regresa un paso y en el primero sale', async () => {
    const { result } = await abrirCheckout();
    await esperarEstado(result, 'listo');
    await hacer(() => result.current.continuar());
    await hacer(() => result.current.continuar());
    await hacer(() => result.current.continuar());
    expect(result.current.paso).toBe(3);
    let consumido = false;
    await hacer(() => {
      consumido = atras.pulsar();
    });
    expect(consumido).toBe(true);
    expect(result.current.paso).toBe(2);
    await hacer(() => result.current.atras());
    expect(result.current.paso).toBe(1);
    expect(router.back).not.toHaveBeenCalled();
    await hacer(() => result.current.atras());
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('sin pantalla debajo, salir abre la pestaña Carrito', async () => {
    router.canGoBack.mockReturnValue(false);
    const { result } = await abrirCheckout();
    await esperarEstado(result, 'listo');
    await hacer(() => result.current.atras());
    expect(router.dismissTo).toHaveBeenCalledWith('/carrito');
  });
});

describe('useCheckoutViewModel: confirmar', () => {
  it.each<[string, MetodoPago, string]>([
    ['al recoger', 'pago_en_salon', CONFIRMACION],
    ['en línea', 'mercado_pago', `${CONFIRMACION}?pagar=1`],
  ])('con pago %s crea el pedido, quita lo enviado del carrito, avisa al contador y abre la confirmación', async (_caso, metodo, destino) => {
    const { result, llamadas, carrito } = await enPaso3({}, metodo);
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(destino));
    expect(cuerposEn(llamadas, RUTA_CREAR_PEDIDO)).toEqual([
      { estado: 'pendiente_pago', moneda: 'MXN', metodoPago: metodo, items: LINEAS_CARRITO },
    ]);
    expect(carrito.items()).toEqual([]);
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(result.current.enviando).toBe(true);
  });

  it('doble toque crea un solo pedido; mientras envía no cambia el método ni regresa', async () => {
    const post = enPausa();
    const { result, llamadas } = await enPaso3({ [RUTA_CREAR_PEDIDO]: turnos(post.turno) });
    await hacer(() => {
      result.current.confirmar();
      result.current.confirmar();
    });
    expect(result.current.enviando).toBe(true);
    await hacer(() => {
      result.current.elegirMetodo('mercado_pago');
      result.current.atras();
    });
    expect(result.current).toMatchObject({ metodo: 'pago_en_salon', paso: 3 });
    await post.soltar(respuesta(cuerpoPedido(pedidoApartado({ id: ID_PEDIDO })), 201));
    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(veces(llamadas, RUTA_CREAR_PEDIDO)).toBe(1);
  });

  it.each<[string, Turno]>([
    ['sin red', sinRed],
    ['un 502', falla(cuerpoError(502, 'Bad Gateway'))],
  ])('%s con el pedido ya creado: lo encuentra en Mis pedidos y sigue sin crear otro', async (_caso, error) => {
    const creados: PedidoCrudo[] = [];
    const { result, llamadas, carrito } = await enPaso3({
      [RUTA_CREAR_PEDIDO]: (cuerpo) => {
        creados.push(pedidoDesdeCuerpo(cuerpo));
        return error();
      },
      [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos(creados)),
    });
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(CONFIRMACION));
    expect(veces(llamadas, RUTA_CREAR_PEDIDO)).toBe(1);
    expect(veces(llamadas, RUTA_MIS_PEDIDOS)).toBe(1);
    expect(carrito.items()).toEqual([]);
    expect(result.current.errorEnvio).toBeNull();
  });

  it.each<[string, Turno, string, boolean]>([
    ['sin red y sin pedido creado', sinRed, MENSAJE_SIN_CONEXION, false],
    ['un 500 sin pedido creado', falla(ERRORES.interno), CREAR_GENERICO, false],
    ['sin existencias (400)', falla(ERRORES_PEDIDOS.stockInsuficiente), 'Uno de tus productos ya no tiene piezas suficientes. Revisa tu carrito.', true],
  ])('error al crear (%s): mensaje y revisarCarrito; el carrito queda y atrás borra el error', async (_caso, error, mensaje, revisar) => {
    const { result, carrito } = await enPaso3({ [RUTA_CREAR_PEDIDO]: turnos(error) });
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(result.current.errorEnvio).toBe(mensaje));
    expect(result.current).toMatchObject({ revisarCarrito: revisar, enviando: false });
    expect(router.replace).not.toHaveBeenCalled();
    expect(carrito.items()).toHaveLength(2);
    expect(avisar).not.toHaveBeenCalled();
    await hacer(() => result.current.atras());
    expect(result.current).toMatchObject({ paso: 2, errorEnvio: null, revisarCarrito: false });
  });

  it.each<[string, () => Response, number]>([
    ['con éxito', () => respuesta(cuerpoPedido(pedidoApartado({ id: ID_PEDIDO })), 201), 1],
    ['con error', () => respuestaError(ERRORES.interno), 0],
  ])('cerrar la pantalla mientras envía (%s): no navega ni escribe', async (_caso, salida, avisos) => {
    const post = enPausa();
    const { result, unmount } = await enPaso3({ [RUTA_CREAR_PEDIDO]: turnos(post.turno) });
    await hacer(() => result.current.confirmar());
    await unmount();
    await post.soltar(salida());
    await vaciar();
    expect(router.replace).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledTimes(avisos);
    expect(result.current).toMatchObject({ enviando: true, errorEnvio: null });
  });
});

// ── useMisPedidosViewModel ───────────────────────────────────────────────────────────────────

const IDS_MIS_PEDIDOS = idsDe(MIS_PEDIDOS_CRUDOS);
const GENERICO_PEDIDOS = 'Algo salió mal al traer tus pedidos. Intenta de nuevo en un momento.';
const AVISO_REFRESCO_PEDIDOS = 'No pudimos actualizar tus pedidos. Desliza hacia abajo para intentar de nuevo.';

async function abrirMisPedidos(rutas: Rutas = {}) {
  const llamadas = servidor(rutas);
  const hook = await renderHook(() => useMisPedidosViewModel());
  return { ...hook, llamadas };
}

describe('useMisPedidosViewModel', () => {
  it('cargando y luego listo con los pedidos normalizados, del más reciente al más viejo', async () => {
    const lista = enPausa();
    const { result, llamadas } = await abrirMisPedidos({ [RUTA_MIS_PEDIDOS]: turnos(lista.turno) });
    expect(result.current).toMatchObject({ estado: 'cargando', pedidos: [], mensajeError: null });
    await lista.soltar(respuesta(cuerpoMisPedidos()));
    await esperarEstado(result, 'listo');
    expect(idsDe(result.current.pedidos)).toEqual(IDS_MIS_PEDIDOS);
    expect(result.current.pedidos[0]).toEqual(pedidoNormalizado());
    expect(veces(llamadas, RUTA_MIS_PEDIDOS)).toBe(1);
  });

  it('sin pedidos: listo con la lista vacía', async () => {
    const { result } = await abrirMisPedidos({ [RUTA_MIS_PEDIDOS]: turnos(pedidosComo([])) });
    await esperarEstado(result, 'listo');
    expect(result.current).toMatchObject({ pedidos: [], mensajeError: null });
  });

  it.each<[string, Turno, string]>([
    ['sin red', sinRed, MENSAJE_SIN_CONEXION],
    ['sesión terminada (401)', falla(ERRORES.noAutorizado), MENSAJE_SESION_TERMINADA],
    ['un 500', falla(ERRORES.interno), GENERICO_PEDIDOS],
  ])('%s: error con mensaje para la clienta; recargar vuelve a cargando y trae la lista', async (_caso, error, mensaje) => {
    const reintento = enPausa();
    const { result } = await abrirMisPedidos({ [RUTA_MIS_PEDIDOS]: turnos(error, reintento.turno) });
    await esperarEstado(result, 'error');
    expect(result.current.mensajeError).toBe(mensaje);
    await hacer(() => result.current.recargar());
    expect(result.current).toMatchObject({ estado: 'cargando', mensajeError: null });
    await reintento.soltar(respuesta(cuerpoMisPedidos()));
    await esperarEstado(result, 'listo');
    expect(idsDe(result.current.pedidos)).toEqual(IDS_MIS_PEDIDOS);
  });

  it.each<[string, Turno, string]>([
    ['sin red', sinRed, MENSAJE_SIN_CONEXION],
    ['un 500', falla(ERRORES.interno), AVISO_REFRESCO_PEDIDOS],
  ])('refrescar %s conserva la lista y avisa; el siguiente refresco quita el aviso', async (_caso, error, aviso) => {
    const { result } = await abrirMisPedidos({ [RUTA_MIS_PEDIDOS]: turnos(pedidosComo(MIS_PEDIDOS_CRUDOS), error, pedidosComo([])) });
    await esperarEstado(result, 'listo');
    await hacer(() => result.current.refrescar());
    await waitFor(() => expect(result.current.avisoRefresco).toBe(aviso));
    expect(result.current).toMatchObject({ estado: 'listo', refrescando: false, mensajeError: null });
    expect(idsDe(result.current.pedidos)).toEqual(IDS_MIS_PEDIDOS);
    await hacer(() => result.current.refrescar());
    await waitFor(() => expect(result.current.avisoRefresco).toBeNull());
    expect(result.current.pedidos).toEqual([]);
  });

  it('al volver a enfocar recarga en silencio; si falla, la lista se queda sin aviso', async () => {
    const { result, llamadas } = await abrirMisPedidos({
      [RUTA_MIS_PEDIDOS]: turnos(pedidosComo(MIS_PEDIDOS_CRUDOS), pedidosComo([MIS_PEDIDOS_CRUDOS[1]]), sinRed),
    });
    await esperarEstado(result, 'listo');
    await reenfocar();
    await waitFor(() => expect(idsDe(result.current.pedidos)).toEqual([702]));
    await reenfocar();
    await vaciar();
    expect(veces(llamadas, RUTA_MIS_PEDIDOS)).toBe(3);
    expect(result.current).toMatchObject({ estado: 'listo', avisoRefresco: null, mensajeError: null });
    expect(idsDe(result.current.pedidos)).toEqual([702]);
  });

  it('sin sesión no pide nada y recargar o refrescar no hacen nada', async () => {
    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    const { result, llamadas } = await abrirMisPedidos();
    await hacer(() => {
      result.current.recargar();
      result.current.refrescar();
    });
    await vaciar();
    expect(llamadas).toHaveLength(0);
    expect(result.current).toMatchObject({ estado: 'cargando', pedidos: [], refrescando: false });
  });

  it.each<[string, () => Response]>([
    ['con éxito', () => respuesta(cuerpoMisPedidos())],
    ['con error', () => respuestaError(ERRORES.interno)],
  ])('al cerrar sesión limpia lo cargado y descarta el refresco en camino (%s)', async (_caso, tardia) => {
    const refresco = enPausa();
    const { result, rerender } = await abrirMisPedidos({
      [RUTA_MIS_PEDIDOS]: turnos(pedidosComo(MIS_PEDIDOS_CRUDOS), refresco.turno),
    });
    await esperarEstado(result, 'listo');
    await hacer(() => result.current.refrescar());
    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    await rerender({});
    await refresco.soltar(tardia());
    await vaciar();
    expect(result.current).toMatchObject({
      estado: 'cargando',
      pedidos: [],
      mensajeError: null,
      avisoRefresco: null,
      refrescando: false,
    });
  });

  it('abrirPedido con doble toque abre un solo detalle; al volver se puede de nuevo; verTienda va a la Tienda', async () => {
    const { result } = await abrirMisPedidos();
    await esperarEstado(result, 'listo');
    await hacer(() => {
      result.current.abrirPedido(701);
      result.current.abrirPedido(702);
    });
    expect(router.push.mock.calls).toEqual([['/pedido/701']]);
    await reenfocar();
    await hacer(() => result.current.abrirPedido(702));
    expect(router.push).toHaveBeenLastCalledWith('/pedido/702');
    await hacer(() => result.current.verTienda());
    expect(router.dismissTo).toHaveBeenCalledWith('/tienda');
  });
});

// ── useDetallePedidoViewModel ────────────────────────────────────────────────────────────────

const CANCELADO = 'Tu pedido quedó cancelado.';
const SIN_CIFRA = `${CANCELADO} Ya pedimos a Mercado Pago la devolución al mismo medio con que pagaste. Puede tardar unos días en reflejarse, según tu banco.`;

/** Con id null abre la ruta sin id. */
async function abrirDetallePedido(id: string | null = String(ID_PEDIDO), rutas: Rutas = {}) {
  const llamadas = servidor(rutas);
  const hook = await renderHook(() => useDetallePedidoViewModel(id ?? undefined));
  await waitFor(() => expect(hook.result.current.estado).not.toBe('cargando'));
  return { ...hook, llamadas };
}

async function cancelarPedidoEn(r: Ref<DetallePedidoViewModel>): Promise<void> {
  await hacer(() => r.current.abrirCancelar());
  await hacer(() => r.current.cancelar());
}

describe('useDetallePedidoViewModel: carga y pago en línea', () => {
  it.each<[string, PedidoCrudo, number]>([
    ['en línea por pagar: consulta el pago', pedidoCrudo(), 1],
    ['apartado: no consulta', pedidoApartado(), 0],
    ['ya pagado: no consulta', pedidoPagado(), 0],
  ])('pedido %s', async (_caso, pedido, consultas) => {
    const { result, llamadas } = await abrirDetallePedido(` ${pedido.id} `);
    expect(result.current).toMatchObject({
      estado: 'listo',
      numero: String(pedido.id),
      pagoEnProceso: false,
      hojaCancelarVisible: false,
      aviso: null,
    });
    expect(result.current.pedido?.id).toBe(pedido.id);
    await vaciar();
    expect(veces(llamadas, rutaEstadoPagoPedido(pedido.id))).toBe(consultas);
  });

  it.each([['texto', 'abc'], ['cero', '0'], ['negativo', '-3'], ['vacío', '  '], ['sin valor', null]])(
    'id %s: noEncontrado sin pedir nada, y pagar, revisar o cancelar no hacen nada',
    async (_caso, id) => {
      const { result, llamadas } = await abrirDetallePedido(id);
      expect(result.current).toMatchObject({ estado: 'noEncontrado', numero: null, pedido: null });
      await hacer(() => {
        result.current.completarPago();
        result.current.revisarPago();
        result.current.cancelar();
        result.current.recargar();
      });
      await vaciar();
      expect(llamadas).toHaveLength(0);
      expect(router.push).not.toHaveBeenCalled();
      expect(result.current.estado).toBe('noEncontrado');
    },
  );

  it.each<[string, Turno, string]>([
    ['404', falla(ERRORES_PEDIDOS.pedidoNoEncontrado), 'noEncontrado'],
    ['un 500', falla(ERRORES.interno), 'error'],
    ['sin red', sinRed, 'error'],
  ])('%s: estado %s sin pedido; recargar lo trae', async (_caso, error, estado) => {
    const { result } = await abrirDetallePedido(String(ID_PEDIDO), {
      [rutaPedido()]: turnos(error, pedidoComo(pedidoCrudo())),
    });
    expect(result.current).toMatchObject({ estado, pedido: null });
    await hacer(() => result.current.recargar());
    await esperarEstado(result, 'listo');
  });

  it.each<[string, Turno, boolean, string]>([
    ['pendiente en Mercado Pago', pagoComo('pendiente'), true, 'pendiente_pago'],
    ['en revisión', pagoComo('revision'), true, 'pendiente_pago'],
    ['aprobado', pagoComo('aprobado'), false, 'pagado'],
    ['cancelado', pagoComo('cancelado'), false, 'cancelado'],
    ['sin respuesta', sinRed, false, 'pendiente_pago'],
  ])('pago %s: pagoEnProceso %s y el estado del pedido que manda el servidor', async (_caso, pago, enProceso, estado) => {
    const { result } = await abrirDetallePedido(String(ID_PEDIDO), { [rutaEstadoPagoPedido()]: turnos(pago) });
    await vaciar();
    expect(result.current.pagoEnProceso).toBe(enProceso);
    expect(result.current.pedido?.estado).toBe(estado);
  });

  it.each<[string, Turno, string, boolean]>([
    ['sin red deja el pedido', sinRed, 'listo', true],
    ['un 404 lo quita', falla(ERRORES_PEDIDOS.pedidoNoEncontrado), 'noEncontrado', false],
  ])('al volver a enfocar relee en silencio: %s', async (_caso, error, estado, conPedido) => {
    const { result, llamadas } = await abrirDetallePedido(String(ID_PEDIDO), {
      [rutaPedido()]: turnos(pedidoComo(pedidoCrudo()), error),
    });
    await reenfocar();
    expect(result.current.estado).not.toBe('cargando');
    await esperarEstado(result, estado);
    expect(result.current.pedido !== null).toBe(conPedido);
    expect(veces(llamadas, rutaPedido())).toBe(2);
  });
});

describe('useDetallePedidoViewModel: navegación', () => {
  it.each<[string, 'completarPago' | 'revisarPago', string]>([
    ['completarPago abre la confirmación para pagar', 'completarPago', `${CONFIRMACION}?pagar=1&origen=pedido`],
    ['revisarPago la abre solo para consultar', 'revisarPago', `${CONFIRMACION}?origen=pedido`],
  ])('%s una sola vez aunque se toque dos veces; al volver se puede de nuevo', async (_caso, accion, destino) => {
    const { result } = await abrirDetallePedido();
    await hacer(() => {
      result.current[accion]();
      result.current[accion]();
    });
    expect(router.push.mock.calls).toEqual([[destino]]);
    await reenfocar();
    await hacer(() => result.current[accion]());
    expect(router.push).toHaveBeenCalledTimes(2);
  });

  it.each<[string, boolean]>([
    ['con pantalla anterior regresa', true],
    ['sin pantalla anterior va a Mis pedidos', false],
  ])('regresar %s; verMisPedidos siempre vuelve a Mis pedidos', async (_caso, hayAnterior) => {
    router.canGoBack.mockReturnValue(hayAnterior);
    const { result } = await abrirDetallePedido();
    await hacer(() => result.current.regresar());
    expect(router.back).toHaveBeenCalledTimes(hayAnterior ? 1 : 0);
    expect(router.replace.mock.calls).toEqual(hayAnterior ? [] : [['/mis-pedidos']]);
    await hacer(() => result.current.verMisPedidos());
    expect(router.dismissTo).toHaveBeenCalledWith('/mis-pedidos');
  });
});

describe('useDetallePedidoViewModel: cancelar', () => {
  it.each<[string, PedidoCrudo, Rutas, AvisoPedido]>([
    ['un apartado sin pago en línea', pedidoApartado(), {}, { tipo: 'exito', texto: CANCELADO }],
    [
      'pagado en línea: devolución pedida a Mercado Pago con el monto',
      pedidoPagado(),
      {},
      {
        tipo: 'exito',
        texto: `${CANCELADO} Ya pedimos a Mercado Pago la devolución de $1,142.50 al mismo medio con que pagaste. Puede tardar unos días en reflejarse, según tu banco.`,
      },
    ],
    [
      'pagado en línea con un reembolso sin monto válido: sin cifra',
      pedidoPagado(),
      { [rutaCancelarPedido(703)]: () => respuesta(cuerpoCancelarPedido(pedidoPagado(), reembolsoCrudo('reembolsado', 0))) },
      { tipo: 'exito', texto: SIN_CIFRA },
    ],
    [
      'pagado con otro medio: devolución en revisión',
      pedidoPagado({ metodoPago: 'efectivo' }),
      {},
      { tipo: 'aviso', texto: `${CANCELADO} La devolución de tu pago quedó en revisión: el salón la hará y te avisará.` },
    ],
  ])('cancelar %s: muestra el pedido cancelado, cierra la hoja y avisa', async (_caso, pedido, rutas, aviso) => {
    const { result, llamadas } = await abrirDetallePedido(String(pedido.id), { ...rutasPedidos([pedido]), ...rutas });
    await hacer(() => result.current.abrirCancelar());
    expect(result.current.hojaCancelarVisible).toBe(true);
    await hacer(() => result.current.cancelar());
    await waitFor(() => expect(result.current.aviso).toEqual(aviso));
    expect(result.current).toMatchObject({ estado: 'listo', hojaCancelarVisible: false, cancelando: false, errorCancelacion: null });
    expect(result.current.pedido?.estado).toBe('cancelado');
    expect(cuerposEn(llamadas, rutaCancelarPedido(pedido.id))).toEqual([{ estado: 'cancelado' }]);
  });

  it.each<[string, CuerpoError, Turno, Partial<DetallePedidoViewModel>, string]>([
    [
      '403 (ya se prepara): mensaje en la hoja abierta',
      ERRORES_PEDIDOS.soloPersonalCambiaEstado,
      pedidoComo(pedidoCrudo()),
      { hojaCancelarVisible: true, errorCancelacion: 'Este pedido ya se está preparando y no se puede cancelar.', aviso: null },
      'listo',
    ],
    [
      '409 (cambió): cierra la hoja y avisa',
      ERRORES_PEDIDOS.pedidoCambio,
      pedidoComo(pedidoCrudo()),
      {
        hojaCancelarVisible: false,
        errorCancelacion: null,
        aviso: { tipo: 'info', texto: 'Tu pedido cambió. Lo actualizamos para que veas su estado.' },
      },
      'listo',
    ],
    [
      '404 (ya no existe): cierra la hoja sin aviso',
      ERRORES_PEDIDOS.pedidoNoEncontrado,
      falla(ERRORES_PEDIDOS.pedidoNoEncontrado),
      { hojaCancelarVisible: false, aviso: null, pedido: null },
      'noEncontrado',
    ],
  ])('cancelar con %s, y lee el pedido de nuevo', async (_caso, cuerpo, relectura, esperado, estado) => {
    const { result, llamadas } = await abrirDetallePedido(String(ID_PEDIDO), {
      [rutaPedido()]: turnos(pedidoComo(pedidoCrudo()), relectura),
      [rutaCancelarPedido()]: turnos(falla(cuerpo)),
    });
    await cancelarPedidoEn(result);
    await waitFor(() => expect(veces(llamadas, rutaPedido())).toBe(2));
    await esperarEstado(result, estado);
    expect(result.current).toMatchObject({ cancelando: false, ...esperado });
  });

  const sinConexionEnHoja = { aviso: null, hojaCancelarVisible: true, errorCancelacion: MENSAJE_SIN_CONEXION };
  it.each<[string, Turno, Partial<DetallePedidoViewModel>]>([
    [
      'ya quedó cancelado: se muestra así',
      pedidoComo(pedidoCrudo({ estado: 'cancelado' })),
      { aviso: { tipo: 'exito', texto: CANCELADO }, hojaCancelarVisible: false, errorCancelacion: null },
    ],
    ['sigue pendiente: sin conexión en la hoja', pedidoComo(pedidoCrudo()), sinConexionEnHoja],
    ['tampoco responde: sin conexión en la hoja', sinRed, sinConexionEnHoja],
  ])('cancelar sin red; al releer el pedido %s', async (_caso, relectura, esperado) => {
    const { result } = await abrirDetallePedido(String(ID_PEDIDO), {
      [rutaPedido()]: turnos(pedidoComo(pedidoCrudo()), relectura),
      [rutaCancelarPedido()]: turnos(sinRed),
    });
    await cancelarPedidoEn(result);
    await waitFor(() => expect(result.current.cancelando).toBe(false));
    expect(result.current).toMatchObject(esperado);
  });

  it('doble toque envía un solo PUT; mientras cancela no se cierra la hoja; cerrarla después borra el error', async () => {
    const put = enPausa();
    const { result, llamadas } = await abrirDetallePedido(String(ID_PEDIDO), { [rutaCancelarPedido()]: turnos(put.turno) });
    await hacer(() => result.current.abrirCancelar());
    await hacer(() => {
      result.current.cancelar();
      result.current.cancelar();
    });
    expect(result.current.cancelando).toBe(true);
    await hacer(() => result.current.cerrarCancelar());
    expect(result.current.hojaCancelarVisible).toBe(true);
    await put.soltar(respuestaError(ERRORES.interno));
    await waitFor(() =>
      expect(result.current.errorCancelacion).toBe('No pudimos cancelar tu pedido. Intenta de nuevo en un momento.'),
    );
    expect(veces(llamadas, rutaCancelarPedido())).toBe(1);
    await hacer(() => result.current.cerrarCancelar());
    expect(result.current).toMatchObject({ hojaCancelarVisible: false, errorCancelacion: null });
  });

  it.each<[string, () => Response]>([
    ['con éxito', () => respuesta(cuerpoCancelarPedido(pedidoCrudo()))],
    ['con error', () => respuestaError(ERRORES.interno)],
  ])('cerrar la pantalla mientras cancela (%s): la respuesta tardía no escribe nada', async (_caso, tardia) => {
    const put = enPausa();
    const { result, unmount } = await abrirDetallePedido(String(ID_PEDIDO), { [rutaCancelarPedido()]: turnos(put.turno) });
    await cancelarPedidoEn(result);
    await unmount();
    await put.soltar(tardia());
    await vaciar();
    expect(result.current).toMatchObject({ cancelando: true, aviso: null, errorCancelacion: null });
  });
});

// ── usePedidoConfirmadoViewModel + pagoPedido ────────────────────────────────────────────────

const RUTA_ESTADO = rutaEstadoPagoPedido();
const MENSAJE_NO_REVISO = 'No pudimos revisar tu pago. Si ya pagaste, no pagues de nuevo: toca Revisar mi pago.';
/** Lo que tarda el servidor simulado en responder el estado del pago en las pruebas de consultas repetidas. */
const DEMORA_MS = 100;
/** Consultas seguidas con un pago pendiente (cada 3 s durante 45 s) y con un pago que aún no aparece (9 s). */
const CONSULTAS_PENDIENTE = 15;
const CONSULTAS_SIN_PAGO = 3;

interface OpcionesConfirmacion {
  id?: string;
  pagar?: boolean;
  revisar?: boolean;
  desdeDetalle?: boolean;
}

async function abrirConfirmacion(rutas: Rutas = {}, opciones: OpcionesConfirmacion = {}) {
  const llamadas = servidor(rutas);
  const hook = await renderHook(() =>
    usePedidoConfirmadoViewModel(opciones.id ?? String(ID_PEDIDO), opciones.pagar, opciones.revisar, opciones.desdeDetalle),
  );
  await waitFor(() => expect(hook.result.current.estado).not.toBe('cargando'));
  return { ...hook, llamadas };
}

const consultasDe = (llamadas: Llamada[]) => veces(llamadas, RUTA_ESTADO);
const sinConsultas = (r: Ref<PedidoConfirmadoViewModel>) => waitFor(() => expect(r.current.consultando).toBe(false));

/** Estado del pago que el servidor responde con una pequeña demora (como en el teléfono). */
const pagoTardado = (estado: string): Turno => () =>
  new Promise<Response>((resolver) => {
    setTimeout(() => resolver(respuesta(estadoPagoPedidoCrudo(estado))), DEMORA_MS);
  });

describe('usePedidoConfirmadoViewModel: carga', () => {
  it.each<[string, PedidoCrudo, VistaPedido]>([
    ['apartado (pago al recoger)', pedidoApartado(), 'apartado'],
    ['en línea cancelado', pedidoCrudo({ estado: 'cancelado' }), 'cancelado'],
    ['en línea ya pagado', pedidoPagado(), 'aprobado'],
  ])('pedido %s: su vista sin consultar el pago ni ofrecer pagar', async (_caso, pedido, vista) => {
    const { result, llamadas } = await abrirConfirmacion(rutasPedidos([pedido]), { id: String(pedido.id) });
    await vaciar();
    expect(result.current).toMatchObject({ estado: 'listo', vista, puedePagar: false, limite: null, consultando: false, pagoEnProceso: false });
    expect(veces(llamadas, rutaEstadoPagoPedido(pedido.id))).toBe(0);
  });

  it('en línea por pagar: consulta el pago una vez y ofrece pagar con su plazo', async () => {
    const pago = enPausa();
    const { result, llamadas } = await abrirConfirmacion({ [RUTA_ESTADO]: turnos(pago.turno) });
    expect(result.current).toMatchObject({ vista: 'consultando', consultando: true, puedePagar: false });
    await pago.soltar(respuesta(estadoPagoPedidoCrudo('sin_pago')));
    await sinConsultas(result);
    expect(result.current).toMatchObject({
      vista: 'noCompletado',
      puedePagar: true,
      pagoPorConfirmar: false,
      rechazado: false,
      errorPago: null,
      errorConsulta: null,
    });
    expect(result.current.limite).toBe(limitePagoPedido(pedidoNormalizado()));
    expect(result.current.limite).toMatch(/^martes 20 de octubre, /);
    await avanzar(10_000);
    expect(consultasDe(llamadas)).toBe(1);
    expect(navegador()).not.toHaveBeenCalled();
  });

  it.each<[string, Turno, string]>([
    ['sin red', sinRed, MENSAJE_SIN_CONEXION],
    ['un 500', falla(ERRORES.interno), MENSAJE_NO_REVISO],
  ])('si la consulta del pago falla (%s) avisa y no ofrece pagar; revisar de nuevo la repite', async (_caso, error, mensaje) => {
    const { result } = await abrirConfirmacion({ [RUTA_ESTADO]: turnos(error, pagoComo('aprobado')) });
    await waitFor(() => expect(result.current.errorConsulta).toBe(mensaje));
    expect(result.current).toMatchObject({ vista: 'porPagar', puedePagar: false, consultando: false });
    await hacer(() => result.current.revisarDeNuevo());
    await waitFor(() => expect(result.current.vista).toBe('aprobado'));
    expect(result.current.errorConsulta).toBeNull();
  });

  it.each<[string, Rutas, OpcionesConfirmacion, string]>([
    ['404', { [rutaPedido()]: turnos(falla(ERRORES_PEDIDOS.pedidoNoEncontrado), pedidoComo(pedidoApartado({ id: ID_PEDIDO }))) }, {}, 'noEncontrado'],
    ['sin red', { [rutaPedido()]: turnos(sinRed, pedidoComo(pedidoApartado({ id: ID_PEDIDO }))) }, {}, 'error'],
  ])('%s: estado %s sin pedido; recargar lo trae', async (_caso, rutas, opciones, estado) => {
    const { result } = await abrirConfirmacion(rutas, opciones);
    expect(result.current).toMatchObject({ estado, pedido: null, vista: 'apartado' });
    await hacer(() => result.current.recargar());
    await esperarEstado(result, 'listo');
  });

  it('id vacío: noEncontrado sin pedir nada; pagar no hace nada', async () => {
    const { result, llamadas } = await abrirConfirmacion({}, { id: '  ' });
    await hacer(() => result.current.pagar());
    await vaciar();
    expect(result.current.estado).toBe('noEncontrado');
    expect(llamadas).toHaveLength(0);
  });
});

describe('usePedidoConfirmadoViewModel: pagar con Mercado Pago', () => {
  it('?pagar=1: revisa el pago, pide la preferencia y abre Mercado Pago una sola vez; al volver aprobado lo muestra pagado', async () => {
    navegador().mockResolvedValueOnce({ type: 'success', url: deepLinkPedido() });
    const { result, llamadas, rerender } = await abrirConfirmacion(
      { [RUTA_ESTADO]: turnos(pagoComo('sin_pago'), pagoComo('aprobado')) },
      { pagar: true },
    );
    await waitFor(() => expect(result.current.vista).toBe('aprobado'));
    expect(navegador()).toHaveBeenCalledTimes(1);
    expect(navegador()).toHaveBeenCalledWith(INIT_POINT_PEDIDO, REDIRECCION_PEDIDO);
    expect(cuerposEn(llamadas, RUTA_PREFERENCIA_PEDIDO)).toEqual([{ pedidoId: ID_PEDIDO }]);
    expect(consultasDe(llamadas)).toBe(2);
    expect(result.current).toMatchObject({ abriendo: false, consultando: false, puedePagar: false, limite: null });
    expect(result.current.pedido?.estado).toBe('pagado');
    // La espera del regreso por AppState se soltó: solo queda el oyente de la pantalla.
    expect(oyentesApp).toHaveLength(1);

    // Volver a pintar o recargar no abre otro pago: solo consulta.
    await rerender({});
    await hacer(() => result.current.recargar());
    await esperarEstado(result, 'listo');
    await vaciar();
    expect(navegador()).toHaveBeenCalledTimes(1);
    expect(veces(llamadas, RUTA_PREFERENCIA_PEDIDO)).toBe(1);
    expect(consultasDe(llamadas)).toBe(3);
  });

  it('?pagar=1 con un pago en proceso: nunca pide preferencia ni abre otro pago y consulta cada 3 s hasta su límite', async () => {
    const { result, llamadas } = await abrirConfirmacion({ [RUTA_ESTADO]: turnos(pagoTardado('pendiente')) }, { pagar: true });
    await waitFor(() => expect(result.current.vista).toBe('pendiente'));
    expect(result.current).toMatchObject({ pagoEnProceso: true, puedePagar: false, limite: null, abriendo: false });
    await avanzar(1_000, 60);
    expect(result.current.consultando).toBe(false);
    // La revisión previa al pago más las consultas seguidas.
    expect(consultasDe(llamadas)).toBe(1 + CONSULTAS_PENDIENTE);

    // Tocar pagar con el pago en proceso solo vuelve a revisar: no se trata como no pagado.
    await hacer(() => result.current.pagar());
    await avanzar(DEMORA_MS, 3);
    expect(result.current).toMatchObject({ vista: 'pendiente', pagoEnProceso: true, consultando: true });
    expect(veces(llamadas, RUTA_PREFERENCIA_PEDIDO)).toBe(0);
    expect(navegador()).not.toHaveBeenCalled();
  });

  it('pago en revisión: vista revision en proceso, sin repetir consultas; revisar de nuevo consulta una vez más', async () => {
    const { result, llamadas } = await abrirConfirmacion({ [RUTA_ESTADO]: turnos(pagoComo('revision')) });
    await sinConsultas(result);
    expect(result.current).toMatchObject({ vista: 'revision', pagoEnProceso: true, puedePagar: false, limite: null });
    await hacer(() => result.current.revisarDeNuevo());
    await sinConsultas(result);
    await avanzar(10_000);
    expect(consultasDe(llamadas)).toBe(2);
  });

  it('pago rechazado al volver: lo dice y deja reintentar con otra preferencia', async () => {
    const { result, llamadas } = await abrirConfirmacion(
      { [RUTA_ESTADO]: turnos(pagoComo('sin_pago'), pagoComo('rechazado'), pagoComo('rechazado'), pagoComo('aprobado')) },
      { pagar: true },
    );
    await waitFor(() => expect(result.current.rechazado).toBe(true));
    expect(result.current).toMatchObject({ vista: 'noCompletado', puedePagar: true, pagoPorConfirmar: false });
    await hacer(() => result.current.pagar());
    await waitFor(() => expect(result.current.vista).toBe('aprobado'));
    expect(navegador()).toHaveBeenCalledTimes(2);
    expect(veces(llamadas, RUTA_PREFERENCIA_PEDIDO)).toBe(2);
  });

  it.each<[string, OpcionesConfirmacion, number, number]>([
    ['al volver de pagar (?pagar=1)', { pagar: true }, 1 + CONSULTAS_SIN_PAGO, 1],
    ['al abrir con ?retorno=mp', { revisar: true }, CONSULTAS_SIN_PAGO, 0],
  ])('sin pago %s: consulta pocas veces con texto neutro y después pide revisar antes de pagar otra vez', async (_caso, opciones, consultas, aperturas) => {
    const { result, llamadas } = await abrirConfirmacion({ [RUTA_ESTADO]: turnos(pagoTardado('sin_pago')) }, opciones);
    await avanzar(DEMORA_MS, 3);
    expect(result.current).toMatchObject({ vista: 'consultando', consultando: true, puedePagar: false });
    await avanzar(1_000, 15);
    expect(result.current).toMatchObject({ consultando: false, vista: 'noCompletado', pagoPorConfirmar: true, puedePagar: true });
    expect(consultasDe(llamadas)).toBe(consultas);
    expect(navegador()).toHaveBeenCalledTimes(aperturas);
  });

  it.each<[string, CuerpoError, Partial<PedidoConfirmadoViewModel>]>([
    [
      'plazo vencido (409): ya no ofrece pagar ni el plazo',
      ERRORES_PAGO_PEDIDO.vencido,
      { errorPago: 'El plazo de 24 horas para pagar terminó y el pedido se canceló. Puedes volver a hacer tu compra.', puedePagar: false, limite: null },
    ],
    [
      'pago en línea apagado (503): deja intentar más tarde',
      ERRORES_PAGO_PEDIDO.noDisponible,
      { errorPago: 'El pago en línea no está disponible por ahora. Intenta más tarde.', puedePagar: true },
    ],
  ])('preferencia con %s', async (_caso, cuerpo, esperado) => {
    const { result } = await abrirConfirmacion(
      { [RUTA_PREFERENCIA_PEDIDO]: turnos(falla(cuerpo)), [RUTA_ESTADO]: turnos(pagoComo('sin_pago')) },
      { pagar: true },
    );
    await waitFor(() => expect(result.current.errorPago).not.toBeNull());
    expect(result.current).toMatchObject({ abriendo: false, ...esperado });
    expect(navegador()).not.toHaveBeenCalled();
  });

  it('el pedido ya no está pendiente (409): lo vuelve a leer con su pago y no abre Mercado Pago', async () => {
    const { result, llamadas } = await abrirConfirmacion(
      {
        [rutaPedido()]: turnos(pedidoComo(pedidoCrudo()), pedidoComo(pedidoPagado({ id: ID_PEDIDO }))),
        [RUTA_PREFERENCIA_PEDIDO]: turnos(falla(ERRORES_PAGO_PEDIDO.noPendiente)),
        [RUTA_ESTADO]: turnos(pagoComo('sin_pago'), pagoComo('aprobado')),
      },
      { pagar: true },
    );
    await waitFor(() => expect(veces(llamadas, rutaPedido())).toBe(2));
    await waitFor(() => expect(result.current.vista).toBe('aprobado'));
    expect(result.current).toMatchObject({ errorPago: null, abriendo: false });
    expect(navegador()).not.toHaveBeenCalled();
  });

  it('si no se puede revisar el pago antes de pagar, avisa y no pide la preferencia', async () => {
    const { result, llamadas } = await abrirConfirmacion({ [RUTA_ESTADO]: turnos(sinRed) }, { pagar: true });
    await waitFor(() => expect(result.current.errorConsulta).toBe(MENSAJE_SIN_CONEXION));
    expect(result.current).toMatchObject({ abriendo: false, puedePagar: false });
    expect(veces(llamadas, RUTA_PREFERENCIA_PEDIDO)).toBe(0);
  });

  it('sin navegador: avisa, suelta la espera del regreso y no consulta', async () => {
    navegador().mockRejectedValueOnce(new Error('Sin navegador ficticio'));
    const { result, llamadas } = await abrirConfirmacion({ [RUTA_ESTADO]: turnos(pagoComo('sin_pago')) }, { pagar: true });
    await waitFor(() => expect(result.current.errorPago).toBe(MENSAJE_SIN_NAVEGADOR));
    await vaciar();
    expect(result.current).toMatchObject({ abriendo: false, consultando: false });
    expect(consultasDe(llamadas)).toBe(1);
    expect(oyentesApp).toHaveLength(1);
  });
});

describe('usePedidoConfirmadoViewModel: regreso, segundo plano y navegación', () => {
  it('si el navegador no avisa, salir a segundo plano y volver cuenta como regreso y consulta el pago', async () => {
    navegador().mockReturnValueOnce(new Promise(() => undefined));
    const { result, llamadas } = await abrirConfirmacion(
      { [RUTA_ESTADO]: turnos(pagoComo('sin_pago'), pagoComo('aprobado')) },
      { pagar: true },
    );
    await waitFor(() => expect(navegador()).toHaveBeenCalledTimes(1));
    expect(result.current.abriendo).toBe(true);
    // Mientras se abre el pago, revisar de nuevo no consulta; activa sin haber salido no es regreso.
    await hacer(() => result.current.revisarDeNuevo());
    await emitirApp('active');
    await vaciar();
    expect(consultasDe(llamadas)).toBe(1);
    await emitirApp('background');
    await emitirApp('active');
    await waitFor(() => expect(result.current.vista).toBe('aprobado'));
    expect(consultasDe(llamadas)).toBe(2);
  });

  it('las consultas se detienen al pasar la app a segundo plano (la que iba en camino sí cuenta) y revisar de nuevo las reanuda', async () => {
    const { result, llamadas } = await abrirConfirmacion({ [RUTA_ESTADO]: turnos(pagoTardado('pendiente')) }, { revisar: true });
    expect(result.current).toMatchObject({ consultando: true, vista: 'consultando' });
    await emitirApp('background');
    expect(result.current.consultando).toBe(false);
    await avanzar(1_000, 10);
    expect(result.current).toMatchObject({ consultando: false, vista: 'pendiente' });
    expect(consultasDe(llamadas)).toBe(1);

    await hacer(() => result.current.revisarDeNuevo());
    await avanzar(DEMORA_MS, 3);
    expect(result.current.consultando).toBe(true);
    // Revisar otra vez con la siguiente consulta ya programada empieza de nuevo sin duplicarla.
    await hacer(() => result.current.revisarDeNuevo());
    await avanzar(DEMORA_MS, 3);
    expect(consultasDe(llamadas)).toBe(3);
    await avanzar(1_000, 3);
    expect(consultasDe(llamadas)).toBe(4);
  });

  it.each<[string, string, () => Response]>([
    ['revisa el pago previo (responde)', RUTA_ESTADO, () => respuesta(estadoPagoPedidoCrudo('sin_pago'))],
    ['revisa el pago previo (falla)', RUTA_ESTADO, () => respuestaError(ERRORES.interno)],
    ['pide la preferencia (responde)', RUTA_PREFERENCIA_PEDIDO, () => respuesta(preferenciaPedidoCruda(), 201)],
    ['pide la preferencia (falla)', RUTA_PREFERENCIA_PEDIDO, () => respuestaError(ERRORES_PAGO_PEDIDO.noDisponible)],
  ])('cerrar la pantalla mientras %s no abre Mercado Pago ni escribe nada', async (_caso, ruta, salida) => {
    const pausa = enPausa();
    const { result, llamadas, unmount } = await abrirConfirmacion(
      { [RUTA_ESTADO]: turnos(pagoComo('sin_pago')), [ruta]: turnos(pausa.turno) },
      { pagar: true },
    );
    await waitFor(() => expect(veces(llamadas, ruta)).toBe(1));
    await unmount();
    await pausa.soltar(salida());
    await vaciar();
    expect(navegador()).not.toHaveBeenCalled();
    expect(consultasDe(llamadas)).toBe(1);
    expect(result.current).toMatchObject({ abriendo: true, errorPago: null, errorConsulta: null });
  });

  it('cerrar la pantalla con una consulta en camino no escribe su resultado', async () => {
    const { result, unmount } = await abrirConfirmacion({ [RUTA_ESTADO]: turnos(pagoTardado('aprobado')) });
    expect(result.current.consultando).toBe(true);
    await unmount();
    await avanzar(1_000, 2);
    expect(result.current).toMatchObject({ vista: 'consultando', consultando: true });
  });

  it('cerrar la pantalla con Mercado Pago abierto suelta la espera sin consultar el pago', async () => {
    navegador().mockReturnValueOnce(new Promise(() => undefined));
    const { llamadas, unmount } = await abrirConfirmacion({ [RUTA_ESTADO]: turnos(pagoComo('sin_pago')) }, { pagar: true });
    await waitFor(() => expect(navegador()).toHaveBeenCalledTimes(1));
    await unmount();
    await vaciar();
    expect(oyentesApp).toHaveLength(0);
    expect(consultasDe(llamadas)).toBe(1);
  });

  it('verMisPedidos deja la Tienda abajo y abre Mis pedidos; seguirComprando vuelve a la Tienda', async () => {
    const { result } = await abrirConfirmacion();
    await hacer(() => result.current.verMisPedidos());
    await hacer(() => result.current.seguirComprando());
    expect(router.dismissTo.mock.calls).toEqual([['/tienda'], ['/tienda']]);
    expect(router.push).toHaveBeenCalledWith('/mis-pedidos');
  });

  it.each<[string, OpcionesConfirmacion, number, string[][]]>([
    ['abierta desde el detalle regresa al detalle', { desdeDetalle: true }, 1, []],
    ['abierta desde el checkout vuelve a la Tienda', {}, 0, [['/tienda']]],
  ])('el Atrás de Android %s', async (_caso, opciones, regresos, destinos) => {
    await abrirConfirmacion({}, opciones);
    let consumido = false;
    await hacer(() => {
      consumido = atras.pulsar();
    });
    expect(consumido).toBe(true);
    expect(router.back).toHaveBeenCalledTimes(regresos);
    expect(router.dismissTo.mock.calls).toEqual(destinos);
  });
});

// ── Respuestas viejas en todos los viewmodels con recargar ───────────────────────────────────

/** Lo que estas pruebas leen de cada viewmodel: estado, recargar y el dato que debe quedar. */
interface Recargable {
  estado: string;
  recargar: () => void;
  dato: unknown;
}

const proyectar = (vm: { estado: string; recargar: () => void }, dato: unknown): Recargable => ({
  estado: vm.estado,
  recargar: vm.recargar,
  dato,
});

function useCatalogoProyectado(): Recargable {
  const vm = useCatalogoViewModel();
  return proyectar(vm, visibles(vm));
}

function useDetalleProductoProyectado(): Recargable {
  const vm = useDetalleProductoViewModel(String(SHAMPOO.id));
  return proyectar(vm, vm.producto?.id);
}

function useCarritoProyectado(): Recargable {
  const vm = useCarritoViewModel();
  return proyectar(vm, idsDe(vm.items));
}

function useCheckoutProyectado(): Recargable {
  const vm = useCheckoutViewModel();
  return proyectar(vm, idsDe(vm.items));
}

function useDetallePedidoProyectado(): Recargable {
  const vm = useDetallePedidoViewModel(String(ID_PEDIDO));
  return proyectar(vm, vm.pedido?.metodoPago);
}

function useConfirmacionProyectada(): Recargable {
  const vm = usePedidoConfirmadoViewModel(String(ID_PEDIDO));
  return proyectar(vm, vm.vista);
}

/** El pedido 701 como apartado (la carga nueva) y como pagado en línea (la vieja). */
const APARTADO_701 = pedidoComo(pedidoApartado({ id: ID_PEDIDO }));
const PAGADO_701 = pedidoComo(pedidoPagado({ id: ID_PEDIDO }));

describe.each<[string, string, () => Recargable, Turno, Turno, unknown]>([
  ['useCatalogoViewModel', RUTA_CATALOGO_TIENDA, useCatalogoProyectado, productosComo([SHAMPOO]), productosComo(productosActivos()), [301]],
  ['useDetalleProductoViewModel', rutaProducto(SHAMPOO.id), useDetalleProductoProyectado, () => respuesta(cuerpoDatoTienda(SHAMPOO)), () => respuesta(cuerpoDatoTienda(ACONDICIONADOR)), 301],
  ['useCarritoViewModel', RUTA_CARRITO, useCarritoProyectado, carritoCon([CARRITO_CRUDO[1]]), carritoCon(CARRITO_CRUDO), [ID_SHAMPOO]],
  ['useCheckoutViewModel', RUTA_CARRITO, useCheckoutProyectado, carritoCon([CARRITO_CRUDO[1]]), carritoCon(CARRITO_CRUDO), [ID_SHAMPOO]],
  ['useDetallePedidoViewModel', rutaPedido(), useDetallePedidoProyectado, APARTADO_701, PAGADO_701, 'pago_en_salon'],
  ['usePedidoConfirmadoViewModel', rutaPedido(), useConfirmacionProyectada, APARTADO_701, PAGADO_701, 'apartado'],
])('%s: respuestas viejas', (_vm, ruta, usar, nueva, vieja, esperado) => {
  it.each<[string, Turno]>([
    ['con éxito', vieja],
    ['con error', falla(ERRORES.interno)],
  ])('una carga vieja que llega tarde (%s) no pisa a la de recargar', async (_caso, tardia) => {
    const primera = enPausa();
    servidor({ [ruta]: turnos(primera.turno, nueva) });
    const { result } = await renderHook(usar);
    await hacer(() => result.current.recargar());
    await esperarEstado(result, 'listo');
    await primera.soltar((await tardia()) as Response);
    await vaciar();
    expect(result.current).toMatchObject({ estado: 'listo', dato: esperado });
  });
});
