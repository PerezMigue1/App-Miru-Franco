/// <reference types="jest" />

import { leerLlamada, type Llamada } from './servidorSimulado';

/**
 * GP-09: piezas de las pruebas de límites y saturación: respuestas falsas con encabezados (Retry-After)
 * y un fetch que responde en orden o queda pendiente hasta que se aborta. Todo con datos ficticios en
 * http://api.test; nada sale a la red.
 */

/** Mensajes en español como los que manda el backend en un 429 y un 503 (rondas 6 y 7). */
export const MENSAJE_LIMITE = 'Hiciste demasiadas solicitudes. Intenta de nuevo en unos segundos.';
export const MENSAJE_BLOQUEO = 'Bloqueamos el acceso por unos minutos por varios intentos fallidos.';
export const MENSAJE_SATURACION = 'Hay mucha demanda, intenta de nuevo en unos segundos';

/** Respuesta con lo que lee apiClient (ok, status, text() y headers). */
export function respuestaCon(cuerpo: unknown, status = 200, encabezados: Record<string, string> = {}): Response {
  const texto = cuerpo === null ? '' : JSON.stringify(cuerpo);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'Content-Type': 'application/json', ...encabezados }),
    text: () => Promise.resolve(texto),
    json: () => Promise.resolve(cuerpo),
  } as unknown as Response;
}

/** 429 del backend con su message, su retryAfter en el cuerpo y el encabezado Retry-After. */
export function limite429(retryAfter = 30, code?: string, message = MENSAJE_LIMITE): Response {
  const cuerpo = { success: false, statusCode: 429, error: 'Too Many Requests', message, retryAfter, ...(code ? { code } : {}) };
  return respuestaCon(cuerpo, 429, { 'Retry-After': String(retryAfter) });
}

/** 503 por saturación con su message y el encabezado Retry-After (sin retryAfter en el cuerpo). */
export function saturacion503(retryAfter: number | null = 3, message = MENSAJE_SATURACION): Response {
  const encabezados: Record<string, string> = retryAfter === null ? {} : { 'Retry-After': String(retryAfter) };
  return respuestaCon({ success: false, statusCode: 503, error: 'Service Unavailable', message }, 503, encabezados);
}

/** Respuesta que nunca llega: solo rechaza (AbortError) cuando se aborta su señal. */
export function pendienteHastaAbortar(init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolver, rechazar) => {
    const signal = init?.signal;
    signal?.addEventListener('abort', () => rechazar(new DOMException('Aborted', 'AbortError')), { once: true });
  });
}

export type Respondedor = Response | 'pendiente' | 'sinRed' | ((llamada: Llamada) => Response | Promise<Response>);

/**
 * fetch que responde por "MÉTODO /ruta" con una fila de respuestas: cada llamada toma la siguiente y
 * la última se repite. 'pendiente' no responde hasta que se aborta y 'sinRed' rechaza. Devuelve las
 * llamadas para revisar qué se envió.
 */
export function servidorEnOrden(rutas: Record<string, Respondedor[]>): Llamada[] {
  const llamadas: Llamada[] = [];
  const usadas = new Map<string, number>();
  globalThis.fetch = jest.fn((entrada: unknown, init?: RequestInit) => {
    const llamada = leerLlamada(entrada, init);
    llamadas.push(llamada);
    const clave = `${llamada.metodo} ${llamada.ruta}`;
    const fila = rutas[clave];
    if (!fila || fila.length === 0) {
      return Promise.resolve(respuestaCon({ message: 'No encontrado' }, 404));
    }
    const indice = Math.min(usadas.get(clave) ?? 0, fila.length - 1);
    usadas.set(clave, indice + 1);
    const siguiente = fila[indice];
    if (siguiente === 'pendiente') {
      return pendienteHastaAbortar(init);
    }
    if (siguiente === 'sinRed') {
      return Promise.reject(new TypeError('Network request failed'));
    }
    return Promise.resolve(typeof siguiente === 'function' ? siguiente(llamada) : siguiente);
  }) as unknown as typeof fetch;
  return llamadas;
}

/** Cuántas llamadas hubo a "MÉTODO /ruta". */
export function vecesA(llamadas: Llamada[], metodo: string, ruta: string): number {
  return llamadas.filter((llamada) => llamada.metodo === metodo && llamada.ruta === ruta).length;
}
