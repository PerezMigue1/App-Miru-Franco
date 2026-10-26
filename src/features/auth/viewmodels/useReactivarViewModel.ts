import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { useTextos } from '@/shared/api/useTextos';
import { soloDigitos } from '@/shared/ui/digitos';
import { useCandado } from '@/shared/ui/useCandado';

import { esCodigoValido, estadoHttp, normalizarCorreo, problemaDeCorreo } from '../models/AuthModel';
import { confirmarReactivacion, mensajeDeCuenta, solicitarReactivacion } from '../models/cuentaPropia';
import { useAtrasSale } from './useAtrasSale';
import type { RutaAcceso } from './useRetornoActivacion';

/** Segundos entre un código y el siguiente (el backend no reenvía a la misma cuenta antes de un minuto). */
const ESPERA_OTRO_CODIGO_S = 60;
/** Dígitos del código de reactivación. */
const LARGO_CODIGO = 6;
const TOTAL_PASOS = 2;

/** Paso 1: el correo de la cuenta. Paso 2: el código que llegó a ese correo. */
export type PasoReactivar = 'correo' | 'codigo';

/** Textos de la pantalla, del catálogo, con las cifras ya puestas. */
export interface TextosReactivar {
  titulo: string;
  explicacion: string;
  /** "Paso 1 de 2: Correo electrónico" o "Paso 2 de 2: Código de 6 dígitos". */
  paso: string;
  etiquetaCorreo: string;
  etiquetaCodigo: string;
  /** "Pide otro código en {segundos} s" con la espera que queda. */
  espera: string;
  cambiarCorreo: string;
  volver: string;
}

export interface ReactivarViewModel {
  paso: PasoReactivar;
  correo: string;
  setCorreo: (texto: string) => void;
  errorCorreo: string | null;
  codigo: string;
  setCodigo: (texto: string) => void;
  /** Código incompleto o rechazado (400, por ejemplo CODIGO_INVALIDO): va junto al campo. */
  errorCodigo: string | null;
  /** Cualquier otro fallo (sin red, 5xx, límite): va en el aviso del formulario. */
  error: string | null;
  /** Respuesta neutra del envío (nunca dice si la cuenta existe) o la confirmación. */
  mensaje: string | null;
  enviando: boolean;
  reactivando: boolean;
  /** Tras un 429 al pedir el código: "Enviarme el código" y "Enviarme otro código" quedan deshabilitados. */
  envioEnLimite: boolean;
  /** "Enviarme el código", "Enviando…" o, tras un 429, "Intenta de nuevo en N s". */
  textoEnviar: string;
  /** Igual para el enlace del paso 2: "Enviarme otro código". */
  textoOtroCodigo: string;
  /** Segundos que faltan para poder pedir otro código (0 = ya se puede). */
  esperaOtroCodigo: number;
  /** Tras un 429 al confirmar: "Reactivar mi cuenta" queda deshabilitado hasta que pase la espera. */
  reactivacionEnLimite: boolean;
  /** "Reactivar mi cuenta", "Reactivando…" o, tras un 429, "Intenta de nuevo en N s". */
  textoReactivar: string;
  pedirCodigo: () => void;
  pedirOtroCodigo: () => void;
  reactivar: () => void;
  cambiarCorreo: () => void;
  volver: () => void;
  textos: TextosReactivar;
}

/**
 * Reactivar la cuenta que desactivó su titular (GP-09, CONTRATO_APP_CUENTA.md): correo, código de 6
 * dígitos y confirmación. Las dos rutas son públicas y la pantalla nunca dice si la cuenta existe:
 * el envío muestra siempre la respuesta neutra. Confirmar no inicia sesión: regresa a la pantalla de
 * acceso que abrió Reactivar con el correo escrito y el aviso de cuenta reactivada (motivo
 * 'reactivada'; el texto del servidor no viaja en la ruta). Otro código se pide tras 60 s y cada
 * ruta lleva su propia espera por límite (useEsperaLimite).
 */
export function useReactivarViewModel(correoInicial: string, volverA: RutaAcceso): ReactivarViewModel {
  const { dismissTo } = useRouter();
  const texto = useTextos();
  const [paso, setPaso] = useState<PasoReactivar>('correo');
  const [correo, setCorreoCrudo] = useState(correoInicial);
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);
  const [codigo, setCodigoCrudo] = useState('');
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [reactivando, setReactivando] = useState(false);
  const esperaOtro = useEsperaLimite();
  // Solicitar y confirmar tienen límites distintos en el backend: cada uno lleva su propia espera.
  const limiteEnvio = useEsperaLimite();
  const limiteConfirmar = useEsperaLimite();
  const email = normalizarCorreo(correo);

  /**
   * Regresa a la pantalla de acceso que abrió Reactivar (sin crear otra si ya está en la pila). Solo
   * tras reactivar lleva el correo y el motivo; "vuelta" cambia cada vez para que se atienda siempre.
   */
  const regresar = useCallback(
    (reactivada: boolean) => {
      if (!reactivada) {
        dismissTo(volverA);
        return;
      }
      dismissTo({
        pathname: volverA,
        params: { correo: email, vuelta: String(Date.now()), motivo: 'reactivada' },
      });
    },
    [dismissTo, email, volverA],
  );

  const volver = useCallback(() => regresar(false), [regresar]);
  // El Atrás de Android sale por el mismo camino que "Volver a iniciar sesión".
  useAtrasSale(volver);

  const setCorreo = (valor: string) => {
    setCorreoCrudo(valor);
    // Desde el primer error, el campo se vuelve a revisar en cada cambio.
    if (errorCorreo) {
      setErrorCorreo(problemaDeCorreo(valor));
    }
  };

  const setCodigo = (valor: string) => {
    setCodigoCrudo(soloDigitos(valor).slice(0, LARGO_CODIGO));
    setErrorCodigo(null);
  };

  const solicitar = async () => {
    setError(null);
    setMensaje(null);
    setEnviando(true);
    try {
      const neutro = await solicitarReactivacion(email);
      // La misma respuesta exista o no la cuenta: se pasa al código siempre.
      setMensaje(neutro ?? texto('cuenta.reactivar.enviado'));
      setCodigoCrudo('');
      setErrorCodigo(null);
      setPaso('codigo');
      esperaOtro.iniciar(ESPERA_OTRO_CODIGO_S);
    } catch (fallo) {
      limiteEnvio.esperarSiLimite(fallo);
      setError(mensajeDeCuenta(fallo, texto('cuenta.app.errorCodigo')));
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async () => {
    if (!esCodigoValido(codigo)) {
      setErrorCodigo(texto('cuenta.app.error.codigoRequerido'));
      return;
    }
    setError(null);
    setErrorCodigo(null);
    setReactivando(true);
    try {
      const listo = await confirmarReactivacion(email, codigo);
      setMensaje(listo ?? texto('cuenta.reactivar.listo'));
      regresar(true);
    } catch (fallo) {
      limiteConfirmar.esperarSiLimite(fallo);
      const motivo = mensajeDeCuenta(fallo, texto('cuenta.app.errorReactivar'));
      // Un 400 (CODIGO_INVALIDO, neutro) habla del código; lo demás, del envío.
      if (estadoHttp(fallo) === 400) {
        setErrorCodigo(motivo);
      } else {
        setError(motivo);
      }
    } finally {
      setReactivando(false);
    }
  };

  const candadoEnvio = useCandado();
  const candadoConfirmar = useCandado();

  const pedirCodigo = () => {
    if (enviando || limiteEnvio.activa) {
      return;
    }
    const problema = problemaDeCorreo(correo);
    setErrorCorreo(problema);
    if (problema) {
      return;
    }
    // Candado inmediato además de enviando: solicitar() ya muestra cualquier error en pantalla.
    candadoEnvio(solicitar);
  };

  const pedirOtroCodigo = () => {
    if (enviando || reactivando || esperaOtro.activa || limiteEnvio.activa) {
      return;
    }
    candadoEnvio(solicitar);
  };

  const reactivar = () => {
    if (reactivando || limiteConfirmar.activa) {
      return;
    }
    candadoConfirmar(confirmar);
  };

  const cambiarCorreo = () => {
    if (enviando || reactivando) {
      return;
    }
    setPaso('correo');
    setCodigoCrudo('');
    setErrorCodigo(null);
    setError(null);
    setMensaje(null);
  };

  const restantes = esperaOtro.restantes;
  const textos = useMemo<TextosReactivar>(() => {
    const etiquetaCorreo = texto('cuenta.app.etiquetaCorreo');
    const etiquetaCodigo = texto('cuenta.app.etiquetaCodigo');
    return {
      titulo: texto('cuenta.app.reactivarTitulo'),
      explicacion: texto('cuenta.reactivar.explicacion'),
      paso: texto('cuenta.app.paso', {
        numero: paso === 'correo' ? 1 : 2,
        total: TOTAL_PASOS,
        paso: paso === 'correo' ? etiquetaCorreo : etiquetaCodigo,
      }),
      etiquetaCorreo,
      etiquetaCodigo,
      espera: texto('cuenta.app.otroCodigoEn', { segundos: restantes }),
      cambiarCorreo: texto('cuenta.app.cambiarCorreo'),
      volver: texto('cuenta.app.volverAcceso'),
    };
  }, [texto, paso, restantes]);

  const textoEnviando = enviando ? texto('cuenta.app.pidiendoCodigo') : null;

  return {
    paso,
    correo,
    setCorreo,
    errorCorreo,
    codigo,
    setCodigo,
    errorCodigo,
    error,
    mensaje,
    enviando,
    reactivando,
    envioEnLimite: limiteEnvio.activa,
    textoEnviar: limiteEnvio.texto ?? textoEnviando ?? texto('cuenta.app.pedirCodigo'),
    textoOtroCodigo: limiteEnvio.texto ?? textoEnviando ?? texto('cuenta.app.otroCodigo'),
    esperaOtroCodigo: restantes,
    reactivacionEnLimite: limiteConfirmar.activa,
    textoReactivar:
      limiteConfirmar.texto ?? texto(reactivando ? 'cuenta.app.reactivando' : 'cuenta.app.reactivar'),
    pedirCodigo,
    pedirOtroCodigo,
    reactivar,
    cambiarCorreo,
    volver,
    textos,
  };
}
