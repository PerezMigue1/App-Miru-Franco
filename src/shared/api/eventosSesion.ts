/**
 * Aviso de cierre de sesión (Observer, sin React): quien guarda en memoria datos de la clienta
 * (por ejemplo, la verificación del pago de la tienda o la memoria del carrito) se suscribe aquí y
 * los borra en cuanto la sesión se cierra, sin esperar a que alguien vuelva a consultarlos. Así auth
 * no depende de las features que limpian y shared no depende de ninguna feature.
 */

/**
 * Por qué se cerró la sesión. 'salida': la clienta cerró sesión, desactivó su cuenta (o la cuenta no
 * era de clienta); 'vencida': el servidor rechazó la sesión (la clienta puede volver a entrar y seguir
 * donde iba); 'cambioContrasena': cambió la contraseña y el servidor revocó la sesión;
 * 'cuentaEliminada': la clienta eliminó su cuenta (como 'salida', y además se borra lo que el
 * teléfono guarda de ella, por ejemplo la preferencia "Avisos en la app").
 */
export type MotivoCierreSesion = 'salida' | 'vencida' | 'cambioContrasena' | 'cuentaEliminada';

/** Datos del cierre: con 'cuentaEliminada', el id de la clienta cuya cuenta se eliminó. */
export interface DetalleCierreSesion {
  usuarioId?: string;
}

/** Recibe el motivo y, solo si quien cierra lo mandó, el detalle (una copia que no se puede cambiar). */
export type OyenteCierreSesion = (motivo: MotivoCierreSesion, detalle?: Readonly<DetalleCierreSesion>) => void;

const oyentes = new Set<OyenteCierreSesion>();

/** Registra quién se entera de cada cierre de sesión. Devuelve cómo dejar de escuchar. */
export function alCerrarSesion(oyente: OyenteCierreSesion): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Avisa a cada oyente una vez; uno que falla no impide avisar a los demás ni a quien cierra. */
export function avisarCierreSesion(motivo: MotivoCierreSesion, detalle?: DetalleCierreSesion): void {
  const copia = detalle ? Object.freeze({ ...detalle }) : undefined;
  for (const oyente of [...oyentes]) {
    try {
      if (copia) {
        oyente(motivo, copia);
      } else {
        oyente(motivo);
      }
    } catch {
      // Se sigue con los demás.
    }
  }
}
