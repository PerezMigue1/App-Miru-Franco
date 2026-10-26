/// <reference types="jest" />

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfertaDatosSensibles } from '@/features/auth/components/OfertaDatosSensibles';
import type { FaseReaceptacion } from '@/features/auth/viewmodels/useDocumentosPendientes';
import { reiniciarOfertaDatosSensibles } from '@/features/auth/viewmodels/useOfertaDatosSensibles';
import { avisarCierreSesion } from '@/shared/api/eventosSesion';
import { obtenerTexto } from '@/shared/api/textosSitio';

import {
  HASH_SENSIBLES,
  PARRAFO_1,
  RUTA_SENSIBLES,
  RUTA_TEXTO_SENSIBLES,
  respuestaAutorizada,
  respuestaEstadoSensibles,
  respuestaTextoSensibles,
} from '../../helpers/datosSensibles';
import { llamadasA, servidorConRutas, type Llamada, type Manejador } from '../../helpers/servidorSimulado';
import { authSimulada, reiniciarSimulaciones } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque B3: oferta al iniciar sesión. Con sesión, sin documentos legales pendientes (fase
 * 'listo') y habilitada por la raíz, consulta GET /api/consentimientos/datos-sensibles; con
 * pendiente: true ofrece autorizar las alergias una sola vez por inicio de sesión, con "Ahora no".
 * Con documentos pendientes espera; si la consulta falla no muestra nada ni bloquea. Se olvida al
 * cerrar sesión. useAuth y la fase simulados; hojas y viewmodels reales; fetch simulado en
 * http://api.test con datos ficticios.
 */

let mockFase: FaseReaceptacion = 'listo';

jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('@/features/auth/viewmodels/useDocumentosPendientes', () => ({
  ...jest.requireActual('@/features/auth/viewmodels/useDocumentosPendientes'),
  useFaseReaceptacion: () => mockFase,
}));

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const TITULO = obtenerTexto('datosSensibles.app.ofertaTitulo');
const LEER = obtenerTexto('datosSensibles.app.ofertaLeer');
const AHORA_NO = obtenerTexto('datosSensibles.app.ahoraNo');
const CASILLA = obtenerTexto('datosSensibles.app.casilla');
const AUTORIZO = obtenerTexto('datosSensibles.app.autorizo');
const simular = servidorConRutas({});

const CLIENTA = { id: 'clienta-oferta-1', nombre: 'Clienta Oferta', email: 'oferta@ejemplo.test', rol: 'cliente' };

function conSesion(id = CLIENTA.id): void {
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = { ...CLIENTA, id };
}

function rutas(pendiente: boolean, extra: Record<string, Manejador> = {}): Record<string, Manejador> {
  return {
    [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(false, pendiente),
    [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
    [`POST ${RUTA_SENSIBLES}`]: () => respuestaAutorizada(),
    ...extra,
  };
}

function Arbol({ habilitada }: { habilitada: boolean }) {
  return (
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <OfertaDatosSensibles habilitada={habilitada} />
    </SafeAreaProvider>
  );
}

async function montar(habilitada = true) {
  const vista = await render(<Arbol habilitada={habilitada} />);
  return vista;
}

/** Deja correr las promesas pendientes. */
async function asentar(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

const consultas = (llamadas: Llamada[]) => llamadasA(llamadas, 'GET', RUTA_SENSIBLES).length;

beforeEach(() => {
  mockFase = 'listo';
  reiniciarSimulaciones();
  reiniciarOfertaDatosSensibles();
  conSesion();
});

afterEach(async () => {
  await cleanup();
});

describe('Oferta de autorizar las alergias al iniciar sesión', () => {
  it('con alergias pendientes y la fase lista, ofrece autorizar y "Leer y autorizar" abre el texto', async () => {
    const llamadas = simular(rutas(true));
    await montar();

    expect(await screen.findByText(TITULO)).toBeOnTheScreen();
    expect(screen.getByText(obtenerTexto('datosSensibles.app.ofertaTexto'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: LEER }));

    expect(await screen.findByText(PARRAFO_1)).toBeOnTheScreen();
    const casilla = screen.getByRole('checkbox', { name: CASILLA });
    expect(casilla).not.toBeChecked();
    expect(screen.getByRole('button', { name: AUTORIZO })).toBeDisabled();
    await fireEvent.press(casilla);
    await fireEvent.press(screen.getByRole('button', { name: AUTORIZO }));

    await waitFor(() => expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(1));
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)[0].cuerpo).toEqual({
      version: '1.0',
      hash: HASH_SENSIBLES,
      rutaOrigen: '/inicio',
    });
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: CASILLA })).not.toBeOnTheScreen());
    expect(screen.queryByText(TITULO)).not.toBeOnTheScreen();
    expect(consultas(llamadas)).toBe(1);
  });

  it('con documentos legales pendientes no consulta ni ofrece; sale cuando la fase queda lista', async () => {
    mockFase = 'pendientes';
    const llamadas = simular(rutas(true));
    const vista = await montar();
    await asentar();
    expect(consultas(llamadas)).toBe(0);
    expect(screen.queryByText(TITULO)).not.toBeOnTheScreen();

    mockFase = 'listo';
    await vista.rerender(<Arbol habilitada />);
    expect(await screen.findByText(TITULO)).toBeOnTheScreen();
  });

  it.each<FaseReaceptacion>(['consultando', 'fallido', 'inactivo'])('con la fase %s no consulta', async (fase) => {
    mockFase = fase;
    const llamadas = simular(rutas(true));
    await montar();
    await asentar();
    expect(consultas(llamadas)).toBe(0);
  });

  it('sin habilitar (la intro sigue a la vista) no consulta; al habilitarse sí', async () => {
    const llamadas = simular(rutas(true));
    const vista = await montar(false);
    await asentar();
    expect(consultas(llamadas)).toBe(0);

    await vista.rerender(<Arbol habilitada />);
    expect(await screen.findByText(TITULO)).toBeOnTheScreen();
  });

  it('sin sesión no consulta', async () => {
    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    const llamadas = simular(rutas(true));
    await montar();
    await asentar();
    expect(consultas(llamadas)).toBe(0);
  });

  it('sin alergias pendientes no ofrece nada ni vuelve a consultar en la sesión', async () => {
    const llamadas = simular(rutas(false));
    const vista = await montar();
    await waitFor(() => expect(consultas(llamadas)).toBe(1));
    expect(screen.queryByText(TITULO)).not.toBeOnTheScreen();

    await vista.unmount();
    await montar();
    await asentar();
    expect(consultas(llamadas)).toBe(1);
  });

  it('"Ahora no" la cierra y no se repite en la misma sesión; tras cerrar sesión vuelve a ofrecerse', async () => {
    const llamadas = simular(rutas(true));
    const vista = await montar();
    await fireEvent.press(await screen.findByRole('button', { name: AHORA_NO }));
    await waitFor(() => expect(screen.queryByText(TITULO)).not.toBeOnTheScreen());

    await vista.unmount();
    const otra = await montar();
    await asentar();
    expect(screen.queryByText(TITULO)).not.toBeOnTheScreen();
    expect(consultas(llamadas)).toBe(1);
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(0);

    // Cerrar sesión olvida la memoria: el siguiente inicio de sesión vuelve a consultar.
    avisarCierreSesion('salida');
    await otra.unmount();
    await montar();
    expect(await screen.findByText(TITULO)).toBeOnTheScreen();
    expect(consultas(llamadas)).toBe(2);
  });

  it('"Ahora no" en la hoja del texto también termina la oferta de la sesión', async () => {
    const llamadas = simular(rutas(true));
    await montar();
    await fireEvent.press(await screen.findByRole('button', { name: LEER }));
    expect(await screen.findByText(PARRAFO_1)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: AHORA_NO }));
    await waitFor(() => expect(screen.queryByText(PARRAFO_1)).not.toBeOnTheScreen());
    expect(screen.queryByText(TITULO)).not.toBeOnTheScreen();
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(0);
  });

  it('si la consulta falla no muestra nada ni bloquea; en la siguiente fase lista se reintenta', async () => {
    let falla = true;
    const llamadas = simular(
      rutas(true, {
        [`GET ${RUTA_SENSIBLES}`]: () => {
          if (falla) {
            throw new TypeError('Network request failed');
          }
          return respuestaEstadoSensibles(false, true);
        },
      }),
    );
    const vista = await montar();
    await waitFor(() => expect(consultas(llamadas)).toBe(1));
    await asentar();
    expect(screen.queryByText(TITULO)).not.toBeOnTheScreen();

    // La re-aceptación vuelve a consultar (por ejemplo, al regresar a primer plano): fase y de nuevo lista.
    falla = false;
    mockFase = 'consultando';
    await vista.rerender(<Arbol habilitada />);
    mockFase = 'listo';
    await vista.rerender(<Arbol habilitada />);
    expect(await screen.findByText(TITULO)).toBeOnTheScreen();
    expect(consultas(llamadas)).toBe(2);
  });

  it('si la sesión cambia con la hoja abierta, se cierra sin autorizar', async () => {
    const llamadas = simular(rutas(true));
    const vista = await montar();
    await fireEvent.press(await screen.findByRole('button', { name: LEER }));
    expect(await screen.findByText(PARRAFO_1)).toBeOnTheScreen();

    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    await vista.rerender(<Arbol habilitada />);
    await waitFor(() => expect(screen.queryByText(PARRAFO_1)).not.toBeOnTheScreen());
    expect(screen.queryByText(TITULO)).not.toBeOnTheScreen();
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(0);
  });

  it('otra clienta en el mismo teléfono tiene su propia oferta', async () => {
    const llamadas = simular(rutas(true));
    const vista = await montar();
    await fireEvent.press(await screen.findByRole('button', { name: AHORA_NO }));
    await waitFor(() => expect(screen.queryByText(TITULO)).not.toBeOnTheScreen());

    conSesion('clienta-oferta-2');
    await vista.rerender(<Arbol habilitada />);
    expect(await screen.findByText(TITULO)).toBeOnTheScreen();
    expect(consultas(llamadas)).toBe(2);
  });
});
