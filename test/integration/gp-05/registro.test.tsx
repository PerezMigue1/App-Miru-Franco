/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { CLAVE, CORREO } from '../../helpers/datosClienta';
import { abrirDesdeBienvenida, LIMITE_MS, prepararPruebasDePantalla, type App } from '../../helpers/pantallas';
import { leerSecureStore } from '../../helpers/secureStore';
import {
  CATALOGOS_VACIOS,
  llamadasA,
  respuesta,
  servidorConRutas,
  type Llamada,
} from '../../helpers/servidorSimulado';

const PREGUNTA = '¿Cuál es el nombre de tu primera mascota?';

/** GET /api/pregunta-seguridad: { success, data[] }. */
const PREGUNTAS = {
  success: true,
  data: [
    { id: '1', pregunta: PREGUNTA },
    { id: '2', pregunta: '¿En qué ciudad naciste?' },
  ],
};

/** Lo que piden las pantallas de fondo y el selector de preguntas. */
const simularServidor = servidorConRutas({
  ...CATALOGOS_VACIOS,
  'GET /api/pregunta-seguridad': () => respuesta(PREGUNTAS),
});

/** Lo que responde hoy POST /api/auth/verificar-correo sin sesión de admin, exista o no la cuenta. */
const RESPUESTA_CORREO_NEUTRAL = { existe: false, message: 'Comprobaremos el correo al crear la cuenta' };

/**
 * Espera a que llegue la respuesta neutral de la verificación del correo y revisa que el campo no
 * afirme nada: ni "Correo disponible" ni el texto del servidor.
 */
async function esperarRespuestaNeutral(llamadas: Llamada[]): Promise<void> {
  await waitFor(() =>
    expect(llamadasA(llamadas, 'POST', '/api/auth/verificar-correo').length).toBeGreaterThan(0),
  );
  await waitFor(() => expect(screen.queryByText('Verificando correo…')).not.toBeOnTheScreen());
  expect(screen.queryByText('Correo disponible')).not.toBeOnTheScreen();
  expect(screen.queryByText(RESPUESTA_CORREO_NEUTRAL.message)).not.toBeOnTheScreen();
  expect(screen.queryByText('Este correo ya está registrado')).not.toBeOnTheScreen();
}

/**
 * Abre la app sin sesión en '/', cierra la intro de la grieta si aparece y, desde la hoja de
 * bienvenida, toca "Crear cuenta": queda en Registro, encima de la pestaña Inicio.
 */
async function abrirRegistro(): Promise<App> {
  const app = await abrirDesdeBienvenida('Crear cuenta', '/registro');
  expect(await screen.findByText('Crea tu cuenta')).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: 'Registro' })).toBeSelected();
  expect(screen.getByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
  return app;
}

/** Paso 1, "Tu cuenta": todos los campos con datos ficticios válidos. */
async function llenarPaso1(): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText('Nombre completo'), '  Clienta Ficticia ');
  await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'Clienta@Ejemplo.test');
  // Pegado con espacios: el campo lo deja en 10 dígitos.
  await fireEvent.changeText(screen.getByLabelText('Teléfono'), '771 123 4567');
  // El campo de fecha agrega las diagonales: queda 15/03/1990.
  await fireEvent.changeText(screen.getByLabelText('Fecha de nacimiento'), '15031990');
  expect(screen.getByLabelText('Fecha de nacimiento')).toHaveProp('value', '15/03/1990');

  // La pregunta se elige en una hoja que carga la lista del servidor al abrirse.
  await fireEvent.press(screen.getByText('Elige una pregunta'));
  await fireEvent.press(await screen.findByRole('radio', { name: PREGUNTA }));
  await waitFor(() => expect(screen.queryByText('¿En qué ciudad naciste?')).not.toBeOnTheScreen());
  expect(screen.getByText(PREGUNTA)).toBeOnTheScreen();

  await fireEvent.changeText(screen.getByLabelText('Respuesta de seguridad'), ' Firulais ');
  await fireEvent.changeText(screen.getByLabelText('Contraseña'), CLAVE);
  await fireEvent.changeText(screen.getByLabelText('Confirmar contraseña'), CLAVE);
}

/** Paso 2, "Tu cabello": tipo, un color opcional, sin alergias, con tratamientos y el aviso. */
async function llenarPaso2(): Promise<void> {
  await fireEvent.press(screen.getByRole('radio', { name: 'Tipo de cabello: Lacio' }));
  await fireEvent.changeText(screen.getByLabelText('Color natural (opcional)'), '  Castaño oscuro ');
  await fireEvent.press(screen.getByRole('radio', { name: '¿Tienes alergias a productos?: No' }));
  await fireEvent.press(screen.getByRole('radio', { name: '¿Tratamientos químicos previos?: Sí' }));
  await fireEvent.changeText(
    await screen.findByLabelText('Especifica los tratamientos'),
    'Tinte hace seis meses',
  );
  await fireEvent.press(screen.getByRole('checkbox', { name: /^Acepto el/ }));
  expect(screen.getByRole('checkbox', { name: /^Acepto el/ })).toBeChecked();
}

/** Cuerpo que la app arma hoy para POST /api/usuarios/registro con los datos de arriba. */
const CUERPO_ESPERADO = {
  nombre: 'Clienta Ficticia',
  email: CORREO,
  telefono: '7711234567',
  password: CLAVE,
  fechaNacimiento: '1990-03-15',
  preguntaSeguridad: { pregunta: PREGUNTA, respuesta: 'Firulais' },
  perfilCapilar: {
    tipoCabello: 'liso',
    colorNatural: 'Castaño oscuro',
    tieneAlergias: false,
    tratamientosQuimicos: true,
    tratamientos: 'Tinte hace seis meses',
  },
  aceptaAvisoPrivacidad: true,
  recibePromociones: false,
};

describe('Registro de una clienta en dos pasos (GP-05)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'completa los dos pasos, envía el cuerpo esperado al backend y pasa a Activar',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/verificar-correo': () => respuesta(RESPUESTA_CORREO_NEUTRAL),
        'POST /api/usuarios/registro': () =>
          respuesta({ success: true, message: 'Usuario registrado. Revisa tu correo.' }, 201),
      });
      const app = await abrirRegistro();

      await llenarPaso1();
      // El correo se verifica solo, ya normalizado; la respuesta neutral no se da por disponible.
      await esperarRespuestaNeutral(llamadas);
      const verificaciones = llamadasA(llamadas, 'POST', '/api/auth/verificar-correo');
      expect(verificaciones.length).toBeGreaterThan(0);
      for (const verificacion of verificaciones) {
        expect(verificacion.cuerpo).toEqual({ correo: CORREO });
      }

      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText('Cuéntanos sobre tu cabello')).toBeOnTheScreen();
      expect(screen.getByLabelText('Paso 2 de 2: Tu cabello')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/usuarios/registro')).toHaveLength(0);

      // "Atrás" regresa al paso 1 sin perder lo escrito; "Continuar" vuelve al paso 2.
      await fireEvent.press(screen.getByRole('button', { name: 'Atrás' }));
      expect(await screen.findByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
      expect(screen.getByLabelText('Nombre completo')).toHaveProp('value', '  Clienta Ficticia ');
      expect(screen.getByLabelText('Teléfono')).toHaveProp('value', '7711234567');
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText('Cuéntanos sobre tu cabello')).toBeOnTheScreen();

      await llenarPaso2();
      await fireEvent.press(screen.getByRole('button', { name: 'Finalizar registro' }));

      await waitFor(() => expect(app.getPathname()).toBe('/activar'));
      const registros = llamadasA(llamadas, 'POST', '/api/usuarios/registro');
      expect(registros).toHaveLength(1);
      expect(registros[0].cuerpo).toEqual(CUERPO_ESPERADO);
      expect(registros[0].cabeceras.Authorization).toBeUndefined();

      // Activar con el correo del registro y la espera de reenvío ya corriendo.
      expect(await screen.findByText('Activa tu cuenta')).toBeOnTheScreen();
      expect(
        screen.getByText(`Escribe el código de 6 dígitos que enviamos a ${CORREO}.`),
      ).toBeOnTheScreen();
      expect(screen.getByText(/^Podrás pedir otro código en \d+ s$/)).toBeOnTheScreen();
      expect(screen.queryByRole('link', { name: 'Reenviar código' })).not.toBeOnTheScreen();
      // Registrarse no inicia sesión.
      expect(leerSecureStore().auth_sesion).toBeUndefined();

      // "Volver a iniciar sesión" regresa a la misma pantalla en Acceso, con el correo escrito y el
      // registro vacío.
      await fireEvent.press(screen.getByRole('link', { name: 'Volver a iniciar sesión' }));
      await waitFor(() => expect(app.getPathname()).toBe('/registro'));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Acceso' })).toBeSelected();
      expect(screen.getByLabelText('Correo electrónico')).toHaveProp('value', CORREO);
      await fireEvent.press(screen.getByRole('tab', { name: 'Registro' }));
      expect(await screen.findByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
      expect(screen.getByLabelText('Nombre completo')).toHaveProp('value', '');

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'el paso 1 no avanza con campos vacíos ni con un correo que ya tiene cuenta',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/verificar-correo': () => respuesta({ existe: true }),
      });
      await abrirRegistro();

      // Vacío: cada campo dice qué falta y no se llama al servidor.
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText('Revisa los campos marcados.')).toBeOnTheScreen();
      expect(screen.getByText('El nombre completo es requerido')).toBeOnTheScreen();
      expect(screen.getByText('El correo electrónico es requerido')).toBeOnTheScreen();
      expect(screen.getByText('El teléfono es requerido')).toBeOnTheScreen();
      expect(screen.getByText('La fecha de nacimiento es requerida')).toBeOnTheScreen();
      expect(screen.getByText('Debes seleccionar una pregunta de seguridad')).toBeOnTheScreen();
      expect(
        screen.getByText('La respuesta a la pregunta de seguridad es requerida'),
      ).toBeOnTheScreen();
      expect(screen.getByText('Confirma tu contraseña')).toBeOnTheScreen();
      expect(screen.getByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/auth/verificar-correo')).toHaveLength(0);

      // Con todo lleno pero un correo registrado, "Continuar" no pasa al paso 2.
      await llenarPaso1();
      expect(await screen.findByText('Este correo ya está registrado')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled(),
      );
      expect(screen.queryByText('Cuéntanos sobre tu cabello')).not.toBeOnTheScreen();
      expect(screen.getByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/usuarios/registro')).toHaveLength(0);

      // "Iniciar sesión" del aviso lleva a Acceso con ese correo escrito.
      await fireEvent.press(screen.getByRole('link', { name: 'Iniciar sesión' }));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Acceso' })).toBeSelected();
      expect(screen.getByLabelText('Correo electrónico')).toHaveProp('value', 'Clienta@Ejemplo.test');

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si el backend responde 409 al registrar, vuelve al paso 1 con el correo marcado y sin ir a Activar',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/verificar-correo': () => respuesta(RESPUESTA_CORREO_NEUTRAL),
        'POST /api/usuarios/registro': () =>
          respuesta({ statusCode: 409, message: 'Conflict: email already exists' }, 409),
      });
      const app = await abrirRegistro();

      await llenarPaso1();
      await esperarRespuestaNeutral(llamadas);
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText('Cuéntanos sobre tu cabello')).toBeOnTheScreen();
      await llenarPaso2();
      await fireEvent.press(screen.getByRole('button', { name: 'Finalizar registro' }));

      expect(await screen.findByText('Este correo ya está registrado')).toBeOnTheScreen();
      expect(screen.getByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Este correo ya tiene una cuenta. Toca Iniciar sesión para entrar o recuperar tu contraseña.',
        ),
      ).toBeOnTheScreen();
      expect(screen.queryByText('Revisa los campos marcados.')).not.toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', '/api/usuarios/registro')).toHaveLength(1);
      expect(app.getPathname()).toBe('/registro');
      // El texto técnico del servidor nunca llega a la pantalla.
      expect(screen.queryByText('Conflict: email already exists')).not.toBeOnTheScreen();

      // "Iniciar sesión" lleva a Acceso con el correo escrito, donde está "¿Olvidaste tu contraseña?".
      await fireEvent.press(screen.getByRole('link', { name: 'Iniciar sesión' }));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Acceso' })).toBeSelected();
      expect(screen.getByLabelText('Correo electrónico')).toHaveProp('value', 'Clienta@Ejemplo.test');
      expect(screen.getByText('¿Olvidaste tu contraseña?')).toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
