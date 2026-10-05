import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useCandado } from '@/shared/ui/useCandado';

import {
  MENSAJE_DEMASIADOS_INTENTOS,
  MENSAJE_SIN_CONEXION,
  esErrorDeRed,
  estadoHttp,
  normalizarCorreo,
  problemaDeCorreo,
} from '../models/AuthModel';
import { solicitarEnlaceRecuperacion } from '../models/authService';

/** Mismo mensaje siempre: no revela si el correo tiene cuenta. */
const MENSAJE_NEUTRO =
  'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña';

export interface RecuperarViewModel {
  correo: string;
  setCorreo: (texto: string) => void;
  errorCorreo: string | null;
  error: string | null;
  mensaje: string | null;
  cargando: boolean;
  enviar: () => void;
  volver: () => void;
}

export function useRecuperarViewModel(): RecuperarViewModel {
  const { back, canGoBack, replace } = useRouter();
  const [correo, setCorreoCrudo] = useState('');
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const setCorreo = (texto: string) => {
    setCorreoCrudo(texto);
    setErrorCorreo(null);
  };

  const solicitar = async () => {
    const problema = problemaDeCorreo(correo);
    setErrorCorreo(problema);
    setError(null);
    setMensaje(null);
    if (problema) {
      return;
    }
    setCargando(true);
    try {
      await solicitarEnlaceRecuperacion(normalizarCorreo(correo));
      setMensaje(MENSAJE_NEUTRO);
    } catch (fallo) {
      if (esErrorDeRed(fallo)) {
        setError(MENSAJE_SIN_CONEXION);
      } else if (estadoHttp(fallo) === 429) {
        setError(MENSAJE_DEMASIADOS_INTENTOS);
      } else {
        // Cualquier otra respuesta del servidor muestra el mismo mensaje neutro.
        setMensaje(MENSAJE_NEUTRO);
      }
    } finally {
      setCargando(false);
    }
  };

  const candado = useCandado();
  const enviar = () => {
    if (cargando) {
      return;
    }
    // Candado inmediato además de cargando: solicitar() ya muestra cualquier error en pantalla.
    candado(solicitar);
  };

  const volver = () => {
    if (canGoBack()) {
      back();
    } else {
      replace('/login');
    }
  };

  return { correo, setCorreo, errorCorreo, error, mensaje, cargando, enviar, volver };
}
