import { ApiError, apiGet } from '@/shared/api/apiClient';
import { registrarConsentimientos, type TipoConsentimiento } from '@/shared/api/consentimientos';

import { actualizarPerfil, obtenerPerfilCompleto } from './authService';
import { normalizarPerfil } from './PerfilModel';
import { invalidarPerfil } from './perfilCompartido';

/**
 * Permisos opcionales de la titular en Mis datos y privacidad (GP-09), con lo que el backend deja
 * retirar desde la cuenta:
 * - Datos de salud: su estado y su retiro van por datosSensibles.ts (.../datos-sensibles/retirar solo
 *   las oculta; revocar datos_salud por POST /api/consentimientos las dejaría en null en la base).
 * - Promociones: el estado real es recibePromociones de GET /api/auth/me. Se retira con POST
 *   /api/consentimientos (accion "revocado") y se vuelve a dar con PATCH /api/auth/me
 *   { recibePromociones: true }, que deja su fila de consentimiento ligada al aviso vigente.
 * - Fotos del resultado: el estado es la última fila fotos_resultado de GET /api/consentimientos/mios.
 *   Se retira con POST /api/consentimientos (oculta sus fotos de la galería). Volver a autorizarlas
 *   solo se hace en el salón, en una cita: la app no lo ofrece.
 */

/** Formulario y ruta con que se registran los retiros desde esta pantalla. */
export const FORMULARIO_PRIVACIDAD = 'perfil_privacidad';
export const RUTA_MIS_DATOS = '/mis-datos';

/** Estado de las fotos del resultado: sin ninguna fila, nunca las autorizó. */
export type EstadoFotos = 'aceptado' | 'revocado' | 'sinRegistro';

/** Una fila del historial de consentimientos (solo lo que se usa). */
export interface FilaConsentimiento {
  tipo: string;
  accion: string;
  creadoEn: string;
}

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '');

/** GET /api/consentimientos/mios: el historial, lo más reciente primero. */
export async function misConsentimientos(): Promise<FilaConsentimiento[]> {
  const respuesta = await apiGet<unknown>('/api/consentimientos/mios');
  if (!esObjeto(respuesta) || !Array.isArray(respuesta.data)) {
    throw new ApiError(500, 'La respuesta del servidor no trae el historial de consentimientos.');
  }
  return respuesta.data
    .filter(esObjeto)
    .map((fila) => ({ tipo: texto(fila.tipo), accion: texto(fila.accion), creadoEn: texto(fila.creadoEn) }));
}

const instante = (fila: FilaConsentimiento): number => {
  const tiempo = new Date(fila.creadoEn).getTime();
  return Number.isNaN(tiempo) ? Number.NEGATIVE_INFINITY : tiempo;
};

/**
 * La fila vigente de un tipo: la de fecha más reciente; con la misma fecha gana la que viene antes
 * (el servidor ordena por fecha e id descendentes). undefined si no hay ninguna.
 */
export function ultimaDeTipo(filas: FilaConsentimiento[], tipo: TipoConsentimiento): FilaConsentimiento | undefined {
  let vigente: FilaConsentimiento | undefined;
  for (const fila of filas) {
    if (fila.tipo === tipo && (vigente === undefined || instante(fila) > instante(vigente))) {
      vigente = fila;
    }
  }
  return vigente;
}

/** Estado de las fotos del resultado según su última fila. */
export function estadoFotos(filas: FilaConsentimiento[]): EstadoFotos {
  const ultima = ultimaDeTipo(filas, 'fotos_resultado');
  if (!ultima) {
    return 'sinRegistro';
  }
  return ultima.accion === 'aceptado' ? 'aceptado' : 'revocado';
}

/** recibePromociones de GET /api/auth/me (comparte la petición en vuelo del perfil). */
export async function leerRecibePromociones(): Promise<boolean> {
  const perfil = normalizarPerfil(await obtenerPerfilCompleto());
  if (!perfil) {
    throw new ApiError(500, 'La respuesta del servidor no trae el perfil.');
  }
  return perfil.recibePromociones;
}

/** POST /api/consentimientos con un retiro de esta pantalla; el perfil en memoria se olvida. */
async function revocar(tipo: 'promociones' | 'fotos_resultado'): Promise<void> {
  await registrarConsentimientos({
    items: [{ tipo, accion: 'revocado' }],
    formulario: FORMULARIO_PRIVACIDAD,
    rutaOrigen: RUTA_MIS_DATOS,
  });
  invalidarPerfil();
}

/** Retira el permiso de promociones (el backend apaga recibePromociones). */
export function retirarPromociones(): Promise<void> {
  return revocar('promociones');
}

/** Retira el permiso de fotos del resultado (el backend las oculta de la galería). */
export function retirarFotos(): Promise<void> {
  return revocar('fotos_resultado');
}

/** Vuelve a dar el permiso de promociones (opt in explícito de la titular). */
export async function activarPromociones(): Promise<void> {
  await actualizarPerfil({ recibePromociones: true });
}
