/// <reference types="jest" />

import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import {
  abrirDocumentoEnWeb,
  documentoEnMemoria,
  estadoDocumento,
  esSlugDocumentoLegal,
  fechaVigenciaLegible,
  normalizarDocumento,
  obtenerDocumentoVigente,
  reiniciarDocumentosLegales,
  RUTA_DOCUMENTO_LEGAL,
  rutaVisorDocumento,
  SLUGS_DOCUMENTO_LEGAL,
  suscribir,
  TITULO_DOCUMENTO_LEGAL,
  urlDocumentoEnWeb,
  VIGENCIA_DOCUMENTO_MS,
} from '@/shared/api/documentosLegales';

import { fallarArchivos, limpiarArchivos, sembrarArchivo } from '../../helpers/archivosLocales';
import {
  abrirNavegadorSimulado,
  ARCHIVO_DOCUMENTOS,
  archivoDocumentos,
  contenidoArchivoDocumentos,
  documentoCrudo,
  documentoGuardado,
  documentoNormalizado,
  HTML_FICTICIO,
  rutaDocumento,
  rutaSinVersion,
  rutaVigente,
  sembrarDocumentosGuardados,
  sinRed,
  WEB,
} from '../../helpers/documentosFicticios';
import { servidorConRutas, type Llamada } from '../../helpers/servidorSimulado';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: repositorio de documentos legales (src/shared/api/documentosLegales.ts). Memoria vigente,
 * red, archivo guardado y null; la validación de versión, hash, fecha y ruta; el 404; la petición
 * compartida; los suscriptores; y la página en el sitio. fetch, el disco y el navegador van simulados.
 */

const simularServidor = servidorConRutas({});
const pedidas = (llamadas: Llamada[], slug = 'anticipos') => llamadas.filter((l) => l.ruta === rutaVigente(slug));

beforeEach(() => {
  reiniciarDocumentosLegales();
  limpiarArchivos();
  abrirNavegadorSimulado().mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('normalizarDocumento', () => {
  it('se queda con los campos del documento, sin el html', () => {
    const documento = normalizarDocumento(documentoCrudo(), 'anticipos');

    expect(documento).toEqual(documentoNormalizado());
    expect(JSON.stringify(documento)).not.toContain(HTML_FICTICIO);
    expect(Object.isFrozen(documento)).toBe(true);
  });

  it('sin título usa el de respaldo y requiereAceptacion solo es false si así viene', () => {
    expect(normalizarDocumento(documentoCrudo('terminos', { titulo: 5, requiereAceptacion: 'no' }), 'terminos')).toEqual(
      documentoNormalizado('terminos', { titulo: 'Términos y Condiciones', requiereAceptacion: true }),
    );
    expect(normalizarDocumento(documentoCrudo('cookies', { requiereAceptacion: false }), 'cookies')?.requiereAceptacion).toBe(false);
  });

  it.each([
    ['versión sin punto', { version: '2' }],
    ['versión con letras', { version: 'v2.3' }],
    ['hash corto', { hash: 'a'.repeat(63) }],
    ['hash en mayúsculas', { hash: 'A'.repeat(64) }],
    ['fecha con hora', { vigenteDesde: '2026-10-14T00:00:00Z' }],
    ['fecha que no existe', { vigenteDesde: '2026-02-31' }],
    ['ruta sin diagonal', { ruta: 'politica-de-reembolsos' }],
    ['ruta a otro dominio', { ruta: '//otro.test/politica' }],
    ['otro slug', { slug: 'terminos' }],
  ])('%s: el documento no sirve', (_caso, cambios) => {
    expect(normalizarDocumento(documentoCrudo('anticipos', cambios), 'anticipos')).toBeNull();
  });

  it('lo que no es objeto no sirve', () => {
    expect(normalizarDocumento(null, 'anticipos')).toBeNull();
    expect(normalizarDocumento([documentoCrudo()], 'anticipos')).toBeNull();
  });
});

describe('obtenerDocumentoVigente', () => {
  it('de la red: lo deja en memoria y en el archivo, sin el html', async () => {
    const llamadas = simularServidor(rutaDocumento());

    await expect(obtenerDocumentoVigente('anticipos')).resolves.toEqual({ documento: documentoNormalizado(), origen: 'red' });

    expect(pedidas(llamadas)).toHaveLength(1);
    expect(llamadas[0].cabeceras).not.toHaveProperty('Authorization');
    expect(documentoEnMemoria('anticipos')).toEqual(documentoNormalizado());
    expect(archivoDocumentos()).toEqual({ version: 1, documentos: { anticipos: { documento: documentoNormalizado(), leidoEn: expect.any(Number) } } });
  });

  it('en memoria vigente no vuelve a pedir; al vencer o con forzarRed sí', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-22T16:00:00.000Z') });
    const llamadas = simularServidor(rutaDocumento());

    await obtenerDocumentoVigente('anticipos');
    await expect(obtenerDocumentoVigente('anticipos')).resolves.toEqual({ documento: documentoNormalizado(), origen: 'memoria' });
    expect(pedidas(llamadas)).toHaveLength(1);

    await obtenerDocumentoVigente('anticipos', { forzarRed: true });
    expect(pedidas(llamadas)).toHaveLength(2);

    jest.setSystemTime(Date.now() + VIGENCIA_DOCUMENTO_MS);
    await expect(obtenerDocumentoVigente('anticipos')).resolves.toMatchObject({ origen: 'red' });
    expect(pedidas(llamadas)).toHaveLength(3);
  });

  it('dos llamadas a la vez comparten una sola petición', async () => {
    const llamadas = simularServidor(rutaDocumento());

    const [primera, segunda] = await Promise.all([obtenerDocumentoVigente('anticipos'), obtenerDocumentoVigente('anticipos')]);

    expect(primera).toBe(segunda);
    expect(pedidas(llamadas)).toHaveLength(1);
  });

  it('cada slug se pide y se guarda por separado en el mismo archivo', async () => {
    simularServidor({ ...rutaDocumento('terminos'), ...rutaDocumento('anticipos') });

    await obtenerDocumentoVigente('terminos');
    await obtenerDocumentoVigente('anticipos');

    expect(Object.keys(archivoDocumentos()?.documentos ?? {}).sort()).toEqual(['anticipos', 'terminos']);
    expect(documentoEnMemoria('cookies')).toBeNull();
  });

  it('sin red con archivo guardado: la versión guardada, de origen archivo y con el error', async () => {
    sembrarDocumentosGuardados();
    sinRed();

    const resultado = await obtenerDocumentoVigente('anticipos');

    expect(resultado).toEqual({ documento: documentoGuardado(), origen: 'archivo', error: expect.any(ErrorDeRed) });
    expect(estadoDocumento('anticipos')).toEqual({ documento: documentoGuardado(), origen: 'archivo', leidoEn: null });
  });

  it('sin red ni archivo: null, sin versión, hash ni fecha de respaldo', async () => {
    sinRed();

    await expect(obtenerDocumentoVigente('anticipos')).resolves.toEqual({
      documento: null,
      origen: null,
      error: expect.any(ErrorDeRed),
    });
    expect(documentoEnMemoria('anticipos')).toBeNull();
  });

  it('sin red después de una lectura vencida: la de memoria con origen memoria', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-22T16:00:00.000Z') });
    simularServidor(rutaDocumento());
    await obtenerDocumentoVigente('anticipos');
    jest.setSystemTime(Date.now() + VIGENCIA_DOCUMENTO_MS);
    sinRed();

    await expect(obtenerDocumentoVigente('anticipos')).resolves.toEqual({
      documento: documentoNormalizado(),
      origen: 'memoria',
      error: expect.any(ErrorDeRed),
    });
  });

  it('un 404 da null sin usar lo guardado y lo quita de la memoria', async () => {
    simularServidor(rutaDocumento());
    await obtenerDocumentoVigente('anticipos');
    const oyente = jest.fn();
    suscribir(oyente);
    simularServidor(rutaSinVersion());

    const resultado = await obtenerDocumentoVigente('anticipos', { forzarRed: true });

    expect(resultado).toEqual({ documento: null, origen: null, error: expect.any(ApiError) });
    expect((resultado.error as ApiError).status).toBe(404);
    expect(documentoEnMemoria('anticipos')).toBeNull();
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['hash mal formado', { success: true, data: documentoCrudo('anticipos', { hash: 'no-es-un-hash' }) }, 200],
    ['versión mal formada', { success: true, data: documentoCrudo('anticipos', { version: '2.3.1' }) }, 200],
    ['sin data', { success: true }, 200],
    ['un cuerpo que no es objeto', ['lista ficticia'], 200],
    ['error del servidor', { message: 'Detalle técnico' }, 500],
  ])('respuesta con %s: no se usa ni pisa lo guardado', async (_caso, cuerpo, status) => {
    sembrarDocumentosGuardados();
    simularServidor(rutaDocumento('anticipos', cuerpo, status));

    const resultado = await obtenerDocumentoVigente('anticipos');

    expect(resultado).toMatchObject({ documento: documentoGuardado(), origen: 'archivo' });
    expect(resultado.error).toBeDefined();
    expect(archivoDocumentos()?.documentos.anticipos.documento).toEqual(documentoGuardado());
  });

  it.each([
    ['otra versión de formato', contenidoArchivoDocumentos({ anticipos: documentoGuardado() }, 2)],
    ['JSON dañado', '{"version":1,'],
    ['sin documentos', JSON.stringify({ version: 1 })],
    ['un documento inválido', contenidoArchivoDocumentos({ anticipos: { ...documentoGuardado(), hash: 'x' } })],
  ])('archivo con %s: no se usa', async (_caso, contenido) => {
    sembrarArchivo(ARCHIVO_DOCUMENTOS, contenido);
    sinRed();

    await expect(obtenerDocumentoVigente('anticipos')).resolves.toMatchObject({ documento: null, origen: null });
  });

  it('sin red otra vez: sigue con la versión guardada que ya subió a la memoria', async () => {
    sembrarDocumentosGuardados();
    sinRed();
    await obtenerDocumentoVigente('anticipos');
    limpiarArchivos();

    await expect(obtenerDocumentoVigente('anticipos')).resolves.toMatchObject({ documento: documentoGuardado(), origen: 'archivo' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('sin URL de la API cuenta como sin red', async () => {
    const api = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = '';
    try {
      await expect(obtenerDocumentoVigente('anticipos')).resolves.toEqual({
        documento: null,
        origen: null,
        error: expect.any(ErrorDeRed),
      });
    } finally {
      process.env.EXPO_PUBLIC_API_URL = api;
    }
  });

  it('si el disco falla, la lectura de red sirve igual y sin red no hay versión', async () => {
    fallarArchivos({ acceso: true });
    simularServidor(rutaDocumento());

    await expect(obtenerDocumentoVigente('anticipos')).resolves.toMatchObject({ origen: 'red' });
    reiniciarDocumentosLegales();
    sinRed();
    await expect(obtenerDocumentoVigente('anticipos')).resolves.toMatchObject({ documento: null });
  });
});

describe('suscriptores', () => {
  it('avisa al llegar un documento, deja de avisar al quitarse y un oyente que falla no frena a los demás', async () => {
    simularServidor(rutaDocumento());
    const fallido = jest.fn(() => {
      throw new Error('oyente con error');
    });
    const oyente = jest.fn();
    suscribir(fallido);
    const quitar = suscribir(oyente);

    await obtenerDocumentoVigente('anticipos');
    expect(oyente).toHaveBeenCalledTimes(1);

    quitar();
    await obtenerDocumentoVigente('anticipos', { forzarRed: true });
    expect(oyente).toHaveBeenCalledTimes(1);
    expect(fallido).toHaveBeenCalledTimes(2);
  });
});

describe('página en el sitio', () => {
  const URL_WEB = process.env.EXPO_PUBLIC_WEB_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_WEB_URL = URL_WEB;
  });

  it('cada slug tiene su título y ruta de respaldo, los del backend', () => {
    expect(SLUGS_DOCUMENTO_LEGAL.map((slug) => [slug, TITULO_DOCUMENTO_LEGAL[slug], RUTA_DOCUMENTO_LEGAL[slug]])).toEqual([
      ['terminos', 'Términos y Condiciones', '/terminos-y-condiciones'],
      ['aviso-privacidad', 'Aviso de Privacidad', '/aviso-de-privacidad'],
      ['cookies', 'Política de Cookies', '/politica-de-cookies'],
      ['reembolsos', 'Política de Reembolsos, Cambios y Cancelaciones', '/politica-de-reembolsos'],
      ['anticipos', 'Política de Anticipos', '/politica-de-reembolsos#anticipos'],
    ]);
    expect(esSlugDocumentoLegal('anticipos')).toBe(true);
    expect(esSlugDocumentoLegal('toString')).toBe(false);
  });

  it('la URL es la de la web sin "/" final más la ruta del documento o la de respaldo', () => {
    process.env.EXPO_PUBLIC_WEB_URL = `${WEB}//`;

    expect(urlDocumentoEnWeb('anticipos')).toBe(`${WEB}/politica-de-reembolsos#anticipos`);
    expect(urlDocumentoEnWeb('terminos', documentoNormalizado('terminos', { ruta: '/terminos-nuevos' }))).toBe(`${WEB}/terminos-nuevos`);
    // Un documento de otro slug no cambia la ruta.
    expect(urlDocumentoEnWeb('cookies', documentoNormalizado('terminos'))).toBe(`${WEB}/politica-de-cookies`);
  });

  it.each([
    ['sin definir', undefined],
    ['vacía', '  '],
    ['sin http ni https', 'ftp://web.test'],
  ])('sin URL de la web válida (%s): null y no abre nada', async (_caso, url) => {
    if (url === undefined) {
      delete process.env.EXPO_PUBLIC_WEB_URL;
    } else {
      process.env.EXPO_PUBLIC_WEB_URL = url;
    }

    expect(urlDocumentoEnWeb('anticipos')).toBeNull();
    await expect(abrirDocumentoEnWeb('anticipos')).resolves.toBe(false);
    expect(abrirNavegadorSimulado()).not.toHaveBeenCalled();
  });

  it('abre el documento en el navegador con la ruta del documento en memoria', async () => {
    simularServidor(rutaDocumento('terminos', { success: true, data: documentoCrudo('terminos', { ruta: '/terminos-v2' }) }));
    await obtenerDocumentoVigente('terminos');

    await expect(abrirDocumentoEnWeb('terminos')).resolves.toBe(true);

    expect(abrirNavegadorSimulado()).toHaveBeenCalledWith(`${WEB}/terminos-v2`);
  });

  it('si el navegador falla devuelve false sin rechazar', async () => {
    abrirNavegadorSimulado().mockRejectedValueOnce(new Error('sin navegador'));

    await expect(abrirDocumentoEnWeb('anticipos')).resolves.toBe(false);
  });

  it('la ruta del visor es /legal/<slug>', () => {
    expect(rutaVisorDocumento('aviso-privacidad')).toBe('/legal/aviso-privacidad');
  });
});

describe('fechaVigenciaLegible', () => {
  it.each([
    ['2026-10-14', '14 de octubre de 2026'],
    ['2027-01-01', '1 de enero de 2027'],
    ['2026-12-31', '31 de diciembre de 2026'],
    ['2026-13-01', ''],
    ['14/10/2026', ''],
  ])('%s: "%s"', (fecha, esperado) => {
    expect(fechaVigenciaLegible(fecha)).toBe(esperado);
  });
});

