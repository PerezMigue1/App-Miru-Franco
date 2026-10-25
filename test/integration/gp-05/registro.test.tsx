/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { CLAVE, CORREO } from '../../helpers/datosClienta';
import { LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import {
  abrirRegistro,
  esperarRespuestaNeutral,
  llenarPaso1,
  llenarPaso2,
  PREGUNTA,
  RESPUESTA_CORREO_NEUTRAL,
  simularServidor,
} from '../../helpers/registroPantalla';
import { leerSecureStore } from '../../helpers/secureStore';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';

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

  it(
    'cada campo se valida al salir de él y la tecla del teclado avanza sin enviar el registro',
    async () => {
      const llamadas = simularServidor({
        'POST /api/auth/verificar-correo': () => respuesta(RESPUESTA_CORREO_NEUTRAL),
      });
      await abrirRegistro();

      // Paso 1 vacío: la tecla "siguiente" y salir del campo marcan lo que falta en cada uno.
      const vacios: [etiqueta: string, error: string][] = [
        ['Nombre completo', 'El nombre completo es requerido'],
        ['Correo electrónico', 'El correo electrónico es requerido'],
        ['Teléfono', 'El teléfono es requerido'],
        ['Fecha de nacimiento', 'La fecha de nacimiento es requerida'],
        ['Respuesta de seguridad', 'La respuesta a la pregunta de seguridad es requerida'],
        ['Contraseña', 'Te faltan requisitos de la contraseña.'],
        ['Confirmar contraseña', 'Confirma tu contraseña'],
      ];
      for (const [etiqueta, error] of vacios) {
        const campo = screen.getByLabelText(etiqueta);
        await fireEvent(campo, 'submitEditing');
        await fireEvent(campo, 'blur');
        expect(await screen.findByText(error)).toBeOnTheScreen();
      }
      expect(screen.getByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();

      // Paso 2: los opcionales y las alergias avanzan con la tecla del teclado.
      await llenarPaso1();
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText('Cuéntanos sobre tu cabello')).toBeOnTheScreen();
      for (const etiqueta of ['Color natural (opcional)', 'Color actual (opcional)', 'Productos usados (opcional)']) {
        await fireEvent.changeText(screen.getByLabelText(etiqueta), 'Dato ficticio');
        await fireEvent(screen.getByLabelText(etiqueta), 'submitEditing');
        expect(screen.getByLabelText(etiqueta)).toHaveProp('value', 'Dato ficticio');
      }
      await fireEvent.press(screen.getByRole('radio', { name: '¿Tienes alergias a productos?: Sí' }));
      const alergias = await screen.findByLabelText('Especifica tus alergias');
      await fireEvent.changeText(alergias, 'Alergia ficticia');
      await fireEvent(alergias, 'submitEditing');
      await fireEvent(alergias, 'blur');
      const consentimiento = screen.getByRole('checkbox', { name: /^Autorizo el uso de mis datos de salud/ });
      await fireEvent.press(consentimiento);
      expect(consentimiento).toBeChecked();
      expect(llamadasA(llamadas, 'POST', '/api/usuarios/registro')).toHaveLength(0);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
