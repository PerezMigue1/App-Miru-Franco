import { File as ArchivoLocal } from 'expo-file-system';

import { ApiError, ErrorDeRed } from './apiClient';

/** Una foto tarda más que una petición JSON: margen amplio antes de darla por perdida. */
const TIMEOUT_SUBIDA_MS = 60000;

/**
 * POST multipart a un servicio externo, sin el token de la app: el archivo local va en `file` y
 * cada campo, tal cual. El fetch de Expo no acepta { uri } en FormData; el File de
 * expo-file-system sí. El encabezado multipart con su boundary lo arma fetch.
 */
export async function subirMultipart(
  url: string,
  archivoUri: string,
  campos: Record<string, string>,
): Promise<unknown> {
  const formulario = new FormData();
  formulario.append('file', new ArchivoLocal(archivoUri));
  for (const [nombre, valor] of Object.entries(campos)) {
    formulario.append(nombre, valor);
  }
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), TIMEOUT_SUBIDA_MS);
  let respuesta: Response;
  try {
    respuesta = await fetch(url, { method: 'POST', body: formulario, signal: controlador.signal });
  } catch {
    // Sin red o sin respuesta a tiempo.
    throw new ErrorDeRed();
  } finally {
    clearTimeout(limite);
  }
  let cuerpo: unknown = null;
  try {
    const texto = await respuesta.text();
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = null;
  }
  if (!respuesta.ok) {
    // El detalle del servicio externo no se muestra: la pantalla decide el mensaje.
    throw new ApiError(respuesta.status, `Error en la subida (${respuesta.status}).`);
  }
  return cuerpo;
}
