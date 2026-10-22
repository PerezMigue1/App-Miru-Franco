/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen } from 'expo-router/testing-library';

import { NOMBRE_POLITICA_ANTICIPOS } from '@/features/citas/models/formaPagoModel';
import { fechaVigenciaLegible } from '@/shared/api/documentosLegales';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { SERVICIO_CON_ANTICIPO, sinRedEnRuta } from '../../helpers/citasFicticias';
import {
  abrirNavegadorSimulado,
  documentoCrudo,
  documentoGuardado,
  sembrarDocumentosGuardados,
  WEB,
} from '../../helpers/documentosFicticios';
import { RUTA_DOCUMENTO_ANTICIPOS, secuencia } from '../../helpers/integracionCitas';
import { LIMITE_MS, ultimoBoton } from '../../helpers/pantallas';
import { abrirConfirmar, prepararPruebasFormaPago } from '../../helpers/pantallasFormaPago';
import {
  BOTON,
  CASILLA_POLITICA,
  elegirOpcionPago,
  esperarRuta,
  marcarPolitica,
  OPCION_PAGO,
  PASO,
  sinTextos,
} from '../../helpers/pantallasReserva';
import { escrituras } from '../../helpers/reservaFicticia';
import type { Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: desde el paso Confirmar de la reserva la clienta toca "Política de anticipos y
 * cancelación" en la casilla y llega al visor de la política, con las pantallas reales, el disco y el
 * navegador simulados. Con red ve el título, la versión y la vigencia del documento vigente, abre el
 * texto completo en el sitio y, al volver, lo que eligió sigue igual. Sin red en la política y con
 * una versión guardada, el visor lo avisa y muestra la guardada.
 */

const NOTAS = 'Traigo foto de referencia ficticia';
const BOTON_LEER = 'Leer el documento completo';
const SIN_RED = 'Sin conexión. Te mostramos la versión que guardamos la última vez.';
const VIGENTE = documentoCrudo('anticipos');

/** Abre Confirmar, elige el pago en el salón, marca la casilla, escribe notas y toca el enlace de la política. */
async function abrirPoliticaDesdeCasilla(rutas: Record<string, Manejador> = {}) {
  const abierta = await abrirConfirmar({ rutas });
  await elegirOpcionPago('salon');
  await marcarPolitica();
  await fireEvent.changeText(screen.getByLabelText('Notas para el salón (opcional)'), NOTAS);
  await fireEvent.press(screen.getByRole('link', { name: NOMBRE_POLITICA_ANTICIPOS }));
  await esperarRuta(abierta.app, '/legal/anticipos');
  return abierta;
}

/** El visor muestra la versión y la vigencia del documento. */
async function revisarVigencia(documento: { version: string; vigenteDesde: string }): Promise<void> {
  expect(await screen.findByText(`Versión ${documento.version}`)).toBeOnTheScreen();
  expect(screen.getByText(`Vigente desde el ${fechaVigenciaLegible(documento.vigenteDesde)}`)).toBeOnTheScreen();
}

describe('La política de anticipos desde la casilla de la reserva (GP-07.4)', () => {
  beforeEach(() => {
    limpiarArchivos();
    abrirNavegadorSimulado().mockClear();
  });
  const esperarConsolaLimpia = prepararPruebasFormaPago();

  it(
    'el enlace abre el visor con título, versión y vigencia, el botón abre el texto en el sitio y al volver lo elegido sigue igual',
    async () => {
      const { app, llamadas } = await abrirPoliticaDesdeCasilla();

      expect(await screen.findByRole('header', { name: String(VIGENTE.titulo) })).toBeOnTheScreen();
      await revisarVigencia({ version: String(VIGENTE.version), vigenteDesde: String(VIGENTE.vigenteDesde) });
      sinTextos(SIN_RED);

      await fireEvent.press(screen.getByRole('button', { name: BOTON_LEER }));
      expect(abrirNavegadorSimulado()).toHaveBeenCalledTimes(1);
      expect(abrirNavegadorSimulado()).toHaveBeenCalledWith(`${WEB}${String(VIGENTE.ruta)}`);
      // El visor usa la versión que la casilla ya precargó.
      expect(secuencia(llamadas, RUTA_DOCUMENTO_ANTICIPOS)).toHaveLength(1);

      await fireEvent.press(ultimoBoton('Volver'));
      await esperarRuta(app, `/reservar/${SERVICIO_CON_ANTICIPO.id}`);
      expect(await screen.findByRole('header', { name: PASO.confirmar })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: OPCION_PAGO.salon })).toBeChecked();
      expect(screen.getByRole('radio', { name: OPCION_PAGO.linea })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: CASILLA_POLITICA })).toBeChecked();
      expect(screen.getByDisplayValue(NOTAS)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: BOTON.apartarEnSalon })).toBeEnabled();
      expect(escrituras(llamadas)).toEqual([]);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin red en la política y con una versión guardada, el visor avisa que no hay conexión y muestra la guardada',
    async () => {
      const guardado = documentoGuardado('anticipos');
      sembrarDocumentosGuardados({ anticipos: guardado });
      await abrirPoliticaDesdeCasilla({ [RUTA_DOCUMENTO_ANTICIPOS]: sinRedEnRuta });

      expect(await screen.findByText(SIN_RED)).toBeOnTheScreen();
      await revisarVigencia(guardado);
      sinTextos(`Versión ${String(VIGENTE.version)}`);

      await fireEvent.press(screen.getByRole('button', { name: BOTON_LEER }));
      expect(abrirNavegadorSimulado()).toHaveBeenCalledWith(`${WEB}${guardado.ruta}`);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
