/// <reference types="jest" />

import {
  FORMULARIO_REACEPTACION,
  RUTA_REACEPTACION,
  aceptarPendiente,
  completarDatos,
  leerPendientes,
  esVersionCambiada,
  normalizarPendiente,
  type DocumentoPendiente,
} from '@/features/auth/models/documentosPendientes';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';

import {
  HASH_AVISO,
  RUTA_CONSENTIMIENTOS,
  RUTA_PENDIENTES,
  pendienteCrudo,
  pendienteTerminos,
  respuestaConsentimientoGuardado,
  respuestaPendientes,
  versionNoPublicada400,
  vigenteCrudo,
} from '../../helpers/documentosPendientes';
import { saturacion503 } from '../../helpers/limitesRed';
import { llamadasA, respuesta, servidorConRutas } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';

/**
 * GP-09, bloque A: modelo de los documentos legales pendientes. Normaliza lo que manda el backend sin
 * nombres ni versiones fijos, completa el título y la ruta del vigente (también de un slug que la app
 * no conoce) y acepta con el cuerpo exacto de POST /api/consentimientos. fetch simulado en
 * http://api.test.
 */

const simular = servidorConRutas({});

beforeEach(async () => {
  reiniciarDocumentosLegales();
  await sembrarSesion({ id: 'clienta-legal-1', nombre: 'Clienta Legal', email: 'legal@ejemplo.test', rol: 'cliente' });
});

describe('normalizarPendiente', () => {
  it('se queda con tipo, slug, versión, hash, vigencia y la versión aceptada', () => {
    expect(normalizarPendiente(pendienteCrudo())).toEqual({
      tipo: 'aviso_privacidad',
      slug: 'aviso-privacidad',
      version: '2.1',
      hash: HASH_AVISO,
      vigenteDesde: '2026-10-20',
      versionAceptada: '2.0',
    });
  });

  it('sin versión aceptada (o con una mal formada) queda en null', () => {
    expect(normalizarPendiente(pendienteTerminos())?.versionAceptada).toBeNull();
    expect(normalizarPendiente(pendienteCrudo({ versionAceptada: 'dos' }))?.versionAceptada).toBeNull();
  });

  it('acepta un documento y un tipo que la app no conoce', () => {
    expect(normalizarPendiente(pendienteCrudo({ tipo: 'facturacion', documentoSlug: 'aviso-facturacion' }))).toMatchObject({
      tipo: 'facturacion',
      slug: 'aviso-facturacion',
    });
  });

  it.each([
    ['sin tipo', { tipo: '' }],
    ['tipo con mayúsculas', { tipo: 'Aviso' }],
    ['slug con diagonal', { documentoSlug: 'aviso/../x' }],
    ['versión sin punto', { version: '21' }],
    ['hash corto', { hash: 'abc' }],
    ['fecha imposible', { vigenteDesde: '2026-02-31' }],
  ])('descarta un pendiente %s', (_caso, cambios) => {
    expect(normalizarPendiente(pendienteCrudo(cambios))).toBeNull();
  });

  it('descarta lo que no es un objeto', () => {
    expect(normalizarPendiente(null)).toBeNull();
    expect(normalizarPendiente(['aviso'])).toBeNull();
  });
});

/** La lista con el título y la página del vigente, como la deja la pantalla al terminar de completarla. */
const consultarPendientes = async () => completarDatos(await leerPendientes());

describe('leerPendientes con completarDatos', () => {
  it('completa el título y la ruta del documento vigente de cada pendiente', async () => {
    const llamadas = simular({
      [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo(), pendienteTerminos()]),
      'GET /api/documentos-legales/aviso-privacidad/vigente': () =>
        vigenteCrudo('aviso-privacidad', 'Aviso de Privacidad', '/aviso-de-privacidad'),
      'GET /api/documentos-legales/terminos/vigente': () =>
        vigenteCrudo('terminos', 'Términos y Condiciones', '/terminos-y-condiciones'),
    });

    const pendientes = await consultarPendientes();

    expect(pendientes.map(({ slug, titulo, ruta }) => ({ slug, titulo, ruta }))).toEqual([
      { slug: 'aviso-privacidad', titulo: 'Aviso de Privacidad', ruta: '/aviso-de-privacidad' },
      { slug: 'terminos', titulo: 'Términos y Condiciones', ruta: '/terminos-y-condiciones' },
    ]);
    const consulta = llamadasA(llamadas, 'GET', RUTA_PENDIENTES);
    expect(consulta).toHaveLength(1);
    expect(consulta[0].cabeceras.Authorization).toMatch(/^Bearer /);
  });

  it('un slug desconocido pide su vigente directo; sin ruta del sitio queda sin enlace', async () => {
    simular({
      [`GET ${RUTA_PENDIENTES}`]: () =>
        respuestaPendientes([
          pendienteCrudo({ tipo: 'facturacion', documentoSlug: 'aviso-facturacion' }),
          pendienteCrudo({ tipo: 'nuevo', documentoSlug: 'nuevo-documento' }),
        ]),
      'GET /api/documentos-legales/aviso-facturacion/vigente': () =>
        vigenteCrudo('aviso-facturacion', 'Aviso de facturación', '/aviso-facturacion'),
      'GET /api/documentos-legales/nuevo-documento/vigente': () =>
        vigenteCrudo('nuevo-documento', 'Documento nuevo', 'https://otro.test/x'),
    });

    const pendientes = await consultarPendientes();

    expect(pendientes[0]).toMatchObject({ titulo: 'Aviso de facturación', ruta: '/aviso-facturacion' });
    expect(pendientes[1]).toMatchObject({ titulo: 'Documento nuevo', ruta: null });
  });

  it('sin el vigente: el título y la ruta de respaldo de un slug conocido; vacío en uno desconocido', async () => {
    simular({
      [`GET ${RUTA_PENDIENTES}`]: () =>
        respuestaPendientes([pendienteCrudo(), pendienteCrudo({ tipo: 'nuevo', documentoSlug: 'nuevo-documento' })]),
    });

    const pendientes = await consultarPendientes();

    expect(pendientes[0]).toMatchObject({ titulo: 'Aviso de Privacidad', ruta: '/aviso-de-privacidad' });
    expect(pendientes[1]).toMatchObject({ titulo: '', ruta: null });
  });

  it('un vigente desconocido sin datos deja el título vacío', async () => {
    simular({
      [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo({ tipo: 'nuevo', documentoSlug: 'nuevo-documento' })]),
      'GET /api/documentos-legales/nuevo-documento/vigente': () => respuesta({ success: true }),
    });

    expect((await consultarPendientes())[0]).toMatchObject({ titulo: '', ruta: null });
  });

  it('quita los pendientes inválidos y los repetidos', async () => {
    simular({
      [`GET ${RUTA_PENDIENTES}`]: () =>
        respuestaPendientes([pendienteCrudo(), pendienteCrudo(), pendienteCrudo({ hash: 'x' }), 'basura']),
    });

    expect(await consultarPendientes()).toHaveLength(1);
  });

  it('sin pendientes devuelve una lista vacía', async () => {
    simular({ [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([]) });

    expect(await consultarPendientes()).toEqual([]);
  });

  it('una respuesta sin lista es un error del servidor', async () => {
    simular({ [`GET ${RUTA_PENDIENTES}`]: () => respuesta({ success: true, data: null }) });

    await expect(consultarPendientes()).rejects.toBeInstanceOf(ApiError);
  });

  it('el 503 y la falta de red llegan tal cual a quien llama', async () => {
    simular({ [`GET ${RUTA_PENDIENTES}`]: () => saturacion503(null) });
    await expect(consultarPendientes()).rejects.toMatchObject({ status: 503 });

    globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
    await expect(consultarPendientes()).rejects.toBeInstanceOf(ErrorDeRed);
  });
});

describe('leerPendientes y completarDatos', () => {
  it('leerPendientes solo pide la lista: los títulos y rutas son los de respaldo', async () => {
    const llamadas = simular({
      [`GET ${RUTA_PENDIENTES}`]: () =>
        respuestaPendientes([pendienteCrudo(), pendienteCrudo({ tipo: 'nuevo', documentoSlug: 'documento-nuevo' })]),
    });

    const lista = await leerPendientes();

    expect(lista.map(({ titulo, ruta }) => ({ titulo, ruta }))).toEqual([
      { titulo: 'Aviso de Privacidad', ruta: '/aviso-de-privacidad' },
      { titulo: '', ruta: null },
    ]);
    expect(llamadas.map((llamada) => llamada.ruta)).toEqual([RUTA_PENDIENTES]);
  });

  it('completarDatos trae el título y la ruta del vigente y nunca rechaza', async () => {
    simular({
      [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo()]),
      'GET /api/documentos-legales/aviso-privacidad/vigente': () =>
        vigenteCrudo('aviso-privacidad', 'Aviso de Privacidad del salón', '/aviso-de-privacidad'),
    });
    const lista = await leerPendientes();

    expect((await completarDatos(lista))[0]).toMatchObject({ titulo: 'Aviso de Privacidad del salón' });
    expect(await completarDatos([])).toEqual([]);
  });
});

describe('aceptarPendiente', () => {
  const pendiente: DocumentoPendiente = {
    tipo: 'aviso_privacidad',
    slug: 'aviso-privacidad',
    version: '2.1',
    hash: HASH_AVISO,
    vigenteDesde: '2026-10-20',
    versionAceptada: '2.0',
    titulo: 'Aviso de Privacidad',
    ruta: '/aviso-de-privacidad',
  };

  it('manda el tipo, el slug, la versión y el hash que dio el backend, con el formulario de la web', async () => {
    const llamadas = simular({ [`POST ${RUTA_CONSENTIMIENTOS}`]: () => respuestaConsentimientoGuardado() });

    await aceptarPendiente(pendiente);

    const envios = llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS);
    expect(envios).toHaveLength(1);
    expect(envios[0].cuerpo).toEqual({
      items: [{ tipo: 'aviso_privacidad', documentoSlug: 'aviso-privacidad', version: '2.1', hash: HASH_AVISO, accion: 'aceptado' }],
      formulario: FORMULARIO_REACEPTACION,
      rutaOrigen: RUTA_REACEPTACION,
    });
    expect(FORMULARIO_REACEPTACION).toBe('reaceptacion');
  });

  it('el 400 de versión cambiada se reconoce por su estado', async () => {
    simular({ [`POST ${RUTA_CONSENTIMIENTOS}`]: () => versionNoPublicada400() });

    const error = await aceptarPendiente(pendiente).catch((causa: unknown) => causa);

    expect(esVersionCambiada(error)).toBe(true);
    expect(esVersionCambiada(new ApiError(409, 'x'))).toBe(false);
    expect(esVersionCambiada(new ErrorDeRed())).toBe(false);
  });
});
