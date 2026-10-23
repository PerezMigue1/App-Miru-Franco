/**
 * Aviso de cierre de sesión (Observer, sin React): quien guarda en memoria datos de la clienta
 * (por ejemplo, la verificación del pago de la tienda o la memoria del carrito) se suscribe aquí y
 * los borra en cuanto la sesión se cierra, sin esperar a que alguien vuelva a consultarlos. Así auth
 * no depende de las features que limpian y shared no depende de ninguna feature.
 */

/**
 * Por qué se cerró la sesión. 'salida': la clienta cerró sesión (o la cuenta no era de clienta);
 * 'vencida': el servidor rechazó la sesión (la clienta puede volver a entrar y seguir donde iba);
 * 'cambioContrasena': cambió la contraseña y el servidor revocó la sesión.
 */
export type MotivoCierreSesion = 'salida' | 'vencida' | 'cambioContrasena';

export type OyenteCierreSesion = (motivo: MotivoCierreSesion) => void;

const oyentes = new Set<OyenteCierreSesion>();

/** Registra quién se entera de cada cierre de sesión. Devuelve cómo dejar de escuchar. */
export function alCerrarSesion(oyente: OyenteCierreSesion): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Avisa a cada oyente una vez; uno que falla no impide avisar a los demás ni a quien cierra. */
export function avisarCierreSesion(motivo: MotivoCierreSesion): void {
  for (const oyente of [...oyentes]) {
    try {
      oyente(motivo);
    } catch {
      // Se sigue con los demás.
    }
  }
}
