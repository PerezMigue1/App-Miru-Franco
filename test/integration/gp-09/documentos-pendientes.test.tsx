/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AppState } from 'react-native';

import { reiniciarReaceptacion } from '@/features/auth/viewmodels/useDocumentosPendientes';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { obtenerTexto } from '@/shared/api/textosSitio';

import {
  HASH_AVISO,
  HASH_TERMINOS,
  RUTA_CONSENTIMIENTOS,
  RUTA_PENDIENTES,
  pendienteCrudo,
  pendienteTerminos,
  respuestaConsentimientoGuardado,
  respuestaPendientes,
  versionNoPublicada400,
  vigenteCrudo,
} from '../../helpers/documentosPendientes';
import { abrirNavegadorSimulado } from '../../helpers/documentosFicticios';
import { limite429, saturacion503 } from '../../helpers/limitesRed';
import { LIMITE_MS, abrirApp, cerrarIntroSiAparece, prepararPruebasDePantalla } from '../../helpers/pantallas';
import { CLIENTA, simularServidorPerfil } from '../../helpers/perfilClienta';
import { llamadasA, respuesta, type Manejador } from '../../helpers/servidorSimulado';
import { sembrarSesion, sesionGuardada } from '../../helpers/sesionGuardada';

/**
 * GP-09, bloque A: documentos legales pendientes con las pantallas reales (renderRouter sobre
 * src/app), AuthProvider real y solo el servidor simulado en http://api.test. Con sesión guardada la
 * app consulta los pendientes; si hay, la pantalla obligatoria los muestra uno por uno, con la casilla
 * sin marcar y "Aceptar" deshabilitado hasta marcarla. Una falla de la consulta no bloquea la app.
 */

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

const oyentesAppState = AppState.addEventListener as unknown as jest.Mock;

const ACEPTAR = obtenerTexto('legal.pendientes.aceptar');
const CERRAR_SESION = obtenerTexto('legal.pendientes.cerrarSesion');
const casillaDe = (titulo: string, version = '2.1') => obtenerTexto('legal.pendientes.casilla', { titulo, version });

const VIGENTES: Record<string, Manejador> = {
  'GET /api/documentos-legales/aviso-privacidad/vigente': () =>
    vigenteCrudo('aviso-privacidad', 'Aviso de Privacidad', '/aviso-de-privacidad'),
  'GET /api/documentos-legales/terminos/vigente': () =>
    vigenteCrudo('terminos', 'Términos y Condiciones', '/terminos-y-condiciones', { hash: HASH_TERMINOS, vigenteDesde: '2026-10-18' }),
};

/**
 * Rutas de pendientes con estado, como el backend: GET devuelve solo los que no se han aceptado y
 * POST con 201 marca aceptado el documento de su elemento. `aceptar` decide la respuesta del POST.
 */
function pendientesConEstado(
  lista: Array<Record<string, unknown>>,
  aceptar: () => Response = respuestaConsentimientoGuardado,
): Record<string, Manejador> {
  const aceptados = new Set<unknown>();
  return {
    [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes(lista.filter((p) => !aceptados.has(p.documentoSlug))),
    [`POST ${RUTA_CONSENTIMIENTOS}`]: (cuerpo) => {
      const resultado = aceptar();
      if (resultado.status === 201) {
        aceptados.add((cuerpo as { items: Array<{ documentoSlug: string }> }).items[0].documentoSlug);
      }
      return resultado;
    },
  };
}

/** Abre la app con la sesión guardada de CLIENTA en Perfil y espera a que se consulten los pendientes. */
async function abrirConSesion(rutas: Record<string, Manejador>) {
  await sembrarSesion(CLIENTA);
  const llamadas = simularServidorPerfil({ ...VIGENTES, ...rutas });
  const app = await abrirApp('/perfil');
  await cerrarIntroSiAparece();
  await waitFor(() => expect(llamadasA(llamadas, 'GET', RUTA_PENDIENTES).length).toBeGreaterThan(0));
  return { app, llamadas };
}

describe('Documentos legales pendientes (GP-09)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  beforeEach(() => {
    reiniciarDocumentosLegales();
    reiniciarReaceptacion();
  });

  it(
    'con varios pendientes los pide uno por uno y solo deja aceptar con la casilla marcada',
    async () => {
      const { llamadas } = await abrirConSesion(pendientesConEstado([pendienteCrudo(), pendienteTerminos()]));

      // Primero el Aviso: título, versión, vigencia, la explicación y "Documento 1 de 2".
      expect(await screen.findByText('Aviso de Privacidad')).toBeOnTheScreen();
      expect(screen.getByText('Versión 2.1')).toBeOnTheScreen();
      expect(screen.getByText('Vigente desde el 20 de octubre de 2026')).toBeOnTheScreen();
      expect(screen.getByText('Documento 1 de 2')).toBeOnTheScreen();
      expect(
        screen.getByText(obtenerTexto('legal.pendientes.introNueva', { versionAceptada: '2.0' })),
      ).toBeOnTheScreen();
      // Sin botón Volver: no se sale de la pantalla.
      expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeOnTheScreen();

      const casilla = screen.getByRole('checkbox', { name: casillaDe('Aviso de Privacidad') });
      expect(casilla).not.toBeChecked();
      expect(screen.getByRole('button', { name: ACEPTAR })).toBeDisabled();
      await fireEvent.press(screen.getByRole('button', { name: ACEPTAR }));
      expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(0);

      await fireEvent.press(casilla);
      expect(screen.getByRole('button', { name: ACEPTAR })).toBeEnabled();
      await fireEvent.press(screen.getByRole('button', { name: ACEPTAR }));

      // Luego los Términos, con la casilla otra vez sin marcar.
      expect(await screen.findByText('Documento 2 de 2')).toBeOnTheScreen();
      expect(screen.getByText('Términos y Condiciones')).toBeOnTheScreen();
      expect(screen.getByText(obtenerTexto('legal.pendientes.introSinAceptar'))).toBeOnTheScreen();
      const segunda = screen.getByRole('checkbox', { name: casillaDe('Términos y Condiciones') });
      expect(segunda).not.toBeChecked();
      await fireEvent.press(segunda);
      await fireEvent.press(screen.getByRole('button', { name: ACEPTAR }));

      await waitFor(() => expect(screen.queryByRole('checkbox', { name: casillaDe('Términos y Condiciones') })).not.toBeOnTheScreen());
      const envios = llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS);
      expect(envios.map((envio) => envio.cuerpo)).toEqual([
        {
          items: [{ tipo: 'aviso_privacidad', documentoSlug: 'aviso-privacidad', version: '2.1', hash: HASH_AVISO, accion: 'aceptado' }],
          formulario: 'reaceptacion',
          rutaOrigen: '/documentos-pendientes',
        },
        {
          items: [{ tipo: 'terminos', documentoSlug: 'terminos', version: '2.1', hash: HASH_TERMINOS, accion: 'aceptado' }],
          formulario: 'reaceptacion',
          rutaOrigen: '/documentos-pendientes',
        },
      ]);
      expect(envios[0].cabeceras.Authorization).toMatch(/^Bearer /);
      // Al aceptar el último se confirma con el backend que no quedó ninguno.
      await waitFor(() => expect(llamadasA(llamadas, 'GET', RUTA_PENDIENTES)).toHaveLength(2));
      expect(screen.getByText(CLIENTA.nombre)).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'abre el texto completo del documento en el sitio',
    async () => {
      await abrirConSesion({ [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo()]) });

      await fireEvent.press(await screen.findByRole('button', { name: 'Leer el documento completo' }));

      expect(abrirNavegadorSimulado()).toHaveBeenCalledWith('http://web.test/aviso-de-privacidad');
      // Con uno solo no se dice "Documento 1 de 1".
      expect(screen.queryByText(/Documento 1 de/)).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'un documento que la app no conoce también se pide aceptar, con el tipo y el slug del backend',
    async () => {
      const { llamadas } = await abrirConSesion({
        ...pendientesConEstado([pendienteCrudo({ tipo: 'facturacion', documentoSlug: 'aviso-facturacion', version: '1.0' })]),
        'GET /api/documentos-legales/aviso-facturacion/vigente': () =>
          vigenteCrudo('aviso-facturacion', 'Aviso de facturación', '/aviso-facturacion'),
      });

      await fireEvent.press(await screen.findByRole('checkbox', { name: casillaDe('Aviso de facturación', '1.0') }));
      await fireEvent.press(screen.getByRole('button', { name: ACEPTAR }));

      await waitFor(() => expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(1));
      expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)[0].cuerpo).toMatchObject({
        items: [{ tipo: 'facturacion', documentoSlug: 'aviso-facturacion', version: '1.0', accion: 'aceptado' }],
      });
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si la versión cambió mientras la leía, vuelve a pedir la lista y muestra la vigente sin marcar',
    async () => {
      let consultas = 0;
      const { llamadas } = await abrirConSesion({
        [`GET ${RUTA_PENDIENTES}`]: () => {
          consultas += 1;
          return respuestaPendientes([pendienteCrudo(consultas > 1 ? { version: '2.2' } : {})]);
        },
        [`POST ${RUTA_CONSENTIMIENTOS}`]: () => versionNoPublicada400(),
      });

      await fireEvent.press(await screen.findByRole('checkbox', { name: casillaDe('Aviso de Privacidad') }));
      await fireEvent.press(screen.getByRole('button', { name: ACEPTAR }));

      expect(await screen.findByText(obtenerTexto('legal.pendientes.cambio'))).toBeOnTheScreen();
      const nueva = await screen.findByRole('checkbox', { name: casillaDe('Aviso de Privacidad', '2.2') });
      expect(nueva).not.toBeChecked();
      expect(screen.getByText('Versión 2.2')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'GET', RUTA_PENDIENTES)).toHaveLength(2);
      // El mensaje técnico del servidor nunca se muestra.
      expect(screen.queryByText(/no está publicada/)).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si al confirmar después del último ya hay otra versión publicada, la pide aceptar',
    async () => {
      let consultas = 0;
      await abrirConSesion({
        [`GET ${RUTA_PENDIENTES}`]: () => {
          consultas += 1;
          return respuestaPendientes([pendienteCrudo(consultas > 1 ? { version: '2.2' } : {})]);
        },
        [`POST ${RUTA_CONSENTIMIENTOS}`]: () => respuestaConsentimientoGuardado(),
      });

      await fireEvent.press(await screen.findByRole('checkbox', { name: casillaDe('Aviso de Privacidad') }));
      await fireEvent.press(screen.getByRole('button', { name: ACEPTAR }));

      expect(await screen.findByRole('checkbox', { name: casillaDe('Aviso de Privacidad', '2.2') })).not.toBeChecked();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'un 429 al aceptar deja "Aceptar" en espera con el mensaje del backend y no cierra la sesión',
    async () => {
      const { llamadas } = await abrirConSesion({
        [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo()]),
        [`POST ${RUTA_CONSENTIMIENTOS}`]: () => limite429(30),
      });

      await fireEvent.press(await screen.findByRole('checkbox', { name: casillaDe('Aviso de Privacidad') }));
      await fireEvent.press(screen.getByRole('button', { name: ACEPTAR }));

      const enEspera = await screen.findByRole('button', { name: 'Intenta de nuevo en 30 s' });
      expect(enEspera).toBeDisabled();
      expect(screen.getByText('Hiciste demasiadas solicitudes. Intenta de nuevo en unos segundos.')).toBeOnTheScreen();
      await fireEvent.press(enEspera);
      expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(1);
      expect(sesionGuardada()).not.toBeNull();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'un error del servidor al aceptar muestra el respaldo y deja reintentar',
    async () => {
      let intentos = 0;
      await abrirConSesion(
        pendientesConEstado([pendienteCrudo()], () => {
          intentos += 1;
          return intentos === 1 ? respuesta({ message: 'Error interno' }, 500) : respuestaConsentimientoGuardado();
        }),
      );

      await fireEvent.press(await screen.findByRole('checkbox', { name: casillaDe('Aviso de Privacidad') }));
      await fireEvent.press(screen.getByRole('button', { name: ACEPTAR }));
      expect(await screen.findByText(obtenerTexto('legal.pendientes.error'))).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: ACEPTAR }));
      await waitFor(() => expect(screen.queryByRole('button', { name: ACEPTAR })).not.toBeOnTheScreen());
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    '"Cerrar sesión" es la única otra salida: borra la sesión y quita la pantalla',
    async () => {
      const { llamadas } = await abrirConSesion({
        [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo()]),
        'POST /api/auth/logout': () => respuesta({ success: true }),
      });

      await fireEvent.press(await screen.findByRole('button', { name: CERRAR_SESION }));

      await waitFor(() => expect(sesionGuardada()).toBeNull());
      await waitFor(() => expect(screen.queryByRole('button', { name: CERRAR_SESION })).not.toBeOnTheScreen());
      expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(0);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each([
    ['un 503 por saturación', () => saturacion503(null)],
    ['un 429', () => limite429(30)],
    ['un error del servidor', () => respuesta({ message: 'Error' }, 500)],
  ])(
    'si la consulta falla con %s no bloquea la app ni cierra la sesión',
    async (_caso, falla) => {
      await abrirConSesion({ [`GET ${RUTA_PENDIENTES}`]: falla });

      expect(await screen.findByText(CLIENTA.nombre)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: ACEPTAR })).not.toBeOnTheScreen();
      expect(sesionGuardada()).not.toBeNull();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin red tampoco bloquea, y al regresar a primer plano vuelve a consultar',
    async () => {
      let conRed = false;
      const previos = oyentesAppState.mock.calls.length;
      const { llamadas } = await abrirConSesion({
        [`GET ${RUTA_PENDIENTES}`]: () => {
          if (!conRed) {
            throw new TypeError('Network request failed');
          }
          return respuestaPendientes([pendienteCrudo()]);
        },
      });
      expect(await screen.findByText(CLIENTA.nombre)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: ACEPTAR })).not.toBeOnTheScreen();
      expect(sesionGuardada()).not.toBeNull();

      conRed = true;
      const oyentes = oyentesAppState.mock.calls
        .slice(previos)
        .filter(([evento]) => evento === 'change')
        .map(([, oyente]) => oyente as (estado: string) => void);
      for (const estado of ['background', 'active']) {
        await act(async () => {
          for (const oyente of oyentes) {
            oyente(estado);
          }
        });
      }

      expect(await screen.findByRole('button', { name: ACEPTAR })).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'GET', RUTA_PENDIENTES).length).toBeGreaterThanOrEqual(2);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin pendientes la app sigue igual y no se envía nada',
    async () => {
      const { llamadas } = await abrirConSesion({ [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([]) });

      expect(await screen.findByText(CLIENTA.nombre)).toBeOnTheScreen();
      expect(screen.queryByRole('checkbox')).not.toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(0);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
