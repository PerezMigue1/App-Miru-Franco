/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { obtenerTexto } from '@/shared/api/textosSitio';

import {
  BLOQUEO_CITA,
  CLAVE_FICTICIA,
  FOLIO_FICTICIO,
  RUTA_DESACTIVAR,
  RUTA_ELIMINAR,
  RUTA_REVISION,
  SE_CANCELA_CITA,
  errorCuenta,
  respuestaBaja,
  respuestaRevision,
} from '../../helpers/miCuenta';
import { LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import { abrirPerfilConSesion } from '../../helpers/pantallasPerfil';
import { leerSecureStore } from '../../helpers/secureStore';
import { sesionGuardada } from '../../helpers/sesionGuardada';
import { llamadasA, respuesta, type Manejador } from '../../helpers/servidorSimulado';

/**
 * GP-09, bloque B: Perfil > Mi cuenta con las pantallas reales (renderRouter sobre src/app),
 * AuthProvider real y solo el servidor simulado en http://api.test. Eliminar con la contraseña
 * borra la sesión de SecureStore y abre Acceso con el mensaje y el folio; un error (contraseña
 * incorrecta, bloqueo temporal) deja la sesión abierta; un bloqueo abre su cita.
 */

const FILA_MI_CUENTA = `${obtenerTexto('cuenta.app.fila')}, ${obtenerTexto('cuenta.app.filaDescripcion')}`;
const FILA_ELIMINAR = `${obtenerTexto('cuenta.eliminar.titulo')}, ${obtenerTexto('cuenta.eliminar.explicacion')}`;
const FILA_DESACTIVAR = `${obtenerTexto('cuenta.desactivar.titulo')}, ${obtenerTexto('cuenta.desactivar.explicacion')}`;
const MENSAJE_SIN_FOLIO = 'Eliminamos tu cuenta y cerramos tus sesiones.';
const SESION_TERMINADA = 'Tu sesión terminó. Inicia sesión de nuevo.';

/** Desde Perfil abre Mi cuenta. */
async function abrirMiCuenta(rutas: Record<string, Manejador>) {
  const abierto = await abrirPerfilConSesion(rutas);
  await fireEvent.press(screen.getByRole('button', { name: FILA_MI_CUENTA }));
  await waitFor(() => expect(abierto.app.getPathname()).toBe('/mi-cuenta'));
  expect(await screen.findByRole('header', { name: 'Paso 1 de 3: Elige qué hacer' })).toBeOnTheScreen();
  return abierto;
}

/** Desde la revisión: continúa y escribe la contraseña con la casilla marcada. */
async function continuarConClave(casillaTexto: string): Promise<void> {
  await fireEvent.press(await screen.findByRole('button', { name: obtenerTexto('cuenta.app.continuar') }));
  expect(await screen.findByRole('header', { name: 'Paso 3 de 3: Confirma que eres tú' })).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText(obtenerTexto('cuenta.app.etiquetaPassword')), CLAVE_FICTICIA);
  const casilla = screen.getByRole('checkbox', { name: casillaTexto });
  expect(casilla).not.toBeChecked();
  await fireEvent.press(casilla);
}

describe('Mi cuenta con las pantallas reales (GP-09)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'elimina la cuenta: borra la sesión del teléfono y Acceso muestra el mensaje con el folio',
    async () => {
      const { app, llamadas } = await abrirMiCuenta({
        [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ seResuelveSolo: [SE_CANCELA_CITA] }),
        [`DELETE ${RUTA_ELIMINAR}`]: () => respuestaBaja(MENSAJE_SIN_FOLIO, FOLIO_FICTICIO),
      });
      const { token } = sesionGuardada() ?? { token: '' };

      await fireEvent.press(screen.getByRole('button', { name: FILA_ELIMINAR }));
      expect(await screen.findByText(SE_CANCELA_CITA.mensaje)).toBeOnTheScreen();
      await continuarConClave(obtenerTexto('cuenta.confirmar.casillaEliminar'));
      expect(screen.getByText(obtenerTexto('cuenta.confirmar.eliminar'))).toBeOnTheScreen();
      // Hasta aquí la sesión sigue en el teléfono.
      expect(sesionGuardada()).not.toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: obtenerTexto('cuenta.eliminar.titulo') }));
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      expect(await screen.findByText(`${MENSAJE_SIN_FOLIO} Folio: ${FOLIO_FICTICIO}`)).toBeOnTheScreen();
      expect(screen.queryByText(SESION_TERMINADA)).not.toBeOnTheScreen();

      const bajas = llamadasA(llamadas, 'DELETE', RUTA_ELIMINAR);
      expect(bajas).toHaveLength(1);
      expect(bajas[0].cuerpo).toEqual({ password: CLAVE_FICTICIA, confirmacion: true });
      expect(bajas[0].cabeceras.Authorization).toBe(`Bearer ${token}`);
      // El servidor ya revocó las sesiones: no se llama a /logout y la sesión local se borró.
      expect(llamadasA(llamadas, 'POST', '/api/auth/logout')).toHaveLength(0);
      expect(sesionGuardada()).toBeNull();
      expect(leerSecureStore().bienvenida_vista).toBe('1');

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'contraseña incorrecta y bloqueo temporal: el mensaje junto al campo y la sesión sigue abierta',
    async () => {
      let vez = 0;
      const { app, llamadas } = await abrirMiCuenta({
        [`GET ${RUTA_REVISION}`]: () => respuestaRevision(),
        [`POST ${RUTA_DESACTIVAR}`]: () => {
          vez += 1;
          return vez === 1
            ? errorCuenta(400, 'PASSWORD_INCORRECTA', 'La contraseña no es correcta.')
            : errorCuenta(429, 'BLOQUEO_TEMPORAL', 'Tu cuenta quedó bloqueada 15 minutos.', { retryAfter: 900 });
        },
      });

      await fireEvent.press(screen.getByRole('button', { name: FILA_DESACTIVAR }));
      await continuarConClave(obtenerTexto('cuenta.confirmar.casillaDesactivar'));
      await fireEvent.press(screen.getByRole('button', { name: obtenerTexto('cuenta.desactivar.titulo') }));
      expect(await screen.findByText('La contraseña no es correcta.')).toBeOnTheScreen();
      expect(sesionGuardada()).not.toBeNull();

      await fireEvent.changeText(screen.getByLabelText(obtenerTexto('cuenta.app.etiquetaPassword')), 'OtraFicticia2!');
      await fireEvent.press(screen.getByRole('button', { name: obtenerTexto('cuenta.desactivar.titulo') }));
      expect(await screen.findByText('Tu cuenta quedó bloqueada 15 minutos.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: /^Intenta de nuevo en \d+ s$/ })).toBeDisabled();

      expect(llamadasA(llamadas, 'POST', RUTA_DESACTIVAR)).toHaveLength(2);
      expect(app.getPathname()).toBe('/mi-cuenta');
      expect(sesionGuardada()).not.toBeNull();
      expect(screen.queryByText(SESION_TERMINADA)).not.toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'un bloqueo abre su cita y no se ofrece continuar',
    async () => {
      const { app } = await abrirMiCuenta({
        [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ bloqueos: [BLOQUEO_CITA] }),
        [`GET /api/citas/${BLOQUEO_CITA.id}?propios=true`]: () => respuesta({ message: 'No encontrada' }, 404),
      });

      await fireEvent.press(screen.getByRole('button', { name: FILA_DESACTIVAR }));
      const fila = await screen.findByRole('button', { name: BLOQUEO_CITA.mensaje });
      expect(screen.queryByRole('button', { name: obtenerTexto('cuenta.app.continuar') })).not.toBeOnTheScreen();
      await fireEvent.press(fila);
      await waitFor(() => expect(app.getPathname()).toBe(`/cita/${BLOQUEO_CITA.id}`));
      expect(sesionGuardada()).not.toBeNull();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
