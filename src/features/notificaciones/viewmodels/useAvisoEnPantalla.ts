import { usePathname, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { duracion } from '@/shared/ui/tokens';

import type { Aviso } from '../models/avisoModel';

import { alLlegarAviso, marcarLeido } from './avisosEstado';

// El componente no importa de models/: recibe el tipo de aquí.
export type { Aviso } from '../models/avisoModel';

/** La bandeja: ahí el aviso nuevo ya se ve en la lista y no hace falta mostrarlo encima. */
export const RUTA_BANDEJA = '/notificaciones';

export interface AvisoEnPantallaViewModel {
  /** El aviso a la vista, o null si no hay ninguno. */
  aviso: Aviso | null;
  /** Lo marca como leído, lo quita y abre su destino (o la bandeja si no tiene). */
  abrir: () => void;
}

/**
 * Aviso en pantalla (GP-07.2): cada aviso nuevo que llega en vivo (alLlegarAviso) se muestra
 * durante duracion.avisoEnPantalla; si llega otro antes, lo reemplaza y el tiempo vuelve a empezar.
 * No se muestra con la clienta en la bandeja y se quita si entra a ella. Al desmontar se quitan el
 * oyente y el temporizador.
 */
export function useAvisoEnPantalla(): AvisoEnPantallaViewModel {
  const router = useRouter();
  const pathname = usePathname();
  const enBandeja = pathname === RUTA_BANDEJA;
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El oyente se registra una sola vez y lee la ruta actual de aquí.
  const enBandejaActual = useRef(enBandeja);

  const detenerTemporizador = useCallback(() => {
    if (temporizador.current !== null) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  }, []);

  const quitar = useCallback(() => {
    detenerTemporizador();
    setAviso(null);
  }, [detenerTemporizador]);

  useEffect(() => {
    enBandejaActual.current = enBandeja;
    if (enBandeja) {
      quitar();
    }
  }, [enBandeja, quitar]);

  useEffect(() => {
    const quitarOyente = alLlegarAviso((nuevo) => {
      if (enBandejaActual.current) {
        return;
      }
      detenerTemporizador();
      setAviso(nuevo);
      temporizador.current = setTimeout(() => {
        temporizador.current = null;
        setAviso(null);
      }, duracion.avisoEnPantalla);
    });
    return () => {
      quitarOyente();
      detenerTemporizador();
    };
  }, [detenerTemporizador]);

  const abrir = useCallback(() => {
    if (!aviso) {
      return;
    }
    quitar();
    // Si falla, el aviso vuelve a quedar sin leer en la bandeja; aquí no hay dónde avisarlo.
    marcarLeido(aviso.id).catch(() => undefined);
    router.push((aviso.destino ?? RUTA_BANDEJA) as Href);
  }, [aviso, quitar, router]);

  return { aviso, abrir };
}
