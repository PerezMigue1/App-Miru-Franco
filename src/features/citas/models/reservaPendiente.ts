/**
 * Lo que la clienta eligió en la reserva cuando su sesión terminó al confirmar: al volver a iniciar
 * sesión y abrir la reserva del mismo servicio, se recupera una sola vez. Vive solo en memoria (se
 * pierde al cerrar la app) y nunca en disco, y solo lo recupera la misma clienta. Sin React.
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
}

let pendiente: ReservaPendiente | null = null;

/** Guarda lo elegido (reemplaza lo anterior). */
export function guardarReservaPendiente(reserva: ReservaPendiente): void {
  pendiente = { ...reserva };
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
