/// <reference types="jest" />

import { act, cleanup } from '@testing-library/react-native';
import { useEffect } from 'react';
import { BackHandler } from 'react-native';

import { leerLlamada, respuesta, type Llamada } from './servidorSimulado';

/**
 * Andamiaje para probar viewmodels con renderHook sin pantallas: expo-router y useAuth simulados,
 * un fetch por "MÉTODO /ruta" que también puede quedarse sin red o esperar, y el botón Atrás de
 * Android. Las fábricas se usan desde jest.mock con require (jest.mock se eleva en cada archivo).
 */

// ── expo-router ──────────────────────────────────────────────────────────────────────────────

/** Router simulado: las mismas funciones en cada render. */
export const routerSimulado = {
  push: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  dismissTo: jest.fn(),
};

/** Evento beforeRemove simulado: la acción que se iba a hacer y si la pantalla la detuvo. */
interface EventoAntesDeSalir {
  data: { action: unknown };
  preventDefault: () => void;
}

/** Oyentes de beforeRemove registrados con navigation.addListener. */
const oyentesAntesDeSalir = new Set<(evento: EventoAntesDeSalir) => void>();

/**
 * Parámetros de búsqueda y setParams de la navegación de la pantalla, más addListener('beforeRemove')
 * y dispatch para las pantallas que piden confirmar antes de salir.
 */
export const navegacionSimulada: {
  params: Record<string, string | undefined>;
  setParams: jest.Mock;
  addListener: jest.Mock;
  dispatch: jest.Mock;
} = {
  params: {},
  setParams: jest.fn(),
  addListener: jest.fn((evento: string, oyente: (e: EventoAntesDeSalir) => void) => {
    if (evento === 'beforeRemove') {
      oyentesAntesDeSalir.add(oyente);
    }
    return () => {
      oyentesAntesDeSalir.delete(oyente);
    };
  }),
  dispatch: jest.fn(),
};

/**
 * Simula que la pantalla se va a quitar (Volver, el Atrás de Android o un gesto) con `accion`. Devuelve
 * true si algún oyente la detuvo (preventDefault).
 */
export function intentarSalir(accion: unknown = { type: 'GO_BACK' }): boolean {
  let detenida = false;
  for (const oyente of [...oyentesAntesDeSalir]) {
    oyente({ data: { action: accion }, preventDefault: () => (detenida = true) });
  }
  return detenida;
}

/** Módulo expo-router simulado; la pantalla se da por enfocada mientras está montada. */
export function expoRouterSimulado() {
  return {
    useRouter: () => routerSimulado,
    useNavigation: () => navegacionSimulada,
    useLocalSearchParams: () => navegacionSimulada.params,
    useFocusEffect: (efecto: () => void | (() => void)) => {
      useEffect(() => efecto(), [efecto]);
    },
  };
}

// ── useAuth ──────────────────────────────────────────────────────────────────────────────────

export interface AuthSimulada {
  estado: 'cargando' | 'autenticado' | 'anonimo';
  usuario: { id: string; nombre: string; email: string; rol: string } | null;
  salir: jest.Mock<Promise<boolean>, []>;
  actualizarNombre: jest.Mock<void, [string, number]>;
  cerrarTrasCambioDeContrasena: jest.Mock<Promise<void>, []>;
  /** GP-09: cierre local tras desactivar o eliminar la cuenta, con su aviso para Acceso. */
  cerrarTrasBajaDeCuenta: jest.Mock<Promise<void>, [{ mensaje: string; folio: string | null }]>;
  avisoBaja: { mensaje: string; folio: string | null } | null;
  descartarAvisoBaja: jest.Mock<void, []>;
}

/** Lo que devuelve useAuth en cada render; la prueba lo cambia y vuelve a renderizar. */
export const authSimulada: AuthSimulada = {
  estado: 'anonimo',
  usuario: null,
  salir: jest.fn(() => Promise.resolve(true)),
  actualizarNombre: jest.fn(),
  cerrarTrasCambioDeContrasena: jest.fn(() => Promise.resolve()),
  cerrarTrasBajaDeCuenta: jest.fn((_aviso: { mensaje: string; folio: string | null }) => Promise.resolve()),
  avisoBaja: null,
  descartarAvisoBaja: jest.fn(),
};

/** Módulo useAuth simulado. */
export function useAuthSimulado() {
  return { useAuth: () => authSimulada };
}

/** Vuelve a dejar el router, la navegación y la sesión simulados como al inicio. */
export function reiniciarSimulaciones(): void {
  Object.values(routerSimulado).forEach((fn) => fn.mockClear());
  navegacionSimulada.params = {};
  navegacionSimulada.setParams.mockClear();
  navegacionSimulada.addListener.mockClear();
  navegacionSimulada.dispatch.mockClear();
  oyentesAntesDeSalir.clear();
  authSimulada.estado = 'anonimo';
  authSimulada.usuario = null;
  authSimulada.salir.mockReset();
  authSimulada.salir.mockImplementation(() => Promise.resolve(true));
  authSimulada.actualizarNombre.mockClear();
  authSimulada.cerrarTrasCambioDeContrasena.mockClear();
  authSimulada.cerrarTrasBajaDeCuenta.mockReset();
  authSimulada.cerrarTrasBajaDeCuenta.mockImplementation(() => Promise.resolve());
  authSimulada.avisoBaja = null;
  authSimulada.descartarAvisoBaja.mockClear();
}

// ── Servidor ─────────────────────────────────────────────────────────────────────────────────

/** Lo que responde una ruta: una respuesta ya lista o una promesa (sin red o diferida). */
export type Salida = Response | Promise<Response>;
export type ManejadorVm = (cuerpo: unknown) => Salida;

/** Petición recibida con el init original (para revisar un FormData). */
export interface LlamadaVm extends Llamada {
  init?: RequestInit;
}

/**
 * fetch simulado que responde por "MÉTODO /ruta" (o "MÉTODO url" fuera de la API). Lo demás es un
 * 404. Devuelve la lista de llamadas.
 */
export function servidorVm(rutas: Record<string, ManejadorVm>): LlamadaVm[] {
  const llamadas: LlamadaVm[] = [];
  globalThis.fetch = jest.fn((entrada: unknown, init?: RequestInit) => {
    const llamada: LlamadaVm = { ...leerLlamada(entrada, init), init };
    llamadas.push(llamada);
    const manejador = rutas[`${llamada.metodo} ${llamada.ruta}`];
    return Promise.resolve(manejador ? manejador(llamada.cuerpo) : respuesta({ message: 'No encontrado' }, 404));
  }) as unknown as typeof fetch;
  return llamadas;
}

/** Sin red: fetch rechaza como lo hace en el teléfono. */
export function sinRed(): Promise<Response> {
  return Promise.reject(new TypeError('Network request failed'));
}

/** Manejador que entrega una salida distinta en cada llamada; la última se repite. */
export function enSecuencia(...salidas: (() => Salida)[]): ManejadorVm {
  let vez = 0;
  return () => {
    const salida = salidas[Math.min(vez, salidas.length - 1)];
    vez += 1;
    return salida();
  };
}

/** Respuesta que la prueba suelta cuando quiere (para ver estados intermedios). */
export function diferida(): { promesa: Promise<Response>; soltar: (r: Response) => void } {
  let soltar: (r: Response) => void = () => undefined;
  const promesa = new Promise<Response>((resolver) => {
    soltar = resolver;
  });
  return { promesa, soltar };
}

/** Error del backend con su `code` (como lo arma NestJS). */
export function errorServidor(status: number, message?: string, code?: string): Response {
  return respuesta({ statusCode: status, ...(message ? { message } : {}), ...(code ? { code } : {}) }, status);
}

// ── Botón Atrás de Android ───────────────────────────────────────────────────────────────────

/** Espía de BackHandler: pulsar() simula el Atrás; restaurar() quita el espía. */
export function espiarAtras(): { pulsar: () => boolean; quitar: jest.Mock; restaurar: () => void } {
  let manejador: (() => boolean | null | undefined) | null = null;
  const quitar = jest.fn();
  const espia = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_evento, alPulsar) => {
    manejador = alPulsar as unknown as () => boolean | null | undefined;
    return { remove: quitar };
  });
  return {
    pulsar: () => Boolean(manejador?.()),
    quitar,
    restaurar: () => espia.mockRestore(),
  };
}

// ── Cierre ───────────────────────────────────────────────────────────────────────────────────

/** Desmonta, corre lo pendiente con los temporizadores falsos y vuelve a los reales (ver GP-02). */
export async function cerrarConTemporizadores(): Promise<void> {
  await cleanup();
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
}
