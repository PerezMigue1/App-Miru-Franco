/// <reference types="jest" />

import * as SecureStore from 'expo-secure-store';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { limpiarAvisos } from '@/features/notificaciones/viewmodels/avisosEstado';

import { avisoCrudo, RUTA_AVISOS, rutasAvisos } from './avisosFicticios';
import { AHORA, citaCruda, CLIENTA_CITAS, cuerpoCita, rutaCita } from './citasFicticias';
import { RUTAS_DE_FONDO } from './datosClienta';
import { abrirApp, cerrarIntroSiAparece, prepararPruebasDePantalla, type App } from './pantallas';
import { esperarRuta } from './pantallasReserva';
import { sembrarSesion, type SesionSembrada } from './sesionGuardada';
import { API, llamadasA, respuesta, servidorConRutas, type Llamada, type Manejador } from './servidorSimulado';
import { abrirFlujo, reiniciarFlujos, type FlujoSimulado, type LlamadaFlujo } from './streamSimulado';
import { cuerpoPedido, pedidoCrudo, rutaPedido } from './tiendaFicticia';

/**
 * Pasos comunes de las pruebas de integración de GP-07.2 (avisos internos) con las pantallas reales:
 * abrir la app con la sesión de CLIENTA_CITAS, el reloj en AHORA, el servidor simulado con los avisos
 * ficticios y el flujo en vivo simulado (streamSimulado), leer la campana y su contador, abrir la
 * bandeja y avisar a los oyentes de AppState. Ningún dato es real y nada sale a la red.
 */

/** Ruta del flujo en vivo, completa, como la pide expo/fetch. */
export const URL_FLUJO = `${API}/api/notificaciones/stream`;

/** Id de la cita y del pedido a los que apuntan AVISO_CITA y AVISO_PEDIDO. */
export const ID_CITA_AVISO = 12;
export const ID_PEDIDO_AVISO = 7;

/** Aviso que llega en vivo: el recordatorio de la cita 12, sin leer. */
export const AVISO_EN_VIVO = avisoCrudo({
  id: '00000000-0000-4000-8000-000000000004',
  tipo: 'recordatorio_cita',
  titulo: 'Recordatorio: tu cita es mañana',
  mensaje: 'Te esperamos a las 11:00.',
  creadoEn: '2026-10-19T15:59:00.000Z',
  entidadTipo: 'cita',
  entidadId: ID_CITA_AVISO,
  urlAccion: '/cliente/servicios-citas/mis-citas/12',
});

/** `cuantos` avisos generales sin leer, con UUID ficticios distintos. */
export function avisosSinLeer(cuantos: number): Record<string, unknown>[] {
  return Array.from({ length: cuantos }, (_, i) =>
    avisoCrudo({
      id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
      titulo: `Aviso ficticio ${i + 1}`,
    }),
  );
}

/**
 * Lo que piden las pantallas con sesión, más el detalle de la cita 12 y del pedido 7 (los destinos
 * de los avisos) y el cierre de sesión.
 */
export const simularServidorAvisos = servidorConRutas({
  ...RUTAS_DE_FONDO,
  [rutaCita(ID_CITA_AVISO)]: () => respuesta(cuerpoCita(citaCruda({ id: ID_CITA_AVISO }))),
  [rutaPedido(ID_PEDIDO_AVISO)]: () => respuesta(cuerpoPedido(pedidoCrudo({ id: ID_PEDIDO_AVISO }))),
  'POST /api/auth/logout': () => respuesta({ success: true }),
});

/**
 * Registra lo de cada prueba de avisos (va dentro del describe): olvida los flujos y vacía el estado
 * compartido de avisos antes de cada prueba, y lo de prepararPruebasDePantalla (desmontar con
 * cerrarRouter, volver a los temporizadores reales y revisar la consola).
 */
export function prepararPruebasAvisos(): () => void {
  beforeEach(() => {
    reiniciarFlujos();
    limpiarAvisos();
  });
  return prepararPruebasDePantalla();
}

export interface OpcionesAvisos {
  /** Avisos de GET /api/notificaciones (por omisión, AVISOS_FICTICIOS). */
  lista?: readonly Record<string, unknown>[];
  /** Rutas de la prueba, encima de las de avisos y las de fondo. */
  rutas?: Record<string, Manejador>;
  /** Encola las respuestas del flujo en vivo; por omisión, un flujo que abre bien. */
  flujo?: () => Promise<FlujoSimulado>;
}

export interface PantallaAvisos {
  app: App;
  /** Peticiones que recibió el servidor simulado (se van agregando durante la prueba). */
  llamadas: Llamada[];
  sesion: SesionSembrada;
  /** Llega cuando la app abre el flujo encolado. */
  flujo: Promise<FlujoSimulado>;
  /** Cuántos oyentes de AppState había al abrir: los de esta prueba van después. */
  oyentesPrevios: number;
}

function oyentesAppState(): jest.Mock {
  return AppState.addEventListener as unknown as jest.Mock;
}

/**
 * Abre la app real en la ruta con el reloj en AHORA, la sesión de CLIENTA_CITAS, el servidor con los
 * avisos y el flujo en vivo encolado. Cierra la intro de la grieta si aparece.
 */
export async function abrirConAvisos(ruta = '/', opciones: OpcionesAvisos = {}): Promise<PantallaAvisos> {
  jest.useFakeTimers({ now: AHORA });
  const sesion = await sembrarSesion(CLIENTA_CITAS);
  // El servidor también conoce AVISO_EN_VIVO (lo puede marcar y borrar), aunque la lista no lo trae.
  const llamadas = simularServidorAvisos({
    ...rutasAvisos([AVISO_EN_VIVO]),
    ...rutasAvisos(opciones.lista),
    ...opciones.rutas,
  });
  const flujo = (opciones.flujo ?? abrirFlujo)();
  const oyentesPrevios = oyentesAppState().mock.calls.length;
  const app = await abrirApp(ruta);
  await cerrarIntroSiAparece();
  return { app, llamadas, sesion, flujo, oyentesPrevios };
}

/** Abre la app real en la ruta sin sesión (la bienvenida ya vista), con el servidor de los avisos. */
export async function abrirSinSesionConAvisos(ruta = '/'): Promise<{ app: App; llamadas: Llamada[] }> {
  jest.useFakeTimers({ now: AHORA });
  await SecureStore.setItemAsync('bienvenida_vista', '1');
  const llamadas = simularServidorAvisos(rutasAvisos());
  const app = await abrirApp(ruta);
  await cerrarIntroSiAparece();
  return { app, llamadas };
}

/** Espera a que la app abra el flujo encolado y lo entrega. */
export async function esperarFlujo(flujo: Promise<FlujoSimulado>): Promise<FlujoSimulado> {
  let abierto: FlujoSimulado | undefined;
  void flujo.then((recibido) => {
    abierto = recibido;
  });
  await waitFor(() => expect(abierto).toBeDefined());
  return abierto as FlujoSimulado;
}

/**
 * Deja correr las promesas pendientes (la lectura del flujo y lo que dispara). Con los temporizadores
 * falsos de renderRouter setImmediate también es falso, así que aquí no sirve vaciar().
 */
async function correrPromesas(vueltas = 20): Promise<void> {
  for (let i = 0; i < vueltas; i++) {
    await Promise.resolve();
  }
}

/** Lo que manda el servidor por el flujo (un aviso, un keep-alive...), dentro de act. */
export async function enVivo(accion: () => void): Promise<void> {
  await act(async () => {
    accion();
    await correrPromesas();
  });
}

/** Peticiones GET /api/notificaciones que recibió el servidor. */
export function pedidasDeLista(llamadas: Llamada[]): Llamada[] {
  return llamadasA(llamadas, 'GET', RUTA_AVISOS);
}

/** La petición del flujo: GET a la ruta sin datos de sesión y el token solo en Authorization. */
export function revisarPeticionFlujo(llamada: LlamadaFlujo, token: string): void {
  expect(llamada.url).toBe(URL_FLUJO);
  expect(llamada.metodo).toBe('GET');
  expect(llamada.cabeceras).toEqual({ Authorization: `Bearer ${token}`, Accept: 'text/event-stream' });
  expect(llamada.url).not.toContain(token);
}

/**
 * Espera la campana con esa etiqueta y revisa la cifra de su contador (oculta a TalkBack: el número
 * se lee en la etiqueta). Sin `cifra`, la campana no muestra ningún número.
 */
export async function esperarCampana(etiqueta: string, cifra?: string): Promise<void> {
  const campana = await screen.findByRole('button', { name: etiqueta });
  const numeros = within(campana).queryAllByText(/^\d+\+?$/, { includeHiddenElements: true });
  expect(numeros.map((numero) => numero.props.children)).toEqual(cifra === undefined ? [] : [cifra]);
}

/** Toca la campana con esa etiqueta y espera la bandeja. */
export async function abrirBandeja(app: App, etiqueta: string): Promise<void> {
  await fireEvent.press(await screen.findByRole('button', { name: etiqueta }));
  await esperarRuta(app, '/notificaciones');
  expect(await screen.findByRole('button', { name: 'Marcar todas como leídas' })).toBeOnTheScreen();
}

/** Desde la bandeja (o una pantalla encima de ella) regresa a Inicio con "Volver". */
export async function volverAInicio(app: App): Promise<void> {
  while (app.getPathname() !== '/inicio') {
    const antes = app.getPathname();
    const volver = screen.getAllByRole('button', { name: 'Volver' });
    await fireEvent.press(volver[volver.length - 1]);
    await waitFor(() => expect(app.getPathname()).not.toBe(antes));
  }
}

/** Botón de la fila de ese aviso sin leer en la bandeja. */
export function filaSinLeer(titulo: string): Promise<ReturnType<typeof screen.getByRole>> {
  return screen.findByRole('button', { name: new RegExp(`^No leído\\. ${titulo}\\.`) });
}

/** Avisa a los oyentes de AppState registrados desde `desde` que la app cambió a `estado`. */
export async function cambiarAppState(desde: number, estado: AppStateStatus): Promise<void> {
  const oyentes = oyentesAppState()
    .mock.calls.slice(desde)
    .filter(([evento]) => evento === 'change')
    .map(([, oyente]) => oyente as (siguiente: AppStateStatus) => void);
  expect(oyentes.length).toBeGreaterThan(0);
  await act(async () => {
    for (const oyente of oyentes) {
      oyente(estado);
    }
    await correrPromesas();
  });
}
