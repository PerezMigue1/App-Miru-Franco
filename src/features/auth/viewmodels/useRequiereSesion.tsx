import { useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { HojaAcceso } from '../components/HojaAcceso';
import { useAuth } from './useAuth';

interface ContextoSesionRequerida {
  /** Abre la hoja; la acción (si la hay) se hace en cuanto la clienta inicie sesión. */
  pedirSesion: (accion?: () => void) => void;
  /** Cerrar Acceso sin iniciar sesión: la acción pendiente ya no se hará. */
  descartarPendiente: () => void;
}

const Contexto = createContext<ContextoSesionRequerida>({
  pedirSesion: () => undefined,
  descartarPendiente: () => undefined,
});

/**
 * Monta la hoja "Inicia sesión para continuar" una sola vez para toda la app y guarda la acción
 * que la pidió para continuarla tras iniciar sesión.
 */
export function SesionRequeridaProvider({ children }: { children: ReactNode }) {
  const { push } = useRouter();
  const { estado } = useAuth();
  const [visible, setVisible] = useState(false);
  const pendiente = useRef<(() => void) | null>(null);

  const pedirSesion = useCallback((accion?: () => void) => {
    pendiente.current = accion ?? null;
    setVisible(true);
  }, []);

  // Al iniciar sesión se continúa lo que se pidió, una sola vez.
  useEffect(() => {
    if (estado !== 'autenticado') {
      return;
    }
    setVisible(false);
    const accion = pendiente.current;
    pendiente.current = null;
    accion?.();
  }, [estado]);

  const descartarPendiente = useCallback(() => {
    pendiente.current = null;
  }, []);

  const cerrar = () => {
    // Cerrar la hoja sin elegir descarta la acción.
    pendiente.current = null;
    setVisible(false);
  };
  const ir = (ruta: '/login' | '/registro') => {
    setVisible(false);
    push(ruta);
  };

  const valor = useMemo(() => ({ pedirSesion, descartarPendiente }), [pedirSesion, descartarPendiente]);
  return (
    <Contexto.Provider value={valor}>
      {children}
      <HojaAcceso
        visible={visible}
        onCerrar={cerrar}
        onIniciarSesion={() => ir('/login')}
        onCrearCuenta={() => ir('/registro')}
      />
    </Contexto.Provider>
  );
}

/** Para Login y Registro: al cerrarlos sin iniciar sesión se descarta la acción pendiente. */
export function useDescartarPendiente(): () => void {
  return useContext(Contexto).descartarPendiente;
}

/**
 * Pide sesión antes de una acción (GP-06: reservar, carrito): con sesión la ejecuta; sin sesión
 * abre la hoja de acceso. Sin acción, solo abre la hoja.
 */
export function useRequiereSesion(): (accion?: () => void) => void {
  const { estado } = useAuth();
  const { pedirSesion } = useContext(Contexto);
  return useCallback(
    (accion?: () => void) => {
      if (estado === 'autenticado') {
        accion?.();
        return;
      }
      pedirSesion(accion);
    },
    [estado, pedirSesion],
  );
}
