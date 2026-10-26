/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ERROR_CONSENTIMIENTO_SALUD } from '@/features/auth/models/AuthModel';
import { invalidarPerfil } from '@/features/auth/models/perfilCompartido';
import {
  alergiasPendientesDelGuardado,
  cambiosDelPerfil,
  formularioDesdePerfil,
  normalizarPerfil,
  requiereConsentimientoPerfil,
  type FormularioPerfil,
} from '@/features/auth/models/PerfilModel';
import {
  useEditarPerfilViewModel,
  type EditarPerfilViewModel,
} from '@/features/auth/viewmodels/useEditarPerfilViewModel';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { HASH_SENSIBLES, PARRAFO_1, RUTA_SENSIBLES, RUTA_TEXTO_SENSIBLES, TEXTO_SENSIBLES } from '../../helpers/datosSensibles';
import {
  limite429,
  MENSAJE_LIMITE,
  respuestaCon,
  servidorEnOrden,
  vecesA,
  type Respondedor,
} from '../../helpers/limitesRed';
import { CLIENTA, PERFIL_COMPLETO } from '../../helpers/perfilClienta';
import { cerrarPruebaSesion } from '../../helpers/sesionLimites';
import type { Llamada } from '../../helpers/servidorSimulado';
import { authSimulada, reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque B2: Editar perfil con la autorización expresa de datos sensibles (Ronda 5). Sin
 * autorización vigente las alergias no se muestran ni se mandan (aunque /me las trajera) y se ofrece
 * autorizar; al autorizar se vuelve a leer /me sin perder lo ya editado. Con autorización funciona
 * como antes (consienteDatosSensibles para alergias nuevas). alergiasPendientesDeAutorizacion se
 * explica, el 400 CONSENTIMIENTO_SALUD_REQUERIDO marca la casilla y un 429 deja "Guardar cambios" en
 * espera con el message del backend. Viewmodel con renderHook, fetch simulado en http://api.test,
 * datos ficticios y temporizadores falsos.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })) }));

const RUTA_ME = '/api/auth/me';
const ALERGIAS = 'Polen ficticio';
const ESPERA_PLANTILLA = RESPALDO_TEXTOS['errores.esperaLimite'];
const esperaDe = (segundos: number) => ESPERA_PLANTILLA.replace('{segundos}', String(segundos));

const SIN_AUTORIZAR = { ...PERFIL_COMPLETO, alergias: null, datosSensiblesAutorizados: false, alergiasOcultas: false };
const OCULTAS = { ...SIN_AUTORIZAR, alergiasOcultas: true };
const AUTORIZADO = { ...PERFIL_COMPLETO, alergias: ALERGIAS, datosSensiblesAutorizados: true, alergiasOcultas: false };

const me = (perfil: Record<string, unknown>) => respuestaCon({ success: true, data: perfil });
const guardado = (extra: Record<string, unknown> = {}) =>
  respuestaCon({ success: true, message: 'Perfil actualizado correctamente', data: { ...PERFIL_COMPLETO, ...extra } });
const textoSensibles = () =>
  respuestaCon({ success: true, data: { version: '1.0', hash: HASH_SENSIBLES, texto: TEXTO_SENSIBLES } });
const autorizada = () => respuestaCon({ success: true, data: { id: '9', tipo: 'datos_sensibles', accion: 'aceptado' } }, 201);

type Resultado = { current: EditarPerfilViewModel };

beforeEach(() => {
  jest.useFakeTimers();
  reiniciarSimulaciones();
  invalidarPerfil();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = { ...CLIENTA };
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

async function avanzar(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function montar(rutas: Record<string, Respondedor[]>): Promise<{ result: Resultado; llamadas: Llamada[] }> {
  const llamadas = servidorEnOrden({
    [`GET ${RUTA_TEXTO_SENSIBLES}`]: [textoSensibles()],
    [`POST ${RUTA_SENSIBLES}`]: [autorizada()],
    [`PATCH ${RUTA_ME}`]: [guardado()],
    ...rutas,
  });
  const { result } = await renderHook(() => useEditarPerfilViewModel());
  await waitFor(() => expect(result.current.estado).toBe('listo'));
  return { result, llamadas };
}

async function escribir(result: Resultado, cambios: Partial<FormularioPerfil>): Promise<void> {
  for (const [campo, valor] of Object.entries(cambios)) {
    await tocar(() => result.current.cambiar(campo as keyof FormularioPerfil, valor as never));
  }
}

function cuerposPatch(llamadas: Llamada[]): unknown[] {
  return llamadas.filter((l) => l.metodo === 'PATCH' && l.ruta === RUTA_ME).map((l) => l.cuerpo);
}

async function autorizarEnHoja(result: Resultado): Promise<void> {
  await tocar(() => result.current.autorizacion.abrir());
  await waitFor(() => expect(result.current.autorizacion.parrafos).toContain(PARRAFO_1));
  expect(result.current.autorizacion.marcada).toBe(false);
  expect(result.current.autorizacion.autorizoDeshabilitado).toBe(true);
  await tocar(() => result.current.autorizacion.alternar(true));
  await tocar(() => result.current.autorizacion.autorizar());
}

describe('Editar perfil sin la autorización de datos sensibles', () => {
  it('no muestra ni manda las alergias aunque /me las trajera; ofrece autorizar', async () => {
    // Un /me que trajera texto sin autorización tampoco se usa (nunca se supone la autorización).
    const { result, llamadas } = await montar({ [`GET ${RUTA_ME}`]: [me({ ...SIN_AUTORIZAR, alergias: 'Filtrado' })] });

    expect(result.current.alergiasAutorizadas).toBe(false);
    expect(result.current.formulario.alergias).toBe('');
    expect(result.current.textoSinAutorizacion).toBe(RESPALDO_TEXTOS['auth.perfil.alergiasSinAutorizar']);
    expect(result.current.textoAutorizar).toBe(RESPALDO_TEXTOS['auth.perfil.alergiasAutorizar']);

    // Aunque el estado del formulario cambiara, las alergias no viajan.
    await escribir(result, { colorNatural: 'Negro ficticio', alergias: 'Látex ficticio' });
    expect(result.current.pideConsentimiento).toBe(false);
    await tocar(() => result.current.guardar());
    await waitFor(() => expect(routerSimulado.dismissTo).toHaveBeenCalledTimes(1));
    expect(cuerposPatch(llamadas)).toEqual([{ colorNatural: 'Negro ficticio' }]);
  });

  it('con alergias guardadas y ocultas lo dice así', async () => {
    const { result } = await montar({ [`GET ${RUTA_ME}`]: [me(OCULTAS)] });
    expect(result.current.textoSinAutorizacion).toBe(RESPALDO_TEXTOS['auth.perfil.alergiasOcultas']);
  });

  it('al autorizar registra la constancia, vuelve a leer /me y muestra el campo sin perder lo editado', async () => {
    const { result, llamadas } = await montar({ [`GET ${RUTA_ME}`]: [me(OCULTAS), me(AUTORIZADO)] });
    await escribir(result, { nombre: 'Clienta Editada' });

    await autorizarEnHoja(result);
    await waitFor(() => expect(result.current.alergiasAutorizadas).toBe(true));

    expect(llamadas.filter((l) => l.metodo === 'POST' && l.ruta === RUTA_SENSIBLES)[0].cuerpo).toEqual({
      version: '1.0',
      hash: HASH_SENSIBLES,
      rutaOrigen: '/editar-perfil',
    });
    expect(vecesA(llamadas, 'GET', RUTA_ME)).toBe(2);
    expect(result.current.formulario.alergias).toBe(ALERGIAS);
    expect(result.current.formulario.nombre).toBe('Clienta Editada');
    expect(result.current.recargandoAlergias).toBe(false);

    // Ya con autorización, cambiar las alergias pide la casilla y manda consienteDatosSensibles.
    await escribir(result, { alergias: 'Látex ficticio' });
    expect(result.current.pideConsentimiento).toBe(true);
    await tocar(() => result.current.setConsiente(true));
    await tocar(() => result.current.guardar());
    await waitFor(() => expect(routerSimulado.dismissTo).toHaveBeenCalledTimes(1));
    expect(cuerposPatch(llamadas)).toEqual([
      { nombre: 'Clienta Editada', alergias: 'Látex ficticio', consienteDatosSensibles: true },
    ]);
  });

  it('si /me falla tras autorizar, lo explica y "Reintentar" solo vuelve a leer', async () => {
    const { result, llamadas } = await montar({
      [`GET ${RUTA_ME}`]: [me(SIN_AUTORIZAR), 'sinRed', me(AUTORIZADO)],
    });

    await autorizarEnHoja(result);
    await waitFor(() => expect(result.current.errorAlergias).not.toBeNull());
    expect(result.current.alergiasAutorizadas).toBe(false);
    expect(result.current.textoReintentar).toBe(RESPALDO_TEXTOS['datosSensibles.app.reintentar']);

    await tocar(() => result.current.reintentarAlergias());
    await waitFor(() => expect(result.current.alergiasAutorizadas).toBe(true));
    expect(result.current.errorAlergias).toBeNull();
    // La autorización no se volvió a mandar.
    expect(vecesA(llamadas, 'POST', RUTA_SENSIBLES)).toBe(1);
  });

  it('si /me responde algo ilegible tras autorizar, usa el texto propio', async () => {
    const { result } = await montar({ [`GET ${RUTA_ME}`]: [me(SIN_AUTORIZAR), respuestaCon({ data: null })] });

    await autorizarEnHoja(result);
    await waitFor(() => expect(result.current.errorAlergias).toBe(RESPALDO_TEXTOS['auth.perfil.alergiasNoCargaron']));
  });
});

describe('Editar perfil: respuestas del guardado', () => {
  it('alergiasPendientesDeAutorizacion: se queda, lo explica y vuelve a leer el perfil', async () => {
    const { result, llamadas } = await montar({
      [`GET ${RUTA_ME}`]: [me(AUTORIZADO), me(OCULTAS)],
      [`PATCH ${RUTA_ME}`]: [guardado({ alergias: null, alergiasPendientesDeAutorizacion: true })],
    });
    await escribir(result, { alergias: 'Látex ficticio' });
    await tocar(() => result.current.setConsiente(true));

    await tocar(() => result.current.guardar());
    await waitFor(() => expect(result.current.avisoAlergias).toBe(RESPALDO_TEXTOS['auth.perfil.alergiasPendientes']));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(routerSimulado.dismissTo).not.toHaveBeenCalled();
    expect(vecesA(llamadas, 'GET', RUTA_ME)).toBe(2);
    expect(result.current.alergiasAutorizadas).toBe(false);
    expect(result.current.formulario.alergias).toBe('');
    expect(result.current.guardando).toBe(false);
  });

  it('el 400 CONSENTIMIENTO_SALUD_REQUERIDO marca la casilla con su texto', async () => {
    const { result } = await montar({
      [`GET ${RUTA_ME}`]: [me(AUTORIZADO)],
      [`PATCH ${RUTA_ME}`]: [
        respuestaCon(
          { success: false, statusCode: 400, code: 'CONSENTIMIENTO_SALUD_REQUERIDO', message: 'Para guardar tus alergias marca la casilla de datos de salud.' },
          400,
        ),
      ],
    });
    await escribir(result, { alergias: 'Látex ficticio' });
    await tocar(() => result.current.setConsiente(true));

    await tocar(() => result.current.guardar());
    await waitFor(() => expect(result.current.errorGeneral).toBe(RESPALDO_TEXTOS['errores.consentimientoSalud']));
    expect(result.current.errores.consiente).toBe(ERROR_CONSENTIMIENTO_SALUD);
    expect(result.current.enfoque?.campo).toBe('consiente');
    expect(routerSimulado.dismissTo).not.toHaveBeenCalled();
  });

  it('un 429 muestra el message del backend y deja "Guardar cambios" en espera sin volver a guardar', async () => {
    const { result, llamadas } = await montar({
      [`GET ${RUTA_ME}`]: [me(AUTORIZADO)],
      [`PATCH ${RUTA_ME}`]: [limite429(2), guardado()],
    });
    expect(result.current.textoGuardar).toBe('Guardar cambios');
    await escribir(result, { colorNatural: 'Negro ficticio' });

    await tocar(() => result.current.guardar());
    await waitFor(() => expect(result.current.errorGeneral).toBe(MENSAJE_LIMITE));
    expect(result.current.guardarEnEspera).toBe(true);
    expect(result.current.textoGuardar).toBe(esperaDe(2));

    // En espera, tocar "Guardar cambios" no llama al servidor.
    await tocar(() => result.current.guardar());
    expect(vecesA(llamadas, 'PATCH', RUTA_ME)).toBe(1);

    await avanzar(1000);
    expect(result.current.textoGuardar).toBe(esperaDe(1));
    await avanzar(1000);
    expect(result.current.guardarEnEspera).toBe(false);
    expect(result.current.textoGuardar).toBe('Guardar cambios');

    await tocar(() => result.current.guardar());
    await waitFor(() => expect(routerSimulado.dismissTo).toHaveBeenCalledTimes(1));
    expect(vecesA(llamadas, 'PATCH', RUTA_ME)).toBe(2);
  });

  it('mientras guarda, el botón dice "Guardando…"', async () => {
    const { result } = await montar({ [`GET ${RUTA_ME}`]: [me(AUTORIZADO)], [`PATCH ${RUTA_ME}`]: ['pendiente'] });
    await escribir(result, { colorNatural: 'Negro ficticio' });
    await tocar(() => result.current.guardar());
    expect(result.current.textoGuardar).toBe('Guardando…');
  });
});

describe('PerfilModel con la autorización de datos sensibles', () => {
  it('normalizarPerfil solo acepta la autorización con un true expreso', () => {
    expect(normalizarPerfil({ data: AUTORIZADO })).toMatchObject({
      alergias: ALERGIAS,
      datosSensiblesAutorizados: true,
      alergiasOcultas: false,
    });
    expect(normalizarPerfil({ data: { ...AUTORIZADO, datosSensiblesAutorizados: 'true' } })).toMatchObject({
      alergias: '',
      datosSensiblesAutorizados: false,
    });
    expect(normalizarPerfil({ data: OCULTAS })).toMatchObject({ alergias: '', alergiasOcultas: true });
    // Con autorización, alergiasOcultas no aplica aunque llegara en true.
    expect(normalizarPerfil({ data: { ...AUTORIZADO, alergiasOcultas: true } })?.alergiasOcultas).toBe(false);
  });

  it('cambiosDelPerfil y requiereConsentimientoPerfil ignoran las alergias sin autorización', () => {
    const perfil = normalizarPerfil({ data: SIN_AUTORIZAR });
    if (!perfil) {
      throw new Error('perfil ilegible');
    }
    const formulario = { ...formularioDesdePerfil(perfil), alergias: 'Látex ficticio' };
    expect(cambiosDelPerfil(perfil, formulario, '1995-04-12')).toEqual({});
    expect(requiereConsentimientoPerfil(perfil, 'Látex ficticio')).toBe(false);
  });

  it('alergiasPendientesDelGuardado lee el true dentro de data o en la raíz', () => {
    expect(alergiasPendientesDelGuardado({ data: { alergiasPendientesDeAutorizacion: true } })).toBe(true);
    expect(alergiasPendientesDelGuardado({ alergiasPendientesDeAutorizacion: true })).toBe(true);
    expect(alergiasPendientesDelGuardado({ data: { alergiasPendientesDeAutorizacion: 'true' } })).toBe(false);
    expect(alergiasPendientesDelGuardado({ data: {} })).toBe(false);
    expect(alergiasPendientesDelGuardado(null)).toBe(false);
  });
});
