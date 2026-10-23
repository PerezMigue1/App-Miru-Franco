import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Linking } from 'react-native';

import {
  documentoEnMemoria,
  suscribir as suscribirDocumentos,
  type DocumentoLegalVigente,
  type SlugDocumentoLegal,
} from '@/shared/api/documentosLegales';
import { useConfiguracionPublica } from '@/shared/api/useConfiguracionPublica';

import {
  datosRecoger,
  informacionCompra,
  PROFECO,
  type DatosRecoger,
  type InformacionCompra,
} from '../models/compraLegal';

export type {
  ContactoVendedor,
  DatosRecoger,
  EtiquetaCasillaCompra,
  IdCasillaCompra,
  InformacionCompra,
  OpcionMetodo,
} from '../models/compraLegal';

/**
 * Piezas de la capa viewmodel del checkout (GP-07.5) que usan los componentes de la tienda: los datos
 * para recoger en el salón y la información de la compra con la configuración pública vigente (se
 * vuelven a pintar cuando cambia), los enlaces que abren el teléfono, el mapa o el sitio, y la
 * versión de un documento legal que la clienta tuvo a la vista al marcar su casilla.
 */

/** Abre un enlace (tel:, mailto: o https://). Si no hay app que lo abra, el dato sigue escrito en pantalla. */
export function abrirEnlace(url: string | null): void {
  if (!url) {
    return;
  }
  Linking.openURL(url).catch(() => {
    // Sin app para abrirlo, el texto queda a la vista.
  });
}

/** Datos del salón para recoger el pedido (nombre, domicilio, horario, teléfono, mapa y aviso). */
export function useDatosRecoger(): DatosRecoger {
  const { configuracion } = useConfiguracionPublica();
  return useMemo(() => datosRecoger(configuracion), [configuracion]);
}

/** Información de comercio electrónico del último paso, con los datos de contacto de Profeco. */
export function useInformacionCompra(): InformacionCompra & { profeco: typeof PROFECO } {
  const { configuracion } = useConfiguracionPublica();
  return useMemo(() => ({ ...informacionCompra(configuracion), profeco: PROFECO }), [configuracion]);
}

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
