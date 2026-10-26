/// <reference types="jest" />

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HojaDatosSensibles } from '@/features/auth/components/HojaDatosSensibles';
import type { AutorizacionDatosSensibles } from '@/features/auth/models/datosSensibles';
import { useAutorizacionDatosSensibles } from '@/features/auth/viewmodels/useAutorizacionDatosSensibles';
import { obtenerTexto } from '@/shared/api/textosSitio';

import {
  HASH_SENSIBLES,
  PARRAFO_1,
  PARRAFO_2,
  RUTA_SENSIBLES,
  RUTA_TEXTO_SENSIBLES,
  respuestaAutorizada,
  respuestaTextoSensibles,
  textoCambio400,
} from '../../helpers/datosSensibles';
import { limite429 } from '../../helpers/limitesRed';
import { llamadasA, respuesta, servidorConRutas, type Manejador } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';

/**
 * GP-09, base de los bloques B y C: hoja de la autorización de datos sensibles con su viewmodel
 * real. Texto completo del backend, casilla siempre sin marcar, "Autorizo" como acción principal y
 * deshabilitado hasta marcarla, texto cambiado (400), espera por 429 y el modo del registro (sin
 * sesión, solo devuelve la versión y el hash). fetch simulado en http://api.test.
 */

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const CASILLA = obtenerTexto('datosSensibles.app.casilla');
const AUTORIZO = obtenerTexto('datosSensibles.app.autorizo');
const AHORA_NO = obtenerTexto('datosSensibles.app.ahoraNo');
const simular = servidorConRutas({});

let autorizadas: AutorizacionDatosSensibles[] = [];

function Arnes({ registrarEnServidor }: { registrarEnServidor: boolean }) {
  const vm = useAutorizacionDatosSensibles({
    ruta: registrarEnServidor ? '/mis-datos' : '/registro',
    registrarEnServidor,
    onAutorizada: (a) => autorizadas.push(a),
  });
  return (
    <>
      <Pressable accessibilityRole="button" onPress={vm.abrir}>
        <Text>Abrir autorización</Text>
      </Pressable>
      <HojaDatosSensibles vm={vm} />
    </>
  );
}

async function abrir(rutas: Record<string, Manejador>, registrarEnServidor = true) {
  const llamadas = simular(rutas);
  await render(
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <Arnes registrarEnServidor={registrarEnServidor} />
    </SafeAreaProvider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Abrir autorización' }));
  return llamadas;
}

beforeEach(async () => {
  autorizadas = [];
  await sembrarSesion({ id: 'clienta-hoja-1', nombre: 'Clienta Hoja', email: 'hoja@ejemplo.test', rol: 'cliente' });
});

afterEach(async () => {
  await cleanup();
});

describe('HojaDatosSensibles', () => {
  it('muestra el texto completo del backend, la versión y la casilla sin marcar; Autorizo espera la casilla', async () => {
    const llamadas = await abrir({
      [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
      [`POST ${RUTA_SENSIBLES}`]: () => respuestaAutorizada(),
    });

    expect(await screen.findByText(PARRAFO_1)).toBeOnTheScreen();
    expect(screen.getByText(PARRAFO_2)).toBeOnTheScreen();
    expect(screen.getByText(obtenerTexto('datosSensibles.app.version', { version: '1.0' }))).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: obtenerTexto('datosSensibles.app.titulo') })).toBeOnTheScreen();
    const casilla = screen.getByRole('checkbox', { name: CASILLA });
    expect(casilla).not.toBeChecked();
    expect(screen.getByRole('button', { name: AUTORIZO })).toBeDisabled();

    await fireEvent.press(casilla);
    await fireEvent.press(screen.getByRole('button', { name: AUTORIZO }));

    await waitFor(() => expect(autorizadas).toEqual([{ version: '1.0', hash: HASH_SENSIBLES }]));
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)[0].cuerpo).toEqual({
      version: '1.0',
      hash: HASH_SENSIBLES,
      rutaOrigen: '/mis-datos',
    });
  });

  it('al volver a abrirla la casilla vuelve a empezar sin marcar', async () => {
    await abrir({ [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles() });
    await fireEvent.press(await screen.findByRole('checkbox', { name: CASILLA }));
    await fireEvent.press(screen.getByRole('button', { name: AHORA_NO }));

    await fireEvent.press(screen.getByRole('button', { name: 'Abrir autorización' }));

    expect(await screen.findByRole('checkbox', { name: CASILLA })).not.toBeChecked();
    expect(autorizadas).toEqual([]);
  });

  it('en el registro no llama al backend: solo devuelve la versión y el hash leídos', async () => {
    const llamadas = await abrir({ [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles() }, false);

    await fireEvent.press(await screen.findByRole('checkbox', { name: CASILLA }));
    await fireEvent.press(screen.getByRole('button', { name: AUTORIZO }));

    expect(autorizadas).toEqual([{ version: '1.0', hash: HASH_SENSIBLES }]);
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(0);
  });

  it('si el texto cambió (TEXTO_DATOS_SENSIBLES_NO_VIGENTE), lo vuelve a pedir, lo muestra y desmarca la casilla', async () => {
    let lecturas = 0;
    await abrir({
      [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => {
        lecturas += 1;
        return respuestaTextoSensibles(lecturas > 1 ? { version: '1.1', texto: 'Texto ficticio nuevo.' } : {});
      },
      [`POST ${RUTA_SENSIBLES}`]: () => textoCambio400(),
    });

    await fireEvent.press(await screen.findByRole('checkbox', { name: CASILLA }));
    await fireEvent.press(screen.getByRole('button', { name: AUTORIZO }));

    expect(await screen.findByText('Texto ficticio nuevo.')).toBeOnTheScreen();
    expect(screen.getByText(obtenerTexto('datosSensibles.app.textoCambio'))).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: CASILLA })).not.toBeChecked();
    expect(autorizadas).toEqual([]);
    // El mensaje del servidor nunca se muestra.
    expect(screen.queryByText(/Vuelve a leerlo/)).not.toBeOnTheScreen();
  });

  it('un 429 deja Autorizo en espera con el mensaje del backend', async () => {
    jest.useFakeTimers();
    try {
      await abrir({
        [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
        [`POST ${RUTA_SENSIBLES}`]: () => limite429(12),
      });
      await fireEvent.press(await screen.findByRole('checkbox', { name: CASILLA }));
      await fireEvent.press(screen.getByRole('button', { name: AUTORIZO }));

      expect(await screen.findByRole('button', { name: 'Intenta de nuevo en 12 s' })).toBeDisabled();
      expect(screen.getByText('Hiciste demasiadas solicitudes. Intenta de nuevo en unos segundos.')).toBeOnTheScreen();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(12_000);
      });
      expect(screen.getByRole('button', { name: AUTORIZO })).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('un error del servidor al autorizar muestra el respaldo', async () => {
    await abrir({
      [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
      [`POST ${RUTA_SENSIBLES}`]: () => respuesta({ message: 'Error' }, 500),
    });
    await fireEvent.press(await screen.findByRole('checkbox', { name: CASILLA }));
    await fireEvent.press(screen.getByRole('button', { name: AUTORIZO }));

    expect(await screen.findByText(obtenerTexto('datosSensibles.app.errorAutorizar'))).toBeOnTheScreen();
    expect(autorizadas).toEqual([]);
  });

  it('si no carga el texto, no deja autorizar y ofrece reintentar', async () => {
    let lecturas = 0;
    await abrir({
      [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => {
        lecturas += 1;
        return lecturas === 1 ? respuesta({ message: 'Error' }, 500) : respuestaTextoSensibles();
      },
    });

    expect(await screen.findByText(obtenerTexto('datosSensibles.app.errorTexto'))).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: CASILLA })).toBeDisabled();
    expect(screen.getByRole('button', { name: AUTORIZO })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: obtenerTexto('datosSensibles.app.reintentar') }));
    expect(await screen.findByText(PARRAFO_1)).toBeOnTheScreen();
  });
});
