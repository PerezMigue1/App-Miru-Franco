/// <reference types="jest" />

import { precioParaMostrar } from '@/features/inicio/models/FluidoModel';
import { fotosDeServicios } from '@/features/inicio/models/FotoModel';
import {
  esObjeto,
  idDe,
  listaDe,
  obtenerProductos,
  primeraImagen,
  texto,
  urlHttps,
  type Crudo,
} from '@/features/inicio/models/inicioService';

import { respuesta } from '../../helpers/servidorSimulado';
import {
  CATALOGO_NORMALIZADO,
  imagenServicio,
  servicioNormalizado,
  simularServidorServicios,
} from '../../helpers/serviciosFicticios';

/**
 * GP-06.1: lectores compartidos con los que el modelo de servicios normaliza las respuestas
 * (src/features/inicio/models/inicioService.ts), precioParaMostrar de FluidoModel y fotosDeServicios
 * de FotoModel. Cada lector con valores válidos, vacíos y de tipo equivocado. El precio de los
 * productos (precioDe) solo se alcanza por obtenerProductos, con fetch simulado.
 */

const A = imagenServicio('a');
const B = imagenServicio('b');
const HTTP = 'http://img.test/servicios/a.jpg';

describe('esObjeto', () => {
  it.each<[string, unknown, boolean]>([
    ['objeto vacío', {}, true],
    ['objeto con datos', { id: 1 }, true],
    ['objeto sin prototipo', Object.create(null) as unknown, true],
    ['arreglo', [], false],
    ['null', null, false],
    ['undefined', undefined, false],
    ['texto', 'objeto', false],
    ['número', 1, false],
    ['booleano', true, false],
    ['función', () => ({}), false],
  ])('%s da %p', (_caso, valor, esperado) => {
    expect(esObjeto(valor)).toBe(esperado);
  });
});

describe('listaDe', () => {
  const uno = { id: 1 };
  const dos = { id: 2 };

  it.each<[string, unknown, string[], Crudo[]]>([
    ['arreglo directo', [uno, dos], ['data'], [uno, dos]],
    ['arreglo directo sin claves', [uno], [], [uno]],
    ['primera clave con arreglo', { data: [uno], servicios: [dos] }, ['data', 'servicios'], [uno]],
    ['salta claves que no son arreglo', { data: 'x', servicios: { id: 3 }, servicio: [dos] }, ['data', 'servicios', 'servicio'], [dos]],
    ['respeta el orden de las claves', { data: [uno], servicios: [dos] }, ['servicios', 'data'], [dos]],
    ['descarta lo que no es objeto', [uno, null, 'x', 4, [dos], dos], ['data'], [uno, dos]],
    ['ninguna clave coincide', { otra: [uno] }, ['data'], []],
    ['objeto sin claves pedidas', { data: [uno] }, [], []],
    ['null', null, ['data'], []],
    ['texto', 'lista', ['data'], []],
    ['número', 3, ['data'], []],
  ])('%s', (_caso, respuestaCruda, claves, esperado) => {
    expect(listaDe(respuestaCruda, claves)).toEqual(esperado);
  });
});

describe('texto', () => {
  it.each<[unknown, string]>([
    ['  Corte  ', 'Corte'],
    ['', ''],
    ['   ', ''],
    [0, '0'],
    [1200.5, '1200.5'],
    [-3, '-3'],
    [Number.NaN, ''],
    [Number.NEGATIVE_INFINITY, ''],
    [null, ''],
    [undefined, ''],
    [true, ''],
    [{ texto: 'x' }, ''],
    [['x'], ''],
  ])('texto(%p) da %p', (valor, esperado) => {
    expect(texto(valor)).toBe(esperado);
  });
});

describe('idDe', () => {
  it.each<[Crudo, string | number]>([
    [{ id: 7 }, 7],
    [{ id: 0 }, 0],
    [{ id: 'servicio-7' }, 'servicio-7'],
    [{ id: '' }, ''],
    [{ _id: 'respaldo' }, 'respaldo'],
    [{ id: null, _id: 'respaldo' }, 'respaldo'],
    [{ id: 3, _id: 'ignorado' }, 3],
    [{ id: true }, ''],
    [{ id: { valor: 1 } }, ''],
    [{}, ''],
  ])('idDe(%p) da %p', (crudo, esperado) => {
    expect(idDe(crudo)).toBe(esperado);
  });
});

describe('urlHttps', () => {
  it.each<[string, unknown, string | undefined]>([
    ['https', A, A],
    ['https con espacios', `  ${A}  `, A],
    ['http', HTTP, undefined],
    ['solo el prefijo', 'https://', undefined],
    ['vacío', '', undefined],
    ['otro esquema', 'ftp://img.test/a.jpg', undefined],
    ['secure_url', { secure_url: A }, A],
    ['secure_url antes que url', { secure_url: A, url: B }, A],
    ['url', { url: A }, A],
    ['src', { src: A }, A],
    ['url http aunque src sea https', { url: HTTP, src: A }, undefined],
    ['objeto anidado', { secure_url: { url: A } }, A],
    ['objeto sin url', { ancho: 100 }, undefined],
    ['arreglo', [A], undefined],
    ['número', 1, undefined],
    ['null', null, undefined],
  ])('%s', (_caso, valor, esperado) => {
    expect(urlHttps(valor)).toBe(esperado);
  });
});

describe('primeraImagen', () => {
  it.each<[string, unknown[], string | undefined]>([
    ['texto https', [A], A],
    ['primer valor válido', [A, B], A],
    ['salta valores sin URL', [undefined, '', HTTP, B], B],
    ['primera https dentro de un arreglo', [[HTTP, '', B, A]], B],
    ['arreglo vacío y luego texto', [[], A], A],
    ['objeto de Cloudinary dentro de un arreglo', [[{ secure_url: B }]], B],
    ['nada válido', [HTTP, [HTTP], null, 5], undefined],
    ['sin valores', [], undefined],
  ])('%s', (_caso, valores, esperado) => {
    expect(primeraImagen(...valores)).toBe(esperado);
  });
});

describe('precioParaMostrar', () => {
  it.each<[string, string | null]>([
    ['1200', '$1,200'],
    ['1200.00', '$1,200'],
    ['$1,200', '$1,200'],
    [' $ 1,200 ', '$1,200'],
    ['1800.5', '$1,800.50'],
    ['0.5', '$0.50'],
    ['1234567', '$1,234,567'],
    ['', null],
    ['   ', null],
    ['$', null],
    ['gratis', null],
    ['0', null],
    ['-1', null],
    ['Infinity', null],
  ])('precioParaMostrar(%p) da %p', (valor, esperado) => {
    expect(precioParaMostrar(valor)).toBe(esperado);
  });
});

describe('obtenerProductos: precio de las presentaciones (precioDe)', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['el menor de las presentaciones', { precio: '999', presentaciones: [{ precio: '$1,200' }, { precio: '380.50' }] }, '380.5'],
    ['salta presentaciones sin precio válido', { presentaciones: [{ precio: '0' }, { precio: 'x' }, null, { precio: 250 }] }, '250'],
    ['el precio propio si ninguna presentación sirve', { precio: ' 450 ', presentaciones: [{ precio: '' }, 'x'] }, '450'],
    ['el precio propio si presentaciones no es arreglo', { precio: '450', presentaciones: { precio: '10' } }, '450'],
    ['vacío sin precio ni presentaciones', {}, ''],
  ])('usa %s', async (_caso, campos, esperado) => {
    simularServidorServicios({
      'GET /api/productos': () => respuesta({ productos: [{ id: 'producto-1', ...campos }] }),
    });
    const [producto] = await obtenerProductos();
    expect(producto.precio).toBe(esperado);
  });

  it('normaliza id, nombre, categoría e imagen de cada producto', async () => {
    simularServidorServicios({
      'GET /api/productos': () =>
        respuesta([{ _id: 'producto-2', nombre: ' Shampoo ficticio ', categoria: 5, imagen: HTTP, imagenes: [A] }]),
    });
    await expect(obtenerProductos()).resolves.toEqual([
      { id: 'producto-2', nombre: 'Shampoo ficticio', precio: '', categoria: '5', imagen: A },
    ]);
  });
});

describe('fotosDeServicios', () => {
  it('del catálogo ficticio toma las fotos de los activos con imagen', () => {
    expect(fotosDeServicios(CATALOGO_NORMALIZADO)).toEqual([
      { url: imagenServicio('corte'), servicioId: 1, servicio: 'Corte de dama', categoria: 'Cabello' },
      { url: imagenServicio('alaciado'), servicioId: 2, servicio: 'Alaciado keratínico', categoria: 'Tratamientos' },
      { url: imagenServicio('balayage'), servicioId: 4, servicio: 'Balayage', categoria: 'Color' },
    ]);
  });

  it('no repite URLs, ignora inactivos y sin imagen, y conserva el servicioId del primero', () => {
    const fotos = fotosDeServicios([
      servicioNormalizado({ id: 'servicio-a', nombre: 'Primero', imagen: A }),
      servicioNormalizado({ id: 'servicio-b', nombre: 'Repetido', imagen: A, categoria: 'Color' }),
      servicioNormalizado({ id: 'servicio-c', nombre: 'Inactivo', imagen: B, activo: false }),
      servicioNormalizado({ id: 'servicio-d', nombre: 'Sin imagen' }),
      servicioNormalizado({ id: 'servicio-e', nombre: 'Imagen vacía', imagen: '' }),
      servicioNormalizado({ id: 7, nombre: 'Activo explícito', imagen: B, activo: true, categoria: 'Uñas' }),
    ]);
    expect(fotos).toEqual([
      { url: A, servicioId: 'servicio-a', servicio: 'Primero', categoria: undefined },
      { url: B, servicioId: 7, servicio: 'Activo explícito', categoria: 'Uñas' },
    ]);
  });

  it('sin servicios devuelve una lista vacía', () => {
    expect(fotosDeServicios([])).toEqual([]);
  });
});
