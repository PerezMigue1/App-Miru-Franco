/**
 * Estado de la conexión con el salón (GP-09), sin depender de React: patrón Observer. Render (plan
 * gratis) duerme el servidor a los 15 minutos sin uso y la primera petición tarda de 30 a 60 s en
 * despertarlo. Mientras alguna petición de apiClient lleve más de ESPERA_LENTA_MS sin respuesta, la
 * conexión está lenta y la raíz pinta "Conectando con el salón…" (nunca "Sin conexión": ese texto
 * sale solo con un ErrorDeRed de motivo 'sinRed').
 *
 * Solo cuenta apiClient (fetchWithTimeout): el flujo en vivo de avisos (flujoEventos.ts) queda
 * abierto a propósito y la subida de fotos (subirMultipart.ts) va a otro servidor.
 */

/** Una petición sin respuesta después de este tiempo cuenta como lenta. */
export const ESPERA_LENTA_MS = 3000;

/** Peticiones que ya pasaron ESPERA_LENTA_MS y siguen sin respuesta. */
let lentas = 0;
const oyentes = new Set<() => void>();

/** Llama a cada oyente; uno que falla no impide avisar a los demás. */
function avisar(): void {
  for (const oyente of [...oyentes]) {
    try {
      oyente();
    } catch {
      // Se sigue con los demás.
    }
  }
}

/**
 * Registra una petición que acaba de salir. Devuelve la función que la da por terminada (con
 * respuesta, error o abort); llamarla más de una vez no descuenta de más.
 */
export function registrarPeticion(): () => void {
  let lenta = false;
  let terminada = false;
  const temporizador = setTimeout(() => {
    lenta = true;
    lentas += 1;
    if (lentas === 1) {
      avisar();
    }
  }, ESPERA_LENTA_MS);
  return () => {
    if (terminada) {
      return;
    }
    terminada = true;
    clearTimeout(temporizador);
    if (lenta) {
      lentas -= 1;
      if (lentas === 0) {
        avisar();
      }
    }
  };
}

/** true mientras quede al menos una petición de apiClient con más de ESPERA_LENTA_MS sin respuesta. */
export function conexionLenta(): boolean {
  return lentas > 0;
}

/** Registra un oyente de los cambios (lenta o ya no). Devuelve cómo quitarlo. */
export function suscribirConexion(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Solo para pruebas: olvida las peticiones lentas (sin avisar a nadie). */
export function reiniciarEstadoConexion(): void {
  lentas = 0;
}
