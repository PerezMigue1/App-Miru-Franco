import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { ApiError, type ErrorDeRed } from './apiClient';
import {
  abrirDocumentoEnWeb,
  esSlugDocumentoLegal,
  estadoDocumento,
  fechaVigenciaLegible,
  obtenerDocumentoVigente,
  suscribir,
  TITULO_DOCUMENTO_LEGAL,
  type DocumentoLegalVigente,
  type OrigenDocumento,
} from './documentosLegales';
import { mensajeParaClienta } from './mensajesError';

export interface DocumentoLegalHook {
  /** El documento vigente (de la red, la memoria o el archivo guardado), o null. */
  documento: DocumentoLegalVigente | null;
  /** Se está pidiendo y todavía no hay documento que mostrar. */
  cargando: boolean;
  /**
   * Sin conexión: el documento viene del archivo guardado (o de una lectura vieja en memoria), o no
   * hay ninguno. Nunca con un slug desconocido ni sin versión publicada.
   */
  sinRed: boolean;
  /** Por qué no hay documento (solo cuando no hay). Nunca se muestra a la clienta. */
  error: ApiError | ErrorDeRed | null;
  /** Sin documento: por qué no se cargó, en texto para la clienta (sin red, servidor...); null con documento. */
  mensajeError: string | null;
  /** El slug no es de un documento legal. */
  desconocido: boolean;
  /** El servidor respondió 404: el documento no tiene versión publicada. */
  noPublicado: boolean;
  /** Título del documento o, mientras no hay, el de respaldo ('' con un slug desconocido). */
  titulo: string;
  /**
   * Versión y vigencia listas para mostrar ({ version: "Versión 1.2", desde: "Vigente desde el 14
   * de octubre de 2026" }), o null sin documento.
   */
  vigencia: VigenciaDocumento | null;
  /** Mensaje si no se pudo abrir el sitio, o null. */
  avisoAbrir: string | null;
  /** Vuelve a pedir el documento a la red. */
  reintentar: () => void;
  /** Abre el texto completo en el sitio. true si se abrió. */
  abrirCompleto: () => Promise<boolean>;
}

export interface VigenciaDocumento {
  version: string;
  desde: string;
}

const SIN_ABRIR = 'No pudimos abrir el documento. Revisa tu conexión e intenta de nuevo.';

interface Carga {
  pidiendo: boolean;
  origen: OrigenDocumento;
  error: ApiError | ErrorDeRed | null;
}

const sinEstado = () => null;
const sinSuscripcion = () => () => undefined;

/**
 * Documento legal para el visor (patrón Observer sobre el repositorio documentosLegales): lo pide al
 * montarse (memoria vigente, red o archivo), se vuelve a pintar si el repositorio recibe una versión
 * nueva y arma los textos que la vista solo pinta. Con un slug desconocido (o una lista, si el
 * parámetro de la ruta viene repetido) no pide nada.
 */
export function useDocumentoLegal(slug: string | string[] | undefined): DocumentoLegalHook {
  const valido = esSlugDocumentoLegal(slug);
  const leerEstado = useCallback(() => (esSlugDocumentoLegal(slug) ? estadoDocumento(slug) : null), [slug]);
  const estado = useSyncExternalStore(valido ? suscribir : sinSuscripcion, valido ? leerEstado : sinEstado, valido ? leerEstado : sinEstado);
  const [carga, setCarga] = useState<Carga>({ pidiendo: valido, origen: null, error: null });
  const [avisoAbrir, setAvisoAbrir] = useState<string | null>(null);
  // Solo cuenta la respuesta de la última petición, y ninguna después de desmontar.
  const generacion = useRef(0);

  const cargar = useCallback(
    (forzarRed: boolean) => {
      if (!esSlugDocumentoLegal(slug)) {
        return;
      }
      const actual = ++generacion.current;
      setCarga((previa) => ({ ...previa, pidiendo: true }));
      void obtenerDocumentoVigente(slug, { forzarRed }).then((resultado) => {
        if (generacion.current === actual) {
          setCarga({ pidiendo: false, origen: resultado.origen, error: resultado.error ?? null });
        }
      });
    },
    [slug],
  );

  useEffect(() => {
    cargar(false);
    return () => {
      generacion.current++;
    };
  }, [cargar]);

  const documento = estado?.documento ?? null;
  const noPublicado = !documento && carga.error instanceof ApiError && carga.error.status === 404;
  const listo = valido && !carga.pidiendo;
  const desdeArchivo = estado?.origen === 'archivo' || carga.origen === 'archivo';
  const sinRed = listo && !noPublicado && (!documento || desdeArchivo || carga.error !== null);

  const reintentar = useCallback(() => cargar(true), [cargar]);

  const abrirCompleto = useCallback(async () => {
    if (!esSlugDocumentoLegal(slug)) {
      return false;
    }
    const abierto = await abrirDocumentoEnWeb(slug, documento);
    setAvisoAbrir(abierto ? null : SIN_ABRIR);
    return abierto;
  }, [slug, documento]);

  return {
    documento,
    cargando: valido && carga.pidiendo && !documento,
    sinRed,
    error: documento ? null : carga.error,
    mensajeError: documento ? null : mensajeParaClienta(carga.error),
    desconocido: !valido,
    noPublicado,
    titulo: documento?.titulo ?? (valido ? TITULO_DOCUMENTO_LEGAL[slug] : ''),
    vigencia: documento
      ? { version: `Versión ${documento.version}`, desde: `Vigente desde el ${fechaVigenciaLegible(documento.vigenteDesde)}` }
      : null,
    avisoAbrir,
    reintentar,
    abrirCompleto,
  };
}
