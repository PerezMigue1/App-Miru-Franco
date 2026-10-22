import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  documentoEnMemoria,
  suscribir as suscribirDocumentos,
  type DocumentoLegalVigente,
} from '@/shared/api/documentosLegales';

import { registrarAceptacionAnticipos } from '../models/gestionCitaModel';
import { textoFaltaPolitica, textoPoliticaActualizada } from '../models/formaPagoModel';

/** Resultado de aceptar: listo, o el motivo por el que no se puede seguir. */
export type ResultadoAceptacion =
  | { ok: true }
  /** mensaje null: falta marcar la casilla (el error ya se ve en la casilla). */
  | { ok: false; mensaje: string | null };

export interface AceptacionAnticipos {
  /** La casilla de la Política de anticipos y cancelación está marcada. */
  marcada: boolean;
  cambiar: (marcada: boolean) => void;
  /**
   * "Para continuar marca que leíste la Política..." si se intentó seguir sin marcarla, o el aviso de
   * que la política cambió y se desmarcó; null si no hay.
   */
  error: string | null;
  /**
   * Antes de pagar en línea o de cambiar a pago en el salón (como OpcionesAnticipo de la web): revisa
   * la casilla y registra el consentimiento con la versión de la política que la clienta tuvo a la
   * vista al marcarla. Nunca rechaza.
   */
  aceptar: () => Promise<ResultadoAceptacion>;
}

const documentoAnticipos = () => documentoEnMemoria('anticipos');

/** Misma versión y mismo hash (el objeto puede ser otro si se volvió a leer). */
const mismaVersion = (a: DocumentoLegalVigente, b: DocumentoLegalVigente) => a.version === b.version && a.hash === b.hash;

/**
 * La versión de la Política de anticipos que la clienta tenía a la vista al marcar la casilla (la que
 * muestra CasillaPoliticaAnticipos desde la memoria del repositorio). Si la casilla se marcó antes de
 * que llegara, se toma la primera que llega. Si con la casilla marcada la memoria cambia a otra
 * versión (o deja de haber una publicada), llama a `alCambiar` para que el padre la desmarque: lo que
 * se aceptó ya no es lo vigente. Devuelve cómo leer la versión vista (null si no hay).
 */
export function usePoliticaVista(marcada: boolean, alCambiar: () => void): () => DocumentoLegalVigente | null {
  const documento = useSyncExternalStore(suscribirDocumentos, documentoAnticipos, documentoAnticipos);
  const vista = useRef<DocumentoLegalVigente | null>(null);

  useEffect(() => {
    if (!marcada) {
      vista.current = null;
      return;
    }
    const anterior = vista.current;
    if (!anterior) {
      vista.current = documento;
      return;
    }
    if (!documento || !mismaVersion(anterior, documento)) {
      vista.current = null;
      alCambiar();
    }
  }, [marcada, documento, alCambiar]);

  return useCallback(() => vista.current, []);
}

/**
 * Casilla obligatoria de la Política de anticipos y cancelación en una pantalla de la cita y el
 * registro de su consentimiento (formulario 'anticipo-cita', con la ruta de la pantalla). Empieza sin
 * marcar y se desmarca sola si la versión vigente cambia mientras está marcada.
 */
export function useAceptacionAnticipos(rutaOrigen: string): AceptacionAnticipos {
  const [marcada, setMarcada] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alCambiarVersion = useCallback(() => {
    setMarcada(false);
    setError(textoPoliticaActualizada());
  }, []);
  const versionVista = usePoliticaVista(marcada, alCambiarVersion);

  const cambiar = useCallback((valor: boolean) => {
    setMarcada(valor);
    if (valor) {
      setError(null);
    }
  }, []);

  const aceptar = useCallback(async (): Promise<ResultadoAceptacion> => {
    if (!marcada) {
      setError(textoFaltaPolitica());
      return { ok: false, mensaje: null };
    }
    const mensaje = await registrarAceptacionAnticipos(rutaOrigen, undefined, versionVista());
    return mensaje ? { ok: false, mensaje } : { ok: true };
  }, [marcada, rutaOrigen, versionVista]);

  return { marcada, cambiar, error, aceptar };
}
