import * as WebBrowser from 'expo-web-browser';
import { AppState } from 'react-native';

import { REDIRECCION_PEDIDO } from '../models/pedidoModel';

/**
 * Apertura de Mercado Pago para pagar un pedido y espera del regreso a la app. Es una copia
 * adaptada del pago del anticipo (citas/viewmodels/useAnticipoViewModel.ts), que no se comparte.
 */

export const MENSAJE_SIN_NAVEGADOR =
  'No encontramos un navegador para abrir Mercado Pago. Activa Chrome u otro navegador e intenta de nuevo.';

/**
 * Respaldo del regreso desde el navegador: se resuelve cuando la app pasa a segundo plano y vuelve
 * a estar activa. Devuelve la promesa y una función para soltarla (al desmontar la pantalla).
 */
export function esperarRegreso(): { promesa: Promise<void>; soltar: () => void } {
  let soltar = () => {};
  const promesa = new Promise<void>((resolve) => {
    let salio = AppState.currentState !== 'active';
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') {
        salio = true;
        return;
      }
      if (salio) {
        suscripcion.remove();
        resolve();
      }
    });
    soltar = () => {
      suscripcion.remove();
      resolve();
    };
  });
  return { promesa, soltar };
}

export type ResultadoApertura = 'regreso' | 'sinNavegador';

/**
 * Abre Mercado Pago en una sesión del navegador y espera a que la clienta regrese. La sesión
 * termina sola con el regreso (appmirufranco://pedido/<id>?retorno=mp) o al cerrar la pestaña; el
 * regreso a primer plano es el respaldo, porque si el backend no tiene BACKEND_URL Mercado Pago
 * regresa a la web y la sesión nunca ve la dirección de la app. Lo que llegue primero gana.
 *
 * `registrarSoltar` recibe la función que suelta la espera mientras el navegador está abierto (y
 * null al terminar), para que la pantalla la llame si se desmonta.
 */
export async function abrirPagoEnNavegador(
  initPoint: string,
  registrarSoltar: (soltar: (() => void) | null) => void,
): Promise<ResultadoApertura> {
  // Se escucha el regreso a primer plano antes de abrir para no perder el paso a segundo plano.
  const espera = esperarRegreso();
  registrarSoltar(espera.soltar);
  try {
    await Promise.race([WebBrowser.openAuthSessionAsync(initPoint, REDIRECCION_PEDIDO), espera.promesa]);
    return 'regreso';
  } catch {
    return 'sinNavegador';
  } finally {
    espera.soltar();
    registrarSoltar(null);
  }
}
