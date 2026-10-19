/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import {
  abrirApp,
  cerrarIntroSiAparece,
  LIMITE_MS,
  prepararPruebasDePantalla,
  ultimoBoton,
} from '../../helpers/pantallas';
import { abrirPerfilConSesion } from '../../helpers/pantallasPerfil';
import { CLIENTA, simularServidorPerfil } from '../../helpers/perfilClienta';
import { leerSecureStore } from '../../helpers/secureStore';
import { sembrarSesion, sesionGuardada } from '../../helpers/sesionGuardada';
import { llamadasA, respuesta, type Manejador } from '../../helpers/servidorSimulado';

/**
 * GP-05.2 (#18): cambiar la contraseña con el código del correo, con las pantallas reales
 * (renderRouter sobre src/app) y solo el servidor simulado. Paso 1: contraseña actual, nueva y
 * confirmación (POST /api/auth/me/password/codigo); paso 2: el código (POST /api/auth/me/password).
 * Al cambiarla, la sesión se cierra y se abre Acceso con su aviso y el correo escrito.
 */

const ACTUAL = 'ClaveFicticia1!';
const NUEVA = 'NuevaFicticia2!';
const CODIGO = '123456';

const RUTA_CODIGO = '/api/auth/me/password/codigo';
const RUTA_CAMBIO = '/api/auth/me/password';
const FILA_CAMBIAR = 'Cambiar contraseña, Confirma el cambio con un código que llega a tu correo.';
const INSTRUCCIONES = 'Te enviamos un código a tu correo. Vence en 10 minutos.';
const ETIQUETA_CODIGO = 'Código de verificación';

/** Respuestas del servidor para pedir el código y cambiar la contraseña. */
function rutasContrasena(cambio: Manejador): Record<string, Manejador> {
  return {
    [`POST ${RUTA_CODIGO}`]: () =>
      respuesta({ success: true, message: 'Código enviado', vigenciaMinutos: 10 }),
    [`POST ${RUTA_CAMBIO}`]: cambio,
  };
}

/** Paso 1 completo: escribe la contraseña actual, la nueva y su confirmación, y pide el código. */
async function pedirCodigo(): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText('Contraseña actual'), ACTUAL);
  await fireEvent.changeText(screen.getByLabelText('Contraseña nueva'), NUEVA);
  await fireEvent.changeText(screen.getByLabelText('Confirmar contraseña nueva'), NUEVA);
  await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
  expect(await screen.findByText(INSTRUCCIONES)).toBeOnTheScreen();
}

/** Paso 2: escribe el código y toca "Cambiar contraseña" (el botón, no la fila de Perfil). */
async function confirmarCon(codigo: string): Promise<void> {
  // Con dígitos escritos, la etiqueta los deletrea ("Código de verificación: 1, 2, 3").
  await fireEvent.changeText(screen.getByLabelText(new RegExp(`^${ETIQUETA_CODIGO}`)), codigo);
  await fireEvent.press(ultimoBoton('Cambiar contraseña'));
}

describe('Cambiar contraseña con código (GP-05.2)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'desde Perfil: pide el código, cambia la contraseña, cierra la sesión y abre Acceso con el correo',
    async () => {
      const { app, llamadas } = await abrirPerfilConSesion(
        rutasContrasena(() => respuesta({ success: true, message: 'Contraseña actualizada' })),
      );
      const { token } = sesionGuardada() ?? { token: '' };

      await fireEvent.press(screen.getByRole('button', { name: FILA_CAMBIAR }));
      await waitFor(() => expect(app.getPathname()).toBe('/cambiar-contrasena'));
      expect(await screen.findByLabelText('Contraseña actual')).toBeOnTheScreen();

      // Sin datos no se pide el código.
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
      expect(await screen.findByText('Ingresa tu contraseña actual')).toBeOnTheScreen();
      expect(screen.getByText('Confirma tu contraseña')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', RUTA_CODIGO)).toHaveLength(0);

      // Paso 1: el código se pide con la contraseña actual y la sesión de la clienta.
      await pedirCodigo();
      const pedidos = llamadasA(llamadas, 'POST', RUTA_CODIGO);
      expect(pedidos).toHaveLength(1);
      expect(pedidos[0].cuerpo).toEqual({ actualPassword: ACTUAL });
      expect(pedidos[0].cabeceras.Authorization).toBe(`Bearer ${token}`);
      expect(screen.getByLabelText(ETIQUETA_CODIGO)).toHaveProp('value', '');
      expect(screen.getByText(/^Podrás pedir otro código en \d+ s$/)).toBeOnTheScreen();

      // Paso 2: sin los 6 dígitos no se llama al servidor.
      await confirmarCon('123');
      expect(await screen.findByText('El código debe tener 6 dígitos')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', RUTA_CAMBIO)).toHaveLength(0);

      // Con el código completo se cambia la contraseña.
      await confirmarCon(CODIGO);
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      const cambios = llamadasA(llamadas, 'POST', RUTA_CAMBIO);
      expect(cambios).toHaveLength(1);
      expect(cambios[0].cuerpo).toEqual({ actualPassword: ACTUAL, nuevaPassword: NUEVA, codigo: CODIGO });
      expect(cambios[0].cabeceras.Authorization).toBe(`Bearer ${token}`);

      // Acceso se abre con su aviso y el correo escrito; la contraseña queda vacía.
      expect(await screen.findByText('Tu contraseña cambió. Inicia sesión de nuevo.')).toBeOnTheScreen();
      expect(screen.getByLabelText('Correo electrónico')).toHaveProp('value', CLIENTA.email);
      expect(screen.getByLabelText('Contraseña')).toHaveProp('value', '');
      // No es una sesión vencida: no sale el aviso de sesión terminada.
      expect(screen.queryByText('Tu sesión terminó. Inicia sesión de nuevo.')).not.toBeOnTheScreen();

      // La sesión se borró del teléfono; las preferencias se conservan.
      expect(sesionGuardada()).toBeNull();
      expect(leerSecureStore().bienvenida_vista).toBe('1');

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con un código incorrecto avisa en español, limpia el código y la sesión sigue abierta',
    async () => {
      await sembrarSesion(CLIENTA);
      const llamadas = simularServidorPerfil(
        rutasContrasena(() =>
          respuesta({ statusCode: 400, message: 'OTP mismatch for user', code: 'CODIGO_INVALIDO' }, 400),
        ),
      );
      const app = await abrirApp('/cambiar-contrasena');
      await cerrarIntroSiAparece();
      expect(await screen.findByLabelText('Contraseña actual')).toBeOnTheScreen();

      await pedirCodigo();
      await confirmarCon('654321');

      expect(await screen.findByText('El código no es válido o ya venció.')).toBeOnTheScreen();
      expect(screen.queryByText('OTP mismatch for user')).not.toBeOnTheScreen();
      expect(screen.getByLabelText(ETIQUETA_CODIGO)).toHaveProp('value', '');
      const cambios = llamadasA(llamadas, 'POST', RUTA_CAMBIO);
      expect(cambios).toHaveLength(1);
      expect(cambios[0].cuerpo).toEqual({ actualPassword: ACTUAL, nuevaPassword: NUEVA, codigo: '654321' });

      // Sigue en el paso 2 con la sesión guardada: puede escribir otro código.
      expect(app.getPathname()).toBe('/cambiar-contrasena');
      expect(screen.getByText(INSTRUCCIONES)).toBeOnTheScreen();
      expect(sesionGuardada()).not.toBeNull();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
