/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { CLAVE, CORREO, cuentaSinActivar, RUTAS_DE_FONDO, USUARIO } from '../../helpers/datosClienta';
import {
  abrirAcceso,
  entrarCon,
  LIMITE_MS,
  prepararPruebasDePantalla,
  type App,
} from '../../helpers/pantallas';
import { leerSecureStore } from '../../helpers/secureStore';
import { llamadasA, respuesta, servidorConRutas, type Manejador } from '../../helpers/servidorSimulado';
import { TEXTO_DEMASIADAS_SOLICITUDES } from '../../helpers/textosError';

const CODIGO = '123456';

const MENSAJE_CODIGO_INCORRECTO =
  'El código es incorrecto o ha expirado. Solicita uno nuevo con «Reenviar código».';
const MENSAJE_NEUTRO =
  'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña';

const simularServidor = servidorConRutas(RUTAS_DE_FONDO);

/** Respuestas en orden: cada llamada toma la siguiente y la última se repite. */
function enOrden(...respuestas: (() => Response)[]): Manejador {
  let vez = 0;
  return () => {
    const actual = respuestas[Math.min(vez, respuestas.length - 1)];
    vez += 1;
    return actual();
  };
}

/** Desde Acceso, una cuenta sin activar abre Activar con su correo. */
async function llegarAActivar(app: App): Promise<void> {
  await entrarCon(CORREO, CLAVE);
  await waitFor(() => expect(app.getPathname()).toBe('/activar'));
  expect(await screen.findByText('Activa tu cuenta')).toBeOnTheScreen();
  expect(
    screen.getByText(`Escribe el código de 6 dígitos que enviamos a ${CORREO}.`),
  ).toBeOnTheScreen();
}

describe('Activar la cuenta y recuperar la contraseña (GP-05)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'con el código correcto activa la cuenta, vuelve a Acceso con el aviso y la clienta ya puede entrar',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/login': enOrden(cuentaSinActivar, () =>
          respuesta({
            success: true,
            token: 'token-ficticio',
            refreshToken: 'refresh-ficticio',
            usuario: USUARIO,
          }),
        ),
        'POST /api/auth/verificar-otp': () =>
          respuesta({ success: true, message: 'Cuenta activada' }),
      });
      const app = await abrirAcceso();
      await llegarAActivar(app);

      // Sin los 6 dígitos no se llama al servidor.
      await fireEvent.press(screen.getByRole('button', { name: 'Verificar código' }));
      expect(await screen.findByText('El código debe tener 6 dígitos')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/verificar-otp')).toHaveLength(0);

      // Pegado con espacios: el campo deja solo los dígitos.
      await fireEvent.changeText(screen.getByLabelText('Código de verificación'), '123 456');
      expect(screen.getByLabelText('Código de verificación')).toHaveProp('value', CODIGO);
      expect(screen.queryByText('El código debe tener 6 dígitos')).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Verificar código' }));

      // Regresa a Acceso con el aviso de cuenta activada y el correo escrito.
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      const verificaciones = llamadasA(llamadas, 'POST', '/api/auth/verificar-otp');
      expect(verificaciones).toHaveLength(1);
      expect(verificaciones[0].cuerpo).toEqual({ email: CORREO, codigo: CODIGO });
      expect(verificaciones[0].cabeceras.Authorization).toBeUndefined();
      expect(await screen.findByText('Tu cuenta está activada. Inicia sesión.')).toBeOnTheScreen();
      expect(screen.getByLabelText('Correo electrónico')).toHaveProp('value', CORREO);
      expect(screen.getByLabelText('Contraseña')).toHaveProp('value', '');
      expect(leerSecureStore().auth_sesion).toBeUndefined();

      // Con la cuenta activa, la clienta entra y llega a Inicio con sesión.
      await fireEvent.changeText(screen.getByLabelText('Contraseña'), CLAVE);
      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
      await waitFor(() => expect(app.getPathname()).toBe('/inicio'));
      expect(llamadasA(llamadas, 'POST', '/api/auth/login')).toHaveLength(2);
      expect(await screen.findByRole('button', { name: 'Abrir perfil' })).toBeOnTheScreen();
      expect(leerSecureStore().auth_sesion).toBeDefined();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con un código incorrecto muestra un mensaje para la clienta, sigue en Activar y permite pedir otro código',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/login': cuentaSinActivar,
        'POST /api/auth/verificar-otp': () =>
          respuesta({ statusCode: 400, message: 'Invalid or expired OTP' }, 400),
        'POST /api/auth/reenviar-codigo': () =>
          respuesta({ success: true, message: 'Código reenviado' }),
      });
      const app = await abrirAcceso();
      await llegarAActivar(app);

      await fireEvent.changeText(screen.getByLabelText('Código de verificación'), '654321');
      await fireEvent.press(screen.getByRole('button', { name: 'Verificar código' }));

      expect(await screen.findByText(MENSAJE_CODIGO_INCORRECTO)).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/verificar-otp')).toHaveLength(1);
      expect(llamadasA(llamadas, 'POST', '/api/auth/verificar-otp')[0].cuerpo).toEqual({
        email: CORREO,
        codigo: '654321',
      });
      // El texto técnico del servidor nunca llega a la pantalla y la clienta sigue en Activar.
      expect(screen.queryByText('Invalid or expired OTP')).not.toBeOnTheScreen();
      expect(app.getPathname()).toBe('/activar');
      expect(screen.getByRole('button', { name: 'Verificar código' })).toBeOnTheScreen();
      expect(leerSecureStore().auth_sesion).toBeUndefined();

      // "Reenviar código" pide otro al servidor, limpia el campo y arranca la espera.
      await fireEvent.press(screen.getByRole('link', { name: 'Reenviar código' }));
      expect(
        await screen.findByText('Te enviamos un código nuevo. Revisa tu correo.'),
      ).toBeOnTheScreen();
      const reenvios = llamadasA(llamadas, 'POST', '/api/auth/reenviar-codigo');
      expect(reenvios).toHaveLength(1);
      expect(reenvios[0].cuerpo).toEqual({ email: CORREO });
      expect(screen.queryByText(MENSAJE_CODIGO_INCORRECTO)).not.toBeOnTheScreen();
      expect(screen.getByLabelText('Código de verificación')).toHaveProp('value', '');
      expect(screen.getByText(/^Podrás pedir otro código en \d+ s$/)).toBeOnTheScreen();
      expect(screen.queryByRole('link', { name: 'Reenviar código' })).not.toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'recuperar contraseña de inicio a fin: valida el correo, pide el enlace y vuelve a Acceso',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/solicitar-enlace-recuperacion': () =>
          respuesta({ success: true, message: 'Enlace enviado' }),
      });
      const app = await abrirAcceso();

      await fireEvent.press(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }));
      await waitFor(() => expect(app.getPathname()).toBe('/recuperar'));
      expect(await screen.findByText('Recupera tu contraseña')).toBeOnTheScreen();

      // Vacío y mal escrito: lo dice el campo y no se llama al servidor.
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByText('El correo electrónico es requerido')).toBeOnTheScreen();
      await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'clienta@ejemplo');
      expect(screen.queryByText('El correo electrónico es requerido')).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByText('El correo electrónico no es válido')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/solicitar-enlace-recuperacion')).toHaveLength(0);

      // Correo válido: se envía normalizado y se muestra el mensaje neutro.
      await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), ' Clienta@Ejemplo.test ');
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByText(MENSAJE_NEUTRO)).toBeOnTheScreen();
      const solicitudes = llamadasA(llamadas, 'POST', '/api/auth/solicitar-enlace-recuperacion');
      expect(solicitudes).toHaveLength(1);
      expect(solicitudes[0].cuerpo).toEqual({ email: CORREO });
      expect(solicitudes[0].cabeceras.Authorization).toBeUndefined();
      expect(screen.queryByText('Enlace enviado')).not.toBeOnTheScreen();
      expect(app.getPathname()).toBe('/recuperar');

      // "Volver a iniciar sesión" regresa a Acceso.
      await fireEvent.press(screen.getByRole('link', { name: 'Volver a iniciar sesión' }));
      await waitFor(() => expect(app.getPathname()).toBe('/login'));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      expect(leerSecureStore().auth_sesion).toBeUndefined();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'recuperar no revela si el correo tiene cuenta y avisa cuando hay demasiados intentos',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/solicitar-enlace-recuperacion': enOrden(
          () => respuesta({ statusCode: 404, message: 'User not found' }, 404),
          () => respuesta({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }, 429),
        ),
      });
      const app = await abrirAcceso();
      await fireEvent.press(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }));
      await waitFor(() => expect(app.getPathname()).toBe('/recuperar'));
      expect(await screen.findByText('Recupera tu contraseña')).toBeOnTheScreen();

      // Un correo sin cuenta (404) recibe el mismo mensaje neutro.
      await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'nadie@ejemplo.test');
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByText(MENSAJE_NEUTRO)).toBeOnTheScreen();
      expect(screen.queryByText('User not found')).not.toBeOnTheScreen();

      // Con el límite del servidor (429) se pide esperar, sin el texto técnico.
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByText(TEXTO_DEMASIADAS_SOLICITUDES)).toBeOnTheScreen();
      expect(screen.queryByText(MENSAJE_NEUTRO)).not.toBeOnTheScreen();
      expect(
        screen.queryByText('ThrottlerException: Too Many Requests'),
      ).not.toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/solicitar-enlace-recuperacion')).toHaveLength(2);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
