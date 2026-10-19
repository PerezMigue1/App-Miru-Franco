/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { Servicio } from '@/features/citas/models/servicioModel';
import {
  CAPAS,
  ORDEN_CAPAS,
  precioParaMostrar,
  seleccionarFluidos,
} from '@/features/inicio/models/FluidoModel';
import { fotosDeServicios } from '@/features/inicio/models/FotoModel';
import {
  esObjeto,
  idDe,
  listaDe,
  obtenerProductos,
  primeraImagen,
  texto,
  urlHttps,
  type Producto,
} from '@/features/inicio/models/inicioService';
import { useInicioViewModel } from '@/features/inicio/viewmodels/useInicioViewModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { colorFluido } from '@/shared/ui/tokens';

/**
 * GP-04, Inicio: modelos (FluidoModel, FotoModel, inicioService) y useInicioViewModel. Solo fetch es
 * simulado; apiClient, servicioModel y productoModel son los reales. El viewmodel no usa expo-router
 * ni la sesión, así que renderHook no necesita wrapper.
 */

const API = 'http://api.test';
const URL_SERVICIOS = `${API}/api/servicios`;
const URL_PRODUCTOS = `${API}/api/productos`;

type LlamadaFetch = [string, RequestInit];

/** Respuesta mínima con lo que lee apiClient (ok, status y text()), más json() y headers. */
function respuesta(cuerpo: unknown, status = 200): Response {
  const textoCuerpo = JSON.stringify(cuerpo);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: () => Promise.resolve(textoCuerpo),
    json: () => Promise.resolve(JSON.parse(textoCuerpo) as unknown),
  } as unknown as Response;
}

/** Lo que responde el servidor simulado a una ruta: un cuerpo, un error HTTP, sin red o en espera. */
type Salida =
  | { cuerpo: unknown; status?: number }
  | { sinRed: true }
  | { espera: Promise<Response> };

/** Instala un fetch simulado que responde por URL; cualquier otra URL es un 404. */
function servidor(rutas: Record<string, Salida>): jest.Mock {
  const simulado = jest.fn((url: string) => {
    const salida = rutas[url];
    if (!salida) {
      return Promise.resolve(respuesta({ message: 'No encontrado' }, 404));
    }
    if ('sinRed' in salida) {
      return Promise.reject(new TypeError('Network request failed'));
    }
    if ('espera' in salida) {
      return salida.espera;
    }
    return Promise.resolve(respuesta(salida.cuerpo, salida.status ?? 200));
  });
  globalThis.fetch = simulado as unknown as typeof fetch;
  return simulado;
}

function llamadas(simulado: jest.Mock): LlamadaFetch[] {
  return simulado.mock.calls as unknown as LlamadaFetch[];
}

function urlsDe(simulado: jest.Mock): string[] {
  return llamadas(simulado).map(([url]) => url);
}

/** Promesa que la prueba resuelve cuando quiere (para ver el estado de carga o respuestas tardías). */
function diferida(): { promesa: Promise<Response>; resolver: (r: Response) => void } {
  let resolver: (r: Response) => void = () => undefined;
  const promesa = new Promise<Response>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

/** Servicio normalizado mínimo para FotoModel. */
function servicio(datos: Partial<Servicio> & Pick<Servicio, 'id' | 'nombre'>): Servicio {
  return {
    descripcion: '',
    descripcionLarga: '',
    precio: null,
    anticipo: null,
    duracion: null,
    requiereEvaluacion: false,
    incluye: [],
    recomendaciones: [],
    especialistas: [],
    ...datos,
  };
}

/** Servicio crudo como lo manda GET /api/servicios. */
function servicioCrudo(id: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, nombre: `Servicio ${id}`, precio: '350', duracionMinutos: 60, activo: true, ...extra };
}

/** Producto crudo como lo manda GET /api/productos, con una presentación comprable. */
function productoCrudo(id: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    nombre: `Producto ${id}`,
    marca: 'Marca de prueba',
    presentaciones: [{ id: id * 10, tamanio: '500ml', precio: '380', stock: 3, disponible: true }],
    ...extra,
  };
}

// ── FluidoModel ─────────────────────────────────────────────────────────────────────────────

describe('FluidoModel: precioParaMostrar', () => {
  it('da formato de pesos mexicanos sin decimales a los enteros', () => {
    expect(precioParaMostrar('1200')).toBe('$1,200');
    expect(precioParaMostrar('380')).toBe('$380');
    expect(precioParaMostrar('12000')).toBe('$12,000');
  });

  it('quita el signo de pesos, las comas y los espacios antes de convertir', () => {
    expect(precioParaMostrar('$1,200')).toBe('$1,200');
    expect(precioParaMostrar('  $380 ')).toBe('$380');
  });

  it('muestra dos decimales cuando el precio no es entero', () => {
    expect(precioParaMostrar('149.5')).toBe('$149.50');
    expect(precioParaMostrar('$1,200.75')).toBe('$1,200.75');
  });

  it('devuelve null si no hay un precio real: vacío, no numérico, cero o negativo', () => {
    expect(precioParaMostrar('')).toBeNull();
    expect(precioParaMostrar('   ')).toBeNull();
    expect(precioParaMostrar('$')).toBeNull();
    expect(precioParaMostrar('gratis')).toBeNull();
    expect(precioParaMostrar('0')).toBeNull();
    expect(precioParaMostrar('-50')).toBeNull();
  });
});

describe('FluidoModel: seleccionarFluidos', () => {
  it('sin catálogo devuelve los cuatro fluidos AVYNA sin nombre ni precio (nunca inventados)', () => {
    const fluidos = seleccionarFluidos([]);
    expect(fluidos.map(({ id, clave }) => ({ id, clave }))).toEqual([
      { id: 34, clave: 'goji' },
      { id: 33, clave: 'argan' },
      { id: 35, clave: 'platino' },
      { id: 36, clave: 'hialuronico' },
    ]);
    for (const fluido of fluidos) {
      expect(fluido.nombre).toBeNull();
      expect(fluido.precio).toBeNull();
      expect(fluido.color).toBe(colorFluido[fluido.clave]);
      expect(fluido.capa).toBe(CAPAS[fluido.clave]);
    }
  });

  it('cruza con el catálogo por id (número o texto) y toma nombre y precio reales', () => {
    const catalogo: Producto[] = [
      { id: '34', nombre: 'Fluido Di Goji', precio: '1200', categoria: 'Fluidos' },
      { id: 33, nombre: 'Fluido de Argán', precio: '$499.90', categoria: 'Fluidos' },
      // Sin nombre y sin precio válido: quedan vacíos.
      { id: 35, nombre: '', precio: '0', categoria: 'Fluidos' },
      { id: 99, nombre: 'Otro producto', precio: '100', categoria: 'Otros' },
    ];
    const porClave = Object.fromEntries(seleccionarFluidos(catalogo).map((f) => [f.clave, f]));

    expect(porClave.goji).toMatchObject({ id: 34, nombre: 'Fluido Di Goji', precio: '$1,200' });
    expect(porClave.argan).toMatchObject({ id: 33, nombre: 'Fluido de Argán', precio: '$499.90' });
    expect(porClave.platino).toMatchObject({ id: 35, nombre: null, precio: null });
    // El 36 no está en el catálogo.
    expect(porClave.hialuronico).toMatchObject({ id: 36, nombre: null, precio: null });
  });

  it('ORDEN_CAPAS va de atrás hacia adelante según el zIndex de cada capa', () => {
    expect(ORDEN_CAPAS).toHaveLength(4);
    const indices = ORDEN_CAPAS.map((clave) => CAPAS[clave].zIndex);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});

// ── FotoModel ───────────────────────────────────────────────────────────────────────────────

describe('FotoModel: fotosDeServicios', () => {
  it('toma la imagen de cada servicio activo, sin repetir URLs y en el orden del catálogo', () => {
    const fotos = fotosDeServicios([
      servicio({ id: 1, nombre: 'Corte', imagen: 'https://img.test/a.jpg', categoria: 'Cabello', activo: true }),
      servicio({ id: 2, nombre: 'Tinte', imagen: 'https://img.test/b.jpg' }),
      // Misma foto que el primero: no se repite.
      servicio({ id: 3, nombre: 'Peinado', imagen: 'https://img.test/a.jpg' }),
      // Inactivo: no se muestra aunque tenga foto.
      servicio({ id: 4, nombre: 'Uñas', imagen: 'https://img.test/c.jpg', activo: false }),
      // Sin foto.
      servicio({ id: 5, nombre: 'Maquillaje' }),
    ]);

    expect(fotos).toEqual([
      { url: 'https://img.test/a.jpg', servicioId: 1, servicio: 'Corte', categoria: 'Cabello' },
      { url: 'https://img.test/b.jpg', servicioId: 2, servicio: 'Tinte', categoria: undefined },
    ]);
  });

  it('sin fotos devuelve una lista vacía (nunca imágenes de relleno)', () => {
    expect(fotosDeServicios([])).toEqual([]);
    expect(fotosDeServicios([servicio({ id: 1, nombre: 'Corte' })])).toEqual([]);
  });
});

// ── inicioService: utilidades ───────────────────────────────────────────────────────────────

describe('inicioService: utilidades de normalización', () => {
  it('esObjeto solo acepta objetos simples', () => {
    expect(esObjeto({})).toBe(true);
    expect(esObjeto({ a: 1 })).toBe(true);
    expect(esObjeto([])).toBe(false);
    expect(esObjeto(null)).toBe(false);
    expect(esObjeto('texto')).toBe(false);
    expect(esObjeto(3)).toBe(false);
  });

  it('listaDe acepta un arreglo o el primer arreglo de las claves dadas y descarta lo que no es objeto', () => {
    expect(listaDe([{ id: 1 }, 'x', null, [2], { id: 2 }], ['data'])).toEqual([{ id: 1 }, { id: 2 }]);
    expect(listaDe({ data: [{ id: 1 }] }, ['data', 'productos'])).toEqual([{ id: 1 }]);
    // data no es arreglo: se usa la siguiente clave que sí lo sea.
    expect(listaDe({ data: { id: 9 }, productos: [{ id: 2 }] }, ['data', 'productos'])).toEqual([{ id: 2 }]);
    expect(listaDe({ otra: [{ id: 1 }] }, ['data'])).toEqual([]);
    expect(listaDe(null, ['data'])).toEqual([]);
    expect(listaDe('texto', ['data'])).toEqual([]);
  });

  it('texto recorta los textos, convierte números finitos y vacía lo demás', () => {
    expect(texto('  Corte  ')).toBe('Corte');
    expect(texto(380)).toBe('380');
    expect(texto(Number.NaN)).toBe('');
    expect(texto(Number.POSITIVE_INFINITY)).toBe('');
    expect(texto(null)).toBe('');
    expect(texto(undefined)).toBe('');
    expect(texto({ a: 1 })).toBe('');
  });

  it('idDe usa id o, si falta, _id; cualquier otra cosa da texto vacío', () => {
    expect(idDe({ id: 7 })).toBe(7);
    expect(idDe({ id: 'abc' })).toBe('abc');
    expect(idDe({ _id: 'mongo-1' })).toBe('mongo-1');
    expect(idDe({ id: 3, _id: 'ignorado' })).toBe(3);
    expect(idDe({})).toBe('');
    expect(idDe({ id: { anidado: true } })).toBe('');
  });

  it('urlHttps solo acepta https con algo después del prefijo, también dentro de objetos de Cloudinary', () => {
    expect(urlHttps(' https://img.test/a.jpg ')).toBe('https://img.test/a.jpg');
    expect(urlHttps('http://img.test/a.jpg')).toBeUndefined();
    expect(urlHttps('https://')).toBeUndefined();
    expect(urlHttps({ secure_url: 'https://img.test/s.jpg', url: 'https://img.test/u.jpg' })).toBe(
      'https://img.test/s.jpg',
    );
    expect(urlHttps({ url: 'https://img.test/u.jpg' })).toBe('https://img.test/u.jpg');
    expect(urlHttps({ src: 'https://img.test/src.jpg' })).toBe('https://img.test/src.jpg');
    expect(urlHttps(42)).toBeUndefined();
    expect(urlHttps(null)).toBeUndefined();
  });

  it('primeraImagen recorre valores y arreglos hasta la primera URL https válida', () => {
    expect(primeraImagen(undefined, ['http://img.test/x.jpg', 'https://img.test/y.jpg'])).toBe(
      'https://img.test/y.jpg',
    );
    expect(primeraImagen('https://img.test/primera.jpg', 'https://img.test/segunda.jpg')).toBe(
      'https://img.test/primera.jpg',
    );
    expect(primeraImagen([{ secure_url: 'https://img.test/obj.jpg' }])).toBe('https://img.test/obj.jpg');
    expect(primeraImagen('', [], null)).toBeUndefined();
    expect(primeraImagen()).toBeUndefined();
  });
});

// ── inicioService: obtenerProductos ────────────────────────────────────────────────────────

describe('inicioService: obtenerProductos (GET /api/productos)', () => {
  it('pide el catálogo público a la API de prueba, sin token, y normaliza cada producto', async () => {
    const simulado = servidor({
      [URL_PRODUCTOS]: {
        cuerpo: {
          success: true,
          count: 2,
          data: [
            {
              _id: 'p-1',
              nombre: '  Shampoo  ',
              categoria: ' Cuidado ',
              precio: '999',
              // Manda la menor presentación con precio positivo, sin $ ni comas.
              presentaciones: [{ precio: '$1,200' }, { precio: '380' }, { precio: '0' }, 'basura'],
              imagenes: ['http://img.test/no.jpg', 'https://img.test/si.jpg'],
            },
            // Sin presentaciones con precio: se usa el precio del producto.
            { id: 2, nombre: 'Mascarilla', precio: 450, presentaciones: [{ precio: '' }], imagen: 'https://img.test/m.jpg' },
            'no es objeto',
          ],
        },
      },
    });

    const productos = await obtenerProductos();

    expect(productos).toEqual([
      { id: 'p-1', nombre: 'Shampoo', precio: '380', categoria: 'Cuidado', imagen: 'https://img.test/si.jpg' },
      { id: 2, nombre: 'Mascarilla', precio: '450', categoria: '', imagen: 'https://img.test/m.jpg' },
    ]);
    expect(urlsDe(simulado)).toEqual([URL_PRODUCTOS]);
    const [, init] = llamadas(simulado)[0];
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('acepta el catálogo como arreglo directo o bajo productos', async () => {
    servidor({ [URL_PRODUCTOS]: { cuerpo: [{ id: 1, nombre: 'Uno', precio: '10' }] } });
    await expect(obtenerProductos()).resolves.toEqual([
      { id: 1, nombre: 'Uno', precio: '10', categoria: '', imagen: undefined },
    ]);

    servidor({ [URL_PRODUCTOS]: { cuerpo: { productos: [{ id: 2, nombre: 'Dos', precio: '20' }] } } });
    await expect(obtenerProductos()).resolves.toEqual([
      { id: 2, nombre: 'Dos', precio: '20', categoria: '', imagen: undefined },
    ]);
  });

  it('una respuesta sin lista da un catálogo vacío', async () => {
    servidor({ [URL_PRODUCTOS]: { cuerpo: { success: true, count: 0, data: [] } } });
    await expect(obtenerProductos()).resolves.toEqual([]);

    servidor({ [URL_PRODUCTOS]: { cuerpo: { success: true } } });
    await expect(obtenerProductos()).resolves.toEqual([]);
  });

  it('un error del servidor llega como ApiError con su status y su code', async () => {
    servidor({
      [URL_PRODUCTOS]: { cuerpo: { message: 'Fallo interno', code: 'ERROR_INTERNO' }, status: 500 },
    });

    const error = await obtenerProductos().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, code: 'ERROR_INTERNO', message: 'Fallo interno' });
  });

  it('sin red llega como ErrorDeRed', async () => {
    servidor({ [URL_PRODUCTOS]: { sinRed: true } });

    const error = await obtenerProductos().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorDeRed);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

// ── useInicioViewModel ──────────────────────────────────────────────────────────────────────

describe('useInicioViewModel', () => {
  it('arranca cargando, con los fluidos vacíos, y pide servicios y productos una vez cada uno', async () => {
    const servicios = diferida();
    const productos = diferida();
    const simulado = servidor({
      [URL_SERVICIOS]: { espera: servicios.promesa },
      [URL_PRODUCTOS]: { espera: productos.promesa },
    });

    const { result, unmount } = await renderHook(() => useInicioViewModel());

    expect(result.current.estado).toBe('cargando');
    expect(result.current.estadoProductos).toBe('cargando');
    expect(result.current.fotos).toEqual([]);
    expect(result.current.serviciosDestacados).toEqual([]);
    expect(result.current.productosDestacados).toEqual([]);
    expect(result.current.fluidos).toEqual(seleccionarFluidos([]));
    await waitFor(() => expect(simulado).toHaveBeenCalledTimes(2));
    expect(new Set(urlsDe(simulado))).toEqual(new Set([URL_SERVICIOS, URL_PRODUCTOS]));
    for (const [, init] of llamadas(simulado)) {
      expect(init.method).toBe('GET');
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    }

    await act(async () => {
      servicios.resolver(respuesta({ success: true, data: [] }));
      productos.resolver(respuesta({ success: true, count: 0, data: [] }));
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    await waitFor(() => expect(result.current.estadoProductos).toBe('listo'));
    await unmount();
  });

  it('con datos: fotos, hasta 6 servicios activos y hasta 6 productos con existencias, y el hero con el catálogo', async () => {
    const serviciosCrudos = [
      ...Array.from({ length: 7 }, (_, i) =>
        servicioCrudo(i + 1, i < 2 ? { imagen: `https://img.test/servicio-${i + 1}.jpg` } : {}),
      ),
      // Inactivo con foto: ni foto ni carrusel.
      servicioCrudo(50, { activo: false, imagen: 'https://img.test/inactivo.jpg' }),
    ];
    const productosCrudos = [
      ...Array.from({ length: 7 }, (_, i) => productoCrudo(i + 1)),
      // Fluido Di Goji del hero, con existencias.
      productoCrudo(34, {
        nombre: 'Fluido Di Goji',
        presentaciones: [{ id: 340, tamanio: '60ml', precio: '1200', stock: 2, disponible: true }],
      }),
      // Agotado: nunca en el carrusel.
      productoCrudo(80, {
        presentaciones: [{ id: 800, tamanio: '500ml', precio: '380', stock: 0, disponible: true }],
      }),
    ];
    servidor({
      [URL_SERVICIOS]: { cuerpo: { success: true, data: serviciosCrudos } },
      [URL_PRODUCTOS]: { cuerpo: { success: true, count: productosCrudos.length, data: productosCrudos } },
    });

    const { result, unmount } = await renderHook(() => useInicioViewModel());

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    await waitFor(() => expect(result.current.estadoProductos).toBe('listo'));
    const vm = result.current;

    expect(vm.fotos.map((foto) => foto.servicioId)).toEqual([1, 2]);
    expect(vm.fotos[0]).toEqual({
      url: 'https://img.test/servicio-1.jpg',
      servicioId: 1,
      servicio: 'Servicio 1',
      categoria: undefined,
    });

    // Al azar, pero siempre 6, sin repetir y solo activos.
    const idsServicios = vm.serviciosDestacados.map((s) => s.id);
    expect(idsServicios).toHaveLength(6);
    expect(new Set(idsServicios).size).toBe(6);
    for (const id of idsServicios) {
      expect([1, 2, 3, 4, 5, 6, 7]).toContain(id);
    }

    const idsProductos = vm.productosDestacados.map((p) => p.id);
    expect(idsProductos).toHaveLength(6);
    expect(new Set(idsProductos).size).toBe(6);
    expect(idsProductos).not.toContain(80);

    const goji = vm.fluidos.find((fluido) => fluido.clave === 'goji');
    expect(goji).toMatchObject({ id: 34, nombre: 'Fluido Di Goji', precio: '$1,200' });
    const argan = vm.fluidos.find((fluido) => fluido.clave === 'argan');
    expect(argan).toMatchObject({ id: 33, nombre: null, precio: null });
    await unmount();
  });

  it('con menos de 6 elementos los muestra todos', async () => {
    servidor({
      [URL_SERVICIOS]: { cuerpo: { success: true, data: [servicioCrudo(1), servicioCrudo(2)] } },
      [URL_PRODUCTOS]: { cuerpo: { success: true, count: 1, data: [productoCrudo(7)] } },
    });

    const { result, unmount } = await renderHook(() => useInicioViewModel());

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    await waitFor(() => expect(result.current.estadoProductos).toBe('listo'));
    expect(result.current.serviciosDestacados.map((s) => s.id).sort()).toEqual([1, 2]);
    expect(result.current.productosDestacados.map((p) => p.id)).toEqual([7]);
    expect(result.current.fotos).toEqual([]);
    await unmount();
  });

  it('un error de servicios pone el estado general en error sin tumbar el catálogo', async () => {
    servidor({
      [URL_SERVICIOS]: { cuerpo: { message: 'Fallo interno' }, status: 500 },
      [URL_PRODUCTOS]: { cuerpo: { success: true, count: 1, data: [productoCrudo(7)] } },
    });

    const { result, unmount } = await renderHook(() => useInicioViewModel());

    await waitFor(() => expect(result.current.estado).toBe('error'));
    await waitFor(() => expect(result.current.estadoProductos).toBe('listo'));
    expect(result.current.productosDestacados.map((p) => p.id)).toEqual([7]);
    expect(result.current.serviciosDestacados).toEqual([]);
    expect(result.current.fotos).toEqual([]);
    await unmount();
  });

  it('un error del catálogo solo marca estadoProductos y deja el hero sin nombre ni precio', async () => {
    servidor({
      [URL_SERVICIOS]: { cuerpo: { success: true, data: [servicioCrudo(1)] } },
      [URL_PRODUCTOS]: { sinRed: true },
    });

    const { result, unmount } = await renderHook(() => useInicioViewModel());

    await waitFor(() => expect(result.current.estadoProductos).toBe('error'));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.serviciosDestacados.map((s) => s.id)).toEqual([1]);
    expect(result.current.productosDestacados).toEqual([]);
    expect(result.current.fluidos).toEqual(seleccionarFluidos([]));
    await unmount();
  });

  it('recargar vuelve a pedir todo, pasa por cargando y pinta los datos', async () => {
    const simuladoFallo = servidor({
      [URL_SERVICIOS]: { sinRed: true },
      [URL_PRODUCTOS]: { sinRed: true },
    });

    const { result, unmount } = await renderHook(() => useInicioViewModel());

    await waitFor(() => expect(result.current.estado).toBe('error'));
    await waitFor(() => expect(result.current.estadoProductos).toBe('error'));
    expect(simuladoFallo).toHaveBeenCalledTimes(2);

    const servicios = diferida();
    const productos = diferida();
    const simulado = servidor({
      [URL_SERVICIOS]: { espera: servicios.promesa },
      [URL_PRODUCTOS]: { espera: productos.promesa },
    });

    await act(async () => {
      result.current.recargar();
    });
    expect(result.current.estado).toBe('cargando');
    expect(result.current.estadoProductos).toBe('cargando');
    expect(new Set(urlsDe(simulado))).toEqual(new Set([URL_SERVICIOS, URL_PRODUCTOS]));

    await act(async () => {
      servicios.resolver(respuesta({ success: true, data: [servicioCrudo(1)] }));
      productos.resolver(respuesta({ success: true, count: 1, data: [productoCrudo(7)] }));
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    await waitFor(() => expect(result.current.estadoProductos).toBe('listo'));
    expect(result.current.serviciosDestacados.map((s) => s.id)).toEqual([1]);
    expect(result.current.productosDestacados.map((p) => p.id)).toEqual([7]);
    await unmount();
  });

  it('solo la última solicitud escribe: una respuesta tardía de la carga anterior se descarta', async () => {
    const serviciosViejos = diferida();
    const productosViejos = diferida();
    servidor({
      [URL_SERVICIOS]: { espera: serviciosViejos.promesa },
      [URL_PRODUCTOS]: { espera: productosViejos.promesa },
    });

    const { result, unmount } = await renderHook(() => useInicioViewModel());

    // Reintento antes de que llegue la primera respuesta.
    servidor({
      [URL_SERVICIOS]: { cuerpo: { success: true, data: [servicioCrudo(2)] } },
      [URL_PRODUCTOS]: { cuerpo: { success: true, count: 1, data: [productoCrudo(8)] } },
    });
    await act(async () => {
      result.current.recargar();
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    await waitFor(() => expect(result.current.estadoProductos).toBe('listo'));

    // Llega tarde la primera carga, con otros datos y con error: no cambia nada.
    await act(async () => {
      serviciosViejos.resolver(respuesta({ success: true, data: [servicioCrudo(1)] }));
      productosViejos.resolver(respuesta({ message: 'Fallo' }, 500));
    });

    expect(result.current.estado).toBe('listo');
    expect(result.current.estadoProductos).toBe('listo');
    expect(result.current.serviciosDestacados.map((s) => s.id)).toEqual([2]);
    expect(result.current.productosDestacados.map((p) => p.id)).toEqual([8]);
    await unmount();
  });
});
