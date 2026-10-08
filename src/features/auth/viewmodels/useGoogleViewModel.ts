import { useState } from 'react';

import { useCandado } from '@/shared/ui/useCandado';

import { ErrorRolNoPermitido } from '../models/AuthModel';
import { useAuth } from './useAuth';

const MENSAJE_ERROR_GOOGLE = 'No pudimos iniciar sesión con Google. Inténtalo de nuevo.';

export interface GoogleViewModel {
  /** El navegador de Google está abierto o la sesión se está creando. */
  abriendo: boolean;
  error: string | null;
  /** Abre Google. El formulario lo deshabilita mientras haya otro inicio en curso. */
  entrar: () => void;
  limpiarError: () => void;
}

/**
 * Inicio de sesión con Google: abre el navegador y, si la clienta entra, la sesión guardada hace
 * que las rutas protegidas cierren Acceso (igual que el login con correo; aquí no se navega).
 * Cancelar o cerrar el navegador solo termina la carga, sin mensaje.
 */
export function useGoogleViewModel(): GoogleViewModel {
  const { ingresarConGoogle } = useAuth();
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = async () => {
    setAbriendo(true);
    setError(null);
    try {
      await ingresarConGoogle();
    } catch (e) {
      // Una cuenta que no es de clienta lleva el mismo mensaje que el login con correo.
      setError(e instanceof ErrorRolNoPermitido ? e.message : MENSAJE_ERROR_GOOGLE);
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

  const limpiarError = () => setError(null);

  return { abriendo, error, entrar, limpiarError };
}
