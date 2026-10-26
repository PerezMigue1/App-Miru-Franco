/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  alergiasPendientesDelRegistro,
  esConsentimientoSaludRequerido,
} from '@/features/auth/models/AuthModel';
import {
  useRegistroViewModel,
  type CampoRegistro,
  type CamposRegistro,
  type RegistroViewModel,
} from '@/features/auth/viewmodels/useRegistroViewModel';
import { ApiError } from '@/shared/api/apiClient';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { HASH_SENSIBLES, PARRAFO_1, RUTA_SENSIBLES, RUTA_TEXTO_SENSIBLES, TEXTO_SENSIBLES } from '../../helpers/datosSensibles';
import { respuestaCon, servidorEnOrden, vecesA, type Respondedor } from '../../helpers/limitesRed';
import { cerrarPruebaSesion } from '../../helpers/sesionLimites';
import type { Llamada } from '../../helpers/servidorSimulado';
import { reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque B1: registro con la autorización expresa de datos sensibles (Ronda 5). El campo de
 * alergias solo existe después de autorizar en la hoja (casilla sin marcar, texto del backend); sin
 * autorizar no se manda nada de alergias ni consienteDatosSensibles. Con la autorización van la
 * versión y el hash del texto leído. Si el backend no guardó las alergias
 * (alergiasPendientesDeAutorizacion), se explica antes de la activación; el 400
 * CONSENTIMIENTO_SALUD_REQUERIDO vuelve a pedir la autorización. Viewmodel con renderHook, fetch
 * simulado en http://api.test, datos ficticios y temporizadores falsos.
 */

jest.mock('expo-router', () => ({
  ...require('../../helpers/viewmodelsAuth').expoRouterSimulado(),
  usePathname: () => '/registro',
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })) }));

const CORREO = 'clienta.sensibles@ejemplo.test';
const CLAVE = 'ClaveFicticia1!';
const RUTA_REGISTRO = '/api/usuarios/registro';
const AUTORIZACION = { version: '1.0', hash: HASH_SENSIBLES };
const ALERGIAS = 'Alergia ficticia al amoniaco';
const PREGUNTA = { id: '1', pregunta: '¿Cuál fue el nombre de tu primera mascota?' };

const VALIDOS: Partial<CamposRegistro> = {
  nombre: 'Clienta Sensibles',
  correo: CORREO,
  telefono: '5512345678',
  nacimiento: '15/04/1995',
  pregunta: PREGUNTA,
  respuesta: 'Respuesta ficticia',
  clave: CLAVE,
  confirmacion: CLAVE,
  tipoCabello: 'rizado',
  tratamientosQuimicos: false,
  aceptaAviso: true,
};

/** Lo que el cuerpo lleva siempre (sin el perfil capilar), con los datos de VALIDOS. */
const CUERPO_BASE = {
  nombre: 'Clienta Sensibles',
  email: CORREO,
  telefono: '5512345678',
  password: CLAVE,
  fechaNacimiento: '1995-04-15',
  preguntaSeguridad: { pregunta: PREGUNTA.pregunta, respuesta: 'Respuesta ficticia' },
  aceptaAvisoPrivacidad: true,
  recibePromociones: false,
};

const creada = () => respuestaCon({ success: true, message: 'Ingresa el código.', requiereVerificacion: true, usuario: { id: 'u-1' } }, 201);

type Resultado = { current: RegistroViewModel };

beforeEach(() => {
  jest.useFakeTimers();
  reiniciarSimulaciones();
});

afterEach(async () => {
  await cerrarPruebaSesion();
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function tocar(accion: () => void): Promise<void> {
  await act(async () => {
    accion();
  });
}

async function llenar(result: Resultado, campos: Partial<CamposRegistro>): Promise<void> {
  for (const [campo, valor] of Object.entries(campos) as [CampoRegistro, CamposRegistro[CampoRegistro]][]) {
    await tocar(() => result.current.cambiar(campo, valor));
  }
}

async function montar(registro: Respondedor[]): Promise<{ result: Resultado; llamadas: Llamada[] }> {
  const llamadas = servidorEnOrden({
    'POST /api/auth/verificar-correo': [respuestaCon({ existe: false })],
    [`GET ${RUTA_TEXTO_SENSIBLES}`]: [
      respuestaCon({ success: true, data: { version: '1.0', hash: HASH_SENSIBLES, texto: TEXTO_SENSIBLES } }),
    ],
    [`POST ${RUTA_REGISTRO}`]: registro,
  });
  const { result } = await renderHook(() => useRegistroViewModel());
  await llenar(result, VALIDOS);
  return { result, llamadas };
}

/** Abre la hoja, espera el texto del backend, marca la casilla y toca "Autorizo". */
async function autorizarEnHoja(result: Resultado): Promise<void> {
  await tocar(() => result.current.autorizacion.abrir());
  await waitFor(() => expect(result.current.autorizacion.parrafos).toContain(PARRAFO_1));
  // La casilla siempre empieza sin marcar y "Autorizo" espera a que se marque.
  expect(result.current.autorizacion.marcada).toBe(false);
  expect(result.current.autorizacion.autorizoDeshabilitado).toBe(true);
  await tocar(() => result.current.autorizacion.alternar(true));
  await tocar(() => result.current.autorizacion.autorizar());
}

function cuerpoRegistro(llamadas: Llamada[]): unknown {
  return llamadas.filter((l) => l.metodo === 'POST' && l.ruta === RUTA_REGISTRO)[0]?.cuerpo;
}

describe('Registro: alergias solo con la autorización de datos sensibles', () => {
  it('sin autorizar, con "Sí", no se manda nada de alergias ni consienteDatosSensibles', async () => {
    const { result, llamadas } = await montar([creada()]);
    await llenar(result, { tieneAlergias: true });

    // Sin autorizar no se pide el detalle (el campo ni se muestra) y escribirlo tampoco lo envía.
    await tocar(() => result.current.cambiar('alergias', ALERGIAS));
    await tocar(() => result.current.salir('alergias'));
    expect(result.current.errores.alergias).toBeNull();
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledTimes(1));

    expect(cuerpoRegistro(llamadas)).toEqual({
      ...CUERPO_BASE,
      perfilCapilar: { tipoCabello: 'rizado', tratamientosQuimicos: false },
    });
    // La hoja del registro nunca llama al backend para autorizar.
    expect(vecesA(llamadas, 'POST', RUTA_SENSIBLES)).toBe(0);
  });

  it('con "No" manda tieneAlergias en false, sin alergias ni autorización', async () => {
    const { result, llamadas } = await montar([creada()]);
    await llenar(result, { tieneAlergias: false });

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledTimes(1));
    expect(cuerpoRegistro(llamadas)).toEqual({
      ...CUERPO_BASE,
      perfilCapilar: { tipoCabello: 'rizado', tieneAlergias: false, tratamientosQuimicos: false },
    });
  });

  it('al autorizar en la hoja aparece el campo, se pide el detalle y viajan la versión y el hash', async () => {
    const { result, llamadas } = await montar([creada()]);
    await llenar(result, { tieneAlergias: true });

    await autorizarEnHoja(result);
    expect(result.current.autorizacion.visible).toBe(false);
    expect(result.current.campos.autorizacionDatosSensibles).toEqual(AUTORIZACION);
    // El foco va al campo de alergias que acaba de aparecer.
    expect(result.current.enfoque?.campo).toBe('alergias');
    expect(vecesA(llamadas, 'POST', RUTA_SENSIBLES)).toBe(0);

    // Autorizado, el detalle es obligatorio.
    await tocar(() => result.current.crearCuenta());
    expect(result.current.errores.alergias).toBe('Especifica tus alergias');
    expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(0);

    await llenar(result, { alergias: `  ${ALERGIAS} ` });
    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledTimes(1));

    expect(cuerpoRegistro(llamadas)).toEqual({
      ...CUERPO_BASE,
      perfilCapilar: { tipoCabello: 'rizado', tieneAlergias: true, alergias: ALERGIAS, tratamientosQuimicos: false },
      consienteDatosSensibles: true,
      autorizacionDatosSensibles: AUTORIZACION,
    });
    expect(routerSimulado.push).toHaveBeenCalledWith({
      pathname: '/activar',
      params: { email: CORREO, enviado: '1', volverA: '/registro' },
    });
    // Los datos de salud y la autorización no se quedan en memoria.
    expect(result.current.campos.alergias).toBe('');
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();
  });

  it('"Ahora no" en la hoja no autoriza y al volver a abrirla la casilla empieza sin marcar', async () => {
    const { result } = await montar([creada()]);
    await llenar(result, { tieneAlergias: true });

    await tocar(() => result.current.autorizacion.abrir());
    await waitFor(() => expect(result.current.autorizacion.parrafos.length).toBeGreaterThan(0));
    await tocar(() => result.current.autorizacion.alternar(true));
    await tocar(() => result.current.autorizacion.cerrar());
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();

    await tocar(() => result.current.autorizacion.abrir());
    await waitFor(() => expect(result.current.autorizacion.parrafos.length).toBeGreaterThan(0));
    expect(result.current.autorizacion.marcada).toBe(false);
  });

  it('responder "No" después de autorizar quita la autorización y el detalle', async () => {
    const { result } = await montar([creada()]);
    await llenar(result, { tieneAlergias: true });
    await autorizarEnHoja(result);
    await llenar(result, { alergias: ALERGIAS });

    await llenar(result, { tieneAlergias: false });
    expect(result.current.campos.alergias).toBe('');
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();
  });

  it('con alergiasPendientesDeAutorizacion lo explica antes de pasar a la activación', async () => {
    const { result } = await montar([
      respuestaCon({ success: true, usuario: { id: 'u-2', alergiasPendientesDeAutorizacion: true } }, 201),
    ]);
    await llenar(result, { tieneAlergias: true });
    await autorizarEnHoja(result);
    await llenar(result, { alergias: ALERGIAS });

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(result.current.alergiasNoGuardadas).toBe(true));
    expect(routerSimulado.push).not.toHaveBeenCalled();
    expect(result.current.textosAlergias.noGuardadasTitulo).toBe(RESPALDO_TEXTOS['auth.registro.alergiasNoGuardadasTitulo']);
    expect(result.current.textosAlergias.noGuardadasTexto).toBe(RESPALDO_TEXTOS['auth.registro.alergiasNoGuardadas']);
    expect(result.current.campos.alergias).toBe('');

    await tocar(() => result.current.continuarAActivar());
    expect(result.current.alergiasNoGuardadas).toBe(false);
    expect(routerSimulado.push).toHaveBeenCalledWith({
      pathname: '/activar',
      params: { email: CORREO, enviado: '1', volverA: '/registro' },
    });
    // Una segunda vez no navega de nuevo.
    await tocar(() => result.current.continuarAActivar());
    expect(routerSimulado.push).toHaveBeenCalledTimes(1);
  });

  it('reiniciar olvida la explicación pendiente y cierra la hoja', async () => {
    const { result } = await montar([
      respuestaCon({ success: true, usuario: { id: 'u-3', alergiasPendientesDeAutorizacion: true } }, 201),
    ]);
    await llenar(result, { tieneAlergias: true });
    await autorizarEnHoja(result);
    await llenar(result, { alergias: ALERGIAS });
    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(result.current.alergiasNoGuardadas).toBe(true));

    await tocar(() => result.current.reiniciar());
    expect(result.current.alergiasNoGuardadas).toBe(false);
    expect(result.current.autorizacion.visible).toBe(false);
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();
  });

  it('el 400 CONSENTIMIENTO_SALUD_REQUERIDO explica el motivo y vuelve a pedir la autorización', async () => {
    const { result, llamadas } = await montar([
      respuestaCon(
        {
          success: false,
          statusCode: 400,
          code: 'CONSENTIMIENTO_SALUD_REQUERIDO',
          message: 'Para guardar tus alergias marca la casilla de datos de salud.',
          errors: { consienteDatosSensibles: ['requerido'] },
        },
        400,
      ),
    ]);
    await llenar(result, { tieneAlergias: true });
    await autorizarEnHoja(result);
    await llenar(result, { alergias: ALERGIAS });

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(result.current.errorGeneral).toBe(RESPALDO_TEXTOS['errores.consentimientoSalud']));
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();
    expect(result.current.enfoque?.campo).toBe('tieneAlergias');
    expect(routerSimulado.push).not.toHaveBeenCalled();
    expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(1);
  });
});

describe('modelo: respuestas del registro con datos sensibles', () => {
  it('alergiasPendientesDelRegistro solo con el true del backend', () => {
    expect(alergiasPendientesDelRegistro({ usuario: { alergiasPendientesDeAutorizacion: true } })).toBe(true);
    expect(alergiasPendientesDelRegistro({ usuario: {} })).toBe(false);
    expect(alergiasPendientesDelRegistro({ success: true })).toBe(false);
    expect(alergiasPendientesDelRegistro(null)).toBe(false);
    expect(alergiasPendientesDelRegistro(undefined)).toBe(false);
  });

  it('esConsentimientoSaludRequerido se reconoce por status y code, nunca por el texto', () => {
    expect(esConsentimientoSaludRequerido(new ApiError(400, 'x', 'CONSENTIMIENTO_SALUD_REQUERIDO'))).toBe(true);
    expect(esConsentimientoSaludRequerido(new ApiError(400, 'Para guardar tus alergias marca la casilla.'))).toBe(false);
    expect(esConsentimientoSaludRequerido(new ApiError(409, 'x', 'CONSENTIMIENTO_SALUD_REQUERIDO'))).toBe(false);
    expect(esConsentimientoSaludRequerido(new Error('CONSENTIMIENTO_SALUD_REQUERIDO'))).toBe(false);
  });
});
