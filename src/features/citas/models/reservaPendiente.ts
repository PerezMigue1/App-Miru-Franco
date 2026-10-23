import { alCerrarSesion } from '@/shared/api/eventosSesion';

import type { OpcionAnticipo } from './formaPagoModel';

/**
 * Lo que la clienta eligió en la reserva cuando su sesión terminó al confirmar: al volver a iniciar
 * sesión la app regresa sola a la reserva de ese servicio (servicioPorRetomar) y ahí se recupera una
 * sola vez. Vive solo en memoria (se pierde al cerrar la app) y nunca en disco, y solo lo recupera la
 * misma clienta. Sin React.
 */
export interface ReservaPendiente {
  usuarioId: string;
  servicioId: string;
  especialistaId: string;
  /** 'YYYY-MM-DD' local del día elegido. */
  fecha: string;
  /** Inicio ISO del horario elegido. */
  inicio: string;
  notas: string;
  /** Forma de pago del anticipo elegida (solo si el servicio lo pedía). */
  opcionPago?: OpcionAnticipo;
}

let pendiente: ReservaPendiente | null = null;

// Si la clienta cierra sesión a propósito o cambia la contraseña, lo elegido se olvida. Con la sesión
// vencida se conserva: es justo para retomarlo al volver a entrar.
alCerrarSesion((motivo) => {
  if (motivo !== 'vencida') {
    pendiente = null;
  }
});

/** Guarda lo elegido (reemplaza lo anterior). */
export function guardarReservaPendiente(reserva: ReservaPendiente): void {
  pendiente = { ...reserva };
}

/**
 * Al iniciar sesión: el servicio cuya reserva quedó pendiente para esta clienta, sin tomarla (la
 * toma la pantalla de la reserva). Si es de otra clienta, se olvida en ese momento: otra cuenta nunca
 * la recupera ni la deja esperando a la anterior en este teléfono.
 */
export function servicioPorRetomar(usuarioId: string): string | null {
  if (!pendiente) {
    return null;
  }
  if (pendiente.usuarioId !== usuarioId) {
    pendiente = null;
    return null;
  }
  return pendiente.servicioId;
}

/**
 * Lo guardado para esta clienta y este servicio, una sola vez: al tomarlo se olvida. null si no hay
 * o si es de otra clienta u otro servicio (eso se queda donde está).
 */
export function tomarReservaPendiente(usuarioId: string, servicioId: string): ReservaPendiente | null {
  if (!pendiente || pendiente.usuarioId !== usuarioId || pendiente.servicioId !== servicioId) {
    return null;
  }
  const reserva = pendiente;
  pendiente = null;
  return reserva;
}

/** Solo para pruebas: olvida lo guardado. */
export function reiniciarReservaPendiente(): void {
  pendiente = null;
}
