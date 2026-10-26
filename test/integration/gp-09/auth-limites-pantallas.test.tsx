/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { MENSAJE_SESION_TERMINADA } from '@/shared/api/mensajesError';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { CLAVE, CORREO, cuentaSinActivar, RUTAS_DE_FONDO } from '../../helpers/datosClienta';
import { limite429, MENSAJE_BLOQUEO, MENSAJE_LIMITE } from '../../helpers/limitesRed';
import { abrirAcceso, entrarCon, LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import { abrirPerfilConSesion } from '../../helpers/pantallasPerfil';
import {
  abrirRegistro,
  llenarPaso1,
  llenarPaso2,
  RESPUESTA_CORREO_NEUTRAL,
  simularServidor as simularServidorRegistro,
} from '../../helpers/registroPantalla';
import { leerSecureStore } from '../../helpers/secureStore';
import { llamadasA, respuesta, servidorConRutas, type Manejador } from '../../helpers/servidorSimulado';

/**
 * GP-09, bloque D, con las pantallas reales (renderRouter sobre src/app): tras un 429 el botón
 * principal de Acceso, Registro, Recuperar, Activar y Cambiar contraseña muestra el message del
 * backend, queda deshabilitado (y así lo anuncia TalkBack) con "Intenta de nuevo en N s", baja cada
 * segundo y regresa a su texto. El BLOQUEO_TEMPORAL no es sesión vencida ni cuenta sin activar.
 * Servidor simulado en http://api.test, datos ficticios y temporizadores falsos.
 */

const simularServidor = servidorConRutas(RUTAS_DE_FONDO);
const esperaDe = (segundos: number) => RESPALDO_TEXTOS['errores.esperaLimite'].replace('{segundos}', String(segundos));
const NEUTRO_REENVIO = 'Si la cuenta existe y falta activarla, te enviamos un código nuevo.';
const FILA_CAMBIAR = 'Cambiar contraseña, Confirma el cambio con un código que llega a tu correo.';
const RUTA_CODIGO = '/api/auth/me/password/codigo';
const RUTA_CAMBIO = '/api/auth/me/password';

/** Respuestas en orden: cada llamada toma la siguiente y la última se repite. */
function enOrden(...respuestas: (() => Response)[]): Manejador {
  let vez = 0;
  return () => {
    const actual = respuestas[Math.min(vez, respuestas.length - 1)];
    vez += 1;
    return actual();
  };
}

async function avanzarUnSegundo(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1000);
  });
}

/**
 * El botón (o enlace) está deshabilitado con "Intenta de nuevo en N s", tocarlo no hace nada, baja
 * cada segundo y al terminar regresa a su texto, habilitado.
 */
async function revisarEspera(rol: 'button' | 'link', normal: string, segundos: number, alTocar: () => void): Promise<void> {
  for (let quedan = segundos; quedan > 0; quedan -= 1) {
    const enEspera = screen.getByRole(rol, { name: esperaDe(quedan) });
    expect(enEspera).toBeDisabled();
    expect(screen.queryByRole(rol, { name: normal })).not.toBeOnTheScreen();
    await fireEvent.press(enEspera);
    alTocar();
    await avanzarUnSegundo();
  }
  expect(screen.getByRole(rol, { name: normal })).toBeEnabled();
  expect(screen.queryByText(/^Intenta de nuevo en \d+ s$/)).not.toBeOnTheScreen();
}

describe('Autenticación con límites en las pantallas (GP-09)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'Acceso: un 429 muestra el message y "Entrar" espera los segundos del servidor',
    async () => {
      const llamadas = simularServidor({ 'POST /api/auth/login': () => limite429(3) });
      const app = await abrirAcceso();
      // La tecla "siguiente" del correo solo pasa a la contraseña: no entra.
      await fireEvent(screen.getByLabelText('Correo electrónico'), 'submitEditing');
      expect(llamadasA(llamadas, 'POST', '/api/auth/login')).toHaveLength(0);

      await entrarCon(CORREO, CLAVE);
      expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
      await revisarEspera('button', 'Entrar', 3, () =>
        expect(llamadasA(llamadas, 'POST', '/api/auth/login')).toHaveLength(1),
      );
      expect(app.getPathname()).toBe('/login');

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Acceso: el 429 BLOQUEO_TEMPORAL no abre Activar ni dice "sesión terminada"',
    async () => {
      simularServidor({ 'POST /api/auth/login': () => limite429(2, 'BLOQUEO_TEMPORAL', MENSAJE_BLOQUEO) });
      const app = await abrirAcceso();

      await entrarCon(CORREO, CLAVE);
      expect(await screen.findByText(MENSAJE_BLOQUEO)).toBeOnTheScreen();
      expect(screen.queryByText(MENSAJE_SESION_TERMINADA)).not.toBeOnTheScreen();
      expect(screen.queryByText('Activa tu cuenta')).not.toBeOnTheScreen();
      expect(app.getPathname()).toBe('/login');
      expect(leerSecureStore().auth_sesion).toBeUndefined();
      await revisarEspera('button', 'Entrar', 2, () => undefined);
      expect(app.getPathname()).toBe('/login');

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Recuperar: un 429 muestra el message y "Enviar enlace" espera los segundos del servidor',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/solicitar-enlace-recuperacion': () => limite429(2),
      });
      const app = await abrirAcceso();
      await fireEvent.press(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }));
      await waitFor(() => expect(app.getPathname()).toBe('/recuperar'));
      await fireEvent.changeText(await screen.findByLabelText('Correo electrónico'), CORREO);

      await fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
      await revisarEspera('button', 'Enviar enlace', 2, () =>
        expect(llamadasA(llamadas, 'POST', '/api/auth/solicitar-enlace-recuperacion')).toHaveLength(1),
      );

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Activar: el 429 deja "Reenviar código" en espera, un 404 no dice nada de la cuenta y el 200 muestra el mensaje neutro',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/login': cuentaSinActivar,
        'POST /api/auth/reenviar-codigo': enOrden(
          () => limite429(2),
          () => respuesta({ statusCode: 404, message: 'Usuario no encontrado' }, 404),
          () => respuesta({ success: true, message: NEUTRO_REENVIO }),
        ),
      });
      const app = await abrirAcceso();
      await entrarCon(CORREO, CLAVE);
      await waitFor(() => expect(app.getPathname()).toBe('/activar'));
      expect(await screen.findByText('Activa tu cuenta')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('link', { name: 'Reenviar código' }));
      expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
      await revisarEspera('link', 'Reenviar código', 2, () =>
        expect(llamadasA(llamadas, 'POST', '/api/auth/reenviar-codigo')).toHaveLength(1),
      );

      // Un 404 ya no se espera: cae al texto general y no dice si la cuenta existe.
      await fireEvent.press(screen.getByRole('link', { name: 'Reenviar código' }));
      expect(await screen.findByText(RESPALDO_TEXTOS['auth.activar.noSeReenvio'])).toBeOnTheScreen();
      expect(screen.queryByText('Usuario no encontrado')).not.toBeOnTheScreen();
      expect(screen.queryByText(/ya está activad/i)).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('link', { name: 'Reenviar código' }));
      expect(await screen.findByText(NEUTRO_REENVIO)).toBeOnTheScreen();
      expect(screen.getByText(/^Podrás pedir otro código en \d+ s$/)).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/reenviar-codigo')).toHaveLength(3);
      expect(app.getPathname()).toBe('/activar');

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Activar: un 429 al verificar deja "Verificar código" en espera y "Reenviar código" sigue disponible',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/login': cuentaSinActivar,
        'POST /api/auth/verificar-otp': () => limite429(2),
      });
      const app = await abrirAcceso();
      await entrarCon(CORREO, CLAVE);
      await waitFor(() => expect(app.getPathname()).toBe('/activar'));
      await fireEvent.changeText(await screen.findByLabelText('Código de verificación'), '123456');

      await fireEvent.press(screen.getByRole('button', { name: 'Verificar código' }));
      expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
      expect(screen.getByRole('link', { name: 'Reenviar código' })).toBeEnabled();
      await revisarEspera('button', 'Verificar código', 2, () =>
        expect(llamadasA(llamadas, 'POST', '/api/auth/verificar-otp')).toHaveLength(1),
      );
      expect(app.getPathname()).toBe('/activar');

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Registro: un 429 muestra el message y "Finalizar registro" espera los segundos del servidor',
    async () => {
      const llamadas = simularServidorRegistro({
        'POST /api/auth/verificar-correo': () => respuesta(RESPUESTA_CORREO_NEUTRAL),
        'POST /api/usuarios/registro': () => limite429(2),
      });
      const app = await abrirRegistro();
      await llenarPaso1();
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText('Cuéntanos sobre tu cabello')).toBeOnTheScreen();
      await llenarPaso2();

      await fireEvent.press(screen.getByRole('button', { name: 'Finalizar registro' }));
      expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
      await revisarEspera('button', 'Finalizar registro', 2, () =>
        expect(llamadasA(llamadas, 'POST', '/api/usuarios/registro')).toHaveLength(1),
      );
      expect(app.getPathname()).toBe('/registro');

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'Cambiar contraseña: un 429 al pedir y al reenviar el código deja el botón en espera',
    async () => {
      const { app, llamadas } = await abrirPerfilConSesion({
        [`POST ${RUTA_CODIGO}`]: enOrden(
          () => limite429(2),
          () => respuesta({ success: true, vigenciaMinutos: 10 }),
          () => limite429(2, 'DEMASIADOS_CODIGOS'),
        ),
        [`POST ${RUTA_CAMBIO}`]: () => limite429(2),
      });
      await fireEvent.press(screen.getByRole('button', { name: FILA_CAMBIAR }));
      await waitFor(() => expect(app.getPathname()).toBe('/cambiar-contrasena'));
      // Salir de cada campo vacío (o la tecla del teclado) marca lo que falta sin pedir el código.
      const vacios: [etiqueta: string, error: string][] = [
        ['Contraseña actual', 'Ingresa tu contraseña actual'],
        ['Contraseña nueva', 'Te faltan requisitos de la contraseña.'],
        ['Confirmar contraseña nueva', 'Confirma tu contraseña'],
      ];
      for (const [etiqueta, error] of vacios) {
        const campo = await screen.findByLabelText(etiqueta);
        await fireEvent(campo, 'submitEditing');
        await fireEvent(campo, 'blur');
        expect(await screen.findByText(error)).toBeOnTheScreen();
      }
      expect(llamadasA(llamadas, 'POST', RUTA_CODIGO)).toHaveLength(0);
      await fireEvent.changeText(screen.getByLabelText('Contraseña actual'), CLAVE);
      await fireEvent.changeText(screen.getByLabelText('Contraseña nueva'), 'NuevaFicticia2!');
      await fireEvent.changeText(screen.getByLabelText('Confirmar contraseña nueva'), 'NuevaFicticia2!');

      await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
      expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
      await revisarEspera('button', 'Enviar código', 2, () =>
        expect(llamadasA(llamadas, 'POST', RUTA_CODIGO)).toHaveLength(1),
      );

      // Con el código enviado, la espera propia de 60 s y luego el 429 del reenvío.
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
      expect(await screen.findByText('Te enviamos un código a tu correo. Vence en 10 minutos.')).toBeOnTheScreen();
      for (let vuelta = 0; vuelta < 60 && screen.queryByText(/^Podrás pedir otro código/); vuelta += 1) {
        await avanzarUnSegundo();
      }
      await fireEvent.press(screen.getByRole('button', { name: 'Reenviar código' }));
      expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
      await revisarEspera('button', 'Reenviar código', 2, () =>
        expect(llamadasA(llamadas, 'POST', RUTA_CODIGO)).toHaveLength(3),
      );

      // El cambio con el código tiene su propio límite: "Cambiar contraseña" espera y la sesión sigue.
      await fireEvent.changeText(screen.getByLabelText(/^Código de verificación/), '123456');
      await fireEvent.press(screen.getByRole('button', { name: 'Cambiar contraseña' }));
      expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
      await revisarEspera('button', 'Cambiar contraseña', 2, () =>
        expect(llamadasA(llamadas, 'POST', RUTA_CAMBIO)).toHaveLength(1),
      );
      expect(app.getPathname()).toBe('/cambiar-contrasena');
      expect(leerSecureStore().auth_sesion).toBeDefined();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
