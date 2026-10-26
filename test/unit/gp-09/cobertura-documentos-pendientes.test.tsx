/// <reference types="jest" />

import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';

import {
  reiniciarReaceptacion,
  useDocumentosPendientes,
  type DocumentosPendientesViewModel,
} from '@/features/auth/viewmodels/useDocumentosPendientes';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { abrirNavegadorSimulado } from '../../helpers/documentosFicticios';
import {
  RUTA_CONSENTIMIENTOS,
  RUTA_PENDIENTES,
  pendienteCrudo,
  respuestaConsentimientoGuardado,
  respuestaPendientes,
  versionNoPublicada400,
  vigenteCrudo,
} from '../../helpers/documentosPendientes';
import { limite429 } from '../../helpers/limitesRed';
import { llamadasA } from '../../helpers/servidorSimulado';
import {
  authSimulada,
  diferida,
  enSecuencia,
  reiniciarSimulaciones,
  servidorVm,
  sinRed,
  type ManejadorVm,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-09, cobertura de la re-aceptación de documentos pendientes: la reconsulta tras un 400 de versión
 * cambiada que falla (la clienta sigue sin poder salir), doble toque en "Aceptar" y en "Cerrar sesión",
 * la sesión que cambia a mitad de una aceptación (con éxito o con 429), el título de una sesión
 * anterior que llega tarde, el navegador que no abre y el regreso a la raíz con la fase vieja. useAuth
 * y expo-web-browser simulados; fetch simulado en http://api.test con datos ficticios.
 */

jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

const CLIENTA = { id: 'clienta-cob-legal-1', nombre: 'Clienta Legal', email: 'legal-cob@ejemplo.test', rol: 'cliente' };
const OTRA = { id: 'clienta-cob-legal-2', nombre: 'Otra Clienta', email: 'otra-cob@ejemplo.test', rol: 'cliente' };
const NUEVO = pendienteCrudo({ tipo: 'nuevo', documentoSlug: 'documento-nuevo', versionAceptada: null });
const RUTA_VIGENTE_NUEVO = 'GET /api/documentos-legales/documento-nuevo/vigente';

type Resultado = { current: DocumentosPendientesViewModel };

beforeEach(() => {
  reiniciarSimulaciones();
  reiniciarReaceptacion();
  reiniciarDocumentosLegales();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA;
});

afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
});

async function montar(rutas: Record<string, ManejadorVm>) {
  const llamadas = servidorVm(rutas);
  const vista = await renderHook(() => useDocumentosPendientes());
  await waitFor(() => expect(vista.result.current.visible).toBe(true));
  return { ...vista, llamadas };
}

async function marcar(result: Resultado): Promise<void> {
  await act(async () => {
    result.current.alternar(true);
  });
}

describe('aceptar a mitad de una petición', () => {
  it('si la reconsulta tras una versión cambiada falla, la pantalla sigue a la vista con su aviso', async () => {
    const { result, llamadas } = await montar({
      [`GET ${RUTA_PENDIENTES}`]: enSecuencia(() => respuestaPendientes([pendienteCrudo()]), sinRed),
      [`POST ${RUTA_CONSENTIMIENTOS}`]: () => versionNoPublicada400(),
    });
    await marcar(result);
    await act(async () => {
      result.current.aceptar();
    });

    await waitFor(() => expect(llamadasA(llamadas, 'GET', RUTA_PENDIENTES)).toHaveLength(2));
    await waitFor(() => expect(result.current.enviando).toBe(false));
    expect(result.current.visible).toBe(true);
    expect(result.current.cargando).toBe(false);
    expect(result.current.error).toBe(obtenerTexto('legal.pendientes.cambio'));
    expect(result.current.error).not.toMatch(/no está publicada/);
  });

  it('doble toque en "Aceptar" mientras se envía: una sola aceptación', async () => {
    const envio = diferida();
    const { result, llamadas } = await montar({
      [`GET ${RUTA_PENDIENTES}`]: enSecuencia(
        () => respuestaPendientes([pendienteCrudo()]),
        () => respuestaPendientes([]),
      ),
      [`POST ${RUTA_CONSENTIMIENTOS}`]: () => envio.promesa,
    });
    await marcar(result);
    await act(async () => {
      result.current.aceptar();
    });
    expect(result.current.enviando).toBe(true);
    await act(async () => {
      result.current.aceptar();
    });
    expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(1);

    await act(async () => {
      envio.soltar(respuestaConsentimientoGuardado());
    });
    await waitFor(() => expect(result.current.visible).toBe(false));
    expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(1);
  });

  it('si la sesión se cierra mientras se acepta, la respuesta no vuelve a consultar ni escribe', async () => {
    const envio = diferida();
    const vista = await montar({
      [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo()]),
      [`POST ${RUTA_CONSENTIMIENTOS}`]: () => envio.promesa,
    });
    await marcar(vista.result);
    await act(async () => {
      vista.result.current.aceptar();
    });

    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    await vista.rerender({});
    expect(vista.result.current.visible).toBe(false);
    expect(vista.result.current.enviando).toBe(false);

    await act(async () => {
      envio.soltar(respuestaConsentimientoGuardado());
    });
    expect(llamadasA(vista.llamadas, 'GET', RUTA_PENDIENTES)).toHaveLength(1);
    expect(vista.result.current.visible).toBe(false);
    expect(vista.result.current.enviando).toBe(false);
  });

  it('si entra otra clienta mientras se acepta, un 429 tardío no la deja en espera ni le muestra error', async () => {
    const envio = diferida();
    const vista = await montar({
      [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo()]),
      [`POST ${RUTA_CONSENTIMIENTOS}`]: () => envio.promesa,
    });
    await marcar(vista.result);
    await act(async () => {
      vista.result.current.aceptar();
    });

    authSimulada.usuario = OTRA;
    await vista.rerender({});
    await waitFor(() => expect(llamadasA(vista.llamadas, 'GET', RUTA_PENDIENTES)).toHaveLength(2));
    await waitFor(() => expect(vista.result.current.visible).toBe(true));

    await act(async () => {
      envio.soltar(limite429(20));
    });
    expect(vista.result.current.error).toBeNull();
    expect(vista.result.current.espera).toBeNull();
    expect(vista.result.current.marcada).toBe(false);
    await marcar(vista.result);
    expect(vista.result.current.aceptarDeshabilitado).toBe(false);
  });
});

describe('cerrar sesión y abrir el documento', () => {
  it('doble toque en "Cerrar sesión": se pide una sola vez', async () => {
    let soltar: (cerrada: boolean) => void = () => undefined;
    authSimulada.salir.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolver) => {
          soltar = resolver;
        }),
    );
    const { result } = await montar({ [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo()]) });

    await act(async () => {
      result.current.cerrarSesion();
    });
    expect(result.current.cerrandoSesion).toBe(true);
    expect(result.current.aceptarDeshabilitado).toBe(true);
    await act(async () => {
      result.current.cerrarSesion();
    });
    expect(authSimulada.salir).toHaveBeenCalledTimes(1);

    await act(async () => {
      soltar(true);
    });
    expect(result.current.error).toBeNull();
  });

  it('si el navegador no abre el documento lo dice; al abrirlo después, el aviso se quita', async () => {
    abrirNavegadorSimulado().mockRejectedValueOnce(new Error('sin navegador'));
    const { result } = await montar({ [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo()]) });

    await act(async () => {
      result.current.abrirCompleto();
    });
    await waitFor(() => expect(result.current.avisoAbrir).toBe(obtenerTexto('legal.pendientes.sinAbrir')));
    expect(abrirNavegadorSimulado()).toHaveBeenCalledWith('http://web.test/aviso-de-privacidad');

    await act(async () => {
      result.current.abrirCompleto();
    });
    await waitFor(() => expect(result.current.avisoAbrir).toBeNull());
    expect(abrirNavegadorSimulado()).toHaveBeenCalledTimes(2);
  });
});

describe('datos que llegan de una sesión anterior', () => {
  it('el título del documento pedido en la sesión anterior no se pinta en la de otra clienta', async () => {
    const tituloViejo = diferida();
    const tituloNuevo = diferida();
    const vista = await montar({
      [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([NUEVO]),
      [RUTA_VIGENTE_NUEVO]: enSecuencia(
        () => tituloViejo.promesa,
        () => tituloNuevo.promesa,
      ),
    });
    const respaldo = obtenerTexto('legal.pendientes.tituloRespaldo');
    expect(vista.result.current.titulo).toBe(respaldo);

    authSimulada.usuario = OTRA;
    await vista.rerender({});
    await waitFor(() => expect(llamadasA(vista.llamadas, 'GET', '/api/documentos-legales/documento-nuevo/vigente')).toHaveLength(2));
    await waitFor(() => expect(vista.result.current.visible).toBe(true));

    await act(async () => {
      tituloViejo.soltar(vigenteCrudo('documento-nuevo', 'Título de la sesión anterior', '/documento-nuevo'));
    });
    expect(vista.result.current.titulo).toBe(respaldo);

    await act(async () => {
      tituloNuevo.soltar(vigenteCrudo('documento-nuevo', 'Documento nuevo ficticio', '/documento-nuevo'));
    });
    await waitFor(() => expect(vista.result.current.titulo).toBe('Documento nuevo ficticio'));
  });

  it('al volver a montarse con la fase vieja no pinta un visor vacío: consulta otra vez y lo muestra', async () => {
    const primera = await montar({ [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo()]) });
    await primera.unmount();

    const vistos: boolean[] = [];
    const segunda = await renderHook(() => {
      const vm = useDocumentosPendientes();
      vistos.push(vm.visible);
      return vm;
    });
    expect(vistos[0]).toBe(false);
    await waitFor(() => expect(segunda.result.current.visible).toBe(true));
    expect(llamadasA(primera.llamadas, 'GET', RUTA_PENDIENTES)).toHaveLength(2);
  });
});
