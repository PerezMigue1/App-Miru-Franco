/// <reference types="jest" />

/**
 * Control del expo/fetch simulado de test/setup.ts para el flujo en vivo de avisos (GP-07.2). Sirve
 * a pruebas unitarias y de integración. Nunca sale a la red: cada respuesta se arma aquí.
 *
 * Las respuestas se encolan en orden (una por petición). Cuando la cola se acaba, la petición queda
 * pendiente hasta que se aborta, como en setup.ts. Un flujo abierto es un ReadableStream que la
 * prueba controla (enviar un aviso, un keep-alive, texto o bytes sueltos, cortar) y que se cierra
 * con error al abortar su signal.
 */

const encoder = new TextEncoder();

interface ExpoFetchSimulado {
  fetch: jest.Mock;
}

function fetchSimulado(): jest.Mock {
  return jest.requireMock<ExpoFetchSimulado>('expo/fetch').fetch;
}

interface InitFetch {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal | null;
}

export interface LlamadaFlujo {
  url: string;
  metodo: string;
  cabeceras: Record<string, string>;
}

export interface FlujoSimulado {
  /** Un aviso como lo manda el backend: "id: 0", "event: notificacion" y la fila en JSON. */
  enviarAviso(fila: unknown): void;
  /** El keep-alive que el backend manda cada 28 s. */
  enviarKeepAlive(): void;
  /** Tras 30 min sin avisos el backend manda "event: cierre" y termina el flujo (GP-09). */
  enviarCierre(): void;
  /** Texto tal cual (para cortes a mitad de línea o formatos raros). */
  enviarTexto(texto: string): void;
  enviarBytes(bytes: Uint8Array): void;
  /** El servidor cierra el flujo (fin normal del cuerpo). */
  cortar(): void;
  /** Se cayó la red a mitad del flujo. */
  fallar(): void;
  /** true mientras el flujo no se cerró, no falló y su signal no se abortó. */
  vivo(): boolean;
}

const flujos: FlujoSimulado[] = [];

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function crearFlujo(signal: AbortSignal | null | undefined): { flujo: FlujoSimulado; cuerpo: ReadableStream<Uint8Array> } {
  let control!: ReadableStreamDefaultController<Uint8Array>;
  let abierto = true;
  const cuerpo = new ReadableStream<Uint8Array>({
    start(controlador) {
      control = controlador;
    },
    cancel() {
      abierto = false;
    },
  });
  const cerrarCon = (accion: () => void) => {
    if (abierto) {
      abierto = false;
      accion();
    }
  };
  signal?.addEventListener('abort', () => cerrarCon(() => control.error(abortError())), { once: true });
  const enviarBytes = (bytes: Uint8Array) => {
    if (abierto) {
      control.enqueue(bytes);
    }
  };
  const enviarTexto = (texto: string) => enviarBytes(encoder.encode(texto));
  const flujo: FlujoSimulado = {
    enviarAviso: (fila) => enviarTexto(`id: 0\nevent: notificacion\ndata: ${JSON.stringify(fila)}\n\n`),
    enviarKeepAlive: () => enviarTexto('id: 0\nevent: keep-alive\ndata: \n\n'),
    enviarCierre: () => {
      enviarTexto('id: 0\nevent: cierre\ndata: {"motivo":"inactividad"}\n\n');
      cerrarCon(() => control.close());
    },
    enviarTexto,
    enviarBytes,
    cortar: () => cerrarCon(() => control.close()),
    fallar: () => cerrarCon(() => control.error(new TypeError('Network request failed'))),
    vivo: () => abierto,
  };
  return { flujo, cuerpo };
}

function respuestaBase(
  status: number,
  tipo: string,
  cuerpo: ReadableStream<Uint8Array> | null,
  encabezados: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'Content-Type': tipo, ...encabezados }),
    body: cuerpo,
  };
}

/**
 * Encola una respuesta 200 text/event-stream con un flujo controlable. El flujo se entrega por la
 * promesa cuando la app hace la petición.
 */
export function abrirFlujo(): Promise<FlujoSimulado> {
  return new Promise((resolver) => {
    fetchSimulado().mockImplementationOnce((_url: string, init?: InitFetch) => {
      if (init?.signal?.aborted) {
        return Promise.reject(abortError());
      }
      const { flujo, cuerpo } = crearFlujo(init?.signal);
      flujos.push(flujo);
      resolver(flujo);
      return Promise.resolve(respuestaBase(200, 'text/event-stream', cuerpo));
    });
  });
}

/**
 * Encola una respuesta sin flujo con ese status (por ejemplo 401 o 500) y, si hacen falta, otros
 * encabezados (por ejemplo { 'Retry-After': '45' } en un 429).
 */
export function responderEstado(status: number, tipo = 'application/json', encabezados: Record<string, string> = {}): void {
  fetchSimulado().mockImplementationOnce(() => Promise.resolve(respuestaBase(status, tipo, null, encabezados)));
}

/** Encola un error de red; con `siempre`, todas las peticiones que sigan fallan igual. */
export function fallarRed(siempre = false): void {
  const fallo = () => Promise.reject(new TypeError('Network request failed'));
  if (siempre) {
    fetchSimulado().mockImplementation(fallo);
  } else {
    fetchSimulado().mockImplementationOnce(fallo);
  }
}

/** Peticiones que recibió expo/fetch, en orden. */
export function llamadasFlujo(): LlamadaFlujo[] {
  return (fetchSimulado().mock.calls as [string, InitFetch | undefined][]).map(([url, init]) => ({
    url,
    metodo: init?.method ?? 'GET',
    cabeceras: init?.headers ?? {},
  }));
}

/** Flujos abiertos en esta prueba que siguen vivos (nunca debería haber más de uno). */
export function flujosVivos(): number {
  return flujos.filter((flujo) => flujo.vivo()).length;
}

/** Olvida los flujos de la prueba anterior. Llamarlo en beforeEach. */
export function reiniciarFlujos(): void {
  flujos.length = 0;
}

/**
 * Deja correr promesas y lecturas del flujo con setImmediate real (las pruebas con temporizadores
 * falsos no fingen setImmediate, nextTick ni queueMicrotask).
 */
export async function vaciar(vueltas = 8): Promise<void> {
  for (let i = 0; i < vueltas; i++) {
    await new Promise<void>((resolver) => {
      setImmediate(resolver);
    });
  }
}
