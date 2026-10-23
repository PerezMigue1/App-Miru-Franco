import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import {
  configurarVigilancia,
  estadoPagoConocido as leerEstadoPagoConocido,
  suscribir,
  type EstadoPagoConocido,
  type FabricaVigilancia,
} from '../models/verificacionPago';

// Las pantallas (confirmación, detalle y Mis pedidos) usan el registro desde aquí.
export {
  detener as detenerVerificacion,
  estadoPagoConocido,
  limpiarVerificacion,
  mantenerVerificacion,
  pedidosConPagoPendiente,
  suscribir as suscribirVerificacion,
  verificacionEnCurso,
  verificarPago,
} from '../models/verificacionPago';
export type {
  EstadoPagoConocido,
  EventoVerificacion,
  MotivoVerificacion,
  ResultadoVerificacion,
  TransicionPago,
} from '../models/verificacionPago';

/**
 * Vigilancia del primer plano con AppState: al volver a 'active' el registro verifica los pagos
 * pendientes; en 'background' o 'inactive' detiene sus temporizadores. El registro la conecta solo
 * mientras tiene algo que vigilar y la suelta después.
 */
export const vigilarAppState: FabricaVigilancia = (alCambiarPlano) => {
  const suscripcion = AppState.addEventListener('change', (estadoApp) => {
    if (estadoApp === 'active') {
      alCambiarPlano(true);
    } else if (estadoApp === 'background' || estadoApp === 'inactive') {
      alCambiarPlano(false);
    }
  });
  return () => suscripcion.remove();
};

// Basta con importar este archivo para que el registro vigile el primer plano.
configurarVigilancia(vigilarAppState);

/**
 * Lo que se sabe del pago del pedido (Observer con useSyncExternalStore): se vuelve a pintar con
 * cada cambio del registro. null sin pedido o si todavía no se sabe nada.
 */
export function useEstadoPagoConocido(pedidoId: number | null): EstadoPagoConocido | null {
  const leer = useCallback(() => (pedidoId === null ? null : leerEstadoPagoConocido(pedidoId)), [pedidoId]);
  return useSyncExternalStore(suscribir, leer, leer);
}
