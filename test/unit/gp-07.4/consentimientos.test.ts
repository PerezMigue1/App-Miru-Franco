/// <reference types="jest" />

import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { aceptacionDeDocumento, registrarConsentimientos, TIPO_DE_DOCUMENTO } from '@/shared/api/consentimientos';
import { SLUGS_DOCUMENTO_LEGAL } from '@/shared/api/documentosLegales';

import { CLIENTA_CITAS } from '../../helpers/citasFicticias';
import { documentoNormalizado, HASH_VIGENTE, sinRed } from '../../helpers/documentosFicticios';
import { llamadasA, respuesta, servidorConRutas } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';

/**
 * GP-07.4: registro de consentimientos (src/shared/api/consentimientos.ts). El cuerpo exacto de POST
 * /api/consentimientos, con la sesión de la clienta, y los errores que llegan como ApiError. El
 * servidor es ficticio (http://api.test).
 */

const RUTA = '/api/consentimientos';
const simularServidor = servidorConRutas({});

/** Fila como la devuelve el backend (con IP y navegador, que la app no se queda). */
const filaGuardada = {
  id: 'consentimiento-1',
  usuarioId: CLIENTA_CITAS.id,
  tipo: 'anticipos',
  documentoSlug: 'anticipos',
  documentoVersion: '2.3',
  documentoHash: HASH_VIGENTE,
  accion: 'aceptado',
  creadoEn: '2026-10-22T16:00:00.000Z',
  ip: '203.0.113.7',
  userAgent: 'navegador ficticio',
  formulario: 'anticipo-cita',
  rutaOrigen: '/reservar/2',
};

beforeEach(async () => {
  await sembrarSesion(CLIENTA_CITAS);
});

describe('aceptacionDeDocumento', () => {
  it.each(SLUGS_DOCUMENTO_LEGAL.map((slug) => [slug, TIPO_DE_DOCUMENTO[slug]]))(
    '%s se acepta como tipo %s con su versión y hash',
    (slug, tipo) => {
      expect(aceptacionDeDocumento(documentoNormalizado(slug))).toEqual({
        tipo,
        documentoSlug: slug,
        version: '2.3',
        hash: HASH_VIGENTE,
        accion: 'aceptado',
      });
    },
  );

  it('los tipos son los del backend', () => {
    expect(TIPO_DE_DOCUMENTO).toEqual({
      terminos: 'terminos',
      'aviso-privacidad': 'aviso_privacidad',
      cookies: 'cookies',
      reembolsos: 'reembolsos',
      anticipos: 'anticipos',
    });
  });
});

describe('registrarConsentimientos', () => {
  it('manda el cuerpo exacto con la sesión y devuelve lo guardado sin IP ni navegador', async () => {
    const llamadas = simularServidor({ [`POST ${RUTA}`]: () => respuesta({ success: true, data: [filaGuardada, 'basura'] }, 201) });

    const guardados = await registrarConsentimientos({
      items: [aceptacionDeDocumento(documentoNormalizado()), { tipo: 'fotos_resultado', accion: 'aceptado' }],
      formulario: 'anticipo-cita',
      rutaOrigen: ' /reservar/2 ',
    });

    const [llamada] = llamadasA(llamadas, 'POST', RUTA);
    expect(llamada.cuerpo).toEqual({
      items: [
        { tipo: 'anticipos', documentoSlug: 'anticipos', version: '2.3', hash: HASH_VIGENTE, accion: 'aceptado' },
        { tipo: 'fotos_resultado', accion: 'aceptado' },
      ],
      formulario: 'anticipo-cita',
      rutaOrigen: '/reservar/2',
    });
    expect(llamada.cabeceras.Authorization).toMatch(/^Bearer /);
    expect(guardados).toEqual([
      {
        id: 'consentimiento-1',
        tipo: 'anticipos',
        accion: 'aceptado',
        documentoSlug: 'anticipos',
        documentoVersion: '2.3',
        creadoEn: '2026-10-22T16:00:00.000Z',
      },
    ]);
  });

  it('sin rutaOrigen (o vacía) no la manda, quita campos vacíos y una respuesta sin lista da []', async () => {
    const llamadas = simularServidor({ [`POST ${RUTA}`]: () => respuesta({ success: true }, 201) });

    await expect(
      registrarConsentimientos({
        items: [{ tipo: 'promociones', documentoSlug: undefined, version: '', accion: 'revocado' }],
        formulario: 'perfil',
        rutaOrigen: '   ',
      }),
    ).resolves.toEqual([]);

    expect(llamadasA(llamadas, 'POST', RUTA)[0].cuerpo).toEqual({ items: [{ tipo: 'promociones', accion: 'revocado' }], formulario: 'perfil' });
  });

  it('una fila con campos raros se lee sin romper', async () => {
    simularServidor({ [`POST ${RUTA}`]: () => respuesta({ success: true, data: [{ id: 7, tipo: 3 }, {}] }, 201) });

    await expect(registrarConsentimientos({ items: [], formulario: 'perfil' })).resolves.toEqual([
      { id: '7', tipo: '', accion: '', documentoSlug: null, documentoVersion: null, creadoEn: '' },
      { id: '', tipo: '', accion: '', documentoSlug: null, documentoVersion: null, creadoEn: '' },
    ]);
  });

  it('un 400 del backend llega como ApiError con su status', async () => {
    const mensaje = 'La versión 2.3 del documento "anticipos" no está publicada o su hash no coincide.';
    simularServidor({ [`POST ${RUTA}`]: () => respuesta({ statusCode: 400, message: mensaje }, 400) });

    const error = await registrarConsentimientos({ items: [aceptacionDeDocumento(documentoNormalizado())], formulario: 'anticipo-cita' }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: mensaje });
  });

  it('sin red llega ErrorDeRed', async () => {
    sinRed();

    await expect(registrarConsentimientos({ items: [], formulario: 'perfil' })).rejects.toBeInstanceOf(ErrorDeRed);
  });
});
