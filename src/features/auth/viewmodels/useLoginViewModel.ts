import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';

import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useCandado } from '@/shared/ui/useCandado';

import {
  ErrorRolNoPermitido,
  MENSAJE_ROL_NO_PERMITIDO,
  esCuentaSinActivar,
  estadoHttp,
  normalizarCorreo,
  problemaDeCorreo,
} from '../models/AuthModel';
import { useAuth } from './useAuth';
import { rutaAcceso } from './useRetornoActivacion';

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
  /** Al regresar de la activación: el correo escrito y nada más (sin contraseña ni errores). */
  prepararAcceso: (correo: string) => void;
}

const SIN_ERRORES: ErroresLogin = { correo: null, clave: null };

function mensajeDeLogin(error: unknown): string {
  if (error instanceof ErrorRolNoPermitido) {
    return MENSAJE_ROL_NO_PERMITIDO;
  }
  const estado = estadoHttp(error);
  if (estado === 401) {
    return obtenerTexto('auth.login.credenciales');
  }
  // 403 sin code del login: bloqueo temporal tras intentos fallidos (el backend no manda los minutos aparte).
  return mensajeParaClienta(error, {
    respaldo: obtenerTexto(estado === 403 ? 'auth.login.bloqueo' : 'auth.login.noSePudo'),
  });
}

/**
 * Inicio de sesión (CP-01 y CP-02): valida, llama al backend y, si todo sale bien, la sesión
 * guardada hace que las rutas protegidas abran Inicio. Una credencial inválida solo muestra un
 * mensaje: no se crea ninguna sesión.
 */
export function useLoginViewModel(): LoginViewModel {
  const { ingresar } = useAuth();
  const { push } = useRouter();
  const ruta = usePathname();
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
        // La activación regresa a esta misma pantalla de acceso.
        push({ pathname: '/activar', params: { email, volverA: rutaAcceso(ruta) } });
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

  const prepararAcceso = (texto: string) => {
    setCorreoCrudo(texto);
    setCorreoEnVivo(false);
    setClave('');
    setErrores(SIN_ERRORES);
    setErrorGeneral(null);
  };

  return {
    correo,
    setCorreo,
    salirCorreo,
    clave,
    setClave,
    errores,
    errorGeneral,
    cargando,
    entrar,
    prepararAcceso,
  };
}
