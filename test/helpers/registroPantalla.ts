/// <reference types="jest" />

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { CLAVE } from './datosClienta';
import { abrirDesdeBienvenida, type App } from './pantallas';
import { CATALOGOS_VACIOS, llamadasA, respuesta, servidorConRutas, type Llamada } from './servidorSimulado';

/**
 * Registro con las pantallas reales (GP-05 y GP-09): abrir Registro desde la bienvenida, llenar los
 * dos pasos con datos ficticios válidos y el servidor de fondo con las preguntas de seguridad.
 */

export const PREGUNTA = '¿Cuál es el nombre de tu primera mascota?';

/** GET /api/pregunta-seguridad: { success, data[] }. */
const PREGUNTAS = {
  success: true,
  data: [
    { id: '1', pregunta: PREGUNTA },
    { id: '2', pregunta: '¿En qué ciudad naciste?' },
  ],
};

/** Lo que piden las pantallas de fondo y el selector de preguntas. */
export const simularServidor = servidorConRutas({
  ...CATALOGOS_VACIOS,
  'GET /api/pregunta-seguridad': () => respuesta(PREGUNTAS),
});

/** Lo que responde hoy POST /api/auth/verificar-correo sin sesión de admin, exista o no la cuenta. */
export const RESPUESTA_CORREO_NEUTRAL = { existe: false, message: 'Comprobaremos el correo al crear la cuenta' };

/**
 * Espera a que llegue la respuesta neutral de la verificación del correo y revisa que el campo no
 * afirme nada: ni "Correo disponible" ni el texto del servidor.
 */
export async function esperarRespuestaNeutral(llamadas: Llamada[]): Promise<void> {
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
export async function abrirRegistro(): Promise<App> {
  const app = await abrirDesdeBienvenida('Crear cuenta', '/registro');
  expect(await screen.findByText('Crea tu cuenta')).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: 'Registro' })).toBeSelected();
  expect(screen.getByLabelText('Paso 1 de 2: Tu cuenta')).toBeOnTheScreen();
  return app;
}

/** Paso 1, "Tu cuenta": todos los campos con datos ficticios válidos. */
export async function llenarPaso1(): Promise<void> {
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
export async function llenarPaso2(): Promise<void> {
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
