/// <reference types="jest" />

import {
  categoriasDe,
  estaAgotado,
  filtrarProductos,
  formatoPrecio,
  obtenerCatalogo,
  obtenerProducto,
  precioDesdeCentavos,
  presentacionComprable,
  presentacionInicial,
  textoPiezas,
  tienePreciosDistintos,
  type Presentacion,
  type ProductoCatalogo,
} from '@/features/tienda/models/productoModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';

import { CLIENTA_CITAS, errorDe, simularSinRed, usarRelojFijo } from '../../helpers/citasFicticias';
import { respuesta, type Llamada } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import {
  ACONDICIONADOR,
  CATALOGO_TIENDA_CRUDO,
  cuerpoDatoTienda,
  cuerpoListaTienda,
  ESMALTE,
  imagenProducto,
  MASCARILLA_AGOTADA,
  MENSAJES_TIENDA,
  PRODUCTO_INACTIVO,
  presentacionCruda,
  productoCrudo,
  RUTA_CATALOGO_TIENDA,
  rutaProducto,
  SHAMPOO,
  simularServidorTienda,
} from '../../helpers/tiendaFicticia';

/**
 * GP-06.4 (tienda): modelo de productos en src/features/tienda/models/productoModel.ts, en caja
 * blanca. Catálogo y detalle públicos (GET /api/productos y /api/productos/:id), cómo se normalizan
 * los productos y sus presentaciones con la forma real del backend (precios Decimal como texto,
 * arreglos de Postgres, imágenes de Cloudinary), el orden con los agotados al final y las reglas
 * del catálogo (precios, presentación inicial, categorías y búsqueda). Solo fetch es simulado
 * (http://api.test); apiClient es el real.
 */

usarRelojFijo();

type Crudo = Record<string, unknown>;

/** Lo que el backend lista a la clienta: los activos de CATALOGO_TIENDA_CRUDO, en orden de id. */
const IDS_ACTIVOS_ORDENADOS = [301, 302, 305, 306, 303, 304];

/** La única llamada que recibió el servidor, sin sesión (las lecturas del catálogo son públicas). */
function llamadaPublica(llamadas: Llamada[], ruta: string): Llamada {
  expect(llamadas).toHaveLength(1);
  const [llamada] = llamadas;
  expect(`${llamada.metodo} ${llamada.ruta}`).toBe(ruta);
  expect(llamada.cabeceras.Authorization).toBeUndefined();
  expect(llamada.cuerpo).toBeUndefined();
  return llamada;
}

/** El catálogo normalizado tal como lo arma la app con lo que lista el servidor simulado. */
function catalogoCon(lista: unknown[]): Promise<ProductoCatalogo[]> {
  simularServidorTienda({ [RUTA_CATALOGO_TIENDA]: () => respuesta(cuerpoListaTienda(lista)) });
  return obtenerCatalogo();
}

/** Normaliza un solo producto crudo con el catálogo; null si la app lo descarta. */
async function normalizado(crudo: object): Promise<ProductoCatalogo | null> {
  const [producto] = await catalogoCon([crudo]);
  return producto ?? null;
}

/** La primera presentación normalizada de un producto con esa presentación cruda. */
async function presentacionDe(cambios: Crudo): Promise<Presentacion | undefined> {
  const producto = await normalizado({ ...productoCrudo(), presentaciones: [{ ...presentacionCruda(), ...cambios }] });
  return producto?.presentaciones[0];
}

/** Presentación ya normalizada, válida y comprable, con los cambios. */
function presentacion(cambios: Partial<Presentacion> = {}): Presentacion {
  return {
    id: 1,
    tamanio: '250ml',
    imagenes: [],
    precioCentavos: 38000,
    precioOriginalCentavos: null,
    stock: 5,
    disponible: true,
    ...cambios,
  };
}

/** Producto ya normalizado con esas presentaciones. */
function productoCon(presentaciones: Presentacion[], cambios: Partial<ProductoCatalogo> = {}): ProductoCatalogo {
  return {
    id: 1,
    nombre: 'Producto ficticio',
    precio: '380',
    categoria: 'Cabello',
    marca: 'Marca Ficticia',
    descripcion: '',
    descripcionLarga: '',
    descuento: 0,
    nuevo: false,
    crueltyFree: false,
    caracteristicas: [],
    ingredientes: [],
    modoUso: [],
    resultado: [],
    presentaciones,
    ...cambios,
  };
}

const AGOTADA = presentacion({ id: 2, stock: 0, precioCentavos: 30000 });
const COMPRABLE = presentacion({ id: 3, precioCentavos: 45000 });

// ── Catálogo ─────────────────────────────────────────────────────────────────────────────────

describe('obtenerCatalogo: catálogo público (GET /api/productos)', () => {
  it('es pública: no manda la sesión aunque la clienta haya iniciado sesión', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidorTienda({});
    await obtenerCatalogo();
    llamadaPublica(llamadas, RUTA_CATALOGO_TIENDA);
  });

  it('normaliza el producto completo: precios en centavos, ingredientes en líneas y la foto comprable', async () => {
    const [shampoo] = await catalogoCon([SHAMPOO]);
    expect(shampoo).toEqual({
      id: 301,
      nombre: 'Shampoo hidratante',
      precio: '380',
      categoria: 'Cabello',
      imagen: imagenProducto('shampoo-250'),
      marca: 'Botánica Ficticia',
      descripcion: 'Descripción corta ficticia',
      descripcionLarga: 'Descripción larga ficticia del producto.',
      descuento: 0,
      nuevo: false,
      crueltyFree: false,
      caracteristicas: ['Sin sulfatos', 'Uso diario'],
      ingredientes: ['Aceite de argán', 'Keratina'],
      modoUso: ['Aplicar sobre cabello húmedo.'],
      resultado: ['Cabello suave y brillante'],
      presentaciones: [
        presentacion({ id: 3011, imagenes: [imagenProducto('shampoo-250')], stock: 10 }),
        presentacion({ id: 3012, tamanio: '500ml', imagenes: [imagenProducto('shampoo-500')], precioCentavos: 62000, stock: 4 }),
      ],
    });
  });

  it('muestra solo lo que manda el backend (sin el desactivado) con los agotados y sin precio al final', async () => {
    simularServidorTienda({});
    const catalogo = await obtenerCatalogo();
    expect(catalogo.map((p) => p.id)).toEqual(IDS_ACTIVOS_ORDENADOS);
    expect(catalogo.map(estaAgotado)).toEqual([false, false, false, false, true, true]);
  });

  it.each<[string, unknown, number[]]>([
    ['la lista vacía', cuerpoListaTienda([]), []],
    ['{ productos: [] } en lugar de data', { productos: [SHAMPOO] }, [301]],
    ['un arreglo suelto', [SHAMPOO, 'texto', null], [301]],
    ['un cuerpo sin lista', { success: true, data: 'nada' }, []],
    ['un cuerpo vacío', null, []],
  ])('acepta %s', async (_caso, cuerpo, ids) => {
    simularServidorTienda({ [RUTA_CATALOGO_TIENDA]: () => respuesta(cuerpo) });
    expect((await obtenerCatalogo()).map((p) => p.id)).toEqual(ids);
  });

  it('descarta los productos sin id válido o sin nombre y acepta _id', async () => {
    const lista = [
      productoCrudo({ id: 0 }),
      { ...productoCrudo(), id: 'abc' },
      { ...productoCrudo(), id: 2.5 },
      productoCrudo({ id: 308, nombre: '   ' }),
      { ...productoCrudo(), id: undefined, _id: '309' },
      productoCrudo({ id: 310 }),
    ];
    expect((await catalogoCon(lista)).map((p) => [p.id, p.nombre])).toEqual([
      [309, 'Producto ficticio'],
      [310, 'Producto ficticio'],
    ]);
  });

  it('un error del servidor llega como ApiError y sin red como ErrorDeRed', async () => {
    simularServidorTienda({ [RUTA_CATALOGO_TIENDA]: () => respuesta({ message: 'Internal server error' }, 500) });
    expect(await errorDe(obtenerCatalogo())).toMatchObject({ status: 500 });
    simularSinRed();
    expect(await errorDe(obtenerCatalogo())).toBeInstanceOf(ErrorDeRed);
  });
});

describe('normalización de las presentaciones', () => {
  it.each<[string, Crudo, Partial<Presentacion>]>([
    ['precio con $ y comas', { precio: '$1,200.50' }, { precioCentavos: 120050 }],
    ['precio numérico', { precio: 99.9 }, { precioCentavos: 9990 }],
    ['precio que no es número', { precio: 'consultar' }, { precioCentavos: 0 }],
    ['precio negativo', { precio: '-5' }, { precioCentavos: 0 }],
    ['precioOriginal mayor', { precio: '382.5', precioOriginal: '510' }, { precioOriginalCentavos: 51000 }],
    ['precioOriginal igual', { precio: '380', precioOriginal: '380.00' }, { precioOriginalCentavos: null }],
    ['precioOriginal menor', { precio: '380', precioOriginal: '300' }, { precioOriginalCentavos: null }],
    ['precioOriginal sin precio', { precio: '0', precioOriginal: '510' }, { precioOriginalCentavos: null }],
    ['existencias negativas', { stock: -3 }, { stock: 0 }],
    ['existencias con decimales', { stock: 2.7 }, { stock: 2 }],
    ['existencias como texto', { stock: '6' }, { stock: 6 }],
    ['existencias que faltan', { stock: null }, { stock: 0 }],
    ['disponible como texto', { disponible: 'true' }, { disponible: false }],
    ['tamaño con ñ', { tamanio: undefined, ['tamaño']: '1L' }, { tamanio: '1L' }],
    ['sin tamaño', { tamanio: undefined }, { tamanio: '' }],
    [
      'imágenes que no son https',
      {
        imagenes: [
          'http://res.cloudinary.com/ficticio/inseguro.jpg',
          '',
          'https://',
          imagenProducto('valida'),
          { secure_url: imagenProducto('objeto') },
          42,
        ],
      },
      { imagenes: [imagenProducto('valida'), imagenProducto('objeto')] },
    ],
    ['imagen suelta en lugar de arreglo', { imagenes: undefined, imagen: imagenProducto('suelta') }, { imagenes: [imagenProducto('suelta')] }],
    ['sin imágenes', { imagenes: undefined }, { imagenes: [] }],
  ])('%s', async (_caso, cambios, esperado) => {
    expect(await presentacionDe(cambios)).toMatchObject(esperado);
  });

  it('descarta las presentaciones sin id válido y lo que no es objeto', async () => {
    const producto = await normalizado({
      ...productoCrudo(),
      presentaciones: [
        { ...presentacionCruda(), id: 0 },
        { ...presentacionCruda(), id: 'x' },
        { ...presentacionCruda(), id: 1.5 },
        'texto',
        null,
        presentacionCruda({ id: 3009 }),
      ],
    });
    expect(producto?.presentaciones.map((p) => p.id)).toEqual([3009]);
  });

  it('un producto sin presentaciones queda sin precio, sin foto y agotado', async () => {
    const producto = await normalizado({ ...productoCrudo(), presentaciones: undefined });
    expect(producto).toMatchObject({ presentaciones: [], precio: '', imagen: undefined });
    expect(estaAgotado(producto as ProductoCatalogo)).toBe(true);
  });
});

describe('normalización del producto', () => {
  it.each<[string, Crudo, Partial<ProductoCatalogo>]>([
    ['descuento entero', { descuento: 25 }, { descuento: 25 }],
    ['descuento con decimales', { descuento: 12.6 }, { descuento: 13 }],
    ['descuento de 100 o más', { descuento: 100 }, { descuento: 0 }],
    ['descuento negativo', { descuento: -5 }, { descuento: 0 }],
    ['descuento nulo', { descuento: null }, { descuento: 0 }],
    ['ingredientes como arreglo de Postgres', { ingredientes: '{"Agua","Aloe vera"," "}' }, { ingredientes: ['Agua', 'Aloe vera'] }],
    ['modo de uso en texto normal', { modoUso: 'Aplicar en medios y puntas.' }, { modoUso: ['Aplicar en medios y puntas.'] }],
    ['resultado como arreglo vacío', { resultado: '{}' }, { resultado: [] }],
    ['características con valores que no son texto', { caracteristicas: ['Vegano', 3, null, ' '] }, { caracteristicas: ['Vegano', '3'] }],
    ['características que no son arreglo', { caracteristicas: 'Vegano' }, { caracteristicas: [] }],
    ['marcas booleanas como texto', { nuevo: 'true', crueltyFree: 1 }, { nuevo: false, crueltyFree: false }],
    ['marcas booleanas reales', { nuevo: true, crueltyFree: true }, { nuevo: true, crueltyFree: true }],
    ['textos nulos', { descripcion: null, descripcionLarga: null, categoria: null }, { descripcion: '', descripcionLarga: '', categoria: '' }],
  ])('%s', async (_caso, cambios, esperado) => {
    expect(await normalizado({ ...productoCrudo(), ...cambios })).toMatchObject(esperado);
  });

  it.each<[string, object, Partial<ProductoCatalogo>]>([
    ['el menor de las comprables', SHAMPOO, { precio: '380' }],
    ['con centavos', ACONDICIONADOR, { precio: '382.5' }],
    ['el de las agotadas si ninguna se puede comprar', MASCARILLA_AGOTADA, { precio: '450' }],
    [
      'el de la comprable aunque la agotada sea más barata, con su foto',
      productoCrudo({
        presentaciones: [
          presentacionCruda({ id: 1, precio: '100', stock: 0, imagenes: [imagenProducto('agotada')] }),
          presentacionCruda({ id: 2, precio: '250', imagenes: [imagenProducto('comprable')] }),
        ],
      }),
      { precio: '250', imagen: imagenProducto('comprable') },
    ],
    [
      'la foto de cualquier presentación si la comprable no tiene',
      productoCrudo({
        presentaciones: [
          presentacionCruda({ id: 1, imagenes: [] }),
          presentacionCruda({ id: 2, stock: 0, imagenes: [imagenProducto('agotada')] }),
        ],
      }),
      { imagen: imagenProducto('agotada') },
    ],
  ])('precio y foto de la tarjeta: %s', async (_caso, crudo, esperado) => {
    expect(await normalizado(crudo)).toMatchObject(esperado);
  });
});

// ── Detalle ──────────────────────────────────────────────────────────────────────────────────

describe('obtenerProducto: detalle público (GET /api/productos/:id)', () => {
  it.each<[string, string | number]>([
    ['texto', 'abc'],
    ['cero', 0],
    ['negativo', -3],
    ['con decimales', '2.5'],
    ['vacío', ''],
  ])('un id %s responde 404 sin llamar al servidor', async (_caso, id) => {
    const llamadas = simularServidorTienda({});
    const error = await errorDe(obtenerProducto(id));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: MENSAJES_TIENDA.productoNoEncontrado });
    expect(llamadas).toHaveLength(0);
  });

  it('pide el producto por id, sin sesión, y lo normaliza igual que el catálogo', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidorTienda({});
    const producto = await obtenerProducto(' 302 ');
    llamadaPublica(llamadas, rutaProducto(302));
    const [delCatalogo] = await catalogoCon([ACONDICIONADOR]);
    expect(producto).toEqual(delCatalogo);
  });

  it('un producto desactivado responde 404 del backend y se trata como no encontrado', async () => {
    simularServidorTienda({});
    const error = await errorDe(obtenerProducto(PRODUCTO_INACTIVO.id));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404 });
  });

  it.each<[string, unknown]>([
    ['sin data', { success: true }],
    ['data como arreglo', { success: true, data: [SHAMPOO] }],
    ['un producto sin nombre', cuerpoDatoTienda({ ...SHAMPOO, nombre: '' })],
  ])('responde 404 con %s', async (_caso, cuerpo) => {
    simularServidorTienda({ [rutaProducto(301)]: () => respuesta(cuerpo) });
    expect(await errorDe(obtenerProducto(301))).toMatchObject({
      status: 404,
      message: MENSAJES_TIENDA.productoNoEncontrado,
    });
  });
});

// ── Reglas del catálogo ──────────────────────────────────────────────────────────────────────

describe('formatoPrecio y textoPiezas', () => {
  it.each<[number, string]>([
    [38000, '$380'],
    [120000, '$1,200'],
    [14950, '$149.50'],
    [1, '$0.01'],
    [0, '$0'],
    [-100, '$0'],
    [Number.NaN, '$0'],
    [Number.POSITIVE_INFINITY, '$0'],
  ])('formatoPrecio(%p) es %p', (centavos, texto) => {
    expect(formatoPrecio(centavos)).toBe(texto);
  });

  it.each<[number, string]>([
    [1, '1 pieza'],
    [0, '0 piezas'],
    [3, '3 piezas'],
  ])('textoPiezas(%p) es %p', (cantidad, texto) => {
    expect(textoPiezas(cantidad)).toBe(texto);
  });
});

describe('presentaciones comprables, presentación inicial y precios', () => {
  it.each<[string, Partial<Presentacion>, boolean]>([
    ['disponible, con piezas y precio', {}, true],
    ['no disponible', { disponible: false }, false],
    ['sin piezas', { stock: 0 }, false],
    ['sin precio', { precioCentavos: 0 }, false],
  ])('presentacionComprable: %s', (_caso, cambios, esperado) => {
    expect(presentacionComprable(presentacion(cambios))).toBe(esperado);
  });

  it.each<[string, Presentacion[], Presentacion | null]>([
    ['la primera comprable aunque haya una agotada antes', [AGOTADA, COMPRABLE], COMPRABLE],
    ['la primera si ninguna se puede comprar', [AGOTADA, presentacion({ id: 4, disponible: false })], AGOTADA],
    ['null sin presentaciones', [], null],
  ])('presentacionInicial: %s', (_caso, presentaciones, esperada) => {
    expect(presentacionInicial(productoCon(presentaciones))).toBe(esperada);
  });

  it.each<[string, Presentacion[], boolean]>([
    ['dos precios distintos', [AGOTADA, COMPRABLE], true],
    ['el mismo precio', [COMPRABLE, presentacion({ id: 5, precioCentavos: 45000 })], false],
    ['una sin precio', [COMPRABLE, presentacion({ id: 6, precioCentavos: 0 })], false],
    ['una sola', [COMPRABLE], false],
  ])('tienePreciosDistintos: %s', (_caso, presentaciones, esperado) => {
    expect(tienePreciosDistintos(productoCon(presentaciones))).toBe(esperado);
  });

  it('estaAgotado y precioDesdeCentavos con el catálogo normalizado', async () => {
    const productos = await catalogoCon([SHAMPOO, ESMALTE, MASCARILLA_AGOTADA]);
    expect(productos.map((p) => [p.id, tienePreciosDistintos(p), precioDesdeCentavos(p), estaAgotado(p)])).toEqual([
      [301, true, 38000, false],
      [305, false, 120000, false],
      [303, false, 45000, true],
    ]);
  });
});

describe('categoriasDe y filtrarProductos', () => {
  it('categoriasDe: sin repetir, sin vacías y en orden del español (la Á va con la A)', () => {
    const productos = ['Uñas', 'Ácidos', 'Cabello', '', 'Barbería', 'Cabello'].map((categoria, i) =>
      productoCon([], { id: i + 1, categoria }),
    );
    expect(categoriasDe(productos)).toEqual(['Ácidos', 'Barbería', 'Cabello', 'Uñas']);
    expect(categoriasDe([])).toEqual([]);
  });

  it('categoriasDe con el catálogo de la tienda', async () => {
    expect(categoriasDe(await catalogoCon(CATALOGO_TIENDA_CRUDO))).toEqual(['Cabello', 'Facial', 'Tratamientos', 'Uñas']);
  });

  it.each<[string, string, string | null, number[]]>([
    ['sin búsqueda ni categoría', '', null, IDS_ACTIVOS_ORDENADOS],
    ['solo espacios', '   ', null, IDS_ACTIVOS_ORDENADOS],
    ['por categoría', '', 'Cabello', [301, 302]],
    ['por nombre en mayúsculas', 'SHAMPOO', null, [301]],
    ['por nombre sin acento', 'acido', null, [306]],
    ['por nombre con acento de más', 'SÉRUM', null, [304]],
    ['por marca', 'óleo', null, [303, 304]],
    ['por categoría escrita', 'tratamientos', null, [303, 304]],
    ['por ñ sin tilde', 'unas', null, [305]],
    ['búsqueda y categoría', '  botánica  ', 'Cabello', [301, 302]],
    ['búsqueda fuera de la categoría', 'esmalte', 'Cabello', []],
    ['categoría que no existe', '', 'Perfumes', []],
  ])('filtrarProductos: %s', async (_caso, busqueda, categoria, ids) => {
    const productos = await catalogoCon(CATALOGO_TIENDA_CRUDO.filter((p) => p.activo));
    expect(filtrarProductos(productos, busqueda, categoria).map((p) => p.id)).toEqual(ids);
  });
});
