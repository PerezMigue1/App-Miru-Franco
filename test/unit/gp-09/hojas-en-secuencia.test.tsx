/// <reference types="jest" />

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfertaDatosSensibles } from '@/features/auth/components/OfertaDatosSensibles';
import { reiniciarOfertaDatosSensibles } from '@/features/auth/viewmodels/useOfertaDatosSensibles';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { Hoja } from '@/shared/ui/Hoja';

import { ConAreaSegura } from '../../helpers/areaSegura';
import {
  PARRAFO_1,
  RUTA_SENSIBLES,
  RUTA_TEXTO_SENSIBLES,
  respuestaAutorizada,
  respuestaEstadoSensibles,
  respuestaTextoSensibles,
} from '../../helpers/datosSensibles';
import { llamadasA, servidorConRutas, type Llamada } from '../../helpers/servidorSimulado';
import { authSimulada, reiniciarSimulaciones } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, hojas en secuencia: Hoja avisa con alCerrarse cuando terminó de irse, y la oferta de
 * autorizar las alergias abre la hoja del texto solo después de que la suya se fue (sin cruzarlas).
 *
 * El mock oficial de Reanimated termina cada withTiming al instante (llama a su callback con true
 * dentro de la misma llamada), así que la salida nunca se ve "en curso". Para probar lo que pasa
 * mientras la hoja baja, withTiming se envuelve: las animaciones hacia 0 con callback quedan
 * retenidas y terminarSalidas() las termina, como haría el hilo de UI al acabar los 200 ms (callback
 * con true y luego scheduleOnRN, que el mock de worklets corre en una microtarea). Las animaciones
 * de entrada no llevan callback y siguen siendo inmediatas. Una salida que se interrumpe recibe
 * false, como en Reanimated. Al montar, las hojas cerradas lanzan una salida de 0 a 0 que en el
 * teléfono termina en el primer cuadro: montar() la termina enseguida.
 *
 * useAuth y la fase de re-aceptación simulados; hojas y viewmodels reales; fetch simulado en
 * http://api.test con datos ficticios.
 */

let mockFase = 'listo';

jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('@/features/auth/viewmodels/useDocumentosPendientes', () => ({
  ...jest.requireActual('@/features/auth/viewmodels/useDocumentosPendientes'),
  useFaseReaceptacion: () => mockFase,
}));

type CallbackAnimacion = (terminada: boolean) => void;
interface ReanimatedSimulado {
  withTiming: (valor: number, config?: unknown, callback?: CallbackAnimacion) => number;
}

const reanimated = jest.requireMock<ReanimatedSimulado>('react-native-reanimated');
const withTimingOriginal = reanimated.withTiming;
let salidas: CallbackAnimacion[] = [];

/** Las salidas quedan en curso hasta terminarSalidas() (ver el comentario de arriba). */
function retenerSalidas(): void {
  reanimated.withTiming = (valor, _config, callback) => {
    if (valor === 0 && callback) {
      salidas.push(callback);
    }
    return valor;
  };
}

/** Termina (true) o interrumpe (false) las salidas en curso y deja correr sus avisos. */
async function terminarSalidas(terminada = true): Promise<void> {
  const pendientes = salidas;
  salidas = [];
  await act(async () => {
    for (const callback of pendientes) {
      callback(terminada);
    }
    await Promise.resolve();
  });
}

/** El sistema pide reducir el movimiento (valor síncrono de Reanimated y el de AccessibilityInfo). */
function conMovimientoReducido(): void {
  jest.mocked(useReducedMotion).mockReturnValue(true);
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
}

beforeEach(() => {
  salidas = [];
  retenerSalidas();
});

afterEach(async () => {
  await cleanup();
  reanimated.withTiming = withTimingOriginal;
  jest.mocked(useReducedMotion).mockReturnValue(false);
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
});

describe('Hoja: aviso al terminar de cerrarse', () => {
  const elemento = (visible: boolean, alCerrarse: () => void) => (
    <ConAreaSegura>
      <Hoja visible={visible} onCerrar={jest.fn()} alCerrarse={alCerrarse} titulo="Filtros">
        <Text>Contenido</Text>
      </Hoja>
    </ConAreaSegura>
  );

  it('avisa una vez cuando la salida terminó y el Modal se desmontó', async () => {
    const alCerrarse = jest.fn();
    const { rerender } = await render(elemento(true, alCerrarse));
    await rerender(elemento(false, alCerrarse));

    // Bajando: sigue montada y todavía no avisa.
    expect(screen.getByText('Filtros')).toBeOnTheScreen();
    expect(alCerrarse).not.toHaveBeenCalled();

    await terminarSalidas();
    expect(screen.queryByText('Filtros')).not.toBeOnTheScreen();
    expect(alCerrarse).toHaveBeenCalledTimes(1);

    // Otra vuelta: otro aviso, uno solo.
    await rerender(elemento(true, alCerrarse));
    await rerender(elemento(false, alCerrarse));
    await terminarSalidas();
    expect(alCerrarse).toHaveBeenCalledTimes(2);
  });

  it('si se reabre mientras baja, la salida interrumpida no avisa; solo el cierre que termina', async () => {
    const alCerrarse = jest.fn();
    const { rerender } = await render(elemento(true, alCerrarse));
    await rerender(elemento(false, alCerrarse));
    await rerender(elemento(true, alCerrarse));
    await terminarSalidas(false);
    expect(alCerrarse).not.toHaveBeenCalled();
    expect(screen.getByText('Filtros')).toBeOnTheScreen();

    await rerender(elemento(false, alCerrarse));
    await terminarSalidas();
    expect(alCerrarse).toHaveBeenCalledTimes(1);
  });

  it('una hoja que nunca se abrió no avisa', async () => {
    const alCerrarse = jest.fn();
    const { rerender } = await render(elemento(false, alCerrarse));
    await terminarSalidas();
    await rerender(elemento(false, alCerrarse));
    await terminarSalidas();
    expect(alCerrarse).not.toHaveBeenCalled();
  });

  it('con el mock de Reanimated sin retener, avisa en cuanto termina la salida inmediata', async () => {
    reanimated.withTiming = withTimingOriginal;
    const alCerrarse = jest.fn();
    const { rerender } = await render(elemento(false, alCerrarse));
    await rerender(elemento(true, alCerrarse));
    await rerender(elemento(false, alCerrarse));
    await act(async () => {
      await Promise.resolve();
    });
    expect(alCerrarse).toHaveBeenCalledTimes(1);
  });

  it('con movimiento reducido avisa en cuanto se cierra, sin esperar el fundido, y no repite', async () => {
    conMovimientoReducido();
    const alCerrarse = jest.fn();
    const { rerender } = await render(elemento(true, alCerrarse));
    await rerender(elemento(false, alCerrarse));
    expect(alCerrarse).toHaveBeenCalledTimes(1);

    // El fundido corto sigue su curso; al terminar se desmonta sin otro aviso.
    expect(screen.getByText('Filtros')).toBeOnTheScreen();
    await terminarSalidas();
    expect(screen.queryByText('Filtros')).not.toBeOnTheScreen();
    expect(alCerrarse).toHaveBeenCalledTimes(1);
  });
});

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const TITULO_OFERTA = obtenerTexto('datosSensibles.app.ofertaTitulo');
const TITULO_TEXTO = obtenerTexto('datosSensibles.app.titulo');
const LEER = obtenerTexto('datosSensibles.app.ofertaLeer');
const AHORA_NO = obtenerTexto('datosSensibles.app.ahoraNo');
const CASILLA = obtenerTexto('datosSensibles.app.casilla');
const CLIENTA = { id: 'clienta-secuencia-1', nombre: 'Clienta Secuencia', email: 'secuencia@ejemplo.test', rol: 'cliente' };
const simular = servidorConRutas({});

function conSesion(): void {
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = { ...CLIENTA };
}

function sinSesion(): void {
  authSimulada.estado = 'anonimo';
  authSimulada.usuario = null;
}

function servidor(): Llamada[] {
  return simular({
    [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(false, true),
    [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
    [`POST ${RUTA_SENSIBLES}`]: () => respuestaAutorizada(),
  });
}

// Un elemento nuevo en cada render: con el mismo, React no vuelve a pintar y no leería la sesión nueva.
const arbol = () => (
  <SafeAreaProvider initialMetrics={MEDIDAS}>
    <OfertaDatosSensibles habilitada />
  </SafeAreaProvider>
);

/** Monta la oferta, termina las salidas de 0 a 0 del montaje y espera a que se ofrezca. */
async function montar() {
  const vista = await render(arbol());
  await terminarSalidas();
  expect(await screen.findByText(TITULO_OFERTA)).toBeOnTheScreen();
  return vista;
}

const pedidasDelTexto = (llamadas: Llamada[]) => llamadasA(llamadas, 'GET', RUTA_TEXTO_SENSIBLES).length;

describe('Oferta: la hoja del texto espera a que la de la oferta se vaya', () => {
  beforeEach(() => {
    mockFase = 'listo';
    reiniciarSimulaciones();
    reiniciarOfertaDatosSensibles();
    conSesion();
  });

  it('"Leer y autorizar": mientras la oferta baja el texto no está; al terminar de irse, sí', async () => {
    const llamadas = servidor();
    await montar();
    await fireEvent.press(screen.getByRole('button', { name: LEER }));

    // La oferta sigue saliendo (montada) y la del texto todavía no se abre ni pide el texto.
    expect(screen.getByText(TITULO_OFERTA)).toBeOnTheScreen();
    expect(screen.queryByText(TITULO_TEXTO)).not.toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: CASILLA })).not.toBeOnTheScreen();
    expect(pedidasDelTexto(llamadas)).toBe(0);

    await terminarSalidas();
    expect(await screen.findByText(PARRAFO_1)).toBeOnTheScreen();
    expect(screen.getByText(TITULO_TEXTO)).toBeOnTheScreen();
    expect(screen.queryByText(TITULO_OFERTA)).not.toBeOnTheScreen();
    expect(pedidasDelTexto(llamadas)).toBe(1);
  });

  it('con movimiento reducido el texto se abre en cuanto se cierra la oferta', async () => {
    conMovimientoReducido();
    const llamadas = servidor();
    await montar();
    await fireEvent.press(screen.getByRole('button', { name: LEER }));

    // Sin terminar ninguna salida: la del texto ya está abierta.
    expect(await screen.findByText(PARRAFO_1)).toBeOnTheScreen();
    expect(pedidasDelTexto(llamadas)).toBe(1);
  });

  it('si la sesión se cierra mientras la oferta baja, el texto no se abre', async () => {
    const llamadas = servidor();
    const vista = await montar();
    await fireEvent.press(screen.getByRole('button', { name: LEER }));

    sinSesion();
    await vista.rerender(arbol());
    await terminarSalidas();

    expect(screen.queryByText(TITULO_TEXTO)).not.toBeOnTheScreen();
    expect(screen.queryByText(TITULO_OFERTA)).not.toBeOnTheScreen();
    expect(pedidasDelTexto(llamadas)).toBe(0);
  });

  it('si la sesión se cierra y la misma clienta vuelve a entrar antes de que termine, tampoco', async () => {
    const llamadas = servidor();
    const vista = await montar();
    await fireEvent.press(screen.getByRole('button', { name: LEER }));

    sinSesion();
    await vista.rerender(arbol());
    conSesion();
    await vista.rerender(arbol());
    await terminarSalidas();

    expect(screen.queryByText(TITULO_TEXTO)).not.toBeOnTheScreen();
    expect(pedidasDelTexto(llamadas)).toBe(0);
  });

  it('si la re-aceptación deja de estar lista mientras baja, el texto no se abre', async () => {
    const llamadas = servidor();
    const vista = await montar();
    await fireEvent.press(screen.getByRole('button', { name: LEER }));

    mockFase = 'pendientes';
    await vista.rerender(arbol());
    await terminarSalidas();

    expect(screen.queryByText(TITULO_TEXTO)).not.toBeOnTheScreen();
    expect(pedidasDelTexto(llamadas)).toBe(0);
  });

  it('"Ahora no" cierra la oferta y, al terminar de irse, no abre nada', async () => {
    const llamadas = servidor();
    await montar();
    await fireEvent.press(screen.getByRole('button', { name: AHORA_NO }));
    await terminarSalidas();

    expect(screen.queryByText(TITULO_OFERTA)).not.toBeOnTheScreen();
    expect(screen.queryByText(TITULO_TEXTO)).not.toBeOnTheScreen();
    expect(pedidasDelTexto(llamadas)).toBe(0);
  });
});
