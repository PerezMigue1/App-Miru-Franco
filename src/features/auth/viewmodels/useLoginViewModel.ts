import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useCandado } from '@/shared/ui/useCandado';

import {
  ErrorRolNoPermitido,
  MENSAJE_DEMASIADOS_INTENTOS,
  MENSAJE_SIN_CONEXION,
  esCuentaSinActivar,
  esErrorDeRed,
  estadoHttp,
  mensajeDelServidor,
  normalizarCorreo,
  problemaDeCorreo,
} from '../models/AuthModel';
import { useAuth } from './useAuth';

export interface ErroresLogin {
  correo: string | null;
  clave: string | null;
}

export interface LoginViewModel {
  correo: string;
  setCorreo: (texto: string) => void;
  /** Al salir del campo de correo: lo valida y, desde su primer error, en cada cambio. */
  salirCorreo: () => void;
  clave: string;
  setClave: (texto: string) => void;
  errores: ErroresLogin;
  errorGeneral: string | null;
  cargando: boolean;
  entrar: () => void;
}

const SIN_ERRORES: ErroresLogin = { correo: null, clave: null };

function mensajeDeLogin(error: unknown): string {
  if (error instanceof ErrorRolNoPermitido) {
    return error.message;
  }
  if (esErrorDeRed(error)) {
    return MENSAJE_SIN_CONEXION;
  }
  const estado = estadoHttp(error);
  if (estado === 401) {
    return 'Correo o contraseña incorrectos';
  }
  if (estado === 403) {
    // Bloqueo temporal tras intentos fallidos: el mensaje del servidor trae el detalle.
    return mensajeDelServidor(error, 'Tu cuenta está bloqueada temporalmente.');
  }
  if (estado === 429) {
    return MENSAJE_DEMASIADOS_INTENTOS;
  }
  return 'No pudimos iniciar sesión. Intenta de nuevo.';
}

/**
 * Inicio de sesión (CP-01 y CP-02): valida, llama al backend y, si todo sale bien, la sesión
 * guardada hace que las rutas protegidas abran Inicio. Una credencial inválida solo muestra un
 * mensaje: no se crea ninguna sesión.
 */
export function useLoginViewModel(): LoginViewModel {
  const { ingresar } = useAuth();
  const { push } = useRouter();
  const [correo, setCorreoCrudo] = useState('');
  const [correoEnVivo, setCorreoEnVivo] = useState(false);
  const [clave, setClave] = useState('');
  const [errores, setErrores] = useState<ErroresLogin>(SIN_ERRORES);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const setCorreo = (texto: string) => {
    setCorreoCrudo(texto);
    if (correoEnVivo) {
      setErrores((previos) => ({ ...previos, correo: problemaDeCorreo(texto) }));
    }
  };

  const salirCorreo = () => {
    const problema = problemaDeCorreo(correo);
    setErrores((previos) => ({ ...previos, correo: problema }));
    if (problema) {
      setCorreoEnVivo(true);
    }
  };

  const enviar = async () => {
    const nuevos: ErroresLogin = {
      correo: problemaDeCorreo(correo),
      clave: clave ? null : 'La contraseña es requerida',
    };
    setErrores(nuevos);
    setErrorGeneral(null);
    if (nuevos.correo) {
      setCorreoEnVivo(true);
    }
    if (nuevos.correo || nuevos.clave) {
      return;
    }
    const email = normalizarCorreo(correo);
    setCargando(true);
    try {
      await ingresar(email, clave);
    } catch (error) {
      if (esCuentaSinActivar(error)) {
        push({ pathname: '/activar', params: { email } });
      } else {
        setErrorGeneral(mensajeDeLogin(error));
      }
    } finally {
      setCargando(false);
    }
  };

  const candado = useCandado();
  const entrar = () => {
    if (cargando) {
      return;
    }
    // Candado inmediato además de cargando: enviar() ya muestra cualquier error en pantalla.
    candado(enviar);
  };

  return { correo, setCorreo, salirCorreo, clave, setClave, errores, errorGeneral, cargando, entrar };
}
