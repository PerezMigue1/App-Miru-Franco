import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { bienvenidaVista, marcarBienvenidaVista } from '@/shared/ui/preferencias';

import { useAuth } from './useAuth';

export interface BienvenidaViewModel {
  visible: boolean;
  crearCuenta: () => void;
  iniciarSesion: () => void;
  explorar: () => void;
}

/**
 * Hoja de bienvenida de la primera apertura: una sola vez, sin sesión y cuando la intro de la
 * grieta ya terminó. La marca de "ya vista" no se borra al cerrar sesión.
 */
export function useBienvenida(introTerminada: boolean): BienvenidaViewModel {
  const { estado } = useAuth();
  const { push } = useRouter();
  const [pendiente, setPendiente] = useState(false);

  useEffect(() => {
    let activo = true;
    bienvenidaVista()
      .then((vista) => {
        if (activo) {
          setPendiente(!vista);
        }
      })
      .catch(() => {
        // bienvenidaVista ya absorbe sus errores.
      });
    return () => {
      activo = false;
    };
  }, []);

  // Si ya hay sesión (por ejemplo, tras actualizar la app), no hace falta mostrarla nunca.
  useEffect(() => {
    if (pendiente && estado === 'autenticado') {
      setPendiente(false);
      marcarBienvenidaVista().catch(() => undefined);
    }
  }, [pendiente, estado]);

  const cerrar = () => {
    setPendiente(false);
    marcarBienvenidaVista().catch(() => {
      // marcarBienvenidaVista ya absorbe sus errores.
    });
  };

  return {
    visible: pendiente && introTerminada && estado === 'anonimo',
    crearCuenta: () => {
      cerrar();
      push('/registro');
    },
    iniciarSesion: () => {
      cerrar();
      push('/login');
    },
    explorar: cerrar,
  };
}
