/// <reference types="jest" />

import {
  ALT_FOTO_SIN_SERVICIO,
  normalizarEquipo,
  normalizarGaleria,
  normalizarPreguntas,
  normalizarPromociones,
} from '@/features/salon/models/contenidoSalonModel';

import {
  cuerpoLista,
  EQUIPO_ESPERADO,
  equipoCrudo,
  GALERIA_ESPERADA,
  galeriaCruda,
  PREGUNTAS_ESPERADAS,
  preguntasCrudas,
  PROMOCIONES_ESPERADAS,
  promocionesCrudas,
} from '../../helpers/contenidoFicticio';

/**
 * GP-07.3: normalización del contenido público del salón (src/features/salon/models/
 * contenidoSalonModel.ts). Funciones puras: reciben la respuesta cruda del servidor (arreglo suelto
 * o { data }) y devuelven solo lo que la app puede mostrar, como la web.
 */

type Normalizar = (respuesta: unknown) => unknown[];
type Crudo = Record<string, unknown>;

const SECCIONES: [string, Normalizar, () => Crudo[], unknown[]][] = [
  ['promociones', normalizarPromociones, promocionesCrudas, PROMOCIONES_ESPERADAS],
  ['preguntas', normalizarPreguntas, preguntasCrudas, PREGUNTAS_ESPERADAS],
  ['equipo', normalizarEquipo, equipoCrudo, EQUIPO_ESPERADO],
  ['galería', normalizarGaleria, galeriaCruda, GALERIA_ESPERADA],
];

const RESPUESTAS_NO_VALIDAS: [string, unknown][] = [
  ['null', null],
  ['undefined', undefined],
  ['un texto', 'sin contenido'],
  ['un número', 42],
  ['un objeto sin data', { success: true }],
  ['data que no es arreglo', { success: true, data: 'no es lista' }],
  ['data null', { success: true, data: null }],
];

const promocion = (cambios: Crudo): Crudo => ({ ...promocionesCrudas()[1], ...cambios });
const pregunta = (cambios: Crudo): Crudo => ({ ...preguntasCrudas()[1], ...cambios });
const integrante = (cambios: Crudo): Crudo => ({ ...equipoCrudo()[1], ...cambios });
const foto = (cambios: Crudo): Crudo => ({ ...galeriaCruda()[1], ...cambios });

describe.each(SECCIONES)('%s', (_seccion, normalizar, crudos, esperado) => {
  it('normaliza la respuesta completa { success, data }: recorta textos y conserva el orden', () => {
    expect(normalizar(cuerpoLista(crudos()))).toEqual(esperado);
  });

  it('acepta un arreglo suelto', () => {
    expect(normalizar(crudos())).toEqual(esperado);
  });

  it.each(RESPUESTAS_NO_VALIDAS)('una respuesta no válida (%s) da []', (_nombre, respuesta) => {
    expect(normalizar(respuesta)).toEqual([]);
  });

  it('ignora los elementos que no son objetos', () => {
    expect(normalizar([null, 'texto', 7, [crudos()[0]]])).toEqual([]);
  });
});

describe('descarta elementos sin los campos obligatorios o con tipos equivocados', () => {
  it.each<[string, Normalizar, Crudo]>([
    ['promoción sin id', normalizarPromociones, promocion({ id: undefined })],
    ['promoción con id de texto', normalizarPromociones, promocion({ id: '12' })],
    ['promoción con id no finito', normalizarPromociones, promocion({ id: Number.NaN })],
    ['promoción sin título', normalizarPromociones, promocion({ titulo: undefined })],
    ['promoción con título en blanco', normalizarPromociones, promocion({ titulo: '   ' })],
    ['promoción con título numérico', normalizarPromociones, promocion({ titulo: 5 })],
    ['promoción sin descripción', normalizarPromociones, promocion({ descripcion: null })],
    ['pregunta sin id', normalizarPreguntas, pregunta({ id: undefined })],
    ['pregunta con id de texto', normalizarPreguntas, pregunta({ id: '22' })],
    ['pregunta vacía', normalizarPreguntas, pregunta({ pregunta: '' })],
    ['pregunta sin respuesta', normalizarPreguntas, pregunta({ respuesta: undefined })],
    ['pregunta con respuesta numérica', normalizarPreguntas, pregunta({ respuesta: 3 })],
    ['integrante sin nombre', normalizarEquipo, integrante({ nombre: '' })],
    ['integrante con nombre numérico', normalizarEquipo, integrante({ nombre: 9 })],
    ['integrante sin puesto', normalizarEquipo, integrante({ puesto: undefined })],
    ['integrante oculto (visible: false)', normalizarEquipo, integrante({ visible: false })],
    ['integrante no disponible (disponible: false)', normalizarEquipo, integrante({ disponible: false })],
    ['foto sin id', normalizarGaleria, foto({ id: undefined })],
    ['foto con id de texto', normalizarGaleria, foto({ id: '32' })],
    ['foto sin url', normalizarGaleria, foto({ url: undefined })],
    ['foto con url http', normalizarGaleria, foto({ url: 'http://imagenes.test/foto.jpg' })],
    ['foto con url sin ruta', normalizarGaleria, foto({ url: 'https://' })],
    ['foto oculta (visible: false)', normalizarGaleria, foto({ visible: false })],
  ])('%s', (_caso, normalizar, crudo) => {
    expect(normalizar([crudo])).toEqual([]);
  });
});

describe('campos opcionales', () => {
  it.each<[string, Normalizar, Crudo, string, unknown]>([
    ['imagen http de promoción', normalizarPromociones, promocion({ imagenUrl: 'http://imagenes.test/a.jpg' }), 'imagenUrl', null],
    ['imagen vacía de promoción', normalizarPromociones, promocion({ imagenUrl: '' }), 'imagenUrl', null],
    [
      'imagen de promoción como objeto de Cloudinary',
      normalizarPromociones,
      promocion({ imagenUrl: { secure_url: 'https://imagenes.test/b.jpg' } }),
      'imagenUrl',
      'https://imagenes.test/b.jpg',
    ],
    ['enlace interno', normalizarPromociones, promocion({ enlace: ' /cliente/tienda ' }), 'enlace', '/cliente/tienda'],
    ['enlace https', normalizarPromociones, promocion({ enlace: 'https://sitio.test/promo' }), 'enlace', 'https://sitio.test/promo'],
    ['enlace http', normalizarPromociones, promocion({ enlace: 'http://sitio.test/promo' }), 'enlace', null],
    ['enlace sin protocolo "//"', normalizarPromociones, promocion({ enlace: '//sitio.test/promo' }), 'enlace', null],
    ['enlace con otro esquema', normalizarPromociones, promocion({ enlace: 'javascript:void(0)' }), 'enlace', null],
    ['enlace numérico', normalizarPromociones, promocion({ enlace: 5 }), 'enlace', null],
    ['vigencia con otro formato', normalizarPromociones, promocion({ vigenteDesde: '01/10/2026' }), 'vigenteDesde', null],
    ['vigencia numérica', normalizarPromociones, promocion({ vigenteHasta: 20261130 }), 'vigenteHasta', null],
    ['destacada como texto', normalizarPromociones, promocion({ destacada: 'true' }), 'destacada', false],
    ['foto http de integrante', normalizarEquipo, integrante({ foto: 'http://imagenes.test/c.jpg' }), 'foto', null],
    ['foto numérica de integrante', normalizarEquipo, integrante({ foto: 4 }), 'foto', null],
    ['presentación en blanco', normalizarEquipo, integrante({ bio: '   ' }), 'bio', null],
    ['presentación numérica', normalizarEquipo, integrante({ bio: 8 }), 'bio', null],
    ['integrante visible y disponible', normalizarEquipo, integrante({ visible: true, disponible: true }), 'nombre', 'Integrante Ficticio Dos'],
  ])('%s', (_caso, normalizar, crudo, campo, valor) => {
    expect(normalizar([crudo])).toEqual([expect.objectContaining({ [campo]: valor })]);
  });
});

describe('galería', () => {
  it('solo deja las fotos visibles, en el orden del servidor', () => {
    const [uno, dos, tres] = galeriaCruda();
    const fotos = normalizarGaleria(cuerpoLista([tres, { ...dos, visible: false }, { ...uno, visible: true }]));
    expect(fotos.map((f) => f.id)).toEqual([33, 31]);
  });

  it('si viene `orden` numérico, ordena por él de forma estable y deja al final las que no lo traen', () => {
    const [uno, dos, tres] = galeriaCruda();
    const fotos = normalizarGaleria([
      { ...uno, orden: 2 },
      { ...dos, id: 40 },
      { ...tres, orden: 1 },
      { ...dos, orden: 1 },
      { ...uno, id: 41, orden: '0' },
    ]);
    expect(fotos.map((f) => f.id)).toEqual([33, 32, 31, 40, 41]);
  });

  it.each<[string, Crudo, string]>([
    ['alt recortado', foto({ alt: '  Trenza ficticia  ' }), 'Trenza ficticia'],
    ['sin alt y con servicio', foto({ alt: '', servicio: { id: 3, nombre: 'Peinado de prueba', categoria: 'Peinados' } }), 'Foto de Peinado de prueba'],
    ['alt en blanco y sin servicio', foto({ alt: '   ', servicio: null }), ALT_FOTO_SIN_SERVICIO],
    ['alt numérico y sin servicio', foto({ alt: 12, servicio: undefined }), ALT_FOTO_SIN_SERVICIO],
  ])('texto alternativo: %s', (_caso, crudo, alt) => {
    expect(normalizarGaleria([crudo])[0].alt).toBe(alt);
  });

  it.each<[string, unknown, unknown]>([
    ['null', null, null],
    ['un texto', 'Corte', null],
    ['sin nombre', { id: 1, nombre: ' ', categoria: 'Cortes' }, null],
    ['con id de texto', { id: '1', nombre: 'Corte de prueba', categoria: 'Cortes' }, null],
    ['sin categoría', { id: 1, nombre: ' Corte de prueba ' }, { id: 1, nombre: 'Corte de prueba', categoria: '' }],
  ])('servicio %s', (_caso, servicio, esperado) => {
    expect(normalizarGaleria([foto({ servicio })])[0].servicio).toEqual(esperado);
  });
});
