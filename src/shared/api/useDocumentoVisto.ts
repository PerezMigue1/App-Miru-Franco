import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import {
  documentoEnMemoria,
  suscribir as suscribirDocumentos,
  type DocumentoLegalVigente,
  type SlugDocumentoLegal,
} from './documentosLegales';

/**
 * La versión de un documento legal que la clienta tuvo a la vista al marcar su casilla. La comparten
 * el checkout de la tienda (GP-07.5) y el registro (GP-09), que mandan esa versión y su hash al
 * backend para que DOCUMENTO_NO_VIGENTE y DOCUMENTO_NO_COINCIDE digan qué documento cambió.
 */

/** Misma versión y mismo hash (el objeto puede ser otro si se volvió a leer). */
const mismaVersion = (a: DocumentoLegalVigente, b: DocumentoLegalVigente) => a.version === b.version && a.hash === b.hash;

/**
 * La versión del documento `slug` que la clienta tenía a la vista al marcar su casilla (la de la
 * memoria del repositorio de documentos). Si se marcó antes de que llegara, cuenta la primera que
 * llega. Si con la casilla marcada la memoria cambia a otra versión (o deja de haber una), llama a
 * `alCambiar` para que el padre la desmarque. Devuelve cómo leer la versión vista (null si no hay).
 */
export function useDocumentoVisto(
  slug: SlugDocumentoLegal,
  marcada: boolean,
  alCambiar: () => void,
): () => DocumentoLegalVigente | null {
  const leer = useCallback(() => documentoEnMemoria(slug), [slug]);
  const documento = useSyncExternalStore(suscribirDocumentos, leer, leer);
  const visto = useRef<DocumentoLegalVigente | null>(null);

  useEffect(() => {
    if (!marcada) {
      visto.current = null;
      return;
    }
    const anterior = visto.current;
    if (!anterior) {
      visto.current = documento;
      return;
    }
    if (!documento || !mismaVersion(anterior, documento)) {
      visto.current = null;
      alCambiar();
    }
  }, [marcada, documento, alCambiar]);

  return useCallback(() => visto.current, []);
}
