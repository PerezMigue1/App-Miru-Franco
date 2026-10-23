import { useRouter } from 'expo-router';
import { useState } from 'react';

import { esSinRespuesta, mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useTextos } from '@/shared/api/useTextos';
import { useCandado } from '@/shared/ui/useCandado';

import {
  estadoHttp,
  normalizarCorreo,
  problemaDeCorreo,
} from '../models/AuthModel';
import { solicitarEnlaceRecuperacion } from '../models/authService';

/** Mismo mensaje siempre (del catálogo): no revela si el correo tiene cuenta. */
const mensajeNeutro = () => obtenerTexto('auth.recuperar.neutro');

export interface RecuperarViewModel {
  correo: string;
  setCorreo: (texto: string) => void;
  errorCorreo: string | null;
  error: string | null;
  mensaje: string | null;
  cargando: boolean;
  enviar: () => void;
  volver: () => void;
  /**
   * Nota fija para las cuentas de Google (no tienen contraseña ni reciben este correo). Siempre se
   * muestra: nunca depende de la respuesta del servidor, que no dice si el correo tiene cuenta.
   */
  notaGoogle: string;
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
      setMensaje(mensajeNeutro());
    } catch (fallo) {
      if (esSinRespuesta(fallo) || estadoHttp(fallo) === 429) {
        setError(mensajeParaClienta(fallo));
      } else {
        // Cualquier otra respuesta del servidor muestra el mismo mensaje neutro.
        setMensaje(mensajeNeutro());
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

  const notaGoogle = useTextos()('auth.recuperar.notaGoogle');

  return { correo, setCorreo, errorCorreo, error, mensaje, cargando, enviar, volver, notaGoogle };
}
