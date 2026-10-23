import { useRouter } from 'expo-router';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { obtenerConfiguracion, suscribir as suscribirConfiguracion } from '@/shared/api/configuracionPublica';
import {
  documentoEnMemoria,
  obtenerDocumentoVigente,
  rutaVisorDocumento,
  suscribir as suscribirDocumentos,
} from '@/shared/api/documentosLegales';

import {
  etiquetaCasillaPolitica,
  textoPoliticaAnticipos,
  type EtiquetaCasillaPolitica,
  type ReglasCita,
} from '../models/formaPagoModel';

export type { ReglasCita } from '../models/formaPagoModel';

/** Días de la política que usa la casilla (los de una cita o, sin ellos, los vigentes). */
export type ReglasPoliticaAnticipos = Pick<ReglasCita, 'diasHabilesExcepcionAnticipo' | 'diasHabilesCancelarConReembolso'>;

export interface CasillaPoliticaAnticiposVm {
  /** Resumen de la política con los días acotados como el backend. */
  resumen: string;
  /** Etiqueta de la casilla partida alrededor del enlace. */
  etiqueta: EtiquetaCasillaPolitica;
  /** "Versión 1.2" de la política vigente si ya está en memoria; null si no. */
  version: string | null;
  /** Abre el visor de la Política de anticipos. */
  abrirPolitica: () => void;
}

const documentoAnticipos = () => documentoEnMemoria('anticipos');

/**
 * Casilla de la Política de anticipos y cancelación: textos con las reglas (de la cita si las hay),
 * la versión vigente en memoria (se vuelve a pintar cuando llega) y la navegación al visor. Al
 * montarse precarga el documento para que la versión esté lista al aceptar.
 */
export function useCasillaPoliticaAnticipos(reglas?: ReglasPoliticaAnticipos): CasillaPoliticaAnticiposVm {
  const router = useRouter();
  const configuracion = useSyncExternalStore(suscribirConfiguracion, obtenerConfiguracion, obtenerConfiguracion);
  const documento = useSyncExternalStore(suscribirDocumentos, documentoAnticipos, documentoAnticipos);

  useEffect(() => {
    // obtenerDocumentoVigente nunca rechaza; el resultado llega por la suscripción.
    void obtenerDocumentoVigente('anticipos');
  }, []);

  const abrirPolitica = useCallback(() => {
    router.push(rutaVisorDocumento('anticipos'));
  }, [router]);

  return {
    resumen: textoPoliticaAnticipos(reglas, configuracion),
    etiqueta: etiquetaCasillaPolitica(configuracion),
    version: documento ? `Versión ${documento.version}` : null,
    abrirPolitica,
  };
}
