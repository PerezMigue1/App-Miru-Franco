import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/viewmodels/useAuth';

import { obtenerCarrito, obtenerCarritoRevisado, piezasCarrito, type ItemCarrito } from '../models/carritoModel';

/**
 * Piezas del carrito para el número de la pestaña Carrito: un estado pequeño en memoria que
 * comparten la barra y las pantallas que cambian el carrito, sin otra lectura por cada pantalla.
 */

let piezas = 0;
const oyentes = new Set<() => void>();
/** Id de la clienta en sesión; null sin sesión. */
let cuenta: string | null = null;
/** Cambia al cambiar la sesión o al publicar un número: una lectura de antes ya no escribe. */
let generacion = 0;
let enVuelo = false;
/** Alguien pidió leer mientras otra lectura iba en camino: se lee otra vez al terminar. */
let pendiente = false;

function fijar(n: number) {
  if (n === piezas) {
    return;
  }
  piezas = n;
  oyentes.forEach((oyente) => oyente());
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function leerPiezas() {
  return piezas;
}

function leer() {
  if (cuenta === null) {
    return;
  }
  // Una sola lectura a la vez; la que se pidió mientras tanto sale al terminar esta.
  if (enVuelo) {
    pendiente = true;
    return;
  }
  enVuelo = true;
  const actual = generacion;
  obtenerCarrito()
    .then((items) => {
      if (actual === generacion && cuenta !== null) {
        fijar(piezasCarrito(items));
      }
    })
    .catch(() => {
      // Sin red o con error se conserva el último número conocido.
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
  // Lo que venía en camino era de la cuenta anterior: se descarta.
  generacion += 1;
  pendiente = false;
  fijar(0);
  leer();
  return true;
}

/** El carrito cambió en el servidor (se agregó, se quitó o se hizo un pedido): se vuelve a leer. */
export function avisarCambioCarrito() {
  leer();
}

/** Quien ya conoce el carrito completo publica sus piezas sin otra lectura. */
export function publicarPiezasCarrito(n: number) {
  if (cuenta === null) {
    return;
  }
  // Una lectura que ya iba en camino traería un número más viejo que este.
  generacion += 1;
  fijar(Math.max(0, n));
}

/**
 * Vuelve a leer el carrito con la misma lectura de la pantalla Carrito (obtenerCarritoRevisado: lo
 * que se dejó de vender se quita y queda por avisar) y publica sus piezas en la pestaña. La usan el
 * checkout y la confirmación tras un 409 de piezas agotadas (GP-09). Devuelve la lista o null si no
 * se pudo leer; nunca lanza.
 */
export function releerCarrito(): Promise<ItemCarrito[] | null> {
  return obtenerCarritoRevisado()
    .then(({ items }) => {
      publicarPiezasCarrito(piezasCarrito(items));
      return items;
    })
    .catch(() => null);
}

/**
 * Piezas en el carrito de la clienta en sesión (0 sin sesión). Se lee al montar, al cambiar la
 * sesión, al volver la app a primer plano y cuando alguien avisa que el carrito cambió.
 */
export function usePiezasCarrito(): number {
  const { estado, usuario } = useAuth();
  const id = estado === 'autenticado' ? (usuario?.id ?? '') : null;

  useEffect(() => {
    // Misma cuenta (otra pantalla que monta el número): basta con una lectura nueva.
    if (!cambiarCuenta(id)) {
      leer();
    }
  }, [id]);

  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (estadoApp) => {
      if (estadoApp === 'active') {
        leer();
      }
    });
    return () => suscripcion.remove();
  }, []);

  return useSyncExternalStore(suscribir, leerPiezas);
}
