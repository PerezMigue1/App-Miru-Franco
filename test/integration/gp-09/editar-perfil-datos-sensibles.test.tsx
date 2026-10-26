/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { ERROR_CONSENTIMIENTO_SALUD } from '@/features/auth/models/AuthModel';
import { reiniciarReaceptacion } from '@/features/auth/viewmodels/useDocumentosPendientes';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  HASH_SENSIBLES,
  PARRAFO_1,
  RUTA_SENSIBLES,
  RUTA_TEXTO_SENSIBLES,
  respuestaAutorizada,
  respuestaTextoSensibles,
} from '../../helpers/datosSensibles';
import { limite429, MENSAJE_LIMITE } from '../../helpers/limitesRed';
import { abrirApp, cerrarIntroSiAparece, LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import { CLIENTA, PERFIL_COMPLETO, respuestaPerfil, simularServidorPerfil } from '../../helpers/perfilClienta';
import { llamadasA, respuesta, type Llamada, type Manejador } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { TEXTO_SIN_CONEXION } from '../../helpers/textosError';

/**
 * GP-09, bloque B2, con las pantallas reales (renderRouter sobre src/app): sin la autorización de
 * datos sensibles, Editar perfil no muestra el campo de alergias ni las manda; explica que están
 * ocultas y ofrece "Leer y autorizar" (hoja con el texto del backend y la casilla sin marcar). Al
 * autorizar se registra la constancia, se vuelve a leer /me y aparece el campo con sus alergias. Un
 * 429 al guardar muestra el message del backend y deja "Guardar cambios" en espera. Servidor
 * simulado en http://api.test con datos ficticios y temporizadores falsos.
 */

const GUARDAR = 'Guardar cambios';
const LEER = RESPALDO_TEXTOS['auth.perfil.alergiasAutorizar'];
const CASILLA = RESPALDO_TEXTOS['datosSensibles.app.casilla'];
const AUTORIZO = RESPALDO_TEXTOS['datosSensibles.app.autorizo'];
const ALERGIAS = 'Polen ficticio';
const esperaDe = (segundos: number) => RESPALDO_TEXTOS['errores.esperaLimite'].replace('{segundos}', String(segundos));

/** /me que cambia cuando la clienta autoriza: antes, alergias ocultas; después, visibles. */
function rutasConAutorizacion(extra: Record<string, Manejador> = {}): Record<string, Manejador> {
  let autorizado = false;
  return {
    'GET /api/auth/me': () =>
      respuestaPerfil(
        autorizado
          ? { ...PERFIL_COMPLETO, alergias: ALERGIAS, datosSensiblesAutorizados: true, alergiasOcultas: false }
          : { ...PERFIL_COMPLETO, alergias: null, datosSensiblesAutorizados: false, alergiasOcultas: true },
      ),
    [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
    [`POST ${RUTA_SENSIBLES}`]: () => {
      autorizado = true;
      return respuestaAutorizada();
    },
    ...extra,
  };
}

async function abrirEditarPerfil(rutas: Record<string, Manejador>): Promise<Llamada[]> {
  await sembrarSesion(CLIENTA);
  const llamadas = simularServidorPerfil(rutas);
  const app = await abrirApp('/editar-perfil');
  await cerrarIntroSiAparece();
  expect(await screen.findByLabelText('Nombre completo')).toHaveDisplayValue(CLIENTA.nombre);
  expect(app.getPathname()).toBe('/editar-perfil');
  return llamadas;
}

describe('Editar perfil con la autorización de datos sensibles (GP-09)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  beforeEach(() => {
    reiniciarReaceptacion();
    reiniciarDocumentosLegales();
  });

  it(
    'sin autorización no muestra ni manda las alergias; al autorizar aparece el campo con ellas',
    async () => {
      const llamadas = await abrirEditarPerfil(
        rutasConAutorizacion({
          'PATCH /api/auth/me': () => respuesta({ success: true, message: 'Perfil actualizado correctamente', data: PERFIL_COMPLETO }),
        }),
      );

      expect(screen.queryByLabelText('Alergias')).not.toBeOnTheScreen();
      expect(screen.getByText(RESPALDO_TEXTOS['auth.perfil.alergiasOcultas'])).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: LEER }));
      expect(await screen.findByText(PARRAFO_1)).toBeOnTheScreen();
      const casilla = screen.getByRole('checkbox', { name: CASILLA });
      expect(casilla).not.toBeChecked();
      expect(screen.getByRole('button', { name: AUTORIZO })).toBeDisabled();
      await fireEvent.press(casilla);
      await fireEvent.press(screen.getByRole('button', { name: AUTORIZO }));

      expect(await screen.findByLabelText('Alergias')).toHaveDisplayValue(ALERGIAS);
      expect(screen.queryByText(RESPALDO_TEXTOS['auth.perfil.alergiasOcultas'])).not.toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)[0].cuerpo).toEqual({
        version: '1.0',
        hash: HASH_SENSIBLES,
        rutaOrigen: '/editar-perfil',
      });
      // Nada de alergias viajó por PATCH: la autorización tiene su propio endpoint.
      expect(llamadasA(llamadas, 'PATCH', '/api/auth/me')).toHaveLength(0);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con autorización funciona como antes: alergias nuevas piden la casilla y viajan con consienteDatosSensibles',
    async () => {
      const llamadas = await abrirEditarPerfil({
        'GET /api/auth/me': () =>
          respuestaPerfil({ ...PERFIL_COMPLETO, alergias: ALERGIAS, datosSensiblesAutorizados: true, alergiasOcultas: false }),
        'PATCH /api/auth/me': () => respuesta({ success: true, message: 'Perfil actualizado correctamente', data: PERFIL_COMPLETO }),
      });

      const alergias = screen.getByLabelText('Alergias');
      expect(alergias).toHaveDisplayValue(ALERGIAS);
      expect(screen.queryByRole('button', { name: LEER })).not.toBeOnTheScreen();
      await fireEvent.changeText(alergias, 'Látex ficticio');
      await fireEvent(alergias, 'blur');
      // Los demás campos siguen igual que antes.
      await fireEvent(screen.getByLabelText('Nombre completo'), 'blur');
      await fireEvent.changeText(screen.getByLabelText('Fecha de nacimiento'), '01021990');
      await fireEvent(screen.getByLabelText('Fecha de nacimiento'), 'blur');
      await fireEvent.changeText(screen.getByLabelText('Productos que usas'), 'Mascarilla ficticia');
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Deseo recibir promociones' }));

      const casilla = screen.getByRole('checkbox', { name: /^Autorizo el uso de mis datos de salud/ });
      expect(casilla).not.toBeChecked();
      await fireEvent.press(screen.getByRole('button', { name: GUARDAR }));
      expect(await screen.findByText(ERROR_CONSENTIMIENTO_SALUD)).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'PATCH', '/api/auth/me')).toHaveLength(0);

      await fireEvent.press(casilla);
      await fireEvent.press(screen.getByRole('button', { name: GUARDAR }));
      await waitFor(() => expect(llamadasA(llamadas, 'PATCH', '/api/auth/me')).toHaveLength(1));
      expect(llamadasA(llamadas, 'PATCH', '/api/auth/me')[0].cuerpo).toEqual({
        fechaNacimiento: '1990-02-01',
        productosUsados: 'Mascarilla ficticia',
        alergias: 'Látex ficticio',
        recibePromociones: true,
        consienteDatosSensibles: true,
      });

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si /me falla después de autorizar, lo explica y "Reintentar" solo vuelve a leer',
    async () => {
      let autorizado = false;
      let fallar = false;
      const llamadas = await abrirEditarPerfil({
        'GET /api/auth/me': () => {
          if (fallar) {
            fallar = false;
            throw new TypeError('Network request failed');
          }
          return respuestaPerfil(
            autorizado
              ? { ...PERFIL_COMPLETO, alergias: ALERGIAS, datosSensiblesAutorizados: true }
              : { ...PERFIL_COMPLETO, alergias: null, datosSensiblesAutorizados: false, alergiasOcultas: false },
          );
        },
        [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
        [`POST ${RUTA_SENSIBLES}`]: () => {
          autorizado = true;
          fallar = true;
          return respuestaAutorizada();
        },
      });
      expect(screen.getByText(RESPALDO_TEXTOS['auth.perfil.alergiasSinAutorizar'])).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: LEER }));
      await fireEvent.press(await screen.findByRole('checkbox', { name: CASILLA }));
      await fireEvent.press(screen.getByRole('button', { name: AUTORIZO }));
      expect(await screen.findByText(TEXTO_SIN_CONEXION)).toBeOnTheScreen();
      expect(screen.queryByLabelText('Alergias')).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: RESPALDO_TEXTOS['datosSensibles.app.reintentar'] }));
      expect(await screen.findByLabelText('Alergias')).toHaveDisplayValue(ALERGIAS);
      expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(1);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'un 429 al guardar muestra el message del backend y "Guardar cambios" espera esos segundos',
    async () => {
      let veces = 0;
      const llamadas = await abrirEditarPerfil(
        rutasConAutorizacion({
          'PATCH /api/auth/me': () => {
            veces += 1;
            return veces === 1
              ? limite429(3)
              : respuesta({ success: true, message: 'Perfil actualizado correctamente', data: PERFIL_COMPLETO });
          },
        }),
      );

      await fireEvent.changeText(screen.getByLabelText('Color natural'), 'Negro ficticio');
      await fireEvent.press(screen.getByRole('button', { name: GUARDAR }));
      expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
      const enEspera = screen.getByRole('button', { name: esperaDe(3) });
      expect(enEspera).toBeDisabled();
      await fireEvent.press(enEspera);
      expect(llamadasA(llamadas, 'PATCH', '/api/auth/me')).toHaveLength(1);
      // Sin la autorización, las alergias no viajaron.
      expect(llamadasA(llamadas, 'PATCH', '/api/auth/me')[0].cuerpo).toEqual({ colorNatural: 'Negro ficticio' });

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      const listo = await screen.findByRole('button', { name: GUARDAR });
      expect(listo).toBeEnabled();
      await fireEvent.press(listo);
      await waitFor(() => expect(llamadasA(llamadas, 'PATCH', '/api/auth/me')).toHaveLength(2));

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
