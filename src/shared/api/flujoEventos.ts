import { fetch as fetchExpo } from 'expo/fetch';

import { getBaseUrl } from './apiClient';

/**
 * Flujo de eventos del servidor (SSE) con sesión. Toda petición de red de la app vive en
 * src/shared/api; las features que necesitan un flujo en vivo (por ejemplo, los avisos internos de
 * GP-07.2) lo abren con esta función y no tocan fetch.
 *
 * Usa el fetch de expo/fetch, que entrega el cuerpo por trozos (el fetch global de React Native lo
 * junta completo y un flujo nunca termina). No renueva la sesión ni reintenta: quien la llama lee
 * el status (por ejemplo, un 401) y decide.
 */

/**
 * GET `${getBaseUrl()}${ruta}` con Accept: text/event-stream. `ruta` empieza con '/' y no lleva
 * datos de sesión: el token va SOLO en el encabezado Authorization, nunca en la URL (quedaría en
 * los registros del servidor y de los proxies). `signal` corta la petición y el flujo ya abierto.
 * Devuelve la respuesta tal cual, sin leer el cuerpo; rechaza si no hay red o se aborta.
 */
export function abrirFlujoEventos(ruta: string, token: string, signal: AbortSignal) {
  return fetchExpo(`${getBaseUrl()}${ruta}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
    signal,
  });
}
