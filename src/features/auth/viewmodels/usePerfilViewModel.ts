import { useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useState } from 'react';

import { useCandado } from '@/shared/ui/useCandado';

import { urlAvisoPrivacidad, type UsuarioSesion } from '../models/AuthModel';
import { useAuth } from './useAuth';

const CIERRE_FALLIDO = 'No se pudo cerrar la sesión. Intenta de nuevo';

export interface PerfilViewModel {
  usuario: UsuarioSesion | null;
  /** Aviso si no se pudo cerrar la sesión (sigue abierta). */
  errorCierre: string | null;
  abrirCitas: () => void;
  abrirAviso: () => void;
  cerrarSesion: () => void;
}

/** Perfil: datos de la sesión, accesos y cierre de sesión. */
export function usePerfilViewModel(): PerfilViewModel {
  const { navigate } = useRouter();
  const { usuario, salir } = useAuth();
  const [errorCierre, setErrorCierre] = useState<string | null>(null);
  const candado = useCandado();

  const abrirCitas = () => navigate('/citas');

  const abrirAviso = () => {
    const url = urlAvisoPrivacidad();
    if (url) {
      openBrowserAsync(url).catch(() => {
        // Sin navegador disponible no hay nada más que hacer aquí.
      });
    }
  };

  const cerrar = async () => {
    setErrorCierre(null);
    // Si no se pudo borrar la sesión, sigue abierta y se avisa.
    const cerrada = await salir();
    if (!cerrada) {
      setErrorCierre(CIERRE_FALLIDO);
    }
  };

  const cerrarSesion = () => {
    candado(cerrar);
  };

  return { usuario, errorCierre, abrirCitas, abrirAviso, cerrarSesion };
}
