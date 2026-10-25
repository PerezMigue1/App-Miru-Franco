import { usePathname, useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { CODIGO_BLOQUEO_TEMPORAL, mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { useTextos } from '@/shared/api/useTextos';
import { useCandado } from '@/shared/ui/useCandado';

import {
  ErrorRolNoPermitido,
  MENSAJE_ROL_NO_PERMITIDO,
  esBloqueoTemporal,
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
  /** Tras un 429 (límite o BLOQUEO_TEMPORAL): "Entrar" queda deshabilitado hasta que pase la espera. */
  enEspera: boolean;
  /** Texto de "Entrar": "Entrando…" o, tras un 429, "Intenta de nuevo en N s". */
  textoEntrar: string;
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
  // Un 429 (límite o BLOQUEO_TEMPORAL) muestra su message en español; el aviso propio de bloqueo es
  // el respaldo del BLOQUEO_TEMPORAL sin message y del 403 sin code (bloqueo de antes de GP-09).
  return mensajeParaClienta(error, {
    porCode: { [CODIGO_BLOQUEO_TEMPORAL]: obtenerTexto('auth.login.bloqueo') },
    respaldo: obtenerTexto(estado === 403 ? 'auth.login.bloqueo' : 'auth.login.noSePudo'),
  });
}

/**
 * Inicio de sesión (CP-01 y CP-02): valida, llama al backend y, si todo sale bien, la sesión
 * guardada hace que las rutas protegidas abran Inicio. Una credencial inválida solo muestra un
 * mensaje: no se crea ninguna sesión. Un 429 (incluido BLOQUEO_TEMPORAL) nunca es sesión vencida ni
 * cuenta sin activar: muestra el message del servidor y deja "Entrar" en espera (useEsperaLimite).
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
  const limite = useEsperaLimite();
  const texto = useTextos();
  // Correo (normalizado) del 429 BLOQUEO_TEMPORAL que dejó "Entrar" en espera; null si la espera es
  // por IP (429 sin code), que sigue aunque se cambie el correo.
  const bloqueoDe = useRef<string | null>(null);

  const setCorreo = (texto: string) => {
    setCorreoCrudo(texto);
    if (bloqueoDe.current !== null && normalizarCorreo(texto) !== bloqueoDe.current) {
      // El bloqueo era de esa cuenta: con otro correo se puede intentar de nuevo.
      bloqueoDe.current = null;
      limite.detener();
    }
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
      if (limite.esperarSiLimite(error)) {
        bloqueoDe.current = esBloqueoTemporal(error) ? email : null;
      }
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
    if (cargando || limite.activa) {
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
    enEspera: limite.activa,
    textoEntrar: limite.texto ?? texto(cargando ? 'auth.login.entrando' : 'auth.login.entrar'),
    entrar,
    prepararAcceso,
  };
}
