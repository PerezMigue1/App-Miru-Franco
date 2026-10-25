import { useCallback, useEffect, useRef, useState } from 'react';

import { segundosDeLimite } from './mensajesError';
import { useTextos } from './useTextos';

/** Cada cuánto baja la cuenta de la espera. */
const TICK_MS = 1000;

export interface EsperaLimite {
  /** true mientras no pasa el tiempo que pidió el servidor: la acción queda deshabilitada. */
  activa: boolean;
  /** Segundos que faltan (0 sin espera). */
  restantes: number;
  /** "Intenta de nuevo en N s", del catálogo, mientras está activa; null si no. */
  texto: string | null;
  /** Arranca la espera de `segundos` (entero de 1 o más). Una más corta no acorta la que ya corre. */
  iniciar: (segundos: number) => void;
  /** Si el error es un 429, arranca la espera con sus segundos y devuelve true; si no, false. */
  esperarSiLimite: (error: unknown) => boolean;
  /** Quita la espera (por ejemplo, al cambiar de cuenta en el formulario). */
  detener: () => void;
}

/**
 * Espera por límite (GP-09): tras un 429 la acción no se repite antes de `retryAfter`. La pantalla
 * muestra el message del backend (mensajeParaClienta) y el botón queda deshabilitado con "Intenta
 * de nuevo en N s", que baja cada segundo; al terminar regresa a su texto normal. Cuenta contra el
 * reloj (Date.now), así un intervalo atrasado no alarga la espera. Al desmontar limpia su
 * temporizador.
 */
export function useEsperaLimite(): EsperaLimite {
  const texto = useTextos();
  const [restantes, setRestantes] = useState(0);
  const fin = useRef<number | null>(null);
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);

  const detener = useCallback(() => {
    if (intervalo.current !== null) {
      clearInterval(intervalo.current);
      intervalo.current = null;
    }
    fin.current = null;
    setRestantes(0);
  }, []);

  const iniciar = useCallback(
    (segundos: number) => {
      const enteros = Math.ceil(segundos);
      if (!Number.isFinite(enteros) || enteros < 1) {
        return;
      }
      const nuevoFin = Date.now() + enteros * TICK_MS;
      if (fin.current !== null && fin.current >= nuevoFin) {
        return;
      }
      fin.current = nuevoFin;
      setRestantes(enteros);
      intervalo.current ??= setInterval(() => {
        const quedan = fin.current === null ? 0 : Math.ceil((fin.current - Date.now()) / TICK_MS);
        if (quedan <= 0) {
          detener();
        } else {
          setRestantes(quedan);
        }
      }, TICK_MS);
    },
    [detener],
  );

  const esperarSiLimite = useCallback(
    (error: unknown) => {
      const segundos = segundosDeLimite(error);
      if (segundos === null) {
        return false;
      }
      iniciar(segundos);
      return true;
    },
    [iniciar],
  );

  useEffect(
    () => () => {
      if (intervalo.current !== null) {
        clearInterval(intervalo.current);
        intervalo.current = null;
      }
    },
    [],
  );

  const activa = restantes > 0;
  return {
    activa,
    restantes,
    texto: activa ? texto('errores.esperaLimite', { segundos: restantes }) : null,
    iniciar,
    esperarSiLimite,
    detener,
  };
}
