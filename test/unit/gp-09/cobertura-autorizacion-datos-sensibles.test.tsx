/// <reference types="jest" />

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TestInstance } from 'test-renderer';

import { HojaDatosSensibles } from '@/features/auth/components/HojaDatosSensibles';
import type { AutorizacionDatosSensibles } from '@/features/auth/models/datosSensibles';
import {
  useAutorizacionDatosSensibles,
  type AutorizacionDatosSensiblesViewModel,
} from '@/features/auth/viewmodels/useAutorizacionDatosSensibles';
import { obtenerTexto } from '@/shared/api/textosSitio';

import {
  HASH_SENSIBLES,
  PARRAFO_1,
  PARRAFO_2,
  RUTA_SENSIBLES,
  RUTA_TEXTO_SENSIBLES,
  respuestaAutorizada,
  respuestaTextoSensibles,
} from '../../helpers/datosSensibles';
import { limite429 } from '../../helpers/limitesRed';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { diferida, enSecuencia, servidorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, cobertura de la autorización de datos sensibles: respuestas del texto que llegan después de
 * cerrar la hoja (con éxito o con error), Atrás o el velo mientras se envía "Autorizo", la sesión que
 * cambia a mitad del envío (con éxito o con 429), el doble toque y la hoja sin versión del texto. Hoja
 * y viewmodel reales; fetch simulado en http://api.test con datos ficticios.
 */

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const CASILLA = obtenerTexto('datosSensibles.app.casilla');
const AUTORIZO = obtenerTexto('datosSensibles.app.autorizo');
const AHORA_NO = obtenerTexto('datosSensibles.app.ahoraNo');
const CARGANDO = obtenerTexto('datosSensibles.app.cargando');
const ERROR_TEXTO = obtenerTexto('datosSensibles.app.errorTexto');
const VERSION = obtenerTexto('datosSensibles.app.version', { version: '1.0' });

let autorizadas: AutorizacionDatosSensibles[] = [];

function Arnes() {
  const vm = useAutorizacionDatosSensibles({
    ruta: '/mis-datos',
    registrarEnServidor: true,
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

async function pintar(): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <Arnes />
    </SafeAreaProvider>,
  );
}

const abrirHoja = () => fireEvent.press(screen.getByRole('button', { name: 'Abrir autorización' }));

/** El Modal de la hoja (el único nodo con onRequestClose): su onRequestClose es el Atrás de Android. */
function modal(): TestInstance {
  const [nodo] = screen.container.queryAll((n) => typeof n.props.onRequestClose === 'function');
  return nodo;
}

/** El viewmodel solo, para lo que la hoja no deja tocar (botones deshabilitados) o el cambio de sesión. */
async function vmSolo() {
  const vista = await renderHook(() =>
    useAutorizacionDatosSensibles({
      ruta: '/mis-datos',
      registrarEnServidor: true,
      onAutorizada: (a) => autorizadas.push(a),
    }),
  );
  return vista;
}

/** Abre, espera el texto y marca la casilla. */
async function listaParaAutorizar(result: { current: AutorizacionDatosSensiblesViewModel }): Promise<void> {
  await act(async () => {
    result.current.abrir();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.parrafos).toEqual([PARRAFO_1, PARRAFO_2]);
  await act(async () => {
    result.current.alternar(true);
  });
}

beforeEach(async () => {
  autorizadas = [];
  await sembrarSesion({ id: 'clienta-cob-sens-1', nombre: 'Clienta Cobertura', email: 'cobertura@ejemplo.test', rol: 'cliente' });
});

afterEach(async () => {
  await cleanup();
});

describe('respuestas del texto que llegan tarde', () => {
  it('el texto de una apertura ya cerrada no se pinta: solo cuenta el de la apertura actual', async () => {
    const primera = diferida();
    const segunda = diferida();
    servidorVm({
      [`GET ${RUTA_TEXTO_SENSIBLES}`]: enSecuencia(
        () => primera.promesa,
        () => segunda.promesa,
      ),
    });
    await pintar();
    await abrirHoja();
    expect(screen.getByLabelText(CARGANDO)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: AHORA_NO }));
    await abrirHoja();

    await act(async () => {
      primera.soltar(respuestaTextoSensibles({ texto: 'Texto viejo ficticio.' }));
    });
    expect(screen.queryByText('Texto viejo ficticio.')).not.toBeOnTheScreen();
    // La carga de la apertura actual sigue a la vista: la respuesta vieja no la quitó.
    expect(screen.getByLabelText(CARGANDO)).toBeOnTheScreen();

    await act(async () => {
      segunda.soltar(respuestaTextoSensibles());
    });
    expect(await screen.findByText(PARRAFO_1)).toBeOnTheScreen();
    expect(screen.queryByLabelText(CARGANDO)).not.toBeOnTheScreen();
  });

  it('el error de una apertura ya cerrada no tapa el texto que sí cargó', async () => {
    const primera = diferida();
    servidorVm({
      [`GET ${RUTA_TEXTO_SENSIBLES}`]: enSecuencia(
        () => primera.promesa,
        () => respuestaTextoSensibles(),
      ),
    });
    await pintar();
    await abrirHoja();
    await fireEvent.press(screen.getByRole('button', { name: AHORA_NO }));
    await abrirHoja();
    expect(await screen.findByText(PARRAFO_1)).toBeOnTheScreen();

    await act(async () => {
      primera.soltar(respuesta({ success: false, statusCode: 500, message: 'Error interno ficticio' }, 500));
    });
    expect(screen.queryByText(ERROR_TEXTO)).not.toBeOnTheScreen();
    expect(screen.queryByText(/Error interno ficticio/)).not.toBeOnTheScreen();
    expect(screen.getByText(PARRAFO_1)).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: CASILLA })).toBeEnabled();
  });
});

describe('mientras se envía "Autorizo"', () => {
  it('Atrás no cierra la hoja: decide la respuesta del backend', async () => {
    const envio = diferida();
    const llamadas = servidorVm({
      [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
      [`POST ${RUTA_SENSIBLES}`]: () => envio.promesa,
    });
    await pintar();
    await abrirHoja();
    await fireEvent.press(await screen.findByRole('checkbox', { name: CASILLA }));
    await fireEvent.press(screen.getByRole('button', { name: AUTORIZO }));
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(1);

    await fireEvent(modal(), 'requestClose');
    expect(screen.getByRole('checkbox', { name: CASILLA })).toBeChecked();
    expect(screen.getByText(PARRAFO_1)).toBeOnTheScreen();
    expect(autorizadas).toEqual([]);

    await act(async () => {
      envio.soltar(respuestaAutorizada());
    });
    expect(autorizadas).toEqual([{ version: '1.0', hash: HASH_SENSIBLES }]);
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(1);
  });

  it('un segundo toque mientras se envía no manda otra autorización', async () => {
    const envio = diferida();
    const llamadas = servidorVm({
      [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
      [`POST ${RUTA_SENSIBLES}`]: () => envio.promesa,
    });
    const { result } = await vmSolo();
    await listaParaAutorizar(result);

    await act(async () => {
      result.current.autorizar();
    });
    expect(result.current.enviando).toBe(true);
    expect(result.current.textoAutorizo).toBe(obtenerTexto('datosSensibles.app.autorizando'));
    await act(async () => {
      result.current.autorizar();
    });
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(1);

    await act(async () => {
      envio.soltar(respuestaAutorizada());
    });
    expect(autorizadas).toHaveLength(1);
    expect(result.current.visible).toBe(false);
  });

  it('sin la casilla marcada "Autorizo" no envía nada', async () => {
    const llamadas = servidorVm({ [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles() });
    const { result } = await vmSolo();
    await listaParaAutorizar(result);
    await act(async () => {
      result.current.alternar(false);
    });

    await act(async () => {
      result.current.autorizar();
    });
    expect(result.current.autorizoDeshabilitado).toBe(true);
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(0);
    expect(autorizadas).toEqual([]);
  });

  it('si la sesión cambia a mitad del envío, la respuesta que llega ya no autoriza nada', async () => {
    const envio = diferida();
    servidorVm({
      [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
      [`POST ${RUTA_SENSIBLES}`]: () => envio.promesa,
    });
    const { result } = await vmSolo();
    await listaParaAutorizar(result);
    await act(async () => {
      result.current.autorizar();
    });

    await act(async () => {
      result.current.descartar();
    });
    expect(result.current.visible).toBe(false);
    expect(result.current.enviando).toBe(false);

    await act(async () => {
      envio.soltar(respuestaAutorizada());
    });
    expect(autorizadas).toEqual([]);
    expect(result.current.visible).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('si la sesión cambia a mitad del envío, un 429 tardío no deja "Autorizo" en espera ni muestra error', async () => {
    const envio = diferida();
    servidorVm({
      [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
      [`POST ${RUTA_SENSIBLES}`]: () => envio.promesa,
    });
    const { result } = await vmSolo();
    await listaParaAutorizar(result);
    await act(async () => {
      result.current.autorizar();
    });
    await act(async () => {
      result.current.descartar();
    });

    await act(async () => {
      envio.soltar(limite429(12));
    });
    expect(result.current.error).toBeNull();
    expect(result.current.textoAutorizo).toBe(AUTORIZO);
    expect(result.current.enviando).toBe(false);
    expect(autorizadas).toEqual([]);
  });
});

describe('HojaDatosSensibles sin versión del texto', () => {
  it('pinta los párrafos sin la línea de la versión', async () => {
    const vm: AutorizacionDatosSensiblesViewModel = {
      visible: true,
      abrir: jest.fn(),
      cerrar: jest.fn(),
      descartar: jest.fn(),
      titulo: obtenerTexto('datosSensibles.app.titulo'),
      cargando: false,
      textoCargando: CARGANDO,
      parrafos: [PARRAFO_1, PARRAFO_2],
      version: null,
      errorTexto: null,
      textoReintentar: obtenerTexto('datosSensibles.app.reintentar'),
      reintentar: jest.fn(),
      casilla: CASILLA,
      marcada: false,
      alternar: jest.fn(),
      textoAutorizo: AUTORIZO,
      autorizoDeshabilitado: true,
      enviando: false,
      autorizar: jest.fn(),
      error: null,
      textoAhoraNo: AHORA_NO,
    };
    await render(
      <SafeAreaProvider initialMetrics={MEDIDAS}>
        <HojaDatosSensibles vm={vm} />
      </SafeAreaProvider>,
    );

    expect(screen.getByText(PARRAFO_1)).toBeOnTheScreen();
    expect(screen.getByText(PARRAFO_2)).toBeOnTheScreen();
    expect(screen.queryByText(/^Versión /)).not.toBeOnTheScreen();
    expect(screen.queryByText(VERSION)).not.toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: CASILLA })).toBeEnabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: CASILLA }));
    expect(vm.alternar).toHaveBeenCalledWith(true);
  });
});
