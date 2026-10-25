import { usePathname } from 'expo-router';
import { useEffect } from 'react';

import { reanudarAvisos } from './useAvisosEnVivo';

/**
 * Para la raíz (src/app/_layout.tsx), GP-09: el servidor cierra el flujo de avisos tras 30 minutos
 * sin avisos (evento 'cierre') y la app no reconecta sola, sino cuando la clienta vuelve a usarla.
 * Este hook reanuda en cada cambio de pantalla y devuelve el manejador del toque, que la raíz pone
 * en onTouchStart de su contenedor (no captura ni bloquea toques: solo se entera de ellos). El
 * regreso a primer plano ya lo atiende useAvisosEnVivo. Toda la decisión (en pausa o no, con sesión
 * o no) vive en la conexión: aquí solo se conectan los eventos.
 */
export function useReanudarAvisos(): () => void {
  const pantalla = usePathname();
  useEffect(() => {
    reanudarAvisos();
  }, [pantalla]);
  return reanudarAvisos;
}
