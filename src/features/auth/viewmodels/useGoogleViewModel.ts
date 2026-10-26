import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';

import { esSinRespuesta, mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useCandado } from '@/shared/ui/useCandado';

import { ErrorCuentaDesactivada, ErrorRolNoPermitido, MENSAJE_ROL_NO_PERMITIDO, estadoHttp } from '../models/AuthModel';
import { useAuth } from './useAuth';
import { rutaAcceso } from './useRetornoActivacion';

/**
 * Una cuenta que no es de clienta lleva el mismo mensaje que el login con correo. Sin respuesta del
 * servidor (sin red o tiempo agotado) o con el límite de solicitudes, el texto de mensajeParaClienta;
 * cualquier otro fallo (del navegador, del canje o de /me, con o sin code), el mensaje de Google: el
 * code de un canje (por ejemplo CODIGO_INVALIDO) habla del código de Google, no de uno del correo.
 * El regreso con `error=cuenta_desactivada` (ErrorCuentaDesactivada) lleva el aviso de la cuenta
 * desactivada.
 */
function mensajeDeGoogle(error: unknown): string {
  if (error instanceof ErrorCuentaDesactivada) {
    return obtenerTexto('cuenta.login.desactivada');
  }
  if (error instanceof ErrorRolNoPermitido) {
    return MENSAJE_ROL_NO_PERMITIDO;
  }
  return esSinRespuesta(error) || estadoHttp(error) === 429 ? mensajeParaClienta(error) : obtenerTexto('auth.google.error');
}

export interface GoogleViewModel {
  /** El navegador de Google está abierto o la sesión se está creando. */
  abriendo: boolean;
  error: string | null;
  /** Google regresó con la cuenta desactivada por su titular: el formulario ofrece Reactivar. */
  cuentaDesactivada: boolean;
  /** Abre Google. El formulario lo deshabilita mientras haya otro inicio en curso. */
  entrar: () => void;
  limpiarError: () => void;
  /** Abre Reactivar sin correo (la clienta de Google lo escribe ahí); regresa a esta pantalla de acceso. */
  reactivar: () => void;
}

/**
 * Inicio de sesión con Google: abre el navegador y, si la clienta entra, la sesión guardada hace
 * que las rutas protegidas cierren Acceso (igual que el login con correo; aquí no se navega).
 * Cancelar o cerrar el navegador solo termina la carga, sin mensaje.
 */
export function useGoogleViewModel(): GoogleViewModel {
  const { ingresarConGoogle } = useAuth();
  const { push } = useRouter();
  const ruta = usePathname();
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuentaDesactivada, setCuentaDesactivada] = useState(false);

  const abrir = async () => {
    setAbriendo(true);
    setError(null);
    setCuentaDesactivada(false);
    try {
      await ingresarConGoogle();
    } catch (e) {
      setCuentaDesactivada(e instanceof ErrorCuentaDesactivada);
      setError(mensajeDeGoogle(e));
    } finally {
      setAbriendo(false);
    }
  };

  const candado = useCandado();
  const entrar = () => {
    if (abriendo) {
      return;
    }
    // Candado inmediato además de abriendo: abrir() ya muestra cualquier error en pantalla.
    candado(abrir);
  };

  const limpiarError = () => {
    setError(null);
    setCuentaDesactivada(false);
  };

  const reactivar = () => {
    if (abriendo) {
      return;
    }
    push({ pathname: '/reactivar', params: { volverA: rutaAcceso(ruta) } });
  };

  return { abriendo, error, cuentaDesactivada, entrar, limpiarError, reactivar };
}
