import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import {
  ApiError,
  accesoPorVencer,
  alExpirarSesion,
  esperarRenovacionEnCurso,
  renovarSesion,
  renovarSesionSiVigente,
} from '@/shared/api/apiClient';
import {
  aMarcaDeTiempo,
  borrarSesion,
  cerrarSesionDeGeneracion,
  generacionActual,
  guardarSesion,
  guardarUsuario,
  leerSesion,
  nuevaGeneracion,
  type SesionGuardada,
} from '@/shared/api/tokenStorage';

import { ErrorRolNoPermitido, ROL_CLIENTE, type UsuarioSesion } from '../models/AuthModel';
import {
  cerrarSesionServidor,
  iniciarSesion,
  normalizarUsuario,
  obtenerPerfil,
  type SesionARevocar,
} from '../models/authService';

export type EstadoSesion = 'cargando' | 'autenticado' | 'anonimo';

interface ContextoAuth {
  estado: EstadoSesion;
  usuario: UsuarioSesion | null;
  /** Inicia sesión. Lanza ApiError, ErrorDeRed o ErrorRolNoPermitido. */
  ingresar: (email: string, password: string) => Promise<void>;
  /**
   * Cierra la sesión: espera la renovación en curso, borra la sesión local (con un reintento) y
   * después la revoca en el servidor sin esperar (si el acceso venció, antes lo renueva solo en
   * memoria). Devuelve false si no se pudo borrar: la sesión sigue abierta.
   */
  salir: () => Promise<boolean>;
  /** La sesión venció o el servidor la rechazó (no por "Cerrar sesión"): se avisa una vez. */
  sesionVencida: boolean;
  descartarAvisoSesion: () => void;
  /**
   * Tras editar el perfil: el nombre nuevo en memoria y en la sesión guardada, solo si la sesión
   * sigue siendo la misma generación con la que se guardó.
   */
  actualizarNombre: (nombre: string, generacion: number) => void;
  /**
   * Tras cambiar la contraseña: el servidor ya revocó el token, así que solo se borra la sesión
   * local (sin /logout) y se pide abrir Acceso con su aviso. No es una sesión vencida.
   */
  cerrarTrasCambioDeContrasena: () => Promise<void>;
  /** Acceso debe abrirse con su aviso y el correo escrito (tras cambiar la contraseña). */
  avisoAcceso: { correo: string } | null;
  descartarAvisoAcceso: () => void;
}

const RENOVAR_CADA_MS = 10 * 60 * 1000;

const Contexto = createContext<ContextoAuth | null>(null);

/**
 * Cierra en el servidor una sesión (con su refreshToken, si lo tiene), sin bloquear ni fallar si
 * no hay red.
 */
function avisarCierre(sesion: SesionARevocar | null): void {
  if (!sesion?.token) {
    return;
  }
  cerrarSesionServidor(sesion).catch(() => {
    // La sesión se descarta en el dispositivo de todos modos.
  });
}

/** Borra la sesión local; si falla, lo intenta una vez más. Devuelve si quedó borrada. */
async function borrarConReintento(): Promise<boolean> {
  try {
    await borrarSesion();
    return true;
  } catch {
    try {
      await borrarSesion();
      return true;
    } catch {
      return false;
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>('cargando');
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [sesionVencida, setSesionVencida] = useState(false);
  const [avisoAcceso, setAvisoAcceso] = useState<{ correo: string } | null>(null);

  const quedarAnonimo = useCallback(() => {
    setUsuario(null);
    setEstado('anonimo');
  }, []);

  // apiClient avisa aquí cuando la sesión expira (401 sin renovación posible): además de quedar
  // sin sesión, se marca para avisarle a la clienta.
  useEffect(
    () =>
      alExpirarSesion(() => {
        quedarAnonimo();
        setSesionVencida(true);
      }),
    [quedarAnonimo],
  );

  const descartarAvisoSesion = useCallback(() => setSesionVencida(false), []);
  const descartarAvisoAcceso = useCallback(() => setAvisoAcceso(null), []);

  // Restaura la sesión guardada y la valida con /api/auth/me: solo un 401 la cierra. Si mientras
  // tanto se inicia o se cierra sesión (cambia la generación), el resultado se descarta.
  useEffect(() => {
    let activo = true;
    const generacion = generacionActual();
    const vigente = () => activo && generacion === generacionActual();
    // Sesión de alguien que no es clienta: se cierra por generación (una renovación pudo cambiar
    // el token mientras tanto) y se revoca la sesión que estaba guardada.
    const cerrarNoCliente = async () => {
      const cerrado = await cerrarSesionDeGeneracion(generacion);
      if (cerrado) {
        avisarCierre(cerrado);
        if (activo) {
          quedarAnonimo();
        }
      }
    };
    const restaurar = async () => {
      let guardada: SesionGuardada | null = null;
      try {
        guardada = await leerSesion();
      } catch {
        guardada = null;
      }
      if (!vigente()) {
        return;
      }
      if (!guardada) {
        quedarAnonimo();
        return;
      }
      if (guardada.usuario.rol !== ROL_CLIENTE) {
        await cerrarNoCliente();
        return;
      }
      if (guardada.refreshToken && accesoPorVencer(guardada)) {
        // Sesión móvil con el acceso vencido o por vencer: se renueva en silencio antes de entrar
        // (el splash sigue a la vista mientras el estado sea 'cargando').
        const resultado = await renovarSesion();
        if (!vigente() || resultado === 'descartada') {
          return;
        }
        if (resultado === 'rechazada') {
          // Si la renovación hubiera cerrado la sesión, la generación ya habría cambiado: aquí no
          // pudo borrarla (o ya no había). Se intenta de nuevo y se queda sin sesión con su aviso.
          await borrarSesion().catch(() => undefined);
          if (activo) {
            quedarAnonimo();
            setSesionVencida(true);
          }
          return;
        }
        if (resultado === 'fallida') {
          // Sin red, límite o error del servidor: se entra con la sesión guardada. No se pide /me,
          // que solo volvería a intentar la renovación.
          setUsuario(guardada.usuario);
          setEstado('autenticado');
          return;
        }
      }
      setUsuario(guardada.usuario);
      setEstado('autenticado');
      try {
        const perfil = normalizarUsuario((await obtenerPerfil())?.data);
        if (!vigente() || !perfil) {
          return;
        }
        if (perfil.rol !== ROL_CLIENTE) {
          await cerrarNoCliente();
          return;
        }
        if (await guardarUsuario(perfil, generacion)) {
          setUsuario(perfil);
        }
      } catch {
        // Un 401 ya lo resolvió apiClient (renovó, o expiró la sesión y avisó al manejador);
        // sin red o con error del servidor la sesión se conserva.
      }
    };
    restaurar().catch(() => {
      if (vigente()) {
        quedarAnonimo();
      }
    });
    return () => {
      activo = false;
    };
  }, [quedarAnonimo]);

  // Sesiones sin refreshToken: renovación cada 10 minutos con la app activa y al volver a primer
  // plano (renovarSesionSiVigente no hace nada con una sesión móvil, que renueva al pedir).
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
    // Iniciar sesión abre una generación nueva: lo que siga en curso de antes se descarta.
    const generacion = nuevaGeneracion();
    const respuesta = await iniciarSesion(email, password);
    const datos = normalizarUsuario(respuesta?.usuario);
    const token = typeof respuesta?.token === 'string' ? respuesta.token : '';
    if (!datos || !token) {
      throw new ApiError(500, 'La respuesta del servidor no trae una sesión válida.');
    }
    const emitidoEn = Date.now();
    const refreshToken =
      typeof respuesta.refreshToken === 'string' && respuesta.refreshToken ? respuesta.refreshToken : undefined;
    const emitida: SesionARevocar = refreshToken ? { token, emitidoEn, refreshToken } : { token, emitidoEn };
    if (datos.rol !== ROL_CLIENTE) {
      // No se guarda nada: se revoca la sesión recién emitida y se avisa.
      avisarCierre(emitida);
      throw new ErrorRolNoPermitido();
    }
    const sesion: SesionGuardada = { ...emitida, usuario: datos };
    const refreshExpiraEn = refreshToken ? aMarcaDeTiempo(respuesta.refreshExpiraEn) : undefined;
    if (refreshExpiraEn !== undefined) {
      sesion.refreshExpiraEn = refreshExpiraEn;
    }
    // Si mientras tanto empezó otro inicio o un cierre de sesión, esta sesión no se guarda.
    let guardada = false;
    try {
      guardada = await guardarSesion(sesion, generacion);
    } catch (error) {
      // No quedó guardada: se revoca la sesión recién emitida.
      avisarCierre(emitida);
      throw error;
    }
    if (!guardada) {
      avisarCierre(emitida);
      return;
    }
    setUsuario(datos);
    setEstado('autenticado');
    setSesionVencida(false);
  }, []);

  const actualizarNombre = useCallback(
    (nombre: string, generacion: number) => {
      if (!usuario || generacion !== generacionActual()) {
        return;
      }
      const nuevo = { ...usuario, nombre };
      setUsuario(nuevo);
      guardarUsuario(nuevo, generacion).catch(() => {
        // La sesión guardada se corrige con el próximo /me al abrir la app.
      });
    },
    [usuario],
  );

  const salir = useCallback(async () => {
    // Una renovación en curso termina primero: así no queda un refreshToken rotado sin guardar y
    // se lee el vigente para revocarlo.
    await esperarRenovacionEnCurso();
    // Cerrar sesión abre una generación nueva: renovaciones y /me en curso ya no escriben nada.
    nuevaGeneracion();
    let sesion: SesionGuardada | null = null;
    try {
      sesion = await leerSesion();
    } catch {
      sesion = null;
    }
    if (!(await borrarConReintento())) {
      // La sesión local sigue guardada: no se muestra cerrada ni se revoca en el servidor.
      return false;
    }
    avisarCierre(sesion);
    quedarAnonimo();
    return true;
  }, [quedarAnonimo]);

  const cerrarTrasCambioDeContrasena = useCallback(async () => {
    // Generación nueva: un 401 tardío del token revocado (renovación, /me) ya no avisa
    // "Tu sesión terminó" ni escribe nada.
    nuevaGeneracion();
    // Solo el correo, para escribirlo en Acceso; nada más de la cuenta queda en memoria.
    const correo = usuario?.email ?? '';
    // Si el borrado local fallara, el token guardado ya no sirve: al reabrir, /me lo rechaza.
    await borrarConReintento();
    setSesionVencida(false);
    setAvisoAcceso({ correo });
    quedarAnonimo();
  }, [usuario, quedarAnonimo]);

  const valor = useMemo(
    () => ({
      estado,
      usuario,
      ingresar,
      salir,
      sesionVencida,
      descartarAvisoSesion,
      actualizarNombre,
      cerrarTrasCambioDeContrasena,
      avisoAcceso,
      descartarAvisoAcceso,
    }),
    [
      estado,
      usuario,
      ingresar,
      salir,
      sesionVencida,
      descartarAvisoSesion,
      actualizarNombre,
      cerrarTrasCambioDeContrasena,
      avisoAcceso,
      descartarAvisoAcceso,
    ],
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
