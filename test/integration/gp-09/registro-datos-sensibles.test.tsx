/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { reiniciarReaceptacion } from '@/features/auth/viewmodels/useDocumentosPendientes';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { CLAVE, CORREO } from '../../helpers/datosClienta';
import { HASH_SENSIBLES, PARRAFO_1, PARRAFO_2, RUTA_SENSIBLES, RUTA_TEXTO_SENSIBLES, respuestaTextoSensibles } from '../../helpers/datosSensibles';
import { LIMITE_MS, prepararPruebasDePantalla, ultimoBoton } from '../../helpers/pantallas';
import {
  abrirRegistro,
  esperarRespuestaNeutral,
  llenarPaso1,
  PREGUNTA,
  RESPUESTA_CORREO_NEUTRAL,
  simularServidor,
} from '../../helpers/registroPantalla';
import { llamadasA, respuesta, type Llamada, type Manejador } from '../../helpers/servidorSimulado';

/**
 * GP-09, bloque B1, con las pantallas reales (renderRouter sobre src/app): en el paso 2 del registro,
 * "Sí" en alergias pide primero la autorización expresa con el texto del backend (hoja con la casilla
 * sin marcar y "Autorizo"); sin ella el campo no aparece y el cuerpo no lleva nada de alergias. Con
 * ella el campo aparece y viajan la versión y el hash. Si el backend no guardó las alergias, una hoja
 * lo explica antes de la activación. Servidor simulado en http://api.test con datos ficticios.
 */

const RUTA_REGISTRO = '/api/usuarios/registro';
const SI_ALERGIAS = '¿Tienes alergias a productos?: Sí';
const LEER = RESPALDO_TEXTOS['auth.registro.alergiasBoton'];
const CASILLA = RESPALDO_TEXTOS['datosSensibles.app.casilla'];
const AUTORIZO = RESPALDO_TEXTOS['datosSensibles.app.autorizo'];

/** Lo que el cuerpo del registro lleva siempre con los datos de llenarPaso1 y paso2SinAlergias. */
const CUERPO_BASE = {
  nombre: 'Clienta Ficticia',
  email: CORREO,
  telefono: '7711234567',
  password: CLAVE,
  fechaNacimiento: '1990-03-15',
  preguntaSeguridad: { pregunta: PREGUNTA, respuesta: 'Firulais' },
  aceptaTerminos: true,
  aceptaAvisoPrivacidad: true,
  recibePromociones: false,
  rutaOrigen: '/registro',
};

function creada(extra: Record<string, unknown> = {}): Response {
  return respuesta({ success: true, message: 'Ingresa el código para activar tu cuenta.', usuario: { id: 'u-9', ...extra } }, 201);
}

function servidor(registro: Manejador = () => creada()): Llamada[] {
  return simularServidor({
    'POST /api/auth/verificar-correo': () => respuesta(RESPUESTA_CORREO_NEUTRAL),
    [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
    [`POST ${RUTA_REGISTRO}`]: registro,
  });
}

/** Abre Registro, llena el paso 1 y pasa al paso 2. */
async function llegarAlPaso2(llamadas: Llamada[]): Promise<void> {
  await abrirRegistro();
  await llenarPaso1();
  await esperarRespuestaNeutral(llamadas);
  await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findByText('Cuéntanos sobre tu cabello')).toBeOnTheScreen();
}

/** Tipo de cabello, "Sí" en alergias, tratamientos en No, y los Términos y el aviso aceptados. */
async function llenarPaso2ConAlergias(): Promise<void> {
  await fireEvent.press(screen.getByRole('radio', { name: 'Tipo de cabello: Lacio' }));
  await fireEvent.press(screen.getByRole('radio', { name: SI_ALERGIAS }));
  await fireEvent.press(screen.getByRole('radio', { name: '¿Tratamientos químicos previos?: No' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: /^Acepto los/ }));
  await fireEvent.press(screen.getByRole('checkbox', { name: /^Acepto el/ }));
}

/** Abre la hoja desde "Leer y autorizar", revisa el texto y la casilla sin marcar, y autoriza. */
async function autorizar(): Promise<void> {
  await fireEvent.press(screen.getByRole('button', { name: LEER }));
  expect(await screen.findByText(PARRAFO_1)).toBeOnTheScreen();
  expect(screen.getByText(PARRAFO_2)).toBeOnTheScreen();
  const casilla = screen.getByRole('checkbox', { name: CASILLA });
  expect(casilla).not.toBeChecked();
  expect(screen.getByRole('button', { name: AUTORIZO })).toBeDisabled();
  await fireEvent.press(casilla);
  await fireEvent.press(screen.getByRole('button', { name: AUTORIZO }));
  await waitFor(() => expect(screen.queryByText(PARRAFO_1)).not.toBeOnTheScreen());
}

function cuerpoRegistro(llamadas: Llamada[]): unknown {
  return llamadasA(llamadas, 'POST', RUTA_REGISTRO)[0]?.cuerpo;
}

describe('Registro con la autorización de datos sensibles (GP-09)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  beforeEach(() => {
    reiniciarReaceptacion();
    reiniciarDocumentosLegales();
  });

  it(
    'sin autorizar no aparece el campo de alergias y el registro no manda nada de alergias',
    async () => {
      const llamadas = servidor();
      await llegarAlPaso2(llamadas);
      await llenarPaso2ConAlergias();

      expect(screen.getByText(RESPALDO_TEXTOS['auth.registro.alergiasPide'])).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: LEER })).toBeOnTheScreen();
      expect(screen.queryByLabelText('Especifica tus alergias')).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Finalizar registro' }));
      await waitFor(() => expect(llamadasA(llamadas, 'POST', RUTA_REGISTRO)).toHaveLength(1));
      expect(cuerpoRegistro(llamadas)).toEqual({
        ...CUERPO_BASE,
        perfilCapilar: { tipoCabello: 'liso', tratamientosQuimicos: false },
      });
      expect(await screen.findByText('Activa tu cuenta')).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'GET', RUTA_TEXTO_SENSIBLES)).toHaveLength(0);
      expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(0);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'al autorizar en la hoja aparece el campo y el registro manda la versión y el hash del texto leído',
    async () => {
      const llamadas = servidor();
      await llegarAlPaso2(llamadas);
      await llenarPaso2ConAlergias();

      await autorizar();
      const alergias = await screen.findByLabelText('Especifica tus alergias');
      expect(screen.getByText(RESPALDO_TEXTOS['auth.registro.alergiasAutorizada'])).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: LEER })).not.toBeOnTheScreen();
      await fireEvent.changeText(alergias, ' Alergia ficticia al amoniaco ');

      await fireEvent.press(screen.getByRole('button', { name: 'Finalizar registro' }));
      await waitFor(() => expect(llamadasA(llamadas, 'POST', RUTA_REGISTRO)).toHaveLength(1));
      expect(cuerpoRegistro(llamadas)).toEqual({
        ...CUERPO_BASE,
        perfilCapilar: {
          tipoCabello: 'liso',
          tieneAlergias: true,
          alergias: 'Alergia ficticia al amoniaco',
          tratamientosQuimicos: false,
        },
        consienteDatosSensibles: true,
        autorizacionDatosSensibles: { version: '1.0', hash: HASH_SENSIBLES },
      });
      // En el registro (sin sesión) la autorización viaja con la cuenta, no por su endpoint.
      expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(0);
      expect(await screen.findByText('Activa tu cuenta')).toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si el backend no guardó las alergias, lo explica antes de pasar a la activación',
    async () => {
      const llamadas = servidor(() => creada({ alergiasPendientesDeAutorizacion: true }));
      await llegarAlPaso2(llamadas);
      await llenarPaso2ConAlergias();
      await autorizar();
      await fireEvent.changeText(await screen.findByLabelText('Especifica tus alergias'), 'Alergia ficticia');

      await fireEvent.press(screen.getByRole('button', { name: 'Finalizar registro' }));
      expect(await screen.findByText(RESPALDO_TEXTOS['auth.registro.alergiasNoGuardadasTitulo'])).toBeOnTheScreen();
      expect(screen.getByText(RESPALDO_TEXTOS['auth.registro.alergiasNoGuardadas'])).toBeOnTheScreen();
      expect(screen.queryByText('Activa tu cuenta')).not.toBeOnTheScreen();

      await fireEvent.press(ultimoBoton(RESPALDO_TEXTOS['auth.registro.alergiasContinuar']));
      expect(await screen.findByText('Activa tu cuenta')).toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
