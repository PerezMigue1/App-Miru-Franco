import { apiGet } from '@/shared/api/apiClient';
import { alCerrarSesion } from '@/shared/api/eventosSesion';
import { generacionActual } from '@/shared/api/tokenStorage';

/**
 * Repository del perfil de la clienta (GET /api/auth/me), sin React. Al entrar con una sesión
 * guardada, useAuth (que valida la sesión) y la foto de la cabecera piden el mismo /me: aquí salen
 * en UNA sola petición. Reglas:
 * - Lecturas a la vez comparten la petición en vuelo, solo dentro de la misma generación de sesión
 *   (tokenStorage): una petición de otra sesión nunca se reparte.
 * - Solo la respuesta de la lectura que valida la sesión (`guardar`, la de useAuth al restaurarla)
 *   queda en memoria como "reciente", y solo si nadie que la aceptaba se unió a ella. La toma, una
 *   vez, quien la pide con `reciente` (la foto de la cabecera al cambiar de cuenta). Las demás
 *   lecturas (Perfil, Editar perfil, Cambiar contraseña) nunca la usan: van a la red o se unen a la
 *   petición en vuelo.
 * - Cerrar sesión (por cualquier motivo) y guardar cambios del perfil o la foto lo olvidan todo.
 * Nada se guarda en disco.
 */

export interface OpcionesLecturaPerfil {
  /** Acepta la respuesta reciente de esta sesión (una sola vez). */
  reciente?: boolean;
  /** Ofrece la respuesta como reciente a quien la acepte después. */
  guardar?: boolean;
}

interface VueloPerfil {
  generacion: number;
  promesa: Promise<unknown>;
  guardar: boolean;
  /** Alguien que aceptaba la respuesta reciente se unió: ya la tiene y no se guarda. */
  tomada: boolean;
}

let vuelo: VueloPerfil | null = null;
let reciente: { generacion: number; respuesta: unknown } | null = null;

/** Olvida la petición en vuelo (su respuesta ya no se reparte ni se guarda) y la respuesta reciente. */
export function invalidarPerfil(): void {
  vuelo = null;
  reciente = null;
}

/** Olvida solo la respuesta reciente (al empezar a restaurar una sesión). */
export function olvidarPerfilReciente(): void {
  reciente = null;
}

alCerrarSesion(invalidarPerfil);

function alTerminar(propio: VueloPerfil, respuesta: unknown): void {
  if (vuelo !== propio) {
    return;
  }
  vuelo = null;
  if (propio.guardar && !propio.tomada && generacionActual() === propio.generacion) {
    reciente = { generacion: propio.generacion, respuesta };
  }
}

/** GET /api/auth/me compartido (ver las reglas arriba). */
export function leerPerfil(opciones: OpcionesLecturaPerfil = {}): Promise<unknown> {
  const generacion = generacionActual();
  const aceptaReciente = opciones.reciente === true;
  if (vuelo?.generacion === generacion) {
    vuelo.tomada ||= aceptaReciente;
    vuelo.guardar ||= opciones.guardar === true;
    return vuelo.promesa;
  }
  if (aceptaReciente && reciente?.generacion === generacion) {
    const { respuesta } = reciente;
    reciente = null;
    return Promise.resolve(respuesta);
  }
  const propio: VueloPerfil = {
    generacion,
    promesa: apiGet<unknown>('/api/auth/me'),
    guardar: opciones.guardar === true,
    tomada: aceptaReciente,
  };
  vuelo = propio;
  propio.promesa.then(
    (respuesta) => alTerminar(propio, respuesta),
    () => {
      // El error le llega a quien pidió; aquí solo se libera el vuelo.
      if (vuelo === propio) {
        vuelo = null;
      }
    },
  );
  return propio.promesa;
}
