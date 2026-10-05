import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { ApiError, alExpirarSesion, renovarSesionSiVigente } from '@/shared/api/apiClient';
import {
  borrarSesion,
  getToken,
  guardarSesion,
  guardarUsuario,
  leerSesion,
  type SesionGuardada,
} from '@/shared/api/tokenStorage';

import { ErrorRolNoPermitido, ROL_CLIENTE, type UsuarioSesion } from '../models/AuthModel';
import {
  cerrarSesionServidor,
  iniciarSesion,
  normalizarUsuario,
  obtenerPerfil,
} from '../models/authService';

export type EstadoSesion = 'cargando' | 'autenticado' | 'anonimo';

interface ContextoAuth {
  estado: EstadoSesion;
  usuario: UsuarioSesion | null;
  /** Inicia sesión. Lanza ApiError, ErrorDeRed o ErrorRolNoPermitido. */
  ingresar: (email: string, password: string) => Promise<void>;
  /** Cierra la sesión: avisa al servidor sin esperar y siempre borra la sesión local. */
  salir: () => Promise<void>;
}

const RENOVAR_CADA_MS = 10 * 60 * 1000;

const Contexto = createContext<ContextoAuth | null>(null);

/** Cierra en el servidor la sesión de un token, sin bloquear ni fallar si no hay red. */
function avisarCierre(token: string | null): void {
  if (!token) {
    return;
  }
  cerrarSesionServidor(token).catch(() => {
    // El token se descarta en el dispositivo de todos modos.
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>('cargando');
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);

  const quedarAnonimo = useCallback(() => {
    setUsuario(null);
    setEstado('anonimo');
  }, []);

  // apiClient avisa aquí cuando la sesión expira (401 sin renovación posible).
  useEffect(() => alExpirarSesion(quedarAnonimo), [quedarAnonimo]);

  // Restaura la sesión guardada y la valida con /api/auth/me: solo un 401 la cierra.
  useEffect(() => {
    let activo = true;
    const restaurar = async () => {
      let guardada: SesionGuardada | null = null;
      try {
        guardada = await leerSesion();
      } catch {
        guardada = null;
      }
      if (!activo) {
        return;
      }
      if (!guardada || guardada.usuario.rol !== ROL_CLIENTE) {
        if (guardada) {
          await borrarSesion();
        }
        quedarAnonimo();
        return;
      }
      setUsuario(guardada.usuario);
      setEstado('autenticado');
      try {
        const perfil = normalizarUsuario((await obtenerPerfil())?.data);
        if (!activo || !perfil) {
          return;
        }
        if (perfil.rol !== ROL_CLIENTE) {
          avisarCierre(await getToken());
          await borrarSesion();
          quedarAnonimo();
          return;
        }
        setUsuario(perfil);
        await guardarUsuario(perfil);
      } catch {
        // Un 401 ya lo resolvió apiClient (renovó, o expiró la sesión y avisó al manejador);
        // sin red o con error del servidor la sesión se conserva.
      }
    };
    restaurar().catch(() => {
      if (activo) {
        quedarAnonimo();
      }
    });
    return () => {
      activo = false;
    };
  }, [quedarAnonimo]);

  // Renovación cada 10 minutos con la app activa y al volver a primer plano.
  useEffect(() => {
    if (estado !== 'autenticado') {
      return undefined;
    }
    const renovar = () => {
      renovarSesionSiVigente().catch(() => {
        // Sin red: se reintenta en el siguiente ciclo.
      });
    };
    let intervalo: ReturnType<typeof setInterval> | null = setInterval(renovar, RENOVAR_CADA_MS);
    const suscripcion = AppState.addEventListener('change', (estadoApp) => {
      if (intervalo) {
        clearInterval(intervalo);
        intervalo = null;
      }
      if (estadoApp === 'active') {
        renovar();
        intervalo = setInterval(renovar, RENOVAR_CADA_MS);
      }
    });
    return () => {
      suscripcion.remove();
      if (intervalo) {
        clearInterval(intervalo);
      }
    };
  }, [estado]);

  const ingresar = useCallback(async (email: string, password: string) => {
    const respuesta = await iniciarSesion(email, password);
    const datos = normalizarUsuario(respuesta?.usuario);
    const token = typeof respuesta?.token === 'string' ? respuesta.token : '';
    if (!datos || !token) {
      throw new ApiError(500, 'La respuesta del servidor no trae una sesión válida.');
    }
    if (datos.rol !== ROL_CLIENTE) {
      // No se guarda nada: se revoca el token recién emitido y se avisa.
      avisarCierre(token);
      throw new ErrorRolNoPermitido();
    }
    await guardarSesion({ token, emitidoEn: Date.now(), usuario: datos });
    setUsuario(datos);
    setEstado('autenticado');
  }, []);

  const salir = useCallback(async () => {
    let token: string | null = null;
    try {
      token = await getToken();
    } catch {
      token = null;
    }
    avisarCierre(token);
    try {
      await borrarSesion();
    } finally {
      quedarAnonimo();
    }
  }, [quedarAnonimo]);

  const valor = useMemo(
    () => ({ estado, usuario, ingresar, salir }),
    [estado, usuario, ingresar, salir],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): ContextoAuth {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.');
  }
  return contexto;
}
