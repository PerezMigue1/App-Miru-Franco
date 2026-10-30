import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Abre una pantalla encima (router.push) sin que un doble toque abra dos: después de la primera,
 * las siguientes se ignoran hasta que la pantalla que la abrió vuelve a enfocarse.
 */
export function useAbrirUnaVez(): (destino: Href) => void {
  const router = useRouter();
  const navegando = useRef(false);

  useFocusEffect(
    useCallback(() => {
      navegando.current = false;
    }, []),
  );

  return useCallback(
    (destino: Href) => {
      if (navegando.current) {
        return;
      }
      navegando.current = true;
      router.push(destino);
    },
    [router],
  );
}
