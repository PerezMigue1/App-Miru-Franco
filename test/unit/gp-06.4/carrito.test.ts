/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { MENSAJE_SIN_CONEXION } from '@/features/auth/models/AuthModel';
import * as carritoModel from '@/features/tienda/models/carritoModel';
import {
  actualizarCantidad,
  agregarAlCarrito,
  esSinExistencias,
  itemConProblema,
  MENSAJE_SESION_TERMINADA,
  mensajeComunTienda,
  mensajeErrorCarrito,
  obtenerCarrito,
  piezasCarrito,
  quitarDelCarrito,
  totalCarrito,
  vaciarCarrito,
  type ItemCarrito,
  type ResultadoAgregar,
} from '@/features/tienda/models/carritoModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';

import {
  CLIENTA_CITAS,
  errorDe,
  llamadasDeRuta,
  simularSinRed,
  usarRelojFijo,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { respuesta, type Llamada } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import {
  ACONDICIONADOR,
  CARRITO_CRUDO,
  CATALOGO_TIENDA_CRUDO,
  carritoSimulado,
  cuerpoListaTienda,
  idItemCarrito,
  imagenProducto,
  itemCarritoCrudo,
  MENSAJES_TIENDA,
  presentacionCruda,
  RUTA_AGREGAR_CARRITO,
  RUTA_CARRITO,
  rutaCambiarCantidad,
  rutaQuitarDelCarrito,
  SHAMPOO,
  simularServidorTienda,
  type ItemCarritoCrudo,
  type ProductoCrudo,
} from '../../helpers/tiendaFicticia';
import {
  authSimulada,
  cerrarConTemporizadores,
  diferida,
  enSecuencia,
  reiniciarSimulaciones,
  servidorVm,
  sinRed,
  type LlamadaVm,
  type Salida,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-06.4 (tienda): carrito en caja blanca. El modelo src/features/tienda/models/carritoModel.ts
 * (normalizar los ítems de GET /api/carrito, agregar sumando y topando a las existencias, cambiar
 * la cantidad, quitar, vaciar, totales, ítems con problema y mensajes de error) y el Observer
 * src/features/tienda/viewmodels/usePiezasCarrito.ts con renderHook (número de la pestaña Carrito).
 * Solo se simulan fetch (http://api.test, con el carrito en memoria de tiendaFicticia) y useAuth;
 * apiClient es el real, con una sesión móvil sembrada en SecureStore. Reloj fijo en AHORA.
 */

jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());

usarRelojFijo();

const SHAMPOO_250 = SHAMPOO.presentaciones[0];
const SHAMPOO_500 = SHAMPOO.presentaciones[1];
const ID_ITEM_SHAMPOO = idItemCarrito(SHAMPOO_250.id);
const ID_ITEM_ACONDICIONADOR = idItemCarrito(ACONDICIONADOR.presentaciones[0].id);

/** Texto técnico que nunca debe llegar a la pantalla. */
const TEXTO_TECNICO = 'PrismaClientKnownRequestError: Foreign key constraint failed on the field: usuario_id';

const PIEZAS_INSUFICIENTES = 'Ya no hay suficientes piezas de este producto.';
const PRESENTACION_NO_DISPONIBLE = 'Esta presentación ya no está disponible.';
const YA_NO_ESTA = 'Este producto ya no está en tu carrito.';
const GENERICO = 'No pudimos actualizar tu carrito. Intenta de nuevo en un momento.';

/** Los dos ítems de CARRITO_CRUDO ya normalizados (el acondicionador es el más reciente). */
const ITEM_ACONDICIONADOR: ItemCarrito = {
  id: ID_ITEM_ACONDICIONADOR,
  productoId: 302,
  presentacionId: 3021,
  cantidad: 1,
  nombre: 'Acondicionador reparación',
  marca: 'Botánica Ficticia',
  tamanio: '300ml',
  imagen: imagenProducto('acondicionador'),
  precioCentavos: 38250,
  stock: 6,
  disponible: true,
};
const ITEM_SHAMPOO: ItemCarrito = {
  id: ID_ITEM_SHAMPOO,
  productoId: 301,
  presentacionId: 3011,
  cantidad: 2,
  nombre: 'Shampoo hidratante',
  marca: 'Botánica Ficticia',
  tamanio: '250ml',
  imagen: imagenProducto('shampoo-250'),
  precioCentavos: 38000,
  stock: 10,
  disponible: true,
};

/** Toda llamada del carrito sale con la sesión de la clienta. */
function conSesion(llamadas: Llamada[]): void {
  expect(llamadas.length).toBeGreaterThan(0);
  llamadas.forEach((llamada) => expect(llamada.cabeceras.Authorization).toMatch(/^Bearer /));
}

/** Cantidad de la presentación en el carrito del servidor simulado (0 si no está). */
function cantidadGuardada(carrito: { items: () => ItemCarritoCrudo[] }, presentacionId: number): number {
  return carrito.items().find((item) => item.presentacionId === presentacionId)?.cantidad ?? 0;
}

// ── Modelo ───────────────────────────────────────────────────────────────────────────────────

describe('carritoModel', () => {
  beforeEach(async () => {
    await sembrarSesion(CLIENTA_CITAS);
  });

  /** Lo que la app arma con esos ítems crudos de GET /api/carrito. */
  function normalizar(crudos: unknown[]): Promise<ItemCarrito[]> {
    simularServidorTienda({ [RUTA_CARRITO]: () => respuesta(cuerpoListaTienda(crudos)) });
    return obtenerCarrito();
  }

  describe('obtenerCarrito: carrito de la clienta (GET /api/carrito)', () => {
    it('pide el carrito con la sesión y normaliza cada ítem en el orden del servidor', async () => {
      const carrito = carritoSimulado({ items: CARRITO_CRUDO });
      const llamadas = simularServidorTienda(carrito.rutas);
      await expect(obtenerCarrito()).resolves.toEqual([ITEM_ACONDICIONADOR, ITEM_SHAMPOO]);
      expect(llamadas.map((l) => `${l.metodo} ${l.ruta}`)).toEqual([RUTA_CARRITO]);
      conSesion(llamadas);
    });

    it.each<[string, unknown]>([
      ['la lista vacía', cuerpoListaTienda([])],
      ['un cuerpo sin lista', { success: true }],
      ['un cuerpo vacío', null],
    ])('responde [] con %s', async (_caso, cuerpo) => {
      simularServidorTienda({ [RUTA_CARRITO]: () => respuesta(cuerpo) });
      await expect(obtenerCarrito()).resolves.toEqual([]);
    });

    it('acepta { items: [] } y descarta lo que no es objeto', async () => {
      simularServidorTienda({ [RUTA_CARRITO]: () => respuesta({ items: ['texto', null, CARRITO_CRUDO[1]] }) });
      await expect(obtenerCarrito()).resolves.toEqual([ITEM_SHAMPOO]);
    });

    const base = itemCarritoCrudo(SHAMPOO, 2);
    it.each<[string, Record<string, unknown>, Partial<ItemCarrito> | null]>([
      ['id 0', { id: 0 }, null],
      ['id no numérico', { id: 'abc' }, null],
      ['ítem inactivo', { activo: false }, null],
      ['sin producto ni productoId', { productoId: undefined, producto: null }, null],
      ['sin presentación ni presentacionId', { presentacionId: undefined, presentacion: null }, null],
      ['productoId tomado del producto', { productoId: undefined }, { productoId: 301 }],
      ['presentacionId tomado de la presentación', { presentacionId: undefined }, { presentacionId: 3011 }],
      ['cantidad 0', { cantidad: 0 }, { cantidad: 1 }],
      ['cantidad con decimales', { cantidad: 2.5 }, { cantidad: 1 }],
      ['cantidad como texto', { cantidad: '3' }, { cantidad: 3 }],
      ['precio de la presentación antes que el de referencia', { precioReferencia: '100' }, { precioCentavos: 38000 }],
      [
        'precio de referencia si la presentación no tiene precio',
        { presentacion: presentacionCruda({ id: 3011, precio: '0' }), precioReferencia: '199.50' },
        { precioCentavos: 19950 },
      ],
      [
        'sin la fila de la presentación',
        { presentacion: null, precioReferencia: '$1,200' },
        { tamanio: '', stock: 0, disponible: false, precioCentavos: 120000, imagen: undefined },
      ],
      ['existencias negativas', { presentacion: presentacionCruda({ id: 3011, stock: -2 }) }, { stock: 0 }],
      ['existencias con decimales', { presentacion: presentacionCruda({ id: 3011, stock: 4.8 }) }, { stock: 4 }],
      ['presentación no disponible', { presentacion: presentacionCruda({ id: 3011, disponible: false }) }, { disponible: false }],
      [
        'imagen que no es https',
        { presentacion: presentacionCruda({ id: 3011, imagenes: ['http://res.cloudinary.com/ficticio/inseguro.jpg'] }) },
        { imagen: undefined },
      ],
    ])('normaliza: %s', async (_caso, cambios, esperado) => {
      const [item] = await normalizar([{ ...base, ...cambios }]);
      if (esperado === null) {
        expect(item).toBeUndefined();
      } else {
        expect(item).toMatchObject(esperado);
      }
    });
  });

  describe('agregarAlCarrito: lee el carrito, suma y topa a las existencias (POST /api/carrito)', () => {
    it.each<[string, number, number, number, ResultadoAgregar, number | null]>([
      ['carrito vacío', 0, 2, 10, { agregadas: 2, cantidadEnCarrito: 2, topado: false }, 2],
      ['suma lo que ya había', 2, 3, 10, { agregadas: 3, cantidadEnCarrito: 5, topado: false }, 5],
      ['topa a las existencias', 2, 5, 4, { agregadas: 2, cantidadEnCarrito: 4, topado: true }, 4],
      ['ya estaban todas las existencias', 4, 1, 4, { agregadas: 0, cantidadEnCarrito: 4, topado: true }, null],
      ['sin existencias', 0, 1, 0, { agregadas: 0, cantidadEnCarrito: 0, topado: true }, null],
      ['bajaron las existencias por debajo de lo que había', 6, 1, 4, { agregadas: 0, cantidadEnCarrito: 6, topado: true }, null],
      ['cantidad 0 cuenta como 1', 0, 0, 10, { agregadas: 1, cantidadEnCarrito: 1, topado: false }, 1],
      ['cantidad con decimales hacia abajo', 1, 2.7, 10, { agregadas: 2, cantidadEnCarrito: 3, topado: false }, 3],
    ])('%s', async (_caso, enCarrito, cantidad, stock, esperado, enviada) => {
      // Otra presentación del mismo producto ya en el carrito: no se suma a la del shampoo de 250ml.
      const otra = itemCarritoCrudo(SHAMPOO, 3, { presentacion: SHAMPOO_500 });
      const items = enCarrito > 0 ? [otra, itemCarritoCrudo(SHAMPOO, enCarrito)] : [otra];
      const carrito = carritoSimulado({ items });
      const llamadas = simularServidorTienda(carrito.rutas);

      const resultado = await agregarAlCarrito({ productoId: 301, presentacionId: SHAMPOO_250.id, cantidad, stock });

      expect(resultado).toEqual(esperado);
      conSesion(llamadas);
      const posts = llamadasDeRuta(llamadas, RUTA_AGREGAR_CARRITO);
      expect(posts.map((l) => l.cuerpo)).toEqual(
        enviada === null ? [] : [{ productoId: 301, presentacionId: SHAMPOO_250.id, cantidad: enviada }],
      );
      expect(cantidadGuardada(carrito, SHAMPOO_250.id)).toBe(esperado.cantidadEnCarrito);
      expect(cantidadGuardada(carrito, SHAMPOO_500.id)).toBe(3);
    });

    it.each<[string, ProductoCrudo[], number, string]>([
      ['la presentación ya no existe', CATALOGO_TIENDA_CRUDO, 9999, MENSAJES_TIENDA.presentacionNoEncontrada],
      [
        'la presentación no está disponible',
        [{ ...SHAMPOO, presentaciones: [{ ...SHAMPOO_250, disponible: false }] }],
        SHAMPOO_250.id,
        MENSAJES_TIENDA.presentacionNoDisponible,
      ],
    ])('un 400 porque %s llega como ApiError y se explica sin el texto del servidor', async (_caso, catalogo, presentacionId, mensaje) => {
      const carrito = carritoSimulado({ catalogo });
      simularServidorTienda(carrito.rutas);
      const error = await errorDe(agregarAlCarrito({ productoId: 301, presentacionId, cantidad: 1, stock: 10 }));
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 400, message: mensaje });
      expect(mensajeErrorCarrito(error)).toBe(PRESENTACION_NO_DISPONIBLE);
      expect(carrito.items()).toEqual([]);
    });

    it('sin red al leer el carrito no envía nada', async () => {
      simularSinRed();
      expect(await errorDe(agregarAlCarrito({ productoId: 301, presentacionId: 3011, cantidad: 1, stock: 10 }))).toBeInstanceOf(
        ErrorDeRed,
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('actualizarCantidad, quitarDelCarrito y vaciarCarrito', () => {
    it.each<[number, number]>([
      [3, 3],
      [0, 1],
      [-2, 1],
      [2.9, 2],
    ])('actualizarCantidad(%p) envía { cantidad: %p } al PUT del ítem', async (cantidad, enviada) => {
      const carrito = carritoSimulado({ items: CARRITO_CRUDO });
      const llamadas = simularServidorTienda(carrito.rutas);
      await expect(actualizarCantidad(ID_ITEM_SHAMPOO, cantidad)).resolves.toBeUndefined();
      expect(llamadas.map((l) => [`${l.metodo} ${l.ruta}`, l.cuerpo])).toEqual([
        [rutaCambiarCantidad(ID_ITEM_SHAMPOO), { cantidad: enviada }],
      ]);
      conSesion(llamadas);
      expect(cantidadGuardada(carrito, SHAMPOO_250.id)).toBe(enviada);
    });

    it.each<[string, () => Promise<void>, number, string]>([
      ['actualizarCantidad con más piezas que las existencias (403)', () => actualizarCantidad(ID_ITEM_SHAMPOO, 11), 403, PIEZAS_INSUFICIENTES],
      ['actualizarCantidad de un ítem que ya no existe (404)', () => actualizarCantidad(99, 1), 404, YA_NO_ESTA],
      ['quitarDelCarrito de un ítem que ya no existe (404)', () => quitarDelCarrito(ID_ITEM_ACONDICIONADOR), 404, YA_NO_ESTA],
    ])('%s se explica a la clienta', async (_caso, llamar, status, mensaje) => {
      const carrito = carritoSimulado({ items: [CARRITO_CRUDO[1]] });
      simularServidorTienda(carrito.rutas);
      const error = await errorDe(llamar());
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status });
      expect(mensajeErrorCarrito(error)).toBe(mensaje);
      expect(cantidadGuardada(carrito, SHAMPOO_250.id)).toBe(2);
    });

    it('quitarDelCarrito manda DELETE con el id del ítem y el servidor lo quita', async () => {
      const carrito = carritoSimulado({ items: CARRITO_CRUDO });
      const llamadas = simularServidorTienda(carrito.rutas);
      await expect(quitarDelCarrito(ID_ITEM_ACONDICIONADOR)).resolves.toBeUndefined();
      expect(llamadas.map((l) => [`${l.metodo} ${l.ruta}`, l.cuerpo])).toEqual([
        [rutaQuitarDelCarrito(ID_ITEM_ACONDICIONADOR), undefined],
      ]);
      conSesion(llamadas);
      expect(carrito.items().map((item) => item.id)).toEqual([ID_ITEM_SHAMPOO]);
    });

    it('vaciarCarrito quita cada ítem y no lanza aunque uno falle', async () => {
      const carrito = carritoSimulado({ items: CARRITO_CRUDO });
      const llamadas = simularServidorTienda(carrito.rutas);
      await expect(vaciarCarrito([ID_ITEM_SHAMPOO, 99, ID_ITEM_ACONDICIONADOR])).resolves.toBeUndefined();
      expect(llamadas.map((l) => `${l.metodo} ${l.ruta}`).sort()).toEqual(
        [rutaQuitarDelCarrito(ID_ITEM_SHAMPOO), rutaQuitarDelCarrito(99), rutaQuitarDelCarrito(ID_ITEM_ACONDICIONADOR)].sort(),
      );
      expect(carrito.items()).toEqual([]);
    });

    it('vaciarCarrito no lanza sin red ni llama con la lista vacía', async () => {
      simularSinRed();
      await expect(vaciarCarrito([ID_ITEM_SHAMPOO])).resolves.toBeUndefined();
      await expect(vaciarCarrito([])).resolves.toBeUndefined();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('totales e ítems con problema', () => {
    it.each<[string, ItemCarrito[], number, number]>([
      ['el carrito de ejemplo', [ITEM_ACONDICIONADOR, ITEM_SHAMPOO], 38250 + 2 * 38000, 3],
      ['un ítem sin precio', [{ ...ITEM_SHAMPOO, precioCentavos: 0 }], 0, 2],
      ['el carrito vacío', [], 0, 0],
    ])('totalCarrito y piezasCarrito con %s', (_caso, items, total, piezas) => {
      expect(totalCarrito(items)).toBe(total);
      expect(piezasCarrito(items)).toBe(piezas);
    });

    it.each<[string, Partial<ItemCarrito>, boolean]>([
      ['comprable', {}, false],
      ['cantidad igual a las existencias', { cantidad: 10 }, false],
      ['no disponible', { disponible: false }, true],
      ['sin existencias', { stock: 0 }, true],
      ['sin precio', { precioCentavos: 0 }, true],
      ['cantidad mayor a las existencias', { cantidad: 11 }, true],
    ])('itemConProblema: %s', (_caso, cambios, esperado) => {
      expect(itemConProblema({ ...ITEM_SHAMPOO, ...cambios })).toBe(esperado);
    });
  });

  describe('mensajes de error', () => {
    it.each<[string, unknown, string | null]>([
      ['sin red', new ErrorDeRed(), MENSAJE_SIN_CONEXION],
      ['status 0', new ApiError(0, TEXTO_TECNICO), MENSAJE_SIN_CONEXION],
      ['sesión terminada (401)', new ApiError(401, TEXTO_TECNICO), MENSAJE_SESION_TERMINADA],
      ['error del servidor', new ApiError(500, TEXTO_TECNICO), null],
      ['error que no es de la API', new Error(TEXTO_TECNICO), null],
      ['nada', undefined, null],
    ])('mensajeComunTienda: %s', (_caso, error, esperado) => {
      expect(mensajeComunTienda(error)).toBe(esperado);
    });

    it.each<[string, unknown, boolean]>([
      ['403 Stock insuficiente del PUT', new ApiError(403, MENSAJES_TIENDA.stockInsuficiente), true],
      ['400 de pedido sin stock', new ApiError(400, 'Stock insuficiente para Shampoo hidratante'), true],
      ['403 por otra causa', new ApiError(403, 'Forbidden resource'), false],
      ['409 que menciona stock', new ApiError(409, 'stock'), false],
      ['error que no es de la API', new Error('stock'), false],
    ])('esSinExistencias: %s', (_caso, error, esperado) => {
      expect(esSinExistencias(error)).toBe(esperado);
    });

    it.each<[string, unknown, string]>([
      ['sin red', new ErrorDeRed(), MENSAJE_SIN_CONEXION],
      ['sesión terminada', new ApiError(401, TEXTO_TECNICO), MENSAJE_SESION_TERMINADA],
      ['403 Stock insuficiente', new ApiError(403, MENSAJES_TIENDA.stockInsuficiente), PIEZAS_INSUFICIENTES],
      ['400 Presentación no encontrada', new ApiError(400, MENSAJES_TIENDA.presentacionNoEncontrada), PRESENTACION_NO_DISPONIBLE],
      ['400 Presentación no disponible', new ApiError(400, MENSAJES_TIENDA.presentacionNoDisponible), PRESENTACION_NO_DISPONIBLE],
      ['404 Ítem no encontrado', new ApiError(404, MENSAJES_TIENDA.itemNoEncontrado), YA_NO_ESTA],
      ['400 técnico', new ApiError(400, TEXTO_TECNICO), GENERICO],
      ['500 técnico', new ApiError(500, TEXTO_TECNICO), GENERICO],
      ['error que no es de la API', new Error(TEXTO_TECNICO), GENERICO],
    ])('mensajeErrorCarrito: %s, nunca con el texto del servidor', (_caso, error, esperado) => {
      const mensaje = mensajeErrorCarrito(error);
      expect(mensaje).toBe(esperado);
      expect(mensaje).not.toContain(TEXTO_TECNICO);
    });
  });
});

// ── usePiezasCarrito (Observer) ──────────────────────────────────────────────────────────────

type ModuloPiezas = typeof import('@/features/tienda/viewmodels/usePiezasCarrito');

/**
 * usePiezasCarrito guarda el número, la cuenta y la lectura en camino a nivel de módulo. Cada prueba
 * lo carga de nuevo con jest.isolateModules para empezar en limpio, pero con las mismas instancias
 * de React, react-native, useAuth (simulado) y carritoModel que usa la prueba.
 */
function cargarPiezasEnLimpio(): ModuloPiezas {
  const compartidos: Record<string, unknown> = {
    react: jest.requireActual('react'),
    'react-native': jest.requireActual('react-native'),
    '@/features/auth/viewmodels/useAuth': jest.requireMock('@/features/auth/viewmodels/useAuth'),
    '@/features/tienda/models/carritoModel': carritoModel,
  };
  let modulo: ModuloPiezas | undefined;
  jest.isolateModules(() => {
    for (const [nombre, valor] of Object.entries(compartidos)) {
      jest.doMock(nombre, () => valor);
    }
    modulo = require('@/features/tienda/viewmodels/usePiezasCarrito') as ModuloPiezas;
  });
  if (!modulo) throw new Error('No se cargó usePiezasCarrito');
  return modulo;
}

describe('usePiezasCarrito: número de la pestaña Carrito', () => {
  const OTRA_CLIENTA = { ...CLIENTA_CITAS, id: '42', nombre: 'Otra Clienta Ficticia', email: 'otra@ejemplo.test' };

  let piezas: ModuloPiezas;
  let llamadas: LlamadaVm[];
  let oyentesApp: ((estado: AppStateStatus) => void)[];
  let quitarOyente: jest.Mock;
  let espiaApp: jest.SpyInstance;

  type Turno = () => Salida;
  const carritoCon = (...cantidades: number[]): Turno => () =>
    respuesta(cuerpoListaTienda(cantidades.map((cantidad, i) => itemCarritoCrudo(CATALOGO_TIENDA_CRUDO[i], cantidad))));

  /** Cada lectura de GET /api/carrito toma el siguiente turno (el último se repite). */
  function servidorCarrito(...turnos: Turno[]): void {
    llamadas = servidorVm({ [RUTA_CARRITO]: enSecuencia(...turnos) });
  }

  const lecturas = () => llamadasDeRuta(llamadas, RUTA_CARRITO).length;

  /** Deja correr las lecturas pendientes. */
  async function asentar(): Promise<void> {
    await act(async () => {
      for (let i = 0; i < 4; i++) {
        await jest.advanceTimersByTimeAsync(1);
      }
    });
  }

  /** Monta el número y guarda cada valor que pintó. */
  async function montar() {
    const vistos: number[] = [];
    const hook = await renderHook(() => {
      const n = piezas.usePiezasCarrito();
      vistos.push(n);
      return n;
    });
    return { ...hook, vistos };
  }

  /** Corre una acción del módulo dentro de act. */
  const hacer = (accion: () => void) => act(async () => accion());

  function enPausa(): { turno: Turno; soltar: (r: Response) => Promise<void> } {
    const pendiente = diferida();
    return { turno: () => pendiente.promesa, soltar: (r) => act(async () => pendiente.soltar(r)) };
  }

  beforeEach(async () => {
    reiniciarSimulaciones();
    await sembrarSesion(CLIENTA_CITAS);
    authSimulada.estado = 'autenticado';
    authSimulada.usuario = CLIENTA_CITAS;
    piezas = cargarPiezasEnLimpio();
    oyentesApp = [];
    quitarOyente = jest.fn();
    espiaApp = jest.spyOn(AppState, 'addEventListener').mockImplementation((_evento, oyente) => {
      const registrado = oyente as (estado: AppStateStatus) => void;
      oyentesApp.push(registrado);
      return {
        remove: () => {
          quitarOyente();
          oyentesApp = oyentesApp.filter((o) => o !== registrado);
        },
      };
    });
  });

  afterEach(() => {
    espiaApp.mockRestore();
  });

  // Ninguna prueba debe dejar avisos de act() ni errores en consola.
  espiarConsola(cerrarConTemporizadores, true);

  it.each<['anonimo' | 'cargando']>([['anonimo'], ['cargando']])(
    'sin sesión (%s) es 0, no lee el carrito e ignora lo publicado',
    async (estado) => {
      authSimulada.estado = estado;
      authSimulada.usuario = null;
      servidorCarrito(carritoCon(3));
      const { result } = await montar();
      await hacer(() => piezas.publicarPiezasCarrito(5));
      await hacer(() => piezas.avisarCambioCarrito());
      await asentar();
      expect(result.current).toBe(0);
      expect(lecturas()).toBe(0);
    },
  );

  it('con sesión lee al montar, con la sesión de la clienta, y suma las piezas', async () => {
    servidorCarrito(carritoCon(2, 1));
    const { result } = await montar();
    await waitFor(() => expect(result.current).toBe(3));
    expect(lecturas()).toBe(1);
    conSesion(llamadas);
  });

  it('publicar avisa a todos los suscriptores sin otra lectura (y nunca baja de 0)', async () => {
    servidorCarrito(carritoCon(3));
    const barra = await montar();
    const pantalla = await montar();
    await waitFor(() => expect(lecturas()).toBe(2));
    await asentar();
    expect([barra.result.current, pantalla.result.current]).toEqual([3, 3]);

    await hacer(() => piezas.publicarPiezasCarrito(7));
    expect([barra.result.current, pantalla.result.current]).toEqual([7, 7]);
    await hacer(() => piezas.publicarPiezasCarrito(-2));
    expect([barra.result.current, pantalla.result.current]).toEqual([0, 0]);
    expect(lecturas()).toBe(2);
  });

  it('avisarCambioCarrito vuelve a leer y pinta el número nuevo', async () => {
    servidorCarrito(carritoCon(3), carritoCon(5));
    const { result } = await montar();
    await waitFor(() => expect(result.current).toBe(3));
    await hacer(() => piezas.avisarCambioCarrito());
    await waitFor(() => expect(result.current).toBe(5));
    expect(lecturas()).toBe(2);
  });

  it('una sola lectura a la vez: lo pedido mientras tanto sale una vez al terminar', async () => {
    const primera = enPausa();
    servidorCarrito(primera.turno, carritoCon(5));
    const { result } = await montar();
    await hacer(() => {
      piezas.avisarCambioCarrito();
      piezas.avisarCambioCarrito();
      piezas.avisarCambioCarrito();
    });
    await asentar();
    expect(lecturas()).toBe(1);

    await primera.soltar(carritoCon(2)() as Response);
    await waitFor(() => expect(result.current).toBe(5));
    await asentar();
    expect(lecturas()).toBe(2);
  });

  it('al cambiar de cuenta descarta la lectura en camino y lee la de la cuenta nueva', async () => {
    const primera = enPausa();
    servidorCarrito(primera.turno, carritoCon(2));
    const { result, rerender, vistos } = await montar();
    authSimulada.usuario = OTRA_CLIENTA;
    await rerender({});
    await primera.soltar(carritoCon(9)() as Response);
    await waitFor(() => expect(result.current).toBe(2));
    await asentar();
    expect(vistos).not.toContain(9);
    expect(lecturas()).toBe(2);
  });

  it('al cerrar sesión vuelve a 0 sin leer', async () => {
    servidorCarrito(carritoCon(3));
    const { result, rerender } = await montar();
    await waitFor(() => expect(result.current).toBe(3));
    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    await rerender({});
    await asentar();
    expect(result.current).toBe(0);
    expect(lecturas()).toBe(1);
  });

  it('al volver a primer plano vuelve a leer; en segundo plano no, y al desmontar deja de escuchar', async () => {
    servidorCarrito(carritoCon(3), carritoCon(4));
    const { result, unmount } = await montar();
    await waitFor(() => expect(result.current).toBe(3));

    await hacer(() => oyentesApp.forEach((oyente) => oyente('background')));
    await asentar();
    expect(lecturas()).toBe(1);

    await hacer(() => oyentesApp.forEach((oyente) => oyente('active')));
    await waitFor(() => expect(result.current).toBe(4));
    expect(lecturas()).toBe(2);

    await unmount();
    expect(quitarOyente).toHaveBeenCalledTimes(1);
    expect(oyentesApp).toHaveLength(0);
  });

  it.each<[string, Turno]>([
    ['sin red', sinRed],
    ['con error del servidor', () => respuesta({ message: TEXTO_TECNICO }, 500)],
  ])('%s conserva el último número y se recupera en la siguiente lectura', async (_caso, falla) => {
    servidorCarrito(carritoCon(3), falla, carritoCon(6));
    const { result } = await montar();
    await waitFor(() => expect(result.current).toBe(3));
    await hacer(() => piezas.avisarCambioCarrito());
    await asentar();
    expect(lecturas()).toBe(2);
    expect(result.current).toBe(3);
    await hacer(() => piezas.avisarCambioCarrito());
    await waitFor(() => expect(result.current).toBe(6));
  });
});
