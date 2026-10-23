/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());

import * as SecureStore from 'expo-secure-store';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { CLIENTA_CITAS } from '../../helpers/citasFicticias';
import { LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirBandeja,
  abrirConAvisos,
  esperarCampana,
  esperarFlujo,
  filaSinLeer,
  pedidasDeLista,
  prepararPruebasAvisos,
} from '../../helpers/pantallasAvisos';
import { clavePreferenciaAvisos, leerSecureStore } from '../../helpers/secureStore';
import { abrirFlujo, flujosVivos, llamadasFlujo } from '../../helpers/streamSimulado';

/**
 * GP-07.6 Tarea 4, interruptor "Avisos en la app" de Perfil con las pantallas reales (renderRouter
 * sobre src/app), el servidor simulado y el flujo en vivo simulado (expo/fetch). Apagarlo corta la
 * conexión en vivo (y su consulta de respaldo) y lo guarda en el teléfono para esa clienta;
 * encenderlo vuelve a conectar una sola vez. Apagado desde antes, la app no conecta y la bandeja se
 * pide al abrir la campana. Datos ficticios; nada sale a la red.
 */

const ETIQUETA = RESPALDO_TEXTOS['perfil.avisos.titulo'];
const CLAVE = clavePreferenciaAvisos(CLIENTA_CITAS.id);

async function interruptor() {
  return screen.findByRole('switch', { name: ETIQUETA });
}

describe('GP-07.6 Tarea 4: avisos en la app', () => {
  const revisarConsola = prepararPruebasAvisos();

  it(
    'desde Perfil, apagar corta la conexión en vivo y encender la abre otra vez, una sola vez',
    async () => {
      const { flujo, llamadas } = await abrirConAvisos('/perfil');
      const vivo = await esperarFlujo(flujo);
      expect(await screen.findByText(CLIENTA_CITAS.nombre)).toBeOnTheScreen();
      expect(await interruptor()).toBeChecked();
      expect(screen.getByText(RESPALDO_TEXTOS['perfil.avisos.encendidos'])).toBeOnTheScreen();

      await fireEvent.press(await interruptor());
      await waitFor(() => expect(flujosVivos()).toBe(0));
      expect(vivo.vivo()).toBe(false);
      expect(await interruptor()).not.toBeChecked();
      expect(screen.getByText(RESPALDO_TEXTOS['perfil.avisos.apagados'])).toBeOnTheScreen();
      await waitFor(() => expect(leerSecureStore()[CLAVE]).toBe('0'));
      expect(pedidasDeLista(llamadas)).toHaveLength(1);
      // Apagado no vuelve a abrir GET /api/notificaciones/stream ni la consulta de respaldo de 30 s,
      // aunque pase más de un minuto.
      await act(async () => {
        jest.advanceTimersByTime(65_000);
      });
      expect(llamadasFlujo()).toHaveLength(1);
      expect(flujosVivos()).toBe(0);
      expect(pedidasDeLista(llamadas)).toHaveLength(1);

      const otro = abrirFlujo();
      await fireEvent.press(await interruptor());
      await esperarFlujo(otro);
      expect(flujosVivos()).toBe(1);
      expect(llamadasFlujo()).toHaveLength(2);
      expect(await interruptor()).toBeChecked();
      await waitFor(() => expect(leerSecureStore()[CLAVE]).toBe('1'));
      await waitFor(() => expect(pedidasDeLista(llamadas)).toHaveLength(2));

      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'apagados desde antes: no conecta y la campana abre la bandeja pidiendo la lista',
    async () => {
      await SecureStore.setItemAsync(CLAVE, '0');
      const { app, llamadas } = await abrirConAvisos('/');
      await esperarCampana('Abrir notificaciones');
      expect(llamadasFlujo()).toHaveLength(0);
      expect(pedidasDeLista(llamadas)).toHaveLength(0);

      await abrirBandeja(app, 'Abrir notificaciones');
      expect(await filaSinLeer('Tu cita está confirmada')).toBeOnTheScreen();
      expect(pedidasDeLista(llamadas)).toHaveLength(1);
      expect(llamadasFlujo()).toHaveLength(0);

      revisarConsola();
    },
    LIMITE_MS,
  );
});
