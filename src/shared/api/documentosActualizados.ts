import { ApiError } from './apiClient';
import type { ConfiguracionPublica } from './configuracionPublica';
import { obtenerDocumentoVigente, type SlugDocumentoLegal } from './documentosLegales';
import { obtenerTexto } from './textosSitio';

/**
 * Documentos legales que cambiaron mientras la clienta los tenía a la vista (Ronda 9 del backend).
 * POST /api/consentimientos, el registro y el alta solo aceptan la versión vigente de cada documento:
 * - 400 DOCUMENTO_NO_VIGENTE: la versión está publicada, pero es anterior (o todavía no entra en vigor).
 * - 400 DOCUMENTO_NO_COINCIDE: la versión no está publicada o su hash no coincide.
 * En los dos casos la app vuelve a pedir las versiones vigentes a la red (forzarRed), desmarca solo la
 * casilla del documento que cambió y muestra legal.documentoActualizado junto a ella. Nunca reintenta
 * sola: la clienta debe tener a la vista lo que acepta. Lo comparten la compra, la reserva, el registro
 * y la pantalla de documentos pendientes.
 */

/** Codes del backend para una versión de documento que ya no es la vigente. */
export const CODES_DOCUMENTO_ACTUALIZADO: readonly string[] = Object.freeze(['DOCUMENTO_NO_VIGENTE', 'DOCUMENTO_NO_COINCIDE']);

/** Code del backend cuando el texto de la autorización de datos sensibles cambió. */
export const CODE_TEXTO_DATOS_SENSIBLES_NO_VIGENTE = 'TEXTO_DATOS_SENSIBLES_NO_VIGENTE';

const conCode = (error: unknown, codes: readonly string[]): boolean =>
  error instanceof ApiError && error.status === 400 && error.code !== undefined && codes.includes(error.code);

/** El 400 DOCUMENTO_NO_VIGENTE o DOCUMENTO_NO_COINCIDE. */
export function esDocumentoActualizado(error: unknown): boolean {
  return conCode(error, CODES_DOCUMENTO_ACTUALIZADO);
}

/** El 400 TEXTO_DATOS_SENSIBLES_NO_VIGENTE: hay que volver a pedir el texto y autorizar otra vez. */
export function esTextoDatosSensiblesActualizado(error: unknown): boolean {
  return conCode(error, [CODE_TEXTO_DATOS_SENSIBLES_NO_VIGENTE]);
}

/** "Actualizamos este documento; revísalo y acéptalo de nuevo." (legal.documentoActualizado). */
export function textoDocumentoActualizado(config?: ConfiguracionPublica): string {
  return obtenerTexto('legal.documentoActualizado', {}, config);
}

/** La versión y el hash de un documento (los que se aceptaron o los vigentes). */
export interface VersionDocumento {
  version: string;
  hash: string;
}

/** La casilla de un documento y la versión que la clienta tenía a la vista al marcarla. */
export interface DocumentoAceptado<K extends string> {
  /** Cómo llama la pantalla a su casilla. */
  clave: K;
  slug: SlugDocumentoLegal;
  /** null: no había ninguna versión a la vista. */
  aceptado: VersionDocumento | null;
}

/**
 * Las casillas cuyo documento cambió: sin versión aceptada, sin versión vigente confirmada (null) o
 * con otra versión u otro hash. Si ninguna se ve distinta, el servidor ya dijo que algo no es vigente:
 * se devuelven todas, para que la clienta las revise (nunca se queda una casilla marcada con una
 * versión que el servidor rechazó).
 */
export function versionesCambiadas<K extends string>(
  aceptados: readonly DocumentoAceptado<K>[],
  vigentes: readonly (VersionDocumento | null)[],
): K[] {
  const cambiadas = aceptados.filter(({ aceptado }, i) => {
    const vigente = vigentes[i] ?? null;
    return !aceptado || !vigente || aceptado.version !== vigente.version || aceptado.hash !== vigente.hash;
  });
  return (cambiadas.length > 0 ? cambiadas : aceptados).map(({ clave }) => clave);
}

/**
 * Vuelve a pedir a la red el documento vigente de cada casilla (forzarRed: la memoria se actualiza y
 * las pantallas suscritas se vuelven a pintar) y devuelve las que cambiaron (versionesCambiadas). Un
 * documento que no llegó de la red cuenta como cambiado: no se puede confirmar que siga vigente.
 * Nunca rechaza.
 */
export async function documentosQueCambiaron<K extends string>(aceptados: readonly DocumentoAceptado<K>[]): Promise<K[]> {
  const vigentes = await Promise.all(
    aceptados.map(async ({ slug }) => {
      const { documento, origen } = await obtenerDocumentoVigente(slug, { forzarRed: true });
      return origen === 'red' ? documento : null;
    }),
  );
  return versionesCambiadas(aceptados, vigentes);
}
