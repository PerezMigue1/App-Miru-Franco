/// <reference types="jest" />

import { renderHook, waitFor } from '@testing-library/react-native';

import { ErrorConsentimiento, mensajeConsentimiento } from '@/features/citas/models/consentimientosReserva';
import { useSalonViewModel } from '@/features/salon/viewmodels/useSalonViewModel';
import { ErrorConsentimientoCompra, mensajeConsentimientoCompra } from '@/features/tienda/models/compraLegal';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import {
  errorUltimoRefresco,
  obtenerConfiguracion,
  refrescar,
  reiniciarConfiguracionPublica,
} from '@/shared/api/configuracionPublica';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { sinRedEnRuta } from '../../helpers/citasFicticias';
import { RUTA_CONFIGURACION, rutaConfiguracion } from '../../helpers/configuracionFicticia';
import { respuesta, servidorConRutas, type Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.6, "sin conexión" solo cuando de verdad no hay red (tipoDeError): al no poder confirmar la
 * versión de la Política de anticipos (reserva) o de los documentos de compra (tienda), y en el
 * aviso de El salón cuando la configuración no llegó de la red. Con un 5xx (u otra falla con
 * respuesta) el texto no culpa a la conexión de la clienta.
 */

const REVISA_CONEXION = /Revisa tu conexión/;
const simular = servidorConRutas({});
const conConfiguracion = (manejador: Manejador) => simular({ [`GET ${RUTA_CONFIGURACION}`]: manejador });

const SIN_RED = new ErrorDeRed();
const SERVIDOR = new ApiError(503, 'Service Unavailable');

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
});

describe('consentimiento sin versión vigente: sin red contra error del servidor', () => {
  it.each<[string, unknown, boolean]>([
    ['sin red', SIN_RED, true],
    ['error del servidor (5xx)', SERVIDOR, false],
    ['sin versión publicada (404)', new ApiError(404, 'No encontrado'), false],
    ['sin causa', undefined, false],
  ])('reserva, %s', (_caso, causa, culpaLaRed) => {
    const mensaje = mensajeConsentimiento(new ErrorConsentimiento('version', causa));
    expect(mensaje).toMatch(/^No pudimos confirmar la versión vigente de la Política de anticipos y cancelación/);
    expect(REVISA_CONEXION.test(mensaje)).toBe(culpaLaRed);
  });

  it.each<[string, unknown, string]>([
    ['sin red', SIN_RED, RESPALDO_TEXTOS['tienda.checkout.consentimientoSinRed']],
    ['error del servidor (5xx)', SERVIDOR, RESPALDO_TEXTOS['tienda.checkout.consentimientoGenerico']],
  ])('tienda, %s', (_caso, causa, detalle) => {
    const mensaje = mensajeConsentimientoCompra(new ErrorConsentimientoCompra('version', causa), obtenerConfiguracion());
    expect(mensaje).toBe(`${RESPALDO_TEXTOS['tienda.checkout.consentimientoSinVersion']} ${detalle}`);
  });
});

describe('El salón: aviso cuando la configuración no llegó de la red', () => {
  it.each<[string, Manejador, string]>([
    ['sin red', sinRedEnRuta, RESPALDO_TEXTOS['salon.sinRed']],
    ['error del servidor', () => respuesta({ message: 'Internal server error' }, 500), RESPALDO_TEXTOS['salon.sinActualizar']],
  ])('%s', async (_caso, manejador, esperado) => {
    conConfiguracion(manejador);
    await refrescar();
    const { result } = await renderHook(() => useSalonViewModel());
    await waitFor(() => expect(result.current.avisoSinRed).toBe(esperado));
  });

  it('con la configuración de la red no hay aviso y el error anterior se olvida', async () => {
    conConfiguracion(() => respuesta({ message: 'Internal server error' }, 500));
    await refrescar();
    expect(errorUltimoRefresco()).toBeInstanceOf(ApiError);
    simular(rutaConfiguracion());
    await refrescar();
    expect(errorUltimoRefresco()).toBeNull();
    const { result } = await renderHook(() => useSalonViewModel());
    expect(result.current.avisoSinRed).toBeNull();
  });

  it('sin ningún intento todavía no afirma que no hay conexión', async () => {
    const { result } = await renderHook(() => useSalonViewModel());
    expect(result.current.avisoSinRed).toBe(RESPALDO_TEXTOS['salon.sinActualizar']);
  });
});
