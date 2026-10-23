import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { generacionActual } from '@/shared/api/tokenStorage';
import { duracion } from '@/shared/ui/tokens';

import { obtenerPerfilCompleto } from '../models/authService';
import { esFotoCloudinary, normalizarPerfil } from '../models/PerfilModel';
import { useAuth } from './useAuth';

/**
 * Foto de la clienta para la cabecera de las pestañas: un estado pequeño en memoria que comparten
 * todas las cabeceras, así cambiar de pestaña no dispara varias lecturas de /me a la vez.
 */

let foto: string | null = null;
const oyentes = new Set<() => void>();
/** Id de la clienta en sesión; null sin sesión. */
let cuenta: string | null = null;
/** Cambia al cambiar la cuenta: una lectura de la cuenta anterior ya no escribe. */
let generacion = 0;
let enVuelo = false;
/** Alguien pidió leer mientras otra lectura iba en camino: se lee otra vez al terminar. */
let pendiente = false;
/** Cuándo se supo la foto por última vez (ms): el foco de una pestaña no relee antes del refresco. */
let ultimaLectura = 0;

function fijar(nueva: string | null) {
  if (nueva === foto) {
    return;
  }
  foto = nueva;
  oyentes.forEach((oyente) => oyente());
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function leerFoto() {
  return foto;
}

/**
 * Lee la foto de /me. Con `unirse`, si ya hay una lectura en camino basta con ella (el foco de una
 * pantalla); sin él, se lee otra vez al terminar (el estado pudo cambiar después de pedirla). Con
 * `reciente` (la primera lectura de una cuenta), sirve el /me con el que useAuth acaba de validar la
 * sesión: al entrar sale una sola petición.
 */
function leer(unirse = false, reciente = false) {
  if (cuenta === null) {
    return;
  }
  // El foco de una pestaña no pide /me otra vez si la foto se supo hace poco (Perfil la avisa al cambiarla).
  if (unirse && Date.now() - ultimaLectura < duracion.refrescoFotoCabecera) {
    return;
  }
  // Una sola lectura a la vez; la que se pidió mientras tanto sale al terminar esta.
  if (enVuelo) {
    pendiente = pendiente || !unirse;
    return;
  }
  enVuelo = true;
  const actual = generacion;
  const sesion = generacionActual();
  const vigente = () => actual === generacion && sesion === generacionActual() && cuenta !== null;
  obtenerPerfilCompleto({ reciente })
    .then((respuesta) => {
      if (!vigente()) {
        return;
      }
      const perfil = normalizarPerfil(respuesta);
      // Otra cuenta en la respuesta (o una respuesta sin perfil): no se toca la foto.
      if (!perfil || perfil.id !== cuenta) {
        return;
      }
      // Como en Perfil: solo fotos de Cloudinary por https; cualquier otra cae a las iniciales.
      fijar(perfil.foto && esFotoCloudinary(perfil.foto) ? perfil.foto : null);
      ultimaLectura = Date.now();
    })
    .catch(() => {
      // Sin red o con error se conserva la última foto conocida de esta cuenta (o las iniciales).
    })
    .finally(() => {
      enVuelo = false;
      if (pendiente) {
        pendiente = false;
        leer();
      }
    });
}

/** Cambia la cuenta en sesión; devuelve false si ya era la misma. */
function cambiarCuenta(nueva: string | null): boolean {
  if (nueva === cuenta) {
    return false;
  }
  cuenta = nueva;
  // Lo que venía en camino era de la cuenta anterior: se descarta, y su foto también.
  generacion += 1;
  pendiente = false;
  ultimaLectura = 0;
  fijar(null);
  leer(false, true);
  return true;
}

/**
 * Perfil avisa aquí cuando la clienta sube o quita su foto: la cabecera la cambia al instante, sin
 * esperar otra lectura de /me. Una lectura que iba en camino (con la foto anterior) ya no escribe.
 */
export function fijarFotoClienta(nueva: string | null): void {
  if (cuenta === null) {
    return;
  }
  generacion += 1;
  pendiente = false;
  ultimaLectura = Date.now();
  fijar(nueva && esFotoCloudinary(nueva) ? nueva : null);
}

/**
 * Foto de la clienta en sesión (null sin sesión, sin foto o si aún no se conoce). Se lee al cambiar
 * la sesión y cada vez que la pantalla que la muestra recibe el foco: si la clienta cambia su foto
 * en Perfil, la cabecera de la siguiente pestaña ya trae la nueva.
 */
export function useFotoClienta(): string | null {
  const { estado, usuario } = useAuth();
  const id = estado === 'autenticado' ? (usuario?.id ?? '') : null;

  useEffect(() => {
    cambiarCuenta(id);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      // Al montar, cambiarCuenta ya pidió la lectura de una cuenta nueva: esta se une a ella.
      leer(true);
      return undefined;
    }, []),
  );

  const actual = useSyncExternalStore(suscribir, leerFoto, leerFoto);
  // Hasta que el efecto registre la cuenta nueva, la foto guardada puede ser de la anterior: no se
  // muestra (al entrar con otra cuenta en el mismo teléfono no se ve ni un cuadro la foto ajena).
  return id !== null && id === cuenta ? actual : null;
}
