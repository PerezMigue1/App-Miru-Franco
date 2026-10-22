import {
  crearErrorApi,
  renovarTrasRechazo,
  type ApiError,
  type ErrorDeRed,
  type ResultadoRenovacion,
} from '@/shared/api/apiClient';
import { abrirFlujoEventos } from '@/shared/api/flujoEventos';
import { getToken } from '@/shared/api/tokenStorage';

import { normalizarAviso, type Aviso } from './avisoModel';
import { crearLectorSse, type EventoSse } from './lectorSse';

/**
 * Conexión en vivo con GET /api/notificaciones/stream (SSE de NestJS con JwtAuthGuard), sin depender
 * de React para probarla con temporizadores falsos. useAvisosEnVivo solo la inicia y la detiene.
 *
 * - Abre con abrirFlujoEventos de src/shared/api/flujoEventos.ts (expo/fetch, que entrega el
 *   cuerpo por trozos) y el token SOLO en el encabezado Authorization; nunca en la URL.
 * - Un solo flujo a la vez: cada iniciar() o detener() cambia la generación y todo lo que venga de
 *   una generación anterior (token, respuesta, trozos, reintentos) se descarta.
 * - Corte del flujo o error de red: reconecta con espera creciente (1 s, 2 s, 4 s... tope 30 s),
 *   máximo MAX_REINTENTOS seguidos. Desde FALLOS_PARA_RESPALDO fallos seguidos consulta la lista
 *   cada INTERVALO_RESPALDO_MS hasta que el flujo vuelve a abrir.
 * - 401 al abrir: una sola renovación (renovarTrasRechazo, vuelo único de apiClient) y se reabre
 *   con el token nuevo. Si la sesión fue rechazada, o el token nuevo también recibe 401, se corta
 *   del todo: apiClient ya avisó de la sesión vencida.
 * - Los errores se clasifican con crearErrorApi solo para diagnóstico (ultimoError); nunca se
 *   muestran a la clienta.
 */

export const RUTA_FLUJO_AVISOS = '/api/notificaciones/stream';
export const ESPERA_BASE_MS = 1000;
export const ESPERA_MAX_MS = 30_000;
export const MAX_REINTENTOS = 8;
export const FALLOS_PARA_RESPALDO = 3;
export const INTERVALO_RESPALDO_MS = 30_000;

/** Espera antes del reintento número `fallos` (1, 2, 3...): 1 s, 2 s, 4 s... hasta 30 s. */
export function esperaReconexion(fallos: number): number {
  return Math.min(ESPERA_BASE_MS * 2 ** (Math.max(fallos, 1) - 1), ESPERA_MAX_MS);
}

/** Lo que la conexión lee de la respuesta de expo/fetch; también lo cumple una respuesta simulada. */
export interface RespuestaFlujo {
  ok: boolean;
  status: number;
  headers: { get(nombre: string): string | null };
  body: CuerpoFlujo | null;
}

export interface CuerpoFlujo {
  getReader(): LectorCuerpo;
}

export interface LectorCuerpo {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
}

export interface Temporizadores {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
}

export interface DepsConexionAvisos {
  /** Un aviso válido que llegó por el flujo. */
  alAviso: (aviso: Aviso) => void;
  /** Consulta de respaldo de la lista (por ejemplo, cargarAvisos). Si falla, no pasa nada. */
  consultar: () => unknown;
  /** Abre el flujo con el token; por omisión, abrirFlujoAvisos (abrirFlujoEventos de shared/api). */
  abrirFlujo?: (token: string, signal: AbortSignal) => Promise<RespuestaFlujo>;
  /** Token de la sesión guardada; por omisión, getToken de tokenStorage. */
  obtenerToken?: () => Promise<string | null>;
  /** Renovación tras un 401; por omisión, renovarTrasRechazo de apiClient. */
  renovar?: (token: string) => Promise<ResultadoRenovacion>;
  /** Por omisión, los temporizadores globales (los falsos de Jest en las pruebas). */
  temporizadores?: Temporizadores;
}

export interface ConexionAvisos {
  /** Abre el flujo si no hay uno; llamarla otra vez no abre otro. */
  iniciar(): void;
  /** Aborta el flujo y cancela reintentos y consultas de respaldo. */
  detener(): void;
  /** true entre iniciar() y detener() (o un corte definitivo). */
  activa(): boolean;
  /** Clasificación del último fallo (solo diagnóstico, nunca se muestra); null si no hubo. */
  ultimoError(): ApiError | ErrorDeRed | null;
}

/** GET /api/notificaciones/stream con abrirFlujoEventos: el token va solo en Authorization. */
export function abrirFlujoAvisos(token: string, signal: AbortSignal): Promise<RespuestaFlujo> {
  return abrirFlujoEventos(RUTA_FLUJO_AVISOS, token, signal);
}

/** Se leen al momento de usarlos, así los temporizadores falsos de Jest también aplican. */
const TEMPORIZADORES_GLOBALES: Temporizadores = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id as ReturnType<typeof setInterval>),
};

function esFlujoSse(respuesta: RespuestaFlujo): boolean {
  return respuesta.ok && respuesta.body !== null && (respuesta.headers.get('content-type') ?? '').includes('text/event-stream');
}

/** 'keep-alive' se ignora; 'notificacion' (o sin event) con JSON válido es un aviso. */
function avisoDeEvento({ evento, data }: EventoSse): Aviso | null {
  if (evento !== '' && evento !== 'notificacion') {
    return null;
  }
  try {
    return normalizarAviso(JSON.parse(data));
  } catch {
    return null;
  }
}

export function crearConexionAvisos(deps: DepsConexionAvisos): ConexionAvisos {
  const abrirFlujo = deps.abrirFlujo ?? abrirFlujoAvisos;
  const obtenerToken = deps.obtenerToken ?? getToken;
  const renovar = deps.renovar ?? renovarTrasRechazo;
  const t = deps.temporizadores ?? TEMPORIZADORES_GLOBALES;

  let generacion = 0;
  let encendida = false;
  let controlador: AbortController | null = null;
  let reintento: unknown = null;
  let respaldo: unknown = null;
  let fallos = 0;
  let error: ApiError | ErrorDeRed | null = null;

  const vigente = (gen: number) => encendida && gen === generacion;

  /** La consulta de respaldo nunca rompe la conexión: un error (aun síncrono) se descarta. */
  function consultarSinFallar(): void {
    Promise.resolve()
      .then(deps.consultar)
      .catch(() => undefined);
  }

  function detenerRespaldo(): void {
    if (respaldo !== null) {
      t.clearInterval(respaldo);
      respaldo = null;
    }
  }

  function apagar(): void {
    encendida = false;
    generacion += 1;
    if (reintento !== null) {
      t.clearTimeout(reintento);
      reintento = null;
    }
    detenerRespaldo();
    controlador?.abort();
    controlador = null;
  }

  function fallar(gen: number, causa: ApiError | ErrorDeRed): void {
    error = causa;
    fallos += 1;
    if (fallos >= FALLOS_PARA_RESPALDO && respaldo === null) {
      respaldo = t.setInterval(consultarSinFallar, INTERVALO_RESPALDO_MS);
    }
    if (fallos > MAX_REINTENTOS) {
      // Sin más reintentos: se queda la consulta de respaldo hasta detener() o un iniciar() nuevo.
      return;
    }
    reintento = t.setTimeout(() => {
      reintento = null;
      if (vigente(gen)) {
        void conectar(gen, false);
      }
    }, esperaReconexion(fallos));
  }

  function alEvento(gen: number, evento: EventoSse): void {
    if (!vigente(gen)) {
      return;
    }
    const aviso = avisoDeEvento(evento);
    if (!aviso) {
      return;
    }
    try {
      deps.alAviso(aviso);
    } catch {
      // Un oyente que falla no corta el flujo.
    }
  }

  async function leerFlujo(gen: number, cuerpo: CuerpoFlujo): Promise<void> {
    const lector = cuerpo.getReader();
    const decodificador = new TextDecoder();
    const sse = crearLectorSse((evento) => alEvento(gen, evento));
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) {
          break;
        }
        if (!vigente(gen)) {
          lector.cancel().catch(() => undefined);
          break;
        }
        sse.leer(decodificador.decode(value, { stream: true }));
      }
    } catch {
      // Corte de red o abort: lo decide quien llamó según la generación.
    } finally {
      sse.terminar();
    }
  }

  /** 401 al abrir: una sola renovación; con 'renovada' reabre, con 'rechazada' corta del todo. */
  async function trasRechazo(gen: number, token: string, yaRenovada: boolean): Promise<void> {
    if (yaRenovada) {
      apagar();
      return;
    }
    const resultado = await renovar(token);
    if (!vigente(gen)) {
      return;
    }
    if (resultado === 'renovada') {
      void conectar(gen, true);
      return;
    }
    if (resultado === 'rechazada') {
      apagar();
      return;
    }
    // 'fallida' o 'descartada': la sesión sigue; cuenta como fallo y se reintenta con espera.
    fallar(gen, crearErrorApi({ tipo: 'respuesta', status: 401, cuerpo: null }));
  }

  async function conectar(gen: number, yaRenovada: boolean): Promise<void> {
    const token = await obtenerToken().catch(() => null);
    if (!vigente(gen)) {
      return;
    }
    if (!token) {
      // Sin sesión no se abre nada; un iniciar() posterior lo vuelve a intentar.
      apagar();
      return;
    }
    const actual = new AbortController();
    controlador = actual;
    let respuesta: RespuestaFlujo;
    try {
      respuesta = await abrirFlujo(token, actual.signal);
    } catch {
      if (vigente(gen)) {
        fallar(gen, crearErrorApi({ tipo: 'red' }));
      }
      return;
    }
    if (!vigente(gen)) {
      respuesta.body?.getReader().cancel().catch(() => undefined);
      return;
    }
    if (respuesta.status === 401) {
      await trasRechazo(gen, token, yaRenovada);
      return;
    }
    if (!esFlujoSse(respuesta)) {
      fallar(gen, crearErrorApi({ tipo: 'respuesta', status: respuesta.status, cuerpo: null }));
      return;
    }
    const huboFallos = fallos > 0;
    fallos = 0;
    detenerRespaldo();
    if (huboFallos) {
      // Lo que llegó mientras no había flujo no se repite: una consulta pone al día la lista.
      consultarSinFallar();
    }
    await leerFlujo(gen, respuesta.body as CuerpoFlujo);
    if (vigente(gen)) {
      fallar(gen, crearErrorApi({ tipo: 'red' }));
    }
  }

  return {
    iniciar() {
      if (encendida) {
        return;
      }
      apagar();
      encendida = true;
      fallos = 0;
      void conectar(generacion, false);
    },
    detener() {
      apagar();
    },
    activa() {
      return encendida;
    },
    ultimoError() {
      return error;
    },
  };
}
