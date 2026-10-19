/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import {
  abrirApp,
  cerrarIntroSiAparece,
  LIMITE_MS,
  prepararPruebasDePantalla,
} from '../../helpers/pantallas';
import { abrirPerfilConSesion } from '../../helpers/pantallasPerfil';
import { CLIENTA, simularServidorPerfil } from '../../helpers/perfilClienta';
import { jwtFicticio, sembrarSesion, sesionGuardada, type SesionSembrada } from '../../helpers/sesionGuardada';
import { leerLlamada, llamadasA, respuesta, type Llamada } from '../../helpers/servidorSimulado';

/**
 * GP-05.2: pestaña Perfil con las pantallas reales (renderRouter sobre src/app) y solo el servidor
 * simulado. Sin sesión muestra la invitación; con sesión, los datos de GET /api/auth/me; y tras una
 * renovación móvil el perfil se sigue cargando con el acceso nuevo (la sesión de 30 días ya se
 * probó en GP-05: aquí solo se confirma desde Perfil).
 */

const RUTA_RENOVAR = '/api/auth/movil/renovar';
const FILA_EDITAR = 'Editar perfil, Nombre, teléfono, fecha de nacimiento y datos de tu cabello.';
const FILA_CONTRASENA = 'Cambiar contraseña, Confirma el cambio con un código que llega a tu correo.';
const FILA_CERRAR = 'Cerrar sesión, Sal de tu cuenta en este teléfono.';
const ERROR_CARGA = 'No pudimos cargar tu perfil';

/**
 * Servidor de Perfil que solo acepta el acceso vigente: con otro Bearer responde 401. Al principio
 * ningún acceso es vigente; POST /api/auth/movil/renovar entrega los tokens nuevos y desde ahí solo
 * vale el nuevo. Las peticiones públicas (sin Bearer) pasan directo al servidor de Perfil.
 */
function simularServidorConRenovacion(nuevos: SesionSembrada): Llamada[] {
  let vigente: string | null = null;
  const llamadas = simularServidorPerfil({
    [`POST ${RUTA_RENOVAR}`]: () => {
      vigente = nuevos.token;
      return respuesta(nuevos);
    },
  });
  const servidorPerfil = globalThis.fetch;
  globalThis.fetch = jest.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
    const llamada = leerLlamada(entrada, init);
    const acceso = llamada.cabeceras.Authorization;
    if (acceso === undefined || acceso === `Bearer ${vigente}`) {
      return servidorPerfil(entrada, init);
    }
    llamadas.push(llamada);
    return Promise.resolve(respuesta({ message: 'Token vencido' }, 401));
  }) as unknown as typeof fetch;
  return llamadas;
}

describe('Perfil con las pantallas reales (GP-05.2)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'sin sesión, la pestaña Perfil muestra la invitación y no pide datos de la cuenta',
    async () => {
      // La clienta ya vio la bienvenida antes: no sale la hoja encima de Perfil.
      await SecureStore.setItemAsync('bienvenida_vista', '1');
      const llamadas = simularServidorPerfil({});

      const app = await abrirApp('/perfil');
      await cerrarIntroSiAparece();

      // InvitacionSesion con el texto de Perfil y sus dos caminos.
      expect(await screen.findByRole('header', { name: 'Tu perfil en Mirú Franco' })).toBeOnTheScreen();
      expect(screen.getByText('Inicia sesión para ver tus datos, tu foto y tus citas.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeOnTheScreen();
      // "Iniciar sesión" de la cabecera y el de la invitación.
      expect(screen.getAllByRole('button', { name: 'Iniciar sesión' })).toHaveLength(2);

      // Nada de la cuenta: ni datos, ni accesos, ni cierre de sesión; Configuración sí se ofrece.
      expect(screen.queryByRole('button', { name: FILA_EDITAR })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: FILA_CERRAR })).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Apariencia, Claro, oscuro o igual que tu teléfono.' })).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'GET', '/api/auth/me')).toHaveLength(0);
      expect(sesionGuardada()).toBeNull();

      // "Crear cuenta" lleva al registro.
      await fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));
      await waitFor(() => expect(app.getPathname()).toBe('/registro'));

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con sesión, Perfil muestra el nombre, el correo y los accesos de la cuenta, sin datos de salud',
    async () => {
      const { llamadas } = await abrirPerfilConSesion();

      // Nombre y correo de /me; sin foto, el avatar ofrece elegir una.
      expect(screen.getByText(CLIENTA.email)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Elegir foto de perfil' })).toBeOnTheScreen();
      expect(screen.queryByLabelText('Cargando tus datos')).not.toBeOnTheScreen();
      expect(screen.queryByText(ERROR_CARGA)).not.toBeOnTheScreen();

      // Accesos de la cuenta: la clienta tiene contraseña, así que puede cambiarla.
      expect(screen.getByRole('button', { name: FILA_EDITAR })).toBeEnabled();
      expect(screen.getByRole('button', { name: FILA_CONTRASENA })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Mis citas, Tus próximas citas y tu historial.' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Mis pedidos, Tus compras y cuándo puedes recogerlas.' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: FILA_CERRAR })).toBeEnabled();
      expect(screen.queryByText('Tu perfil en Mirú Franco')).not.toBeOnTheScreen();

      // Perfil no pinta el perfil capilar ni el teléfono (eso vive en Editar perfil).
      expect(screen.queryByText('Castaño')).not.toBeOnTheScreen();
      expect(screen.queryByText('7710000000')).not.toBeOnTheScreen();

      // /me salió con el acceso guardado y sin renovar.
      const me = llamadasA(llamadas, 'GET', '/api/auth/me');
      expect(me.length).toBeGreaterThan(0);
      expect(me[0].cabeceras.Authorization).toBe(`Bearer ${sesionGuardada()?.token}`);
      expect(llamadasA(llamadas, 'POST', RUTA_RENOVAR)).toHaveLength(0);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'tras renovar la sesión móvil por un 401, Perfil carga los datos con el acceso nuevo',
    async () => {
      const guardada = await sembrarSesion(CLIENTA);
      const nuevos = {
        token: jwtFicticio('clienta-perfil-renovada'),
        refreshToken: 'refresh-ficticio-perfil-rotado',
      };
      const llamadas = simularServidorConRenovacion(nuevos);

      const app = await abrirApp('/perfil');
      await cerrarIntroSiAparece();

      // Los datos llegan aunque el acceso guardado ya no servía.
      expect(await screen.findByText(CLIENTA.nombre)).toBeOnTheScreen();
      expect(screen.getByText(CLIENTA.email)).toBeOnTheScreen();
      expect(screen.queryByText(ERROR_CARGA)).not.toBeOnTheScreen();
      expect(screen.queryByText('Tu sesión terminó. Inicia sesión de nuevo.')).not.toBeOnTheScreen();
      expect(app.getPathname()).toBe('/perfil');

      // Una sola renovación, con el refreshToken guardado.
      const renovaciones = llamadasA(llamadas, 'POST', RUTA_RENOVAR);
      expect(renovaciones).toHaveLength(1);
      expect(renovaciones[0].cuerpo).toMatchObject({ refreshToken: guardada.refreshToken });

      // /me se rechazó con el acceso viejo y se respondió con el nuevo.
      const accesosMe = llamadasA(llamadas, 'GET', '/api/auth/me').map((l) => l.cabeceras.Authorization);
      expect(accesosMe).toContain(`Bearer ${guardada.token}`);
      expect(accesosMe.at(-1)).toBe(`Bearer ${nuevos.token}`);

      // La sesión rotada quedó guardada y sigue abierta en Perfil.
      expect(sesionGuardada()).toMatchObject(nuevos);
      expect(screen.getByRole('button', { name: FILA_CERRAR })).toBeEnabled();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
