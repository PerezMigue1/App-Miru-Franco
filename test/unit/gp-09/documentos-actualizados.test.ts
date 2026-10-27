/// <reference types="jest" />

import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import {
  CODE_TEXTO_DATOS_SENSIBLES_NO_VIGENTE,
  CODES_DOCUMENTO_ACTUALIZADO,
  documentosQueCambiaron,
  esDocumentoActualizado,
  esTextoDatosSensiblesActualizado,
  textoDocumentoActualizado,
  versionesCambiadas,
} from '@/shared/api/documentosActualizados';
import { documentoEnMemoria, obtenerDocumentoVigente, reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { HASH_VIGENTE, documentoCrudo, rutaVigente } from '../../helpers/documentosFicticios';
import { respuesta } from '../../helpers/servidorSimulado';
import { servidorVm, sinRed, type ManejadorVm } from '../../helpers/viewmodelsAuth';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-09, bloque C (Ronda 9 del backend): la pieza compartida que decide qué casilla de un documento
 * legal se desmarca cuando el servidor responde 400 DOCUMENTO_NO_VIGENTE o DOCUMENTO_NO_COINCIDE, y el
 * code del texto de datos sensibles. Vuelve a pedir los documentos con forzarRed y compara versión y
 * hash con lo que la clienta tuvo a la vista. fetch simulado en http://api.test con datos ficticios.
 */

const OTRO_HASH = 'c'.repeat(64);
const vigente = (version = '2.3', hash = HASH_VIGENTE) => ({ version, hash });

beforeEach(() => {
  reiniciarDocumentosLegales();
  limpiarArchivos();
});

describe('codes de la Ronda 9', () => {
  it.each(CODES_DOCUMENTO_ACTUALIZADO)('%s en un 400 es un documento actualizado', (code) => {
    expect(esDocumentoActualizado(new ApiError(400, 'x', code))).toBe(true);
    expect(esTextoDatosSensiblesActualizado(new ApiError(400, 'x', code))).toBe(false);
  });

  it('TEXTO_DATOS_SENSIBLES_NO_VIGENTE es el texto de la autorización, no un documento', () => {
    const error = new ApiError(400, 'x', CODE_TEXTO_DATOS_SENSIBLES_NO_VIGENTE);
    expect(esTextoDatosSensiblesActualizado(error)).toBe(true);
    expect(esDocumentoActualizado(error)).toBe(false);
  });

  it.each([
    ['un 400 sin code', new ApiError(400, 'x')],
    ['otro code', new ApiError(400, 'x', 'OTRO_CODE')],
    ['el code con otro estado', new ApiError(409, 'x', 'DOCUMENTO_NO_VIGENTE')],
    ['sin red', new ErrorDeRed()],
    ['algo que no es un error del servidor', 'DOCUMENTO_NO_VIGENTE'],
  ])('%s no cuenta', (_caso, error) => {
    expect(esDocumentoActualizado(error)).toBe(false);
    expect(esTextoDatosSensiblesActualizado(error)).toBe(false);
  });

  it('el aviso es el del catálogo y es también el texto de esos codes para la clienta', () => {
    expect(textoDocumentoActualizado()).toBe('Actualizamos este documento; revísalo y acéptalo de nuevo.');
    expect(mensajeParaClienta(new ApiError(400, 'Mensaje técnico', 'DOCUMENTO_NO_COINCIDE'))).toBe(textoDocumentoActualizado());
    expect(mensajeParaClienta(new ApiError(400, 'Mensaje técnico', 'DOCUMENTO_NO_VIGENTE'))).toBe(textoDocumentoActualizado());
    expect(mensajeParaClienta(new ApiError(400, 'Mensaje técnico', CODE_TEXTO_DATOS_SENSIBLES_NO_VIGENTE))).toBe(
      obtenerTexto('datosSensibles.app.textoCambio'),
    );
  });
});

describe('versionesCambiadas', () => {
  const casillas = [
    { clave: 'terminos', slug: 'terminos', aceptado: vigente() },
    { clave: 'reembolsos', slug: 'reembolsos', aceptado: vigente() },
  ] as const;

  it.each([
    ['solo cambió la versión del primero', [vigente('2.4'), vigente()], ['terminos']],
    ['solo cambió el hash del segundo', [vigente(), vigente('2.3', OTRO_HASH)], ['reembolsos']],
    ['cambiaron los dos', [vigente('2.4'), vigente('2.4')], ['terminos', 'reembolsos']],
    ['no se pudo confirmar el primero', [null, vigente()], ['terminos']],
    ['ninguno se ve distinto: los dos, para revisarlos', [vigente(), vigente()], ['terminos', 'reembolsos']],
  ])('%s', (_caso, vigentes, esperadas) => {
    expect(versionesCambiadas(casillas, vigentes)).toEqual(esperadas);
  });

  it('una casilla sin versión a la vista cuenta como cambiada', () => {
    expect(versionesCambiadas([{ clave: 'a', slug: 'terminos', aceptado: null }, ...casillas], [vigente(), vigente(), vigente()])).toEqual(['a']);
  });
});

describe('documentosQueCambiaron', () => {
  function servidorDocumentos(rutas: Record<string, ManejadorVm>) {
    return servidorVm(rutas);
  }

  it('vuelve a pedir cada documento a la red aunque la memoria siga vigente y devuelve solo el que cambió', async () => {
    servidorDocumentos({
      [`GET ${rutaVigente('terminos')}`]: () => respuesta({ success: true, data: documentoCrudo('terminos') }),
      [`GET ${rutaVigente('reembolsos')}`]: () => respuesta({ success: true, data: documentoCrudo('reembolsos') }),
    });
    await obtenerDocumentoVigente('terminos');
    await obtenerDocumentoVigente('reembolsos');

    const llamadas = servidorDocumentos({
      [`GET ${rutaVigente('terminos')}`]: () => respuesta({ success: true, data: documentoCrudo('terminos', { version: '2.4' }) }),
      [`GET ${rutaVigente('reembolsos')}`]: () => respuesta({ success: true, data: documentoCrudo('reembolsos') }),
    });
    const cambiadas = await documentosQueCambiaron([
      { clave: 'terminosVenta', slug: 'terminos', aceptado: vigente() },
      { clave: 'reembolsos', slug: 'reembolsos', aceptado: vigente() },
    ]);
    expect(cambiadas).toEqual(['terminosVenta']);
    expect(llamadas.map((l) => l.ruta).sort()).toEqual([rutaVigente('reembolsos'), rutaVigente('terminos')]);
    // La memoria queda con la versión nueva: las pantallas suscritas se vuelven a pintar.
    expect(documentoEnMemoria('terminos')?.version).toBe('2.4');
  });

  it('sin red no se puede confirmar: cuenta como cambiado', async () => {
    servidorDocumentos({
      [`GET ${rutaVigente('anticipos')}`]: () => sinRed(),
    });
    expect(await documentosQueCambiaron([{ clave: 'politica', slug: 'anticipos', aceptado: vigente() }])).toEqual(['politica']);
  });
});
