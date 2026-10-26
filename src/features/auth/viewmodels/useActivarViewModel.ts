import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { useTextos } from '@/shared/api/useTextos';
import { soloDigitos } from '@/shared/ui/digitos';
import { useCandado } from '@/shared/ui/useCandado';

import { esCodigoValido, estadoHttp, mensajeDelReenvio } from '../models/AuthModel';
import { reenviarCodigo, verificarCodigo } from '../models/authService';
import { useAtrasSale } from './useAtrasSale';
import type { RutaAcceso } from './useRetornoActivacion';

const ESPERA_REENVIO_S = 60;
/** Dígitos del código de activación. */
const LARGO_CODIGO = 6;
/** Minutos de vigencia del código de activación (usuarios.service.ts del backend: "expira en 2 minutos"). */
const VIGENCIA_CODIGO_MINUTOS = 2;
const UN_SEGUNDO_MS = 1000;
const mensajeCodigoIncorrecto = () => obtenerTexto('auth.activar.codigoInvalido');

/** Textos de la pantalla de activación, del catálogo, con el correo y las cifras ya puestos. */
export interface TextosActivar {
  titulo: string;
  /** "Escribe el código de 6 dígitos que enviamos a {correo}." (o "a tu correo" sin él). */
  instrucciones: string;
  /** "El código vence en 2 minutos." */
  vigencia: string;
  verificar: string;
  verificando: string;
  /** "Podrás pedir otro código en {segundos} s" con la espera que queda. */
  espera: string;
  reenviar: string;
  reenviando: string;
  volver: string;
}

export interface ActivarViewModel {
  email: string;
  codigo: string;
  setCodigo: (texto: string) => void;
  error: string | null;
  mensaje: string | null;
  cargando: boolean;
  reenviando: boolean;
  /** Segundos que faltan para poder pedir otro código tras un envío correcto (0 = ya se puede). */
  espera: number;
  /** Tras un 429: "Reenviar código" queda deshabilitado hasta que pasen los segundos del servidor. */
  reenvioEnLimite: boolean;
  /** Texto de "Reenviar código": "Enviando código…" o, tras un 429, "Intenta de nuevo en N s". */
  textoReenviar: string;
  /** Tras un 429 al verificar: "Verificar código" queda deshabilitado hasta que pase la espera. */
  verificacionEnLimite: boolean;
  /** Texto de "Verificar código": "Verificando…" o, tras un 429, "Intenta de nuevo en N s". */
  textoVerificar: string;
  verificar: () => void;
  reenviar: () => void;
  volver: () => void;
  textos: TextosActivar;
}

function mensajeDeVerificacion(error: unknown): string {
  const estado = estadoHttp(error);
  if (estado === 400 || estado === 401 || estado === 404) {
    return mensajeCodigoIncorrecto();
  }
  return mensajeParaClienta(error, { respaldo: obtenerTexto('auth.activar.noSeVerifico') });
}

/**
 * El reenvío ya no responde 404 ni 400 (Ronda 7): si llega uno, es una falla más y nunca dice si la
 * cuenta existe o ya está activada. Un 429 trae su message en español (mensajeParaClienta).
 */
function mensajeDeReenvio(error: unknown): string {
  return mensajeParaClienta(error, { respaldo: obtenerTexto('auth.activar.noSeReenvio') });
}

/**
 * Activación de la cuenta con el código de 6 dígitos (vence en 2 minutos). Entre reenvíos hay una
 * espera visible de 60 segundos; si se llega justo después del registro, la espera ya corre. Un 429
 * del reenvío usa la espera compartida con los segundos del servidor (useEsperaLimite).
 * Toda salida (éxito, "Volver" o Atrás de Android) regresa a la pantalla de acceso que la abrió,
 * con el correo, para que muestre Acceso y reinicie el registro.
 */
export function useActivarViewModel(
  email: string,
  recienEnviado: boolean,
  volverA: RutaAcceso,
): ActivarViewModel {
  const { dismissTo } = useRouter();
  const texto = useTextos();
  const [codigo, setCodigoCrudo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [espera, setEspera] = useState(recienEnviado ? ESPERA_REENVIO_S : 0);
  const limite = useEsperaLimite();
  // Verificar y reenviar tienen límites distintos en el backend: cada uno lleva su propia espera.
  const limiteVerificar = useEsperaLimite();

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

  const volver = useCallback(() => regresar(false), [regresar]);
  // El Atrás de Android sale por el mismo camino que "Volver a iniciar sesión".
  useAtrasSale(volver);

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
      setError(obtenerTexto('auth.activar.sinCorreo'));
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
        setError(mensajeCodigoIncorrecto());
        return;
      }
      regresar(true);
    } catch (fallo) {
      limiteVerificar.esperarSiLimite(fallo);
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
      const respuesta = await reenviarCodigo(email);
      setCodigoCrudo('');
      // El mensaje neutro del servidor: es el mismo exista o no la cuenta.
      setMensaje(mensajeDelReenvio(respuesta) ?? obtenerTexto('auth.codigo.reenviado'));
      setEspera(ESPERA_REENVIO_S);
    } catch (fallo) {
      limite.esperarSiLimite(fallo);
      setError(mensajeDeReenvio(fallo));
    } finally {
      setReenviando(false);
    }
  };

  const candadoVerificar = useCandado();
  const candadoReenvio = useCandado();
  const verificar = () => {
    if (cargando || limiteVerificar.activa) {
      return;
    }
    // Candado inmediato además de cargando: enviarVerificacion() ya muestra cualquier error en pantalla.
    candadoVerificar(enviarVerificacion);
  };

  const reenviar = () => {
    if (reenviando || espera > 0 || limite.activa || !email) {
      return;
    }
    // Candado inmediato además de cargando: enviarReenvio() ya muestra cualquier error en pantalla.
    candadoReenvio(enviarReenvio);
  };

  const textos = useMemo<TextosActivar>(
    () => ({
      titulo: texto('auth.activar.titulo'),
      instrucciones: email
        ? texto('auth.activar.instrucciones', { digitos: LARGO_CODIGO, correo: email })
        : texto('auth.activar.instruccionesSinCorreo', { digitos: LARGO_CODIGO }),
      vigencia: texto('auth.activar.vigencia', { minutos: VIGENCIA_CODIGO_MINUTOS }),
      verificar: texto('auth.activar.verificar'),
      verificando: texto('auth.activar.verificando'),
      espera: texto('auth.activar.espera', { segundos: espera }),
      reenviar: texto('auth.activar.reenviar'),
      reenviando: texto('auth.activar.reenviando'),
      volver: texto('auth.activar.volver'),
    }),
    [texto, email, espera],
  );

  return {
    email,
    codigo,
    setCodigo,
    error,
    mensaje,
    cargando,
    reenviando,
    espera,
    reenvioEnLimite: limite.activa,
    textoReenviar: limite.texto ?? (reenviando ? textos.reenviando : textos.reenviar),
    verificacionEnLimite: limiteVerificar.activa,
    textoVerificar: limiteVerificar.texto ?? (cargando ? textos.verificando : textos.verificar),
    verificar,
    reenviar,
    volver,
    textos,
  };
}
