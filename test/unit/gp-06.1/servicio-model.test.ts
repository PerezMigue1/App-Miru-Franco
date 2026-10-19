/// <reference types="jest" />

import {
  duracionParaMostrar,
  obtenerServicio,
  obtenerServicios,
  type Servicio,
} from '@/features/citas/models/servicioModel';
import { ApiError, crearErrorApi, ErrorDeRed } from '@/shared/api/apiClient';

import { CLIENTA } from '../../helpers/perfilClienta';
import { llamadasA, respuesta, type Llamada } from '../../helpers/servidorSimulado';
import {
  CATALOGO_CRUDO,
  CATALOGO_NORMALIZADO,
  cuerpoLista,
  ESPECIALISTA_DOS,
  ESPECIALISTA_UNO,
  especialistaCruda,
  imagenServicio,
  servicioCrudo,
  servicioEsperado,
  simularServidorServicios,
} from '../../helpers/serviciosFicticios';
import { sembrarSesion } from '../../helpers/sesionGuardada';

/**
 * GP-06.1: modelo de servicios (src/features/citas/models/servicioModel.ts). Caja blanca de la
 * lectura pública de GET /api/servicios y GET /api/servicios/:id: normalización campo por campo,
 * precios, anticipo, duración, imágenes, especialistas (sin correos) y errores. Solo fetch es
 * simulado; apiClient es el real.
 */

const MENSAJE_SIN_DATOS = 'Respuesta de servicio sin datos.';

/** Pasa un servicio crudo por GET /api/servicios y devuelve el único servicio normalizado. */
async function normalizarUno(crudo: Record<string, unknown>): Promise<Servicio> {
  simularServidorServicios({ 'GET /api/servicios': () => respuesta(cuerpoLista([crudo])) });
  const servicios = await obtenerServicios();
  expect(servicios).toHaveLength(1);
  return servicios[0];
}

/** El servicio crudo base con campos de cualquier tipo encima (para valores mal formados). */
function conCampos(campos: Record<string, unknown>): Record<string, unknown> {
  return { ...servicioCrudo(), ...campos };
}

/** Especialistas normalizadas de un servicio cuyo campo especialistas es el valor dado. */
async function especialistasDe(especialistas: unknown): Promise<Servicio['especialistas']> {
  return (await normalizarUno(conCampos({ especialistas }))).especialistas;
}

/** Promesa rechazada de una lectura, para revisar el error con instanceof. */
async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba que la lectura fallara.');
}

/** La única llamada que recibió el servidor simulado, revisando que fue pública. */
function llamadaPublica(llamadas: Llamada[], ruta: string): Llamada {
  expect(llamadas).toHaveLength(1);
  const [llamada] = llamadasA(llamadas, 'GET', ruta);
  expect(llamada).toBeDefined();
  expect(llamada.cabeceras).not.toHaveProperty('Authorization');
  expect(llamada.cabeceras.Accept).toBe('application/json');
  expect(llamada.cuerpo).toBeUndefined();
  return llamada;
}

// ── obtenerServicios ─────────────────────────────────────────────────────────────────────────

describe('obtenerServicios: catálogo (GET /api/servicios)', () => {
  it('normaliza cada servicio del catálogo campo por campo', async () => {
    simularServidorServicios({});
    await expect(obtenerServicios()).resolves.toEqual(CATALOGO_NORMALIZADO);
  });

  it('es pública: no manda Authorization aunque la clienta tenga sesión', async () => {
    await sembrarSesion(CLIENTA);
    const llamadas = simularServidorServicios({});
    await obtenerServicios();
    llamadaPublica(llamadas, '/api/servicios');
  });

  it('no filtra inactivos: conserva activo para que el viewmodel decida', async () => {
    simularServidorServicios({});
    const servicios = await obtenerServicios();
    expect(servicios.map((s) => [s.id, s.activo])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, true],
      [5, false],
    ]);
  });

  it.each<[string, unknown, Servicio['activo']]>([
    ['true', true, true],
    ['false', false, false],
    ['el texto "false"', 'false', undefined],
    ['el número 0', 0, undefined],
    ['null', null, undefined],
  ])('activo con %s queda como %p', async (_caso, activo, esperado) => {
    expect((await normalizarUno(conCampos({ activo }))).activo).toBe(esperado);
  });
});

describe('obtenerServicios: forma de la respuesta', () => {
  const crudo = servicioCrudo({ id: 31 });

  it.each<[string, unknown]>([
    ['arreglo directo', [crudo]],
    ['{ data: [] }', { success: true, data: [crudo] }],
    ['{ servicios: [] }', { servicios: [crudo] }],
    ['{ servicio: [] }', { servicio: [crudo] }],
    ['data no arreglo y servicios sí', { data: { id: 99 }, servicios: [crudo] }],
  ])('lee la lista como %s', async (_caso, cuerpo) => {
    simularServidorServicios({ 'GET /api/servicios': () => respuesta(cuerpo) });
    const servicios = await obtenerServicios();
    expect(servicios.map((s) => s.id)).toEqual([31]);
  });

  it.each<[string, unknown]>([
    ['sin data', { success: true }],
    ['data como objeto', { success: true, data: crudo }],
    ['data como texto', { success: true, data: 'servicios' }],
    ['data null', { success: true, data: null }],
    ['cuerpo null', null],
    ['cuerpo de texto', 'sin servicios'],
    ['lista vacía', { success: true, count: 0, data: [] }],
  ])('%s da un catálogo vacío', async (_caso, cuerpo) => {
    simularServidorServicios({ 'GET /api/servicios': () => respuesta(cuerpo) });
    await expect(obtenerServicios()).resolves.toEqual([]);
  });

  it('descarta los elementos de la lista que no son objetos', async () => {
    simularServidorServicios({
      'GET /api/servicios': () => respuesta({ data: [null, 'texto', 7, [crudo], crudo, true] }),
    });
    const servicios = await obtenerServicios();
    expect(servicios.map((s) => s.id)).toEqual([31]);
  });
});

// ── Campos ───────────────────────────────────────────────────────────────────────────────────

describe('servicioModel: campos de texto, listas y banderas', () => {
  it('un servicio con solo id deja los valores vacíos que espera la vista', async () => {
    await expect(normalizarUno({ id: 7 })).resolves.toEqual({
      id: 7,
      nombre: '',
      categoria: undefined,
      descripcion: '',
      descripcionLarga: '',
      precio: null,
      anticipo: null,
      duracion: null,
      requiereEvaluacion: false,
      activo: undefined,
      imagen: undefined,
      incluye: [],
      recomendaciones: [],
      especialistas: [],
    });
  });

  it('recorta los textos, convierte números y deja la categoría vacía como undefined', async () => {
    const servicio = await normalizarUno(
      conCampos({
        nombre: '  Corte de dama  ',
        categoria: '   ',
        descripcion: null,
        descripcionLarga: 42,
      }),
    );
    expect(servicio.nombre).toBe('Corte de dama');
    expect(servicio.categoria).toBeUndefined();
    expect(servicio.descripcion).toBe('');
    expect(servicio.descripcionLarga).toBe('42');
  });

  it.each<[string, Record<string, unknown>, string | number]>([
    ['id numérico', { id: 12 }, 12],
    ['id de texto', { id: 'servicio-texto' }, 'servicio-texto'],
    ['_id cuando falta id', { id: undefined, _id: 'servicio-respaldo' }, 'servicio-respaldo'],
    ['id que no es texto ni número', { id: { valor: 1 } }, ''],
  ])('toma el %s', async (_caso, campos, esperado) => {
    expect((await normalizarUno(conCampos(campos))).id).toBe(esperado);
  });

  it('incluye y recomendaciones conservan solo textos no vacíos y recortados', async () => {
    const servicio = await normalizarUno(
      conCampos({
        incluye: [' Lavado ', '', '   ', 3, null, { texto: 'x' }, 'Secado'],
        recomendaciones: ['  Llegar puntual  ', false],
      }),
    );
    expect(servicio.incluye).toEqual(['Lavado', 'Secado']);
    expect(servicio.recomendaciones).toEqual(['Llegar puntual']);
  });

  it.each<[string, unknown]>([
    ['texto', 'Lavado, corte'],
    ['objeto', { 0: 'Lavado' }],
    ['null', null],
  ])('incluye y recomendaciones como %s quedan vacías', async (_caso, valor) => {
    const servicio = await normalizarUno(conCampos({ incluye: valor, recomendaciones: valor }));
    expect(servicio.incluye).toEqual([]);
    expect(servicio.recomendaciones).toEqual([]);
  });

  it.each<[unknown, boolean]>([
    [true, true],
    [false, false],
    ['true', false],
    [1, false],
    [null, false],
  ])('requiereEvaluacion %p queda como %p (solo el booleano true cuenta)', async (valor, esperado) => {
    expect((await normalizarUno(conCampos({ requiereEvaluacion: valor }))).requiereEvaluacion).toBe(esperado);
  });
});

describe('servicioModel: precio y anticipo', () => {
  /** Valores del backend y lo que ve la clienta, para precio y para anticipoMonto. */
  const MONTOS: [string, unknown, string | null][] = [
    ['texto decimal del backend', '1200.00', '$1,200'],
    ['entero', '350', '$350'],
    ['número', 350, '$350'],
    ['con signo de pesos y comas', '$1,200', '$1,200'],
    ['con espacios', '  1,200.00  ', '$1,200'],
    ['con centavos', '1800.5', '$1,800.50'],
    ['con dos decimales', '99.99', '$99.99'],
    ['vacío', '', null],
    ['solo espacios', '   ', null],
    ['no numérico', 'gratis', null],
    ['cero', '0.00', null],
    ['negativo', '-50.00', null],
    ['null', null, null],
    ['booleano', true, null],
    ['objeto', { monto: 100 }, null],
  ];

  it.each(MONTOS)('precio %s (%p) se muestra como %p', async (_caso, precio, esperado) => {
    expect((await normalizarUno(conCampos({ precio }))).precio).toBe(esperado);
  });

  it.each(MONTOS)(
    'anticipoMonto %s (%p) con anticipoAplica true se muestra como %p',
    async (_caso, anticipoMonto, esperado) => {
      const servicio = await normalizarUno(conCampos({ anticipoMonto, anticipoAplica: true }));
      expect(servicio.anticipo).toBe(esperado);
    },
  );

  it('sin el campo precio no hay precio', async () => {
    // JSON.stringify omite las claves undefined: la respuesta llega sin precio.
    expect((await normalizarUno(conCampos({ precio: undefined }))).precio).toBeNull();
  });

  it.each<[string, unknown, string | null]>([
    ['false: no se pide anticipo aunque haya monto', false, null],
    ['true: se usa el monto', true, '$360'],
    ['ausente: se usa el monto', undefined, '$360'],
    ['el texto "false": solo el booleano false lo anula', 'false', '$360'],
  ])('corrección GP-06.1: anticipoAplica %s', async (_caso, anticipoAplica, esperado) => {
    const servicio = await normalizarUno(conCampos({ anticipoMonto: '360.00', anticipoAplica }));
    expect(servicio.anticipo).toBe(esperado);
  });

  it('corrección GP-06.1: el corte del catálogo trae anticipoMonto pero anticipoAplica false', async () => {
    simularServidorServicios({});
    const [corte] = await obtenerServicios();
    expect(CATALOGO_CRUDO[0].anticipoMonto).toBe('105.00');
    expect(corte.anticipo).toBeNull();
    expect(corte.precio).toBe('$350');
  });
});

describe('servicioModel: duración', () => {
  it.each<[unknown, string | null]>([
    [0, null],
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [150, '2 h 30 min'],
    [180, '3 h'],
    [1, '1 min'],
    ['90', '1 h 30 min'],
    [' 45 ', '45 min'],
    [44.6, '45 min'],
    [59.5, '1 h'],
    [119.4, '1 h 59 min'],
    [-30, null],
    ['-30', null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    ['abc', null],
    ['', null],
    [null, null],
    [undefined, null],
    [true, null],
    [{ minutos: 45 }, null],
  ])('duracionParaMostrar(%p) da %p', (valor, esperado) => {
    expect(duracionParaMostrar(valor)).toBe(esperado);
  });

  it.each<[unknown, string | null]>([
    [0.4, null],
    ['0.4', null],
    [0.5, '1 min'],
  ])('corrección GP-06.1: duracionParaMostrar(%p) bajo 1 min da %p, nunca "0 min"', (valor, esperado) => {
    expect(duracionParaMostrar(valor)).toBe(esperado);
  });

  it.each<[string, unknown, string | null]>([
    ['número', 150, '2 h 30 min'],
    ['texto numérico', '180', '3 h'],
    ['cero', 0, null],
    ['null', null, null],
  ])('duracionMinutos como %s en la respuesta da %p', async (_caso, duracionMinutos, esperado) => {
    expect((await normalizarUno(conCampos({ duracionMinutos }))).duracion).toBe(esperado);
  });
});

describe('servicioModel: imagen', () => {
  const HTTPS = imagenServicio('valida');

  it.each<[string, Record<string, unknown>, string | undefined]>([
    ['arreglo: la primera https', { imagen: ['http://img.test/a.jpg', '', HTTPS] }, HTTPS],
    ['texto https recortado', { imagen: `  ${HTTPS}  ` }, HTTPS],
    ['texto http', { imagen: 'http://img.test/a.jpg' }, undefined],
    ['texto vacío', { imagen: '' }, undefined],
    ['solo el prefijo https', { imagen: 'https://' }, undefined],
    ['arreglo vacío', { imagen: [] }, undefined],
    ['número', { imagen: 5 }, undefined],
    ['objeto de Cloudinary con secure_url', { imagen: { secure_url: HTTPS } }, HTTPS],
    ['objeto de Cloudinary con url http', { imagen: { url: 'http://img.test/a.jpg' } }, undefined],
    ['arreglo de objetos de Cloudinary', { imagen: [{ secure_url: 'http://img.test/a.jpg' }, { url: HTTPS }] }, HTTPS],
    ['imagenes cuando imagen no sirve', { imagen: ['http://img.test/a.jpg'], imagenes: [HTTPS] }, HTTPS],
    ['ni imagen ni imagenes', { imagen: null, imagenes: null }, undefined],
  ])('%s', async (_caso, campos, esperado) => {
    expect((await normalizarUno(conCampos(campos))).imagen).toBe(esperado);
  });
});

// ── Especialistas ────────────────────────────────────────────────────────────────────────────

describe('servicioModel: especialistas', () => {
  it('corrección GP-06.1: el id es el usuarioId de la persona, no el id de la fila intermedia', async () => {
    const [especialista] = await especialistasDe([especialistaCruda(77, 900, ESPECIALISTA_UNO)]);
    expect(especialista).toEqual({ id: ESPECIALISTA_UNO.usuarioId, nombre: ESPECIALISTA_UNO.nombre, foto: undefined });
    expect(especialista.id).not.toBe(77);
  });

  it.each<[string, Record<string, unknown>, string | number]>([
    ['usuarioId numérico', { id: 77, usuarioId: 12, nombre: 'Especialista Ficticia' }, 12],
    [
      'usuario.id si falta usuarioId',
      { id: 77, usuario: { id: 'persona-respaldo', nombre: 'Especialista Ficticia' } },
      'persona-respaldo',
    ],
    [
      'usuario.id si usuarioId viene vacío',
      { id: 77, usuarioId: '  ', usuario: { id: 'persona-respaldo', nombre: 'Especialista Ficticia' } },
      'persona-respaldo',
    ],
    ['el id propio si no hay usuarioId ni usuario', { id: 77, nombre: 'Especialista Ficticia' }, 77],
    [
      'el id propio si usuario.id no sirve',
      { id: 77, usuarioId: null, usuario: { id: { anidado: 1 }, nombre: 'Especialista Ficticia' } },
      77,
    ],
    ['texto vacío si no hay ningún id', { nombre: 'Especialista Ficticia' }, ''],
  ])('corrección GP-06.1: usa %s', async (_caso, cruda, esperado) => {
    const [especialista] = await especialistasDe([cruda]);
    expect(especialista.id).toBe(esperado);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['nombre propio sobre el del usuario', { nombre: ' Nombre Propio ', usuario: { nombre: 'Nombre Usuario' } }, 'Nombre Propio'],
    ['nombre del usuario si el propio está vacío', { nombre: '  ', usuario: { nombre: 'Nombre Usuario' } }, 'Nombre Usuario'],
    ['nombre del usuario si no hay propio', { usuario: { nombre: 'Nombre Usuario' } }, 'Nombre Usuario'],
  ])('toma el %s', async (_caso, cruda, esperado) => {
    const [especialista] = await especialistasDe([{ id: 1, usuarioId: 'persona-1', ...cruda }]);
    expect(especialista.nombre).toBe(esperado);
  });

  it('descarta las especialistas sin nombre y las que no son objetos', async () => {
    const especialistas = await especialistasDe([
      null,
      'Especialista de texto',
      3,
      [especialistaCruda(1, 900, ESPECIALISTA_UNO)],
      { id: 2, usuarioId: 'sin-nombre' },
      { id: 3, usuarioId: 'nombre-vacio', nombre: '   ', usuario: { nombre: '' } },
      { id: 4, usuarioId: 'usuario-texto', usuario: 'Especialista Ficticia' },
      { id: 5, usuarioId: 'usuario-arreglo', usuario: [{ nombre: 'Especialista Ficticia' }] },
      especialistaCruda(6, 900, ESPECIALISTA_DOS),
    ]);
    expect(especialistas.map((e) => e.id)).toEqual([ESPECIALISTA_DOS.usuarioId]);
  });

  it.each<[string, unknown]>([
    ['ausentes', undefined],
    ['null', null],
    ['un objeto', especialistaCruda(1, 900, ESPECIALISTA_UNO)],
    ['un texto', 'Especialista Ficticia Uno'],
    ['un arreglo vacío', []],
  ])('especialistas como %s quedan vacías', async (_caso, valor) => {
    await expect(especialistasDe(valor)).resolves.toEqual([]);
  });

  it.each<[string, Record<string, unknown>]>([
    ['foto propia', { foto: imagenServicio('persona') }],
    ['imagen propia', { foto: 'http://img.test/x.jpg', imagen: [imagenServicio('persona')] }],
    ['foto del usuario', { usuario: { nombre: 'Especialista Ficticia', foto: imagenServicio('persona') } }],
  ])('toma la %s si es https', async (_caso, campos) => {
    const [especialista] = await especialistasDe([
      { id: 1, usuarioId: 'persona-1', nombre: 'Especialista Ficticia', ...campos },
    ]);
    expect(especialista.foto).toBe(imagenServicio('persona'));
  });

  it('ningún correo de la especialista ni del usuario llega al resultado', async () => {
    const servicio = await normalizarUno(
      conCampos({
        email: 'servicio@ejemplo.test',
        especialistas: [
          {
            ...especialistaCruda(1, 900, ESPECIALISTA_UNO),
            email: 'uno@ejemplo.test',
            correo: 'uno.correo@ejemplo.test',
            usuario: { id: ESPECIALISTA_UNO.usuarioId, nombre: ESPECIALISTA_UNO.nombre, email: 'u@ejemplo.test' },
          },
          {
            id: 2,
            usuarioId: ESPECIALISTA_DOS.usuarioId,
            usuario: { nombre: ESPECIALISTA_DOS.nombre, correo: 'dos@ejemplo.test' },
          },
        ],
      }),
    );
    expect(servicio.especialistas.map((e) => e.nombre)).toEqual([ESPECIALISTA_UNO.nombre, ESPECIALISTA_DOS.nombre]);
    expect(JSON.stringify(servicio)).not.toMatch(/@|email|correo/i);
    for (const especialista of servicio.especialistas) {
      expect(Object.keys(especialista).sort()).toEqual(['foto', 'id', 'nombre']);
    }
  });
});

// ── obtenerServicio ──────────────────────────────────────────────────────────────────────────

describe('obtenerServicio: detalle (GET /api/servicios/:id)', () => {
  it('normaliza el detalle, que no trae especialistas', async () => {
    simularServidorServicios({});
    await expect(obtenerServicio('2')).resolves.toEqual({ ...servicioEsperado(2), especialistas: [] });
  });

  it('es pública: no manda Authorization aunque la clienta tenga sesión', async () => {
    await sembrarSesion(CLIENTA);
    const llamadas = simularServidorServicios({});
    await obtenerServicio('4');
    llamadaPublica(llamadas, '/api/servicios/4');
  });

  it('codifica el id con encodeURIComponent', async () => {
    const id = 'a b/c?d=1&e#f';
    const llamadas = simularServidorServicios({});
    await capturarError(obtenerServicio(id));
    const llamada = llamadaPublica(llamadas, `/api/servicios/${encodeURIComponent(id)}`);
    expect(llamada.ruta).toBe('/api/servicios/a%20b%2Fc%3Fd%3D1%26e%23f');
  });

  it.each<[string, unknown]>([
    ['sin data', { success: true }],
    ['data null', { success: true, data: null }],
    ['data como arreglo', { success: true, data: [servicioCrudo()] }],
    ['data como texto', { success: true, data: 'servicio' }],
    ['el servicio en la raíz', servicioCrudo()],
    ['cuerpo null', null],
    ['cuerpo como arreglo', [servicioCrudo()]],
  ])('una respuesta %s falla con un error que no es ApiError', async (_caso, cuerpo) => {
    simularServidorServicios({ 'GET /api/servicios/900': () => respuesta(cuerpo) });
    const error = await capturarError(obtenerServicio('900'));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).message).toBe(MENSAJE_SIN_DATOS);
  });

  it('un servicio inactivo responde 404 a la clienta', async () => {
    simularServidorServicios({});
    const error = await capturarError(obtenerServicio('5'));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
  });
});

// ── Errores ──────────────────────────────────────────────────────────────────────────────────

describe.each<[string, () => Promise<unknown>, string]>([
  ['obtenerServicios', () => obtenerServicios(), 'GET /api/servicios'],
  ['obtenerServicio', () => obtenerServicio('1'), 'GET /api/servicios/1'],
])('%s: errores', (_nombre, leer, ruta) => {
  it('sin red llega como el ErrorDeRed de apiClient', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
    const error = await capturarError(leer());
    expect(error).toBeInstanceOf(ErrorDeRed);
    expect(error).toEqual(crearErrorApi({ tipo: 'red' }));
  });

  it.each<[number, Record<string, unknown>]>([
    [404, { statusCode: 404, message: 'Servicio no encontrado', error: 'Not Found' }],
    [500, { statusCode: 500, message: 'Error interno del servidor' }],
    [503, { statusCode: 503, message: 'Servicio no disponible', code: 'MANTENIMIENTO' }],
  ])('un %d llega como ApiError con su status, mensaje y code', async (status, cuerpo) => {
    simularServidorServicios({ [ruta]: () => respuesta(cuerpo, status) });
    const error = await capturarError(leer());
    const esperado = crearErrorApi({ tipo: 'respuesta', status, cuerpo });
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toEqual(esperado);
    expect((error as ApiError).status).toBe(status);
    expect((error as ApiError).code).toBe(esperado.code);
  });
});
