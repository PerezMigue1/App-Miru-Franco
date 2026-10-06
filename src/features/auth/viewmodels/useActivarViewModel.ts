import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

import { soloDigitos } from '@/shared/ui/digitos';
import { useCandado } from '@/shared/ui/useCandado';

import {
  MENSAJE_DEMASIADOS_INTENTOS,
  MENSAJE_SIN_CONEXION,
  esCodigoValido,
  esErrorDeRed,
  estadoHttp,
  mensajeDelServidor,
} from '../models/AuthModel';
import { reenviarCodigo, verificarCodigo } from '../models/authService';
import type { RutaAcceso } from './useRetornoActivacion';

const ESPERA_REENVIO_S = 60;
const LARGO_CODIGO = 6;
const UN_SEGUNDO_MS = 1000;
const MENSAJE_CODIGO_INCORRECTO =
  'El código es incorrecto o ha expirado. Solicita uno nuevo con «Reenviar código».';

export interface ActivarViewModel {
  email: string;
  codigo: string;
  setCodigo: (texto: string) => void;
  error: string | null;
  mensaje: string | null;
  cargando: boolean;
  reenviando: boolean;
  /** Segundos que faltan para poder pedir otro código (0 = ya se puede). */
  espera: number;
  verificar: () => void;
  reenviar: () => void;
  volver: () => void;
}

function mensajeDeVerificacion(error: unknown): string {
  if (esErrorDeRed(error)) {
    return MENSAJE_SIN_CONEXION;
  }
  const estado = estadoHttp(error);
  if (estado === 429) {
    return MENSAJE_DEMASIADOS_INTENTOS;
  }
  if (estado === 400 || estado === 401 || estado === 404) {
    return MENSAJE_CODIGO_INCORRECTO;
  }
  return mensajeDelServidor(error, MENSAJE_CODIGO_INCORRECTO);
}

/**
 * Activación de la cuenta con el código de 6 dígitos (vence en 2 minutos). Entre reenvíos hay una
 * espera visible de 60 segundos; si se llega justo después del registro, la espera ya corre.
 * Toda salida (éxito, "Volver" o Atrás de Android) regresa a la pantalla de acceso que la abrió,
 * con el correo, para que muestre Acceso y reinicie el registro.
 */
export function useActivarViewModel(
  email: string,
  recienEnviado: boolean,
  volverA: RutaAcceso,
): ActivarViewModel {
  const { dismissTo } = useRouter();
  const [codigo, setCodigoCrudo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [espera, setEspera] = useState(recienEnviado ? ESPERA_REENVIO_S : 0);

  /**
   * Regresa a la pantalla de acceso que abrió la activación (sin crear otra si ya está en la pila;
   * si no está, la reemplaza). "vuelta" cambia cada vez para que el regreso se atienda siempre.
   */
  const regresar = useCallback(
    (activada: boolean) => {
      dismissTo({
        pathname: volverA,
        params: {
          correo: email,
          vuelta: String(Date.now()),
          ...(activada ? { activada: '1' } : {}),
        },
      });
    },
    [dismissTo, email, volverA],
  );

  // El Atrás de Android sale por el mismo camino que "Volver a iniciar sesión".
  useFocusEffect(
    useCallback(() => {
      const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
        regresar(false);
        return true;
      });
      return () => suscripcion.remove();
    }, [regresar]),
  );

  useEffect(() => {
    if (espera <= 0) {
      return undefined;
    }
    const temporizador = setTimeout(() => setEspera((s) => Math.max(0, s - 1)), UN_SEGUNDO_MS);
    return () => clearTimeout(temporizador);
  }, [espera]);

  const setCodigo = (texto: string) => {
    setCodigoCrudo(soloDigitos(texto).slice(0, LARGO_CODIGO));
    setError(null);
  };

  const enviarVerificacion = async () => {
    if (!email) {
      setError('No sabemos a qué correo se envió el código. Vuelve a iniciar sesión.');
      return;
    }
    if (!esCodigoValido(codigo)) {
      setError('El código debe tener 6 dígitos');
      return;
    }
    setError(null);
    setMensaje(null);
    setCargando(true);
    try {
      const respuesta = await verificarCodigo(email, codigo);
      if (respuesta?.success === false) {
        setError(MENSAJE_CODIGO_INCORRECTO);
        return;
      }
      regresar(true);
    } catch (fallo) {
      setError(mensajeDeVerificacion(fallo));
    } finally {
      setCargando(false);
    }
  };

  const enviarReenvio = async () => {
    setError(null);
    setMensaje(null);
    setReenviando(true);
    try {
      await reenviarCodigo(email);
      setCodigoCrudo('');
      setMensaje('Te enviamos un código nuevo. Revisa tu correo.');
      setEspera(ESPERA_REENVIO_S);
    } catch (fallo) {
      if (estadoHttp(fallo) === 429) {
        setEspera(ESPERA_REENVIO_S);
      }
      setError(
        esErrorDeRed(fallo)
          ? MENSAJE_SIN_CONEXION
          : mensajeDelServidor(fallo, 'No pudimos reenviar el código. Intenta de nuevo.'),
      );
    } finally {
      setReenviando(false);
    }
  };

  const candadoVerificar = useCandado();
  const candadoReenvio = useCandado();
  const verificar = () => {
    if (cargando) {
      return;
    }
    // Candado inmediato además de cargando: enviarVerificacion() ya muestra cualquier error en pantalla.
    candadoVerificar(enviarVerificacion);
  };

  const reenviar = () => {
    if (reenviando || espera > 0 || !email) {
      return;
    }
    // Candado inmediato además de cargando: enviarReenvio() ya muestra cualquier error en pantalla.
    candadoReenvio(enviarReenvio);
  };

  const volver = () => regresar(false);

  return {
    email,
    codigo,
    setCodigo,
    error,
    mensaje,
    cargando,
    reenviando,
    espera,
    verificar,
    reenviar,
    volver,
  };
}
