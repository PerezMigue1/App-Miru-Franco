/// <reference types="jest" />

import { destinoDeAviso, normalizarAviso, normalizarAvisos } from '@/features/notificaciones/models/avisoModel';

import {
  AVISO_CITA,
  AVISO_PEDIDO,
  AVISO_SIN_DESTINO,
  AVISOS_FICTICIOS,
  AVISOS_NORMALIZADOS,
  avisoCrudo,
  enSnakeCase,
  ID_AVISO_CITA,
  respuestaAvisos,
} from '../../helpers/avisosFicticios';

/**
 * GP-07.2 (avisos internos): normalización de las notificaciones del backend y traducción de su
 * destino (urlAccion de la web o entidadTipo + entidadId) a una ruta de la app, en
 * src/features/notificaciones/models/avisoModel.ts. Funciones puras: no hay fetch ni sesión.
 */

const MIS_CITAS = '/cliente/servicios-citas/mis-citas';
const MIS_PEDIDOS = '/cliente/tienda-online/mis-pedidos';
const MI_PERFIL = '/cliente/mi-perfil';

describe('destinoDeAviso: urlAccion de la clienta', () => {
  it.each([
    ['detalle de cita', `${MIS_CITAS}/12`, '/cita/12'],
    ['lista de citas', MIS_CITAS, '/mis-citas'],
    ['lista de citas con diagonal al final', `${MIS_CITAS}/`, '/mis-citas'],
    ['detalle de pedido', `${MIS_PEDIDOS}/7`, '/pedido/7'],
    ['lista de pedidos', MIS_PEDIDOS, '/mis-pedidos'],
    ['mi perfil', MI_PERFIL, '/perfil'],
    ['mi perfil con hash de solicitudes', `${MI_PERFIL}#privacidad-solicitudes`, '/perfil'],
    ['con espacios alrededor', `   ${MIS_PEDIDOS}/7  `, '/pedido/7'],
    ['con query', `${MIS_CITAS}/12?origen=correo&x=1`, '/cita/12'],
    ['con hash', `${MIS_CITAS}/12#detalle`, '/cita/12'],
    ['con mayúsculas', '/Cliente/Mi-Perfil', '/perfil'],
    ['id con ceros a la izquierda', `${MIS_PEDIDOS}/007`, '/pedido/7'],
    ['absoluta https', `https://www.ejemplo.test${MIS_CITAS}/12`, '/cita/12'],
    ['absoluta http con puerto, query y hash', `http://web.test:3000${MI_PERFIL}?a=1#privacidad-solicitudes`, '/perfil'],
    ['absoluta en mayúsculas', `HTTPS://WEB.TEST${MIS_PEDIDOS}`, '/mis-pedidos'],
  ])('%s → %s', (_caso, urlAccion, esperado) => {
    expect(destinoDeAviso({ urlAccion })).toBe(esperado);
  });
});

describe('destinoDeAviso: ids que no sirven en la urlAccion', () => {
  it.each([
    ['letras', 'abc'],
    ['dígitos y letras', '12a'],
    ['cero', '0'],
    ['negativo', '-3'],
    ['decimal', '1.5'],
    ['más grande que un entero seguro', '99999999999999999999'],
    ['un segmento de más', '12/extra'],
  ])('mis-citas con id %s no abre nada (sin entidad)', (_caso, id) => {
    expect(destinoDeAviso({ urlAccion: `${MIS_CITAS}/${id}` })).toBeNull();
  });

  it('mi perfil no tiene detalle: /cliente/mi-perfil/12 no abre nada', () => {
    expect(destinoDeAviso({ urlAccion: `${MI_PERFIL}/12` })).toBeNull();
  });
});

describe('destinoDeAviso: entidadTipo y entidadId cuando la urlAccion no se traduce', () => {
  it.each([
    ['sin urlAccion, cita con id numérico', undefined, 'cita', 12, '/cita/12'],
    ['urlAccion null, pedido con id en texto', null, 'pedido', '7', '/pedido/7'],
    ['urlAccion vacía, tipo con espacios y mayúsculas', '', ' Cita ', 12, '/cita/12'],
    ['urlAccion que no es texto', 42, 'pedido', 7, '/pedido/7'],
    ['urlAccion de la clienta sin pantalla', '/cliente/inicio', 'cita', '12', '/cita/12'],
    ['urlAccion con id no numérico', `${MIS_CITAS}/abc`, 'cita', 12, '/cita/12'],
    ['urlAccion absoluta de otra página', 'https://web.test/aviso-de-privacidad', 'pedido', 7, '/pedido/7'],
  ])('%s → %s', (_caso, urlAccion, entidadTipo, entidadId, esperado) => {
    expect(destinoDeAviso({ urlAccion, entidadTipo, entidadId })).toBe(esperado);
  });

  it.each([
    ['venta_local', 5],
    ['solicitud_arco', 3],
    ['otro_tipo', 9],
    ['cita', 'abc'],
    ['cita', 12.5],
    ['pedido', -7],
    ['pedido', 0],
    ['cita', null],
    [null, 12],
    [{ tipo: 'cita' }, 12],
  ])('entidadTipo %p con entidadId %p no abre nada', (entidadTipo, entidadId) => {
    expect(destinoDeAviso({ entidadTipo, entidadId })).toBeNull();
  });

  it('sin ningún dato no abre nada', () => {
    expect(destinoDeAviso({})).toBeNull();
  });
});

describe('destinoDeAviso: avisos del personal nunca abren nada', () => {
  it.each([
    '/operacion/citas/12',
    '/admin/pedidos/7',
    '/admin',
    '  /operacion/agenda?dia=hoy  ',
    'https://web.test/operacion/citas/12#detalle',
  ])('%s, aunque la entidad sea una cita', (urlAccion) => {
    expect(destinoDeAviso({ urlAccion, entidadTipo: 'cita', entidadId: 12 })).toBeNull();
  });
});

describe('normalizarAviso', () => {
  it.each(AVISOS_FICTICIOS.map((crudo, i) => [crudo.titulo, crudo, AVISOS_NORMALIZADOS[i]]))(
    'aviso ficticio "%s"',
    (_titulo, crudo, esperado) => {
      expect(normalizarAviso(crudo)).toEqual(esperado);
    },
  );

  it('acepta urlAccion, entidadTipo, entidadId y creadoEn en snake_case', () => {
    expect(normalizarAviso(enSnakeCase(AVISO_CITA))).toEqual(AVISOS_NORMALIZADOS[0]);
  });

  it('en snake_case también usa la entidad si url_accion no se traduce', () => {
    const crudo = enSnakeCase({ ...AVISO_PEDIDO, urlAccion: '/cliente/inicio' });

    expect(normalizarAviso(crudo)?.destino).toBe('/pedido/7');
  });

  it('recorta id, título, mensaje y tipo', () => {
    const crudo = avisoCrudo({ id: `  ${ID_AVISO_CITA} `, tipo: ' cita ', titulo: '  Hola  ', mensaje: '\n Texto \t' });

    expect(normalizarAviso(crudo)).toMatchObject({ id: ID_AVISO_CITA, tipo: 'cita', titulo: 'Hola', mensaje: 'Texto' });
  });

  it.each([
    ['vacío', '   '],
    ['ausente', undefined],
    ['que no es texto', { es: 'objeto' }],
  ])('con título %s y mensaje, el título es "Aviso"', (_caso, titulo) => {
    expect(normalizarAviso(avisoCrudo({ titulo, mensaje: 'Solo mensaje' }))).toMatchObject({
      titulo: 'Aviso',
      mensaje: 'Solo mensaje',
    });
  });

  it('con título y sin mensaje, el mensaje queda vacío', () => {
    expect(normalizarAviso(avisoCrudo({ titulo: 'Solo título', mensaje: null }))).toMatchObject({
      titulo: 'Solo título',
      mensaje: '',
    });
  });

  it.each([
    [true, true],
    ['true', false],
    [1, false],
    [null, false],
    [undefined, false],
  ])('leida %p → %p', (leida, esperado) => {
    expect(normalizarAviso(avisoCrudo({ leida }))?.leida).toBe(esperado);
  });

  it.each([
    ['ISO con espacios', '  2026-10-20T18:30:00.000Z ', '2026-10-20T18:30:00.000Z'],
    ['texto que no es fecha', 'ayer en la tarde', null],
    ['vacía', '', null],
    ['número (milisegundos)', 1_760_000_000_000, null],
    ['null', null, null],
  ])('fecha %s → %p', (_caso, creadoEn, esperado) => {
    expect(normalizarAviso(avisoCrudo({ creadoEn }))?.fecha).toBe(esperado);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['texto', 'aviso'],
    ['número', 42],
    ['arreglo', [AVISO_CITA]],
    ['objeto vacío', {}],
    ['sin id', avisoCrudo({ id: undefined })],
    ['id vacío', avisoCrudo({ id: '   ' })],
    ['id numérico', avisoCrudo({ id: 15 })],
    ['sin título ni mensaje', avisoCrudo({ titulo: ' ', mensaje: '' })],
    ['título y mensaje que no son texto', avisoCrudo({ titulo: ['x'], mensaje: { y: 1 } })],
  ])('entrada inválida (%s) → null', (_caso, crudo) => {
    expect(normalizarAviso(crudo)).toBeNull();
  });
});

describe('normalizarAvisos', () => {
  it.each([
    ['la respuesta { success, count, data }', respuestaAvisos()],
    ['un arreglo', [...AVISOS_FICTICIOS]],
  ])('acepta %s y conserva el orden', (_caso, crudo) => {
    expect(normalizarAvisos(crudo)).toEqual(AVISOS_NORMALIZADOS);
  });

  it('descarta los avisos inválidos y conserva los buenos', () => {
    const crudo = respuestaAvisos([AVISO_CITA, null, 'basura', { titulo: 'Sin id' }, 7, AVISO_SIN_DESTINO]);

    expect(normalizarAvisos(crudo).map((aviso) => aviso.id)).toEqual([AVISOS_NORMALIZADOS[0].id, AVISOS_NORMALIZADOS[2].id]);
  });

  it.each([
    ['null', null],
    ['texto', '<html>Error</html>'],
    ['data que no es arreglo', { success: true, data: 'nada' }],
    ['sin data', { success: true, count: 0 }],
    ['data vacía', respuestaAvisos([])],
  ])('respuesta sin avisos utilizables (%s) → []', (_caso, crudo) => {
    expect(normalizarAvisos(crudo)).toEqual([]);
  });
});
